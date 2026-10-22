-- Additive scheduling index. No private account data or existing jobs are altered.
CREATE INDEX "CatalogBoard_enabled_nextFetchAt_idx" ON "CatalogBoard"("enabled", "nextFetchAt");
