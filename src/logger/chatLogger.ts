import { Context, Bot, Api, RawApi } from "grammy";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ADMIN_ID = Number(process.env.ADMIN_ID);

/**
 * � СОЗДАНИЕ ИЛИ ПОЛУЧЕНИЕ ПОЛЬЗОВАТЕЛЯ
 */
export async function ensureUserExists(
  telegramId: bigint | string,
  firstName?: string,
  username?: string
) {
  try {
    const tgId = typeof telegramId === "string" ? BigInt(telegramId) : telegramId;

    let user = await prisma.user.findUnique({
      where: { telegramId: tgId }
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId,
          firstName: firstName || "Unknown",
          username: username || null,
          isBlocked: false
        }
      });

      console.log(`✅ Новый пользователь создан: ${firstName} (${tgId})`);
    }

    return user;
  } catch (error) {
    console.error("Error ensuring user exists:", error);
    return null;
  }
}

/**
 * 💾 ЛОГИРОВАНИЕ СООБЩЕНИЯ В БД (используя Message модель)
 */
export async function logChatMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
) {
  try {
    await prisma.message.create({
      data: {
        userId,
        role,
        content
      }
    });

    return true;
  } catch (error) {
    console.error("Error logging message:", error);
    return false;
  }
}

/**
 * 📢 ОТПРАВКА УВЕДОМЛЕНИЯ АДМИНУ В РЕАЛЬНОМ ВРЕМЕНИ
 */
export async function notifyAdmin(
  bot: Bot<any, Api<RawApi>>,
  userMessage: string,
  botResponse: string,
  userInfo: {
    firstName?: string;
    username?: string;
    telegramId: string;
  }
) {
  try {
    const notificationText = `
📩 **НОВОЕ СООБЩЕНИЕ**

👤 Пользователь: ${userInfo.firstName || "Unknown"} (@${userInfo.username || "no_username"})
🆔 ID: \`${userInfo.telegramId}\`

💬 **Сказал:**
\`\`\`
${userMessage.substring(0, 200)}${userMessage.length > 200 ? "..." : ""}
\`\`\`

🤖 **Диана ответила:**
\`\`\`
${botResponse.substring(0, 200)}${botResponse.length > 200 ? "..." : ""}
\`\`\`

⏰ Время: ${new Date().toLocaleString("ru-RU")}
    `;

    await bot.api.sendMessage(ADMIN_ID, notificationText, {
      parse_mode: "HTML"
    });

    return true;
  } catch (error) {
    console.error("Error sending admin notification:", error);
    return false;
  }
}

/**
 * 🔄 ПОЛНЫЙ ЦИКЛ ЛОГИРОВАНИЯ
 * Вызывайте эту функцию при получении сообщения от пользователя и его обработке
 */
export async function handleUserMessage(
  ctx: Context,
  userMessage: string,
  botResponse: string,
  bot: Bot<any, Api<RawApi>>
) {
  try {
    if (!ctx.from) return;

    const telegramId = String(ctx.from.id);
    const firstName = ctx.from.first_name;
    const username = ctx.from.username;

    // 1️⃣ Создаем/получаем пользователя
    const user = await ensureUserExists(telegramId, firstName, username);

    if (!user) {
      console.error("Failed to ensure user exists");
      return;
    }

    // 2️⃣ Логируем сообщение пользователя
    await logChatMessage(user.id, "user", userMessage);

    // 3️⃣ Логируем ответ бота
    await logChatMessage(user.id, "assistant", botResponse);

    // 4️⃣ Отправляем уведомление админу
    await notifyAdmin(bot, userMessage, botResponse, {
      firstName,
      username,
      telegramId
    });

    console.log(`✅ Логирование завершено для ${firstName} (${telegramId})`);
  } catch (error) {
    console.error("Error in handleUserMessage:", error);
  }
}

/**
 * 📋 ПОЛУЧЕНИЕ ИСТОРИИ ЧАТА ПОЛЬЗОВАТЕЛЯ
 */
export async function getUserChatHistory(
  userId: string,
  limit: number = 50
) {
  try {
    const logs = await prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit
    });

    return logs.reverse(); // Возвращаем от старых к новым
  } catch (error) {
    console.error("Error getting chat history:", error);
    return [];
  }
}

/**
 * 🗑️ УДАЛЕНИЕ ИСТОРИИ ЧАТА ПОЛЬЗОВАТЕЛЯ (для админа)
 */
export async function clearUserChatHistory(userId: string) {
  try {
    const result = await prisma.message.deleteMany({
      where: { userId }
    });

    return result.count;
  } catch (error) {
    console.error("Error clearing chat history:", error);
    return 0;
  }
}

/**
 * 📊 ПОЛУЧЕНИЕ СТАТИСТИКИ ПОЛЬЗОВАТЕЛЯ
 */
export async function getUserStats(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const messageCount = await prisma.message.count({
      where: { userId }
    });

    const firstMessageDate = await prisma.message.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" }
    });

    return {
      user,
      totalMessages: messageCount,
      joinedAt: firstMessageDate?.createdAt || user?.createdAt,
      isBlocked: user?.isBlocked || false
    };
  } catch (error) {
    console.error("Error getting user stats:", error);
    return null;
  }
}
