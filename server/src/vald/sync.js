"use strict";

const { prisma } = require("../utils/prisma");
const { valdFetch } = require("./client");
const { getValdConfig, assertValdCredentials, assertValdTenant } = require("./config");
const { mapValdResult } = require("./metrics");
const { METRICS } = require("../utils/forcedecks");
const { computeAndApplyReadiness } = require("../utils/readinessApply");

// We only sync CMJ tests for now. Other test types (IMTP, SJ, balance)
// produce different metric sets and would need their own handling.
const SUPPORTED_TEST_TYPE = "CMJ";

// 365-day fallback when an athlete has never been synced. Long enough
// to catch a season of historical data, short enough to not blow up
// the first sync.
const INITIAL_LOOKBACK_DAYS = 365;

function appKeyToUnit(appKey) {
  return METRICS.find((m) => m.key === appKey)?.unit || "";
}

function extractMetricsAcrossTrials(trials) {
  // For each metric, walk every trial in the test and take the best
  // value independently. "Best" = max for positive-trend metrics, min
  // for negative-trend, max as a default for neutral. This matches
  // VALD Hub's display: it doesn't lock all metrics to one rep, it
  // shows the athlete's session-best for each metric.
  const best = new Map();
  for (const trial of trials) {
    for (const r of trial.results || []) {
      // Bilateral results expose the combined (Both-feet) measurement
      // as limb="Trial". Left/Right/Asym are per-leg breakdowns we
      // don't store at the test aggregate level.
      if (r.limb !== "Trial") continue;
      const mapped = mapValdResult(r.resultId, r.value);
      if (!mapped) continue;
      const current = best.get(mapped.appKey);
      if (current === undefined) {
        best.set(mapped.appKey, { value: mapped.value, trend: mapped.trend });
        continue;
      }
      if (mapped.trend === "negative") {
        if (mapped.value < current.value) best.set(mapped.appKey, { value: mapped.value, trend: mapped.trend });
      } else {
        if (mapped.value > current.value) best.set(mapped.appKey, { value: mapped.value, trend: mapped.trend });
      }
    }
  }
  return Array.from(best.entries()).map(([appKey, { value }]) => ({
    metricName: appKey,
    value,
    unit: appKeyToUnit(appKey)
  }));
}

async function fetchTestsSince(profileId, cursorIso, tenantId) {
  // VALD's /tests endpoint is cursor-paginated by modifiedDateUtc; if
  // we ever exceed one page we'd need to loop, but per-athlete daily
  // sync is well under that. Single call for now; revisit if we add
  // historical backfill.
  const { status, data } = await valdFetch("forcedecks", "/tests", {
    query: { TenantId: tenantId, ProfileId: profileId, ModifiedFromUtc: cursorIso }
  });
  if (status === 204 || !data) return [];
  return Array.isArray(data.tests) ? data.tests : Array.isArray(data) ? data : [];
}

async function fetchTrials(testId, tenantId) {
  // teamId and tenantId are the same value in VALD's data model — the
  // v2019q3 routes just use the older "team" naming.
  const { data } = await valdFetch(
    "forcedecks",
    `/v2019q3/teams/${tenantId}/tests/${testId}/trials`
  );
  return Array.isArray(data) ? data : [];
}

async function upsertTest({ athleteId, test, metrics }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.forceDecksTest.findUnique({
      where: { externalId: test.testId }
    });
    const baseData = {
      athleteId,
      testDate: new Date(test.recordedDateUtc),
      source: "vald"
    };
    if (existing) {
      await tx.forceDecksMetric.deleteMany({ where: { testId: existing.id } });
      return tx.forceDecksTest.update({
        where: { id: existing.id },
        data: { ...baseData, metrics: { create: metrics } }
      });
    }
    return tx.forceDecksTest.create({
      data: { ...baseData, externalId: test.testId, metrics: { create: metrics } }
    });
  });
}

// Recompute readiness for every test the sync just touched, in
// chronological order so each test's priors are already in place.
// VALD doesn't return tests in date order, so computing during the
// upsert loop would score the newest test against an empty prior
// window. Doing this as a second pass fixes that.
async function recomputeReadinessFor(testIds) {
  if (!testIds.length) return;
  const rows = await prisma.forceDecksTest.findMany({
    where: { id: { in: testIds } },
    orderBy: { testDate: "asc" },
    select: { id: true }
  });
  for (const row of rows) {
    await computeAndApplyReadiness(row.id);
  }
}

async function syncAthleteForceDecks(athleteId, { fullHistory = false } = {}) {
  const config = getValdConfig();
  assertValdCredentials(config);
  assertValdTenant(config);

  const athlete = await prisma.athleteProfile.findUnique({
    where: { id: athleteId },
    select: { id: true, valdProfileId: true, valdLastSyncedAt: true, user: { select: { name: true } } }
  });
  if (!athlete) throw new Error("Athlete not found.");
  if (!athlete.valdProfileId) {
    return { athleteId, imported: 0, skipped: 0, reason: "not_linked" };
  }

  // fullHistory: ignore the cursor and re-pull the last year. Manual
  // syncs use this so re-syncing after a code fix actually overwrites
  // existing rows with corrected values; the cron uses the cursor for
  // efficient nightly deltas.
  const cursorMs = fullHistory || !athlete.valdLastSyncedAt
    ? Date.now() - INITIAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    : new Date(athlete.valdLastSyncedAt).getTime();
  const cursorIso = new Date(cursorMs).toISOString();

  const tests = await fetchTestsSince(athlete.valdProfileId, cursorIso, config.tenantId);

  let imported = 0;
  let skipped = 0;
  let latestModifiedMs = cursorMs;
  const upsertedIds = [];

  for (const test of tests) {
    const modifiedMs = test.modifiedDateUtc ? new Date(test.modifiedDateUtc).getTime() : 0;
    if (modifiedMs > latestModifiedMs) latestModifiedMs = modifiedMs;

    if ((test.testType || "").toUpperCase() !== SUPPORTED_TEST_TYPE) {
      skipped += 1;
      continue;
    }

    const trials = await fetchTrials(test.testId, config.tenantId);
    if (trials.length === 0) {
      skipped += 1;
      continue;
    }

    const metrics = extractMetricsAcrossTrials(trials);
    if (metrics.length === 0) {
      skipped += 1;
      continue;
    }

    const persisted = await upsertTest({ athleteId, test, metrics });
    upsertedIds.push(persisted.id);
    imported += 1;
  }

  await recomputeReadinessFor(upsertedIds);

  // Advance cursor to the latest modifiedDateUtc we saw, falling back
  // to "now" so re-runs don't refetch the same window if nothing
  // changed. Adding 1ms avoids re-pulling the same boundary test.
  const nextCursor = new Date(Math.max(latestModifiedMs + 1, Date.now()));
  await prisma.athleteProfile.update({
    where: { id: athleteId },
    data: { valdLastSyncedAt: nextCursor }
  });

  return {
    athleteId,
    athleteName: athlete.user?.name || "",
    imported,
    skipped,
    total: tests.length
  };
}

async function syncAllLinkedAthletes() {
  const athletes = await prisma.athleteProfile.findMany({
    where: {
      valdProfileId: { not: null },
      user: { isActive: true }
    },
    select: { id: true }
  });

  const results = [];
  for (const a of athletes) {
    try {
      results.push(await syncAthleteForceDecks(a.id));
    } catch (err) {
      results.push({ athleteId: a.id, error: err.message });
    }
  }
  return results;
}

module.exports = { syncAthleteForceDecks, syncAllLinkedAthletes };
