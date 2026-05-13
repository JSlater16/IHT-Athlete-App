"use strict";

/**
 * Import the IHT Developmental program CSV into the program library.
 *
 *   node scripts/importDevelopmentalCsv.js <path-to.csv>
 *
 * Each row in the CSV becomes one configured lift inside a program day.
 * The "program" column ("Program 1 - Developmental Base" /
 * "Program 2 - Developmental Advanced") is mapped to a single
 * "Developmental" program family with two variants ("Base", "Advanced").
 *
 * Re-running the script replaces any existing programs in that family
 * — safe to use iteratively. Library lifts referenced in the CSV are
 * created (deduped by slug) if they don't already exist.
 */

const path = require("path");
const fs = require("fs/promises");
const {
  readProgramLibrary,
  writeProgramLibrary,
  assertValidLibrary
} = require("../src/utils/programLibrary");

const PHASE = "Developmental";
const PROGRAM_NAME = "Developmental";

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell || "").trim().length > 0));
}

function rowsToObjects(rows) {
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = (cells[idx] || "").trim();
    });
    return obj;
  });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueId(base, existing) {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function variantFromProgramName(raw) {
  const match = String(raw || "").match(/Developmental\s+(\w+)/i);
  return match ? match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase() : "Base";
}

function pickDefaultInt(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const matches = value.match(/\d+/g);
    if (matches && matches.length) return Math.max(...matches.map(Number));
  }
  return fallback;
}

function normalizeSection(label) {
  const map = {
    "warm-up": "Warm-up",
    warmup: "Warm-up",
    main: "Main",
    cooldown: "Cooldown",
    cool: "Cooldown"
  };
  const key = String(label || "").trim().toLowerCase();
  return map[key] || (label && label.trim()) || "Main";
}

function ensureLibraryLift({ liftLibrary, slugToId, existingIds, exerciseName, defaults }) {
  const slug = slugify(exerciseName) || "exercise";
  if (slugToId.has(slug)) return slugToId.get(slug);
  const id = uniqueId(slug, existingIds);
  existingIds.add(id);
  const lift = {
    id,
    name: exerciseName,
    category: defaults.category || "General",
    defaultSets: defaults.defaultSets,
    defaultReps: defaults.defaultReps,
    defaultWeight: defaults.defaultWeight || "Bodyweight",
    defaultNotes: defaults.defaultNotes || ""
  };
  liftLibrary.push(lift);
  slugToId.set(slug, id);
  return id;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error("Usage: node scripts/importDevelopmentalCsv.js <path-to.csv>");
    process.exit(1);
  }

  const absPath = path.isAbsolute(csvPath) ? csvPath : path.resolve(process.cwd(), csvPath);
  const text = await fs.readFile(absPath, "utf8");
  const rows = rowsToObjects(parseCsv(text));
  if (rows.length === 0) {
    console.error("CSV is empty.");
    process.exit(1);
  }

  const library = await readProgramLibrary();
  const liftLibrary = library.liftLibrary.slice();
  const existingIds = new Set(liftLibrary.map((l) => l.id));
  const slugToId = new Map(liftLibrary.map((l) => [slugify(l.name), l.id]));

  // Group rows by (variant, day).
  const byVariant = new Map();
  for (const row of rows) {
    const variant = variantFromProgramName(row.program);
    if (!byVariant.has(variant)) byVariant.set(variant, new Map());
    const days = byVariant.get(variant);
    const dayNum = Number(row.day);
    if (!days.has(dayNum)) {
      days.set(dayNum, { dayName: row.day_name, lifts: [] });
    }
    days.get(dayNum).lifts.push(row);
  }

  const newPrograms = [];
  for (const [variant, daysMap] of byVariant) {
    const days = Array.from(daysMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([dayNum, info]) => {
        const lifts = info.lifts
          .slice()
          .sort((a, b) => Number(a.order) - Number(b.order))
          .map((row) => {
            const liftId = ensureLibraryLift({
              liftLibrary,
              slugToId,
              existingIds,
              exerciseName: row.exercise,
              defaults: {
                category: row.pattern || "General",
                defaultSets: pickDefaultInt(row.sets, 3),
                defaultReps: pickDefaultInt(row.reps_or_duration, 8),
                defaultWeight: row.load || "Bodyweight",
                defaultNotes: ""
              }
            });
            const entry = {
              liftId,
              blockLabel: normalizeSection(row.section),
              exerciseName: row.exercise,
              sets: row.sets || "1",
              reps: row.reps_or_duration || "1",
              weight: row.load || "Bodyweight",
              notes: row.notes || ""
            };
            if (row.tempo) entry.tempo = row.tempo;
            if (row.paired_with) entry.pairedWith = row.paired_with;
            return entry;
          });

        return {
          dayOffset: dayNum - 1,
          dayName: info.dayName || "",
          lifts
        };
      });

    const programId = uniqueId(
      slugify(`${PROGRAM_NAME} ${variant}`),
      new Set([...library.programs.map((p) => p.id), ...newPrograms.map((p) => p.id)])
    );

    newPrograms.push({
      id: programId,
      name: PROGRAM_NAME,
      phase: PHASE,
      variant,
      frequency: days.length,
      days
    });
  }

  // Remove any existing Developmental programs with the same name so a
  // re-import refreshes them cleanly instead of duplicating.
  const remainingPrograms = library.programs.filter(
    (p) => !(p.phase === PHASE && p.name === PROGRAM_NAME)
  );

  const nextLibrary = {
    ...library,
    liftLibrary,
    programs: [...remainingPrograms, ...newPrograms]
  };

  assertValidLibrary(nextLibrary);
  await writeProgramLibrary(nextLibrary);

  console.log(
    `Imported ${newPrograms.length} Developmental program(s): ${newPrograms
      .map((p) => `${p.variant} (${p.frequency}d, ${p.days.reduce((n, d) => n + d.lifts.length, 0)} lifts)`)
      .join(", ")}`
  );
  console.log(
    `Library lifts now total ${liftLibrary.length} (added ${liftLibrary.length - library.liftLibrary.length}).`
  );
}

main().catch((err) => {
  console.error("Import failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
