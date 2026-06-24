import { Bot } from "grammy";
import { env } from "../config/env";
import { createRateLimiter } from "../utils/rate-limit";
import { startUserbotClient } from "./client";
import { registerUserbotHandlers, setNotificationBot } from "./handlers";

const incomingMessageLimiter = createRateLimiter(3_000);

async function startUserbot() {
  // Create a standalone Bot API instance ONLY for sending admin notifications.
  // This bot does NOT poll for updates — it is used purely as a transport
  // to deliver log messages to the admin.
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
