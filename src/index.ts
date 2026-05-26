import { bot } from "./bot";

async function startApp() {
  try {
    console.log("[System] Диана бот ишга тушяпти...");
    
    // Ботни Long Polling режимида ишга туширамиз ва жараённи ушлаб турамиз
    await bot.start({
      onStart: (botInfo) => {
        console.log(`[System] Бот муваффақиятли уланди! Бот ники: @${botInfo.username}`);
        console.log("[System] Диана жонли! Телеграмда бемалол ёзишингиз мумкин.");
      }
    });

  } catch (error) {
    console.error("Ботни юргизишда хатолик:", error);
    process.exit(1);
  }
}

startApp();