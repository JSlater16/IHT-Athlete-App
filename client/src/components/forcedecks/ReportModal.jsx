import { useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

// Minimal markdown renderer for the report body. Claude returns
// markdown with ### headers, bullet lists, and **bold** emphasis;
// rendering it as a plain <pre> is ugly and rendering arbitrary HTML
// would be a CSP hole. This translates the small subset we actually
// expect into safe React nodes.
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split(/\r?\n/);
  const nodes = [];
  let listBuffer = [];

  const flushList = () => {
    if (listBuffer.length > 0) {
      nodes.push(
        <ul key={`ul-${nodes.length}`} className="fd-report-list">
          {listBuffer.map((item, i) => (
            <li key={i}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith("### ")) {
      flushList();
      nodes.push(
        <h3 key={`h3-${nodes.length}`} className="fd-report-heading">
          {line.slice(4)}
        </h3>,
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      nodes.push(
        <h2 key={`h2-${nodes.length}`} className="fd-report-heading">
          {line.slice(3)}
        </h2>,
      );
      continue;
    }
    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
      continue;
    }
    flushList();
    nodes.push(
      <p key={`p-${nodes.length}`} className="fd-report-paragraph">
        {renderInline(line)}
      </p>,
    );
  }
  flushList();
  return nodes;
}

function renderInline(text) {
  // Translate **bold** to <strong>. Leave everything else as plain
  // text — no italics, no links, nothing that could carry an attack.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function ReportModal({ open, athleteId, athleteName, onClose }) {
  const { token } = useAuth();
  const [state, setState] = useState({ status: "idle", report: null, error: null });

  useEffect(() => {
    if (!open || !athleteId) return undefined;

    const ctrl = new AbortController();
    setState({ status: "loading", report: null, error: null });

    apiRequest(`/api/forcedecks/athletes/${athleteId}/report`, {
      method: "POST",
      token,
      signal: ctrl.signal,
    })
      .then((report) => setState({ status: "ready", report, error: null }))
      .catch((err) => {
        if (err.name === "AbortError") return;
        setState({ status: "error", report: null, error: err.message || "Failed to generate report" });
      });

    return () => ctrl.abort();
  }, [open, athleteId, token]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card modal-card-wide fd-report-modal fd-module"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-report-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fd-report-header">
          <div>
            <h2 id="fd-report-title" className="fd-report-title">AI Performance Report</h2>
            <p className="fd-report-sub">{athleteName} · Claude analysis of recent sessions</p>
          </div>
          <button type="button" className="fd-report-close" onClick={onClose} aria-label="Close report">
            ×
          </button>
        </header>

        <div className="fd-report-body">
          {state.status === "loading" ? (
            <div className="fd-empty">
              <span className="fd-report-spinner" aria-hidden="true" />
              Generating report — this typically takes 10–25 seconds.
            </div>
          ) : state.status === "error" ? (
            <div className="fd-empty fd-empty-error">{state.error}</div>
          ) : state.report ? (
            <article className="fd-report-content">{renderMarkdown(state.report.text)}</article>
          ) : null}
        </div>

        {state.report ? (
          <footer className="fd-report-footer">
            <span className="fd-report-meta">
              {state.report.model} · {new Date(state.report.generatedAt).toLocaleString()}
            </span>
            <button
              type="button"
              className="ghost-button"
              onClick={() => navigator.clipboard?.writeText(state.report.text)}
            >
              Copy text
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
