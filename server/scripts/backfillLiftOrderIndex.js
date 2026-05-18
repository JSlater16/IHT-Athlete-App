"use strict";

/* One-shot: populate Lift.orderIndex for rows that landed before the
 * column existed. Walks every athlete-day in the table, sorts the
 * existing lifts by (createdAt, id) to lock in a stable order, and
 * assigns orderIndex 0..N-1.
 *
 * Idempotent: only touches rows where every lift in the day still
 * has orderIndex 0 (the default). Rows with non-zero values are
 * assumed to have been written under the new code path and left
 * alone.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { prisma } = require("../src/utils/prisma");

async function main() {
  const groups = await prisma.lift.groupBy({
    by: ["athleteId", "date"],
    _count: { _all: true }
  });

  const blockNumber = (label) => {
    const match = /^Block\s+(\d+)$/i.exec(label || "");
    return match ? Number(match[1]) : -1;
  };

  let daysProcessed = 0;
  let liftsUpdated = 0;
  for (const g of groups) {
    const lifts = await prisma.lift.findMany({
      where: { athleteId: g.athleteId, date: g.date },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, blockLabel: true, orderIndex: true }
    });
    // Skip days that already have a non-zero orderIndex anywhere —
    // they've been written under the new code.
    if (lifts.some((l) => l.orderIndex !== 0)) continue;
    // Sort by block number first so "Block 1 < Block 2 < Block 10"
    // wins over the lexical fallback. Within a block, lock in the
    // existing (createdAt, id) order so manual ordering survives.
    const sorted = [...lifts].sort((a, b) => {
      const diff = blockNumber(a.blockLabel) - blockNumber(b.blockLabel);
      if (diff !== 0) return diff;
      return 0; // existing order preserved by findMany sort above
    });
    for (let i = 0; i < sorted.length; i += 1) {
      await prisma.lift.update({
        where: { id: sorted[i].id },
        data: { orderIndex: i }
      });
      liftsUpdated += 1;
    }
    daysProcessed += 1;
  }
  console.log(
    `[lift-order] processed ${daysProcessed} day-groups, updated ${liftsUpdated} lifts`
  );
}

main()
  .catch((err) => {
    console.error("[lift-order] backfill failed:", err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
