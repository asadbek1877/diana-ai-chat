import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";

export type UserEditState = {
  action: "waiting_for_prompt" | "waiting_for_model";
  telegramId: string;
};

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
    return userRepo.findByTelegramId(BigInt(telegramId));
  }

  resetUserSettings(telegramId: string) {
    return userRepo.resetPersonalSettings(BigInt(telegramId));
  }

  setPersonalPrompt(telegramId: string, prompt: string) {
    return userRepo.setPersonalPrompt(BigInt(telegramId), prompt);
  }

  setPersonalModel(telegramId: string, model: string) {
    return userRepo.setPersonalModel(BigInt(telegramId), model);
  }
}

export const adminService = new AdminService();
