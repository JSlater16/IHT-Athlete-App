import { useEffect } from "react";

export default function ConfirmModal({ open, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false, onConfirm, onCancel }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onCancel?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="modal-card modal-card-small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title">{title}</h2>
        {message && <p className="muted-copy">{message}</p>}
        <div className="modal-actions">
          <button type="button" className="ghost-button" onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            className={danger ? "primary-button danger" : "primary-button"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
