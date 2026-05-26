import { Context } from "grammy";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
// Учала функция ҳам импорт қилинди:
import { getSystemPrompt, getFactExtractionPrompt, getTopicExtractionPrompt } from "../ai/prompt";
import { generateDianaResponse } from "../ai/openrouter";
import { simulateHumanBehavior } from "./simulation";

const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID);

export async function onMessage(ctx: Context) {
  try {
    if (!ctx.message || !ctx.from || !ctx.chat) return;

    // --- АДМИН ҚИСМИ ---
    if (ctx.chat.id === ADMIN_GROUP_ID) {
      if (ctx.message.reply_to_message && ctx.message.text) {
        const replyText = ctx.message.reply_to_message.text;
        if (!replyText) return;
        const match = replyText.match(/ID:\s(\d+)/);
        if (!match) return;
        const targetTargetId = BigInt(match[1]);
        const adminReplyText = ctx.message.text;

        const targetUser = await prisma.user.findUnique({ where: { telegramId: targetTargetId } });
        if (!targetUser) return;

        if (adminReplyText.trim() === "/ai") {
          await prisma.user.update({ where: { id: targetUser.id }, data: { isPaused: false } });
          await ctx.reply(`🤖 AI қайта ёқилди.`);
          return;
        }

        await prisma.user.update({ where: { id: targetUser.id }, data: { isPaused: true } });
        await ctx.api.sendMessage(Number(targetTargetId), adminReplyText);
        await prisma.message.create({ data: { userId: targetUser.id, role: "assistant", content: adminReplyText } });
      }
      return;
    }

    // --- ЙИГИТЛАР ҚИСМИ ---
    if (ctx.chat.type !== "private") return; 

    const tgId = BigInt(ctx.from.id);
    const username = ctx.from.username ? `@${ctx.from.username}` : "Ник йўқ";
    const firstName = ctx.from.first_name;
    const userText = ctx.message.text || ctx.message.caption || "[Расм юборди]";

    let imageUrl: string | undefined = undefined;
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const file = await ctx.api.getFile(photo.file_id);
      imageUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    }

    let user = await prisma.user.findUnique({ where: { telegramId: tgId }, include: { profile: true } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId, username: ctx.from.username || null, firstName, platform: "TELEGRAM",
          profile: { create: { topicsDiscussed: [] as Prisma.InputJsonValue, personalityNotes: "" } },
        },
        include: { profile: true },
      });
    }

    const notificationText = `📩 Кимдан: ${firstName} (${username})\nID: ${tgId}\n📝 Хабар: ${userText}`;
    await ctx.api.sendMessage(ADMIN_GROUP_ID, notificationText);

    if (user.isPaused) return;

    const shouldReply = await simulateHumanBehavior(ctx, userText.length);
    if (!shouldReply) return; 

    const recentMessages = await prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 12 });
    const reversedMessages = [...recentMessages].reverse();
    const conversationHistoryStr = reversedMessages.map((m) => `${m.role === "user" ? "Йигит" : "Диана"}: ${m.content}`).join("\n");

    const userProfileStr = `Факты: ${user.profile?.personalityNotes || "Нет"}\nТемы: ${JSON.stringify(user.profile?.topicsDiscussed || [])}`;
    const systemPrompt = getSystemPrompt(conversationHistoryStr, userProfileStr);
    
    // 1. Диананинг жавобини оламиз
    const dianaReply = await generateDianaResponse({ systemPrompt, userMessage: userText, imageUrl });

    // 🧠 2. ФАКТЛАР ВА МАВЗУЛАРНИ АЖРАТИБ ОЛИШ
    if (!imageUrl) {
      // Фактларни сақлаш
      const extractionPrompt = getFactExtractionPrompt(userText);
      const factResponse = await generateDianaResponse({ systemPrompt: extractionPrompt, userMessage: userText });
      
      if (factResponse && factResponse.trim() !== "ЙЎҚ" && !factResponse.includes("Чё")) {
        console.log(`[Memory] Янги факт топилди: ${factResponse.trim()}`);
        await prisma.userProfile.update({
          where: { userId: user.id },
          data: { personalityNotes: (user.profile?.personalityNotes || "") + "\n- " + factResponse.trim() }
        });
      }

      // 🎯 Мавзуларни сақлаш
      const topicPrompt = getTopicExtractionPrompt(userText);
      const topicResponse = await generateDianaResponse({ systemPrompt: topicPrompt, userMessage: userText });

      if (topicResponse && topicResponse.trim() !== "ЙЎҚ" && !topicResponse.includes("Чё")) {
        const cleanTopic = topicResponse.trim().replace(/[^a-zA-Zа-яА-ЯёЁ]/g, ""); // Фақат ҳарфларни қолдирамиз
        if (cleanTopic.length > 2) {
          const currentTopics = (user.profile?.topicsDiscussed as string[]) || [];
          if (!currentTopics.includes(cleanTopic)) {
            console.log(`[Topic] Янги мавзу қўшилди: ${cleanTopic}`);
            await prisma.userProfile.update({
              where: { userId: user.id },
              data: { topicsDiscussed: [...currentTopics, cleanTopic] as Prisma.InputJsonValue }
            });
          }
        }
      }
    }

    // 3. Базага сақлаш
    await prisma.$transaction([
      prisma.message.create({ data: { userId: user.id, role: "user", content: userText } }),
      prisma.message.create({ data: { userId: user.id, role: "assistant", content: dianaReply } }),
      prisma.userProfile.update({ where: { userId: user.id }, data: { messageCount: { increment: 1 } } }),
    ]);

    await ctx.reply(dianaReply);

  } catch (error) {
    console.error("Handlers ичида хатолик:", error);
  }
}

