import { createRateLimiter } from "../utils/rate-limit";
import { startUserbotClient } from "./client";
import { registerUserbotHandlers } from "./handlers";

const incomingMessageLimiter = createRateLimiter(3_000);

async function startUserbot() {
  await startUserbotClient();
  registerUserbotHandlers({ incomingMessageLimiter });
}

startUserbot().catch((error) => {
  console.error("[Userbot] Failed to start:", error);
  process.exit(1);
});
