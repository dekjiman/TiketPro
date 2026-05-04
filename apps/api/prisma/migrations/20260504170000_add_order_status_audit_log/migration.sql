CREATE TABLE "OrderStatusAuditLog" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "fromStatus" "OrderStatus" NOT NULL,
  "toStatus" "OrderStatus" NOT NULL,
  "source" TEXT NOT NULL,
  "reason" TEXT,
  "payloadJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderStatusAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderStatusAuditLog_orderId_createdAt_idx" ON "OrderStatusAuditLog"("orderId", "createdAt");
CREATE INDEX "OrderStatusAuditLog_toStatus_createdAt_idx" ON "OrderStatusAuditLog"("toStatus", "createdAt");

ALTER TABLE "OrderStatusAuditLog"
  ADD CONSTRAINT "OrderStatusAuditLog_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
