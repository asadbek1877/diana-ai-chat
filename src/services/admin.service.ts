import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";
import { messageRepo } from "../database/repositories/message.repo";
import { generateUserDossier } from "./gemini.service";

const TELEGRAM_ID_PATTERN = /^\d+$/;

export type UserEditState = {
  action: "waiting_for_prompt" | "waiting_for_model" | "waiting_for_manual_message" | "waiting_for_broadcast" | "waiting_for_memory_rule";
  telegramId?: string;
};

function parseTelegramId(telegramId: string) {
  if (!TELEGRAM_ID_PATTERN.test(telegramId)) {
    throw new Error("Invalid telegramId");
  }

  try {
    return BigInt(telegramId);
  } catch {
    throw new Error("Invalid telegramId");
  }
}

class AdminService {
  async getDashboardStats() {
    const [usersCount, totalTokens, settings] = await Promise.all([
      userRepo.countUsers(),
      userRepo.getTotalTokensUsed(),
      settingsRepo.getSettings(),
    ]);

    return {
      usersCount,
      totalTokens,
      settings: settings
        ? {
            currentModel: settings.currentModel?.trim() || "llama-3.1-8b-instant",
            isBotActive: settings.isBotActive,
            isNotificationsEnabled: settings.isNotificationsEnabled,
          }
        : null,
    };
  }

  toggleNotifications() {
    return settingsRepo.toggleNotifications();
  }

  async getDashboardStatsDetails() {
    const [usersCount, messages24h, topUsers] = await Promise.all([
      userRepo.countUsers(),
      messageRepo.getMessagesCountSince24h(),
      messageRepo.getTopActiveUsersSince24h(3),
    ]);
    return { usersCount, messages24h, topUsers };
  }

  getTopUsers(take: number) {
    return userRepo.findTopByTokens(take);
  }

  getUserProfile(telegramId: string) {
    return userRepo.findByTelegramId(parseTelegramId(telegramId));
  }

  resetUserSettings(telegramId: string) {
    return userRepo.resetPersonalSettings(parseTelegramId(telegramId));
  }

  setPersonalPrompt(telegramId: string, prompt: string) {
    return userRepo.setPersonalPrompt(parseTelegramId(telegramId), prompt);
  }

  setPersonalModel(telegramId: string, model: string) {
    return userRepo.setPersonalModel(parseTelegramId(telegramId), model);
  }

  // === Tracking: Методы для слежения ===

  getRecentUsers(take: number) {
    return userRepo.findRecentUsers(take);
  }

  toggleTracking(telegramId: string) {
    return userRepo.toggleTracking(parseTelegramId(telegramId));
  }

  isUserTracking(telegramId: bigint) {
    return userRepo.findIsTracking(telegramId);
  }

  // === Dosser: AI-досье через Gemini ===

  /**
   * Генерирует свежее досье на пользователя и сохраняет в БД.
   * @returns новый текст досье, или null при ошибке
   */
  async refreshUserDossier(telegramId: string): Promise<string | null> {
    const user = await userRepo.findByTelegramId(parseTelegramId(telegramId));
    if (!user) return null;

    const messages = await messageRepo.findRecentForAnalysis(user.id, 40);

    if (messages.length === 0) {
      const empty = "Недостаточно данных. Пользователь ещё не написал ни одного сообщения.";
      await userRepo.saveAiSummary(user.id, empty);
      return empty;
    }

    const summary = await generateUserDossier(messages);
    if (!summary) return null;

    await userRepo.saveAiSummary(user.id, summary);
    return summary;
  }

  // === Export: Экспорт переписки в .txt ===

  /**
   * Собирает всю историю сообщений пользователя в форматированную строку.
   * @returns { filename, buffer } — готово для ctx.replyWithDocument
   */
  async exportUserChat(
    telegramId: string
  ): Promise<{ filename: string; buffer: Buffer } | null> {
    const user = await userRepo.findByTelegramId(parseTelegramId(telegramId));
    if (!user) return null;

    const messages = await messageRepo.findAllByUserId(user.id);

    if (messages.length === 0) {
      return null;
    }

    const header = [
      `=== Экспорт чата Diana CRM ===`,
      `Пользователь: ${user.firstName ?? "Без имени"} (@${user.username ?? "no_username"})`,
      `Telegram ID: ${user.telegramId.toString()}`,
      `Всего сообщений: ${messages.length}`,
      `Дата экспорта: ${new Date().toLocaleString("ru-RU")}`,
      `${"=".repeat(40)}`,
      "",
    ].join("\n");

    const body = messages
      .map((msg) => {
        const date = msg.createdAt.toLocaleString("ru-RU");
        const author = msg.role === "user" ? "👤 Пользователь" : "🤖 Диана";
        return `[${date}] ${author}:\n${msg.content}\n`;
      })
      .join("\n");

    const text = header + body;
    const filename = `chat_${telegramId}_${Date.now()}.txt`;

    return { filename, buffer: Buffer.from(text, "utf-8") };
  }

  // === Manual Mode: Ручной режим ===

  toggleManualMode(telegramId: string) {
    return userRepo.toggleManualMode(parseTelegramId(telegramId));
  }

  /**
   * Отправляет ручное сообщение от имени Дианы.
   * Сохраняет в БД как assistant-сообщение и возвращает telegramId для отправки.
   */
  async sendManualMessage(
    telegramId: string,
    text: string
  ): Promise<{ targetTelegramId: bigint } | null> {
    const tgId = parseTelegramId(telegramId);
    const user = await userRepo.findByTelegramId(tgId);
    if (!user) return null;

    // Сохраняем ручное сообщение как assistant в историю переписки
    await messageRepo.saveMessage({
      userId: user.id,
      role: "assistant",
      content: text,
      source: "admin_manual",
    });

    return { targetTelegramId: user.telegramId };
  }
  setPersonaMode(telegramId: string, personaMode: string) {
    return userRepo.setPersonaMode(parseTelegramId(telegramId), personaMode);
  }

  // === Broadcast ===
  getAllUsersForBroadcast() {
    return userRepo.getAllTelegramIds();
  }
}

export const adminService = new AdminService();
