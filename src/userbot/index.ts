import { Bot } from "grammy";
import { env } from "../config/env";
import { createRateLimiter } from "../utils/rate-limit";
import { startUserbotClient } from "./client";
import { registerUserbotHandlers, setNotificationBot } from "./handlers";
import { registerChatHandlers } from "../bot/handlers/chat.handler";

const incomingMessageLimiter = createRateLimiter(3_000);

async function startUserbot() {
  // Create a standalone Bot API instance ONLY for sending admin notifications.
  // This bot DOES poll for updates to handle admin commands and messages.
  if (env.BOT_TOKEN) {
    const notifBot = new Bot(env.BOT_TOKEN);
    await notifBot.init();
    setNotificationBot(notifBot);
    
    // Register chat handlers for admin commands and admin group replies
    registerChatHandlers(notifBot);
    
    // Start polling for updates
    notifBot.start({
      onStart: (botInfo) => {
        console.log(`[Bot API] Admin Bot is running as @${botInfo.username}`);
      }
    });
    
    console.log("[Userbot] Notification bot initialized with handlers and polling started.");
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
