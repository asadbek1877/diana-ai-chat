import { bot } from "./bot";

async function startApp() {
  try {
    console.log("[System] Диана бот ишга тушяпти...");
    
    // Ботни Long Polling режимида ишга туширамиз ва жараённи ушлаб турамиз
    await bot.start({
      onStart: (botInfo: any) => {
        console.log(`[System] Бот муваффақиятли уланди! Бот ники: @${botInfo.username}`);
        console.log("[System] Диана жонли! Телеграмда бемалол ёзишингиз мумкин.");
      }
    });

  } catch (error) {
    console.error("Ботни юргизишда хатолик:", error);
    process.exit(1);
  }
}

// Ботни ишга туширишдан олдин эскисини тўхтатиш мантиқи
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());


// 🛠 MIDDLEWARE: AI текстини реал одамникига ўхшатиб бузиш
export function formatDianaText(text: string): string {
  let t = text.trim();
  
  // 1. Нуқта ва ундовларни куч билан олиб ташлаймиз
  t = t.replace(/[.!]+$/, '');
  
  // 2. Китобий сўзларни ёшлар жаргонига алмаштирамиз
  t = t.replace(/Я понимаю/gi, 'понятненько');
  t = t.replace(/Конечно/gi, 'ну да');
  t = t.replace(/Безусловно/gi, 'сто пудов');
  t = t.replace(/Извини/gi, 'сорян');
  t = t.replace(/Хорошо/gi, 'окей');

  // 3. Реал қизлар чатда бош ҳарф билан ёзмайди. Ҳаммасини кичкина ҳарф қиламиз!
  if (t.length > 0 && !t.startsWith('[LIKE]')) {
    t = t.toLowerCase();
  } else if (t.startsWith('[LIKE]') && t.length > 6) {
    // Агар [LIKE] теги бўлса, ундан кейинги гапни кичкина қиламиз
    t = '[LIKE]' + t.substring(6).toLowerCase();
  }
  
  return t;
}

startApp();


