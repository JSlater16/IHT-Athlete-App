import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";

// Plays the demo video for a given lift. The <video> tag can't send
// the Authorization header, so we pass the JWT via the `t` query
// param. Closes on backdrop click, Escape, or the close button.
export default function VideoModal({ liftId, title, onClose }) {
  const { token } = useAuth();

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!liftId) return null;

  const src = `/api/exercise-videos/${encodeURIComponent(liftId)}?t=${encodeURIComponent(token || "")}`;

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
        <video
          className="video-modal-player"
          src={src}
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      </div>
    </div>
  );
}
