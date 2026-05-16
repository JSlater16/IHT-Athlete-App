"use strict";

// CMJ readiness score.
//
// Personal-baseline approach: each metric is compared to the athlete's
// own median over the prior 14 days. Score shrinks toward 100 (neutral)
// when there are few prior tests, so a single bad day on a thin
// baseline doesn't deload someone on noise.

const WEIGHTS = Object.freeze({
  force_at_zero_velocity: 0.30,
  eccentric_peak_velocity: 0.25,
  concentric_impulse_at_100ms: 0.25,
  concentric_rfd: 0.20
});

const METRIC_KEYS = Object.freeze(Object.keys(WEIGHTS));

const BASELINE_WINDOW_DAYS = 14;
const MIN_BASELINE_TESTS = 2;
const CONFIDENCE_K = 4;

// Buckets are checked in order; first match wins. Lower bound is
// inclusive, upper bound is exclusive.
const BUCKETS = [
  { min: 100, max: Infinity, status: "green_peaked" },
  { min: 95, max: 100, status: "green" },
  { min: 90, max: 95, status: "yellow_monitor" },
  { min: 85, max: 90, status: "yellow_deload" },
  { min: 80, max: 85, status: "red_deload" },
  { min: -Infinity, max: 80, status: "red_recovery" }
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return null;
  const mid = Math.floor(n / 2);
  return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function bucketize(score) {
  for (const b of BUCKETS) {
    if (score >= b.min && score < b.max) return b.status;
  }
  return BUCKETS[BUCKETS.length - 1].status;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function getMetricValue(test, key) {
  const v = test?.metrics?.[key];
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Returns { ok: true, todayValues, baselineValues, nBaselineTests } or
// { ok: false, error } describing the validation failure.
function gatherInputs(todayTest, priorTests) {
  const todayValues = {};
  for (const key of METRIC_KEYS) {
    const v = getMetricValue(todayTest, key);
    if (v == null) {
      return { ok: false, error: `Missing metric on today's test: ${key}` };
    }
    todayValues[key] = v;
  }

  const todayMs = new Date(todayTest.testDate).getTime();
  if (!Number.isFinite(todayMs)) {
    return { ok: false, error: "todayTest.testDate is invalid" };
  }
  const cutoffMs = todayMs - BASELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  // Drop today itself (by id if present, otherwise by exact timestamp
  // match) and restrict to the 14-day window strictly before today.
  const eligible = (priorTests || []).filter((t) => {
    if (!t) return false;
    if (todayTest.id && t.id && t.id === todayTest.id) return false;
    const ms = new Date(t.testDate).getTime();
    if (!Number.isFinite(ms)) return false;
    if (ms >= todayMs) return false;
    if (ms < cutoffMs) return false;
    return true;
  });

  const baselineValues = {};
  for (const key of METRIC_KEYS) {
    const series = [];
    for (const t of eligible) {
      const v = getMetricValue(t, key);
      if (v != null) series.push(v);
    }
    baselineValues[key] = series;
  }

  return { ok: true, todayValues, baselineValues, nBaselineTests: eligible.length };
}

function calculateReadiness(todayTest, priorTests) {
  const inputs = gatherInputs(todayTest, priorTests);
  if (!inputs.ok) {
    return { status: "error", error: inputs.error, score: null };
  }
  const { todayValues, baselineValues, nBaselineTests } = inputs;

  if (nBaselineTests < MIN_BASELINE_TESTS) {
    return {
      status: "establishing_baseline",
      score: null,
      n_baseline_tests: nBaselineTests
    };
  }

  const baselines = {};
  const deltas = {};
  let weightedRatioSum = 0;

  for (const key of METRIC_KEYS) {
    const series = baselineValues[key];
    // Per-metric independent baseline; if any single metric has < 2
    // datapoints we fall back to establishing_baseline. This is rare
    // (would require selective metric gaps in the same athlete's data)
    // but we don't want to silently fabricate a baseline from one obs.
    if (series.length < MIN_BASELINE_TESTS) {
      return {
        status: "establishing_baseline",
        score: null,
        n_baseline_tests: nBaselineTests
      };
    }
    const baseline = median(series);
    if (!(baseline > 0)) {
      return {
        status: "error",
        error: `Baseline for ${key} is non-positive (${baseline}); rejecting as bad data`,
        score: null
      };
    }
    baselines[key] = baseline;
    const today = todayValues[key];
    deltas[key] = round1(((today - baseline) / baseline) * 100);
    weightedRatioSum += WEIGHTS[key] * (today / baseline);
  }

  const rRaw = 100 * weightedRatioSum;
  const c = nBaselineTests / (nBaselineTests + CONFIDENCE_K);
  const rDisplayed = 100 + c * (rRaw - 100);
  const status = bucketize(rDisplayed);

  return {
    score: round1(rDisplayed),
    raw_score: round1(rRaw),
    confidence: Math.round(c * 100),
    status,
    n_baseline_tests: nBaselineTests,
    baselines,
    deltas
  };
}

module.exports = {
  calculateReadiness,
  WEIGHTS,
  METRIC_KEYS,
  BASELINE_WINDOW_DAYS,
  MIN_BASELINE_TESTS,
  CONFIDENCE_K,
  BUCKETS,
  // Exposed for tests:
  median,
  bucketize
};
