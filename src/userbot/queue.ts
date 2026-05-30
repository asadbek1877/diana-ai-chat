export type SenderInfo = {
  id: bigint;
  firstName: string;
  username: string | null;
};

export type QueuedUserMessage = {
  texts: string[];
  messageIds: number[];
  timer: NodeJS.Timeout;
  sender: SenderInfo;
  chatId: string | number;
};

type QueueProcessor = (telegramId: bigint) => void;

const DEBOUNCE_MS = 4_000;

export class UserMessageQueue {
  private queues = new Map<bigint, QueuedUserMessage>();

  constructor(private readonly processQueue: QueueProcessor) {}

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
      existingQueue.texts.push(input.text);
      existingQueue.messageIds.push(input.messageId);
      existingQueue.timer = setTimeout(() => this.processQueue(input.telegramId), DEBOUNCE_MS);
      return;
    }

    this.queues.set(input.telegramId, {
      texts: [input.text],
      messageIds: [input.messageId],
      sender: input.sender,
      chatId: input.chatId,
      timer: setTimeout(() => this.processQueue(input.telegramId), DEBOUNCE_MS),
    });
  }

  consume(telegramId: bigint) {
    const queue = this.queues.get(telegramId);
    if (!queue) return null;

    this.queues.delete(telegramId);
    return queue;
  }
}
