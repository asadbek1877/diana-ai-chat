import { Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { searchInternet } from "../ai/search";
import { messageRepo } from "../database/repositories/message.repo";
import { userRepo } from "../database/repositories/user.repo";
import { notifyAdmin, notifyAdminGroup } from "../logger/chatLogger";
import { aiService } from "../services/ai.service";
import { buildSearchAugmentedPrompt, extractLikeIntent, extractSearchQuery, formatDianaText, splitReplyIntoMessages } from "../services/text-formatter";
import { userbotClient } from "./client";
import { SenderInfo, UserMessageQueue } from "./queue";

import type { Bot } from "grammy";
let notificationBot: Bot<any> | null = null;

export function setNotificationBot(bot: Bot<any>) {
  notificationBot = bot;
}

type TelegramSender = {
  id?: unknown;
  firstName?: unknown;
  username?: unknown;
};

type RateLimiter = {
  isLimited(userId: string | number | bigint): boolean;
};

type RegisterUserbotHandlersOptions = {
  incomingMessageLimiter: RateLimiter;
};

function hasSenderInfo(value: unknown): value is TelegramSender {
  return typeof value === "object" && value !== null;
}

function normalizeSender(sender: unknown): SenderInfo | null {
  if (!hasSenderInfo(sender)) return null;

  const id = sender.id;
  const idValue =
    typeof id === "bigint" || typeof id === "number" || typeof id === "string"
      ? BigInt(id)
      : null;

  if (!idValue || idValue <= 0n) return null;

  return {
    id: idValue,
    firstName: typeof sender.firstName === "string" && sender.firstName.trim() ? sender.firstName : "Unknown",
    username: typeof sender.username === "string" && sender.username.trim() ? `@${sender.username}` : null,
  };
}

function getMessageText(event: NewMessageEvent) {
  const text = event.message.text;
  return typeof text === "string" && text.trim().length > 0 ? text : null;
}

function normalizeChatId(chatId: unknown): string | number | null {
  if (typeof chatId === "string" || typeof chatId === "number") return chatId;
  if (typeof chatId === "bigint") return chatId.toString();
  if (chatId && typeof chatId === "object" && "toString" in chatId) return String(chatId);
  return null;
}

async function setTyping(chatId: string | number) {
  await userbotClient.invoke(
    new Api.messages.SetTyping({
      peer: chatId,
      action: new Api.SendMessageTypingAction(),
    })
  );
}

async function markRead(chatId: string | number, messageId: number) {
  await userbotClient.invoke(
    new Api.messages.ReadHistory({
      peer: chatId,
      maxId: messageId,
    })
  );
}

async function sendLikeReaction(chatId: string | number, messageId: number) {
  await userbotClient.invoke(
    new Api.messages.SendReaction({
      peer: chatId,
      msgId: messageId,
      reaction: [new Api.ReactionEmoji({ emoticon: "❤️" })],
    })
  );
}

async function sendReplyMessages(chatId: string | number, reply: string) {
  const messages = splitReplyIntoMessages(reply);

  for (let i = 0; i < messages.length; i++) {
    const textToSend = messages[i].trim();
    if (!textToSend) continue;

    await new Promise((resolve) => setTimeout(resolve, Math.max(1500, textToSend.length * 60)));
    await userbotClient.sendMessage(chatId, { message: textToSend });

    if (i < messages.length - 1) {
      await setTyping(chatId);
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
  }
}

async function buildReply(telegramId: bigint, message: string, history: Array<{ role: string; content: string }>) {
  let reply = await aiService.generateReply({
    telegramId,
    message,
    history,
    provider: "openrouter",
  });

  const query = extractSearchQuery(reply);
  if (!query) {
    return reply;
  }
  console.log("[Userbot] Searching internet:", query);

  const searchResults = await searchInternet(query);
  return aiService.generateReply({
    telegramId,
    message: buildSearchAugmentedPrompt(searchResults),
    history,
    provider: "openrouter",
  });
}

async function sendAdminNotifications(
  sender: SenderInfo,
  userMessage: string,
  botResponse: string
) {
  if (!notificationBot) {
    console.warn("[Userbot] No notification bot configured, skipping admin notification");
    return;
  }

  const userInfo = {
    firstName: sender.firstName,
    username: sender.username?.replace("@", "") || undefined,
    telegramId: sender.id.toString(),
  };

  try {
    await notifyAdmin(notificationBot, userMessage, botResponse, userInfo);
    await notifyAdminGroup(notificationBot, userMessage, botResponse, userInfo);
  } catch (error) {
    console.error("[Userbot] Failed to send admin notification:", error);
  }
}

async function processUserQueue(queueManager: UserMessageQueue, telegramId: bigint) {
  const queue = queueManager.consume(telegramId);
  if (!queue) return;

  const combinedText = queue.texts.join("\n");
  const lastMessageId = queue.messageIds[queue.messageIds.length - 1];

  console.log(`[Userbot] Incoming from ${queue.sender.firstName}: ${combinedText}`);

  try {
    const user = await userRepo.ensureUserWithProfile({
      telegramId,
      username: queue.sender.username,
      firstName: queue.sender.firstName,
      platform: "TELEGRAM_USERBOT",
    });

    if (user.isPaused) {
      console.log(`[DEBUG] Фойдаланувчи пауза қилинган: ${telegramId}`);
      return;
    }

    await userbotClient.invoke(new Api.account.UpdateStatus({ offline: false }));
    await new Promise((resolve) => setTimeout(resolve, Math.max(2000, Math.min(6000, combinedText.length * 50))));
    await markRead(queue.chatId, lastMessageId);
    await setTyping(queue.chatId);

    const recentMessages = await messageRepo.findRecentByUserId(user.id, 10);
    const history = [...recentMessages].reverse();
    const rawReply = await buildReply(telegramId, combinedText, history);
    const { hasLikeIntent, text } = extractLikeIntent(formatDianaText(rawReply));

    await messageRepo.saveConversation(user.id, combinedText, text, "telegram_userbot");

    if (hasLikeIntent) {
      try {
        await sendLikeReaction(queue.chatId, lastMessageId);
      } catch (error) {
        console.error("[Userbot] Failed to send reaction:", error);
      }
    }

    await sendReplyMessages(queue.chatId, text);
    await userbotClient.invoke(new Api.account.UpdateStatus({ offline: true }));
    await sendAdminNotifications(queue.sender, combinedText, text);
    console.log(`[DEBUG] Жавоб муваффақиятли жўнатилди!`);
  } catch (error) {
    console.error("[Userbot] Failed to process message:", error);
  } finally {
    queueManager.clear(telegramId);
  }
}

export function registerUserbotHandlers(options: RegisterUserbotHandlersOptions) {
  const queueManager = new UserMessageQueue(async (telegramId) => {
    await processUserQueue(queueManager, telegramId);
  });

  userbotClient.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    const text = getMessageText(event);

    console.log(`[DEBUG] Янги ҳодиса! Текст: "${text}", isPrivate: ${message.isPrivate}, out: ${message.out}`);

    if (!message.isPrivate || message.out || !text) {
      console.log(`[DEBUG] Хабар игнор қилинди.`);
      return;
    }

    const sender = normalizeSender(await message.getSender());
    const chatId = normalizeChatId(message.chatId);
    
    if (!sender || chatId === null) {
      console.log(`[DEBUG] Sender ёки ChatId топилмади.`);
      return;
    }
    
    if (options.incomingMessageLimiter.isLimited(sender.id)) {
      console.log(`[DEBUG] Спам-фильтр блоклади: ${sender.id}`);
      return;
    }

    console.log(`[DEBUG] Хабар қабул қилинди ва навбатга қўшилди: ${text}`);

    queueManager.enqueue({
      telegramId: sender.id,
      text,
      messageId: message.id,
      sender,
      chatId,
    });
  }, new NewMessage({}));
}

