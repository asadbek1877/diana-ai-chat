import { env } from "../config/env";
import { messageRepo } from "../database/repositories/message.repo";
import { userRepo } from "../database/repositories/user.repo";
import { aiService } from "./ai.service";

type ProcessUserMessageInput = {
  telegramId: bigint;
  firstName?: string;
  username?: string;
  text: string;
};

type AdminReplyInput = {
  replyText: string;
  adminReplyText: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

class ChatService {
  private activeUsers = new Set<string>();

  async upsertTelegramUser(ctx: any) {
    if (!ctx.from) return null;

    const telegramId = String(ctx.from.id);
    this.activeUsers.add(telegramId);

    return userRepo.upsertUser({
      telegramId: BigInt(telegramId),
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
      platform: "TELEGRAM",
    });
  }

  async handleAdminGroupReply(input: AdminReplyInput) {
    const match = input.replyText.match(/ID:\s(\d+)/);
    if (!match) return null;

    let targetTelegramId: bigint;
    try {
      targetTelegramId = BigInt(match[1]);
    } catch {
      return null;
    }

    const targetUser = await userRepo.findByTelegramId(targetTelegramId);
    if (!targetUser) return null;

    if (input.adminReplyText.trim() === "/ai") {
      await userRepo.setPausedById(targetUser.id, false);
      return { targetTelegramId, textToSend: null, aiResumed: true };
    }

    await userRepo.setPausedById(targetUser.id, true);
    await messageRepo.saveMessage({
      userId: targetUser.id,
      role: "assistant",
      content: input.adminReplyText,
      source: "admin_reply",
    });

    return {
      targetTelegramId,
      textToSend: input.adminReplyText,
      aiResumed: false,
    };
  }

  async processUserMessage(input: ProcessUserMessageInput) {
    const user = await userRepo.ensureUser({
      telegramId: input.telegramId,
      firstName: input.firstName || "Unknown",
      username: input.username || null,
      platform: "TELEGRAM",
    });

    if (user.isPaused || user.isBlocked || !input.text.trim()) {
      return null;
    }

    const recentMessages = await messageRepo.findRecentByUserId(user.id, 12);
    const history = [...recentMessages].reverse();
    const reply = await aiService.generateReply({
      telegramId: input.telegramId,
      message: input.text,
      history,
      provider: "openrouter",
    });

    await messageRepo.saveConversation(user.id, input.text, reply, "telegram_bot");

    return {
      reply,
      user,
      adminNotification: [
        `<b>Incoming message</b>`,
        `From: ${escapeHtml(input.firstName || "Unknown")} (${input.username ? `@${escapeHtml(input.username)}` : "no_username"})`,
        `ID: ${input.telegramId}`,
        `Message: ${escapeHtml(input.text)}`,
      ].join("\n"),
    };
  }

  getAdminGroupId() {
    return env.ADMIN_GROUP_ID;
  }
}

export const chatService = new ChatService();
