import { messageRepo } from "../database/repositories/message.repo";
import { userRepo } from "../database/repositories/user.repo";

type AdminReplyInput = {
  replyText: string;
  adminReplyText: string;
};

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

  /**
   * Handle admin reply in the admin group.
   * When admin replies to a log message, this extracts the target user ID
   * and either forwards the admin's text or resumes AI for that user.
   */
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
}

export const chatService = new ChatService();
