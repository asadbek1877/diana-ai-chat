import { Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { searchInternet } from "../ai/search";
import { messageRepo } from "../database/repositories/message.repo";
import { userRepo } from "../database/repositories/user.repo";
import { LearningRepo } from "../database/repositories/learning.repo";
import { notifyAdmin, notifyAdminGroup } from "../logger/chatLogger";
import { aiService } from "../services/ai.service";
import { buildSearchAugmentedPrompt, extractLikeIntent, extractSearchQuery, formatDianaText, splitReplyIntoMessages } from "../services/text-formatter";
import { userbotClient } from "./client";

export type SenderInfo = {
  id: bigint;
  firstName: string;
  username: string | null;
};

// Навбатда хабарнинг матнидан ташқари, ўзини (Telegram Message) ҳам сақлаймиз
export type QueuedUserMessage = {
  texts: string[];
  messageIds: number[];
  imageBase64?: string; // Vision үчин - Base64 расм
  imageMimeType?: string; // MIME типи (image/jpeg, image/png, и т.д.)
  timer: NodeJS.Timeout;
  ttlTimer: NodeJS.Timeout;
  sender: SenderInfo;
  lastMessage: any; // Муаммони ҳал қилувчи калит
};

import type { Bot } from "grammy";
let notificationBot: Bot | null = null;

export function setNotificationBot(bot: Bot) {
  notificationBot = bot;
}

type RateLimiter = {
  isLimited(userId: string | number | bigint): boolean;
};

type RegisterUserbotHandlersOptions = {
  incomingMessageLimiter: RateLimiter;
};

class UserMessageQueue {
  private queues = new Map();
  constructor(private readonly processQueue: (telegramId: bigint) => Promise<void>) {}

  enqueue(input: { telegramId: bigint; text: string; messageId: number; sender: SenderInfo; messageObj: any; imageBase64?: string; imageMimeType?: string }) {
    const existing = this.queues.get(input.telegramId);
    if (existing) {
      clearTimeout(existing.timer);
      clearTimeout(existing.ttlTimer);
      existing.texts.push(input.text);
      existing.messageIds.push(input.messageId);
      existing.lastMessage = input.messageObj; // Доим энг сўнгги хабар объектини сақлаймиз
      // Агар нови расм бўлса, унинг устига чўйамиз (последний image берилади)
      if (input.imageBase64) {
        existing.imageBase64 = input.imageBase64;
        existing.imageMimeType = input.imageMimeType;
      }
      existing.timer = setTimeout(() => this.processQueue(input.telegramId), 4000);
      existing.ttlTimer = setTimeout(() => this.clear(input.telegramId), 5 * 60 * 1000);
      return;
    }

    this.queues.set(input.telegramId, {
      texts: [input.text],
      messageIds: [input.messageId],
      sender: input.sender,
      lastMessage: input.messageObj,
      imageBase64: input.imageBase64,
      imageMimeType: input.imageMimeType,
      timer: setTimeout(() => this.processQueue(input.telegramId), 4000),
      ttlTimer: setTimeout(() => this.clear(input.telegramId), 5 * 60 * 1000),
    });
  }

  consume(telegramId: bigint) {
    const queue = this.queues.get(telegramId);
    if (!queue) return null;
    clearTimeout(queue.timer);
    clearTimeout(queue.ttlTimer);
    this.queues.delete(telegramId);
    return queue;
  }

  clear(telegramId: bigint) {
    const queue = this.queues.get(telegramId);
    if (!queue) return;
    clearTimeout(queue.timer);
    clearTimeout(queue.ttlTimer);
    this.queues.delete(telegramId);
  }
}

async function buildReply(telegramId: bigint, message: string, history: Array<{ role: string; content: string }>, imageBase64?: string, imageMimeType?: string) {
  let reply = await aiService.generateReply({
    telegramId,
    message,
    history,
    provider: "openrouter",
    imageBase64, // Vision модели учун расм
    imageMimeType,
  });

  const query = extractSearchQuery(reply);
  if (!query) return reply;

  const searchResults = await searchInternet(query);
  return aiService.generateReply({
    telegramId,
    message: buildSearchAugmentedPrompt(searchResults),
    history,
    provider: "openrouter",
  });
}

async function sendAdminNotifications(sender: SenderInfo, userMessage: string, botResponse: string) {
  if (!notificationBot) return;
  const userInfo = {
    firstName: sender.firstName,
    username: sender.username?.replace("@", "") || undefined,
    telegramId: sender.id.toString(),
  };
  try {
    await notifyAdmin(notificationBot, userMessage, botResponse, userInfo);
    await notifyAdminGroup(notificationBot, userMessage, botResponse, userInfo);
  } catch (error) {
    console.error("[Userbot] Admin notification хатолик:", error);
  }
}

/**
 * Телеграм расмини Base64'ға ўгириш
 */
async function downloadImageAsBase64(message: any): Promise<{ base64: string; mimeType: string } | null> {
  try {
    if (!message.photo) return null;

    // downloadMedia ўз ичида энг юқори сифатли расмни автоматик танлайди
    const buffer = await userbotClient.downloadMedia(message);
    
    if (!buffer) {
      console.warn("[Userbot] Расм юклаш катта буйилди - buffer null");
      return null;
    }

    // Base64'га ўгириш
    const base64String = buffer.toString("base64");
    
    // MIME типини аниқлаш (одатан JPEG)
    const mimeType = "image/jpeg";

    return { base64: base64String, mimeType };
  } catch (error) {
    console.error("[Userbot] Расм юклашда хатолик:", error);
    return null;
  }
}

async function processUserQueue(queueManager: UserMessageQueue, telegramId: bigint) {
  const queue = queueManager.consume(telegramId);
  if (!queue) return;

  const combinedText = queue.texts.join("\n");
  const lastMsg = queue.lastMessage; // Энг сўнгги хабар объекти

  try {
    const user = await userRepo.ensureUserWithProfile({
      telegramId,
      username: queue.sender.username,
      firstName: queue.sender.firstName,
      platform: "TELEGRAM_USERBOT",
    });

    if (user.isPaused) return;

    // Юзер ухлаяптими ёки бандми? Текширамиз.
    const lowerText = combinedText.toLowerCase();
    const isBusyOrSleeping = 
      lowerText.includes("спокойной ночи") || 
      lowerText.includes("сплю") || 
      lowerText.includes("спать") || 
      lowerText.includes("занят") || 
      lowerText.includes("позже") || 
      lowerText.includes("потом");

    // Агар банд бўлса, Диана кейин ўзи биринчи бўлиб ёзмайди (canMessageFirst = false)
    // Агар оддий хабар бўлса, ҳаммаси жойида (canMessageFirst = true)
    await userRepo.updateActivity(telegramId, !isBusyOrSleeping);

    await userbotClient.invoke(new Api.account.UpdateStatus({ offline: false }));
    await new Promise((resolve) => setTimeout(resolve, Math.max(2000, Math.min(6000, combinedText.length * 50))));
    
    // Telegram'га мурожаат қилиш учун ЭНГ ТЎҒРИ ва ХАВФСИЗ усул (InputChat)
    const inputChat = await lastMsg.getInputChat();

    // Хабарни ўқилган қилиш
    try {
        await userbotClient.invoke(new Api.messages.ReadHistory({ peer: inputChat, maxId: lastMsg.id }));
    } catch (e: any) { console.error("ReadHistory хато:", (e as Error).message); }

    // "Ёзяпти" статусини ёқиш
    try {
        await userbotClient.invoke(new Api.messages.SetTyping({ peer: inputChat, action: new Api.SendMessageTypingAction() }));
    } catch (e: any) { console.error("Typing хато:", (e as Error).message); }

    // Базадан тарихни олиш ва AI га бериш
    const recentMessages = await messageRepo.findRecentByUserId(user.id, 10);
    const history = [...recentMessages].reverse();
    
    // === SELF-LEARNING: Сигналларни текшириш ===
    const lowerMsg = combinedText.toLowerCase();
    
    // 1. Салбий сигналлар (Жазо)
    const isNegative = 
      lowerMsg.includes("ты бот") || 
      lowerMsg.includes("робот") || 
      lowerMsg.includes("нейросеть") || 
      lowerMsg.includes("бред") ||
      lowerMsg.includes("тупая");

    // 2. Ижобий сигналлар (Мукофот)
    const isPositive = 
      lowerMsg.includes("❤️") || 
      lowerMsg.includes("🔥") || 
      lowerMsg.includes("хаха") || 
      lowerMsg.includes("ахах") || 
      lowerMsg.includes("класс");

    // Агар хабарда сигнал бўлса ва базада Диананинг олдинги жавоби бўлса, уни сақлаймиз.
    if (isNegative || isPositive) {
      // Базадан Диананинг охирги ёзган хабарини топамиз (шу гапга сабаб бўлган хабар)
      const lastDianaMessage = await messageRepo.findRecentByUserId(user.id, 1);
      const dianaText = lastDianaMessage[0]?.content || "номаълум хабар";

      await LearningRepo.logInteraction(user.id, combinedText, dianaText, isPositive);
      console.log(`[Self-Learning] Сигнал ушланди: ${isPositive ? "ЮТУҚ ✓" : "ХАТО ✗"}`);
    }
    // ===========================================
    
    const rawReply = await buildReply(telegramId, combinedText, history, queue.imageBase64, queue.imageMimeType);
    const { hasLikeIntent, text } = extractLikeIntent(formatDianaText(rawReply));

    await messageRepo.saveConversation(user.id, combinedText, text, "telegram_userbot");

    // ❤️ Реакция босиш (агар AI истаса)
    if (hasLikeIntent) {
      try {
        await userbotClient.invoke(new Api.messages.SendReaction({
            peer: inputChat,
            msgId: lastMsg.id,
            reaction: [new Api.ReactionEmoji({ emoticon: "❤️" })],
        }));
      } catch (e: any) { console.error("Reaction хато:", (e as Error).message); }
    }

    // Жавобни қисмларга бўлиб жўнатиш
    const messages = splitReplyIntoMessages(text);
    for (let i = 0; i < messages.length; i++) {
      const textToSend = messages[i].trim();
      if (!textToSend) continue;

      await new Promise((resolve) => setTimeout(resolve, Math.max(1500, textToSend.length * 60)));
      
      // МАНА ШУ ЕРДА ЭНДИ БЕХАТО ИШЛАЙДИ
      await userbotClient.sendMessage(inputChat, { message: textToSend });

      if (i < messages.length - 1) {
        try {
            await userbotClient.invoke(new Api.messages.SetTyping({ peer: inputChat, action: new Api.SendMessageTypingAction() }));
        } catch (e) { }
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }

    await userbotClient.invoke(new Api.account.UpdateStatus({ offline: true }));
    await sendAdminNotifications(queue.sender, combinedText, text);
  } catch (error) {
    console.error("[Userbot] Навбатни қайта ишлашда хатолик:", error);
  } finally {
    queueManager.clear(telegramId);
  }
}

export function registerUserbotHandlers(options: RegisterUserbotHandlersOptions) {
  const queueManager = new UserMessageQueue(async (telegramId) => {
    await processUserQueue(queueManager, telegramId);
  });

  console.log("[System] Userbot handlers registered with safe inputChat logic.");

  userbotClient.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    const text = typeof message.text === "string" ? message.text.trim() : null;
    
    // Расм бор ёки йўқ эканини текширамиз
    const hasPhoto = message.photo !== null && message.photo !== undefined;

    if (!message.isPrivate || message.out || (!text && !hasPhoto)) return;

    const senderEntity = await message.getSender() as any;
    if (!senderEntity || !senderEntity.id) return;

    const telegramId = BigInt(senderEntity.id.toString());
    if (options.incomingMessageLimiter.isLimited(telegramId)) return;

    const sender: SenderInfo = {
      id: telegramId,
      firstName: (senderEntity.firstName || senderEntity.first_name || "Unknown") as string,
      username: (senderEntity.username || senderEntity.user?.username) ? `@${senderEntity.username || senderEntity.user?.username}` : null,
    };

    // Агар расм юборилса, уни Base64'га ўгирамиз
    let imageBase64: string | undefined;
    let imageMimeType: string | undefined;
    
    if (hasPhoto) {
      const imageData = await downloadImageAsBase64(message);
      if (imageData) {
        imageBase64 = imageData.base64;
        imageMimeType = imageData.mimeType;
        console.log(`[Userbot] Фото юклаб олинди (${message.photo!.id}), Base64 узунлиги: ${imageBase64.length} байт`);
      }
    }

    queueManager.enqueue({
      telegramId,
      text: text || "", // Агар матн бўлмаса, бўш сатр
      messageId: message.id,
      sender,
      messageObj: message,
      imageBase64, // Vision учун Base64
      imageMimeType, // MIME типи
    });
  }, new NewMessage({}));
}