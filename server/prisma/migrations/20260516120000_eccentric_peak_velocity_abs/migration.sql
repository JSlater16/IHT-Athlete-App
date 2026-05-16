-- Existing eccentric_peak_velocity rows were stored signed (VALD's
-- native convention: negative because eccentric phase moves down).
-- Readiness expects positive magnitudes. Normalize historical data.
UPDATE "ForceDecksMetric"
SET "value" = ABS("value")
WHERE "metricName" = 'eccentric_peak_velocity';
