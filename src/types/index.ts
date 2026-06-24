export type AIMessage = {
  role: string;
  content: string;
};

export type AIProviderConfig = {
  apiKey: string;
  model: string;
  systemPrompt: string;
  temperature?: number;
  imageBase64?: string; // Vision үчін - Base64 расм
  imageMimeType?: string; // MIME типи (image/jpeg, image/png, и т.д.)
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
