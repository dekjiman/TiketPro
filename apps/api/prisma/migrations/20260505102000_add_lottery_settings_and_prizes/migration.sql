-- CreateEnum
CREATE TYPE "LotteryDrawMode" AS ENUM ('BATCH', 'LIVE');

-- CreateEnum
CREATE TYPE "LotteryEligibleStatus" AS ENUM ('CHECKED_IN');

-- CreateTable
CREATE TABLE "LotteryConfig" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "drawMode" "LotteryDrawMode" NOT NULL DEFAULT 'LIVE',
    "allowMultipleWin" BOOLEAN NOT NULL DEFAULT false,
    "eligibleStatus" "LotteryEligibleStatus" NOT NULL DEFAULT 'CHECKED_IN',
    "maxWinnerPerTicket" INTEGER NOT NULL DEFAULT 1,
    "cooldownSeconds" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LotteryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Prize" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "totalWinner" INTEGER NOT NULL,
    "remainingWinner" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Prize_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LotteryConfig_eventId_key" ON "LotteryConfig"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Prize_eventId_order_key" ON "Prize"("eventId", "order");

-- CreateIndex
CREATE INDEX "Prize_eventId_remainingWinner_idx" ON "Prize"("eventId", "remainingWinner");

-- AddForeignKey
ALTER TABLE "LotteryConfig" ADD CONSTRAINT "LotteryConfig_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Prize" ADD CONSTRAINT "Prize_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
