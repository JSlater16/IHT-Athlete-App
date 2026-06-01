"use strict";

// Pure CSV-parsing + program-building helpers. Lifted from
// server/scripts/importStructuredProgramCsv.js so the same logic can
// back both the CLI script and the in-app upload endpoint without
// duplication or fs/argv coupling.

const REQUIRED_COLUMNS = [
  "program_id", "program_name", "program_phase", "program_variant",
  "program_frequency", "day_offset", "day_name", "block_label", "order",
  "lift_id", "exercise_name", "category", "sets", "reps", "weight", "notes"
];

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
  const lines = String(content || "").split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("CSV is empty.");
  }
  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  for (const r of REQUIRED_COLUMNS) {
    if (!header.includes(r)) {
      throw new Error(`CSV is missing required column: ${r}`);
    }
  }
  const colIndex = Object.fromEntries(header.map((h, i) => [h, i]));
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    for (const k of REQUIRED_COLUMNS) row[k] = cells[colIndex[k]] ?? "";
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

// Mutates `library.liftLibrary` in place. Returns a report of what
// happened so callers can show counts to the user.
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

// One-shot: parse a CSV string, merge new lifts into the library, and
// upsert programs by program_id. Mutates the passed-in library; the
// caller is responsible for assertValidLibrary + writeProgramLibrary.
function applyCsvToLibrary(library, content) {
  const rows = parseCsv(content);
  const liftReport = mergeLiftLibrary(library, rows);
  const newPrograms = buildPrograms(rows);

  const incomingIds = new Set(newPrograms.map((p) => p.id));
  library.programs = library.programs.filter((p) => !incomingIds.has(p.id));
  library.programs.push(...newPrograms);

  return { liftReport, programs: newPrograms };
}

module.exports = {
  REQUIRED_COLUMNS,
  parseCsvLine,
  parseCsv,
  buildPrograms,
  mergeLiftLibrary,
  applyCsvToLibrary
};
