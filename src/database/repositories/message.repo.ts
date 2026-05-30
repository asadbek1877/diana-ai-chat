import { prisma } from "../prisma";

type SaveMessageInput = {
  userId: string;
  role: "user" | "assistant" | "diana" | string;
  content: string;
  source?: string;
};

export class MessageRepository {
  saveMessage(input: SaveMessageInput) {
    return prisma.message.create({
      data: {
        userId: input.userId,
        role: input.role === "diana" ? "assistant" : input.role,
        content: input.content,
        source: input.source ?? "telegram_bot",
      },
    });
  }

  saveConversation(userId: string, userMessage: string, assistantMessage: string, source = "telegram_bot") {
    return prisma.$transaction([
      prisma.message.create({
        data: { userId, role: "user", content: userMessage, source },
      }),
      prisma.message.create({
        data: { userId, role: "assistant", content: assistantMessage, source },
      }),
      prisma.userProfile.upsert({
        where: { userId },
        update: { messageCount: { increment: 1 } },
        create: {
          userId,
          messageCount: 1,
          topicsDiscussed: [],
          personalityNotes: "",
        },
      }),
    ]);
  }

  findRecentByUserId(userId: string, take: number) {
    return prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async findHistoryByTelegramId(telegramId: bigint, take: number) {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      select: { id: true },
    });

    if (!user) {
      return [];
    }

    return prisma.message.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take,
    });
  }

  countToday() {
    return prisma.message.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    });
  }

  deleteByUserId(userId: string) {
    return prisma.message.deleteMany({
      where: { userId },
    });
  }

  countByUserId(userId: string) {
    return prisma.message.count({
      where: { userId },
    });
  }

  findFirstByUserId(userId: string) {
    return prisma.message.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
  }
}

export const messageRepo = new MessageRepository();
