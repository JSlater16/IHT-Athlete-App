// Usage: node scripts/importProgramsFromCsv.js <csv-or-dir>...
// Merges CSV-defined programs into programLibrary.json:
//   - replaces existing programs with matching program_id
//   - appends programs whose program_id is new
//   - adds any referenced lift_id missing from liftLibrary
// Validates the result before writing (atomic). Run locally; it writes
// through the same helpers the API uses.

const fs = require("fs");
const path = require("path");
const {
  readProgramLibrary,
  writeProgramLibrary,
  assertValidLibrary
} = require("../src/utils/programLibrary");

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; continue; }
      if (c === '"') { inQuotes = false; continue; }
      field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function recordsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const [header, ...data] = rows;
  const keys = header.map((h) => h.trim());
  return data
    .filter((r) => r.length === header.length && r.some((v) => v !== ""))
    .map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

function expandToCsvFiles(paths) {
  const files = [];
  for (const p of paths) {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) {
        if (f.endsWith(".csv")) files.push(path.join(p, f));
      }
    } else if (p.endsWith(".csv")) {
      files.push(p);
    }
  }
  return files;
}

async function main() {
  const csvPaths = process.argv.slice(2);
  if (!csvPaths.length) {
    console.error("Usage: node importProgramsFromCsv.js <csv-or-dir>...");
    process.exit(1);
  }
  const files = expandToCsvFiles(csvPaths);
  console.log(`Importing ${files.length} CSV(s):`);
  for (const f of files) console.log(`  - ${f}`);

  const library = await readProgramLibrary();
  const liftById = new Map(library.liftLibrary.map((l) => [l.id, l]));
  const programIndexById = new Map(library.programs.map((p, i) => [p.id, i]));

  const incomingPrograms = [];
  const incomingLifts = new Map();

  for (const file of files) {
    const records = recordsFromCsv(fs.readFileSync(file, "utf8"));
    if (!records.length) { console.warn(`  ${path.basename(file)}: empty, skipped`); continue; }

    const byProgramId = new Map();
    for (const r of records) {
      if (!byProgramId.has(r.program_id)) byProgramId.set(r.program_id, []);
      byProgramId.get(r.program_id).push(r);
    }

    for (const [pid, rs] of byProgramId) {
      const first = rs[0];
      const dayMap = new Map();
      for (const r of rs) {
        const dayOffset = Number(r.day_offset);
        if (!dayMap.has(dayOffset)) {
          dayMap.set(dayOffset, { dayOffset, dayName: r.day_name || "", lifts: [] });
        }
        const day = dayMap.get(dayOffset);
        const lift = {
          liftId: r.lift_id,
          exerciseName: r.exercise_name || "",
          sets: Number(r.sets) || 0,
          reps: Number(r.reps) || 0,
          weight: r.weight || ""
        };
        if (r.notes) lift.notes = r.notes;
        if (r.block_label) lift.blockLabel = r.block_label;
        day.lifts.push(lift);

        if (!liftById.has(r.lift_id) && !incomingLifts.has(r.lift_id)) {
          incomingLifts.set(r.lift_id, {
            id: r.lift_id,
            name: r.exercise_name,
            category: r.category || "Other",
            defaultSets: Number(r.sets) || 1,
            defaultReps: Number(r.reps) || 1,
            defaultWeight: r.weight || "",
            defaultNotes: r.notes || ""
          });
        }
      }

      const days = [...dayMap.values()]
        .sort((a, b) => a.dayOffset - b.dayOffset)
        .map((d) => {
          const out = { dayOffset: d.dayOffset, lifts: d.lifts };
          if (d.dayName) out.dayName = d.dayName;
          return out;
        });

      const program = {
        variant: (first.program_variant || "Standard").trim() || "Standard",
        id: pid,
        name: first.program_name,
        phase: first.program_phase,
        frequency: Number(first.program_frequency),
        days
      };
      incomingPrograms.push({ program, isReplacement: programIndexById.has(pid) });
    }
  }

  let liftsAdded = 0;
  for (const [, lift] of incomingLifts) {
    library.liftLibrary.push(lift);
    liftsAdded++;
  }

  let programsReplaced = 0;
  let programsAdded = 0;
  const replacedIds = [];
  const addedIds = [];
  for (const { program, isReplacement } of incomingPrograms) {
    if (isReplacement) {
      library.programs[programIndexById.get(program.id)] = program;
      programsReplaced++;
      replacedIds.push(program.id);
    } else {
      library.programs.push(program);
      programsAdded++;
      addedIds.push(program.id);
    }
  }

  assertValidLibrary(library);
  await writeProgramLibrary(library);

  console.log("--- DONE ---");
  console.log(`Programs added (${programsAdded}):    ${addedIds.join(", ") || "(none)"}`);
  console.log(`Programs replaced (${programsReplaced}): ${replacedIds.join(", ") || "(none)"}`);
  console.log(`Lifts added:           ${liftsAdded}`);
  console.log(`Total programs now:    ${library.programs.length}`);
  console.log(`Total lifts now:       ${library.liftLibrary.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
