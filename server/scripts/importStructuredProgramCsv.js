"use strict";

/* Import programs from a "structured" CSV where every row is one
 * programmed lift and every column is a known field. Unlike
 * importProgramCsv.js (one CSV per day, marker-based parsing), this
 * format carries all program/day/lift metadata inline so a single
 * file can hold multiple programs.
 *
 * Required columns:
 *   program_id, program_name, program_phase, program_variant,
 *   program_frequency, day_offset, day_name, block_label, order,
 *   lift_id, exercise_name, category, sets, reps, weight, notes
 *
 * Usage:
 *   node server/scripts/importStructuredProgramCsv.js <csvPath>
 */

const fs = require("fs/promises");
const path = require("path");
const {
  readProgramLibrary,
  writeProgramLibrary,
  assertValidLibrary,
  summarizeProgramLibrary
} = require("../src/utils/programLibrary");

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const required = [
    "program_id", "program_name", "program_phase", "program_variant",
    "program_frequency", "day_offset", "day_name", "block_label", "order",
    "lift_id", "exercise_name", "category", "sets", "reps", "weight", "notes"
  ];
  for (const r of required) {
    if (!header.includes(r)) {
      throw new Error(`CSV is missing required column: ${r}`);
    }
  }
  const colIndex = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (const k of required) row[k] = cells[colIndex[k]] ?? "";
    rows.push(row);
  }
  return rows;
}

function intOr(value, fallback) {
  const m = String(value).match(/-?\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

function buildPrograms(rows) {
  const byProgram = new Map();
  for (const r of rows) {
    if (!r.program_id || !r.exercise_name) continue;
    let prog = byProgram.get(r.program_id);
    if (!prog) {
      prog = {
        id: r.program_id,
        name: r.program_name,
        phase: r.program_phase,
        variant: r.program_variant || "Standard",
        frequency: intOr(r.program_frequency, 0),
        days: new Map()
      };
      byProgram.set(r.program_id, prog);
    }
    const dayOffset = intOr(r.day_offset, 0);
    let day = prog.days.get(dayOffset);
    if (!day) {
      day = { dayOffset, dayLabel: r.day_name || "", lifts: [] };
      prog.days.set(dayOffset, day);
    }
    day.lifts.push({
      order: intOr(r.order, day.lifts.length + 1),
      liftId: r.lift_id,
      exerciseName: r.exercise_name,
      blockLabel: r.block_label || "",
      sets: intOr(r.sets, 1),
      reps: intOr(r.reps, 1),
      weight: r.weight || "Coach Prescribed",
      notes: r.notes || "",
      category: r.category || ""
    });
  }

  // Finalize: sort days by offset, lifts by order, drop the
  // sort-only "order" field from output, and drop "category" (lives
  // on the lift library entry, not the programmed lift).
  return [...byProgram.values()].map((p) => ({
    id: p.id,
    name: p.name,
    phase: p.phase,
    variant: p.variant,
    frequency: p.frequency,
    days: [...p.days.values()]
      .sort((a, b) => a.dayOffset - b.dayOffset)
      .map((d) => ({
        dayOffset: d.dayOffset,
        dayLabel: d.dayLabel,
        lifts: d.lifts
          .sort((a, b) => a.order - b.order)
          .map(({ order, category, ...rest }) => rest)
      }))
  }));
}

function mergeLiftLibrary(library, rows) {
  const byId = new Map(library.liftLibrary.map((l) => [l.id, l]));
  const conflicts = [];
  let added = 0;
  let reused = 0;
  for (const r of rows) {
    if (!r.lift_id) continue;
    const existing = byId.get(r.lift_id);
    if (existing) {
      reused += 1;
      // Sanity check: same id, different name = surface so the user
      // can decide rather than silently overwriting either side.
      if (existing.name.toLowerCase() !== r.exercise_name.toLowerCase()) {
        conflicts.push({
          liftId: r.lift_id,
          existingName: existing.name,
          incomingName: r.exercise_name
        });
      }
      continue;
    }
    const lift = {
      id: r.lift_id,
      name: r.exercise_name,
      category: r.category || "",
      defaultSets: intOr(r.sets, 1),
      defaultReps: intOr(r.reps, 1),
      defaultWeight: r.weight || "Coach Prescribed",
      defaultNotes: r.notes || ""
    };
    library.liftLibrary.push(lift);
    byId.set(lift.id, lift);
    added += 1;
  }
  return { added, reused, conflicts };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node server/scripts/importStructuredProgramCsv.js <csvPath>");
    process.exit(1);
  }

  const content = await fs.readFile(csvPath, "utf8");
  const rows = parseCsv(content);
  const library = await readProgramLibrary();

  const liftReport = mergeLiftLibrary(library, rows);
  const newPrograms = buildPrograms(rows);

  // Replace any existing program with a matching id; preserve all
  // other programs. This makes the importer idempotent — re-running
  // the same CSV updates the same programs in place.
  const existingIds = new Set(newPrograms.map((p) => p.id));
  library.programs = library.programs.filter((p) => !existingIds.has(p.id));
  library.programs.push(...newPrograms);

  assertValidLibrary(library);
  await writeProgramLibrary(library);

  console.log("Imported programs:");
  for (const p of newPrograms) {
    console.log(
      `  - ${p.id}  "${p.name}"  phase=${p.phase}  variant=${p.variant}  freq=${p.frequency}  days=${p.days.length}  lifts=${p.days.reduce((s, d) => s + d.lifts.length, 0)}`
    );
  }
  console.log(
    `Lift library: +${liftReport.added} new, ${liftReport.reused} reused.`
  );
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
