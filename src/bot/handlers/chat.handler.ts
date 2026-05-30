import { Bot } from "grammy";
import { env } from "../../config/env";
import { chatService } from "../../services/chat.service";
import { notifyAdmin } from "../../logger/chatLogger";
import { simulateHumanBehavior } from "../simulation";
import { handleAdminTextState } from "./admin.handler";

function isTextMessage(ctx: any) {
  return Boolean(ctx.message && "text" in ctx.message && typeof ctx.message.text === "string");
}

function getMessageText(ctx: any) {
  return ctx.message?.text || ctx.message?.caption || "[Расм юборди]";
}

async function sendHumanizedReply(ctx: any, reply: string) {
  const sentences = reply.split("\n").filter((sentence) => sentence.trim().length > 0);

  for (const sentence of sentences) {
    await ctx.api.sendChatAction(ctx.chat!.id, "typing");
    const textToSend = sentence.trim().replace(/[.!]+$/, "");
    if (!textToSend) continue;

    await new Promise((resolve) => setTimeout(resolve, Math.max(1500, textToSend.length * 80)));
    await ctx.reply(textToSend);
  }
}

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

  if (result.textToSend) {
    await ctx.api.sendMessage(Number(result.targetTelegramId), result.textToSend);
  }
}

export async function processUserMessage(ctx: any, bot: Bot<any>) {
  if (!ctx.from || !ctx.chat || ctx.chat.type !== "private") return;

  const tgId = BigInt(ctx.from.id);
  const userText = getMessageText(ctx);
  const shouldReply = await simulateHumanBehavior(ctx, userText.length);

  const result = await chatService.processUserMessage({
    telegramId: tgId,
    firstName: ctx.from.first_name,
    username: ctx.from.username,
    text: userText,
  });

  if (!result) return;

  await ctx.api.sendMessage(chatService.getAdminGroupId(), result.adminNotification, {
    parse_mode: "HTML",
  });

  if (!shouldReply) return;

  await notifyAdmin(bot, userText, result.reply, {
    firstName: ctx.from.first_name,
    username: ctx.from.username,
    telegramId: String(tgId),
  });

  await sendHumanizedReply(ctx, result.reply);
}

export async function onMessage(ctx: any, bot: Bot<any>) {
  try {
    if (!ctx.message || !ctx.from || !ctx.chat) return;

    if (ctx.chat.id === env.ADMIN_GROUP_ID) {
      await handleAdminGroupReply(ctx);
      return;
    }

    if (isTextMessage(ctx)) {
      const text = (ctx.message as { text: string }).text.trim();
      if (!text.startsWith("/") && (await handleAdminTextState(ctx, text))) {
        return;
      }
    }

    await processUserMessage(ctx, bot);
  } catch (error) {
    console.error("Chat handler error:", error);
  }
}

export function registerChatHandlers(bot: Bot<any>) {
  bot.on("message:text", async (ctx) => {
    await onMessage(ctx, bot);
  });
  bot.on("message:photo", async (ctx) => {
    await onMessage(ctx, bot);
  });
}
