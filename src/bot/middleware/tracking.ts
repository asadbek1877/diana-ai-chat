import { Bot } from "grammy";
import { env } from "../../config/env";
import { adminService } from "../../services/admin.service";

/**
 * Tracking Interceptor для Userbot (Client A).
 *
 * Проверяет isTracking в БД для каждого входящего сообщения.
 * Если isTracking === true, незаметно пересылает сообщение в чат Админа
 * через Bot API (Client B), чтобы не палить userbot-сессию.
 *
 * Вызывается из userbot handler ПОСЛЕ сохранения сообщения в БД,
 * чтобы не блокировать основной flow.
 */
export async function trackingInterceptor(
  notificationBot: Bot<any>,
  params: {
    telegramId: bigint;
    chatId: number;
    messageId: number;
    messageText: string;
    senderName: string;
  }
): Promise<void> {
  try {
    const settings = await adminService.getDashboardStats();
    if (settings.settings && !settings.settings.isNotificationsEnabled) {
      return; // Глобально отключено
    }

    const isTracking = await adminService.isUserTracking(params.telegramId);

    if (!isTracking) return;

    // Способ 1: forwardMessage — пересылка оригинала (видно "Forwarded from")
    // Способ 2: copyMessage — копирование без "Forwarded from"
    // Используем forwardMessage для сохранения контекста (админ видит, от кого)
    try {
      await notificationBot.api.forwardMessage(
        env.ADMIN_ID,
        params.chatId,
        params.messageId
      );
    } catch (forwardError) {
      // fallback: если forwardMessage не сработал (бот не видит чат userbot'а),
      // отправляем текстом через Bot API
      const trackingNotification = [
        `🔎 <b>Живой мониторинг</b>`,
        ``,
        `<b>От:</b> ${escapeHtml(params.senderName)}`,
        `<b>ID:</b> <code>${params.telegramId.toString()}</code>`,
        ``,
        `<b>Сообщение:</b>`,
        `<pre>${escapeHtml(params.messageText.substring(0, 3500))}</pre>`,
        ``,
        `<i>${new Date().toLocaleTimeString("ru-RU")}</i>`,
      ].join("\n");

      await notificationBot.api.sendMessage(env.ADMIN_ID, trackingNotification, {
        parse_mode: "HTML",
      });
    }
  } catch (error) {
    // Ошибки трекинга НЕ должны ломать основной flow бота
    console.error("[Tracking] Interceptor error:", error);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
