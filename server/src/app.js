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

