BEGIN;
-- DropForeignKey
ALTER TABLE "JobSource" DROP CONSTRAINT "JobSource_jobId_fkey";

-- DropForeignKey
ALTER TABLE "SearchRunJob" DROP CONSTRAINT "SearchRunJob_runId_fkey";

-- DropForeignKey
ALTER TABLE "SearchRunJob" DROP CONSTRAINT "SearchRunJob_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ApiRequestLedger" DROP CONSTRAINT "ApiRequestLedger_runId_fkey";

-- DropForeignKey
ALTER TABLE "FetchIntent" DROP CONSTRAINT "FetchIntent_ledgerId_fkey";

-- DropForeignKey
ALTER TABLE "FetchIntent" DROP CONSTRAINT "FetchIntent_runId_fkey";

-- DropForeignKey
ALTER TABLE "SavedJob" DROP CONSTRAINT "SavedJob_jobId_fkey";

-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_jobId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationEvent" DROP CONSTRAINT "ApplicationEvent_applicationId_fkey";

-- DropForeignKey
ALTER TABLE "AiGeneration" DROP CONSTRAINT "AiGeneration_jobId_fkey";

-- DropForeignKey
ALTER TABLE "AiGeneration" DROP CONSTRAINT "AiGeneration_profileVersionId_fkey";

-- DropForeignKey
ALTER TABLE "DocumentDraft" DROP CONSTRAINT "DocumentDraft_generationId_fkey";

-- DropForeignKey
ALTER TABLE "ApplicationAttempt" DROP CONSTRAINT "ApplicationAttempt_applicationId_fkey";

-- DropIndex
DROP INDEX "JobSource_providerId_key";

-- DropIndex
ALTER TABLE "AiGeneration" DROP CONSTRAINT "AiGeneration_requestKey_key";

-- DropIndex
ALTER TABLE "AiGeneration" DROP CONSTRAINT "AiGeneration_fingerprint_key";

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "JobSource" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "SearchDefinition" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "SearchRun" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "SearchRunJob" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ApiRequestLedger" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "FetchIntent" DROP CONSTRAINT "FetchIntent_pkey",
ADD COLUMN     "id" TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local',
ADD CONSTRAINT "FetchIntent_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "SavedJob" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ApplicationEvent" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ProfileVersion" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ResumeAsset" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "AiGeneration" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "DocumentDraft" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- AlterTable
ALTER TABLE "ApplicationAttempt" ADD COLUMN     "workspaceId" TEXT NOT NULL DEFAULT 'local';

-- Preserve the original private workspace under its existing account.
UPDATE "Profile" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "Profile" SET id = "workspaceId" WHERE id = 'owner';
UPDATE "Settings" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "Settings" SET id = "workspaceId" WHERE id = 'owner';
UPDATE "Job" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "JobSource" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "SearchDefinition" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "SearchRun" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "SearchRunJob" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "ApiRequestLedger" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "FetchIntent" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "SavedJob" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "Application" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "ApplicationEvent" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "ProfileVersion" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "ResumeAsset" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "AiGeneration" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "DocumentDraft" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
UPDATE "ApplicationAttempt" SET "workspaceId" = COALESCE((SELECT id FROM "User" ORDER BY "createdAt" ASC LIMIT 1), 'local');
-- CreateIndex
CREATE INDEX "Profile_workspaceId_idx" ON "Profile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Profile_workspaceId_id_key" ON "Profile"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Settings_workspaceId_idx" ON "Settings"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Settings_workspaceId_id_key" ON "Settings"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "Job_workspaceId_idx" ON "Job"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Job_workspaceId_id_key" ON "Job"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "JobSource_workspaceId_idx" ON "JobSource"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_workspaceId_providerId_key" ON "JobSource"("workspaceId", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_workspaceId_id_key" ON "JobSource"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "SearchDefinition_workspaceId_idx" ON "SearchDefinition"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchDefinition_workspaceId_id_key" ON "SearchDefinition"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "SearchRun_workspaceId_idx" ON "SearchRun"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SearchRun_workspaceId_id_key" ON "SearchRun"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "SearchRunJob_workspaceId_idx" ON "SearchRunJob"("workspaceId");

-- CreateIndex
CREATE INDEX "ApiRequestLedger_workspaceId_idx" ON "ApiRequestLedger"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiRequestLedger_workspaceId_id_key" ON "ApiRequestLedger"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "FetchIntent_workspaceId_idx" ON "FetchIntent"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "FetchIntent_workspaceId_key_key" ON "FetchIntent"("workspaceId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "FetchIntent_workspaceId_id_key" ON "FetchIntent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "SavedJob_workspaceId_idx" ON "SavedJob"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedJob_workspaceId_jobId_key" ON "SavedJob"("workspaceId", "jobId");

-- CreateIndex
CREATE INDEX "Application_workspaceId_idx" ON "Application"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Application_workspaceId_id_key" ON "Application"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Application_workspaceId_jobId_key" ON "Application"("workspaceId", "jobId");

-- CreateIndex
CREATE INDEX "ApplicationEvent_workspaceId_idx" ON "ApplicationEvent"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationEvent_workspaceId_id_key" ON "ApplicationEvent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ProfileVersion_workspaceId_idx" ON "ProfileVersion"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileVersion_workspaceId_id_key" ON "ProfileVersion"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ResumeAsset_workspaceId_idx" ON "ResumeAsset"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ResumeAsset_workspaceId_id_key" ON "ResumeAsset"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "AiGeneration_workspaceId_idx" ON "AiGeneration"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AiGeneration_workspaceId_requestKey_key" ON "AiGeneration"("workspaceId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "AiGeneration_workspaceId_fingerprint_key" ON "AiGeneration"("workspaceId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "AiGeneration_workspaceId_id_key" ON "AiGeneration"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "DocumentDraft_workspaceId_idx" ON "DocumentDraft"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentDraft_workspaceId_id_key" ON "DocumentDraft"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "ApplicationAttempt_workspaceId_idx" ON "ApplicationAttempt"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApplicationAttempt_workspaceId_id_key" ON "ApplicationAttempt"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "Job"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRunJob" ADD CONSTRAINT "SearchRunJob_workspaceId_runId_fkey" FOREIGN KEY ("workspaceId", "runId") REFERENCES "SearchRun"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRunJob" ADD CONSTRAINT "SearchRunJob_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "Job"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequestLedger" ADD CONSTRAINT "ApiRequestLedger_workspaceId_runId_fkey" FOREIGN KEY ("workspaceId", "runId") REFERENCES "SearchRun"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchIntent" ADD CONSTRAINT "FetchIntent_workspaceId_ledgerId_fkey" FOREIGN KEY ("workspaceId", "ledgerId") REFERENCES "ApiRequestLedger"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchIntent" ADD CONSTRAINT "FetchIntent_workspaceId_runId_fkey" FOREIGN KEY ("workspaceId", "runId") REFERENCES "SearchRun"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "Job"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "Job"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_workspaceId_applicationId_fkey" FOREIGN KEY ("workspaceId", "applicationId") REFERENCES "Application"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_workspaceId_jobId_fkey" FOREIGN KEY ("workspaceId", "jobId") REFERENCES "Job"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiGeneration" ADD CONSTRAINT "AiGeneration_workspaceId_profileVersionId_fkey" FOREIGN KEY ("workspaceId", "profileVersionId") REFERENCES "ProfileVersion"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentDraft" ADD CONSTRAINT "DocumentDraft_workspaceId_generationId_fkey" FOREIGN KEY ("workspaceId", "generationId") REFERENCES "AiGeneration"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAttempt" ADD CONSTRAINT "ApplicationAttempt_workspaceId_applicationId_fkey" FOREIGN KEY ("workspaceId", "applicationId") REFERENCES "Application"("workspaceId", "id") ON DELETE CASCADE ON UPDATE CASCADE;


DROP INDEX IF EXISTS "ResumeAsset_one_default";
CREATE UNIQUE INDEX "ResumeAsset_one_default" ON "ResumeAsset" ("workspaceId") WHERE "isDefault" = true;
COMMIT;
