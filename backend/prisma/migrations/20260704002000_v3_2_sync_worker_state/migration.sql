ALTER TABLE "SyncChange" ADD COLUMN "syncStatus" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "SyncChange" ADD COLUMN "syncedAt" DATETIME;
ALTER TABLE "SyncChange" ADD COLUMN "remoteChangeId" TEXT;
ALTER TABLE "SyncChange" ADD COLUMN "syncError" TEXT;

CREATE INDEX "SyncChange_businessId_syncStatus_createdAt_idx" ON "SyncChange"("businessId", "syncStatus", "createdAt");
