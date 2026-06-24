import { LearningRepo } from "../database/repositories/learning.repo";
import { aiService } from "./ai.service";

export class SelfLearningService {
  static async runNightlyAnalysis() {
    console.log("[Inner Court] Диананинг бугунги тажрибалари таҳлил қилинмоқда...");

    const logs = await LearningRepo.getUnanalyzedLogs();
    if (logs.length === 0) {
      console.log("[Inner Court] Бугун таҳлил қилиш учун янги сигналлар йўқ.");
      return;
    }

    // ЛОГЛАРНИ МАТНГА АЙЛАНТИРИШ
    let promptText = "Ты аналитик поведения. Вот фрагменты диалогов, где Диана совершила ошибки или наоборот, получила хорошую реакцию:\n\n";
    
    logs.forEach(log => {
      promptText += `Диана написала: "${log.dianaReply}"\n`;
      promptText += `Парень ответил: "${log.userMessage}"\n`;
      promptText += `Результат: ${log.isPositive ? "УСПЕХ (понравилось)" : "ОШИБКА (спалили бота или негатив)"}\n\n`;
    });

    promptText += `
    ПРОАНАЛИЗИРУЙ ЭТО. 
    Напиши 1 или 2 коротких, жестких правила для Дианы на будущее, чтобы она больше не делала таких ошибок или чаще использовала успешные приемы.
    Отвечай СТРОГО в формате:
    ПРАВИЛО: [текст правила]
    ПРАВИЛО: [текст правила]
    Никакой воды, только сами правила.
    `;

    try {
      // Арзон модел орқали анализ қиламиз (масалан gemini-flash)
      const analysisResult = await aiService.generateReply({
        telegramId: BigInt(0), // Бу ички сўров бўлгани учун ID муҳим эмас
        message: promptText,
        history: [],
        provider: "openrouter" // Ёки ўзингиз ишлатадиган провайдер
      });

      // Жавобдан қоидаларни кесиб олиш
      const rules = analysisResult.match(/(?:ПРАВИЛО:\s*)(.+)/g);
      
      if (rules && rules.length > 0) {
        for (const rule of rules) {
          const cleanRule = rule.replace("ПРАВИЛО:", "").trim();
          await LearningRepo.saveLearnedRule(cleanRule);
          console.log(`[Inner Court] Янги олтин қоида чиқарилди: ${cleanRule}`);
        }
      }

      // Ўқилган логларни ёпиб қўйиш
      const logIds = logs.map(l => l.id);
      await LearningRepo.markAsAnalyzed(logIds);

    } catch (error) {
      console.error("[Inner Court] Анализ вақтида хатолик:", error);
    }
  }

  // Ҳар куни тунда ишлаши учун таймер
  static start() {
    console.log("[Inner Court] Диананинг ўзини-ўзи ўқитиш (Self-Learning) таймери ёқилди!");
    
    // Ҳар 24 соатда бир марта ишлайди
    setInterval(() => {
      this.runNightlyAnalysis();
    }, 24 * 60 * 60 * 1000); // 24 соат
  }
}
