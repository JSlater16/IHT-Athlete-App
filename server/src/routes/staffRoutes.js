const express = require("express");
const bcrypt = require("bcryptjs");
const { Prisma } = require("@prisma/client");
const { prisma } = require("../utils/prisma");
const { serializeStaffUser } = require("../utils/formatters");

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
  const [coach] = await prisma.$queryRaw`
    SELECT id, name, email, role, isActive, createdAt
    FROM "User"
    WHERE id = ${id} AND role = 'COACH'
    LIMIT 1
  `;

  if (!coach) {
    res.status(404).json({ error: "Coach not found." });
    return null;
  }

  return {
    ...coach,
    isActive: Boolean(coach.isActive)
  };
}

function normalizeStaffRow(user) {
  return serializeStaffUser({
    ...user,
    isActive: Boolean(user.isActive)
  });
}

router.get("/", async (_req, res, next) => {
  try {
    const staff = await prisma.$queryRaw`
      SELECT id, name, email, role, isActive, createdAt
      FROM "User"
      WHERE role = 'COACH'
      ORDER BY createdAt DESC
    `;

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

    const hashedPassword = await bcrypt.hash(payload.password, 10);
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

    return res.status(201).json({ staffMember: normalizeStaffRow(coach) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(400).json({ error: "A coach with that email already exists." });
    }

    return next(error);
  }
});

router.put("/:id/deactivate", async (req, res, next) => {
  try {
    const coach = await getCoachOr404(req.params.id, res);
    if (!coach) {
      return;
    }

    await prisma.$executeRaw`
      UPDATE "User"
      SET isActive = false
      WHERE id = ${coach.id}
    `;

    const updated = await getCoachOr404(coach.id, res);
    if (!updated) {
      return;
    }

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reactivate", async (req, res, next) => {
  try {
    const coach = await getCoachOr404(req.params.id, res);
    if (!coach) {
      return;
    }

    await prisma.$executeRaw`
      UPDATE "User"
      SET isActive = true
      WHERE id = ${coach.id}
    `;

    const updated = await getCoachOr404(coach.id, res);
    if (!updated) {
      return;
    }

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id/reset-password", async (req, res, next) => {
  try {
    const coach = await getCoachOr404(req.params.id, res);
    if (!coach) {
      return;
    }

    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.$executeRaw`
      UPDATE "User"
      SET password = ${hashedPassword}
      WHERE id = ${coach.id}
    `;

    const updated = await getCoachOr404(coach.id, res);
    if (!updated) {
      return;
    }

    return res.json({ staffMember: normalizeStaffRow(updated) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
