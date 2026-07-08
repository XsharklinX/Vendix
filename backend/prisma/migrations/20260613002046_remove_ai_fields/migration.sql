/*
  Warnings:

  - You are about to drop the column `aiApiKeyEnc` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `aiModel` on the `Business` table. All the data in the column will be lost.
  - You are about to drop the column `aiProvider` on the `Business` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Business" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "address" TEXT,
    "city" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'DOP',
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "taxRate" REAL NOT NULL DEFAULT 0.18,
    "taxName" TEXT NOT NULL DEFAULT 'ITBIS',
    "taxIncluded" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "stripeSubscriptionId" TEXT,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'inactive',
    "subscriptionEndsAt" DATETIME,
    "ncfType" TEXT,
    "ncfSequence" INTEGER NOT NULL DEFAULT 1,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'FAC',
    "invoiceSequence" INTEGER NOT NULL DEFAULT 1,
    "invoiceTemplate" TEXT NOT NULL DEFAULT 'classic',
    "logoUrl" TEXT,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoBackupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoBackupInterval" INTEGER NOT NULL DEFAULT 7,
    "lastBackupAt" DATETIME,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Business_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Business" ("address", "autoBackupEnabled", "autoBackupInterval", "city", "createdAt", "currency", "email", "id", "invoicePrefix", "invoiceSequence", "invoiceTemplate", "lastBackupAt", "logoUrl", "lowStockThreshold", "name", "ncfSequence", "ncfType", "phone", "plan", "stripeSubscriptionId", "subscriptionEndsAt", "subscriptionStatus", "taxId", "taxIncluded", "taxName", "taxRate", "type", "updatedAt", "userId", "whatsappEnabled") SELECT "address", "autoBackupEnabled", "autoBackupInterval", "city", "createdAt", "currency", "email", "id", "invoicePrefix", "invoiceSequence", "invoiceTemplate", "lastBackupAt", "logoUrl", "lowStockThreshold", "name", "ncfSequence", "ncfType", "phone", "plan", "stripeSubscriptionId", "subscriptionEndsAt", "subscriptionStatus", "taxId", "taxIncluded", "taxName", "taxRate", "type", "updatedAt", "userId", "whatsappEnabled" FROM "Business";
DROP TABLE "Business";
ALTER TABLE "new_Business" RENAME TO "Business";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
