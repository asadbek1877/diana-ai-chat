# 🤖 Diana Bot - Архитектура и интеграция модулей

## 📋 Обзор

Этот документ описывает архитектуру масштабируемого Telegram-бота на TypeScript с тремя ключевыми модулями для управления AI, администрирования и логирования.

### ✅ Статус

- ✅ TypeScript compilation: **CLEAN** (no errors)
- ✅ Все 3 модуля созданы и готовы к использованию
- ✅ Prisma схема обновлена для Settings таблицы
- ✅ Примеры интеграции предоставлены

---

## 🏗️ Архитектура

### 1. **src/ai/openrouter.ts** - AI интеграция
Основной модуль для работы с OpenRouter API.

```typescript
// Использование
import { askDiana } from "../ai/openrouter";

const response = await askDiana(userMessage, chatHistory);
```

**Возможности:**
- ✅ Автоматическая проверка `Settings.isBotActive`
- ✅ Если бот отключен, возвращает: "Я сейчас сплю 😴"
- ✅ Использует модель из `Settings.currentModel` (fallback: `deepseek/deepseek-chat:free`)
- ✅ Использует промпт из `Settings.systemPrompt` (fallback: `getDianaPrompt()`)
- ✅ Поддержка истории чата для контекста

**Функции:**
```typescript
askDiana(userMessage: string, chatHistory: any[] = []): Promise<string>
```

---

### 2. **src/admin/commandCenter.ts** - Административная панель
Полнофункциональная система управления ботом.

```typescript
// Использование
import { handleAdminCommand } from "../admin/commandCenter";

bot.command("admin", handleAdminCommand);
```

**Главная функция:**
```
/admin → Показывает админ-панель с 4 кнопками:
  ⚙️ Сменить модель
  📝 Изменить промпт
  🛑 Kill Switch (включить/выключить бота)
  📊 Статистика
```

**Экспортируемые функции:**
```typescript
// Обработчики кнопок админ-панели
handleAdminCommand(ctx: Context): Promise<void>
handleChangeModel(ctx: Context): Promise<void>
handleChangePrompt(ctx: Context): Promise<void>
handleToggleBot(ctx: Context): Promise<void>
handleStats(ctx: Context): Promise<void>

// Сохранение настроек
saveNewModel(modelName: string): Promise<boolean>
saveNewPrompt(prompt: string): Promise<boolean>

// Управление состоянием
getAdminState(adminId: number): AdminState | undefined
clearAdminState(adminId: number): void
```

**Система состояния админа:**
```
Использует Memory Map для отслеживания:
- adminStates: Map<adminId, { action, data }>
- action: "waitingForModel" | "waitingForPrompt"
```

---

### 3. **src/logger/chatLogger.ts** - Логирование чатов
Реальное логирование с уведомлениями администратору.

```typescript
// Использование
import { handleUserMessage, getUserChatHistory } from "../logger/chatLogger";

const chatHistory = await getUserChatHistory(userId, 10);
await handleUserMessage(ctx, userMessage, botResponse, bot);
```

**Экспортируемые функции:**
```typescript
// Управление пользователями
ensureUserExists(telegramId: bigint | string, firstName?: string, username?: string)
  → Promise<User | null>

// Логирование сообщений
logChatMessage(userId: string, role: "user" | "assistant", content: string)
  → Promise<boolean>

// Уведомления админу
notifyAdmin(bot: Bot, userMessage: string, botResponse: string, userInfo)
  → Promise<boolean>

// Оркестрация
handleUserMessage(ctx: Context, userMessage: string, botResponse: string, bot: Bot)
  → Promise<void>

// История чата
getUserChatHistory(userId: string, limit: number = 50)
  → Promise<Message[]>

// Администрирование
clearUserChatHistory(userId: string)
  → Promise<number>

getUserStats(userId: string)
  → Promise<UserStats | null>
```

---

## 🔗 Интеграция в bot/index.ts

### Шаг 1: Импортируйте модули
```typescript
import { askDiana } from "../ai/openrouter";
import {
  handleAdminCommand,
  handleChangeModel,
  handleChangePrompt,
  handleToggleBot,
  handleStats,
  getAdminState,
  clearAdminState
} from "../admin/commandCenter";
import {
  handleUserMessage,
  ensureUserExists,
  getUserChatHistory
} from "../logger/chatLogger";
```

### Шаг 2: Добавьте middleware
```typescript
import { session } from "grammy";

bot.use(session()); // Для хранения состояния пользователя
```

### Шаг 3: Установите админ-команды
```typescript
bot.command("admin", handleAdminCommand);
bot.callbackQuery("admin_change_model", handleChangeModel);
bot.callbackQuery("admin_change_prompt", handleChangePrompt);
bot.callbackQuery("admin_toggle_bot", handleToggleBot);
bot.callbackQuery("admin_stats", handleStats);
```

### Шаг 4: Обновите обработчик сообщений
```typescript
bot.on("message:text", async (ctx) => {
  if (!ctx.from || !ctx.message?.text) return;

  const ADMIN_ID = Number(process.env.ADMIN_ID);
  const adminState = getAdminState(ctx.from.id);

  // Обработка ввода модели
  if (adminState?.action === "waitingForModel") {
    const modelName = ctx.message.text?.trim();
    const success = await saveNewModel(modelName);
    await ctx.reply(success ? "✅ Модель изменена!" : "❌ Ошибка");
    clearAdminState(ctx.from.id);
    return;
  }

  // Обработка ввода промпта
  if (adminState?.action === "waitingForPrompt") {
    const prompt = ctx.message.text?.trim();
    const success = await saveNewPrompt(prompt);
    await ctx.reply(success ? "✅ Промпт изменен!" : "❌ Ошибка");
    clearAdminState(ctx.from.id);
    return;
  }

  // Обычная обработка сообщения
  const userMessage = ctx.message.text;
  const telegramId = String(ctx.from.id);

  try {
    // 1️⃣ Создаем/получаем пользователя
    const user = await ensureUserExists(telegramId, ctx.from.first_name, ctx.from.username);
    if (!user) return ctx.reply("❌ Ошибка при создании профиля");

    // 2️⃣ Получаем историю чата
    const chatHistory = await getUserChatHistory(user.id, 10);

    // 3️⃣ "Печатает..." уведомление
    await ctx.api.sendChatAction(ctx.chat.id, "typing");

    // 4️⃣ Получаем ответ от AI
    const botResponse = await askDiana(userMessage, chatHistory);

    // 5️⃣ Логируем и уведомляем админа
    await handleUserMessage(ctx, userMessage, botResponse, bot);

    // 6️⃣ Отправляем ответ
    await ctx.reply(botResponse);
  } catch (error) {
    console.error("Error:", error);
    await ctx.reply("❌ Ошибка при обработке");
  }
});
```

---

## 📊 Prisma модели

### Settings
```prisma
model Settings {
  id           Int      @id @default(1)
  currentModel String   @default("llama-3.1-8b-instant")
  systemPrompt String   @db.Text
  isBotActive  Boolean  @default(true)
  updatedAt    DateTime @updatedAt
}
```

### User
```prisma
model User {
  id         String   @id @default(uuid())
  telegramId BigInt   @unique
  username   String?
  firstName  String?
  platform   String   @default("TELEGRAM")
  isPaused   Boolean  @default(false)
  isBlocked  Boolean  @default(false)
  createdAt  DateTime @default(now())
  lastSeen   DateTime @updatedAt
  messages   Message[]
  profile    UserProfile?
}
```

### Message
```prisma
model Message {
  id        String   @id @default(uuid())
  userId    String
  role      String   // "user" или "assistant"
  content   String   @db.Text
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

---

## ⚙️ Переменные окружения

```bash
# Telegram
BOT_TOKEN=xxxxx
ADMIN_ID=123456789

# OpenRouter AI
OPENROUTER_API_KEY=sk-or-xxxxx

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/diana
```

---

## 🔄 Примеры использования

### Пример 1: Получить историю пользователя
```typescript
import { getUserChatHistory } from "../logger/chatLogger";

const history = await getUserChatHistory(userId, 20);
console.log(history); 
// [{id, role: "user", content, createdAt}, ...]
```

### Пример 2: Получить статистику
```typescript
import { getUserStats } from "../logger/chatLogger";

const stats = await getUserStats(userId);
console.log(stats);
// { user, totalMessages: 42, joinedAt, isBlocked }
```

### Пример 3: Переключить бота
```typescript
import { handleToggleBot } from "../admin/commandCenter";

await handleToggleBot(ctx); // Переключает isBotActive
```

### Пример 4: Проверить статус бота перед ответом
```typescript
import { askDiana } from "../ai/openrouter";

const response = await askDiana("привет");
if (response === "Я сейчас сплю 😴") {
  console.log("Бот отключен администратором");
}
```

---

## 🧪 Тестирование

### Проверить TypeScript
```bash
npx tsc --noEmit
```

### Запустить бота
```bash
npm run dev
```

### Проверить компиляцию ES
```bash
npm run build
```

---

## 📝 Примечания по разработке

### Pool-based Prisma
Все модули используют `PrismaPg` adapter с `Pool` для оптимальной работы с PostgreSQL:
```typescript
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

### Управление состоянием администратора
Вместо `ctx.session` используется `Map<adminId, state>` для избежания типовых конфликтов:
```typescript
const adminStates = new Map<number, { action: string; data?: any }>();
```

### Обработка telegramId
`telegramId` в Prisma хранится как `BigInt`, поэтому преобразуйте строки:
```typescript
const tgId = typeof telegramId === "string" ? BigInt(telegramId) : telegramId;
```

---

## 🚀 Следующие шаги

1. ✅ **Скопируйте интеграцию** из `INTEGRATION_EXAMPLE.ts` в `src/bot/index.ts`
2. ✅ **Убедитесь, что Settings запись** существует в БД (id=1)
3. ✅ **Протестируйте** команду `/admin` с вашим ADMIN_ID
4. ✅ **Проверьте уведомления** в DM админа

---

## 📚 Дополнительные ресурсы

- [Grammy documentation](https://grammy.dev/)
- [Prisma documentation](https://www.prisma.io/docs/)
- [OpenRouter API](https://openrouter.ai/docs)
- [TypeScript strict mode](https://www.typescriptlang.org/tsconfig#strict)

---

**Версия:** 1.0  
**Дата создания:** 2024  
**Статус:** Production Ready ✅
