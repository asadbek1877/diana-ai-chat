import fetch from "node-fetch";
import { getDianaPrompt } from "./prompt";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();

// Инициализация Prisma для проверки Settings
const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

/**
 * Основная функция для запроса к AI с проверкой статуса бота из БД
 * @param userMessage - Сообщение пользователя
 * @param chatHistory - История чата для контекста
 * @returns Ответ от AI или сообщение об отключении
 */
export async function askDiana(userMessage: string, chatHistory: any[] = []) {
  try {
    // 🔍 ПРОВЕРЯЕМ СТАТУС БОТА В БД
    const settings = await prisma.settings.findFirst();
    
    // Если бот отключен, возвращаем сообщение
    if (settings && !settings.isBotActive) {
      return "Я сейчас сплю 😴";
    }

    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content
    }));

    // 🚀 ИСПОЛЬЗУЕМ МОДЕЛЬ И ПРОМПТ ИЗ БД (или дефолтные)
    const systemPrompt = settings?.systemPrompt || getDianaPrompt();
    const model = settings?.currentModel || "deepseek/deepseek-chat:free";

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          ...formattedHistory,
          { role: "user", content: userMessage }
        ],
        temperature: 0.8
      }),
    });

    const data: any = await response.json();
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    
    if (data.error) {
      return `ошибка от OpenRouter: ${data.error.message}`;
    }
    
    return "хз, че-то сервер завис";
  } catch (error: any) {
    console.error("OpenRouter Error:", error);
    return `сорян, упали в catch: ${error.message}`;
  }
}