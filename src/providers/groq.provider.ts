import fetch from "node-fetch";
import { AIMessage, AIProvider, AIProviderConfig, AIProviderResponse } from "../types";

type GroqResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    total_tokens?: number;
  };
  error?: {
    message?: string;
  };
};

const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

function normalizeHistory(history: AIMessage[]) {
  return history.map((message) => ({
    role: message.role === "assistant" || message.role === "diana" ? "assistant" : "user",
    content: message.content,
  }));
}

function extractContent(data: GroqResponse) {
  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  return "хз, че-то сервер завис";
}

export class GroqProvider implements AIProvider {
  async ask(
    message: string,
    history: AIMessage[],
    config: AIProviderConfig
  ): Promise<AIProviderResponse> {
    const response = await fetch(GROQ_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: config.systemPrompt },
          ...normalizeHistory(history),
          { role: "user", content: message },
        ],
        temperature: config.temperature ?? 0.8,
      }),
    });

    const rawBody = await response.text();
    let data: GroqResponse = {};

    try {
      data = rawBody ? JSON.parse(rawBody) : {};
    } catch (parseError) {
      console.error("Groq parse error:", parseError);
      console.error("Groq raw response:", rawBody);
      throw new Error("Groq returned non-JSON response");
    }

    if (!response.ok) {
      throw new Error(data.error?.message || `Groq request failed with status ${response.status}`);
    }

    return {
      content: extractContent(data),
      tokensUsed: Number(data.usage?.total_tokens || 0),
    };
  }
}

export const groqProvider = new GroqProvider();
