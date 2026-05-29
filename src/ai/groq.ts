import dotenv from "dotenv";
import { prisma } from "../db";
import { getDianaPrompt } from "./prompt";

dotenv.config();

type ChatHistoryItem = {
  role: string;
  content: string;
};

type GroqUsage = {
  total_tokens?: number;
};

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: GroqUsage;
  error?: {
    message?: string;
  };
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

function normalizeTelegramId(userId: string) {
  const trimmedUserId = userId.trim();

  if (!trimmedUserId) {
    throw new Error("userId is empty");
  }

  return BigInt(trimmedUserId);
}

function extractAssistantText(data: GroqResponse) {
  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  return "хз, че-то сервер завис";
}

export async function askDiana(userId: string, userMessage: string, chatHistory: ChatHistoryItem[] = []) {
  try {
    const telegramId = normalizeTelegramId(userId);

    const [user, settings] = await Promise.all([
      prisma.user.findUnique({ where: { telegramId } }),
      prisma.settings.findFirst(),
    ]);

    if (settings?.isBotActive === false) {
      return "Я сейчас сплю 😴 (Админ меня временно отключил)";
    }

    const modelToUse = user?.personalModel?.trim() || settings?.currentModel?.trim() || FALLBACK_MODEL;
    const promptToUse = user?.personalPrompt?.trim() || settings?.systemPrompt?.trim() || getDianaPrompt();
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY .env файли ичида топилмади!");
    }

    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: modelToUse,
        messages: [
          { role: "system", content: promptToUse },
          ...chatHistory.map((message) => ({
            role: message.role === "assistant" || message.role === "diana" ? "assistant" : "user",
            content: message.content,
          })),
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
      }),
    });

    const rawBody = await response.text();
    let data: GroqResponse = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      console.error("Детальная ошибка:", parseError);
      console.error("Groq raw response:", rawBody);
      throw new Error("Groq returned non-JSON response");
    }

    if (!response.ok) {
      const errorMessage = data?.error?.message || `Groq request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    const content = extractAssistantText(data);

    const tokensUsed = Number(data.usage?.total_tokens || 0);

    if (Number.isFinite(tokensUsed) && tokensUsed > 0 && user) {
      try {
        await prisma.user.update({
          where: { telegramId },
          data: {
            tokensUsed: {
              increment: tokensUsed,
            },
          },
        });
      } catch (updateError) {
        console.error("Детальная ошибка:", updateError);
      }
    }

    return content;
  } catch (error) {
    console.error("Детальная ошибка:", error);
    const message = error instanceof Error ? error.message : "unknown error";
    return `сорян, упали в catch: ${message}`;
  }
}
