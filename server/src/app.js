const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
const fs = require("fs");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const authRoutes = require("./routes/authRoutes");
const athleteRoutes = require("./routes/athleteRoutes");
const meRoutes = require("./routes/meRoutes");
const programLibraryRoutes = require("./routes/programLibraryRoutes");
const staffRoutes = require("./routes/staffRoutes");
const auditRoutes = require("./routes/auditRoutes");
const { requireAuth, requireAthlete, requireCoach, requireOwner } = require("./middleware/auth");

const app = express();
const clientDistPath = path.resolve(__dirname, "..", "..", "client", "dist");

/* Behind Render's proxy in production — trust one hop so req.ip
   resolves to the real client (needed for rate limiting + audit log)
   rather than the proxy's address. Limited to a single hop to avoid
   x-forwarded-for spoofing from the public side. */
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

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
      /* Allow same-origin / curl (no Origin header). Cross-origin
         requests must come from an explicitly configured CLIENT_URL.
         Fail-closed: if the operator forgot to set CLIENT_URL, we
         reject browser CORS requests rather than silently allowing
         any origin. */
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0) {
        return callback(new Error("CORS: no allowed origins configured"));
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS origin not allowed."));
    },
    credentials: true
  })
);
/* CSP is served by the client via a <meta> tag in index.html so the
   SPA's runtime needs can stay close to the markup. Keep helmet's
   other defaults (X-Content-Type-Options, HSTS in production,
   referrer-policy, etc.) which don't conflict with static SPA
   hosting. */
app.use(helmet({ contentSecurityPolicy: false }));
// 10mb to accommodate rehab pad-placement images sent as base64; remove once images move to object storage
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/athletes", requireAuth, requireCoach, athleteRoutes);
app.use("/api/program-library", requireAuth, requireCoach, programLibraryRoutes);
app.use("/api/staff", requireAuth, requireOwner, staffRoutes);
app.use("/api/audit-log", requireAuth, requireOwner, auditRoutes);
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
  /* Never log the raw error object — Express attaches the original
     request (including its body) which can carry passwords, tokens,
     or other secrets straight into logs. Message + stack is plenty
     to debug with. */
  console.error(error.message, error.stack);
  res.status(500).json({ error: "Unexpected server error." });
});

module.exports = app;
