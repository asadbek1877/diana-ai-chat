import { Bot, Context } from "grammy";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ADMIN_ID = Number(process.env.ADMIN_ID);

// Store admin states in memory (in production, use Redis)
const adminStates = new Map<number, { action: string; data?: any }>();

/**
 * 🔑 ОСНОВНАЯ АДМИН-КОМАНДА /admin
 * Показывает админ-панель с кнопками управления ботом
 */
export async function handleAdminCommand(ctx: Context) {
  try {
    // Проверка прав доступа
    if (!ctx.from || ctx.from.id !== ADMIN_ID) {
      return ctx.reply("🚫 Только администратор может использовать эту команду");
    }

    // Получаем текущие настройки
    const settings = await prisma.settings.findFirst();

    const botStatus = settings?.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";
    const modelStatus = `📦 Модель: ${settings?.currentModel || "не установлена"}`;

    await ctx.reply(
      `🛠 **КОМАНДНЫЙ ЦЕНТР ДИАНЫ**\n\n${botStatus}\n${modelStatus}\n\nЧто вы хотите изменить?`,
      {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "⚙️ Сменить модель",
                callback_data: "admin_change_model"
              }
            ],
            [
              {
                text: "📝 Изменить промпт",
                callback_data: "admin_change_prompt"
              }
            ],
            [
              {
                text: `${settings?.isBotActive ? "🛑" : "✅"} Kill Switch`,
                callback_data: "admin_toggle_bot"
              }
            ],
            [
              {
                text: "📊 Статистика",
                callback_data: "admin_stats"
              }
            ]
          ]
        }
      }
    );
  } catch (error) {
    console.error("Admin command error:", error);
    ctx.reply("❌ Ошибка при открытии админ-панели");
  }
}

/**
 * ⚙️ ОБРАБОТЧИК: Смена модели
 */
export async function handleChangeModel(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    adminStates.set(ctx.from.id, { action: "waitingForModel" });

    await ctx.reply(
      "📦 **Доступные модели:**\n\n" +
      "• `deepseek/deepseek-chat:free`\n" +
      "• `qwen/qwen-2-7b-instruct:free`\n" +
      "• `meta-llama/llama-3-8b-instruct:free`\n\n" +
      "Отправьте название модели, которую вы хотите использовать:",
      {
        parse_mode: "HTML"
      }
    );

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Change model error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

/**
 * 📝 ОБРАБОТЧИК: Изменение промпта
 */
export async function handleChangePrompt(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const settings = await prisma.settings.findFirst();
    adminStates.set(ctx.from.id, { action: "waitingForPrompt" });

    await ctx.reply(
      `📝 **Текущий промпт:**\n\n\`\`\`\n${settings?.systemPrompt || "Стандартный промпт"}\n\`\`\`\n\nОтправьте новый промпт:`,
      {
        parse_mode: "HTML"
      }
    );

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Change prompt error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

/**
 * 🛑 ОБРАБОТЧИК: Kill Switch (включить/выключить бота)
 */
export async function handleToggleBot(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const settings = await prisma.settings.findFirst();

    if (!settings) {
      await prisma.settings.create({
        data: {
          isBotActive: false,
          systemPrompt: "Ты Диана, дерзкая и веселая девушка..."
        }
      });
    } else {
      await prisma.settings.update({
        where: { id: settings.id },
        data: { isBotActive: !settings.isBotActive }
      });
    }

    const newSettings = await prisma.settings.findFirst();
    const newStatus = newSettings?.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";

    await ctx.answerCallbackQuery(`Бот теперь ${newStatus}`);
    await ctx.editMessageText(`🛠 Статус бота: ${newStatus}`, {
      reply_markup: undefined
    });
  } catch (error) {
    console.error("Toggle bot error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

/**
 * 📊 ОБРАБОТЧИК: Показать статистику
 */
export async function handleStats(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const totalUsers = await prisma.user.count();
    const todayMessages = await prisma.message.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    const stats = `
📊 **СТАТИСТИКА БОТА**

👥 Всего пользователей: ${totalUsers}
💬 Сообщений сегодня: ${todayMessages}
    `;

    await ctx.answerCallbackQuery("Статистика загружена");
    await ctx.editMessageText(stats.trim(), {
      parse_mode: "HTML",
      reply_markup: undefined
    });
  } catch (error) {
    console.error("Stats error:", error);
    ctx.answerCallbackQuery("❌ Ошибка при загрузке статистики");
  }
}

/**
 * 💾 ОБРАБОТЧИК: Сохранение новой модели
 */
export async function saveNewModel(modelName: string) {
  try {
    const settings = await prisma.settings.findFirst();

    if (!settings) {
      await prisma.settings.create({
        data: {
          currentModel: modelName,
          systemPrompt: "Ты Диана, дерзкая и веселая девушка..."
        }
      });
    } else {
      await prisma.settings.update({
        where: { id: settings.id },
        data: { currentModel: modelName }
      });
    }

    return true;
  } catch (error) {
    console.error("Save model error:", error);
    return false;
  }
}

/**
 * 💾 ОБРАБОТЧИК: Сохранение нового промпта
 */
export async function saveNewPrompt(prompt: string) {
  try {
    const settings = await prisma.settings.findFirst();

    if (!settings) {
      await prisma.settings.create({
        data: {
          systemPrompt: prompt,
          currentModel: "deepseek/deepseek-chat:free"
        }
      });
    } else {
      await prisma.settings.update({
        where: { id: settings.id },
        data: { systemPrompt: prompt }
      });
    }

    return true;
  } catch (error) {
    console.error("Save prompt error:", error);
    return false;
  }
}

/**
 * 🔍 ПОЛУЧИТЬ ТЕКУЩЕЕ СОСТОЯНИЕ АДМИНА
 */
export function getAdminState(adminId: number) {
  return adminStates.get(adminId);
}

/**
 * 🗑️ ОЧИСТИТЬ СОСТОЯНИЕ АДМИНА
 */
export function clearAdminState(adminId: number) {
  adminStates.delete(adminId);
}
