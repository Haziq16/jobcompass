CREATE TABLE "AiCvDraft" (
  "workspaceId" TEXT NOT NULL DEFAULT 'local', "id" TEXT NOT NULL,
  "reviewId" TEXT NOT NULL, "requestKey" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
  "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT, "document" JSONB, "content" TEXT, "revision" INTEGER NOT NULL DEFAULT 1,
  "approvedHash" TEXT, "inputTokens" INTEGER, "outputTokens" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiCvDraft_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AiCvDraft_workspaceId_reviewId_fkey" FOREIGN KEY ("workspaceId","reviewId") REFERENCES "AiReview"("workspaceId","id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AiCvDraft_workspaceId_requestKey_key" ON "AiCvDraft"("workspaceId","requestKey");
CREATE UNIQUE INDEX "AiCvDraft_workspaceId_id_key" ON "AiCvDraft"("workspaceId","id");
CREATE INDEX "AiCvDraft_workspaceId_reviewId_createdAt_idx" ON "AiCvDraft"("workspaceId","reviewId","createdAt");
