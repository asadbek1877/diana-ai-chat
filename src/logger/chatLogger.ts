import { Context, Bot, Api, RawApi } from "grammy";
import { env } from "../config/env";
import { messageRepo } from "../database/repositories/message.repo";
import { userRepo } from "../database/repositories/user.repo";

const ADMIN_ID = env.ADMIN_ID;

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function ensureUserExists(
  telegramId: bigint | string,
  firstName?: string,
  username?: string
) {
  try {
    const tgId = typeof telegramId === "string" ? BigInt(telegramId) : telegramId;

    return await userRepo.ensureUser({
      telegramId: tgId,
      firstName: firstName || "Unknown",
      username: username || null,
    });
  } catch (error) {
    console.error("Error ensuring user exists:", error);
    return null;
  }
}

export async function logChatMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
) {
  try {
    await messageRepo.saveMessage({ userId, role, content, source: "logger" });
    return true;
  } catch (error) {
    console.error("Error logging message:", error);
    return false;
  }
}

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
    const userMessagePreview = userMessage.substring(0, 200);
    const botResponsePreview = botResponse.substring(0, 200);
    const notificationText = [
      "<b>Новое сообщение</b>",
      "",
      `Пользователь: ${escapeHtml(userInfo.firstName || "Unknown")} (@${escapeHtml(userInfo.username || "no_username")})`,
      `ID: <code>${escapeHtml(userInfo.telegramId)}</code>`,
      "",
      "Сказал:",
      `<pre>${escapeHtml(userMessagePreview)}${userMessage.length > 200 ? "..." : ""}</pre>`,
      "",
      "Диана ответила:",
      `<pre>${escapeHtml(botResponsePreview)}${botResponse.length > 200 ? "..." : ""}</pre>`,
      "",
      `Время: ${escapeHtml(new Date().toLocaleString("ru-RU"))}`,
    ].join("\n");

    await bot.api.sendMessage(ADMIN_ID, notificationText, {
      parse_mode: "HTML",
    });

    return true;
  } catch (error) {
    console.error("Error sending admin notification:", error);
    return false;
  }
}

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
    const user = await ensureUserExists(telegramId, firstName, username);

    if (!user) {
      console.error("Failed to ensure user exists");
      return;
    }

    await messageRepo.saveConversation(user.id, userMessage, botResponse, "telegram_bot");
    await notifyAdmin(bot, userMessage, botResponse, {
      firstName,
      username,
      telegramId,
    });

    console.log(`Logging completed for ${firstName} (${telegramId})`);
  } catch (error) {
    console.error("Error in handleUserMessage:", error);
  }
}

export async function getUserChatHistory(userId: string, limit: number = 50) {
  try {
    const logs = await messageRepo.findRecentByUserId(userId, limit);
    return logs.reverse();
  } catch (error) {
    console.error("Error getting chat history:", error);
    return [];
  }
}

export async function clearUserChatHistory(userId: string) {
  try {
    const result = await messageRepo.deleteByUserId(userId);
    return result.count;
  } catch (error) {
    console.error("Error clearing user chat history:", error);
    return 0;
  }
}

export async function getUserStats(userId: string) {
  try {
    const user = await userRepo.findById(userId);
    const messageCount = await messageRepo.countByUserId(userId);
    const firstMessageDate = await messageRepo.findFirstByUserId(userId);

    return {
      user,
      totalMessages: messageCount,
      joinedAt: firstMessageDate?.createdAt || user?.createdAt,
      isBlocked: user?.isBlocked || false,
    };
  } catch (error) {
    console.error("Error getting user stats:", error);
    return null;
  }
}
