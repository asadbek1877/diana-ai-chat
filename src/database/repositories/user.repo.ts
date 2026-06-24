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

  // Фойдаланувчининг охирги фаоллик вақтини ва хабар ёзиш рухсатини янгилаш
  async updateActivity(telegramId: bigint, canMessageFirst: boolean = true) {
    return prisma.user.update({
      where: { telegramId },
      data: {
        lastActivityAt: new Date(),
        canMessageFirst: canMessageFirst,
      },
    });
  }

  // Диана ўзи биринчи бўлиб ёзиши мумкин бўлган фойдаланувчиларни топиш
  // Масалан: охирги марта N кун олдин ёзганларни топиш
  async findInactiveUsersForProactiveMessaging(daysInactive: number) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

    return prisma.user.findMany({
      where: {
        canMessageFirst: true, // Фақат рухсати борларга
        lastActivityAt: {
          lte: cutoffDate, // cutoffDate дан олдин, яъни эски фаоллик
        },
        isPaused: false, // Боти тўхтатилмаган бўлиши керак
      },
    });
  }
}

export const userRepo = new UserRepository();
