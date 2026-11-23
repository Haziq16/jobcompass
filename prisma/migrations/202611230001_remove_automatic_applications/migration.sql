-- Remove the automatic application system. JobCompass no longer submits
-- applications; users review and submit every application themselves.
-- Back up production before applying: these tables and columns are dropped
-- permanently. Confirmed automatic submissions were already copied into
-- "ApplicationEvent" (kind 'verified_submission') and "Application".status.
DROP TABLE "AutomationEvent";
DROP TABLE "AutomationTask";
DROP TABLE "AutomationSettings";
DROP TABLE "ApplicationSubmission";
ALTER TABLE "ApplicationFillSession" DROP COLUMN "submissionAllowed", DROP COLUMN "taskId";
