"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");

const {
  calculateReadiness,
  METRIC_KEYS,
  CONFIDENCE_K,
  bucketize,
  median
} = require("../readiness");

const DAY_MS = 24 * 60 * 60 * 1000;

// Baseline values used across most tests. Realistic-ish CMJ numbers.
const BASE = Object.freeze({
  force_at_zero_velocity: 1800,         // N
  eccentric_peak_velocity: 1.2,         // m/s
  concentric_impulse_at_100ms: 145,     // N·s
  concentric_rfd: 9500                  // N/s
});

function metricsAt(scale = 1) {
  const out = {};
  for (const k of METRIC_KEYS) out[k] = BASE[k] * scale;
  return out;
}

// today is fixed; priors are placed at -1d, -2d, ... so they fall
// inside the 14-day window unless explicitly aged out.
const TODAY = new Date("2026-05-16T12:00:00Z");

function makeTest(daysAgo, scale = 1, overrides = null) {
  return {
    id: `t-${daysAgo}`,
    testDate: new Date(TODAY.getTime() - daysAgo * DAY_MS),
    metrics: overrides ? { ...metricsAt(scale), ...overrides } : metricsAt(scale)
  };
}

function buildPriors(n, scale = 1) {
  // Spread N priors evenly across days 1..14 (oldest first), then take
  // the first N so callers asking for fewer get a tight recent set.
  const priors = [];
  for (let i = 1; i <= n; i++) priors.push(makeTest(i, scale));
  return priors;
}

test("N=0 prior tests returns establishing_baseline with score null", () => {
  const today = makeTest(0);
  const result = calculateReadiness(today, []);
  assert.equal(result.status, "establishing_baseline");
  assert.equal(result.score, null);
  assert.equal(result.n_baseline_tests, 0);
});

test("N=1 prior test still returns establishing_baseline (min is 2)", () => {
  const today = makeTest(0);
  const result = calculateReadiness(today, buildPriors(1));
  assert.equal(result.status, "establishing_baseline");
  assert.equal(result.n_baseline_tests, 1);
});

test("N=2: scores cleanly, confidence = 2/(2+4) = 33", () => {
  const today = makeTest(0);
  const result = calculateReadiness(today, buildPriors(2));
  assert.equal(result.n_baseline_tests, 2);
  assert.equal(result.confidence, 33);
  // All metrics at baseline → ratio=1 → raw=100 → displayed=100
  assert.equal(result.raw_score, 100);
  assert.equal(result.score, 100);
  assert.equal(result.status, "green_peaked");
});

test("N=8: confidence = 8/(8+4) = 67", () => {
  const today = makeTest(0);
  const result = calculateReadiness(today, buildPriors(8));
  assert.equal(result.n_baseline_tests, 8);
  assert.equal(result.confidence, 67);
});

test("windowDays override: only priors inside the window count", () => {
  const today = makeTest(0);
  // 8 inside a 14-day window (days 1-8), 12 outside (days 15-26).
  const inside = buildPriors(8);
  const outside = [];
  for (let i = 15; i <= 26; i++) outside.push(makeTest(i));
  const result = calculateReadiness(today, [...inside, ...outside], { windowDays: 14 });
  assert.equal(result.n_baseline_tests, 8);
});

test("missing metric on today's test returns error, no partial score", () => {
  const today = makeTest(0);
  delete today.metrics.concentric_rfd;
  const result = calculateReadiness(today, buildPriors(5));
  assert.equal(result.status, "error");
  assert.match(result.error, /Missing metric/);
  assert.equal(result.score, null);
});

test("zero baseline across ALL priors falls back to establishing_baseline", () => {
  // Now that we filter non-positive priors as missing-data, an
  // all-zero series for one metric leaves it with < 2 positive values
  // → can't establish a baseline for that metric → status flips to
  // establishing_baseline (not error).
  const today = makeTest(0);
  const priors = buildPriors(5).map((t) => ({
    ...t,
    metrics: { ...t.metrics, force_at_zero_velocity: 0 }
  }));
  const result = calculateReadiness(today, priors);
  assert.equal(result.status, "establishing_baseline");
});

test("a few zero priors are ignored; remaining positives form the baseline", () => {
  // Mirror of the Banks Wickersham case: most priors have a real
  // CRFD, two have 0 because VALD couldn't compute it. The 0s should
  // be filtered, not poison the median.
  const today = makeTest(0);
  const priors = buildPriors(5).map((t, idx) => ({
    ...t,
    metrics: {
      ...t.metrics,
      concentric_rfd: idx < 2 ? 0 : t.metrics.concentric_rfd
    }
  }));
  const result = calculateReadiness(today, priors);
  assert.equal(result.status, "green_peaked");
  assert.equal(result.baselines.concentric_rfd, BASE.concentric_rfd);
});

test("today's metric at 0 still rejected (missing data on the latest test)", () => {
  const today = makeTest(0);
  today.metrics.concentric_rfd = 0;
  const result = calculateReadiness(today, buildPriors(5));
  assert.equal(result.status, "error");
  assert.match(result.error, /non-positive/);
});

test("all-negative priors for one metric fall back to establishing_baseline", () => {
  // Negative values are treated the same as zeros (VALD "could not
  // compute") — they're filtered out of the per-metric baseline.
  // With every prior masked, we can't establish a baseline.
  const today = makeTest(0);
  const priors = buildPriors(5).map((t) => ({
    ...t,
    metrics: { ...t.metrics, eccentric_peak_velocity: -0.5 }
  }));
  const result = calculateReadiness(today, priors);
  assert.equal(result.status, "establishing_baseline");
});

test("all metrics exactly at baseline → score is exactly 100", () => {
  const today = makeTest(0, 1);
  const result = calculateReadiness(today, buildPriors(5, 1));
  assert.equal(result.raw_score, 100);
  assert.equal(result.score, 100);
});

test("all metrics down 10%: raw ≈ 90, displayed shrinks toward 100 at low N", () => {
  const today = makeTest(0, 0.9);
  // N=2 → C = 2/6 = 0.333…; displayed = 100 + 0.333*(90-100) = 96.67
  const lowN = calculateReadiness(today, buildPriors(2));
  assert.equal(lowN.raw_score, 90);
  assert.ok(Math.abs(lowN.score - 96.7) < 0.05, `got ${lowN.score}`);

  // N=14 (capped at 14d window in our fixture): same 90 raw, but
  // C = 14/18 ≈ 0.778; displayed = 100 + 0.778*-10 = 92.22
  const priorsWindow = buildPriors(14, 1);
  const highN = calculateReadiness(today, priorsWindow);
  assert.equal(highN.raw_score, 90);
  assert.ok(Math.abs(highN.score - 92.2) < 0.05, `got ${highN.score}`);
  assert.ok(lowN.score > highN.score, "low-N should shrink closer to 100");
});

test("today's test is excluded from its own baseline (by id)", () => {
  const today = makeTest(0, 1);
  // Include "today" itself in the priors list — should be filtered.
  const priors = [today, ...buildPriors(3, 1)];
  const result = calculateReadiness(today, priors);
  assert.equal(result.n_baseline_tests, 3);
});

test("baselines and deltas populate for every metric", () => {
  const today = makeTest(0, 1.05);
  const priors = buildPriors(5, 1);
  const result = calculateReadiness(today, priors);
  for (const k of METRIC_KEYS) {
    assert.ok(typeof result.baselines[k] === "number", `baseline missing for ${k}`);
    assert.equal(result.deltas[k], 5.0);
  }
});

test("status buckets cover the full range", () => {
  assert.equal(bucketize(120), "green_peaked");
  assert.equal(bucketize(100), "green_peaked");
  assert.equal(bucketize(99.9), "green");
  assert.equal(bucketize(95), "green");
  assert.equal(bucketize(94.9), "yellow_monitor");
  assert.equal(bucketize(90), "yellow_monitor");
  assert.equal(bucketize(89.9), "yellow_deload");
  assert.equal(bucketize(85), "yellow_deload");
  assert.equal(bucketize(84.9), "red_deload");
  assert.equal(bucketize(80), "red_deload");
  assert.equal(bucketize(79.9), "red_recovery");
  assert.equal(bucketize(0), "red_recovery");
});

test("median helper handles odd/even/empty correctly", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test("confidence formula matches spec at known points", () => {
  // C = N / (N + k), k = 4. Verify shape via a -10% drop.
  const cases = [
    { n: 2, expected: 2 / (2 + CONFIDENCE_K) },
    { n: 4, expected: 4 / (4 + CONFIDENCE_K) },
    { n: 10, expected: 10 / (10 + CONFIDENCE_K) }
  ];
  for (const { n, expected } of cases) {
    const today = makeTest(0, 0.9);
    const result = calculateReadiness(today, buildPriors(n, 1));
    assert.equal(result.confidence, Math.round(expected * 100));
  }
});

test("weighted equation: lift FZV +10%, others flat → raw = 103", () => {
  // 0.30 * 1.10 + 0.25 + 0.25 + 0.20 = 1.03 → raw = 103
  const today = makeTest(0, 1);
  today.metrics.force_at_zero_velocity = BASE.force_at_zero_velocity * 1.1;
  const result = calculateReadiness(today, buildPriors(20, 1));
  assert.equal(result.raw_score, 103);
});
