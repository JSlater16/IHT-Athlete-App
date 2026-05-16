const express = require("express");
const { prisma } = require("../utils/prisma");
const { requireAthlete, requireCoach } = require("../middleware/auth");
const { recordAudit } = require("../utils/audit");
const { METRICS, isValidMetricKey } = require("../utils/forcedecks");
const { computeAndApplyReadiness } = require("../utils/readinessApply");

const router = express.Router();

// Metrics that appear on the athlete-facing leaderboard. Pulled from
// the public (non-coachOnly) metric catalog so coach-only metrics
// (W/kg, RFD, etc) don't leak into the peer leaderboard.
const LEADERBOARD_METRIC_KEYS = METRICS.filter((m) => !m.coachOnly).map((m) => m.key);

const LEADERBOARD_TOP_N = 10;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 60;

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function serializeTest(test) {
  const metrics = {};
  for (const m of test.metrics || []) {
    metrics[m.metricName] = { value: m.value, unit: m.unit };
  }
  return {
    id: test.id,
    testDate: test.testDate,
    readinessScore: test.readinessScore,
    readinessDetails: test.readinessDetails || null,
    source: test.source,
    externalId: test.externalId,
    metrics
  };
}

async function loadAthleteDashboard(athleteId, limit) {
  // Newest tests first; UI consumes them in order.
  const tests = await prisma.forceDecksTest.findMany({
    where: { athleteId },
    orderBy: { testDate: "desc" },
    take: limit,
    include: { metrics: true }
  });

  // Per-metric all-time PR for this athlete; powers the "% from PR" badge.
  const maxRows = await prisma.forceDecksMetric.groupBy({
    by: ["metricName"],
    where: { test: { athleteId } },
    _max: { value: true }
  });
  const bests = {};
  for (const row of maxRows) {
    if (row._max?.value !== null && row._max?.value !== undefined) {
      bests[row.metricName] = row._max.value;
    }
  }

  return {
    tests: tests.map(serializeTest),
    bests,
    metricCatalog: METRICS
  };
}

// GET /api/forcedecks/leaderboard — ranked all-time PR per athlete on
// public metrics (jump height, peak power). Visible to athletes and
// coaches. Athletes flagged hideFromLeaderboard or whose user account
// is inactive are excluded. The response includes a viewerAthleteId
// when the caller is an athlete so the UI can highlight their row.
router.get("/leaderboard", async (req, res, next) => {
  try {
    // Coaches/owners can request the full board via ?full=1; athletes
    // are always capped to the top N regardless of what they send.
    const isCoachLike = req.user?.role === "COACH" || req.user?.role === "OWNER";
    const requestFull = req.query.full === "1" && isCoachLike;
    const capPerBoard = requestFull ? Infinity : LEADERBOARD_TOP_N;

    const eligible = await prisma.athleteProfile.findMany({
      where: {
        hideFromLeaderboard: false,
        user: { isActive: true }
      },
      select: { id: true, user: { select: { name: true } } }
    });
    const nameById = new Map(eligible.map((a) => [a.id, a.user.name]));
    const eligibleIds = eligible.map((a) => a.id);

    if (eligibleIds.length === 0) {
      return res.json({
        boards: LEADERBOARD_METRIC_KEYS.map((key) => ({ metricKey: key, rows: [] })),
        viewerAthleteId: null
      });
    }

    // For each metric, find the best (max) value per athlete along with
    // the test date that produced it. groupBy gives us max; we then
    // look up the test row to attach the date.
    const boards = [];
    for (const metricKey of LEADERBOARD_METRIC_KEYS) {
      const metricDef = METRICS.find((m) => m.key === metricKey);
      const topRows = await prisma.forceDecksMetric.findMany({
        where: {
          metricName: metricKey,
          test: { athleteId: { in: eligibleIds } }
        },
        orderBy: { value: "desc" },
        select: {
          value: true,
          unit: true,
          test: { select: { athleteId: true, testDate: true } }
        }
      });

      // Dedupe to one entry per athlete (the highest, which comes first
      // because the query is value-desc), then cap at the top N.
      const seen = new Set();
      const ranked = [];
      for (const row of topRows) {
        const athleteId = row.test.athleteId;
        if (seen.has(athleteId)) continue;
        seen.add(athleteId);
        ranked.push({
          athleteId,
          name: nameById.get(athleteId) || "Unknown",
          value: row.value,
          unit: row.unit || metricDef?.unit || "",
          testDate: row.test.testDate
        });
        if (ranked.length >= capPerBoard) break;
      }

      boards.push({
        metricKey,
        label: metricDef?.label || metricKey,
        unit: metricDef?.unit || "",
        rows: ranked
      });
    }

    let viewerAthleteId = null;
    if (req.user.role === "ATHLETE") {
      const profile = await prisma.athleteProfile.findUnique({
        where: { userId: req.user.id },
        select: { id: true }
      });
      viewerAthleteId = profile?.id ?? null;
    }

    return res.json({ boards, viewerAthleteId });
  } catch (error) {
    return next(error);
  }
});

// GET /api/forcedecks/me — athlete sees their own latest tests
router.get("/me", requireAthlete, async (req, res, next) => {
  try {
    const profile = await prisma.athleteProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true }
    });
    if (!profile) {
      return res.json({ tests: [], bests: {}, metricCatalog: METRICS });
    }
    const limit = parseLimit(req.query.limit);
    const payload = await loadAthleteDashboard(profile.id, limit);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
});

// GET /api/forcedecks/roster — coach sees every athlete's latest + previous
router.get("/roster", requireCoach, async (req, res, next) => {
  try {
    const athletes = await prisma.athleteProfile.findMany({
      select: {
        id: true,
        user: { select: { name: true, email: true, isActive: true } },
        forcedecksTests: {
          orderBy: { testDate: "desc" },
          take: 2,
          select: { testDate: true, readinessScore: true }
        }
      }
    });

    const rows = athletes
      .filter((a) => a.user?.isActive !== false)
      .map((a) => {
        const [latest = null, previous = null] = a.forcedecksTests;
        const delta =
          latest?.readinessScore != null && previous?.readinessScore != null
            ? latest.readinessScore - previous.readinessScore
            : null;
        const flagged = delta !== null && delta < -10;
        return {
          athleteId: a.id,
          name: a.user.name,
          email: a.user.email,
          latest: latest ? { testDate: latest.testDate, readinessScore: latest.readinessScore } : null,
          previous: previous
            ? { testDate: previous.testDate, readinessScore: previous.readinessScore }
            : null,
          delta,
          flagged
        };
      })
      .sort((a, b) => {
        // Flagged first, then most recent test first, then name.
        if (a.flagged !== b.flagged) return a.flagged ? -1 : 1;
        const at = a.latest?.testDate ? new Date(a.latest.testDate).getTime() : 0;
        const bt = b.latest?.testDate ? new Date(b.latest.testDate).getTime() : 0;
        if (at !== bt) return bt - at;
        return a.name.localeCompare(b.name);
      });

    return res.json({ athletes: rows });
  } catch (error) {
    return next(error);
  }
});

// GET /api/forcedecks/athletes/:athleteId — coach drill-down
router.get("/athletes/:athleteId", requireCoach, async (req, res, next) => {
  try {
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: req.params.athleteId },
      select: { id: true, user: { select: { name: true } } }
    });
    if (!profile) {
      return res.status(404).json({ error: "Athlete not found" });
    }
    const limit = parseLimit(req.query.limit);
    const payload = await loadAthleteDashboard(profile.id, limit);
    return res.json({ athleteId: profile.id, name: profile.user.name, ...payload });
  } catch (error) {
    return next(error);
  }
});

// POST /api/forcedecks/athletes/:athleteId — ingest a single test
// Idempotent on externalId when present.
router.post("/athletes/:athleteId", requireCoach, async (req, res, next) => {
  try {
    const profile = await prisma.athleteProfile.findUnique({
      where: { id: req.params.athleteId },
      select: { id: true, user: { select: { name: true } } }
    });
    if (!profile) {
      return res.status(404).json({ error: "Athlete not found" });
    }

    // readinessScore is intentionally not accepted from the client —
    // the server computes it from the metrics + the athlete's prior
    // 14-day window. Anything in the body for that field is ignored.
    const { testDate, source, externalId, metrics } = req.body || {};

    if (!testDate || Number.isNaN(new Date(testDate).getTime())) {
      return res.status(400).json({ error: "testDate is required and must be a valid date" });
    }
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return res.status(400).json({ error: "metrics must be a non-empty array" });
    }
    for (const m of metrics) {
      if (!isValidMetricKey(m?.metricName)) {
        return res.status(400).json({ error: `Unknown metricName: ${m?.metricName}` });
      }
      if (!Number.isFinite(Number(m.value))) {
        return res.status(400).json({ error: `Invalid value for ${m.metricName}` });
      }
      if (typeof m.unit !== "string" || m.unit.length > 32) {
        return res.status(400).json({ error: `Invalid unit for ${m.metricName}` });
      }
    }

    // Idempotent on externalId: if a test with this externalId exists,
    // update it and replace metrics. Otherwise create new.
    const existing = externalId
      ? await prisma.forceDecksTest.findUnique({ where: { externalId } })
      : null;

    const persisted = await prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.forceDecksMetric.deleteMany({ where: { testId: existing.id } });
        return tx.forceDecksTest.update({
          where: { id: existing.id },
          data: {
            athleteId: profile.id,
            testDate: new Date(testDate),
            source: typeof source === "string" ? source : "vald",
            metrics: {
              create: metrics.map((m) => ({
                metricName: m.metricName,
                value: Number(m.value),
                unit: m.unit
              }))
            }
          },
          include: { metrics: true }
        });
      }
      return tx.forceDecksTest.create({
        data: {
          athleteId: profile.id,
          testDate: new Date(testDate),
          source: typeof source === "string" ? source : "vald",
          externalId: externalId || null,
          metrics: {
            create: metrics.map((m) => ({
              metricName: m.metricName,
              value: Number(m.value),
              unit: m.unit
            }))
          }
        },
        include: { metrics: true }
      });
    });

    await computeAndApplyReadiness(persisted.id);
    const test = await prisma.forceDecksTest.findUnique({
      where: { id: persisted.id },
      include: { metrics: true }
    });

    await recordAudit({
      req,
      action: "forcedecks.ingest",
      targetType: "forcedecks_test",
      targetId: test.id,
      targetLabel: profile.user.name,
      metadata: {
        externalId: test.externalId,
        metricCount: test.metrics.length,
        readinessScore: test.readinessScore,
        replaced: Boolean(existing)
      }
    });

    return res.status(existing ? 200 : 201).json({ test: serializeTest(test) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
