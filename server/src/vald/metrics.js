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

const VALD_METRIC_MAP = {
  // peak_power: CMJ takeoff concentric peak power (W). The standalone
  // "Peak Power" reported in VALD Hub for a CMJ test.
  6553633: { appKey: "peak_power", convert: (v) => v },

  // jump_height: flight-time method, already in inches. Flight time is
  // the simpler/more universally comparable approach; impulse-momentum
  // (id 6553614) is the alternative.
  6553613: { appKey: "jump_height", convert: (v) => v },

  // watts_per_kg: bodymass-relative peak power. Coach-only.
  6553604: { appKey: "watts_per_kg", convert: (v) => v },

  6553674: { appKey: "concentric_impulse_50ms", convert: (v) => v },
  6553675: { appKey: "concentric_impulse_100ms", convert: (v) => v },

  // rsi_modified: jump height / contraction time. Standard RSI-mod.
  6553698: { appKey: "rsi_modified", convert: (v) => v },

  // impulse_momentum: ambiguous label in our catalog — using net
  // concentric impulse (the impulse the jump's height calc is built
  // from). Flip to POSITIVE_IMPULSE (6553714) or POSITIVE_TAKEOFF_IMPULSE
  // (6553717) if you prefer.
  6553712: { appKey: "impulse_momentum", convert: (v) => v },

  6553634: { appKey: "concentric_peak_velocity", convert: (v) => v },
  6553623: { appKey: "concentric_mean_power", convert: (v) => v },
  6553678: { appKey: "eccentric_braking_rfd", convert: (v) => v },
  6553687: { appKey: "eccentric_peak_force", convert: (v) => v },
  6553713: { appKey: "force_at_0_velocity", convert: (v) => v },

  6553603: { appKey: "countermovement_depth", convert: (v) => v }
};

const VALD_RESULT_IDS = Object.keys(VALD_METRIC_MAP).map(Number);

function mapValdResult(resultId, value) {
  const entry = VALD_METRIC_MAP[resultId];
  if (!entry) return null;
  if (!Number.isFinite(Number(value))) return null;
  return { appKey: entry.appKey, value: entry.convert(Number(value)) };
}

module.exports = { VALD_METRIC_MAP, VALD_RESULT_IDS, mapValdResult };
