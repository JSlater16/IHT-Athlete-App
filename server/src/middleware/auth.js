const { verifyToken } = require("../utils/jwt");
const { prisma } = require("../utils/prisma");

/* requireAuth verifies the JWT signature, then re-validates the
   user against the database on every request. The DB lookup is
   what makes "log everyone out" possible: bumping
   user.tokenVersion invalidates outstanding JWTs immediately
   instead of waiting for them to expire. Also catches accounts
   deactivated mid-session. */
async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, role: true, tokenVersion: true, isActive: true }
    });

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!user.isActive) {
      return res.status(401).json({ error: "Account disabled" });
    }

    if (user.tokenVersion !== decoded.tv) {
      return res.status(401).json({ error: "Session invalidated" });
    }

    /* Expose both id and sub so downstream handlers written against
       either convention keep working. */
    req.user = { id: user.id, sub: user.id, role: user.role };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireCoach(req, res, next) {
  if (!["COACH", "OWNER"].includes(req.user?.role)) {
    return res.status(403).json({ error: "Coach access required." });
  }
  return next();
}

function requireOwner(req, res, next) {
  if (req.user?.role !== "OWNER") {
    return res.status(403).json({ error: "Owner access required." });
  }
  return next();
}

function requireAthlete(req, res, next) {
  if (req.user?.role !== "ATHLETE") {
    return res.status(403).json({ error: "Athlete access required." });
  }
  return next();
}

module.exports = {
  requireAuth,
  requireCoach,
  requireAthlete,
  requireOwner
};
