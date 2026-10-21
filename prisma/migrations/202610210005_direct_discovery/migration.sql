-- Keep paid-provider units positive; public board requests are audited at zero units.
ALTER TABLE "ApiRequestLedger" DROP CONSTRAINT "positive_units";
ALTER TABLE "ApiRequestLedger" ADD CONSTRAINT "positive_units"
  CHECK ("units" > 0 OR ("units" = 0 AND "fingerprint" LIKE 'direct:%'));
