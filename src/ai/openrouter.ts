import dotenv from "dotenv";

dotenv.config();

interface GenerateResponseInput {
  systemPrompt: string;
  userMessage: string;
}

// Мана шу функцияни handlers.ts кутяпти
export async function generateDianaResponse(input: GenerateResponseInput): Promise<string> {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY топилмади! .env файлини текширинг.");
    }

    // Хабарларни тайёрлаймиз
    const messages = [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userMessage }
    ];

    // Groq API га сўров жўнатамиз
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant", // Groq даги тезкор модел
        messages: messages,
        max_tokens: 150, // Чат учун 150 етади
        temperature: 0.9
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Groq хатолиги: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content;
    
    return reply ? reply.trim() : "Чё?";
  } catch (error: any) {
    console.error("AI хатолиги:", error.message || error);
    return "Войй, сал шошмай тур, интернет қотяпти.";
  }
}


// import OpenAI from "openai";
// import dotenv from "dotenv";

// dotenv.config();

// const openai = new OpenAI({
//   baseURL: "https://openrouter.ai/api/v1",
//   apiKey: process.env.OPENROUTER_KEY,
// });

// interface GenerateResponseInput {
//   systemPrompt: string;
//   userMessage: string;
// }

// export async function generateDianaResponse(input: GenerateResponseInput): Promise<string> {
//   try {
//     if (!process.env.OPENROUTER_KEY) {
//       throw new Error("OPENROUTER_KEY топилмади!");
//     }

//     // 🔴 МАНА ШУ ЕРДА БОШҚА AI МОДЕЛГА ЎТКАЗДИК:
//     // Бу "Mistral 7B" модели бўлиб, текинлар орасида энг стабил ва ролга тез киришадигани ҳисобланади.
//     const response = await openai.chat.completions.create({
//       model: "mistralai/mistral-7b-instruct:free", 
//       messages: [
//         { role: "system", content: input.systemPrompt },
//         { role: "user", content: input.userMessage }
//       ],
//       temperature: 0.9, 
//       max_tokens: 150,  
//     });

//     const reply = response.choices[0]?.message?.content;
    
//     return reply ? reply.trim() : "Чё?";
//   } catch (error: any) {
//     console.error("OpenRouter API хатолиги:", error.message || error);
//     return "Войй, сал шошмай тур, интернет қотяпти.";
//   }
// }