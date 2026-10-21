-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "titles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "locations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "excluded" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "years" DOUBLE PRECISION,
    "arrangement" TEXT NOT NULL DEFAULT 'any',
    "aliases" JSONB NOT NULL DEFAULT '{}',
    "cvText" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'owner',
    "allowance" INTEGER NOT NULL DEFAULT 200,
    "budget" INTEGER NOT NULL DEFAULT 180,
    "dailyCap" INTEGER NOT NULL DEFAULT 6,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
    "cacheHours" INTEGER NOT NULL DEFAULT 12,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "adjustment" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "description" TEXT,
    "remote" BOOLEAN,
    "employmentType" TEXT,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryText" TEXT,
    "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "publishedAt" TIMESTAMP(3),
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastFetched" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "relatedFingerprint" TEXT NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "publisher" TEXT,
    "sourceUrl" TEXT,
    "applyLinks" JSONB NOT NULL,
    "primaryUrl" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchDefinition" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRun" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "nextCursor" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SearchRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchRunJob" (
    "runId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "SearchRunJob_pkey" PRIMARY KEY ("runId","jobId")
);

-- CreateTable
CREATE TABLE "ApiRequestLedger" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "units" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'reserved',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "providerStatus" INTEGER,
    "errorCategory" TEXT,
    "runId" TEXT,

    CONSTRAINT "ApiRequestLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FetchIntent" (
    "key" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "ledgerId" TEXT,
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FetchIntent_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SavedJob" (
    "jobId" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedJob_pkey" PRIMARY KEY ("jobId")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Saved',
    "notes" TEXT NOT NULL DEFAULT '',
    "url" TEXT,
    "appliedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Job_lastFetched_idx" ON "Job"("lastFetched");

-- CreateIndex
CREATE INDEX "Job_country_remote_hidden_idx" ON "Job"("country", "remote", "hidden");

-- CreateIndex
CREATE INDEX "Job_relatedFingerprint_idx" ON "Job"("relatedFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_providerId_key" ON "JobSource"("providerId");

-- CreateIndex
CREATE INDEX "JobSource_primaryUrl_idx" ON "JobSource"("primaryUrl");

-- CreateIndex
CREATE INDEX "SearchRun_fingerprint_expiresAt_idx" ON "SearchRun"("fingerprint", "expiresAt");

-- CreateIndex
CREATE INDEX "SearchRunJob_jobId_idx" ON "SearchRunJob"("jobId");

-- CreateIndex
CREATE INDEX "ApiRequestLedger_cycleId_state_idx" ON "ApiRequestLedger"("cycleId", "state");

-- CreateIndex
CREATE INDEX "ApiRequestLedger_dayKey_state_idx" ON "ApiRequestLedger"("dayKey", "state");

-- CreateIndex
CREATE INDEX "ApiRequestLedger_fingerprint_state_idx" ON "ApiRequestLedger"("fingerprint", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Application_jobId_key" ON "Application"("jobId");

-- CreateIndex
CREATE INDEX "Application_status_idx" ON "Application"("status");

-- AddForeignKey
ALTER TABLE "JobSource" ADD CONSTRAINT "JobSource_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRunJob" ADD CONSTRAINT "SearchRunJob_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SearchRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchRunJob" ADD CONSTRAINT "SearchRunJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiRequestLedger" ADD CONSTRAINT "ApiRequestLedger_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchIntent" ADD CONSTRAINT "FetchIntent_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "ApiRequestLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FetchIntent" ADD CONSTRAINT "FetchIntent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SearchRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedJob" ADD CONSTRAINT "SavedJob_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
