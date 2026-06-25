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

  // Все сообщения пользователя для экспорта в .txt (ASC, без лимита)
  findAllByUserId(userId: string) {
    return prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, createdAt: true, source: true },
    });
  }

  // Последние N сообщений для анализа Gemini (в хронологическом порядке)
  findRecentForAnalysis(userId: string, take = 40) {
    return prisma.message.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take,
      select: { role: true, content: true, createdAt: true },
    }).then((rows) => rows.reverse()); // возвращаем в хронологическом порядке
  }
  // === Statistics ===
  getMessagesCountSince24h() {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return prisma.message.count({
      where: { createdAt: { gte: yesterday } },
    });
  }

  async getTopActiveUsersSince24h(take = 3) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const top = await prisma.message.groupBy({
      by: ['userId'],
      where: {
        createdAt: { gte: yesterday },
        role: "user"
      },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take,
    });
    
    if (top.length === 0) return [];

    const userIds = top.map(t => t.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true }
    });
    
    return top.map(t => ({
      firstName: users.find(u => u.id === t.userId)?.firstName || "Без имени",
      messageCount: t._count.id
    }));
  }
}

export const messageRepo = new MessageRepository();
