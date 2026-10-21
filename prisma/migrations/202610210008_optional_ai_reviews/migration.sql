CREATE TABLE "AiReview" (
 "workspaceId" TEXT NOT NULL DEFAULT 'local', "id" TEXT NOT NULL PRIMARY KEY,
 "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "jobSnapshot" JSONB NOT NULL,
 "resumeSnapshot" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
 "error" TEXT, "report" JSONB, "checks" JSONB NOT NULL, "inputTokens" INTEGER,
 "outputTokens" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "AiReview_workspaceId_requestKey_key" ON "AiReview"("workspaceId","requestKey");
CREATE UNIQUE INDEX "AiReview_workspaceId_id_key" ON "AiReview"("workspaceId","id");
CREATE INDEX "AiReview_workspaceId_createdAt_idx" ON "AiReview"("workspaceId","createdAt");
