"use strict";

/* Map from VALD result definitions → our internal metric catalog
 * (server/src/utils/forcedecks.js).
 *
 * VALD identifies metrics by integer `resultId` plus a human-readable
 * `resultIdString`. We key on resultId because integers are stable
 * and faster to match. If VALD adds a new id we'd need to re-run
 * `node scripts/dumpValdResultDefs.js` to spot it.
 *
 * convert(value) is applied to the raw VALD value before storing,
 * so the stored units match the display units in METRICS.
 */

// trend matches VALD's resultDefinition.trendDirection. Used to pick
// the "best" value across trials in a single session (max for
// positive, min for negative, max as a sensible default for none).
const VALD_METRIC_MAP = {
  6553633: { appKey: "peak_power", convert: (v) => v, trend: "positive" },
  6553613: { appKey: "jump_height", convert: (v) => v, trend: "positive" },
  6553604: { appKey: "watts_per_kg", convert: (v) => v, trend: "positive" },
  6553674: { appKey: "concentric_impulse_50ms", convert: (v) => v, trend: "positive" },
  6553675: { appKey: "concentric_impulse_at_100ms", convert: (v) => v, trend: "positive" },
  6553698: { appKey: "rsi_modified", convert: (v) => v, trend: "positive" },
  6553712: { appKey: "impulse_momentum", convert: (v) => v, trend: "positive" },
  6553634: { appKey: "concentric_peak_velocity", convert: (v) => v, trend: "positive" },
  6553623: { appKey: "concentric_mean_power", convert: (v) => v, trend: "positive" },
  6553678: { appKey: "eccentric_braking_rfd", convert: (v) => v, trend: "positive" },
  6553687: { appKey: "eccentric_peak_force", convert: (v) => v, trend: "positive" },
  6553713: { appKey: "force_at_zero_velocity", convert: (v) => v, trend: "positive" },
  6553603: { appKey: "countermovement_depth", convert: (v) => v, trend: "none" },
  // Readiness inputs. VALD marks ECCENTRIC_PEAK_VELOCITY as trend
  // "None" but for our purposes higher = better, so we treat it as
  // positive when picking the session-best across trials.
  6553701: { appKey: "eccentric_peak_velocity", convert: (v) => v, trend: "positive" },
  6553637: { appKey: "concentric_rfd", convert: (v) => v, trend: "positive" }
};

const VALD_RESULT_IDS = Object.keys(VALD_METRIC_MAP).map(Number);

function mapValdResult(resultId, value) {
  const entry = VALD_METRIC_MAP[resultId];
  if (!entry) return null;
  if (!Number.isFinite(Number(value))) return null;
  return { appKey: entry.appKey, value: entry.convert(Number(value)), trend: entry.trend };
}

module.exports = { VALD_METRIC_MAP, VALD_RESULT_IDS, mapValdResult };
