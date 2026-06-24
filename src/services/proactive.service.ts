import { userRepo } from "../database/repositories/user.repo";
import { messageRepo } from "../database/repositories/message.repo";
import { aiService } from "./ai.service";
import { userbotClient } from "../userbot/client";
import { formatDianaText, extractLikeIntent } from "./text-formatter";
import { Api } from "telegram";

export class ProactiveService {
  // Бу функция базани текширади ва хат жўнатади
  static async checkAndSendProactiveMessages() {
    console.log("[Proactive] Банд бўлмаган ва 2 кундан бери ёзмаган юзерларни қидириш...");
    
    try {
      // 2 кун давомида ёзмаган фойдаланувчиларни базадан оламиз
      const inactiveUsers = await userRepo.findInactiveUsersForProactiveMessaging(2);

      if (inactiveUsers.length === 0) {
        console.log("[Proactive] Хабар жўнатадиган юзерлар топилмади.");
        return;
      }

      console.log(`[Proactive] ${inactiveUsers.length} та неактив юзер топилди.`);

      for (const user of inactiveUsers) {
        try {
          const telegramId = BigInt(user.telegramId);

          // Диана биринчи бўлиб ёзиши учун AI га махсус "Ички Буйруқ" (Hidden Prompt) берамиз
          const hiddenSystemPrompt = 
            "[SYSTEM ACTION: Этот пользователь не писал тебе больше 2 дней. Напиши ему первая, очень коротко, в своём стиле. Например: 'куку', 'ты где пропал?', 'че делаешь?'. Выдай только текст сообщения]";

          // Базадан охирги 10 та хабарни оламиз (контекст йўқолмаслиги учун)
          const recentMessages = await messageRepo.findRecentByUserId(user.id, 10);
          const history = [...recentMessages].reverse();

          // AI дан биринчи хабар матнини оламиз
          const rawReply = await aiService.generateReply({
            telegramId,
            message: hiddenSystemPrompt, // Фойдаланувчи хабари ўрнига бизнинг махсус буйруқ кетади
            history,
            provider: "openrouter",
          });

          const { text } = extractLikeIntent(formatDianaText(rawReply));
          if (!text || text.includes("Извините")) {
            console.log(`[Proactive] ${user.firstName} үчүн ҳабар норасий булди, ўтказилди.`);
            continue;
          }

          // Telegram орқали хабарни фойдаланувчига жўнатамиз
          const peer = await userbotClient.getInputEntity(telegramId);
          
          // "Ёзяпти..." эффектини чиқарамиз
          await userbotClient.invoke(new Api.messages.SetTyping({ peer, action: new Api.SendMessageTypingAction() }));
          await new Promise((resolve) => setTimeout(resolve, 3000)); // 3 секунд кутиш

          // Хабарни юбориш
          await userbotClient.sendMessage(peer, { message: text });
          console.log(`[Proactive] Диана биринчи бўлиб ${user.firstName} га ёзди: "${text}"`);

          // Базада хабарни сақлаймиз ва охирги фаоллик вақтини янгилаймиз
          await messageRepo.saveConversation(user.id, "[Диана написала первая]", text, "telegram_userbot");
          await userRepo.updateActivity(telegramId, true); // Вақтни янгилаб қўямиз, қайтиб қайта ёзмаслиги учун

          // Хилма-хилнинг үчүн кичик вақт ортидан ўзинг хабар жўнатмасликни чўлаш
          await new Promise((resolve) => setTimeout(resolve, 2000));

        } catch (err) {
          console.error(`[Proactive] Юзерга ёзишда хатолик (${user.firstName}):`, err);
        }
      }

      console.log("[Proactive] Текширув тамом.");

    } catch (error) {
      console.error("[Proactive] Текширув жараёнида умумий хатолик:", error);
    }
  }

  // Таймерни ишга тушириш (Ҳар соатда бир марта текширади)
  static start() {
    console.log("[Proactive] Taymerni ishga tushiryapman...");
    
    // Сервер ёқилиши билан 10 секундан сўнг 1 марта текширади
    setTimeout(() => {
      console.log("[Proactive] Birinchi tekshiruv amalga oshirilmoqda...");
      this.checkAndSendProactiveMessages().catch((err) => {
        console.error("[Proactive] Birinchi tekshiruv xatosi:", err);
      });
    }, 10000);

    // Ва ҳар 1 соатда (3600000 мс) фонда текшириб туради
    setInterval(() => {
      console.log("[Proactive] Soatlik tekshiruv amalga oshirilmoqda...");
      this.checkAndSendProactiveMessages().catch((err) => {
        console.error("[Proactive] Soatlik tekshiruv xatosi:", err);
      });
    }, 60 * 60 * 1000);

    console.log("[Proactive] Taymerni ishga tushirildi. Har 1 soat ichida tekshiriladi.");
  }
}
