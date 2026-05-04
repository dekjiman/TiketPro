-- CreateTable
CREATE TABLE "EventImage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventImage_eventId_orderIndex_idx" ON "EventImage"("eventId", "orderIndex");

-- AddForeignKey
ALTER TABLE "EventImage" ADD CONSTRAINT "EventImage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
