-- Constant defaults avoid rewriting descriptions. Only derived public mentions.
ALTER TABLE "CatalogJob" ADD COLUMN "skillKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "CatalogJob" ADD COLUMN "skillKeysVersion" INTEGER NOT NULL DEFAULT 0;
