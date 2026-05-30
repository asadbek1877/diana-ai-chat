import { Bot } from "grammy";
import { env } from "./config/env";
import { registerAdminHandlers } from "./bot/handlers/admin.handler";
import { registerChatHandlers } from "./bot/handlers/chat.handler";
import { isAdminIdValid } from "./bot/middleware/auth";
import { createMessageRateLimitMiddleware } from "./bot/middleware/rate-limit";
import { prisma } from "./database/prisma";
import { startHealthServer } from "./server/health";

if (!env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env fayli ichida topilmadi!");
}

if (!isAdminIdValid()) {
  throw new Error("ADMIN_ID .env fayli ichida togri topilmadi!");
}

const bot = new Bot(env.BOT_TOKEN);

bot.use(createMessageRateLimitMiddleware());
registerAdminHandlers(bot);
registerChatHandlers(bot);

bot.catch((error) => console.error("Global bot error:", error.error));

let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`[System] Received ${signal}, shutting down...`);

  try {
    bot.stop();
  } catch (error) {
    console.error("[System] Failed to stop bot:", error);
  }

  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error("[System] Failed to disconnect Prisma:", error);
    process.exit(1);
  }

  process.exit(0);
}

process.once("SIGINT", (signal) => {
  shutdown(signal).catch((error) => {
    console.error("[System] Shutdown failed:", error);
    process.exit(1);
  });
});
process.once("SIGTERM", (signal) => {
  shutdown(signal).catch((error) => {
    console.error("[System] Shutdown failed:", error);
    process.exit(1);
  });
});

startHealthServer(env.PORT);
bot.start({
  onStart: (botInfo) => console.log(`[System] Bot connected as @${botInfo.username}`),
}).catch(async (error) => {
  console.error("[System] Bot start failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
