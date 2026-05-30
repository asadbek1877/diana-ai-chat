export type AIMessage = {
  role: string;
  content: string;
};

export type AIProviderConfig = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature?: number;
};

export type AIProviderResponse = {
  content: string;
  tokensUsed?: number;
};

export interface AIProvider {
  ask(
    message: string,
    history: AIMessage[],
    config: AIProviderConfig
  ): Promise<AIProviderResponse>;
}
