import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";

type UpsertUserInput = {
  telegramId: bigint;
  username?: string | null;
  firstName?: string | null;
  platform?: string;
};

export class UserRepository {
  findByTelegramId(telegramId: bigint, includeProfile = false) {
    return prisma.user.findUnique({
      where: { telegramId },
      include: includeProfile ? { profile: true } : undefined,
    });
  }

  findById(id: string, includeProfile = false) {
    return prisma.user.findUnique({
      where: { id },
      include: includeProfile ? { profile: true } : undefined,
    });
  }

  upsertUser(input: UpsertUserInput) {
    return prisma.user.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        platform: input.platform ?? "TELEGRAM",
      },
      update: {
        username: input.username ?? null,
        firstName: input.firstName ?? null,
      },
    });
  }

  async ensureUser(input: UpsertUserInput) {
    return prisma.user.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        username: input.username ?? null,
        firstName: input.firstName ?? "Unknown",
        platform: input.platform ?? "TELEGRAM",
        isBlocked: false,
      },
      update: {
        username: input.username ?? null,
        firstName: input.firstName ?? "Unknown",
      },
    });
  }

  async ensureUserWithProfile(input: UpsertUserInput) {
    return prisma.user.upsert({
      where: { telegramId: input.telegramId },
      create: {
        telegramId: input.telegramId,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        platform: input.platform ?? "TELEGRAM",
        profile: {
          create: {
            topicsDiscussed: [] as Prisma.InputJsonValue,
            personalityNotes: "",
          },
        },
      },
      update: {
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        profile: {
          upsert: {
            create: {
              topicsDiscussed: [] as Prisma.InputJsonValue,
              personalityNotes: "",
            },
            update: {},
          },
        },
      },
      include: { profile: true },
    });
  }

  incrementTokens(telegramId: bigint, tokensUsed: number) {
    return prisma.user.update({
      where: { telegramId },
      data: {
        tokensUsed: {
          increment: tokensUsed,
        },
      },
    });
  }

  countUsers() {
    return prisma.user.count();
  }

  async getTotalTokensUsed() {
    const result = await prisma.user.aggregate({
      _sum: {
        tokensUsed: true,
      },
    });

    return result._sum.tokensUsed ?? 0;
  }

  findTopByTokens(take: number) {
    return prisma.user.findMany({
      take,
      orderBy: {
        tokensUsed: "desc",
      },
    });
  }

  resetPersonalSettings(telegramId: bigint) {
    return prisma.user.update({
      where: { telegramId },
      data: {
        personalModel: null,
        personalPrompt: null,
      },
    });
  }

  setPersonalPrompt(telegramId: bigint, personalPrompt: string) {
    return prisma.user.update({
      where: { telegramId },
      data: { personalPrompt },
    });
  }

  setPersonalModel(telegramId: bigint, personalModel: string) {
    return prisma.user.update({
      where: { telegramId },
      data: { personalModel },
    });
  }

  setPausedById(id: string, isPaused: boolean) {
    return prisma.user.update({
      where: { id },
      data: { isPaused },
    });
  }
}

export const userRepo = new UserRepository();
