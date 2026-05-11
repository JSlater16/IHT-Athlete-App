const express = require("express");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../utils/prisma");
const { serializeStaffUser } = require("../utils/formatters");
const { recordAudit } = require("../utils/audit");
const { validatePassword } = require("../utils/password");
const { passwordChangeLimiter } = require("../utils/rateLimiters");

const router = express.Router();

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCoachPayload(body) {
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!name) {
    return { error: "Name is required." };
  }

  if (!email || !isValidEmail(email)) {
    return { error: "A valid email is required." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  return { name, email, password };
}

async function getCoachOr404(id, res) {
  const coach = await prisma.user.findFirst({
    where: { id, role: "COACH" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true
    }
  });

  if (!coach) {
    res.status(404).json({ error: "Coach not found." });
    return null;
  }

  return coach;
}

function normalizeStaffRow(user) {
  return serializeStaffUser(user);
}

router.get("/", async (_req, res, next) => {
  try {
    const staff = await prisma.user.findMany({
      where: { role: "COACH" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    });

    return res.json({
      staff: staff.map(normalizeStaffRow)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const payload = validateCoachPayload(req.body);

    if (payload.error) {
      return res.status(400).json({ error: payload.error });
    }

    validatePassword(payload.password);

    const hashedPassword = await bcrypt.hash(payload.password, 12);
    const createdCoach = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        password: hashedPassword,
        role: "COACH"
      }
    });

    const coach = await getCoachOr404(createdCoach.id, res);
    if (!coach) {
      return;
    }

    await recordAudit({
      req,
      action: "coach.create",
      targetType: "user",
      targetId: coach.id,
      targetLabel: coach.email
    });

    return res.status(201).json({ staffMember: normalizeStaffRow(coach) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "A coach with that email already exists." });
    }

    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

const STAFF_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true
};

async function updateCoachOr404(id, data) {
  try {
    return await prisma.$transaction(async (tx) => {
      const coach = await tx.user.findFirst({
        where: { id, role: "COACH" },
        select: { id: true }
      });

      if (!coach) {
        return null;
      }

      return tx.user.update({
        where: { id: coach.id },
        data,
        select: STAFF_USER_SELECT
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return null;
    }
    throw error;
  }
}

router.put("/:id/deactivate", async (req, res, next) => {
  try {
    /* Bump tokenVersion so any outstanding JWTs for this coach
       fail the requireAuth check on their next request. Without
       this, a deactivated coach could keep using a valid token
       until it expires up to a week later. */
    const updated = await updateCoachOr404(req.params.id, {
      isActive: false,
      tokenVersion: { increment: 1 }
    });
    if (!updated) {
      return res.status(404).json({ error: "Coach not found." });
    }

    await recordAudit({
      req,
      action: "coach.deactivate",
      targetType: "user",
      targetId: updated.id,
      targetLabel: updated.email
    });

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reactivate", async (req, res, next) => {
  try {
    const updated = await updateCoachOr404(req.params.id, { isActive: true });
    if (!updated) {
      return res.status(404).json({ error: "Coach not found." });
    }

    await recordAudit({
      req,
      action: "coach.reactivate",
      targetType: "user",
      targetId: updated.id,
      targetLabel: updated.email
    });

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reset-password", passwordChangeLimiter, async (req, res, next) => {
  try {
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    validatePassword(password);

    const hashedPassword = await bcrypt.hash(password, 12);
    const updated = await updateCoachOr404(req.params.id, {
      password: hashedPassword,
      tokenVersion: { increment: 1 }
    });
    if (!updated) {
      return res.status(404).json({ error: "Coach not found." });
    }

    await recordAudit({
      req,
      action: "coach.password_reset",
      targetType: "user",
      targetId: updated.id,
      targetLabel: updated.email
    });

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    if (error?.status === 400) {
      return res.status(400).json({ error: error.message });
    }
    return next(error);
  }
});

module.exports = router;
