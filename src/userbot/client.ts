import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { env } from "../config/env";

export const userbotClient = new TelegramClient(
  new StringSession(env.SESSION_STRING),
  env.API_ID,
  env.API_HASH,
  {
    connectionRetries: 5,
  }
);

export async function startUserbotClient() {
  if (!env.SESSION_STRING.trim()) {
    throw new Error("SESSION_STRING is required for MTProto userbot");
  }

  console.log("[System] Connecting MTProto userbot...");
  await userbotClient.connect();

  const isAuthorized = await userbotClient.isUserAuthorized();
  if (!isAuthorized) {
    throw new Error("SESSION_STRING invalid or expired");
  }

  console.log("[System] MTProto userbot connected.");

  try {
    await userbotClient.sendMessage("me", { message: "Diana server started." });
  } catch (error) {
    console.error("[Userbot] Failed to send startup message:", error);
  }
}
