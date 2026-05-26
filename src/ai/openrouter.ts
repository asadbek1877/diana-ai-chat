import dotenv from "dotenv";

dotenv.config();

interface GenerateResponseInput {
  systemPrompt: string;
  userMessage: string;
  imageUrl?: string; // Экрандан келган расм URL манзили (ихтиёрий)
}

export async function generateDianaResponse(input: GenerateResponseInput): Promise<string> {
  try {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("GROQ_API_KEY топилмади! .env файлини текширинг.");
    }

    // AI га жўнатиладиган хабарлар блоки
    const content: any[] = [{ type: "text", text: input.userMessage }];

    // Агар расм мавжуд бўлса, уни Vision модел форматида қўшамиз
    if (input.imageUrl) {
      content.push({
        type: "image_url",
        image_url: {
          url: input.imageUrl,
        },
      });
    }

    const messages = [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: content }
    ];

    // Агар расм бўлса Vision моделни, бўлмаса оддий матнли моделни ишлатамиз
    const modelName = input.imageUrl 
      ? "llama-3.2-11b-vision-preview" 
      : "llama-3.1-8b-instant";

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: modelName,
        messages: messages,
        max_tokens: 150,
        temperature: 0.6
      })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Groq Vision хатолиги: ${response.status} - ${errorData}`);
    }

    const data = await response.json();
    const reply = data.choices[0]?.message?.content;
    
    return reply ? reply.trim() : "Чё?";
  } catch (error: any) {
    console.error("AI Vision хатолиги:", error.message || error);
    return "Войй, расминг очилмаяпти, интернет паст шекилли.";
  }
}
