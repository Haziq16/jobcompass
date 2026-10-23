ALTER TABLE "ApplicationFillSession" ADD COLUMN "submissionAllowed" BOOLEAN NOT NULL DEFAULT false, ADD COLUMN "taskId" TEXT;
CREATE TABLE "AutomationSettings" ("workspaceId" TEXT PRIMARY KEY,"values" JSONB NOT NULL,"revision" INTEGER NOT NULL DEFAULT 1,"updatedAt" TIMESTAMP(3) NOT NULL);
CREATE TABLE "AutomationTask" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL,"catalogId" TEXT NOT NULL,"identity" TEXT NOT NULL,"targetUrl" TEXT NOT NULL,"country" TEXT NOT NULL,"resumeAssetId" TEXT NOT NULL,"submit" BOOLEAN NOT NULL DEFAULT false,"state" TEXT NOT NULL DEFAULT 'queued',"leaseHash" TEXT,"leaseUntil" TIMESTAMP(3),"sessionId" TEXT,"detail" TEXT,"revision" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "AutomationTask_state_check" CHECK ("state" IN ('queued','leased','needs_input','submitting','confirmed','failed','uncertain','cancelled','filled')));
CREATE UNIQUE INDEX "AutomationTask_workspaceId_identity_key" ON "AutomationTask"("workspaceId","identity");
CREATE UNIQUE INDEX "AutomationTask_workspaceId_id_key" ON "AutomationTask"("workspaceId","id");
CREATE INDEX "AutomationTask_state_createdAt_idx" ON "AutomationTask"("state","createdAt");
CREATE TABLE "ApplicationSubmission" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL,"identity" TEXT NOT NULL,"catalogId" TEXT NOT NULL,"sessionId" TEXT NOT NULL,"applicationId" TEXT NOT NULL,"state" TEXT NOT NULL DEFAULT 'submitting',"fingerprint" TEXT NOT NULL,"evidence" JSONB,"revision" INTEGER NOT NULL DEFAULT 1,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,
CONSTRAINT "ApplicationSubmission_state_check" CHECK ("state" IN ('submitting','confirmed','failed','uncertain','resolved_not_submitted')));
CREATE UNIQUE INDEX "ApplicationSubmission_workspaceId_identity_key" ON "ApplicationSubmission"("workspaceId","identity");
CREATE UNIQUE INDEX "ApplicationSubmission_workspaceId_id_key" ON "ApplicationSubmission"("workspaceId","id");
CREATE INDEX "ApplicationSubmission_workspaceId_createdAt_idx" ON "ApplicationSubmission"("workspaceId","createdAt");
CREATE TABLE "AutomationEvent" ("id" TEXT PRIMARY KEY,"workspaceId" TEXT NOT NULL,"taskId" TEXT,"kind" TEXT NOT NULL,"message" TEXT NOT NULL,"seenAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE UNIQUE INDEX "AutomationEvent_workspaceId_id_key" ON "AutomationEvent"("workspaceId","id");
CREATE INDEX "AutomationEvent_workspaceId_createdAt_idx" ON "AutomationEvent"("workspaceId","createdAt");
