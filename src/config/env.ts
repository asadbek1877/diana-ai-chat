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

export const env = {
  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID),
  ADMIN_ID: requirePositiveNumberEnv("ADMIN_ID"),
  API_HASH: process.env.API_HASH as string,
  API_ID: Number(process.env.API_ID),
  BOT_TOKEN: process.env.BOT_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENROUTER_API_KEY: requireEnv("OPENROUTER_API_KEY"),
  PORT: Number(process.env.PORT || 3000),
  SESSION_STRING: process.env.SESSION_STRING || "",
  TAVILY_API_KEY: requireEnv("TAVILY_API_KEY"),
};
