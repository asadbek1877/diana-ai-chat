-- CreateTable
CREATE TABLE "ChatLog" (
    "id" TEXT NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatLog_telegramId_idx" ON "ChatLog"("telegramId");
