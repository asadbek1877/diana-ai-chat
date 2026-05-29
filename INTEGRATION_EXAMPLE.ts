/**
 * 🎯 ПРИМЕР ИНТЕГРАЦИИ ВСЕХ МОДУЛЕЙ В BOT/INDEX.TS
 * 
 * Это файл-ориентир показывает, как использовать новые модули
 * Скопируйте этот код в ваш bot/index.ts
 */

import { Bot } from "grammy";
import { session } from "grammy";
import { askDiana } from "../ai/openrouter";
import {
  handleAdminCommand,
  handleChangeModel,
  handleChangePrompt,
  handleToggleBot,
  handleStats,
  getAdminState,
  clearAdminState
} from "../admin/commandCenter";
import {
  handleUserMessage,
  ensureUserExists,
  getUserChatHistory
} from "../logger/chatLogger";
import dotenv from "dotenv";

dotenv.config();

export const bot = new Bot(process.env.BOT_TOKEN || "");

// ============================================
// 🛠️ MIDDLEWARE
// ============================================

// Session middleware для хранения состояния пользователя
bot.use(session());

// ============================================
// 🛡️ АДМИН КОМАНДЫ
// ============================================

/**
 * /admin - Открыть админ-панель
 */
bot.command("admin", handleAdminCommand);

/**
 * Callback обработчики для кнопок админ-панели
 */
bot.callbackQuery("admin_change_model", handleChangeModel);
bot.callbackQuery("admin_change_prompt", handleChangePrompt);
bot.callbackQuery("admin_toggle_bot", handleToggleBot);
bot.callbackQuery("admin_stats", handleStats);

// ============================================
// 💬 ОБРАБОТКА СООБЩЕНИЙ ПОЛЬЗОВАТЕЛЯ
// ============================================

bot.on("message:text", async (ctx) => {
  if (!ctx.from || !ctx.message?.text) return;

  const ADMIN_ID = Number(process.env.ADMIN_ID);
  const adminState = getAdminState(ctx.from.id);

  // === ПРОВЕРЯЕМ СОСТОЯНИЕ АДМИНИСТРАТОРА ===

  if (adminState?.action === "waitingForModel") {
    const modelName = ctx.message.text?.trim();

    if (!modelName) {
      return ctx.reply("❌ Пожалуйста, введите название модели");
    }

    const success = await (
      await import("../admin/commandCenter")
    ).saveNewModel(modelName);

    if (success) {
      await ctx.reply(`✅ Модель изменена на: ${modelName}`);
    } else {
      await ctx.reply("❌ Ошибка при изменении модели");
    }

    clearAdminState(ctx.from.id);
    return;
  }

  if (adminState?.action === "waitingForPrompt") {
    const prompt = ctx.message.text?.trim();

    if (!prompt) {
      return ctx.reply("❌ Пожалуйста, введите промпт");
    }

    const success = await (
      await import("../admin/commandCenter")
    ).saveNewPrompt(prompt);

    if (success) {
      await ctx.reply("✅ Промпт изменен!");
    } else {
      await ctx.reply("❌ Ошибка при изменении промпта");
    }

    clearAdminState(ctx.from.id);
    return;
  }

  // === ОБЫЧНАЯ ОБРАБОТКА СООБЩЕНИЯ ===

  const userMessage = ctx.message.text;
  const telegramId = String(ctx.from.id);

  try {
    // 1️⃣ Создаем/получаем пользователя в БД
    const user = await ensureUserExists(telegramId, ctx.from.first_name, ctx.from.username);

    if (!user) {
      return ctx.reply("❌ Ошибка при создании профиля");
    }

    // 2️⃣ Получаем историю чата для контекста
    const chatHistory = await getUserChatHistory(user.id, 10);

    // 3️⃣ Отправляем "typing" уведомление
    await ctx.api.sendChatAction(ctx.chat.id, "typing");

    // 4️⃣ Получаем ответ от AI (он проверит Settings автоматически)
    const botResponse = await askDiana(userMessage, chatHistory);

    // 5️⃣ Логируем взаимодействие и уведомляем админа
    await handleUserMessage(ctx, userMessage, botResponse, bot);

    // 6️⃣ Отправляем ответ пользователю
    await ctx.reply(botResponse);
  } catch (error) {
    console.error("Error handling message:", error);
    await ctx.reply("❌ Произошла ошибка при обработке сообщения");
  }
});

// ============================================
// 🎯 КОМАНДЫ ПОЛЬЗОВАТЕЛЯ
// ============================================

bot.command("start", async (ctx) => {
  await ctx.reply(
    "👋 Привет! Я Диана, ваш AI-ассистент.\n\n" +
    "Пишите мне что угодно, я постараюсь помочь! 😊"
  );
});

// ============================================
// 🚀 ЗАПУСК БОТА
// ============================================

export default bot;
