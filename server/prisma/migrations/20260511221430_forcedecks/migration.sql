-- CreateTable
CREATE TABLE "ForceDecksTest" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "testDate" TIMESTAMP(3) NOT NULL,
    "readinessScore" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'vald',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ForceDecksTest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForceDecksMetric" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "ForceDecksMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForceDecksTest_externalId_key" ON "ForceDecksTest"("externalId");

-- CreateIndex
CREATE INDEX "ForceDecksTest_athleteId_testDate_idx" ON "ForceDecksTest"("athleteId", "testDate");

-- CreateIndex
CREATE INDEX "ForceDecksMetric_metricName_idx" ON "ForceDecksMetric"("metricName");

-- CreateIndex
CREATE UNIQUE INDEX "ForceDecksMetric_testId_metricName_key" ON "ForceDecksMetric"("testId", "metricName");

-- AddForeignKey
ALTER TABLE "ForceDecksTest" ADD CONSTRAINT "ForceDecksTest_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "AthleteProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForceDecksMetric" ADD CONSTRAINT "ForceDecksMetric_testId_fkey" FOREIGN KEY ("testId") REFERENCES "ForceDecksTest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
