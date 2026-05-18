-- Add a stable within-day display order for lifts. apply-program
-- populates this sequentially from the program template; manually
-- created lifts get the next available index for their day.
ALTER TABLE "Lift" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;
