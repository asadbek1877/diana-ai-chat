import { Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { userbotClient } from "./client";

export function setNotificationBot(bot: any) {
  // Тест вақтида бу керак эмас
}

export function registerUserbotHandlers(options: any) {
  console.log("[System] Userbot handlers registered. Diana is listening (TEST MODE).");

  userbotClient.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    const text = typeof message.text === "string" ? message.text.trim() : "";

    console.log(`[DEBUG] Хабар келди: ${text}`);

    if (!message.isPrivate || message.out || !text) {
        console.log(`[DEBUG] Хабар игнор қилинди (private эмас ёки ўзим ёздим).`);
        return;
    }

    const chatId = message.chatId;
    if (!chatId) {
        console.log(`[DEBUG] ChatId топилмади.`);
        return;
    }

    try {
        console.log(`[DEBUG] ЭХО жавоб қайтарилмоқда...`);
        await userbotClient.sendMessage(chatId, { message: `Тест жавоб: Сиз "${text}" деб ёздингиз.` });
        console.log(`[DEBUG] Жавоб юборилди!`);
    } catch (error) {
        console.error(`[CRITICAL ERROR] Хабар юборишда хатолик:`, error);
    }

  }, new NewMessage({}));
}