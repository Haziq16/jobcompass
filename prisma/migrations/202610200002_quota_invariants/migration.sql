ALTER TABLE "Settings" ADD COLUMN "providerPaused" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "one_inflight_per_fingerprint" ON "ApiRequestLedger" ("fingerprint") WHERE "state" IN ('reserved', 'sent');
ALTER TABLE "ApiRequestLedger" ADD CONSTRAINT "positive_units" CHECK ("units" > 0);
ALTER TABLE "ApiRequestLedger" ADD CONSTRAINT "valid_ledger_state" CHECK ("state" IN ('reserved','sent','succeeded','failed','uncertain','released'));
