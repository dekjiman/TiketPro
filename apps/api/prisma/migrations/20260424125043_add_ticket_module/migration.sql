/*
  Warnings:

  - The values [FAILED] on the enum `OrderStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [UNUSED] on the enum `TicketStatus` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `snapToken` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `total` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `qty` on the `OrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `daysBefore` on the `RefundPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `percentage` on the `RefundPolicy` table. All the data in the column will be lost.
  - You are about to drop the column `amount` on the `RefundRequest` table. All the data in the column will be lost.
  - You are about to drop the column `checkedInAt` on the `Ticket` table. All the data in the column will be lost.
  - You are about to drop the column `qrCode` on the `Ticket` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[midtransOrderId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[eventId,daysBeforeEvent]` on the table `RefundPolicy` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ticketCode]` on the table `Ticket` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `finalAmount` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `totalAmount` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Made the column `expiredAt` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `quantity` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subtotal` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unitPrice` to the `OrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `daysBeforeEvent` to the `RefundPolicy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refundPercent` to the `RefundPolicy` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refundAmount` to the `RefundRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `refundPercent` to the `RefundRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `userId` to the `RefundRequest` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ticketCode` to the `Ticket` table without a default value. This is not possible if the table is not empty.
  - Made the column `holderName` on table `Ticket` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

-- AlterEnum
BEGIN;
CREATE TYPE "OrderStatus_new" AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'REFUNDED', 'PARTIAL_REFUND', 'EXPIRED', 'CANCELLED');
ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus_new" USING ("status"::text::"OrderStatus_new");
ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";
ALTER TYPE "OrderStatus_new" RENAME TO "OrderStatus";
DROP TYPE "OrderStatus_old";
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "TicketStatus_new" AS ENUM ('PENDING', 'ACTIVE', 'USED', 'REFUNDED', 'CANCELLED', 'TRANSFERRED');
ALTER TABLE "Ticket" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Ticket" ALTER COLUMN "status" TYPE "TicketStatus_new" USING ("status"::text::"TicketStatus_new");
ALTER TYPE "TicketStatus" RENAME TO "TicketStatus_old";
ALTER TYPE "TicketStatus_new" RENAME TO "TicketStatus";
DROP TYPE "TicketStatus_old";
ALTER TABLE "Ticket" ALTER COLUMN "status" SET DEFAULT 'PENDING';
COMMIT;

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_eventId_fkey";

-- DropForeignKey
ALTER TABLE "Ticket" DROP CONSTRAINT "Ticket_orderId_fkey";

-- DropIndex
DROP INDEX "RefundRequest_orderId_key";

-- DropIndex
DROP INDEX "Ticket_qrCode_key";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "snapToken",
DROP COLUMN "total",
ADD COLUMN     "affiliateId" TEXT,
ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "finalAmount" INTEGER NOT NULL,
ADD COLUMN     "fulfilledAt" TIMESTAMP(3),
ADD COLUMN     "isSuspicious" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "midtransToken" TEXT,
ADD COLUMN     "paymentMethod" TEXT,
ADD COLUMN     "referralCodeUsed" TEXT,
ADD COLUMN     "suspiciousReason" TEXT,
ADD COLUMN     "totalAmount" INTEGER NOT NULL,
ALTER COLUMN "expiredAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "OrderItem" DROP COLUMN "price",
DROP COLUMN "qty",
ADD COLUMN     "quantity" INTEGER NOT NULL,
ADD COLUMN     "subtotal" INTEGER NOT NULL,
ADD COLUMN     "unitPrice" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "RefundPolicy" DROP COLUMN "daysBefore",
DROP COLUMN "percentage",
ADD COLUMN     "daysBeforeEvent" INTEGER NOT NULL,
ADD COLUMN     "refundPercent" DOUBLE PRECISION NOT NULL;

-- AlterTable
ALTER TABLE "RefundRequest" DROP COLUMN "amount",
ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "bankAccount" TEXT,
ADD COLUMN     "bankHolder" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "midtransRefundId" TEXT,
ADD COLUMN     "refundAmount" INTEGER NOT NULL,
ADD COLUMN     "refundPercent" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "ticketIds" TEXT[],
ADD COLUMN     "userId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING_REVIEW';

-- AlterTable
ALTER TABLE "Ticket" DROP COLUMN "checkedInAt",
DROP COLUMN "qrCode",
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "generatedAt" TIMESTAMP(3),
ADD COLUMN     "holderEmail" TEXT,
ADD COLUMN     "holderPhone" TEXT,
ADD COLUMN     "holderRole" TEXT,
ADD COLUMN     "isInternal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "qrEncrypted" TEXT,
ADD COLUMN     "qrImageUrl" TEXT,
ADD COLUMN     "ticketCode" TEXT NOT NULL,
ADD COLUMN     "transferCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "usedAt" TIMESTAMP(3),
ADD COLUMN     "usedGateId" TEXT,
ADD COLUMN     "waSentAt" TIMESTAMP(3),
ALTER COLUMN "eventId" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING',
ALTER COLUMN "holderName" SET NOT NULL;

-- CreateTable
CREATE TABLE "TicketTransfer" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT,
    "toEmail" TEXT NOT NULL,
    "message" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketResendLog" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TicketResendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TicketTransfer_ticketId_idx" ON "TicketTransfer"("ticketId");

-- CreateIndex
CREATE INDEX "TicketTransfer_toEmail_status_idx" ON "TicketTransfer"("toEmail", "status");

-- CreateIndex
CREATE INDEX "TicketResendLog_ticketId_sentAt_idx" ON "TicketResendLog"("ticketId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_midtransOrderId_key" ON "Order"("midtransOrderId");

-- CreateIndex
CREATE INDEX "Order_userId_status_idx" ON "Order"("userId", "status");

-- CreateIndex
CREATE INDEX "Order_eventId_status_idx" ON "Order"("eventId", "status");

-- CreateIndex
CREATE INDEX "Order_status_expiredAt_idx" ON "Order"("status", "expiredAt");

-- CreateIndex
CREATE INDEX "Order_midtransOrderId_idx" ON "Order"("midtransOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "RefundPolicy_eventId_daysBeforeEvent_key" ON "RefundPolicy"("eventId", "daysBeforeEvent");

-- CreateIndex
CREATE INDEX "RefundRequest_orderId_idx" ON "RefundRequest"("orderId");

-- CreateIndex
CREATE INDEX "RefundRequest_status_createdAt_idx" ON "RefundRequest"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Ticket_ticketCode_key" ON "Ticket"("ticketCode");

-- CreateIndex
CREATE INDEX "Ticket_userId_status_idx" ON "Ticket"("userId", "status");

-- CreateIndex
CREATE INDEX "Ticket_orderId_idx" ON "Ticket"("orderId");

-- CreateIndex
CREATE INDEX "Ticket_ticketCode_idx" ON "Ticket"("ticketCode");

-- CreateIndex
CREATE INDEX "Ticket_status_categoryId_idx" ON "Ticket"("status", "categoryId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketTransfer" ADD CONSTRAINT "TicketTransfer_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
