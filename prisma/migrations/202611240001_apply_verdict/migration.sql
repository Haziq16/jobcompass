-- "Should I apply?" verdict, stored with the AI review that produced it.
-- Additive only: nullable columns, no rewrite, no new index.
ALTER TABLE "AiReview"
  ADD COLUMN "verdict" JSONB,
  ADD COLUMN "verdictDecision" TEXT,
  ADD COLUMN "verdictScore" DOUBLE PRECISION;
ALTER TABLE "AiReview"
  ADD CONSTRAINT "AiReview_verdictDecision_check"
  CHECK ("verdictDecision" IS NULL OR "verdictDecision" IN ('apply', 'maybe', 'skip')),
  ADD CONSTRAINT "AiReview_verdictScore_check"
  CHECK ("verdictScore" IS NULL OR ("verdictScore" >= 0 AND "verdictScore" <= 5));
