import fetch from "node-fetch";
import { getDianaPrompt } from "./prompt";

export async function askDiana(userMessage: string, chatHistory: any[] = []) {
  try {
    // Эски хабарлар тарихини ИИ форматига ўтказиш
    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content.toLowerCase() // услуб бузилмаслиги учун ҳаммасини кичик ҳарфда узатамиз
    }));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // OpenRouter-даги энг зўр ва ақлли текин Хитой модели
        model: "qwen/qwen-2-7b-instruct:free", 
        messages: [
          { role: "system", content: getDianaPrompt() },
          ...formattedHistory,
          { role: "user", content: userMessage }
        ],
        temperature: 0.8, // Диана жонли ва табиий жавоб бериши учун эркинлик даражаси
      }),
    });

    const data: any = await response.json();
    
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    
    return "хз, че-то сервер завис";
  } catch (error) {
    console.error("OpenRouter уланиш хатолиги:", error);
    return "сорян, у меня мозг отключился";
  }
}