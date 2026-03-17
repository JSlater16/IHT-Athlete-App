const express = require("express");
const { prisma } = require("../utils/prisma");
const { getWeekRange } = require("../utils/date");
const { readProgramLibrary } = require("../utils/programLibrary");
const { serializeLift } = require("../utils/formatters");
const { buildPhaseTimeline } = require("../utils/phasePlan");
const { standardProgramVariant } = require("../utils/programVariant");
const { enrichLiftBlocks } = require("../utils/liftBlocks");
const { parseRehabProfile } = require("../utils/rehabProfile");

const router = express.Router();

async function getMyProfileOr404(userId, res) {
  const athlete = await prisma.athleteProfile.findUnique({
    where: { userId },
    include: { user: true }
  });

  if (!athlete) {
    res.status(404).json({ error: "Athlete profile not found." });
    return null;
  }

  return athlete;
}

router.get("/profile", async (req, res, next) => {
  try {
    const athlete = await getMyProfileOr404(req.user.sub, res);
    if (!athlete) {
      return;
    }

    return res.json({
      profile: {
        id: athlete.id,
        name: athlete.user.name,
        email: athlete.user.email,
        phase: athlete.phase,
        phaseStartedAt: athlete.phaseStartedAt,
        phaseTimeline: buildPhaseTimeline(athlete),
        programmingDays: athlete.programmingDays,
        trainingModel: athlete.trainingModel,
        programVariant: athlete.programVariant || standardProgramVariant,
        rehabProfile: parseRehabProfile(athlete.rehabProfile),
        coachNotes: athlete.coachNotes,
        updatedAt: athlete.updatedAt
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/lifts", async (req, res, next) => {
  try {
    const athlete = await getMyProfileOr404(req.user.sub, res);
    if (!athlete) {
      return;
    }

    const { weekStart, weekEnd } = getWeekRange(req.query.week);
    const lifts = await prisma.lift.findMany({
      where: {
        athleteId: athlete.id,
        date: {
          gte: weekStart,
          lte: weekEnd
        }
      },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }]
    });
    const library = await readProgramLibrary();
    const enrichedLifts = enrichLiftBlocks({
      lifts,
      athlete,
      weekStart,
      library
    });

    return res.json({ lifts: enrichedLifts.map(serializeLift) });
  } catch (error) {
    return next(error);
  }
});

router.put("/lifts/:liftId", async (req, res, next) => {
  try {
    const athlete = await getMyProfileOr404(req.user.sub, res);
    if (!athlete) {
      return;
    }

    if (typeof req.body?.completed !== "boolean") {
      return res.status(400).json({ error: "Completed must be true or false." });
    }

    const existingLift = await prisma.lift.findFirst({
      where: {
        id: req.params.liftId,
        athleteId: athlete.id
      }
    });

    if (!existingLift) {
      return res.status(404).json({ error: "Lift not found." });
    }

    const updated = await prisma.lift.update({
      where: { id: existingLift.id },
      data: { completed: req.body.completed }
    });

    return res.json({ lift: serializeLift(updated) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
