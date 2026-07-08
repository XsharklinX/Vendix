CREATE TABLE "SyncDevice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" TEXT,
    "deviceKey" TEXT NOT NULL,
    "lastSeenAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncDevice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "SyncChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "deviceId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "conflictPolicy" TEXT NOT NULL DEFAULT 'LAST_WRITE_WINS',
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SyncChange_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SyncDevice_businessId_deviceKey_key" ON "SyncDevice"("businessId", "deviceKey");
CREATE INDEX "SyncDevice_businessId_lastSeenAt_idx" ON "SyncDevice"("businessId", "lastSeenAt");
CREATE INDEX "SyncChange_businessId_createdAt_idx" ON "SyncChange"("businessId", "createdAt");
CREATE INDEX "SyncChange_businessId_entity_entityId_idx" ON "SyncChange"("businessId", "entity", "entityId");
CREATE INDEX "SyncChange_businessId_deviceId_createdAt_idx" ON "SyncChange"("businessId", "deviceId", "createdAt");
