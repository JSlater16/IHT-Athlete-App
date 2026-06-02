import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// Extracts the 11-char YouTube video ID from any of the URL shapes
// the server normalizes to (https://youtu.be/<id>) plus the broader
// pasted forms that may still be in the wild from older data.
function extractYouTubeId(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id || null;
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") {
        return u.searchParams.get("v");
      }
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["embed", "shorts", "v", "live"].includes(parts[0])) {
        return parts[1];
      }
    }
  } catch {
    /* falls through to null */
  }
  return null;
}

// youtube-nocookie.com runs the same embed player but in a separate
// cookie/tracking context. It often dodges restrictions that block
// the regular embed (corporate filters, some extensions, region-
// specific blocks).
function nocookieEmbedSrc(id) {
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1`;
}

function watchOnYouTube(id) {
  return `https://www.youtube.com/watch?v=${id}`;
}

// Plays the demo video for a given lift — either a YouTube embed
// when `videoUrl` is set, or the uploaded mp4 streamed from the
// server. The <video> tag can't send the Authorization header, so
// we pass the JWT via the `t` query param. Closes on backdrop click,
// Escape, or the close button.
export default function VideoModal({ liftId, title, videoUrl, onClose }) {
  const { token } = useAuth();

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!liftId) return null;

  const youtubeId = videoUrl ? extractYouTubeId(videoUrl) : null;
  const embedSrc = youtubeId ? nocookieEmbedSrc(youtubeId) : null;
  const uploadedSrc = !embedSrc
    ? `/api/exercise-videos/${encodeURIComponent(liftId)}?t=${encodeURIComponent(token || "")}`
    : null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card video-modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={title ? `${title} demo video` : "Demo video"}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="video-modal-header">
          <h2>{title || "Demo video"}</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>
        {embedSrc ? (
          <>
            <div className="video-modal-frame-wrap">
              <iframe
                className="video-modal-frame"
                src={embedSrc}
                title={title || "Demo video"}
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <p className="muted-copy compact-copy video-modal-fallback">
              Embed not playing?{" "}
              <a
                href={watchOnYouTube(youtubeId)}
                target="_blank"
                rel="noreferrer noopener"
              >
                Watch on YouTube
              </a>
              .
            </p>
          </>
        ) : (
          <video
            className="video-modal-player"
            src={uploadedSrc}
            controls
            autoPlay
            playsInline
            preload="metadata"
          />
        )}
      </div>
    </div>
  );
}
