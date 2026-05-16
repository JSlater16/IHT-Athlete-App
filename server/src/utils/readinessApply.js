"use strict";

const { prisma } = require("./prisma");
const {
  calculateReadiness,
  BASELINE_WINDOW_DAYS
} = require("./readiness");

// Convert a Prisma ForceDecksTest row (with metrics included) into the
// shape calculateReadiness expects.
function shapeTest(row) {
  const metrics = {};
  for (const m of row.metrics || []) metrics[m.metricName] = m.value;
  return { id: row.id, testDate: row.testDate, metrics };
}

// Compute readiness for a single test by fetching its sibling prior
// tests in the 14-day window and writing the result back. Returns the
// readiness result object (or null if the test wasn't found). Errors
// are caught and logged; readiness failures must never break ingest.
async function computeAndApplyReadiness(testId) {
  try {
    const test = await prisma.forceDecksTest.findUnique({
      where: { id: testId },
      include: { metrics: true }
    });
    if (!test) return null;

    const cutoff = new Date(
      test.testDate.getTime() - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const priors = await prisma.forceDecksTest.findMany({
      where: {
        athleteId: test.athleteId,
        id: { not: test.id },
        testDate: { gte: cutoff, lt: test.testDate }
      },
      include: { metrics: true }
    });

    const result = calculateReadiness(
      shapeTest(test),
      priors.map(shapeTest)
    );

    const displayed = result.score != null ? Math.round(result.score) : null;
    await prisma.forceDecksTest.update({
      where: { id: test.id },
      data: { readinessScore: displayed, readinessDetails: result }
    });
    return result;
  } catch (err) {
    console.error("[readiness] compute failed for test", testId, err.message);
    return null;
  }
}

module.exports = { computeAndApplyReadiness, shapeTest };
