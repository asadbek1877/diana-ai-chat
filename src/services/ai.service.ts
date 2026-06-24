import { env } from "../config/env";
import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";
import { LearningRepo } from "../database/repositories/learning.repo";
import { getDianaPrompt } from "../ai/prompt";
import { groqProvider } from "../providers/groq.provider";
import { openRouterProvider } from "../providers/openrouter.provider";
import { AIMessage, AIProvider } from "../types";

type ProviderName = "groq" | "openrouter";

type GenerateReplyInput = {
  telegramId: bigint | string;
  message: string;
  history?: AIMessage[];
  provider?: ProviderName;
  imageBase64?: string; // Vision үчин - Base64 расм
  imageMimeType?: string; // MIME типи
};

const FALLBACK_GROQ_MODEL = "llama-3.1-8b-instant";
const FALLBACK_OPENROUTER_MODEL = "meta-llama/llama-3-8b-instruct";

class AIService {
  private providers: Record<ProviderName, AIProvider> = {
    groq: groqProvider,
    openrouter: openRouterProvider,
  };

  async generateReply(input: GenerateReplyInput) {
    try {
      const telegramId = typeof input.telegramId === "bigint" ? input.telegramId : BigInt(input.telegramId.trim());
      const providerName = input.provider ?? "groq";
      const [user, settings] = await Promise.all([
        userRepo.findByTelegramId(telegramId),
        settingsRepo.getSettings(),
      ]);

      if (settings?.isBotActive === false) {
        return "I am sleeping right now. The admin temporarily disabled me.";
      }

      const apiKey = this.getApiKey(providerName);
      
      // === ДИНАМИК ХОТИРАНИ ҚЎШИШ ===
      let basePrompt = user?.personalPrompt?.trim() || settings?.systemPrompt?.trim() || getDianaPrompt();
      
      const learnedRules = await LearningRepo.getActiveRules();
      if (learnedRules.length > 0) {
        basePrompt += `\n\n# ВАЖНО! ТВОЙ ОПЫТ ИЗ ПРОШЛЫХ ДИАЛОГОВ:\n`;
        learnedRules.forEach((rule: any, index: number) => {
          basePrompt += `${index + 1}. ${rule.ruleText}\n`;
        });
        basePrompt += `(Строго соблюдай эти правила, ты вывела их из своих ошибок!)`;
      }
      // =================================
      
      const response = await this.providers[providerName].ask(input.message, input.history ?? [], {
        apiKey,
        model: this.getModel(providerName, user?.personalModel, settings?.currentModel),
        systemPrompt: basePrompt,
        temperature: 0.8,
        imageBase64: input.imageBase64, // Vision үчін
        imageMimeType: input.imageMimeType, // MIME типи
      });

      const tokensUsed = Number(response.tokensUsed || 0);

      if (Number.isFinite(tokensUsed) && tokensUsed > 0 && user) {
        await userRepo.incrementTokens(telegramId, tokensUsed);
      }

      return response.content;
    } catch (error) {
      console.error("AI service error:", error);
      return "Извините, произошла ошибка";
    }
  }

  private getApiKey(providerName: ProviderName) {
    const apiKey =
      providerName === "groq"
        ? env.GROQ_API_KEY
        : env.OPENROUTER_API_KEY;

    if (!apiKey) {
      throw new Error(`${providerName} API key is missing`);
    }

    return apiKey;
  }

  private getModel(providerName: ProviderName, personalModel?: string | null, globalModel?: string | null) {
    return (
      personalModel?.trim() ||
      globalModel?.trim() ||
      (providerName === "groq" ? FALLBACK_GROQ_MODEL : FALLBACK_OPENROUTER_MODEL)
    );
  }
}

export const aiService = new AIService();
