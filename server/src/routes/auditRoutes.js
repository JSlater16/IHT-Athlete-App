const express = require("express");
const { prisma } = require("../utils/prisma");

const router = express.Router();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function parseMetadata(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(raw);
  } catch (_error) {
    return {};
  }
}

function serializeEntry(entry) {
  return {
    id: entry.id,
    actorId: entry.actorId,
    actorName: entry.actorName,
    actorRole: entry.actorRole,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    ip: entry.ip,
    metadata: parseMetadata(entry.metadata),
    createdAt: entry.createdAt
  };
}

router.get("/", async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit);
    const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
    const action = typeof req.query.action === "string" ? req.query.action.trim() : "";
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

    const where = {};
    if (action) {
      where.action = action;
    }
    if (q) {
      where.OR = [
        { actorName: { contains: q } },
        { targetLabel: { contains: q } },
        { ip: { contains: q } }
      ];
    }

    /* Cursor pagination: fetch limit + 1, if we got limit + 1 the
       extra row's id becomes the next cursor. */
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? page[page.length - 1].id : null;

    /* Distinct actions for the filter dropdown. Cheap enough on this
       table size that we recompute per request. */
    const actionRows = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" }
    });

    return res.json({
      entries: page.map(serializeEntry),
      nextCursor,
      availableActions: actionRows.map((row) => row.action)
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
