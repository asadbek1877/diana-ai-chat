import dotenv from "dotenv";

dotenv.config();

function requireEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function requirePositiveNumberEnv(name: string) {
  const rawValue = requireEnv(name);
  const value = Number(rawValue);

  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return value;
}

// === Audit #15: Полная валидация всех env переменных при старте ===
// Все переменные проверяются здесь один раз — crash при старте, а не при первом сообщении.
export const env = {
  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID),
  ADMIN_ID: requirePositiveNumberEnv("ADMIN_ID"),
  API_HASH: requireEnv("API_HASH"),
  API_ID: requirePositiveNumberEnv("API_ID"),
  BOT_TOKEN: requireEnv("BOT_TOKEN"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  GROQ_API_KEY: requireEnv("GROQ_API_KEY"),
  OPENROUTER_API_KEY: requireEnv("OPENROUTER_API_KEY"),
  PORT: Number(process.env.PORT || 3000),
  SESSION_STRING: requireEnv("SESSION_STRING"),
  TAVILY_API_KEY: requireEnv("TAVILY_API_KEY"),
};
