import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions";
// @ts-ignore
import input from "input";
import dotenv from "dotenv";

dotenv.config();

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH as string;
// Бўш сессия билан бошлаймиз
const stringSession = new StringSession("");

(async () => {
  console.log("📲 Реал профилга уланиш бошланди...");
  
  const client = new TelegramClient(stringSession, apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text("Телефон рақамингизни киритинг (масалан, +998901234567): "),
    password: async () => await input.text("2-Step пароль (агар бўлса, йўқса Enter босинг): "),
    phoneCode: async () => await input.text("Телеграмдан келган 5 хонали кодни киритинг: "),
    onError: (err) => console.log("Хатолик:", err),
  });

  console.log("\n✅ МУВАФФАҚИЯТЛИ УЛАНДИК!");
  console.log("👇 МАНА БУ СЕБИЯ КОДИНИ .env ФАЙЛДАГИ SESSION_STRING= ДАН КЕЙИН ҚЎЙИНГ 👇\n");
  
  console.log(client.session.save());
  
  console.log("\n👆 КОДНИ НУСХАЛАБ ОЛДИНГИЗМИ? Энди бу файлни ёпишингиз мумкин.");
  await client.disconnect();
  process.exit(0);
})();