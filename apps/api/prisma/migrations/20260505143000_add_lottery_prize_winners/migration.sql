-- CreateTable
CREATE TABLE "LotteryPrizeWinner" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "prizeId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "ticketCode" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LotteryPrizeWinner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LotteryPrizeWinner_eventId_prizeId_ticketId_key" ON "LotteryPrizeWinner"("eventId", "prizeId", "ticketId");

-- CreateIndex
CREATE INDEX "LotteryPrizeWinner_eventId_prizeId_confirmedAt_idx" ON "LotteryPrizeWinner"("eventId", "prizeId", "confirmedAt");

-- AddForeignKey
ALTER TABLE "LotteryPrizeWinner" ADD CONSTRAINT "LotteryPrizeWinner_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryPrizeWinner" ADD CONSTRAINT "LotteryPrizeWinner_prizeId_fkey" FOREIGN KEY ("prizeId") REFERENCES "Prize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LotteryPrizeWinner" ADD CONSTRAINT "LotteryPrizeWinner_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
