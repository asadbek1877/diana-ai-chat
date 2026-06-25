import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

// Системный промпт для анализа переписки
const DOSSIER_SYSTEM_INSTRUCTION =
  "Ты — аналитик. Проанализируй предоставленный диалог парня и девушки Дианы. " +
  "Напиши краткое досье на парня строго в 3-4 предложениях на русском языке. " +
  "Укажи: как его зовут (если упоминалось), основные темы общения (флирт, авто, работа и т.д.) " +
  "и его текущее отношение к Диане. Пиши исключительно содержательно и по факту.";

/**
 * Генерирует AI-досье на пользователя на основе истории сообщений.
 *
 * @param messages - массив сообщений { role, content, createdAt }
 * @returns строка с досье или null при ошибке
 */
export async function generateUserDossier(
  messages: Array<{ role: string; content: string; createdAt: Date }>
): Promise<string | null> {
  if (!env.GEMINI_API_KEY) {
    console.error("[Gemini] GEMINI_API_KEY не задан в .env");
    return null;
  }

  if (messages.length === 0) {
    return "Недостаточно данных для анализа. Пользователь ещё не написал ни одного сообщения.";
  }

  try {
    const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: DOSSIER_SYSTEM_INSTRUCTION,
    });

    // Форматируем историю в читаемый вид для промпта
    const dialogText = messages
      .map((msg) => {
        const author = msg.role === "user" ? "Парень" : "Диана";
        const date = msg.createdAt.toLocaleDateString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        // Обрезаем очень длинные сообщения, чтобы не превысить лимит токенов
        const text = msg.content.substring(0, 500);
        return `[${date}] ${author}: ${text}`;
      })
      .join("\n");

    const prompt = `Вот переписка (последние ${messages.length} сообщений):\n\n${dialogText}`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text().trim();

    return text || null;
  } catch (error) {
    console.error("[Gemini] Ошибка при генерации досье:", error);
    return null;
  }
}
