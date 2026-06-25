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

// === Audit #2: Дневной лимит токенов per-user ===
const MAX_DAILY_TOKENS = 50_000;

// === Audit #6: Circuit breaker интеграция ===
let isCircuitOpenFn: (() => boolean) | null = null;

export function setCircuitBreakerCheck(fn: () => boolean) {
  isCircuitOpenFn = fn;
}

class AIService {
  private providers: Record<ProviderName, AIProvider> = {
    groq: groqProvider,
    openrouter: openRouterProvider,
  };

  async generateReply(input: GenerateReplyInput) {
    try {
      // === Audit #6: Проверка circuit breaker ===
      if (isCircuitOpenFn && isCircuitOpenFn()) {
        return "Сервер перегружен, попробуйте через минутку 😔";
      }

      const telegramId = typeof input.telegramId === "bigint" ? input.telegramId : BigInt(input.telegramId.trim());
      const providerName = input.provider ?? "groq";
      const [user, settings] = await Promise.all([
        userRepo.findByTelegramId(telegramId),
        settingsRepo.getSettings(),
      ]);

      if (settings?.isBotActive === false) {
        return "I am sleeping right now. The admin temporarily disabled me.";
      }

      // === Audit #2: Проверка дневного лимита токенов ===
      if (user && user.tokensUsed > MAX_DAILY_TOKENS) {
        return "Ты слишком много писал сегодня, отдохни немного 😴";
      }

      const apiKey = this.getApiKey(providerName);
      
      // === ДИНАМИК ХОТИРАНИ ҚЎШИШ ===
      let basePrompt = user?.personalPrompt?.trim() || settings?.systemPrompt?.trim() || getDianaPrompt();

      // === Persona Switcher ===
      const personaModifiers: Record<string, string> = {
        sweet: "\n\nБудь очень милой, заботливой, используй ласковые слова и милые эмодзи. Ты влюблена.",
        sassy: "\n\nБудь дерзкой, саркастичной, слегка подкалывай парня. Знай себе цену.",
        cold: "\n\nОтвечай очень коротко, сухо, без эмодзи. Ты обижена или тебе неинтересно.",
        auto: "\n\nОбщайся естественно, как обычная девушка, подстраивайся под тон собеседника."
      };

      const pMode = (user as any)?.personaMode || "auto";
      if (personaModifiers[pMode]) {
         basePrompt += personaModifiers[pMode];
      }
      
      const learnedRules = await LearningRepo.getActiveRules();
      if (learnedRules.length > 0) {
        basePrompt += `\n\nДополнительные факты о тебе на данный момент:\n`;
        learnedRules.forEach((rule: any) => {
          basePrompt += `- ${rule.ruleText}\n`;
        });
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
