import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";

const TELEGRAM_ID_PATTERN = /^\d+$/;

export type UserEditState = {
  action: "waiting_for_prompt" | "waiting_for_model";
  telegramId: string;
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
          }
        : null,
    };
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
}

export const adminService = new AdminService();
