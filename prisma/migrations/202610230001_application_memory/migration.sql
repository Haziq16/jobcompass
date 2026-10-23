CREATE TABLE "CandidateProfile" (
 "workspaceId" TEXT PRIMARY KEY, "values" JSONB NOT NULL, "confirmations" JSONB NOT NULL,
 "revision" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ApplicationAnswer" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "question" TEXT NOT NULL,
 "canonicalKey" TEXT NOT NULL, "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
 "category" TEXT NOT NULL, "answer" TEXT NOT NULL, "country" TEXT, "company" TEXT,
 "catalogId" TEXT, "reusable" BOOLEAN NOT NULL DEFAULT true, "sourceHash" TEXT,
 "verifiedAt" TIMESTAMP(3) NOT NULL, "expiresAt" TIMESTAMP(3), "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "ApplicationAnswer_workspaceId_id_key" ON "ApplicationAnswer"("workspaceId","id");
CREATE INDEX "ApplicationAnswer_workspaceId_canonicalKey_idx" ON "ApplicationAnswer"("workspaceId","canonicalKey");
CREATE INDEX "ApplicationAnswer_workspaceId_updatedAt_idx" ON "ApplicationAnswer"("workspaceId","updatedAt");
CREATE TABLE "ApplicationQuestion" (
 "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "fingerprint" TEXT NOT NULL,
 "question" TEXT NOT NULL, "country" TEXT, "company" TEXT, "catalogId" TEXT,
 "state" TEXT NOT NULL DEFAULT 'open', "answerId" TEXT, "revision" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ApplicationQuestion_state_check" CHECK ("state" IN ('open','answered','dismissed'))
);
CREATE UNIQUE INDEX "ApplicationQuestion_workspaceId_fingerprint_key" ON "ApplicationQuestion"("workspaceId","fingerprint");
CREATE UNIQUE INDEX "ApplicationQuestion_workspaceId_id_key" ON "ApplicationQuestion"("workspaceId","id");
CREATE INDEX "ApplicationQuestion_workspaceId_state_updatedAt_idx" ON "ApplicationQuestion"("workspaceId","state","updatedAt");
