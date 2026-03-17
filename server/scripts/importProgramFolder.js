const fs = require("fs/promises");
const path = require("path");
const {
  readProgramLibrary,
  writeProgramLibrary,
  summarizeProgramLibrary
} = require("../src/utils/programLibrary");
const {
  standardProgramVariant,
  eccentricProgramVariants
} = require("../src/utils/programVariant");

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (character === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += character;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeName(value) {
  return value.trim().toLowerCase();
}

function uniqueId(baseId, existingIds) {
  if (!existingIds.has(baseId)) {
    return baseId;
  }

  let counter = 2;
  let nextId = `${baseId}-${counter}`;
  while (existingIds.has(nextId)) {
    counter += 1;
    nextId = `${baseId}-${counter}`;
  }
  return nextId;
}

function parseRepValue(repRange) {
  const match = repRange?.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function extractBlockLabel(marker) {
  if (/^prep:?$/i.test(marker)) {
    return "Prep";
  }

  const blockMatch = marker.match(/^(\d+)[a-z]:?$/i);
  if (blockMatch) {
    return `Block ${blockMatch[1]}`;
  }

  return "";
}

function buildProgramName(phase, variant, frequency) {
  if (variant !== standardProgramVariant) {
    return `${variant} ${frequency}x`;
  }

  return `${phase} ${frequency}x`;
}

async function readCsvFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return content.split(/\r?\n/);
}

async function parseProgramDay({
  filePath,
  phase,
  dayNumber,
  library,
  existingIds,
  existingByName
}) {
  const lines = await readCsvFile(filePath);
  let currentBlock = null;
  const programDay = {
    dayOffset: Math.max(0, dayNumber - 1),
    lifts: []
  };

  for (const rawLine of lines.slice(1)) {
    const cells = parseCsvLine(rawLine);
    const marker = (cells[0] || "").trim();
    const exerciseName = (cells[2] || "").trim();
    const repRange = (cells[5] || "").trim();
    const timeValue = (cells[6] || "").trim();
    const instructions = (cells[9] || "").trim();

    if (!marker && !exerciseName) {
      continue;
    }

    if (/^block\s+/i.test(marker)) {
      const setMatch = marker.match(/(\d+)-(\d+)/) || marker.match(/(\d+)/);
      currentBlock = {
        label: marker,
        setCount: setMatch ? Number(setMatch[1]) : 1
      };
      continue;
    }

    if (!exerciseName || (!/^prep:?$/i.test(marker) && !/^\d+[a-z]:?$/i.test(marker))) {
      continue;
    }

    const existingLift = existingByName.get(normalizeName(exerciseName));
    const baseId = slugify(exerciseName);
    const liftId = existingLift?.id || uniqueId(baseId, existingIds);
    const defaultSets = /^prep:?$/i.test(marker) ? 1 : currentBlock?.setCount || 1;
    const defaultReps = parseRepValue(repRange);
    const blockLabel = extractBlockLabel(marker);
    const noteParts = [];

    if (/^prep:?$/i.test(marker)) {
      noteParts.push("Prep");
    }
    if (repRange) {
      noteParts.push(`Rep Range: ${repRange}`);
    }
    if (timeValue) {
      noteParts.push(`Time: ${timeValue}`);
    }
    if (instructions) {
      noteParts.push(`Instructions: ${instructions}`);
    }

    const defaultNotes = noteParts.join(" | ");

    if (!existingLift) {
      existingIds.add(liftId);
      const createdLift = {
        id: liftId,
        name: exerciseName,
        category: phase,
        defaultSets,
        defaultReps,
        defaultWeight: timeValue || "Coach Prescribed",
        defaultNotes
      };
      library.liftLibrary.push(createdLift);
      existingByName.set(normalizeName(exerciseName), createdLift);
    }

    programDay.lifts.push({
      liftId,
      blockLabel,
      exerciseName,
      sets: defaultSets,
      reps: defaultReps,
      weight: timeValue || "Coach Prescribed",
      notes: defaultNotes
    });
  }

  if (programDay.lifts.length === 0) {
    throw new Error(`No lifts were parsed from ${filePath}`);
  }

  return programDay;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

async function getProgramDaysForFrequency({
  phaseDir,
  phase,
  frequency,
  library,
  existingIds,
  existingByName
}) {
  const specs =
    frequency === 5
      ? [
          { folder: "4-day", dayNumber: 1 },
          { folder: "4-day", dayNumber: 2 },
          { folder: "4-day", dayNumber: 3 },
          { folder: "4-day", dayNumber: 4 },
          { folder: "5-day", dayNumber: 5 }
        ]
      : Array.from({ length: frequency }, (_, index) => ({
          folder: `${frequency}-day`,
          dayNumber: index + 1
        }));

  const days = [];

  for (const spec of specs) {
    const filePath = path.join(phaseDir, spec.folder, `Day${spec.dayNumber}.csv`);
    if (!(await fileExists(filePath))) {
      throw new Error(`Expected file is missing: ${filePath}`);
    }

    const programDay = await parseProgramDay({
      filePath,
      phase,
      dayNumber: spec.dayNumber,
      library,
      existingIds,
      existingByName
    });
    days.push(programDay);
  }

  return days;
}

async function buildProgram({
  phase,
  variant,
  frequency,
  phaseDir,
  library,
  existingIds,
  existingByName
}) {
  const programName = buildProgramName(phase, variant, frequency);
  const days = await getProgramDaysForFrequency({
    phaseDir,
    phase,
    frequency,
    library,
    existingIds,
    existingByName
  });

  return {
    id: slugify(`${variant === standardProgramVariant ? phase : variant}-${frequency}`),
    name: programName,
    phase,
    variant,
    frequency,
    days
  };
}

async function main() {
  const rootPath = process.argv[2];

  if (!rootPath) {
    console.error("Usage: npm run import:program-folder -- <folderPath>");
    process.exit(1);
  }

  const library = await readProgramLibrary();
  const existingIds = new Set(library.liftLibrary.map((lift) => lift.id));
  const existingByName = new Map(
    library.liftLibrary.map((lift) => [normalizeName(lift.name), lift])
  );
  const importedPrograms = [];

  const phaseConfigs = [
    { phase: "Eccentrics", variants: eccentricProgramVariants.map((variant) => ({ variant, dir: path.join(rootPath, "Eccentrics", variant.split(" ")[0]) })) },
    { phase: "Iso", variants: [{ variant: standardProgramVariant, dir: path.join(rootPath, "Iso") }] },
    { phase: "Power", variants: [{ variant: standardProgramVariant, dir: path.join(rootPath, "Power") }] },
    { phase: "Speed", variants: [{ variant: standardProgramVariant, dir: path.join(rootPath, "Speed") }] }
  ];

  for (const phaseConfig of phaseConfigs) {
    for (const variantConfig of phaseConfig.variants) {
      for (const frequency of [3, 4, 5]) {
        const program = await buildProgram({
          phase: phaseConfig.phase,
          variant: variantConfig.variant,
          frequency,
          phaseDir: variantConfig.dir,
          library,
          existingIds,
          existingByName
        });
        importedPrograms.push(program);
      }
    }
  }

  const replacementKeys = new Set(
    importedPrograms.map((program) => `${program.phase}::${program.variant}::${program.frequency}`)
  );

  library.programs = library.programs.filter((program) => {
    const key = `${program.phase}::${program.variant || standardProgramVariant}::${program.frequency}`;
    return !replacementKeys.has(key);
  });

  library.programs.push(...importedPrograms);
  await writeProgramLibrary(library);

  console.log(
    JSON.stringify(
      {
        importedPrograms: importedPrograms.map((program) => ({
          name: program.name,
          phase: program.phase,
          variant: program.variant,
          frequency: program.frequency,
          days: program.days.length,
          lifts: program.days.reduce((total, day) => total + day.lifts.length, 0)
        })),
        summary: summarizeProgramLibrary(library)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
