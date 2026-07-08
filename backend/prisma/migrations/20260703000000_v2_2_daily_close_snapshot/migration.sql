-- CreateTable
CREATE TABLE "DailyCloseSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "cashSessionId" TEXT,
    "date" DATETIME NOT NULL,
    "totalSales" REAL NOT NULL DEFAULT 0,
    "totalReturns" REAL NOT NULL DEFAULT 0,
    "totalExpenses" REAL NOT NULL DEFAULT 0,
    "totalTax" REAL NOT NULL DEFAULT 0,
    "netSales" REAL NOT NULL DEFAULT 0,
    "grossProfit" REAL NOT NULL DEFAULT 0,
    "expectedCash" REAL NOT NULL DEFAULT 0,
    "closeAmount" REAL,
    "difference" REAL,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyCloseSnapshot_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCloseSnapshot_businessId_date_key" ON "DailyCloseSnapshot"("businessId", "date");

-- CreateIndex
CREATE INDEX "DailyCloseSnapshot_businessId_createdAt_idx" ON "DailyCloseSnapshot"("businessId", "createdAt");
