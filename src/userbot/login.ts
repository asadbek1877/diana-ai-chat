import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
import { env } from "../config/env";

const input = require("input") as {
  text(prompt: string): Promise<string>;
};

const stringSession = new StringSession("");

async function createSession() {
  console.log("[Userbot Login] Starting MTProto login...");

  const client = new TelegramClient(stringSession, env.API_ID, env.API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: () => input.text("Enter phone number, for example +998901234567: "),
    password: () => input.text("Enter 2FA password, or press Enter if not enabled: "),
    phoneCode: () => input.text("Enter the 5-digit code from Telegram: "),
    onError: (error) => console.log("Login error:", error),
  });

  console.log("\n[Userbot Login] Connected successfully.");
  console.log("Copy this session value into SESSION_STRING in your .env file:\n");
  console.log(client.session.save());

  await client.disconnect();
  process.exit(0);
}

void createSession();
