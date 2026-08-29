/**
 * Controlled application status bar. It renders the SHARDBREAK mark, a
 * local-only profile context, a bounded Shards readout, and — only when a run
 * is live — the current run context. It owns no gameplay state and dispatches
 * nothing; an optional archive callback is the sole action, and no fake control
 * is rendered when it is absent (no link points at an unbuilt Profile screen).
 */
export interface AppStatusBarProps {
  readonly shards: number | null;
  readonly activeRun:
    | {
        readonly depth: number;
        readonly className: string;
      }
    | null;
  readonly isBusy: boolean;
  readonly onReturnToArchive?: () => void;
}

/** Group a non-negative safe integer with thousands separators, deterministically. */
function formatBoundedCount(value: number): string {
  if (!Number.isFinite(value)) {
    return "0";
  }
  const safe = Math.max(0, Math.min(Math.trunc(value), Number.MAX_SAFE_INTEGER));
  return safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Present depth as a two-digit telemetry token without discarding endless depth. */
function formatDepth(depth: number): string {
  const safe = Number.isFinite(depth) ? Math.max(0, Math.trunc(depth)) : 0;
  return safe.toString().padStart(2, "0");
}

export function AppStatusBar({
  shards,
  activeRun,
  isBusy,
  onReturnToArchive,
}: AppStatusBarProps) {
  const shardsLabel =
    shards === null ? "Shards unavailable" : `${formatBoundedCount(shards)} Shards`;

  return (
    <header className="app-status-bar" aria-busy={isBusy}>
      <span className="brand-lockup">
        <span aria-hidden="true">⌁</span>
        <span>SHARDBREAK</span>
      </span>
      <div>
        {activeRun !== null ? (
          <span className="signal-eyebrow">
            Depth {formatDepth(activeRun.depth)} · {activeRun.className}
          </span>
        ) : null}{" "}
        <span className="resource-counter" aria-label={shardsLabel}>
          Local only · {shards === null ? "—" : formatBoundedCount(shards)} Shards
        </span>{" "}
        {onReturnToArchive !== undefined ? (
          <button
            type="button"
            className="action-button action-button--quiet"
            onClick={onReturnToArchive}
            disabled={isBusy}
            aria-busy={isBusy}
          >
            Return to archive
          </button>
        ) : null}
      </div>
    </header>
  );
}
