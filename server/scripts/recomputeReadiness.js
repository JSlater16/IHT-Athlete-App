"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { prisma } = require("../src/utils/prisma");
const { computeAndApplyReadiness } = require("../src/utils/readinessApply");

async function main() {
  const tests = await prisma.forceDecksTest.findMany({
    select: { id: true },
    orderBy: [{ athleteId: "asc" }, { testDate: "asc" }]
  });

  let scored = 0;
  let nullScore = 0;
  for (const t of tests) {
    const result = await computeAndApplyReadiness(t.id);
    if (result?.score != null) scored += 1;
    else nullScore += 1;
  }
  console.log(
    `[readiness] recomputed ${tests.length} tests (scored=${scored}, null=${nullScore})`
  );
}

main()
  .catch((err) => {
    // Never fail the deploy on a readiness recompute error — log and
    // continue so the server still boots.
    console.error("[readiness] recompute failed:", err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
