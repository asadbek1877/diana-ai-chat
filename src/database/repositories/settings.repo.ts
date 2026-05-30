import { prisma } from "../prisma";

const SETTINGS_CACHE_TTL_MS = 60_000;

export class SettingsRepository {
  private cachedSettings: Awaited<ReturnType<typeof prisma.settings.findFirst>> | null = null;
  private cacheExpiresAt = 0;

  async getSettings() {
    const now = Date.now();

    if (this.cachedSettings && now < this.cacheExpiresAt) {
      return this.cachedSettings;
    }

    this.cachedSettings = await prisma.settings.findFirst();
    this.cacheExpiresAt = now + SETTINGS_CACHE_TTL_MS;

    return this.cachedSettings;
  }

  invalidateCache() {
    this.cachedSettings = null;
    this.cacheExpiresAt = 0;
  }

  async toggleBot() {
    const settings = await this.getSettings();

    if (!settings) {
      const created = await prisma.settings.create({
        data: {
          isBotActive: false,
          systemPrompt: "Ты Диана, дерзкая и веселая девушка...",
        },
      });

      this.cachedSettings = created;
      this.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
      return created;
    }

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: { isBotActive: !settings.isBotActive },
    });

    this.cachedSettings = updated;
    this.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
    return updated;
  }

  async saveModel(modelName: string) {
    const settings = await this.getSettings();

    const saved = settings
      ? await prisma.settings.update({
          where: { id: settings.id },
          data: { currentModel: modelName },
        })
      : await prisma.settings.create({
          data: {
            currentModel: modelName,
            systemPrompt: "Ты Диана, дерзкая и веселая девушка...",
          },
        });

    this.cachedSettings = saved;
    this.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
    return saved;
  }

  async savePrompt(prompt: string) {
    const settings = await this.getSettings();

    const saved = settings
      ? await prisma.settings.update({
          where: { id: settings.id },
          data: { systemPrompt: prompt },
        })
      : await prisma.settings.create({
          data: {
            systemPrompt: prompt,
            currentModel: "deepseek/deepseek-chat:free",
          },
        });

    this.cachedSettings = saved;
    this.cacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
    return saved;
  }
}

export const settingsRepo = new SettingsRepository();
