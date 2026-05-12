-- AlterTable
ALTER TABLE "AthleteProfile" ADD COLUMN "valdProfileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "AthleteProfile_valdProfileId_key" ON "AthleteProfile"("valdProfileId");
