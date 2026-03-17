const path = require("path");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      athleteId: user.athleteProfile?.id || null,
      name: user.name,
      email: user.email
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}
