import dotenv from "dotenv";
import { prisma } from "../db";
import { getDianaPrompt } from "./prompt";

dotenv.config();

type ChatHistoryItem = {
  role: string;
  content: string;
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";
const FALLBACK_MODEL = "llama-3.1-8b-instant";

export async function askDiana(userMessage: string, chatHistory: ChatHistoryItem[] = []) {
  try {
    const settings = await prisma.settings.findFirst();

    if (settings?.isBotActive === false) {
      return "Я сейчас сплю 😴 (Админ меня временно отключил)";
    }

    const model = settings?.currentModel?.trim() || FALLBACK_MODEL;
    const systemPrompt = settings?.systemPrompt?.trim() || getDianaPrompt();
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
        model,
        messages: [
          { role: "system", content: systemPrompt },
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
    let data: any = {};

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

    const content = data?.choices?.[0]?.message?.content;

    if (typeof content === "string" && content.trim().length > 0) {
      return content;
    }

    return "хз, че-то сервер завис";
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("Детальная ошибка:", error);
    return `сорян, упали в catch: ${message}`;
  }
}
