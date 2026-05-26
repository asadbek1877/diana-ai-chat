import { Context } from "grammy";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { getSystemPrompt } from "../ai/prompt";
import { generateDianaResponse } from "../ai/openrouter";
import { simulateHumanBehavior } from "./simulation";

// Prisma 7 қоидаси бўйича PostgreSQL пулини яратамиз
const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);

// Адаптерни Prisma-га узатамиз (энди у умуман хато бермайди)
const prisma = new PrismaClient({ adapter });

// .env файлидан гуруҳ ID-сини ўқиб оламиз
const ADMIN_GROUP_ID = Number(process.env.ADMIN_GROUP_ID);

export async function onMessage(ctx: Context) {
  try {
    // TS хато бермаслиги учун ctx.chat борлигини текширамиз
    if (!ctx.message || !ctx.from || !ctx.chat) return;

    // -------------------------------------------------------------------------
    // 1-ҚИСМ: АДМИН ГУРУҲДАН КЕЛГАН ЖАВОБЛАР (СИЗ ЁЗГАН ТАҚДИРДА)
    // -------------------------------------------------------------------------
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
          await prisma.user.update({
            where: { id: targetUser.id },
            data: { isPaused: false }
          });
          await ctx.reply(`🤖 AI қайта ёқилди. Диана ўзи автоматик жавоб беради.`);
          return;
        }

        await prisma.user.update({
          where: { id: targetUser.id },
          data: { isPaused: true }
        });

        await ctx.api.sendMessage(Number(targetTargetId), adminReplyText);
        
        await prisma.message.create({
          data: { userId: targetUser.id, role: "assistant", content: adminReplyText }
        });

        console.log(`[LiveChat] Админ қўлда жавоб ёзди: ${targetTargetId}`);
      }
      return;
    }

    // -------------------------------------------------------------------------
    // 2-ҚИСМ: ЙИГИТЛАРДАН ДИАНАГА КЕЛГАН ХАБАРЛАР
    // -------------------------------------------------------------------------
    if (ctx.chat.type !== "private") return; 

    const tgId = BigInt(ctx.from.id);
    const username = ctx.from.username ? `@${ctx.from.username}` : "Ник йўқ";
    const firstName = ctx.from.first_name;
    const userText = ctx.message.text || "[Медиа/Расм юборди]";

    let user = await prisma.user.findUnique({
      where: { telegramId: tgId },
      include: { profile: true },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId,
          username: ctx.from.username || null,
          firstName,
          platform: "TELEGRAM",
          profile: {
            create: {
              topicsDiscussed: [] as Prisma.InputJsonValue,
              personalityNotes: "Янги фойдаланувчи. Бошида масофа сақлаб, совуқроқ гаплаш.",
            },
          },
        },
        include: { profile: true },
      });
    }

    // 📩 ХАБАРНИ АДМИН ГУРУҲГА ЮБОРИШ
    const notificationText = `📩 Кимдан: ${firstName} (${username})\nID: ${tgId}\n\n📝 Хабар: ${userText}\n\nStatus: ${user.isPaused ? "🔴 Қўлда (AI ўчиқ)" : "🟢 AI бошқарувида"}`;
    await ctx.api.sendMessage(ADMIN_GROUP_ID, notificationText);

    if (user.isPaused) {
      console.log(`[LiveChat] AI паузада. Йигитга админ ўзи ёзади.`);
      return;
    }

    const shouldReply = await simulateHumanBehavior(ctx, userText.length);
    if (!shouldReply) return; 

    const recentMessages = await prisma.message.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 12,
    });
    const reversedMessages = [...recentMessages].reverse();
    const conversationHistoryStr = reversedMessages
      .map((m) => `${m.role === "user" ? "Йигит" : "Диана"}: ${m.content}`)
      .join("\n");

    const userProfileStr = user.profile?.personalityNotes || "Янги фойдаланувчи.";
    const systemPrompt = getSystemPrompt(conversationHistoryStr, userProfileStr);
    
    const dianaReply = await generateDianaResponse({
      systemPrompt,
      userMessage: userText,
    });

    await prisma.$transaction([
      prisma.message.create({
        data: { userId: user.id, role: "user", content: userText },
      }),
      prisma.message.create({
        data: { userId: user.id, role: "assistant", content: dianaReply },
      }),
      prisma.userProfile.update({
        where: { userId: user.id },
        data: { messageCount: { increment: 1 } },
      }),
    ]);

    await ctx.reply(dianaReply);

  } catch (error) {
    console.error("Handlers ичида хатолик:", error);
  }
}