import fetch from "node-fetch";
import { getDianaPrompt } from "./prompt";
import dotenv from "dotenv";

dotenv.config();

export async function askDiana(userMessage: string, chatHistory: any[] = []) {
  try {
    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content
    }));

    // 🚀 СИЛКА GROQ'НИКИГА АЛМАШДИ
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`, // 🔑 КАЛИТ GROQ'НИКИ
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        // Llama-3'нинг энг тезкор 8B модели
        model: "llama-3.1-8b-instant", 
        messages: [
          { role: "system", content: getDianaPrompt() },
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
      return `ошибка от Groq: ${data.error.message}`;
    }
    
    return "хз, че-то сервер завис";
  } catch (error: any) {
    console.error("Groq Error:", error);
    return `сорян, упали в catch: ${error.message}`;
  }
}