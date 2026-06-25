import { prisma } from "../prisma";

export class LearningRepo {
  // Сигнални (хато ёки ютуқни) базага сақлаш
  static async logInteraction(
    userId: string,
    userMessage: string,
    dianaReply: string,
    isPositive: boolean
  ) {
    return prisma.interactionLog.create({
      data: { userId, userMessage, dianaReply, isPositive },
    });
  }

  // Суд қилинмаган (янги) хато ва ютуқларни олиш
  static async getUnanalyzedLogs() {
    return prisma.interactionLog.findMany({
      where: { isAnalyzed: false },
      take: 50, // Бир кунда максимум 50 тасини таҳлил қиляди
    });
  }

  // Анализ қилинганларни "ўқилди" қилиб белгилаш
  static async markAsAnalyzed(logIds: string[]) {
    return prisma.interactionLog.updateMany({
      where: { id: { in: logIds } },
      data: { isAnalyzed: true },
    });
  }

  // Янги қоидани базага қўшиш
  static async saveLearnedRule(ruleText: string) {
    return prisma.learnedRule.create({
      data: { ruleText },
    });
  }

  // Диана ўқиши учун барча фаол қоидаларни олиш
  static async getActiveRules() {
    return prisma.learnedRule.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
  }
  // Очистить все факты (перевести в неактивные)
  static async clearMemoryRules() {
    return prisma.learnedRule.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });
  }
}
