-- DropIndex
DROP INDEX "LotteryPrizeWinner_eventId_prizeId_ticketId_key";

-- CreateIndex
CREATE UNIQUE INDEX "LotteryPrizeWinner_eventId_ticketId_key" ON "LotteryPrizeWinner"("eventId", "ticketId");
