"use strict";

/* Import programs from a "structured" CSV where every row is one
 * programmed lift and every column is a known field. See
 * server/src/utils/csvImporter.js for the parse/build logic — this
 * file is just the CLI shell.
 *
 * Usage:
 *   node server/scripts/importStructuredProgramCsv.js <csvPath>
 */

const fs = require("fs/promises");
const {
  readProgramLibrary,
  writeProgramLibrary,
  assertValidLibrary,
  summarizeProgramLibrary
} = require("../src/utils/programLibrary");
const { applyCsvToLibrary } = require("../src/utils/csvImporter");

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node server/scripts/importStructuredProgramCsv.js <csvPath>");
    process.exit(1);
  }

  const content = await fs.readFile(csvPath, "utf8");
  const library = await readProgramLibrary();

  const { liftReport, programs } = applyCsvToLibrary(library, content);

  assertValidLibrary(library);
  await writeProgramLibrary(library);

  console.log("Imported programs:");
  for (const p of programs) {
    console.log(
      `  - ${p.id}  "${p.name}"  phase=${p.phase}  variant=${p.variant}  freq=${p.frequency}  days=${p.days.length}  lifts=${p.days.reduce((s, d) => s + d.lifts.length, 0)}`
    );
  }
  console.log(`Lift library: +${liftReport.added} new, ${liftReport.reused} reused.`);
  if (liftReport.conflicts.length > 0) {
    console.log("\nLift id/name conflicts (existing name was kept):");
    for (const c of liftReport.conflicts) {
      console.log(`  - ${c.liftId}: existing="${c.existingName}" incoming="${c.incomingName}"`);
    }
  }
  const summary = summarizeProgramLibrary(library);
  console.log(`\nLibrary now: ${summary.programCount} programs, ${summary.liftCount} lifts.`);
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  process.exit(1);
});
