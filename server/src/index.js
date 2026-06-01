const app = require("./app");
const { startValdCron } = require("./vald/cron");
const { retryPendingMetricFetches } = require("./vald/sync");

// 1080 Motion ("onezero") integration is being iterated locally and
// hasn't been committed yet. Load its cron starter if present so local
// dev works, but don't blow up the deploy when the module isn't there.
let startOnezeroCron = null;
try {
  startOnezeroCron = require("./onezero/cron").startOnezeroCron;
} catch (err) {
  if (err?.code !== "MODULE_NOT_FOUND") throw err;
}

const port = Number(process.env.PORT) || 4000;
const host = process.env.HOST || "127.0.0.1";

// In-process tick that drains the readiness-metric retry queue. The
// nightly VALD cron also calls this at the start of its run, so the
// queue still drains even if this interval is paused (e.g. during
// container restarts).
const RETRY_TICK_MS = 15 * 60 * 1000;

const server = app.listen(port, host, () => {
  console.log(`API listening on http://${host}:${port}`);
  startValdCron();
  if (startOnezeroCron) startOnezeroCron();

  if (process.env.VALD_RETRY_TICK_DISABLED !== "true") {
    setInterval(() => {
      retryPendingMetricFetches().catch((err) => {
        console.error("[vald-retry] tick failed:", err.message);
      });
    }, RETRY_TICK_MS).unref();
  }
});

server.on("error", (error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
