"use strict";

/**
 * Demo seeder for ForceDecks data. Generates realistic-looking test
 * sessions for every active athlete (or one specified athlete) so
 * the dashboard can be visually verified end-to-end.
 *
 * Usage from Render Shell:
 *   node scripts/seedForcedecksDemo.js              # seed all athletes
 *   node scripts/seedForcedecksDemo.js --athlete <profileId>
 *   node scripts/seedForcedecksDemo.js --clean      # remove all demo-* tests
 *   node scripts/seedForcedecksDemo.js --clean --athlete <profileId>
 *
 * All seeded tests have externalId prefixed with "demo-" so they
 * can be cleanly removed without touching real VALD imports.
 */

const { PrismaClient } = require("@prisma/client");
const { METRICS } = require("../src/utils/forcedecks");

const prisma = new PrismaClient();

// Realistic baseline ranges per metric. The seeder picks a baseline
// per athlete inside this range, then varies each session by ±~6%.
const BASELINES = {
  peak_power: [3000, 5500, "W"],
  jump_height: [12, 22, "in"],
  watts_per_kg: [35, 65, "W/kg"],
  concentric_impulse_50ms: [50, 150, "N·s"],
  concentric_impulse_at_100ms: [150, 350, "N·s"],
  rsi_modified: [0.3, 0.65, ""],
  impulse_momentum: [200, 400, "N·s"],
  concentric_peak_velocity: [2.0, 3.5, "m/s"],
  concentric_mean_power: [1500, 3500, "W"],
  concentric_rfd: [6000, 12000, "N/s"],
  eccentric_braking_rfd: [4000, 9000, "N/s"],
  eccentric_peak_force: [1500, 3000, "N"],
  eccentric_peak_velocity: [0.8, 1.6, "m/s"],
  force_at_zero_velocity: [1500, 2800, "N"],
  countermovement_depth: [12, 30, "in"]
};

// Athlete archetypes drive the readiness curve so the dashboard
// shows a healthy spread of colors + at least one >10pt drop.
const ARCHETYPES = [
  { name: "trending-up", scores: [62, 68, 74, 81] },
  { name: "trending-down-flag", scores: [78, 82, 86, 72] }, // last vs prev = -14, flagged
  { name: "steady-mid", scores: [70, 73, 71, 74] },
  { name: "high-readiness", scores: [85, 88, 86, 89] },
  { name: "low-readiness", scores: [38, 42, 45, 41] },
  { name: "big-bounce", scores: [55, 60, 90, 78] } // prev was a peak; current backs off
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function jitter(base, pct) {
  // small random variation ±pct of base
  return base * (1 + (Math.random() * 2 - 1) * pct);
}

function pickBaseline(athleteIndex) {
  // Deterministic-ish: spread athletes across the range so cards
  // don't all look identical between athletes.
  const t = ((athleteIndex * 0.37) % 1); // 0..1
  const out = {};
  for (const [key, [low, high, unit]] of Object.entries(BASELINES)) {
    const base = low + (high - low) * (0.25 + t * 0.5); // skewed inward
    out[key] = { value: base, unit };
  }
  return out;
}

function buildSession({ baseline, sessionIndex, totalSessions }) {
  // Inject a slight upward drift across sessions to mimic training
  // adaptation, varied per metric so not every line moves in lock-step.
  const driftPct = (sessionIndex / Math.max(1, totalSessions - 1)) * 0.05; // up to +5% over the series
  const metrics = METRICS.map((m) => {
    const { value: base, unit } = baseline[m.key];
    const drifted = base * (1 + driftPct * (Math.random() * 0.8 + 0.6));
    const noisy = jitter(drifted, 0.04); // ±4% session noise
    let rounded;
    if (noisy >= 100) rounded = Math.round(noisy);
    else if (noisy >= 10) rounded = Math.round(noisy * 10) / 10;
    else rounded = Math.round(noisy * 100) / 100;
    return { metricName: m.key, value: rounded, unit };
  });
  return metrics;
}

function daysAgo(days) {
  const d = new Date();
  d.setUTCHours(10, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

async function getAthletes(specificId) {
  if (specificId) {
    const a = await prisma.athleteProfile.findUnique({
      where: { id: specificId },
      include: { user: { select: { name: true, isActive: true } } }
    });
    return a ? [a] : [];
  }
  return prisma.athleteProfile.findMany({
    include: { user: { select: { name: true, isActive: true } } },
    where: { user: { isActive: true } }
  });
}

async function clean(specificId) {
  const where = specificId
    ? { athleteId: specificId, externalId: { startsWith: "demo-" } }
    : { externalId: { startsWith: "demo-" } };
  const result = await prisma.forceDecksTest.deleteMany({ where });
  console.log(`Removed ${result.count} demo ForceDecks test(s).`);
}

async function seed(specificId) {
  const athletes = await getAthletes(specificId);
  if (athletes.length === 0) {
    console.log("No active athletes found to seed.");
    return;
  }

  console.log(`Seeding ForceDecks demo data for ${athletes.length} athlete(s)...`);

  for (let i = 0; i < athletes.length; i++) {
    const athlete = athletes[i];
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    const baseline = pickBaseline(i);

    // Day offsets: 21, 14, 7, 0 days ago (oldest -> newest, 4 sessions).
    // Readiness array also runs oldest -> newest.
    const dayOffsets = [21, 14, 7, 0];
    const total = dayOffsets.length;

    for (let s = 0; s < total; s++) {
      const externalId = `demo-${athlete.id}-${s}`;
      const testDate = daysAgo(dayOffsets[s]);
      const readinessScore = archetype.scores[s];
      const metrics = buildSession({ baseline, sessionIndex: s, totalSessions: total });

      // Upsert by externalId so re-running the seeder refreshes data
      // instead of stacking duplicate sessions.
      const existing = await prisma.forceDecksTest.findUnique({
        where: { externalId }
      });

      if (existing) {
        await prisma.forceDecksMetric.deleteMany({ where: { testId: existing.id } });
        await prisma.forceDecksTest.update({
          where: { id: existing.id },
          data: {
            athleteId: athlete.id,
            testDate,
            readinessScore,
            source: "demo",
            metrics: { create: metrics }
          }
        });
      } else {
        await prisma.forceDecksTest.create({
          data: {
            athleteId: athlete.id,
            testDate,
            readinessScore,
            source: "demo",
            externalId,
            metrics: { create: metrics }
          }
        });
      }
    }

    console.log(
      `  ${athlete.user.name} (${athlete.id}) — archetype "${archetype.name}", readiness [${archetype.scores.join(
        ", "
      )}]`
    );
  }

  console.log("Done.");
}

(async () => {
  const args = process.argv.slice(2);
  const isClean = args.includes("--clean");
  const idIdx = args.indexOf("--athlete");
  const specificId = idIdx >= 0 ? args[idIdx + 1] : null;

  try {
    if (isClean) {
      await clean(specificId);
    } else {
      await seed(specificId);
    }
  } catch (error) {
    console.error("Seeder failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
