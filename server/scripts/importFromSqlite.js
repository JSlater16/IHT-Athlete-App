"use strict";

const path = require("path");
const fs = require("fs");
const { PrismaClient } = require("@prisma/client");

const SQLITE_PATH = process.env.SQLITE_IMPORT_PATH || "/var/data/prod.db";
const VALID_ROLES = new Set(["OWNER", "COACH", "ATHLETE"]);

function loadSqlite() {
  let Database;
  try {
    Database = require("better-sqlite3");
  } catch (err) {
    console.error("better-sqlite3 is not installed. Run: npm install better-sqlite3 -w server");
    process.exit(1);
  }
  if (!fs.existsSync(SQLITE_PATH)) {
    console.error(`SQLite file not found at ${SQLITE_PATH}`);
    console.error("Set SQLITE_IMPORT_PATH if the file lives elsewhere.");
    process.exit(1);
  }
  return new Database(SQLITE_PATH, { readonly: true, fileMustExist: true });
}

function toBool(v) {
  return v === 1 || v === true || v === "1" || v === "true";
}

function toDate(v) {
  if (!v) return new Date();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function normalizeRole(role) {
  if (typeof role !== "string") return null;
  const upper = role.toUpperCase().trim();
  return VALID_ROLES.has(upper) ? upper : null;
}

async function importUsers(sqlite, prisma) {
  const rows = sqlite.prepare("SELECT * FROM User").all();
  let imported = 0;
  let skipped = 0;
  let displaced = 0;
  for (const u of rows) {
    const role = normalizeRole(u.role);
    if (!role) {
      console.warn(`  skipping user ${u.email}: invalid role '${u.role}'`);
      skipped++;
      continue;
    }
    const removed = await prisma.user.deleteMany({
      where: { email: u.email, NOT: { id: u.id } },
    });
    if (removed.count > 0) {
      displaced += removed.count;
      console.log(`  displaced existing user with email ${u.email} (kept SQLite id ${u.id})`);
    }
    await prisma.user.upsert({
      where: { id: u.id },
      update: {
        name: u.name,
        email: u.email,
        password: u.password,
        role,
        isActive: toBool(u.isActive),
        updatedAt: toDate(u.updatedAt),
      },
      create: {
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role,
        isActive: toBool(u.isActive),
        tokenVersion: 0,
        createdAt: toDate(u.createdAt),
        updatedAt: toDate(u.updatedAt),
      },
    });
    imported++;
  }
  console.log(`Users: ${imported} imported, ${skipped} skipped, ${displaced} displaced (of ${rows.length})`);
}

async function importAthleteProfiles(sqlite, prisma) {
  const rows = sqlite.prepare("SELECT * FROM AthleteProfile").all();
  let imported = 0;
  for (const p of rows) {
    await prisma.athleteProfile.upsert({
      where: { id: p.id },
      update: {
        userId: p.userId,
        phase: p.phase,
        phaseStartedAt: toDate(p.phaseStartedAt),
        coachNotes: p.coachNotes ?? "",
        rehabProfile: p.rehabProfile ?? '{"inhibitedMuscles":[],"padPlacementImages":[]}',
        programmingDays: p.programmingDays ?? 3,
        trainingModel: p.trainingModel ?? "10-Week",
        programVariant: p.programVariant ?? "Standard",
        updatedAt: toDate(p.updatedAt),
      },
      create: {
        id: p.id,
        userId: p.userId,
        phase: p.phase,
        phaseStartedAt: toDate(p.phaseStartedAt),
        coachNotes: p.coachNotes ?? "",
        rehabProfile: p.rehabProfile ?? '{"inhibitedMuscles":[],"padPlacementImages":[]}',
        programmingDays: p.programmingDays ?? 3,
        trainingModel: p.trainingModel ?? "10-Week",
        programVariant: p.programVariant ?? "Standard",
        updatedAt: toDate(p.updatedAt),
      },
    });
    imported++;
  }
  console.log(`AthleteProfiles: ${imported} imported (of ${rows.length})`);
}

async function importLifts(sqlite, prisma) {
  const rows = sqlite.prepare("SELECT * FROM Lift").all();
  let imported = 0;
  for (const l of rows) {
    await prisma.lift.upsert({
      where: { id: l.id },
      update: {
        athleteId: l.athleteId,
        date: toDate(l.date),
        blockLabel: l.blockLabel ?? "",
        exerciseName: l.exerciseName,
        sets: l.sets,
        reps: l.reps,
        weight: l.weight,
        notes: l.notes ?? "",
        completed: toBool(l.completed),
        updatedAt: toDate(l.updatedAt),
      },
      create: {
        id: l.id,
        athleteId: l.athleteId,
        date: toDate(l.date),
        blockLabel: l.blockLabel ?? "",
        exerciseName: l.exerciseName,
        sets: l.sets,
        reps: l.reps,
        weight: l.weight,
        notes: l.notes ?? "",
        completed: toBool(l.completed),
        createdAt: toDate(l.createdAt),
        updatedAt: toDate(l.updatedAt),
      },
    });
    imported++;
    if (imported % 100 === 0) console.log(`  ${imported}/${rows.length} lifts...`);
  }
  console.log(`Lifts: ${imported} imported (of ${rows.length})`);
}

async function importRehabNotes(sqlite, prisma) {
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='RehabNote'")
    .get();
  if (!tableExists) {
    console.log("RehabNote table not present in source DB, skipping.");
    return;
  }
  const rows = sqlite.prepare("SELECT * FROM RehabNote").all();
  let imported = 0;
  for (const n of rows) {
    await prisma.rehabNote.upsert({
      where: { id: n.id },
      update: {
        athleteId: n.athleteId,
        note: n.note,
      },
      create: {
        id: n.id,
        athleteId: n.athleteId,
        note: n.note,
        createdAt: toDate(n.createdAt),
      },
    });
    imported++;
  }
  console.log(`RehabNotes: ${imported} imported (of ${rows.length})`);
}

async function importAuditLog(sqlite, prisma) {
  const tableExists = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='AuditLog'")
    .get();
  if (!tableExists) {
    console.log("AuditLog table not present in source DB, skipping.");
    return;
  }
  const rows = sqlite.prepare("SELECT * FROM AuditLog").all();
  let imported = 0;
  for (const a of rows) {
    const role = normalizeRole(a.actorRole);
    await prisma.auditLog.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        actorId: a.actorId,
        actorName: a.actorName ?? "",
        actorRole: role,
        action: a.action,
        targetType: a.targetType ?? "",
        targetId: a.targetId,
        targetLabel: a.targetLabel ?? "",
        ip: a.ip ?? "",
        metadata: a.metadata ?? "{}",
        createdAt: toDate(a.createdAt),
      },
    });
    imported++;
  }
  console.log(`AuditLog: ${imported} imported (of ${rows.length})`);
}

async function main() {
  console.log(`Importing from SQLite: ${SQLITE_PATH}`);
  console.log(`Target DB: ${process.env.DATABASE_URL ? process.env.DATABASE_URL.replace(/:[^:@]+@/, ":***@") : "(none)"}`);

  const sqlite = loadSqlite();
  const prisma = new PrismaClient();

  try {
    await prisma.$connect();
    await importUsers(sqlite, prisma);
    await importAthleteProfiles(sqlite, prisma);
    await importLifts(sqlite, prisma);
    await importRehabNotes(sqlite, prisma);
    await importAuditLog(sqlite, prisma);
    console.log("\nImport complete.");
  } finally {
    sqlite.close();
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Import failed:", err);
  process.exit(1);
});
