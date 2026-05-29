import http from "http";
import dotenv from "dotenv";
import { Bot, Context, InlineKeyboard } from "grammy";
import { prisma } from "./db";
import { getDianaPrompt } from "./ai/prompt";

dotenv.config();
// Ёки бундай ёзсанг ҳам бўлади:
// import 'dotenv/config';

dotenv.config();

const botToken = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID);
const port = Number(process.env.PORT || 3000);

if (!botToken) throw new Error("BOT_TOKEN .env файли ичида топилмади!");
if (!Number.isFinite(adminId) || adminId <= 0) throw new Error("ADMIN_ID .env файли ичида тўғри топилмади!");

const bot = new Bot(botToken);

type AdminAction = "waiting_for_model" | "waiting_for_prompt";
const pendingAdminAction = new Map<number, AdminAction>();

function isAdmin(ctx: Context) {
  return ctx.from?.id === adminId;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildMainMenu(isActive: boolean) {
  return new InlineKeyboard()
    .text("⚙️ Сменить модель", "admin_change_model")
    .row()
    .text("📝 Изменить системный промпт", "admin_change_prompt")
    .row()
    .text(isActive ? "🛑 Выкл. основной ИИ" : "🟢 Вкл. основной ИИ", "admin_toggle_ai")
    .row()
    .text("📊 Статистика базы данных", "admin_stats");
}

async function getOrCreateSettings() {
  const fallbackModel = "llama-3.1-8b-instant";
  const fallbackPrompt = getDianaPrompt();

  const existing = await prisma.settings.findFirst();
  if (existing) {
    return {
      ...existing,
      currentModel: existing.currentModel?.trim() || fallbackModel,
      systemPrompt: existing.systemPrompt?.trim() || fallbackPrompt,
    };
  }

  return prisma.settings.create({
    data: {
      currentModel: fallbackModel,
      systemPrompt: fallbackPrompt,
      isBotActive: true,
    },
  });
}

async function showMainMenu(ctx: Context) {
  const settings = await getOrCreateSettings();
  const statusText = settings.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";

  await ctx.reply(
    [
      "<b>🛠 Панель управления Дианой</b>",
      "",
      `Статус ИИ: ${statusText}`,
      `Модель: ${escapeHtml(settings.currentModel)}`,
      "",
      "Выберите действие в меню ниже",
    ].join("\n"),
    { parse_mode: "HTML", reply_markup: buildMainMenu(settings.isBotActive) }
  );
}

export async function getRecentSpyLogs(limit = 20) {
  return prisma.chatLog.findMany({ orderBy: { createdAt: "desc" }, take: limit });
}

async function loadDashboardStats() {
  const [settings, usersCount, messagesCount, logsCount] = await Promise.all([
    getOrCreateSettings(),
    prisma.user.count(),
    prisma.message.count(),
    prisma.chatLog.count(),
  ]);

  return { settings, usersCount, messagesCount, logsCount };
}

bot.command("start", async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    await showMainMenu(ctx);
  } catch (error) {
    console.error("Детальная ошибка:", error);
    await ctx.reply("Не удалось открыть меню управления");
  }
});

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return;
  try {
    await showMainMenu(ctx);
  } catch (error) {
    console.error("Детальная ошибка:", error);
    await ctx.reply("Не удалось открыть меню управления");
  }
});

bot.callbackQuery("admin_change_model", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    pendingAdminAction.set(ctx.from.id, "waiting_for_model");
    await ctx.answerCallbackQuery();
    await ctx.reply("Отправьте новую модель текстом");
  } catch (error) {
    console.error("Детальная ошибка:", error);
  }
});

bot.callbackQuery("admin_change_prompt", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    pendingAdminAction.set(ctx.from.id, "waiting_for_prompt");
    await ctx.answerCallbackQuery();
    await ctx.reply("Отправьте новый промпт текстом");
  } catch (error) {
    console.error("Детальная ошибка:", error);
  }
});

bot.callbackQuery("admin_toggle_ai", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;

    const settings = await getOrCreateSettings();
    await prisma.settings.update({
      where: { id: settings.id },
      data: { isBotActive: !settings.isBotActive },
    });

    await ctx.answerCallbackQuery({ text: settings.isBotActive ? "ИИ выключен" : "ИИ включен" });
    await showMainMenu(ctx);
  } catch (error) {
    console.error("Детальная ошибка:", error);
    await ctx.answerCallbackQuery({ text: "Не удалось переключить ИИ", show_alert: true });
  }
});

bot.callbackQuery("admin_stats", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;

    const stats = await loadDashboardStats();
    const activeText = stats.settings.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";

    await ctx.answerCallbackQuery();
    await ctx.reply(
      [
        "<b>📊 Статистика базы данных</b>",
        "",
        `Пользователей: ${stats.usersCount}`,
        `Сообщений: ${stats.messagesCount}`,
        `Spy log записей: ${stats.logsCount}`,
        `Статус ИИ: ${activeText}`,
        `Модель: ${escapeHtml(stats.settings.currentModel)}`,
      ].join("\n"),
      { parse_mode: "HTML" }
    );
  } catch (error) {
    console.error("Детальная ошибка:", error);
    await ctx.answerCallbackQuery({ text: "Не удалось загрузить статистику", show_alert: true });
  }
});

bot.on("message:text", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;

    const text = ctx.message.text.trim();
    if (!text) return;

    const pendingAction = pendingAdminAction.get(ctx.from!.id);

    if (pendingAction === "waiting_for_prompt") {
      const settings = await getOrCreateSettings();
      await prisma.settings.update({ where: { id: settings.id }, data: { systemPrompt: text } });
      pendingAdminAction.delete(ctx.from!.id);
      await ctx.reply("Промпт сохранён");
      await showMainMenu(ctx);
      return;
    }

    if (pendingAction === "waiting_for_model") {
      const settings = await getOrCreateSettings();
      await prisma.settings.update({ where: { id: settings.id }, data: { currentModel: text } });
      pendingAdminAction.delete(ctx.from!.id);
      await ctx.reply("Модель сохранена");
      await showMainMenu(ctx);
      return;
    }

    await ctx.reply("Используйте меню управления: /start");
  } catch (error) {
    console.error("Детальная ошибка:", error);
    try {
      await ctx.reply("Не удалось обработать сообщение");
    } catch (replyError) {
      console.error("Детальная ошибка:", replyError);
    }
  }
});

bot.catch((error) => {
  console.error("Детальная ошибка:", error.error);
});

async function startApp() {
  try {
    http
      .createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Diana admin panel is alive!\n");
      })
      .listen(port, () => {
        console.log(`[System] Health server running on ${port}`);
      });

    console.log("[System] Diana admin panel is starting...");

    await bot.start({
      onStart: (botInfo) => {
        console.log(`[System] Bot connected as @${botInfo.username}`);
      },
    });
  } catch (error) {
    console.error("Детальная ошибка:", error);
    process.exit(1);
  }
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

startApp();