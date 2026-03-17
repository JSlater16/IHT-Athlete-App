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

function titleCase(value) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inferMetadata(filePath, titleRow, overrides) {
  const baseName = path.basename(filePath, path.extname(filePath));
  const title = titleRow.trim() || baseName;
  const titleParts = title.split("-").map((part) => part.trim()).filter(Boolean);
  const phase = overrides.phase || titleParts[titleParts.length - 1] || "Prep";
  const variant =
    overrides.variant ||
    (/alactic/i.test(title) || /alactic/i.test(baseName)
      ? "Alactic Eccentrics"
      : /lactic/i.test(title) || /lactic/i.test(baseName)
        ? "Lactic Eccentrics"
        : standardProgramVariant);
  const fileFrequencyMatch = baseName.match(/(\d+)[-\s]*day/i) || title.match(/(\d+)[-\s]*day/i);
  const frequency = overrides.frequency || Number(fileFrequencyMatch?.[1] || 3);
  const dayMatch = title.match(/day\s*(\d+)/i) || baseName.match(/day\s*(\d+)/i);
  const dayNumber = overrides.day || Number(dayMatch?.[1] || 1);

  if (![3, 4, 5].includes(frequency)) {
    throw new Error("Imported program frequency must be 3, 4, or 5 days per week.");
  }

  if (titleCase(phase) === "Eccentrics" && !eccentricProgramVariants.includes(variant)) {
    throw new Error("Imported Eccentrics programs must use --variant='Alactic Eccentrics' or --variant='Lactic Eccentrics'.");
  }

  if (titleCase(phase) !== "Eccentrics" && variant !== standardProgramVariant) {
    throw new Error("Only Eccentrics programs can use a non-Standard variant.");
  }

  return {
    phase: titleCase(phase),
    variant,
    frequency,
    dayNumber,
    dayOffset: Math.max(0, dayNumber - 1),
    programName: titleCase(title)
  };
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

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error("Usage: npm run import:program-csv -- <csvPath> [--phase=Speed] [--variant='Alactic Eccentrics'] [--frequency=5] [--day=5]");
    process.exit(1);
  }

  const overrideEntries = process.argv.slice(3).reduce((accumulator, arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) {
      return accumulator;
    }

    const key = match[1];
    const value = match[2];
    accumulator[key] = ["frequency", "day"].includes(key) ? Number(value) : value;
    return accumulator;
  }, {});

  const csvContent = await fs.readFile(csvPath, "utf8");
  const lines = csvContent.split(/\r?\n/);
  const library = await readProgramLibrary();
  const existingIds = new Set(library.liftLibrary.map((lift) => lift.id));
  const existingByName = new Map(
    library.liftLibrary.map((lift) => [normalizeName(lift.name), lift])
  );

  const metadata = inferMetadata(csvPath, parseCsvLine(lines[0] || "")[0] || "", overrideEntries);
  const programIdBase = slugify(`${metadata.programName}-${metadata.frequency}`);
  const programId = uniqueId(
    library.programs.some((program) => program.id === programIdBase)
      ? `${programIdBase}-${Date.now()}`
      : programIdBase,
    new Set(library.programs.map((program) => program.id))
  );

  let currentBlock = null;
  const programDay = {
    dayOffset: metadata.dayOffset,
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
      const setMatch = marker.match(/(\d+)-(\d+)/);
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
        category: metadata.phase,
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

  const nextProgram = {
    id: programId,
    name: metadata.programName,
    phase: metadata.phase,
    variant: metadata.variant,
    frequency: metadata.frequency,
    days: [programDay]
  };

  library.programs.push(nextProgram);
  await writeProgramLibrary(library);

  const summary = summarizeProgramLibrary(library);
  console.log(
    JSON.stringify(
      {
        importedProgram: nextProgram.name,
        phase: nextProgram.phase,
        variant: nextProgram.variant,
        frequency: nextProgram.frequency,
        dayOffset: nextProgram.days[0].dayOffset,
        liftsImported: nextProgram.days[0].lifts.length,
        summary
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
