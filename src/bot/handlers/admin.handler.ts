import { Bot, InlineKeyboard } from "grammy";
import { adminService } from "../../services/admin.service";
import type { UserEditState } from "../../services/admin.service";
import { chatService } from "../../services/chat.service";
import { LearningRepo } from "../../database/repositories/learning.repo";
import { isAdmin } from "../middleware/auth";

type StoredUserEditState = UserEditState & {
  timer: NodeJS.Timeout;
};

const USER_STATE_TTL_MS = 5 * 60 * 1000;
const TELEGRAM_ID_PATTERN = /^\d+$/;
const userStates = new Map<number, StoredUserEditState>();

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getValidTelegramId(value: unknown) {
  if (typeof value !== "string" || !TELEGRAM_ID_PATTERN.test(value)) {
    return null;
  }

  try {
    BigInt(value);
    return value;
  } catch {
    return null;
  }
}

async function answerInvalidCallback(ctx: any) {
  await ctx.answerCallbackQuery({ text: "Invalid callback data", show_alert: true });
}

function clearUserState(adminId: number) {
  const existingState = userStates.get(adminId);
  if (existingState) {
    clearTimeout(existingState.timer);
  }

  userStates.delete(adminId);
}

function setUserState(adminId: number, state: UserEditState) {
  clearUserState(adminId);
  const timer = setTimeout(() => {
    userStates.delete(adminId);
  }, USER_STATE_TTL_MS);

  userStates.set(adminId, { ...state, timer });
}

function buildDashboardMenu() {
  return new InlineKeyboard()
    .text("⚙️ Глобальные настройки", "menu_global")
    .row()
    .text("👥 Юзеры", "menu_users")
    .row()
    .text("📊 Статистика", "admin_stats")
    .row()
    .text("🧠 Хотира (Фактлар)", "admin_memory")
    .row()
    .text("📢 Оммавий хабар (Рассылка)", "admin_broadcast");
}

function buildUsersMenu(users: Array<{ telegramId: bigint; firstName: string | null; isTracking: boolean }>) {
  const keyboard = new InlineKeyboard();

  for (const user of users) {
    const trackIcon = user.isTracking ? "🟢" : "";
    const label = `👤 ${user.firstName ?? "Без имени"} ${trackIcon}`.trim();
    keyboard.text(label, `user_profile:${user.telegramId.toString()}`).row();
  }

  keyboard.text("⬅️ Назад", "menu_back");
  return keyboard;
}

function buildUserProfileMenu(telegramId: string, isTracking: boolean, isManualMode: boolean) {
  const trackLabel = isTracking ? "🔕 Выкл слежение" : "🔔 Вкл слежение";
  const aiLabel = isManualMode ? "🤖 Вкл ИИ" : "🤖 Выкл ИИ";

  return new InlineKeyboard()
    .text(trackLabel, `toggle_track:${telegramId}`)
    .text(aiLabel, `toggle_manual:${telegramId}`)
    .row()
    .text("✍️ Написать от Дианы", `send_manual_msg:${telegramId}`)
    .row()
    .text("🎭 Изменить характер", `change_persona:${telegramId}`)
    .row()
    .text("📊 Обновить досье", `refresh_summary:${telegramId}`)
    .text("📥 Экспорт чата (.txt)", `export_chat:${telegramId}`)
    .row()
    .text("✏️ Изменить промпт", `set_prompt_${telegramId}`)
    .row()
    .text("✏️ Изменить модель", `set_model_${telegramId}`)
    .row()
    .text("🔄 Сбросить настройки", `reset_user_${telegramId}`)
    .row()
    .text("⬅️ Назад к списку", "menu_users");
}

function buildDashboardText(stats: Awaited<ReturnType<typeof adminService.getDashboardStats>>) {
  const model = stats.settings?.currentModel || "llama-3.1-8b-instant";
  const isActive = stats.settings?.isBotActive ?? true;

  return [
    "<b>Diana CRM | Панель управления</b>",
    "",
    `Пользователей: ${stats.usersCount}`,
    `Токенов потрачено: ${stats.totalTokens}`,
    `Глобальная модель: ${escapeHtml(model)}`,
    `Статус ИИ: ${isActive ? "Active" : "Спит"}`,
  ].join("\n");
}

async function showDashboard(ctx: any, mode: "reply" | "edit") {
  const stats = await adminService.getDashboardStats();
  const payload = {
    parse_mode: "HTML" as const,
    reply_markup: buildDashboardMenu(),
  };

  if (mode === "edit") {
    await ctx.editMessageText(buildDashboardText(stats), payload);
    return;
  }

  await ctx.reply(buildDashboardText(stats), payload);
}

async function renderUsersMenu(ctx: any) {
  const users = await adminService.getRecentUsers(15);
  await ctx.editMessageText(
    ["<b>👥 Последние пользователи</b>", "", "Нажмите на пользователя для просмотра карточки:"].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildUsersMenu(users as any),
    }
  );
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getPersonaLabel(mode: string | undefined | null) {
  switch (mode) {
    case "sweet": return "Милая 🥰";
    case "sassy": return "Дерзкая 😈";
    case "cold": return "Холодная ❄️";
    case "auto":
    default:
      return "Авто 🤖";
  }
}

async function renderUserProfile(ctx: any, telegramId: string) {
  const user = await adminService.getUserProfile(telegramId);

  if (!user) {
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({ text: "Пользователь не найден", show_alert: true });
    } else {
      await ctx.reply("Пользователь не найден");
    }
    return;
  }

  const trackingStatus = (user as any).isTracking ? "🟢 Включен" : "🔴 Выключен";
  const aiModeStatus = (user as any).isManualMode
    ? "🔴 Отключен (Ручной режим)"
    : "🟢 Активен";
  const personaLabel = getPersonaLabel((user as any).personaMode);
  const aiSummary = escapeHtml((user as any).aiSummary ?? "Идет сбор данных...");

  const text = [
    `<b>📋 Карточка пользователя</b>`,
    "",
    `👤 <b>Имя:</b> ${escapeHtml(user.firstName ?? "Без имени")}`,
    `🆔 <b>Telegram ID:</b> <code>${user.telegramId.toString()}</code>`,
    `📅 <b>Дата регистрации:</b> ${formatDate(user.createdAt)}`,
    "",
    `🔎 <b>Живой мониторинг:</b> ${trackingStatus}`,
    `🤖 <b>Режим ИИ (Gemini):</b> ${aiModeStatus}`,
    `🎭 <b>Характер (Стиль):</b> ${personaLabel}`,
    "",
    `<b>Токенов потрачено:</b> ${user.tokensUsed}`,
    `<b>Персональная модель:</b> ${escapeHtml(user.personalModel || "Глобальная")}`,
    `<b>Персональный промпт:</b> ${user.personalPrompt ? "✅ Установлен" : "Глобальный"}`,
    "",
    `📝 <b>Краткое досье от Дианы (Gemini):</b>`,
    `<i>${aiSummary}</i>`,
  ].join("\n");

  const payload = {
    parse_mode: "HTML" as const,
    reply_markup: buildUserProfileMenu(telegramId, (user as any).isTracking, (user as any).isManualMode),
  };

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, payload);
  } else {
    await ctx.reply(text, payload);
  }
}

export async function handleStart(ctx: any) {
  await chatService.upsertTelegramUser(ctx);

  if (isAdmin(ctx)) {
    await showDashboard(ctx, "reply");
    return;
  }

  await ctx.reply("Привет! Я ассистент Диана");
}

export async function handleAdmin(ctx: any) {
  if (!isAdmin(ctx)) return;
  await showDashboard(ctx, "reply");
}

export async function handleAdminInputState(ctx: any) {
  if (!ctx.from || !isAdmin(ctx)) return false;

  const state = userStates.get(ctx.from.id);
  if (!state) return false;

  try {
    const text = ctx.message?.text?.trim() || "";

    if (state.action === "waiting_for_prompt" && text) {
      if (!state.telegramId) return true;
      await adminService.setPersonalPrompt(state.telegramId, text);
      await ctx.reply("Промпт сохранен");
      await renderUserProfile(ctx, state.telegramId);
      return true;
    }

    if (state.action === "waiting_for_model" && text) {
      if (!state.telegramId) return true;
      await adminService.setPersonalModel(state.telegramId, text);
      await ctx.reply("Модель сохранена");
      await renderUserProfile(ctx, state.telegramId);
      return true;
    }

    if (state.action === "waiting_for_manual_message" && text) {
      if (!state.telegramId) return true;
      try {
        const result = await adminService.sendManualMessage(state.telegramId, text);
        if (!result) {
          await ctx.reply("❌ Пользователь не найден.");
          return true;
        }

        // Отправляем текст юзеру через Userbot (от имени Дианы)
        const { userbotClient } = require("../../userbot/client");
        await userbotClient.sendMessage(result.targetTelegramId, { message: text });
        
        await ctx.reply(`✅ Сообщение отправлено пользователю <code>${state.telegramId}</code>`, {
          parse_mode: "HTML",
        });
      } catch (sendError) {
        console.error("Send manual message error:", sendError);
        await ctx.reply("❌ Ошибка при отправке сообщения. Возможно, пользователь заблокировал Диану.");
      }
      return true;
    }

    if (state.action === "waiting_for_memory_rule" && text) {
      await LearningRepo.saveLearnedRule(text);
      await ctx.reply(`✅ Факт успешно добавлен в память Дианы:\n"<i>${text}</i>"`, {
        parse_mode: "HTML",
        reply_markup: new InlineKeyboard().text("⬅️ Вернуться в память", "admin_memory")
      });
      return true;
    }

    if (state.action === "waiting_for_broadcast") {
      // Это может быть текст или фото, поэтому берем весь message
      if (!ctx.message) return true;

      // Получаем всех пользователей
      const users = await adminService.getAllUsersForBroadcast();
      if (users.length === 0) {
        await ctx.reply("❌ Нет пользователей для рассылки.");
        return true;
      }

      await ctx.reply(`🚀 Начинаю рассылку для ${users.length} пользователей...`);

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          // Используем copyMessage для пересылки любого формата (текст, фото и т.д.)
          await ctx.api.copyMessage(Number(user.telegramId), ctx.chat.id, ctx.message.message_id);
          successCount++;
        } catch (e) {
          // Ошибка отправки (например, юзер заблокировал бота)
          errorCount++;
        }
        // Задержка 50ms (макс 20 сообщ/сек) для предотвращения Flood Wait
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      await ctx.reply(
        `✅ <b>Рассылка завершена!</b>\n\n` +
        `Успешно отправлено: ${successCount}\n` +
        `Ошибок/Блокировок: ${errorCount}`,
        { parse_mode: "HTML", reply_markup: buildDashboardMenu() }
      );
      return true;
    }

    return false;
  } finally {
    clearUserState(ctx.from.id);
  }
}

export function registerAdminHandlers(bot: Bot<any>) {
  bot.command("start", async (ctx) => {
    await handleStart(ctx);
  });
  bot.command("admin", async (ctx) => {
    await handleAdmin(ctx);
  });

  bot.callbackQuery("menu_back", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    await showDashboard(ctx, "reply");
  });

  bot.callbackQuery("menu_global", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const stats = await adminService.getDashboardStats();
    const isNotificationsEnabled = stats.settings?.isNotificationsEnabled ?? true;
    
    const notifText = isNotificationsEnabled ? "🔕 Выключить уведомления" : "🔔 Включить уведомления";
    
    const keyboard = new InlineKeyboard()
      .text(notifText, "toggle_global_notifications").row()
      .text("⬅️ Назад", "menu_back");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("<b>⚙️ Глобальные настройки</b>\n\nУправление глобальными уведомлениями (отключает все логи в админку и группу).", {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  });

  bot.callbackQuery("toggle_global_notifications", async (ctx) => {
    if (!isAdmin(ctx)) return;
    try {
      const updated = await adminService.toggleNotifications();
      const statusText = updated.isNotificationsEnabled ? "🔔 Глобальные уведомления включены" : "🔕 Глобальные уведомления выключены";
      await ctx.answerCallbackQuery({ text: statusText, show_alert: true });
      
      const notifText = updated.isNotificationsEnabled ? "🔕 Выключить уведомления" : "🔔 Включить уведомления";
      const keyboard = new InlineKeyboard()
        .text(notifText, "toggle_global_notifications").row()
        .text("⬅️ Назад", "menu_back");

      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
    } catch (error) {
       await ctx.answerCallbackQuery({ text: "Ошибка", show_alert: true });
    }
  });

  bot.callbackQuery("menu_users", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    await renderUsersMenu(ctx);
  });

  bot.callbackQuery("menu_stats", async (ctx) => {
    if (!isAdmin(ctx)) return;
    const stats = await adminService.getDashboardStats();
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      [
        "<b>Подробная статистика</b>",
        "",
        `Пользователей: ${stats.usersCount}`,
        `Токенов потрачено: ${stats.totalTokens}`,
        `Глобальная модель: ${escapeHtml(stats.settings?.currentModel || "llama-3.1-8b-instant")}`,
        `Статус ИИ: ${(stats.settings?.isBotActive ?? true) ? "Active" : "Спит"}`,
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: buildDashboardMenu(),
      }
    );
  });

  bot.callbackQuery("admin_broadcast", async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    setUserState(ctx.from.id, { action: "waiting_for_broadcast" });
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "📢 <b>Режим рассылки</b>\n\n" +
      "Введите текст рассылки или отправьте фото с описанием.\n" +
      "<i>Для отмены отправьте /cancel</i>",
      { parse_mode: "HTML" }
    );
  });

  // === Statistics Dashboard ===
  bot.callbackQuery("admin_stats", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    
    const stats = await adminService.getDashboardStatsDetails();
    
    let topUsersText = "Нет данных";
    if (stats.topUsers.length > 0) {
      topUsersText = stats.topUsers
        .map((u, i) => `${i + 1}. ${u.firstName} (${u.messageCount} сообщ.)`)
        .join("\n");
    }

    const text = [
      "<b>📊 Статистика Бота:</b>",
      "",
      `👥 Всего юзеров: ${stats.usersCount}`,
      `💬 Сообщений сегодня: ${stats.messages24h}`,
      "",
      "🔥 <b>Топ-3 активных юзера:</b>",
      topUsersText
    ].join("\n");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("⬅️ Назад в меню", "menu_back")
    });
  });

  // === Global Memory ===
  bot.callbackQuery("admin_memory", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    
    const rules = await LearningRepo.getActiveRules();
    
    let text = "<b>🧠 Глобальная Память Дианы (Факты)</b>\n\n";
    if (rules.length === 0) {
      text += "<i>Пока нет активных фактов.</i>";
    } else {
      rules.forEach((r, idx) => {
        text += `${idx + 1}. ${r.ruleText}\n`;
      });
    }

    const keyboard = new InlineKeyboard()
      .text("➕ Добавить факт", "add_memory_rule").row()
      .text("🗑 Очистить память", "clear_memory_rules").row()
      .text("⬅️ Назад в меню", "menu_back");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard
    });
  });

  bot.callbackQuery("add_memory_rule", async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    setUserState(ctx.from.id, { action: "waiting_for_memory_rule" });
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "Введите новый факт, который Диана должна запомнить.\nНапример: <i>Я сейчас в Дубае, у меня хорошее настроение.</i>\n\nДля отмены нажмите /cancel",
      { parse_mode: "HTML" }
    );
  });

  bot.callbackQuery("clear_memory_rules", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await LearningRepo.clearMemoryRules();
    await ctx.answerCallbackQuery({ text: "Память очищена!", show_alert: true });
    
    // Перерисовываем меню памяти
    const keyboard = new InlineKeyboard()
      .text("➕ Добавить факт", "add_memory_rule").row()
      .text("🗑 Очистить память", "clear_memory_rules").row()
      .text("⬅️ Назад в меню", "menu_back");

    await ctx.editMessageText(
      "<b>🧠 Глобальная Память Дианы (Факты)</b>\n\n<i>Пока нет активных фактов.</i>", 
      { parse_mode: "HTML", reply_markup: keyboard }
    );
  });

  // user_profile:<telegramId> — новый формат с двоеточием
  bot.callbackQuery(/^user_profile:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
    await renderUserProfile(ctx, telegramId);
  });

  // Обратная совместимость: старый формат user_profile_<telegramId>
  bot.callbackQuery(/^user_profile_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }
    await ctx.answerCallbackQuery();
    await renderUserProfile(ctx, telegramId);
  });

  // === Toggle Tracking ===
  bot.callbackQuery(/^toggle_track:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    try {
      const updated = await adminService.toggleTracking(telegramId);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: "Пользователь не найден", show_alert: true });
        return;
      }

      const statusText = (updated as any).isTracking ? "🟢 Слежение включено" : "🔴 Слежение выключено";
      await ctx.answerCallbackQuery({ text: statusText });
      await renderUserProfile(ctx, telegramId);
    } catch (error) {
      console.error("Toggle tracking error:", error);
      await ctx.answerCallbackQuery({ text: "❌ Ошибка при переключении", show_alert: true });
    }
  });

  // === Refresh AI Dossier ===
  bot.callbackQuery(/^refresh_summary:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    try {
      // Сразу отвечаем, чтобы кнопка не зависала — Gemini может долго думать
      await ctx.answerCallbackQuery({ text: "⏳ Генерирую досье... Пожалуйста, подождите" });

      const summary = await adminService.refreshUserDossier(telegramId);

      if (!summary) {
        await ctx.reply("❌ Ошибка при генерации досье. Проверьте GEMINI_API_KEY.");
        return;
      }

      // Обновляем карточку с новым досье
      await renderUserProfile(ctx, telegramId);
    } catch (error) {
      console.error("Refresh summary error:", error);
      await ctx.reply("❌ Ошибка при генерации досье.");
    }
  });

  // === Export Chat ===
  bot.callbackQuery(/^export_chat:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    try {
      await ctx.answerCallbackQuery({ text: "📤 Готовлю файл..." });

      const result = await adminService.exportUserChat(telegramId);

      if (!result) {
        await ctx.reply("❌ Нет сообщений для экспорта или пользователь не найден.");
        return;
      }

      await ctx.replyWithDocument(
        { source: result.buffer, filename: result.filename },
        { caption: `📥 Экспорт чата | пользователь <code>${telegramId}</code>`, parse_mode: "HTML" }
      );
    } catch (error) {
      console.error("Export chat error:", error);
      await ctx.reply("❌ Ошибка при экспорте чата.");
    }
  });

  // === Toggle Manual Mode (AI on/off) ===
  bot.callbackQuery(/^toggle_manual:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    try {
      const updated = await adminService.toggleManualMode(telegramId);
      if (!updated) {
        await ctx.answerCallbackQuery({ text: "Пользователь не найден", show_alert: true });
        return;
      }

      const statusText = (updated as any).isManualMode
        ? "🔴 ИИ отключен — ручной режим"
        : "🟢 ИИ включен";
      await ctx.answerCallbackQuery({ text: statusText });
      await renderUserProfile(ctx, telegramId);
    } catch (error) {
      console.error("Toggle manual mode error:", error);
      await ctx.answerCallbackQuery({ text: "❌ Ошибка при переключении", show_alert: true });
    }
  });

  // === Send Manual Message ===
  bot.callbackQuery(/^send_manual_msg:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    setUserState(ctx.from.id, { action: "waiting_for_manual_message", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `✍️ Напишите сообщение, которое будет отправлено пользователю <code>${telegramId}</code> от имени Дианы.\n\n` +
      `<i>Следующее текстовое сообщение будет отправлено как ответ Дианы.</i>`,
      { parse_mode: "HTML" }
    );
  });

  // === Persona Mode ===
  bot.callbackQuery(/^change_persona:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }

    const keyboard = new InlineKeyboard()
      .text("🤖 Авто (По умолчанию)", `set_persona:${telegramId}:auto`).row()
      .text("🥰 Милая и Романтичная", `set_persona:${telegramId}:sweet`).row()
      .text("😈 Дерзкая и Игривая", `set_persona:${telegramId}:sassy`).row()
      .text("❄️ Холодная/Обиженная", `set_persona:${telegramId}:cold`).row()
      .text("⬅️ Назад к профилю", `user_profile:${telegramId}`);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText("<b>🎭 Выберите характер для Дианы:</b>", {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  bot.callbackQuery(/^set_persona:(.+):(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    const mode = ctx.match?.[2];
    
    if (!telegramId || !mode) {
      await answerInvalidCallback(ctx);
      return;
    }

    try {
      await adminService.setPersonaMode(telegramId.toString(), mode);
      await ctx.answerCallbackQuery({ text: "Характер успешно изменен!" });
      await renderUserProfile(ctx, telegramId.toString());
    } catch (e) {
      console.error("Set persona error:", e);
      await ctx.answerCallbackQuery({ text: "Ошибка при смене характера", show_alert: true });
    }
  });

  bot.callbackQuery(/^reset_user_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }
    await adminService.resetUserSettings(telegramId);
    await ctx.answerCallbackQuery({ text: "Настройки сброшены" });
    await renderUserProfile(ctx, telegramId);
  });

  bot.callbackQuery(/^set_prompt_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }
    setUserState(ctx.from.id, { action: "waiting_for_prompt", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новый промпт для пользователя ${telegramId}`);
  });

  bot.callbackQuery(/^set_model_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    const telegramId = getValidTelegramId(ctx.match?.[1]);
    if (!telegramId) {
      await answerInvalidCallback(ctx);
      return;
    }
    setUserState(ctx.from.id, { action: "waiting_for_model", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новую модель для пользователя ${telegramId}`);
  });
}
