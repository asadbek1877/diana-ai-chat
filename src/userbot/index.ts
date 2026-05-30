import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage, NewMessageEvent } from "telegram/events";
import { PrismaClient, Prisma } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

// 🛠 ТОЗАЛАНГАН ИМПОРТ: Янги openrouter.ts файлимиздаги askDiana функциясини улаймиз
import { askDiana } from "../ai/openrouter"; 

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL as string });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const apiId = Number(process.env.API_ID);
const apiHash = process.env.API_HASH as string;
const sessionString = new StringSession(process.env.SESSION_STRING || "");
const client = new TelegramClient(sessionString, apiId, apiHash, {
  connectionRetries: 5,
});

const userMessageQueues = new Map<bigint, { texts: string[], messageIds: number[], timer: NodeJS.Timeout, sender: any, chatId: any }>();

// 🛠 AI ТЕКСТИНИ РЕАЛ ОДАМНИКИГА ЎХШАТИБ БУЗИШ (MIDDLEWARE)
function formatDianaText(text: string): string {
  let t = text.trim();
  
  // Нуқта ва ундовларни олиб ташлаймиз
  t = t.replace(/[.!]+$/, '');
  
  // Китобий сўзларни ёшлар жаргонига алмаштирамиз
  t = t.replace(/Я понимаю/gi, 'понятненько');
  t = t.replace(/Конечно/gi, 'ну да');
  t = t.replace(/Безусловно/gi, 'сто пудов');
  t = t.replace(/Извини/gi, 'сорян');
  t = t.replace(/Хорошо/gi, 'окей');
  
  // Ҳаммасини кичкина ҳарф қиламиз
  if (t.length > 0 && !t.startsWith('[LIKE]')) {
    t = t.toLowerCase();
  } else if (t.startsWith('[LIKE]') && t.length > 6) {
    t = '[LIKE]' + t.substring(6).toLowerCase();
  }
  
  return t;
}



async function processUserQueue(tgId: bigint) {
  const queue = userMessageQueues.get(tgId);
  if (!queue) return;
  userMessageQueues.delete(tgId); 

  const combinedUserText = queue.texts.join("\n"); 
  const lastMessageId = queue.messageIds[queue.messageIds.length - 1]; 
  const sender = queue.sender;
  const chatId = queue.chatId;

  // @ts-ignore
  const firstName = sender?.firstName || "Номаълум";
  // @ts-ignore
  const username = sender?.username ? `@${sender.username}` : "Ник йўқ";
  
  console.log(`📩 Кимдан: ${firstName} | ТЎЛИҚ ХАБАР: ${combinedUserText}`);
  
  try {
    let user = await prisma.user.findUnique({ where: { telegramId: tgId }, include: { profile: true } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: tgId, username: username !== "Ник йўқ" ? username : null, firstName, platform: "TELEGRAM_USERBOT",
          profile: { create: { topicsDiscussed: [] as Prisma.InputJsonValue, personalityNotes: "" } },
        },
        include: { profile: true },
      });
    }

    if (user.isPaused) return;

    // 1. Онлайн бўлиш ва ўқиш
    await client.invoke(new Api.account.UpdateStatus({ offline: false }));
    const readDelay = Math.max(2000, Math.min(6000, combinedUserText.length * 50));
    await new Promise(resolve => setTimeout(resolve, readDelay));
    
    await client.invoke(new Api.messages.ReadHistory({ peer: chatId, maxId: lastMessageId }));
    // @ts-ignore
    await client.invoke(new Api.messages.SetTyping({ peer: chatId, action: new Api.SendMessageTypingAction() }));

    // 2. Базадан охирги 10 та хабарни оламиз (ИИ хотираси учун)
    const recentMessages = await prisma.message.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 });
    const reversedMessages = [...recentMessages].reverse();

    // 🚀 ТЎҒРИЛАНГАН ЖОЙИ: askDiana функциясига янги хабар ва базадаги тарихни тўғри узатамиз
    let dianaReply = await askDiana(combinedUserText, reversedMessages);

    // 🚀 ФИЛЬТРДАН ЎТКАЗАМИЗ
    dianaReply = formatDianaText(dianaReply);

    // 3. ЛАЙК БОСИШ МАНТИҒИ
    let hasLikeTag = false;
    if (dianaReply.includes("[LIKE]")) {
      hasLikeTag = true;
      dianaReply = dianaReply.replace("[LIKE]", "").trim(); 
    }

    // 🚀 ТЎҒРИЛАНГАН ВА ХАТОСИЗ TRANSACTION
    await prisma.$transaction([
      prisma.message.create({ 
        data: { userId: user.id, role: "user", content: combinedUserText } 
      }),
      prisma.message.create({ 
        data: { userId: user.id, role: "assistant", content: dianaReply } 
      }),
      prisma.userProfile.upsert({
        where: { userId: user.id },
        update: { messageCount: { increment: 1 } },
        create: { 
          userId: user.id, 
          messageCount: 1, 
          topicsDiscussed: [],
          personalityNotes: ""
        }
      }),
    ]);

    // Агар [LIKE] теги бўлса, ҳақиқий реакция босамиз
    if (hasLikeTag) {
      try {
        await client.invoke(new Api.messages.SendReaction({
          peer: chatId,
          msgId: lastMessageId,
          // @ts-ignore
          reaction: [new Api.ReactionEmoji({ emoticon: '❤️' })]
        }));
      } catch (e) {
        console.error("Реакция босишда хатолик:", e);
      }
    }

    // 4. Хабарни юбориш
    const sentences = dianaReply.split('\n\n').filter((s: string) => s.trim().length > 0); 
    
    for (let i = 0; i < sentences.length; i++) {
      let textToSend = sentences[i].trim();
      if (textToSend.length === 0) continue;

      const typingDelay = Math.max(1500, textToSend.length * 60); 
      await new Promise(resolve => setTimeout(resolve, typingDelay));

      await client.sendMessage(chatId, { message: textToSend });

      if (i < sentences.length - 1) {
        // @ts-ignore
        await client.invoke(new Api.messages.SetTyping({ peer: chatId, action: new Api.SendMessageTypingAction() }));
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    }

    // Оффлайн бўлиш
    await client.invoke(new Api.account.UpdateStatus({ offline: true }));

  } catch (err) {
    console.error("Хатолик юз берди:", err);
  }
}

async function startUserbot() {
  console.log("[System] Юзербот Телеграмга уланмоқда...");
  await client.connect();
  console.log("✅ Диана (Реал профиль) АҚЛЛИ МИЯГА уланди ва ишлашга тайёр!");
  
  await client.sendMessage("me", { message: "Диана серверда уйғонди! 🚀" });

  client.addEventHandler(async (event: NewMessageEvent) => {
    const message = event.message;
    
    if (message.isPrivate && !message.out && message.text) {
      const userText = message.text;
      const sender = await message.getSender();
      
      // @ts-ignore
      const tgId = BigInt(sender?.id || 0);
      
      // DEBOUNCE LOGIC
      if (userMessageQueues.has(tgId)) {
        const queue = userMessageQueues.get(tgId)!;
        clearTimeout(queue.timer);
        queue.texts.push(userText);
        queue.messageIds.push(message.id);
        queue.timer = setTimeout(() => processUserQueue(tgId), 4000);
      } else {
        const timer = setTimeout(() => processUserQueue(tgId), 4000);
        userMessageQueues.set(tgId, { texts: [userText], messageIds: [message.id], timer, sender, chatId: message.chatId });
      }
    }
  }, new NewMessage({}));
}

startUserbot();