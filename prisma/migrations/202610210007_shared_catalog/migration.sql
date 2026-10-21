CREATE TABLE "CatalogBoard" (
 "id" TEXT PRIMARY KEY, "platform" TEXT NOT NULL, "token" TEXT NOT NULL,
 "name" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
 "jobCount" INTEGER NOT NULL DEFAULT 0, "initialIndexedAt" TIMESTAMP(3),
 "lastSuccessAt" TIMESTAMP(3), "lastAttemptAt" TIMESTAMP(3),
 "nextFetchAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "etag" TEXT, "modified" TEXT, "failures" INTEGER NOT NULL DEFAULT 0, "error" TEXT
);
CREATE TABLE "CatalogJob" (
 "id" TEXT PRIMARY KEY, "boardId" TEXT NOT NULL REFERENCES "CatalogBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "providerId" TEXT NOT NULL UNIQUE, "title" TEXT NOT NULL, "employer" TEXT NOT NULL,
 "location" TEXT, "country" TEXT, "remote" BOOLEAN, "employmentType" TEXT,
 "department" TEXT, "description" TEXT, "salaryText" TEXT, "sourceUrl" TEXT NOT NULL,
 "applyUrl" TEXT NOT NULL, "publishedAt" TIMESTAMP(3),
 "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "discoveredAfterBaseline" BOOLEAN NOT NULL DEFAULT false,
 "active" BOOLEAN NOT NULL DEFAULT true, "hash" TEXT NOT NULL, "searchText" TEXT NOT NULL
);
CREATE INDEX "CatalogJob_active_publishedAt_idx" ON "CatalogJob"("active","publishedAt");
CREATE INDEX "CatalogJob_active_firstSeen_idx" ON "CatalogJob"("active","firstSeen");
CREATE INDEX "CatalogJob_boardId_active_idx" ON "CatalogJob"("boardId","active");
CREATE INDEX "CatalogJob_employer_idx" ON "CatalogJob"("employer");
CREATE INDEX "CatalogJob_search_idx" ON "CatalogJob" USING GIN (to_tsvector('simple', "searchText"));
CREATE TABLE "CatalogSync" (
 "id" TEXT PRIMARY KEY, "leaseUntil" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "startedAt" TIMESTAMP(3), "finishedAt" TIMESTAMP(3)
);
