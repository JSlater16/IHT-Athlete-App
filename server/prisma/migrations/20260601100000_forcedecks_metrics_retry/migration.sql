-- Track tests whose readiness inputs landed incomplete (VALD's analytics
-- pipeline computes time-derivative metrics like concentric_rfd
-- asynchronously, so the first sync sometimes stores 0). The retry
-- processor re-fetches trials on a 30m / 6h / 24h schedule until all
-- four readiness metrics are present or we give up.
ALTER TABLE "ForceDecksTest" ADD COLUMN "metricsRetryAt" TIMESTAMP(3);
ALTER TABLE "ForceDecksTest" ADD COLUMN "metricsRetryCount" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "ForceDecksTest_metricsRetryAt_idx" ON "ForceDecksTest"("metricsRetryAt");
