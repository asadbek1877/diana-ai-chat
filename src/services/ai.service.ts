import { env } from "../config/env";
import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";
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
      const response = await this.providers[providerName].ask(input.message, input.history ?? [], {
        apiKey,
        model: this.getModel(providerName, user?.personalModel, settings?.currentModel),
        systemPrompt: user?.personalPrompt?.trim() || settings?.systemPrompt?.trim() || getDianaPrompt(),
        temperature: 0.8,
      });

      const tokensUsed = Number(response.tokensUsed || 0);

      if (Number.isFinite(tokensUsed) && tokensUsed > 0 && user) {
        await userRepo.incrementTokens(telegramId, tokensUsed);
      }

      return response.content;
    } catch (error) {
      console.error("AI service error:", error);
      const message = error instanceof Error ? error.message : "unknown error";
      return `Sorry, the AI request failed: ${message}`;
    }
  }

  private getApiKey(providerName: ProviderName) {
    const apiKey =
      providerName === "groq"
        ? env.GROQ_API_KEY || env.OPENAI_API_KEY
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
