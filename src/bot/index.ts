import { Bot, Context, session, SessionFlavor } from "grammy";
import { env } from "../config/env";
import { registerAdminHandlers } from "./handlers/admin.handler";
import { registerChatHandlers } from "./handlers/chat.handler";

type SessionData = Record<string, unknown>;
type MyContext = Context & SessionFlavor<SessionData>;

if (!env.BOT_TOKEN) {
  throw new Error("BOT_TOKEN .env fayli ichida topilmadi!");
}

export const bot = new Bot<MyContext>(env.BOT_TOKEN);

bot.use(session());
registerAdminHandlers(bot);
registerChatHandlers(bot);
