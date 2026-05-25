import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

// OpenRouter созламаси (у ички тизимда OpenAI SDK орқали ишлайди)
const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_KEY,
});

interface GenerateResponseInput {
  systemPrompt: string;
  userMessage: string;
}

/**
 * OpenRouter орқали Диананинг жавобини генерация қилиш
 */
export async function generateDianaResponse(input: GenerateResponseInput): Promise<string> {
  try {
    if (!process.env.OPENROUTER_KEY) {
      throw new Error("OPENROUTER_KEY ичида API калит топилмади!");
    }

    // Клод тавсия қилган цензурасиз ва тезкор 'mistralai/mistral-nemo' модели
    const response = await openai.chat.completions.create({
      model: "mistralai/mistral-nemo", 
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userMessage }
      ],
      temperature: 0.85, // Жавоблар ҳар хил ва реал чиқиши учун креативлик
    });

    const reply = response.choices[0]?.message?.content;
    
    return reply ? reply.trim() : "Че?";
  } catch (error) {
    console.error("OpenRouter API хатолиги:", error);
    // Хатолик бўлса бот тўхтаб қолмайди, Диананинг характерига мос қўпол жавоб қайтаради
    return "Э, чарчатдинг, кейинроқ ёз, ҳозир асабим бузилиб турибди.";
  }
}