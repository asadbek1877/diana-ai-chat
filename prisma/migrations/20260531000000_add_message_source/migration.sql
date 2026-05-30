ALTER TABLE "Message" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'telegram_bot';

CREATE INDEX "Message_source_idx" ON "Message"("source");
