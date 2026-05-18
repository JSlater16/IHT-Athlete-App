"use strict";

/* One-shot migration: convert AthleteProfile.programVariant for
 * non-Eccentrics athletes from the literal "Standard" to the name of
 * the program they were actually being assigned. The variant picker
 * is now name-keyed for every phase except Eccentrics; without this
 * migration, existing athletes would render with a programVariant
 * value that no longer matches any picker option.
 *
 * Idempotent: only touches rows where programVariant is exactly
 * "Standard" and a matching legacy program (variant=Standard) exists
 * at (phase, programmingDays).
 *
 * Runs on every Render boot. Tens of rows max, sub-second.
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { prisma } = require("../src/utils/prisma");
const { readProgramLibrary } = require("../src/utils/programLibrary");

const STANDARD = "Standard";

async function main() {
  const library = await readProgramLibrary();
  const candidates = await prisma.athleteProfile.findMany({
    where: {
      programVariant: STANDARD,
      phase: { not: "Eccentrics" }
    },
    select: { id: true, phase: true, programmingDays: true }
  });

  let updated = 0;
  let skipped = 0;
  for (const a of candidates) {
    const legacy = library.programs.find(
      (p) =>
        p.phase === a.phase &&
        Number(p.frequency) === Number(a.programmingDays) &&
        (p.variant || STANDARD) === STANDARD
    );
    if (!legacy) {
      skipped += 1;
      continue;
    }
    await prisma.athleteProfile.update({
      where: { id: a.id },
      data: { programVariant: legacy.name }
    });
    updated += 1;
  }
  console.log(
    `[program-variant] migrated ${updated}/${candidates.length} athletes (skipped ${skipped} with no matching legacy program)`
  );
}

main()
  .catch((err) => {
    console.error("[program-variant] migration failed:", err.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
