export type SenderInfo = {
  id: bigint;
  firstName: string;
  username: string | null;
};

export type QueuedUserMessage = {
  texts: string[];
  messageIds: number[];
  timer: NodeJS.Timeout;
  ttlTimer: NodeJS.Timeout;
  sender: SenderInfo;
  chatId: string | number;
};

type QueueProcessor = (telegramId: bigint) => void | Promise<void>;

const DEBOUNCE_MS = 4_000;
const QUEUE_TTL_MS = 5 * 60 * 1000;

export class UserMessageQueue {
  private queues = new Map<bigint, QueuedUserMessage>();

  constructor(private readonly processQueue: QueueProcessor) {}

  private scheduleProcess(telegramId: bigint) {
    return setTimeout(() => {
      Promise.resolve(this.processQueue(telegramId)).catch((error) => {
        console.error("[Userbot] Failed to process queued message:", error);
        this.clear(telegramId);
      });
    }, DEBOUNCE_MS);
  }

  private scheduleTtl(telegramId: bigint) {
    return setTimeout(() => {
      this.clear(telegramId);
    }, QUEUE_TTL_MS);
  }

  clear(telegramId: bigint) {
    const queue = this.queues.get(telegramId);
    if (!queue) return;

    clearTimeout(queue.timer);
    clearTimeout(queue.ttlTimer);
    this.queues.delete(telegramId);
  }

  enqueue(input: {
    telegramId: bigint;
    text: string;
    messageId: number;
    sender: SenderInfo;
    chatId: string | number;
  }) {
    const existingQueue = this.queues.get(input.telegramId);

    if (existingQueue) {
      clearTimeout(existingQueue.timer);
      clearTimeout(existingQueue.ttlTimer);
      existingQueue.texts.push(input.text);
      existingQueue.messageIds.push(input.messageId);
      existingQueue.timer = this.scheduleProcess(input.telegramId);
      existingQueue.ttlTimer = this.scheduleTtl(input.telegramId);
      return;
    }

    this.queues.set(input.telegramId, {
      texts: [input.text],
      messageIds: [input.messageId],
      sender: input.sender,
      chatId: input.chatId,
      timer: this.scheduleProcess(input.telegramId),
      ttlTimer: this.scheduleTtl(input.telegramId),
    });
  }

  consume(telegramId: bigint) {
    const queue = this.queues.get(telegramId);
    if (!queue) return null;

    clearTimeout(queue.timer);
    clearTimeout(queue.ttlTimer);
    this.queues.delete(telegramId);
    return queue;
  }
}
