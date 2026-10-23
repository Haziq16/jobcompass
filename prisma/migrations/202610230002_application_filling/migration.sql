CREATE TABLE "ApplicationFillSession" (
 "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "catalogId" TEXT NOT NULL,
 "targetUrl" TEXT NOT NULL, "resumeAssetId" TEXT NOT NULL, "resumeHash" TEXT NOT NULL,
 "profileRevision" INTEGER NOT NULL, "country" TEXT NOT NULL, "grantHash" TEXT NOT NULL,
 "state" TEXT NOT NULL DEFAULT 'ready', "scanHash" TEXT, "scan" JSONB, "report" JSONB,
 "revision" INTEGER NOT NULL DEFAULT 1, "expiresAt" TIMESTAMP(3) NOT NULL,
 "revokedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ApplicationFillSession_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "ApplicationFillSession_state_check" CHECK ("state" IN ('ready','filling','needs_input','filled','failed','revoked'))
);
CREATE UNIQUE INDEX "ApplicationFillSession_grantHash_key" ON "ApplicationFillSession"("grantHash");
CREATE UNIQUE INDEX "ApplicationFillSession_workspaceId_id_key" ON "ApplicationFillSession"("workspaceId","id");
CREATE INDEX "ApplicationFillSession_workspaceId_catalogId_createdAt_idx" ON "ApplicationFillSession"("workspaceId","catalogId","createdAt");
