const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../utils/prisma");
const { getWeekRange } = require("../utils/date");
const { readProgramLibrary } = require("../utils/programLibrary");
const { serializeLift } = require("../utils/formatters");
const { buildPhaseTimeline } = require("../utils/phasePlan");
const { standardProgramVariant } = require("../utils/programVariant");
const { enrichLiftBlocks } = require("../utils/liftBlocks");
const { attachLastLoggedWeight } = require("../utils/liftHistory");
const { parseRehabProfile } = require("../utils/rehabProfile");
const { validatePassword } = require("../utils/password");
const { passwordChangeLimiter } = require("../utils/rateLimiters");
const { recordAudit } = require("../utils/audit");

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
      orderBy: [{ date: "asc" }, { orderIndex: "asc" }, { createdAt: "asc" }]
    });
    const library = await readProgramLibrary();
    const enrichedLifts = enrichLiftBlocks({
      lifts,
      athlete,
      weekStart,
      library
    });
    const withHistory = await attachLastLoggedWeight(enrichedLifts);

    return res.json({ lifts: withHistory.map(serializeLift) });
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

    const body = req.body || {};
    const update = {};
    if ("completed" in body) {
      if (typeof body.completed !== "boolean") {
        return res.status(400).json({ error: "Completed must be true or false." });
      }
      update.completed = body.completed;
    }
    if ("loggedWeight" in body) {
      if (body.loggedWeight !== null && typeof body.loggedWeight !== "string") {
        return res.status(400).json({ error: "loggedWeight must be a string or null." });
      }
      const trimmed = typeof body.loggedWeight === "string" ? body.loggedWeight.trim() : null;
      if (trimmed !== null && trimmed.length > 64) {
        return res.status(400).json({ error: "loggedWeight is too long (max 64 chars)." });
      }
      update.loggedWeight = trimmed && trimmed.length > 0 ? trimmed : null;
    }
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "Nothing to update." });
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
      data: update
    });

    return res.json({ lift: serializeLift(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/change-password", passwordChangeLimiter, async (req, res, next) => {
  try {
    const athlete = await getMyProfileOr404(req.user.sub, res);
    if (!athlete) {
      return;
    }

    const currentPassword =
      typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!currentPassword) {
      return res.status(400).json({ error: "Current password is required." });
    }

    validatePassword(newPassword);

    const passwordMatches = await bcrypt.compare(currentPassword, athlete.user.password);
    if (!passwordMatches) {
      return res.status(400).json({ error: "Current password is incorrect." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    /* Bump tokenVersion so every existing JWT for this user becomes
       invalid the next time requireAuth runs. Forces re-login on
       any other devices the athlete might be signed into. */
    await prisma.user.update({
      where: { id: athlete.userId },
      data: {
        password: hashedPassword,
        tokenVersion: { increment: 1 }
      }
    });

    await recordAudit({
      req,
      action: "auth.password_change",
      targetType: "user",
      targetId: athlete.userId,
      targetLabel: athlete.user.email
    });

    return res.json({ success: true });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

module.exports = router;
