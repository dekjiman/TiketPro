ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'ORDER';

UPDATE "Ticket"
SET "source" = 'MANUAL'
WHERE "isInternal" = TRUE;

CREATE INDEX IF NOT EXISTS "Ticket_source_idx" ON "Ticket"("source");
