/*
  Warnings:

  - Changed the type of `sessionType` on the `EventRundown` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "EventRundown" ADD COLUMN     "eventDate" TIMESTAMP(3),
DROP COLUMN "sessionType",
ADD COLUMN     "sessionType" TEXT NOT NULL,
ALTER COLUMN "dayIndex" DROP DEFAULT;

-- AlterTable
ALTER TABLE "EventVenue" ALTER COLUMN "facilities" DROP NOT NULL,
ALTER COLUMN "facilities" SET DATA TYPE TEXT,
ALTER COLUMN "timezone" DROP DEFAULT;
