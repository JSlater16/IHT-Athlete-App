"use strict";

const path = require("path");
const fs = require("fs/promises");

// Videos live alongside the program library on the Render persistent
// disk so they survive redeploys. One file per lift, keyed by liftId,
// always stored as mp4 (which every modern browser plays natively).
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(__dirname, "..", "..", "data");
const VIDEOS_DIR = path.join(DATA_DIR, "videos");
const VIDEO_EXTENSION = ".mp4";
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

async function ensureVideosDir() {
  await fs.mkdir(VIDEOS_DIR, { recursive: true });
}

function videoPath(liftId) {
  return path.join(VIDEOS_DIR, `${liftId}${VIDEO_EXTENSION}`);
}

async function hasVideo(liftId) {
  try {
    await fs.access(videoPath(liftId));
    return true;
  } catch {
    return false;
  }
}

// Returns a Set of liftIds that currently have a video file on disk.
// Cheaper than calling hasVideo() per lift when decorating a list.
async function listVideoIds() {
  try {
    const entries = await fs.readdir(VIDEOS_DIR);
    return new Set(
      entries
        .filter((f) => f.endsWith(VIDEO_EXTENSION))
        .map((f) => f.slice(0, -VIDEO_EXTENSION.length))
    );
  } catch (err) {
    if (err.code === "ENOENT") return new Set();
    throw err;
  }
}

async function deleteVideo(liftId) {
  try {
    await fs.unlink(videoPath(liftId));
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

module.exports = {
  VIDEOS_DIR,
  VIDEO_EXTENSION,
  MAX_VIDEO_BYTES,
  ensureVideosDir,
  videoPath,
  hasVideo,
  listVideoIds,
  deleteVideo
};
