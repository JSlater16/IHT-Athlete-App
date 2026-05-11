"use strict";

// Single source of truth for ForceDecks metric names + display info.
// The athlete view only shows non-coachOnly metrics; the coach view
// shows everything. Add new metrics by appending here.

const METRICS = [
  { key: "peak_power", label: "Peak Power", unit: "W", coachOnly: false },
  { key: "jump_height", label: "Jump Height", unit: "in", coachOnly: false },
  { key: "watts_per_kg", label: "Watts/kg", unit: "W/kg", coachOnly: true },
  { key: "concentric_impulse_50ms", label: "Conc. Impulse @ 50ms", unit: "N·s", coachOnly: true },
  { key: "concentric_impulse_100ms", label: "Conc. Impulse @ 100ms", unit: "N·s", coachOnly: true },
  { key: "rsi_modified", label: "RSI-Modified", unit: "", coachOnly: true },
  { key: "impulse_momentum", label: "Impulse Momentum", unit: "N·s", coachOnly: true },
  { key: "concentric_peak_velocity", label: "Conc. Peak Velocity", unit: "m/s", coachOnly: true },
  { key: "concentric_mean_power", label: "Conc. Mean Power", unit: "W", coachOnly: true },
  { key: "eccentric_braking_rfd", label: "Ecc. Braking RFD", unit: "N/s", coachOnly: true },
  { key: "eccentric_peak_force", label: "Ecc. Peak Force", unit: "N", coachOnly: true },
  { key: "force_at_0_velocity", label: "Force @ 0 Velocity", unit: "N", coachOnly: true },
  { key: "countermovement_depth", label: "Countermovement Depth", unit: "in", coachOnly: true },
];

const METRIC_KEYS = new Set(METRICS.map((m) => m.key));

function isValidMetricKey(key) {
  return typeof key === "string" && METRIC_KEYS.has(key);
}

module.exports = { METRICS, METRIC_KEYS, isValidMetricKey };
