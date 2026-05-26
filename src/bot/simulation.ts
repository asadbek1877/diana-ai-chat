import { Context } from "grammy";

// Ёрдамчи функция: Вақтни тўхтатиб туриш (кутиш) учун
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Ёрдамчи функция: Иккита сон орасидаги тасодифий вақтни топиш
const getRandom = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

export async function simulateHumanBehavior(ctx: Context, _textLength: number): Promise<boolean> {
  // 1. Игнор қилишни жуда камайтирдик (атиги 2% ҳолатда игнор қилади)
  if (Math.random() < 0.02) {
    console.log(`[Simulation] Диана атайлаб игнор қилди.`);
    return false; 
  }

  // 2. Хабар келгач, Диана уни дарров пайқамайди. 1.5 - 3 сония шунчаки жим кутади.
  await delay(getRandom(1500, 3000));

  if (ctx.chat?.id) {
    // 3. Ёзишни бошлади... ("typing" статуси ёнади)
    await ctx.api.sendChatAction(ctx.chat.id, "typing");
    
    // 1 - 2 сония ёзиб туради
    await delay(getRandom(1000, 2000));

    // 4. Рандом тарзда: баъзан ёзишни тўхтатиб, ўйланиб қолади (худди ёзганини ўчиргандек)
    // Бу ҳолат 40% эҳтимол билан рўй беради
    if (Math.random() < 0.4) { 
      // Telegram APIда "cancel" chat action йўқ, шунчаки қисқа танаффус қиламиз
      
      // 1 - 2.5 сония ўйланиб туради (ҳеч нима ёзмайди)
      await delay(getRandom(1000, 2500)); 
      
      // Кейин яна фикрини жамлаб ёзишни давом эттиради
      await ctx.api.sendChatAction(ctx.chat.id, "typing");
      await delay(getRandom(1000, 2000));
    }
  }

  return true; // Ҳамма реакциялар тугагач, AI жавобини юборишга рухсат берамиз
}