import fetch from "node-fetch";
import { getDianaPrompt } from "./prompt";

export async function askDiana(userMessage: string, chatHistory: any[] = []) {
  try {
    // Форматируем историю для OpenRouter
    const formattedHistory = chatHistory.map(msg => ({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content
    }));

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Проверенная бесплатная модель, которая работает стабильно
        model: "meta-llama/llama-3-8b-instruct:free", 
        messages: [
          { role: "system", content: getDianaPrompt() },
          ...formattedHistory,
          { role: "user", content: userMessage }
        ],
        temperature: 0.85
        // Сюда НЕЛЬЗЯ писать response_format, иначе будет зависать!
      }),
    });

    const data: any = await response.json();
    
    // Выводим ответ сервера в консоль рендера, чтобы ты видел, если что-то не так
    console.log("[OpenRouter Raw Data]:", JSON.stringify(data));
    
    if (data.choices && data.choices[0] && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    
    // Если сервер прислал ошибку, выведем её вместо пустой заглушки
    if (data.error) {
      return `ошибка от сервера: ${data.error.message || "без описания"}`;
    }
    
    return "хз, че-то сервер завис";
  } catch (error: any) {
    console.error("OpenRouter Error:", error);
    return `сорян, упали в catch: ${error.message}`;
  }
}
