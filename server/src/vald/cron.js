"use strict";

const cron = require("node-cron");
const { syncAllLinkedAthletes } = require("./sync");

// "1 0 * * *" = 00:01 every day. Timezone pinned to America/New_York
// so we get 12:01 AM Eastern year-round (DST handled automatically).
const SCHEDULE = "1 0 * * *";
const TZ = "America/New_York";

let task = null;

function startValdCron({ logger = console } = {}) {
  if (task) return task;
  if (process.env.VALD_CRON_DISABLED === "true") {
    logger.log("[vald-cron] disabled via VALD_CRON_DISABLED=true");
    return null;
  }
  if (!process.env.VALD_CLIENT_ID || !process.env.VALD_CLIENT_SECRET) {
    logger.log("[vald-cron] skipped — VALD credentials not configured");
    return null;
  }

  task = cron.schedule(
    SCHEDULE,
    async () => {
      const startedAt = new Date();
      logger.log(`[vald-cron] sync starting at ${startedAt.toISOString()}`);
      try {
        const results = await syncAllLinkedAthletes();
        const imported = results.reduce((acc, r) => acc + (r.imported || 0), 0);
        const errors = results.filter((r) => r.error);
        logger.log(
          `[vald-cron] sync done: ${results.length} athletes, ${imported} tests imported, ${errors.length} errors`
        );
        for (const err of errors) {
          logger.error(`[vald-cron] athlete ${err.athleteId} failed: ${err.error}`);
        }
      } catch (err) {
        logger.error(`[vald-cron] sync failed: ${err.message}`);
      }
    },
    { timezone: TZ }
  );

  logger.log(`[vald-cron] scheduled "${SCHEDULE}" (${TZ})`);
  return task;
}

function stopValdCron() {
  if (task) {
    task.stop();
    task = null;
  }
}

module.exports = { startValdCron, stopValdCron };
