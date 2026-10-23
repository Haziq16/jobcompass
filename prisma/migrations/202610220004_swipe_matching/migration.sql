CREATE TABLE "MatchPreferences" (
  "workspaceId" TEXT PRIMARY KEY,
  "values" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "MatchDecision" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "applyUrl" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "reason" TEXT,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MatchDecision_state_check" CHECK ("state" IN ('queued','saved','passed','removed','undone'))
);
CREATE UNIQUE INDEX "MatchDecision_workspaceId_catalogId_key" ON "MatchDecision"("workspaceId","catalogId");
CREATE INDEX "MatchDecision_workspaceId_state_priority_createdAt_idx" ON "MatchDecision"("workspaceId","state","priority","createdAt");
CREATE INDEX "MatchDecision_workspaceId_applyUrl_idx" ON "MatchDecision"("workspaceId","applyUrl");
CREATE TABLE "MatchAction" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "previous" JSONB NOT NULL,
  "afterRevision" INTEGER NOT NULL,
  "undoneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "MatchAction_workspaceId_createdAt_idx" ON "MatchAction"("workspaceId","createdAt");
