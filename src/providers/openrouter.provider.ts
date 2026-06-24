import fetch from "node-fetch";
import { AIMessage, AIProvider, AIProviderConfig, AIProviderResponse } from "../types";

type OpenRouterResponse = {
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

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function normalizeHistory(history: AIMessage[]) {
  return history.map((message) => ({
    role: message.role === "assistant" || message.role === "diana" ? "assistant" : "user",
    content: message.content,
  }));
}

function extractContent(data: OpenRouterResponse) {
  const content = data.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }

  if (data.error?.message) {
    return `ошибка от OpenRouter: ${data.error.message}`;
  }

  return "хз, че-то сервер завис";
}

export class OpenRouterProvider implements AIProvider {
  async ask(
    message: string,
    history: AIMessage[],
    config: AIProviderConfig
  ): Promise<AIProviderResponse> {
    // Агар расм бўлса, Vision моделни ишлатамиз
    let model = config.model;
    let userMessage: any = message;

    if (config.imageBase64 && config.imageMimeType) {
      // Vision модели (OpenRouter'да қўлайлашган)
      model = "google/gemini-flash-1.5-vision"; // Агар коррози модел айтилса, унини ўзгартириш мумкин
      
      // Сўровни Vision форматида шакллантирамиз
      userMessage = [
        {
          type: "text",
          text: message,
        },
        {
          type: "image",
          source: {
            type: "base64",
            media_type: config.imageMimeType, // "image/jpeg", "image/png", и т.д.
            data: config.imageBase64,
          },
        },
      ];
    }

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: config.systemPrompt },
          ...normalizeHistory(history),
          { role: "user", content: userMessage },
        ],
        temperature: config.temperature ?? 0.8,
        max_tokens: 300, // Audit #3: Ограничение стоимости — без этого AI может генерировать 10000+ токенов
      }),
    });

    const data = (await response.json()) as OpenRouterResponse;

    if (!response.ok && !data.error?.message) {
      throw new Error(`OpenRouter request failed with status ${response.status}`);
    }

    return {
      content: extractContent(data),
      tokensUsed: Number(data.usage?.total_tokens || 0),
    };
  }
}

export const openRouterProvider = new OpenRouterProvider();
