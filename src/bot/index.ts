import { Bot, Context } from "grammy";
import { session, SessionFlavor } from "grammy";
import dotenv from "dotenv";
import { onMessage } from "./handlers";
import {
  handleAdminCommand,
  handleChangeModel,
  handleChangePrompt,
  handleToggleBot,
  handleStats,
} from "../admin/commandCenter";

type SessionData = Record<string, unknown>;
type MyContext = Context & SessionFlavor<SessionData>;

dotenv.config();

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env файли ичида топилмади!");
}

// Grammy ботини яратамиз
export const bot = new Bot<MyContext>(process.env.BOT_TOKEN!);

// Session middleware
bot.use(session());

// Ҳар қандай матнли хабар келганда ишлайдиган handler
bot.on("message:text", onMessage);
bot.on("message:photo", onMessage); // 👈 Расмларни ҳам қабул қилади

// /start командаси учун оддий совуққина саломлашиш
bot.command("start", async (ctx) => {
  await ctx.reply("Мм? Ким бу? Нимага ёзяпсан?");
});

// ============================================
// 🛡️ АДМИН КОМАНДЫ И КНОПКИ
// ============================================

// Ботга /admin буйруғи келганда ишлайдиган функция
bot.command('admin', handleAdminCommand);

// Callback обработчики для кнопок админ-панели
bot.callbackQuery("admin_change_model", handleChangeModel);
bot.callbackQuery("admin_change_prompt", handleChangePrompt);
bot.callbackQuery("admin_toggle_bot", handleToggleBot);
bot.callbackQuery("admin_stats", handleStats);