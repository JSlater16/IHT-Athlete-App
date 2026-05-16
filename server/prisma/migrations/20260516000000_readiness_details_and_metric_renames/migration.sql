-- Add JSON column for the readiness breakdown (raw_score, confidence,
-- status, baselines, deltas, n_baseline_tests). readinessScore stays
-- as the rounded displayed score for backward-compat with existing UI.
ALTER TABLE "ForceDecksTest" ADD COLUMN "readinessDetails" JSONB;

-- Rename two stored metric keys to match the readiness equation's
-- canonical names. No-op if no rows exist with the old key.
UPDATE "ForceDecksMetric"
SET "metricName" = 'force_at_zero_velocity'
WHERE "metricName" = 'force_at_0_velocity';

UPDATE "ForceDecksMetric"
SET "metricName" = 'concentric_impulse_at_100ms'
WHERE "metricName" = 'concentric_impulse_100ms';
