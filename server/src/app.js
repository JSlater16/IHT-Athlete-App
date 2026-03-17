const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const fs = require("fs");

const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const athleteRoutes = require("./routes/athleteRoutes");
const meRoutes = require("./routes/meRoutes");
const programLibraryRoutes = require("./routes/programLibraryRoutes");
const staffRoutes = require("./routes/staffRoutes");
const { requireAuth, requireAthlete, requireCoach, requireOwner } = require("./middleware/auth");

const app = express();
const clientDistPath = path.resolve(__dirname, "..", "..", "client", "dist");

function buildAllowedOrigins() {
  const rawOrigins = process.env.CLIENT_URL || "";

  return rawOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const allowedOrigins = buildAllowedOrigins();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/auth", authRoutes);
app.use("/api/athletes", requireAuth, requireCoach, athleteRoutes);
app.use("/api/program-library", requireAuth, requireCoach, programLibraryRoutes);
app.use("/api/staff", requireAuth, requireOwner, staffRoutes);
app.use("/api/me", requireAuth, requireAthlete, meRoutes);

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      return next();
    }

    return res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Unexpected server error." });
});

module.exports = app;
