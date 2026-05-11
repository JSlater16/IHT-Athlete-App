"use strict";

const { getAnthropicClient, Anthropic } = require("./anthropic");
const { METRICS } = require("./forcedecks");

// Domain primer for Claude. Stable across all reports so it can be
// prompt-cached. Opus 4.7's caching threshold is 4096 tokens — this
// prompt is shorter, so cache_control is a no-op today, but it
// future-proofs us if the primer grows.
const SYSTEM_PROMPT = `You are an elite sports performance coach analyzing ForceDecks (force-plate) test data. You write concise, actionable reports for a head strength & conditioning coach about a specific athlete's current state.

## ForceDecks metrics primer

ForceDecks measures countermovement-jump performance via dual force plates. Key metrics:

- **Peak Power (W)** — maximum power output during the jump. Higher is better. Reflects total athletic explosiveness.
- **Jump Height (in)** — vertical displacement of center of mass. Practical indicator of explosive output.
- **Watts/kg** — peak power normalized to body weight. Best apples-to-apples metric across athletes of different sizes.
- **Concentric Impulse @ 50ms / @ 100ms (N·s)** — force-time integral early in the concentric phase. Indicates early rate of force development (RFD).
- **RSI-Modified (unitless)** — reactive strength index modified (jump height / time-to-takeoff). High = explosive AND efficient. Trained athletes: 0.35–0.50. Elite jumpers: 0.50+.
- **Impulse Momentum (N·s)** — total propulsive impulse. Directly drives jump height.
- **Concentric Peak Velocity (m/s)** — peak takeoff velocity. Higher = more explosive.
- **Concentric Mean Power (W)** — average power across propulsion.
- **Eccentric Braking RFD (N/s)** — rate of force absorption during the countermovement. High = strong deceleration / landing mechanics.
- **Eccentric Peak Force (N)** — max force during the countermovement. Capacity to absorb load.
- **Force at 0 Velocity (N)** — force at velocity reversal (bottom of countermovement). Marker of isometric strength at depth.
- **Countermovement Depth (in)** — how deep the athlete dropped before reversing. Bigger isn't automatically better — must be paired with force production.

## What to look for

- A drop >5% vs. an athlete's personal best on power, height, or velocity → likely fatigue, undertraining, or motor-control breakdown.
- Concentric–eccentric mismatch (e.g. strong concentric, weak eccentric braking) → potential injury risk or compensatory pattern.
- Improving trend over multiple sessions → effective training stimulus; keep loading.
- Stagnant or declining trend at high effort → plateau, overreach, or technique breakdown.
- Readiness score below 60 → significantly under-recovered; the test data should be interpreted in that light, not as a true performance regression.
- Asymmetry between trends across related metrics (e.g. peak power steady but RSI dropping) → mechanical/efficiency issue rather than raw output.

## Output

Write a 400–650 word report in clean markdown with EXACTLY these section headers:

### Snapshot
One short paragraph summarizing the athlete's current state. Include the latest readiness score and whether they're trending up, holding, or under-recovered.

### Strengths
Bullet list of 2–3 metrics where the athlete is at or near their personal best. Cite specific numbers and what the metric reflects physiologically.

### Concerns
Bullet list of 2–3 metrics that have regressed or are below baseline. Cite specific drop percentages from PR and the most likely physiological/training causes.

### Recommendations
3–5 specific, actionable next steps for the coach — programming adjustments, recovery focus, or testing follow-up. Tie each recommendation to data from the report above.

## Tone

Write for an experienced strength coach. Be specific — reference actual numbers from the data. Skip generic coaching platitudes ("focus on recovery", "work on explosiveness"). If the data is limited (e.g. only one or two tests), acknowledge that briefly and adjust the depth of the analysis accordingly.`;

function buildUserPrompt({ athleteName, tests, bests }) {
  // Tests come in newest-first. Reverse for the prompt so the model
  // reads oldest -> newest, which makes "trend" judgments cleaner.
  const orderedTests = [...tests].reverse();

  const metricLabels = Object.fromEntries(METRICS.map((m) => [m.key, m.label]));

  const formatMetrics = (testMetrics) => {
    return METRICS.map((m) => {
      const row = testMetrics?.[m.key];
      if (!row || row.value == null) return null;
      return `    ${m.label}: ${row.value} ${row.unit}`.trim();
    })
      .filter(Boolean)
      .join("\n");
  };

  const testsBlock = orderedTests
    .map((t, i) => {
      const idx = i + 1;
      const date = new Date(t.testDate).toISOString().slice(0, 10);
      const readiness = t.readinessScore != null ? `${t.readinessScore}/100` : "unavailable";
      return `Session ${idx} (${date}, readiness ${readiness}):\n${formatMetrics(t.metrics)}`;
    })
    .join("\n\n");

  const bestsBlock = Object.entries(bests || {})
    .filter(([key, value]) => Number.isFinite(value) && metricLabels[key])
    .map(([key, value]) => `- ${metricLabels[key]}: ${value}`)
    .join("\n");

  return `Athlete: ${athleteName || "Unknown"}

Below are the athlete's most recent ForceDecks sessions (oldest -> newest) followed by their all-time personal bests for each metric.

${testsBlock || "(no test data)"}

All-time personal bests:
${bestsBlock || "(no bests yet)"}

Generate the performance report.`;
}

async function generateForceDecksReport({ athleteName, tests, bests }) {
  const client = getAnthropicClient();

  // Stream on the server (avoids the 60s SDK HTTP read window on
  // longer responses) then buffer via .finalMessage() so the route
  // can return a plain JSON payload to the browser.
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: buildUserPrompt({ athleteName, tests, bests })
      }
    ]
  });

  const finalMessage = await stream.finalMessage();

  const text = (finalMessage.content || [])
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return {
    text,
    model: finalMessage.model,
    usage: finalMessage.usage,
    stopReason: finalMessage.stop_reason
  };
}

module.exports = { generateForceDecksReport, Anthropic };
