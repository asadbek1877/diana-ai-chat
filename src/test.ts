import "dotenv/config";
import { Bot } from "grammy";

// .env дан токенни оламиз
const bot = new Bot(process.env.BOT_TOKEN!);

// Хабар келганини терминалда кўрсатадиган "радар"
bot.use(async (ctx, next) => {
    console.log("📥 УРА! ТЕЛЕГРАМДАН СИГНАЛ КЕЛДИ!");
    await next();
});

bot.command("start", (ctx) => {
    return ctx.reply("✅ Зўр! Тест бот ишлаяпти. Алоқа бор!");
});

bot.on("message:text", (ctx) => {
    return ctx.reply("Сен ёздинг: " + ctx.message?.text);
});

// Ботни эски муаммолардан тозалаб ишга туширамиз
bot.api.deleteWebhook({ drop_pending_updates: true }).then(() => {
    console.log("[System] Webhook тозаланди, бот ишга тушмоқда...");
    bot.start({ 
        onStart: (info) => console.log(`[System] ТЕСТ БОТ УЛАНДИ: @${info.username}`) 
    });
});