-- CreateIndex
CREATE INDEX "Transaction_businessId_type_createdAt_idx" ON "Transaction"("businessId", "type", "createdAt");
