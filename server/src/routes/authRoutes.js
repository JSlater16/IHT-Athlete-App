const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../utils/prisma");
const { signToken } = require("../utils/jwt");

const router = express.Router();

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await prisma.$queryRaw`
      SELECT id, name, email, password, role, isActive
      FROM "User"
      WHERE email = ${normalizedEmail}
      LIMIT 1
    `;

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!Boolean(user.isActive)) {
      return res.status(403).json({
        error: "Your account has been deactivated. Contact the gym owner."
      });
    }

    const athleteProfile = user.role === "ATHLETE"
      ? await prisma.athleteProfile.findUnique({
          where: { userId: user.id }
        })
      : null;

    const token = signToken({ ...user, athleteProfile });

    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: Boolean(user.isActive),
        athleteId: athleteProfile?.id || null
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
