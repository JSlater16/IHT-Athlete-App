const { prisma } = require("./prisma");

/* Audit logger. Rule: NEVER throw. If the audit write fails, log to
   stderr and let the primary action succeed — observability must not
   take down a real user action.

   actions follow dotted convention: "coach.deactivate",
   "athlete.delete", "auth.login_failure", etc. */

function getIp(req) {
  /* app.js sets `trust proxy: 1` in production so Express resolves
     req.ip correctly from x-forwarded-for. Manually re-parsing the
     header here was redundant and risked picking up spoofed values
     if the trust setting ever changes. */
  return req?.ip || null;
}

function serializeMetadata(metadata) {
  if (!metadata) return "{}";
  try {
    return JSON.stringify(metadata);
  } catch (_error) {
    return "{}";
  }
}

async function recordAudit({
  req,
  actor,
  action,
  targetType = "",
  targetId = null,
  targetLabel = "",
  metadata = null
} = {}) {
  try {
    const resolvedActor = actor || req?.user || null;
    await prisma.auditLog.create({
      data: {
        actorId: resolvedActor?.sub || resolvedActor?.id || null,
        actorName: resolvedActor?.name || "",
        actorRole: resolvedActor?.role || "",
        action,
        targetType,
        targetId,
        targetLabel: targetLabel || "",
        ip: getIp(req),
        metadata: serializeMetadata(metadata)
      }
    });
  } catch (error) {
    console.error(
      `[audit] failed to record "${action}": ${error?.message || error}`
    );
  }
}

module.exports = {
  recordAudit
};
