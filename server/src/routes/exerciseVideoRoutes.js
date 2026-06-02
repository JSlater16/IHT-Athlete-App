"use strict";

const express = require("express");
const fs = require("fs");
const { videoPath } = require("../utils/videoStorage");
const { verifyToken } = require("../utils/jwt");
const { prisma } = require("../utils/prisma");

const router = express.Router();

// HTML <video> tags can't send the Authorization header on the implicit
// GET, so we accept the JWT via the `t` query param as a fallback.
// Verification mirrors requireAuth (signature, active user, current
// tokenVersion) so a revoked session can't keep streaming.
async function authorizeVideoRequest(req, res) {
  const headerToken = (req.headers.authorization || "").startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  const token = headerToken || (typeof req.query.t === "string" ? req.query.t : null);
  if (!token) {
    res.status(401).end();
    return false;
  }
  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    res.status(401).end();
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: decoded.sub },
    select: { id: true, isActive: true, tokenVersion: true }
  });
  if (!user || !user.isActive || user.tokenVersion !== decoded.tv) {
    res.status(401).end();
    return false;
  }
  return true;
}

// GET /api/exercise-videos/:liftId — stream the demo video. Range
// support is mandatory: without it browsers can't seek and Safari
// refuses to start playback.
router.get("/:liftId", async (req, res, next) => {
  try {
    const ok = await authorizeVideoRequest(req, res);
    if (!ok) return;

    const file = videoPath(req.params.liftId);
    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      return res.status(404).end();
    }

    const total = stat.size;
    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        "Content-Length": total,
        "Content-Type": "video/mp4",
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=300"
      });
      fs.createReadStream(file).pipe(res);
      return;
    }

    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) {
      res.status(416).end();
      return;
    }
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (Number.isNaN(start) || start > end || start >= total) {
      res.status(416).end();
      return;
    }
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${total}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": "video/mp4",
      "Cache-Control": "private, max-age=300"
    });
    fs.createReadStream(file, { start, end }).pipe(res);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
