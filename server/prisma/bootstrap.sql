PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "password" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "AthleteProfile" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "phase" TEXT NOT NULL,
  "phaseStartedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "coachNotes" TEXT NOT NULL DEFAULT '',
  "rehabProfile" TEXT NOT NULL DEFAULT '{"inhibitedMuscles":[],"padPlacementImages":[]}',
  "programmingDays" INTEGER NOT NULL DEFAULT 3,
  "trainingModel" TEXT NOT NULL DEFAULT '10-Week',
  "programVariant" TEXT NOT NULL DEFAULT 'Standard',
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AthleteProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "AthleteProfile_userId_key" ON "AthleteProfile"("userId");

CREATE TABLE IF NOT EXISTS "Lift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "athleteId" TEXT NOT NULL,
  "date" DATETIME NOT NULL,
  "blockLabel" TEXT NOT NULL DEFAULT '',
  "exerciseName" TEXT NOT NULL,
  "sets" INTEGER NOT NULL,
  "reps" INTEGER NOT NULL,
  "weight" TEXT NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Lift_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Lift_athleteId_date_idx" ON "Lift"("athleteId", "date");

CREATE TABLE IF NOT EXISTS "RehabNote" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "athleteId" TEXT NOT NULL,
  "note" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RehabNote_athleteId_fkey"
    FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "RehabNote_athleteId_createdAt_idx" ON "RehabNote"("athleteId", "createdAt");
