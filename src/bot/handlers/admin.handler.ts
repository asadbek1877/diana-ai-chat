import { Bot, InlineKeyboard } from "grammy";
import { adminService, UserEditState } from "../../services/admin.service";
import { chatService } from "../../services/chat.service";
import { isAdmin } from "../middleware/auth";

const userStates = new Map<number, UserEditState>();

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildDashboardMenu() {
  return new InlineKeyboard()
    .text("⚙️ Глобальные настройки", "menu_global")
    .row()
    .text("👥 Управление юзерами", "menu_users")
    .row()
    .text("📊 Подробная статистика", "menu_stats");
}

function buildUsersMenu(users: Array<{ telegramId: bigint; firstName: string | null; tokensUsed: number }>) {
  const keyboard = new InlineKeyboard();

  for (const user of users) {
    const label = `${user.firstName ?? "Без имени"} | 🪙 ${user.tokensUsed}`;
    keyboard.text(`👤 ${label}`, `user_profile_${user.telegramId.toString()}`).row();
  }

  keyboard.text("🔙 Назад в меню", "menu_back");
  return keyboard;
}

function buildUserProfileMenu(telegramId: string) {
  return new InlineKeyboard()
    .text("📝 Изменить промпт", `set_prompt_${telegramId}`)
    .row()
    .text("🤖 Изменить модель", `set_model_${telegramId}`)
    .row()
    .text("🔄 Сбросить настройки", `reset_user_${telegramId}`)
    .row()
    .text("🔙 К списку юзеров", "menu_users");
}

function buildDashboardText(stats: Awaited<ReturnType<typeof adminService.getDashboardStats>>) {
  const model = stats.settings?.currentModel || "llama-3.1-8b-instant";
  const isActive = stats.settings?.isBotActive ?? true;

  return [
    "<b>🎛 Diana CRM | Панель управления</b>",
    "",
    `👥 Всего юзеров: ${stats.usersCount}`,
    `🪙 Потрачено токенов: ${stats.totalTokens}`,
    `🤖 Глобальная модель: ${escapeHtml(model)}`,
    `🟢 Статус ИИ: ${isActive ? "Active" : "Спит"}`,
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
  const users = await adminService.getTopUsers(10);
  await ctx.editMessageText(
    ["👥 <b>Топ-10 активных пользователей:</b>", "", "Выберите пользователя из списка ниже"].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildUsersMenu(users),
    }
  );
}

async function renderUserProfile(ctx: any, telegramId: string) {
  const user = await adminService.getUserProfile(telegramId);

  if (!user) {
    await ctx.answerCallbackQuery({ text: "Пользователь не найден", show_alert: true });
    return;
  }

  await ctx.editMessageText(
    [
      `👤 <b>Пользователь:</b> ${escapeHtml(user.firstName ?? "Без имени")} (@${escapeHtml(user.username ?? "no_username")})`,
      `🪙 <b>Потрачено токенов:</b> ${user.tokensUsed}`,
      `🤖 <b>Персональная модель:</b> ${escapeHtml(user.personalModel || "🌐 Глобальная")}`,
      `📝 <b>Персональный промпт:</b> ${user.personalPrompt ? "Установлен ✅" : "🌐 Глобальный"}`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildUserProfileMenu(telegramId),
    }
  );
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

export async function handleAdminTextState(ctx: any, text: string) {
  if (!ctx.from || !isAdmin(ctx)) return false;

  const state = userStates.get(ctx.from.id);
  if (!state) return false;

  if (state.action === "waiting_for_prompt") {
    await adminService.setPersonalPrompt(state.telegramId, text);
    userStates.delete(ctx.from.id);
    await ctx.reply("✅ Промпт пользователя сохранён");
    await renderUserProfile(ctx, state.telegramId);
    return true;
  }

  if (state.action === "waiting_for_model") {
    await adminService.setPersonalModel(state.telegramId, text);
    userStates.delete(ctx.from.id);
    await ctx.reply("✅ Модель пользователя сохранена");
    await renderUserProfile(ctx, state.telegramId);
    return true;
  }

  return false;
}

export function registerAdminHandlers(bot: Bot<any>) {
  bot.command("start", (ctx) => void handleStart(ctx));
  bot.command("admin", (ctx) => void handleAdmin(ctx));

  bot.callbackQuery("menu_back", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    await showDashboard(ctx, "reply");
  });

  bot.callbackQuery("menu_global", async (ctx) => {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery({ text: "Раздел в разработке 🛠", show_alert: true });
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
        "<b>📊 Подробная статистика</b>",
        "",
        `👥 Всего юзеров: ${stats.usersCount}`,
        `🪙 Потрачено токенов: ${stats.totalTokens}`,
        `🤖 Глобальная модель: ${escapeHtml(stats.settings?.currentModel || "llama-3.1-8b-instant")}`,
        `🟢 Статус ИИ: ${(stats.settings?.isBotActive ?? true) ? "Active" : "Спит"}`,
      ].join("\n"),
      {
        parse_mode: "HTML",
        reply_markup: buildDashboardMenu(),
      }
    );
  });

  bot.callbackQuery(/^user_profile_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    await ctx.answerCallbackQuery();
    await renderUserProfile(ctx, telegramId);
  });

  bot.callbackQuery(/^reset_user_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    await adminService.resetUserSettings(telegramId);
    await ctx.answerCallbackQuery({ text: "✅ Настройки сброшены на глобальные!" });
    await renderUserProfile(ctx, telegramId);
  });

  bot.callbackQuery(/^set_prompt_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    userStates.set(ctx.from.id, { action: "waiting_for_prompt", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новый промпт для пользователя ${telegramId}`);
  });

  bot.callbackQuery(/^set_model_(.+)$/, async (ctx) => {
    if (!isAdmin(ctx) || !ctx.from) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    userStates.set(ctx.from.id, { action: "waiting_for_model", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новую модель для пользователя ${telegramId}`);
  });
}
