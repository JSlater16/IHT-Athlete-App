"use strict";

const { prisma } = require("./prisma");

// For each lift in `lifts`, attach `lastLoggedWeight: { value, date }`
// from the athlete's most-recent earlier instance of the same
// exercise name that has a non-null loggedWeight. Returns a fresh
// array; does not mutate the inputs.
async function attachLastLoggedWeight(lifts) {
  if (!Array.isArray(lifts) || lifts.length === 0) return lifts;
  const athleteId = lifts[0].athleteId;
  const exerciseNames = [...new Set(lifts.map((l) => l.exerciseName))];

  const logs = await prisma.lift.findMany({
    where: {
      athleteId,
      exerciseName: { in: exerciseNames },
      loggedWeight: { not: null }
    },
    orderBy: { date: "desc" },
    select: { exerciseName: true, loggedWeight: true, date: true, id: true }
  });

  // Group by exercise; logs[] is already date-desc so the first hit
  // strictly earlier than the lift's date is the answer.
  const byName = new Map();
  for (const log of logs) {
    if (!byName.has(log.exerciseName)) byName.set(log.exerciseName, []);
    byName.get(log.exerciseName).push(log);
  }

  return lifts.map((lift) => {
    const candidates = byName.get(lift.exerciseName) || [];
    const liftMs = new Date(lift.date).getTime();
    const prior = candidates.find(
      (c) => c.id !== lift.id && new Date(c.date).getTime() < liftMs
    );
    return {
      ...lift,
      lastLoggedWeight: prior
        ? { value: prior.loggedWeight, date: prior.date }
        : null
    };
  });
}

module.exports = { attachLastLoggedWeight };
