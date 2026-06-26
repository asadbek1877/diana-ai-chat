import { Bot } from "grammy";
import { env } from "../../config/env";
import { chatService } from "../../services/chat.service";
import { handleAdminInputState } from "./admin.handler";

function isTextMessage(ctx: any) {
  return Boolean(ctx.message && "text" in ctx.message && typeof ctx.message.text === "string");
}

/**
 * Admin group reply handler.
 * When admin replies to a log message in the admin group,
 * this handler forwards the admin's text to the user via Bot API
 * and pauses AI for that user (or resumes it with /ai).
 */
export async function handleAdminGroupReply(ctx: any) {
  if (!ctx.message?.reply_to_message || !ctx.message.text) return;

  const result = await chatService.handleAdminGroupReply({
    replyText: ctx.message.reply_to_message.text || "",
    adminReplyText: ctx.message.text,
  });

  if (!result) return;

  if (result.aiResumed) {
    await ctx.reply("🤖 AI қайта ёқилди.");
    return;
  }

  // Admin manually replies to a user — send via Userbot
  if (result.textToSend) {
    const { userbotClient } = require("../../userbot/client");
    try {
      await userbotClient.sendMessage(result.targetTelegramId, { message: result.textToSend });
    } catch (err) {
      console.error("Admin group reply error:", err);
      await ctx.reply("❌ Ошибка при отправке сообщения юзеру через Userbot.");
    }
  }
}

/**
 * Main message router for Client B (Bot API).
 *
 * This handler does NOT process regular user messages for AI.
 * Regular user conversations are handled EXCLUSIVELY by Client A (Userbot/MTProto).
 *
 * This handler only:
 * 1. Routes admin group replies
 * 2. Handles admin text input states (e.g. waiting for new model/prompt)
 */
export async function onMessage(ctx: any, _bot: Bot<any>) {
  try {
    if (!ctx.message || !ctx.from || !ctx.chat) return;

    // Admin group replies (admin manually responds to a user via the bot)
    if (ctx.chat.id === env.ADMIN_GROUP_ID) {
      await handleAdminGroupReply(ctx);
      return;
    }

    // Admin state handling (waiting for model name, prompt, broadcast, etc.)
    if (ctx.message) {
      const isText = isTextMessage(ctx);
      const text = isText ? (ctx.message as { text: string }).text.trim() : "";
      
      // Игнорируем команды для состояний (кроме отмены)
      if (text === "/cancel") {
        await ctx.reply("Действие отменено.");
        // clearUserState happens inside handleAdminInputState implicitly if we don't catch it, 
        // but let's just let it fall through or we can just return.
        // Actually, handleAdminInputState clears state on any message.
      }
      
      if (!isText || !text.startsWith("/")) {
        if (await handleAdminInputState(ctx)) {
          return;
        }
      } else if (text === "/cancel") {
        // Если это /cancel, мы просто вызываем функцию с пустым контекстом, чтобы очистить состояние,
        // либо пусть сама функция handleAdminInputState очистит. Она очищает state в блоке finally.
        if (await handleAdminInputState(ctx)) {
           return;
        }
      }
    }

    // All other messages from regular users are IGNORED by Client B.
    // Client A (Userbot) handles user conversations via MTProto.
  } catch (error) {
    console.error("Chat handler error:", error);
  }
}

export function registerChatHandlers(bot: Bot<any>) {
  bot.on("message", async (ctx) => {
    await onMessage(ctx, bot);
  });
}
