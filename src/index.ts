import { Bot } from "grammy";
import { env } from "./config/env";
import { registerAdminHandlers } from "./bot/handlers/admin.handler";
import { registerChatHandlers } from "./bot/handlers/chat.handler";
import { isAdminIdValid } from "./bot/middleware/auth";
import { startHealthServer } from "./server/health";

if (!env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env fayli ichida topilmadi!");
}

if (!isAdminIdValid()) {
  throw new Error("ADMIN_ID .env fayli ichida togri topilmadi!");
}

const bot = new Bot(env.BOT_TOKEN);

registerAdminHandlers(bot);
registerChatHandlers(bot);

bot.catch((error) => console.error("Global bot error:", error.error));

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());

startHealthServer(env.PORT);
void bot.start({
  onStart: (botInfo) => console.log(`[System] Bot connected as @${botInfo.username}`),
});
