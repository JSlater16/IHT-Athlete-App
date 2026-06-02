import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// Extracts the 11-char YouTube video ID from any of the URL shapes
// the server normalizes to (https://youtu.be/<id>) plus the broader
// pasted forms that may still be in the wild from older data.
function youtubeEmbedSrc(url) {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0];
      return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
    }
    if (host === "youtube.com") {
      if (u.pathname === "/watch") {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` : null;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2 && ["embed", "shorts", "v", "live"].includes(parts[0])) {
        return `https://www.youtube.com/embed/${parts[1]}?autoplay=1&rel=0`;
      }
    }
  } catch {
    /* falls through to null */
  }
  return null;
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

  const embedSrc = videoUrl ? youtubeEmbedSrc(videoUrl) : null;
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
          <div className="video-modal-frame-wrap">
            <iframe
              className="video-modal-frame"
              src={embedSrc}
              title={title || "Demo video"}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
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
