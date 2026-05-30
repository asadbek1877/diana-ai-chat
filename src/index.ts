import http from "http";
import dotenv from "dotenv";
import { Bot, Context, InlineKeyboard } from "grammy";
import { prisma } from "./db";
import { askDiana } from "./ai/groq";

dotenv.config();

const botToken = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID);
const initialPort = Number(process.env.PORT || 3000);

if (!botToken) {
  throw new Error("BOT_TOKEN .env файли ичида топилмади!");
}

if (!Number.isFinite(adminId) || adminId <= 0) {
  throw new Error("ADMIN_ID .env файли ичида тўғри топилмади!");
}

const bot = new Bot(botToken);
let startAppPromise: Promise<void> | null = null;

type UserEditState = {
  action: "waiting_for_prompt" | "waiting_for_model";
  telegramId: string;
};

const activeUsers = new Set<string>();
const userStates = new Map<number, UserEditState>();

// ==========================================
// 🛠 ЁРДАМЧИ ФУНКЦИЯЛАР
// ==========================================

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

function buildDashboardMenu() {
  return new InlineKeyboard()
    .text("⚙️ Глобальные настройки", "menu_global")
    .row()
    .text("👥 Управление юзерами", "menu_users")
    .row()
    .text("📊 Подробная статистика", "menu_stats");
}

function buildBackMenu() {
  return new InlineKeyboard().text("🔙 Назад в меню", "menu_back");
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

function isTextMessage(ctx: Context) {
  return Boolean(ctx.message && "text" in ctx.message && typeof ctx.message.text === "string");
}

// ==========================================
// 📊 ДАШБОРД ВА БАЗА МАНТИҒИ
// ==========================================

async function getDashboardStats() {
  const [usersCount, tokensResult, settings] = await Promise.all([
    prisma.user.count(),
    prisma.user.aggregate({
      _sum: {
        tokensUsed: true,
      },
    }),
    prisma.settings.findFirst(),
  ]);

  return {
    usersCount,
    totalTokens: tokensResult._sum.tokensUsed ?? 0,
    settings: settings
      ? {
          currentModel: settings.currentModel?.trim() || "llama-3.1-8b-instant",
          isBotActive: settings.isBotActive,
        }
      : null,
  };
}

async function sendMainDashboard(ctx: Context) {
  const stats = await getDashboardStats();
  const model = stats.settings?.currentModel || "llama-3.1-8b-instant";
  const isActive = stats.settings?.isBotActive ?? true;
  const statusText = isActive ? "Active" : "Спит";

  await ctx.reply(
    [
      "<b>🎛 Diana CRM | Панель управления</b>",
      "",
      `👥 Всего юзеров: ${stats.usersCount}`,
      `🪙 Потрачено токенов: ${stats.totalTokens}`,
      `🤖 Глобальная модель: ${escapeHtml(model)}`,
      `🟢 Статус ИИ: ${statusText}`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildDashboardMenu(),
    }
  );
}

async function renderDashboard(ctx: Context) {
  const stats = await getDashboardStats();
  const model = stats.settings?.currentModel || "llama-3.1-8b-instant";
  const isActive = stats.settings?.isBotActive ?? true;
  const statusText = isActive ? "Active" : "Спит";

  await ctx.editMessageText(
    [
      "<b>🎛 Diana CRM | Панель управления</b>",
      "",
      `👥 Всего юзеров: ${stats.usersCount}`,
      `🪙 Потрачено токенов: ${stats.totalTokens}`,
      `🤖 Глобальная модель: ${escapeHtml(model)}`,
      `🟢 Статус ИИ: ${statusText}`,
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildDashboardMenu(),
    }
  );
}

async function renderUsersMenu(ctx: Context) {
  const users = await prisma.user.findMany({
    take: 10,
    orderBy: {
      tokensUsed: "desc",
    },
  });

  await ctx.editMessageText(
    [
      "👥 <b>Топ-10 активных пользователей:</b>",
      "",
      "Выберите пользователя из списка ниже",
    ].join("\n"),
    {
      parse_mode: "HTML",
      reply_markup: buildUsersMenu(users),
    }
  );
}

async function renderUserProfile(ctx: Context, telegramId: string) {
  const user = await prisma.user.findUnique({
    where: {
      telegramId: BigInt(telegramId),
    },
  });

  if (!user) {
    await ctx.answerCallbackQuery({
      text: "Пользователь не найден",
      show_alert: true,
    });
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

async function resetUserSettings(ctx: Context, telegramId: string) {
  await prisma.user.update({
    where: {
      telegramId: BigInt(telegramId),
    },
    data: {
      personalModel: null,
      personalPrompt: null,
    },
  });

  await ctx.answerCallbackQuery({ text: "✅ Настройки сброшены на глобальные!" });
  await renderUserProfile(ctx, telegramId);
}

async function activateUser(ctx: Context) {
  if (!ctx.from) return;
  const telegramId = String(ctx.from.id);

  activeUsers.add(telegramId);

  await prisma.user.upsert({
    where: { telegramId: BigInt(telegramId) },
    create: {
      telegramId: BigInt(telegramId),
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
      platform: "TELEGRAM",
    },
    update: {
      username: ctx.from.username ?? null,
      firstName: ctx.from.first_name ?? null,
    },
  });
}

async function handleRegularUserChat(ctx: Context) {
  if (!ctx.from || !isTextMessage(ctx)) {
    return;
  }

  const telegramId = String(ctx.from.id);
  const userMessage = (ctx.message as { text: string }).text.trim();

  if (!activeUsers.has(telegramId)) {
    await activateUser(ctx);
  }

  const user = await prisma.user.findUnique({ where: { telegramId: BigInt(telegramId) } });

  if (!user || user.isBlocked || !userMessage) {
    return;
  }

  const chatHistory = await prisma.chatLog.findMany({
    where: { telegramId: BigInt(telegramId) },
    orderBy: { createdAt: "asc" },
    take: 20,
  });

  console.log(`[ЧАТ] 1. Юзердан хабар келди: "${userMessage}"`);
  console.log("[ЧАТ] 2. Groq AI га сўров кетяпти...");

  try {
    const assistantReply = await askDiana(
      telegramId,
      userMessage,
      chatHistory.map((entry) => ({
        role: entry.role === "diana" ? "assistant" : "user",
        content: entry.content,
      }))
    );

    console.log("[ЧАТ] 3. Groq AI жавоб берди:", assistantReply);
    await ctx.reply(assistantReply);

    Promise.all([
      prisma.chatLog.create({
        data: { telegramId: BigInt(telegramId), userId: user.id, role: "user", content: userMessage }
      }),
      prisma.chatLog.create({
        data: { telegramId: BigInt(telegramId), userId: user.id, role: "diana", content: assistantReply }
      })
    ]).catch((err) => console.error("Фонда базага ёзишда хато:", err));
  } catch (aiError) {
    console.error("❌ [ЧАТ] Groq AI да хатолик юз берди:", aiError);
    await ctx.reply("Кечирасиз, менинг миямда (AI) қандайдир узилиш юз берди 🤕");
  }
}

async function processIncomingText(ctx: Context) {
  try {
    if (!ctx.from || !ctx.message || !("text" in ctx.message) || typeof ctx.message.text !== "string") {
      return;
    }

    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    if (isAdmin(ctx)) {
      const state = userStates.get(ctx.from.id);

      if (state?.action === "waiting_for_prompt") {
        await prisma.user.update({
          where: { telegramId: BigInt(state.telegramId) },
          data: { personalPrompt: text },
        });
        userStates.delete(ctx.from.id);
        await ctx.reply("✅ Промпт пользователя сохранён");
        await renderUserProfile(ctx, state.telegramId);
        return;
      }

      if (state?.action === "waiting_for_model") {
        await prisma.user.update({
          where: { telegramId: BigInt(state.telegramId) },
          data: { personalModel: text },
        });
        userStates.delete(ctx.from.id);
        await ctx.reply("✅ Модель пользователя сохранена");
        await renderUserProfile(ctx, state.telegramId);
        return;
      }
    }

    await handleRegularUserChat(ctx);
  } catch (error) {
    console.error("Детальная ошибка message:text:", error);
    try {
      await ctx.reply("Не удалось обработать сообщение");
    } catch (e) {}
  }
}

// ==========================================
// 🤖 БОТ HANDLER'ЛАРИ (Тўғри кетма-кетликда)
// ==========================================

// 1. Логгер (Энг тепада бўлиши шарт, ҳамма хабарни ушлайди)
bot.use(async (ctx, next) => {
  console.log("📥 Янги хабар/амал келди:", ctx.message?.text || ctx.callbackQuery?.data || "Медиа/Бошқа");
  await next();
});

// 2. Командалар
bot.command("start", async (ctx) => {
  console.log("🟢 1. Телеграмдан /start командаси келди!");
  try {
    await activateUser(ctx); 
    console.log("✅ 2. Базага ёзилди! (activateUser муваффақиятли тугади)");

    if (isAdmin(ctx)) {
      await sendMainDashboard(ctx);
    } else {
      await ctx.reply("Привет! Я ассистент Диана");
    }
  } catch (error) {
    console.error("❌ Детальная ошибка /start:", error);
  }
});

bot.command("admin", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    await sendMainDashboard(ctx);
  } catch (error) {
    console.error("Детальная ошибка /admin:", error);
  }
});

// 3. Callback Queries (Кнопкалар)
bot.callbackQuery("menu_back", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    await sendMainDashboard(ctx);
  } catch (error) {
    console.error("Детальная ошибка menu_back:", error);
  }
});

bot.callbackQuery("menu_global", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery({ text: "Раздел в разработке 🛠", show_alert: true });
  } catch (error) {
    console.error("Детальная ошибка menu_global:", error);
  }
});

bot.callbackQuery("menu_users", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    await ctx.answerCallbackQuery();
    await renderUsersMenu(ctx);
  } catch (error) {
    console.error("Детальная ошибка menu_users:", error);
  }
});

bot.callbackQuery("menu_stats", async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    const stats = await getDashboardStats();
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
  } catch (error) {
    console.error("Детальная ошибка menu_stats:", error);
  }
});

bot.callbackQuery(/^user_profile_(.+)$/, async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    await ctx.answerCallbackQuery();
    await renderUserProfile(ctx, telegramId);
  } catch (error) {
    console.error("Детальная ошибка user_profile:", error);
  }
});

bot.callbackQuery(/^reset_user_(.+)$/, async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    await resetUserSettings(ctx, telegramId);
  } catch (error) {
    console.error("Детальная ошибка reset_user:", error);
  }
});

bot.callbackQuery(/^set_prompt_(.+)$/, async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;
    
    userStates.set(ctx.from.id, { action: "waiting_for_prompt", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новый промпт для пользователя ${telegramId}`);
  } catch (error) {
    console.error("Детальная ошибка set_prompt:", error);
  }
});

bot.callbackQuery(/^set_model_(.+)$/, async (ctx) => {
  try {
    if (!isAdmin(ctx)) return;
    const telegramId = ctx.match?.[1];
    if (!telegramId) return;

    userStates.set(ctx.from.id, { action: "waiting_for_model", telegramId });
    await ctx.answerCallbackQuery();
    await ctx.reply(`Отправьте новую модель для пользователя ${telegramId}`);
  } catch (error) {
    console.error("Детальная ошибка set_model:", error);
  }
});

// 4. Матнли хабарларни ушлаш (Доим энг пастда бўлиши керак)
bot.on("message:text", (ctx) => {
  void processIncomingText(ctx);
});

// 5. Глобал хатоларни ушлаш
bot.catch((error) => {
  console.error("Глобальная ошибка бота:", error.error);
});

// ==========================================
// 🚀 СЕРВЕРНИ ИШГА ТУШИРИШ
// ==========================================

function startHealthServer(portToTry: number) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Diana CRM dashboard is alive!\n");
  });

  server.on("error", (e: any) => {
    if (e.code === "EADDRINUSE") {
      console.log(`[System] Порт ${portToTry} банд, ${portToTry + 1} га ўтилмоқда...`);
      setTimeout(() => {
        server.close();
        startHealthServer(portToTry + 1);
      }, 500);
    }
  });

  server.listen(portToTry, () => {
    console.log(`[System] Health server running on ${portToTry}`);
  });
}

async function startApp() {
  if (startAppPromise) {
    return startAppPromise;
  }

  startAppPromise = (async () => {
    try {
      startHealthServer(initialPort);

      console.log("[System] Diana CRM dashboard is starting...");

      // 🧹 1. ТЕЛЕГРАМНИ ТОЗАЛАШ
      // ВАҚТИНЧА ЎЧИРИБ ҚЎЙИЛДИ: Локалда без VPN ишлаганда краш бўлмаслиги учун. 
      // Агар серверга (Render) юкласангиз, бу комментни олиб ташлашингиз мумкин.
      await bot.api.deleteWebhook({ drop_pending_updates: true });
      console.log("[System] Webhook текшируви ўтказиб юборилди!");

      // 2. Менюни ўрнатиш
      await bot.api.setMyCommands([
        { command: "start", description: "Очиш / Панель управления" }
      ]);

      // 3. Ботни ишга тушириш
      await bot.start({
        onStart: (botInfo) => {
          console.log(`[System] Bot connected as @${botInfo.username}`);
        },
      });
    } catch (error) {
      console.error("Детальная ошибка запуска:", error);
      process.exit(1);
    }
  })();

  return startAppPromise;
}

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

void startApp();