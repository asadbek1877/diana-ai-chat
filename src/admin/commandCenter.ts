import { Context } from "grammy";
import { env } from "../config/env";
import { messageRepo } from "../database/repositories/message.repo";
import { settingsRepo } from "../database/repositories/settings.repo";
import { userRepo } from "../database/repositories/user.repo";

const ADMIN_ID = env.ADMIN_ID;
type AdminState = {
  action: string;
  data?: any;
};

type StoredAdminState = AdminState & {
  timer: NodeJS.Timeout;
};

const ADMIN_STATE_TTL_MS = 5 * 60 * 1000;
const adminStates = new Map<number, StoredAdminState>();

function setAdminState(adminId: number, state: AdminState) {
  clearAdminState(adminId);
  const timer = setTimeout(() => {
    adminStates.delete(adminId);
  }, ADMIN_STATE_TTL_MS);

  adminStates.set(adminId, { ...state, timer });
}

export async function handleAdminCommand(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) {
      return ctx.reply("🚫 Только администратор может использовать эту команду");
    }

    const settings = await settingsRepo.getSettings();
    const botStatus = settings?.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";
    const modelStatus = `📦 Модель: ${settings?.currentModel || "не установлена"}`;

    await ctx.reply(`🛠 **КОМАНДНЫЙ ЦЕНТР ДИАНЫ**\n\n${botStatus}\n${modelStatus}\n\nЧто вы хотите изменить?`, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "⚙️ Сменить модель", callback_data: "admin_change_model" }],
          [{ text: "📝 Изменить промпт", callback_data: "admin_change_prompt" }],
          [{ text: `${settings?.isBotActive ? "🛑" : "✅"} Kill Switch`, callback_data: "admin_toggle_bot" }],
          [{ text: "📊 Статистика", callback_data: "admin_stats" }],
        ],
      },
    });
  } catch (error) {
    console.error("Admin command error:", error);
    ctx.reply("❌ Ошибка при открытии админ-панели");
  }
}

export async function handleChangeModel(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    setAdminState(ctx.from.id, { action: "waitingForModel" });

    await ctx.reply(
      "📦 **Доступные модели:**\n\n" +
        "• `deepseek/deepseek-chat:free`\n" +
        "• `qwen/qwen-2-7b-instruct:free`\n" +
        "• `meta-llama/llama-3-8b-instruct:free`\n\n" +
        "Отправьте название модели, которую хотите использовать:",
      { parse_mode: "HTML" }
    );

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Change model error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

export async function handleChangePrompt(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const settings = await settingsRepo.getSettings();
    setAdminState(ctx.from.id, { action: "waitingForPrompt" });

    await ctx.reply(
      `📝 **Текущий промпт:**\n\n\`\`\`\n${settings?.systemPrompt || "Стандартный промпт"}\n\`\`\`\n\nОтправьте новый промпт:`,
      { parse_mode: "HTML" }
    );

    await ctx.answerCallbackQuery();
  } catch (error) {
    console.error("Change prompt error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

export async function handleToggleBot(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const newSettings = await settingsRepo.toggleBot();
    const newStatus = newSettings?.isBotActive ? "✅ ВКЛЮЧЕН" : "🛑 ОТКЛЮЧЕН";

    await ctx.answerCallbackQuery(`Бот теперь ${newStatus}`);
    await ctx.editMessageText(`🛠 Статус бота: ${newStatus}`, {
      reply_markup: undefined,
    });
  } catch (error) {
    console.error("Toggle bot error:", error);
    ctx.answerCallbackQuery("❌ Ошибка");
  }
}

export async function handleStats(ctx: Context) {
  try {
    if (!ctx.from || ctx.from.id !== ADMIN_ID) return;

    const [totalUsers, todayMessages] = await Promise.all([
      userRepo.countUsers(),
      messageRepo.countToday(),
    ]);

    const stats = `
📊 **СТАТИСТИКА БОТА**

👥 Всего пользователей: ${totalUsers}
💬 Сообщений сегодня: ${todayMessages}
    `;

    await ctx.answerCallbackQuery("Статистика загружена");
    await ctx.editMessageText(stats.trim(), {
      parse_mode: "HTML",
      reply_markup: undefined,
    });
  } catch (error) {
    console.error("Stats error:", error);
    ctx.answerCallbackQuery("❌ Ошибка при загрузке статистики");
  }
}

export async function saveNewModel(modelName: string) {
  try {
    await settingsRepo.saveModel(modelName);
    return true;
  } catch (error) {
    console.error("Save model error:", error);
    return false;
  }
}

export async function saveNewPrompt(prompt: string) {
  try {
    await settingsRepo.savePrompt(prompt);
    return true;
  } catch (error) {
    console.error("Save prompt error:", error);
    return false;
  }
}

export function getAdminState(adminId: number) {
  return adminStates.get(adminId);
}

export function clearAdminState(adminId: number) {
  const existingState = adminStates.get(adminId);
  if (existingState) {
    clearTimeout(existingState.timer);
  }

  adminStates.delete(adminId);
}
