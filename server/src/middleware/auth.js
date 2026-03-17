const { verifyToken } = require("../utils/jwt");

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication required." });
  }

  try {
    req.user = verifyToken(token);
    return next();
  } catch (_error) {
    return res.status(401).json({ error: "Invalid or expired token." });
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
  if (req.user?.