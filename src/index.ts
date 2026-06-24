import { Bot } from "grammy";
import { env } from "./config/env";
import { registerAdminHandlers } from "./bot/handlers/admin.handler";
import { registerChatHandlers } from "./bot/handlers/chat.handler";
import { isAdminIdValid } from "./bot/middleware/auth";
import { createMessageRateLimitMiddleware } from "./bot/middleware/rate-limit";
import { prisma, pool } from "./database/prisma";
import { startHealthServer, getHealthServer } from "./server/health";
import { ProactiveService } from "./services/proactive.service";
import { SelfLearningService } from "./services/self-learning.service";
import { setCircuitBreakerCheck } from "./services/ai.service";

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

// === Audit #6: Circuit breaker — при 429 от API прекращаем запросы на 60 сек ===
let circuitOpen = false;
export function isCircuitOpen() {
  return circuitOpen;
}
setCircuitBreakerCheck(isCircuitOpen);

bot.catch((error) => {
  const errMsg = String((error.error as any)?.message || error.error || "");
  console.error("Global bot error:", error.error);

  if (errMsg.includes("429") || errMsg.includes("Too Many Requests")) {
    circuitOpen = true;
    console.warn("[System] Circuit breaker OPEN — API rate limited, pausing for 60s");
    setTimeout(() => {
      circuitOpen = false;
      console.log("[System] Circuit breaker CLOSED — resuming requests");
    }, 60_000);
  }
});

// === Audit #7: Обработка необработанных ошибок — без этого любой unhandled throw = мгновенный crash ===
process.on("uncaughtException", (err) => {
  console.error("FATAL uncaughtException:", err);
  // Graceful shutdown — даём 3 сек на завершение
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  console.error("FATAL unhandledRejection:", reason);
});

// === Audit #8: Graceful shutdown — закрываем ВСЕ ресурсы ===
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
  }

  // Audit #8: Закрываем pg Pool — без этого zombie connections к Neon
  try {
    await pool.end();
  } catch (error) {
    console.error("[System] Failed to close pg pool:", error);
  }

  // Закрываем health server
  const healthServer = getHealthServer();
  if (healthServer) {
    healthServer.close();
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
  onStart: (botInfo) => {
    console.log(`[System] Bot connected as @${botInfo.username}`);
    // Диананинг proactive (биринчи бўлиб ёзиш) таймери ёқилди!
    ProactiveService.start();
    // Диананинг ўзини-ўзи ўқитиш (Self-Learning) тизими фаоллашди!
    SelfLearningService.start();
  },
}).catch(async (error) => {
  console.error("[System] Bot start failed:", error);
  await prisma.$disconnect();
  process.exit(1);
});
