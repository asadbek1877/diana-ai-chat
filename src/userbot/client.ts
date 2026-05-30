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
  console.log("[System] Connecting MTProto userbot...");
  await userbotClient.connect();
  console.log("[System] MTProto userbot connected.");
  await userbotClient.sendMessage("me", { message: "Diana server started." });
}
