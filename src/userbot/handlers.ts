import { Api } from "telegram";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { userbotClient } from "./client";

export function setNotificationBot(bot: any) {
  // Тест вақтида керак эмас
}

export function registerUserbotHandlers(options: any) {
  console.log("[System] Userbot handlers registered. SUPER TEST MODE is running.");

  userbotClient.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    const text = typeof message.text === "string" ? message.text.trim() : "";

    if (!message.isPrivate || message.out || !text) {
        return;
    }

    console.log(`[DEBUG] Хабар келди: ${text}`);

    try {
        console.log(`[DEBUG] Хабарга Reply қилинмоқда...`);
        // МАНА ШУ ҚАТОРНИ ЎЗГАРТИРДИК: message.reply орқали Entity муаммоси 100% четлаб ўтилади
        await message.reply({ message: `Тест жавоб: Сиз "${text}" деб ёздингиз.` });
        console.log(`[DEBUG] Жавоб муваффақиятли юборилди!`);
    } catch (error) {
        console.error(`[CRITICAL ERROR] Хабар юборишда хатолик:`, error);
    }

  }, new NewMessage({}));
}