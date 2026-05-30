import { startUserbotClient } from "./client";
import { registerUserbotHandlers } from "./handlers";

async function startUserbot() {
  await startUserbotClient();
  registerUserbotHandlers();
}

void startUserbot();
