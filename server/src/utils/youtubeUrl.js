"use strict";

// Parse a user-pasted YouTube link or bare ID into the canonical
// 11-character video ID. Returns null when the input doesn't look
// like YouTube — the caller treats that as a validation error.
function parseYouTubeId(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Accept a bare 11-char ID without a URL wrapper.
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "");

  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0];
    return validId(id) ? id : null;
  }

  if (host === "youtube.com") {
    if (url.pathname === "/watch") {
      return validId(url.searchParams.get("v")) ? url.searchParams.get("v") : null;
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && ["embed", "shorts", "v", "live"].includes(parts[0])) {
      return validId(parts[1]) ? parts[1] : null;
    }
  }

  return null;
}

function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{11}$/.test(id);
}

// Round-trip a parsed ID into the canonical https://youtu.be/<id> form
// so the stored URL is consistent regardless of which YouTube surface
// the coach pasted from.
function canonicalYouTubeUrl(id) {
  return `https://youtu.be/${id}`;
}

module.exports = { parseYouTubeId, canonicalYouTubeUrl };
