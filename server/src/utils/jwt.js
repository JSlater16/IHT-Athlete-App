const path = require("path");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

/* JWT payload is intentionally minimal: subject + role + token
   version. We used to embed name/email but those leak PII into
   client storage and become stale once a user updates their
   profile. requireAuth re-reads the user on every request — the
   extra Prisma lookup is the cost of being able to revoke tokens
   (bump tokenVersion) and disable accounts in real time. */
function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      tv: user.tokenVersion ?? 0
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = {
  signToken,
  verifyToken
};
