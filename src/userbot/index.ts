import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

import { getSystemPrompt, getFactExtractionPrompt, getTopicExtractionPrompt } from "../ai/prompt";
import { generateDianaResponse } from "../ai/openrouter";

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH as string;
const sessionString = new StringSession(process.env.SESSION_STRING || "");

const client = new TelegramClient(sessionString, apiId, apiHash, {
  connectionRetries: 5,
});

async function startUserbot() {
  await client.connect();
  console.log("✅ Диана (Реал профиль) АҚЛЛИ МИЯГА уланди ва ишлашга тайёр!");

  client.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    
    if (message.isPrivate && !message.out && message.text) {
      const userText = message.text;
      const sender = await message.getSender();
      
      // @ts-ignore
      const tgId = BigInt(sender?.id || 0);
      // @ts-ignore
      const firstName = sender?.firstName || "Номаълум";
      // @ts-ignore
      const username = sender?.username ? `@${sender.username}` : "Ник йўқ";
      
      console.log(`📩 Кимдан: ${firstName} | Хабар: ${userText}`);
      
      try {
        let user = await prisma.user.findUnique({ where: { telegramId: tgId }, include: { profile: true } });

        if (!user) {
          user = await prisma.user.create({
            data: {
              telegramId: tgId, username: username !== "Ник йўқ" ? username : null, firstName, platform: "TELEGRAM_USERBOT",
              profile: { create: { topicsDiscussed: [] as Prisma.InputJsonValue, personalityNotes: "" } },
            },
            include: { profile: true },
          });
        }

        if (user.isPaused) return;

        // 🟢 1. ДИАНА ТАРМОҚҚА КИРАДИ ("Online")
        await client.invoke(new Api.account.UpdateStatus({ offline: false }));

        // ⏱ 2. ЮЗЕРНИНГ ХАБАРИНИ ЎҚИШ УЧУН ПАУЗА (Юзер хабари узунлигига қараб 2-5 сония)
        const readDelay = Math.max(2000, Math.min(5000, userText.length * 60));
        await new Promise(resolve => setTimeout(resolve, readDelay));

        // 👀 3. ХАБАРНИ "ЎҚИЛДИ" ҚИЛИШ (Иккита птичка)
        await client.invoke(new Api.messages.ReadHistory({ peer: message.chatId, maxId: message.id }));

        // 🧠 4. AI ЖАВОБИНИ ОЛИШ (Бу пайтда у шунчаки Online бўлиб ўйланяпти)
        const recentMessages = await prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 });
        const reversedMessages = [...recentMessages].reverse();
        const conversationHistoryStr = reversedMessages.map((m) => `${m.role === "user" ? "Йигит" : "Диана"}: ${m.content}`).join("\n");

        const userProfileStr = `Факты: ${user.profile?.personalityNotes || "Нет"}\nТемы: ${JSON.stringify(user.profile?.topicsDiscussed || [])}`;
        const systemPrompt = getSystemPrompt(conversationHistoryStr, userProfileStr);

        const dianaReply = await generateDianaResponse({ systemPrompt, userMessage: userText });

        await prisma.$transaction([
          prisma.message.create({ data: { userId: user.id, role: "user", content: userText } }),
          prisma.message.create({ data: { userId: user.id, role: "assistant", content: dianaReply } }),
          prisma.userProfile.update({ where: { userId: user.id }, data: { messageCount: { increment: 1 } } }),
        ]);

        // 📩 5. ЁЗИШ ЖАРАЁНИ (Typing) ВА ЮБОРИШ
        const sentences = dianaReply.split('\n').filter(s => s.trim().length > 0);
        const isQuestion = userText.includes('?');
        
        for (let i = 0; i < sentences.length; i++) {
          // Гап охиридаги нуқта ва ундовларни куч билан олиб ташлаймиз
          let textToSend = sentences[i].trim().replace(/[.!]+$/, '');
          
          if (textToSend.length === 0) continue;

          // Бот "ёзяпти..." статуси
          await client.invoke(
            // @ts-ignore
            new Api.messages.SetTyping({ peer: message.chatId, action: new Api.SendMessageTypingAction() })
          );
          
          // Диана ёзадиган текстнинг узунлигига қараб "ёзиш тезлигини" ҳисоблаймиз
          const typingDelay = Math.max(1500, textToSend.length * 80); 
          await new Promise(resolve => setTimeout(resolve, typingDelay));

          const sendOptions: any = { message: textToSend };
          
          // Агар савол бўлса ва бу биринчи гап бўлса, Reply қилади
          if (i === 0 && isQuestion) {
            sendOptions.replyTo = message.id;
          }

          await client.sendMessage(message.chatId!, sendOptions);

          // Иккинчи гапга ўтишдан олдин озгина пауза
          if (i < sentences.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 800));
          }
        }

        // 🔴 6. ИШ ТУГАДИ, ТАРМОҚДАН ЧИҚИШ (Offline / Недавно)
        await client.invoke(new Api.account.UpdateStatus({ offline: true }));

        // 🧠 7. ФАКТЛАР ВА МАВЗУЛАРНИ ОРҚА ФОНДА САҚЛАШ
        (async () => {
          try {
            const extractionPrompt = getFactExtractionPrompt(userText);
            const factResponse = await generateDianaResponse({ systemPrompt: extractionPrompt, userMessage: userText });
            
            if (factResponse && factResponse.trim() !== "ЙЎҚ" && !factResponse.includes("Чё")) {
              await prisma.userProfile.update({
                where: { userId: user.id },
                data: { personalityNotes: (user.profile?.personalityNotes || "") + "\n- " + factResponse.trim() }
              });
            }

            const topicPrompt = getTopicExtractionPrompt(userText);
            const topicResponse = await generateDianaResponse({ systemPrompt: topicPrompt, userMessage: userText });

            if (topicResponse && topicResponse.trim() !== "ЙЎҚ" && !topicResponse.includes("Чё")) {
              const cleanTopic = topicResponse.trim().replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
              if (cleanTopic.length > 2) {
                const currentTopics = (user.profile?.topicsDiscussed as string[]) || [];
                if (!currentTopics.includes(cleanTopic)) {
                  await prisma.userProfile.update({
                    where: { userId: user.id },
                    data: { topicsDiscussed: [...currentTopics, cleanTopic] as Prisma.InputJsonValue }
                  });
                }
              }
            }
          } catch (err) {
            console.error("Орқа фонда факт йиғишда хатолик:", err);
          }
        })();

      } catch (err) {
        console.error("Хатолик юз берди:", err);
      }
    }
  }, new NewMessage({}));
}

startUserbot();