import { Bot } from "grammy";
import { env } from "../config/env";
import { createRateLimiter } from "../utils/rate-limit";
import { startUserbotClient } from "./client";
import { registerUserbotHandlers, setNotificationBot } from "./handlers";

// === Audit #7: Обработка необработанных ошибок в userbot процессе ===
process.on("uncaughtException", (err) => {
  console.error("[Userbot] FATAL uncaughtException:", err);
  setTimeout(() => process.exit(1), 3000);
});

process.on("unhandledRejection", (reason) => {
  console.error("[Userbot] FATAL unhandledRejection:", reason);
});
const incomingMessageLimiter = createRateLimiter(3_000);

async function startUserbot() {
  // Ботни (Б) фақат маълумот (лог) жўнатиш учун яратамиз.
  // Polling қилмаймиз, чунки уни npm run start:bot ўзи қиляпти.
  if (env.BOT_TOKEN) {
    const notifBot = new Bot(env.BOT_TOKEN);
    await notifBot.init();
    setNotificationBot(notifBot);
    console.log("[Userbot] Notification bot initialized (log transport only).");
  } else {
    console.warn("[Userbot] BOT_TOKEN not set, admin notifications disabled.");
  }

  await startUserbotClient();
  registerUserbotHandlers({ incomingMessageLimiter });
  console.log("[System] Userbot handlers registered. Diana is listening.");
}

startUserbot().catch((error) => {
  console.error("[Userbot] Failed to start:", error);
  process.exit(1);
});
