-- Add a per-test body weight (kg) column populated from the VALD test
-- payload. Coach-only field; athlete endpoints never include it.
ALTER TABLE "ForceDecksTest" ADD COLUMN "bodyMass" DOUBLE PRECISION;
