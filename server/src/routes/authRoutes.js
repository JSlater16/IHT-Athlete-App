const express = require("express");
const bcrypt = require("bcryptjs");
const { prisma } = require("../utils/prisma");
const { signToken } = require("../utils/jwt");
const { recordAudit } = require("../utils/audit");
const { loginLimiter } = require("../utils/rateLimiters");

const router = express.Router();

router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};

    if (typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findFirst({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        password: true,
        isActive: true,
        tokenVersion: true
      }
    });

    if (!user) {
      await recordAudit({
        req,
        action: "auth.login_failure",
        targetType: "user",
        targetLabel: normalizedEmail,
        metadata: { reason: "unknown_email" }
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      await recordAudit({
        req,
        action: "auth.login_failure",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email,
        metadata: { reason: "bad_password" }
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (!Boolean(user.isActive)) {
      await recordAudit({
        req,
        action: "auth.login_blocked",
        targetType: "user",
        targetId: user.id,
        targetLabel: user.email,
        metadata: { reason: "inactive_account" }
      });
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

    await recordAudit({
      req,
      actor: { id: user.id, name: user.name, role: user.role },
      action: "auth.login_success",
      targetType: "user",
      targetId: user.id,
      targetLabel: user.email
    });

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
