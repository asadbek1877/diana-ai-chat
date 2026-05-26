import { Bot } from "grammy";
import dotenv from "dotenv";
import { onMessage } from "./handlers";

dotenv.config();

if (!process.env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env файли ичида топилмади!");
}

// Grammy ботини яратамиз
export const bot = new Bot(process.env.BOT_TOKEN);

// Ҳар қандай матнли хабар келганда ишлайдиган handler
bot.on("message:text", onMessage);

// /start командаси учун оддий совуққина саломлашиш
bot.command("start", async (ctx) => {
  await ctx.reply("Мм? Ким бу? Нимага ёзяпсан?");
});
