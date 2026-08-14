import type { ScanRun } from "../lib/scans-api";
import { AppIcon } from "./app-icon";

interface ScanStatusProps {
  scan: ScanRun;
  auditLoading: boolean;
  auditOpen: boolean;
  onCancel: () => void;
  onReviewDecisions: () => void;
  onViewConversations: () => void;
}

function scanTitle(scan: ScanRun): string {
  if (scan.status === "succeeded")
    return scan.opportunities_found > 0
      ? `${scan.opportunities_found} new ${scan.opportunities_found === 1 ? "conversation" : "conversations"} found`
      : "Scan complete";
  if (scan.status === "failed") return "Scan needs attention";
  if (scan.status === "cancelled") return "Scan cancelled";
  if (scan.status === "cancelling") return "Stopping scan…";
  return "Discovery in progress";
}

export function ScanStatusPanel({
  scan,
  auditLoading,
  auditOpen,
  onCancel,
  onReviewDecisions,
  onViewConversations,
}: ScanStatusProps) {
  const running = ["pending", "running", "cancelling"].includes(scan.status);
  const completed = scan.status === "succeeded";
  const progress =
    scan.queries_total > 0
      ? Math.min(100, (scan.queries_completed / scan.queries_total) * 100)
      : 0;

  return (
    <section
      className={`scan-status-panel scan-${scan.status}`}
      aria-live="polite"
      aria-busy={running}
    >
      <div className="scan-status-main">
        <div className="scan-status-icon">
          <AppIcon name="scan" />
        </div>
        <div className="scan-status-copy">
          <strong>{scanTitle(scan)}</strong>
          <p>{scan.error_message ?? scan.current_message}</p>
        </div>
        <div className="scan-status-actions">
          {running ? (
            <button
              className="secondary-action small-action"
              type="button"
              disabled={scan.status === "cancelling"}
              onClick={onCancel}
            >
              {scan.status === "cancelling" ? "Stopping…" : "Cancel"}
            </button>
          ) : null}
          {completed && scan.candidates_matched > 0 ? (
            <button
              className="secondary-action small-action"
              type="button"
              disabled={auditLoading}
              onClick={onReviewDecisions}
            >
              {auditLoading
                ? "Loading…"
                : auditOpen
                  ? "Hide details"
                  : "Scan details"}
            </button>
          ) : null}
          {completed ? (
            <button
              className="primary-action small-action"
              type="button"
              onClick={onViewConversations}
            >
              Review conversations
            </button>
          ) : null}
        </div>
      </div>

      {running ? (
        <div className="scan-status-progress" aria-label="Scan progress">
          <div>
            <span style={{ width: `${progress}%` }} />
          </div>
          <small>
            {scan.queries_completed} of {scan.queries_total} searches
          </small>
        </div>
      ) : null}

      <div className="scan-status-summary">
        {(scan.queries_explored ?? 0) + (scan.queries_reused ?? 0) > 0 ? (
          <span className="adaptive-plan-summary" title={scan.plan_summary}>
            <strong>{scan.queries_explored ?? 0}</strong> new hypotheses
          </span>
        ) : null}
        <span>
          <strong>{scan.items_fetched}</strong> reviewed
        </span>
        <span>
          <strong>{scan.candidates_matched}</strong> AI candidates
        </span>
        <span>
          <strong>{scan.candidates_qualified}</strong> qualified
        </span>
        <span>
          <strong>{scan.candidates_direct ?? 0}</strong> direct
        </span>
        <span>
          <strong>{scan.candidates_helpful ?? 0}</strong> helpful
        </span>
        <span>
          <strong>{scan.candidates_market_signals ?? 0}</strong> market signals
        </span>
        <details>
          <summary>Technical details</summary>
          <div className="scan-technical-grid">
            <span>
              Reddit reviewed <strong>{scan.reddit_items_fetched}</strong>
            </span>
            <span>
              HN reviewed <strong>{scan.hackernews_items_fetched}</strong>
            </span>
            <span>
              Reddit candidates{" "}
              <strong>{scan.reddit_candidates_matched}</strong>
            </span>
            <span>
              HN candidates{" "}
              <strong>{scan.hackernews_candidates_matched}</strong>
            </span>
            <span>
              Memory-guided <strong>{scan.queries_reused ?? 0}</strong>
            </span>
            <span>
              AI rejected <strong>{scan.candidates_rejected}</strong>
            </span>
            <span>
              New results <strong>{scan.opportunities_found}</strong>
            </span>
          </div>
        </details>
      </div>
    </section>
  );
}
