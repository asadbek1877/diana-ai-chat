import dotenv from "dotenv";

dotenv.config();

export const env = {
  ADMIN_GROUP_ID: Number(process.env.ADMIN_GROUP_ID),
  ADMIN_ID: Number(process.env.ADMIN_ID),
  API_HASH: process.env.API_HASH as string,
  API_ID: Number(process.env.API_ID),
  BOT_TOKEN: process.env.BOT_TOKEN,
  DATABASE_URL: process.env.DATABASE_URL,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  PORT: Number(process.env.PORT || 3000),
  SESSION_STRING: process.env.SESSION_STRING || "",
  TAVILY_API_KEY: process.env.TAVILY_API_KEY,
};
