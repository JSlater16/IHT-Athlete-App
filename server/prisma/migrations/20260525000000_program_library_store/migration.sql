-- Move the program library out of the ephemeral filesystem and into
-- Postgres. The library is a single document (lift catalog + program
-- templates + misc workouts) that's read+written as a whole, so a
-- single-row table with a Json blob is the simplest shape that
-- survives Render restarts. id is pinned to 1 so reads/writes always
-- target the same row; first-ever read seeds this from the checked-in
-- JSON file.

CREATE TABLE "ProgramLibraryStore" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "data" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProgramLibraryStore_pkey" PRIMARY KEY ("id")
);
