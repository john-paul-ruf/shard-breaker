import { useId } from "react";
import type { KeyboardEvent } from "react";
import type { AppCommand } from "../../app/commands";
import type { ContentId } from "../../domain/content/catalog";
import type { TerminalReason } from "../../domain/run/model";
import { AppStatusBar } from "../components/AppStatusBar";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";

/**
 * The run terminal's display model (CA-19). Composed App-side by
 * `createRunSummaryModel` from the finalized profile (`lastRunSummary` plus
 * the unresolved `pendingRelicChoice`) and the transient `terminalRecord`
 * projection; option and build copy is catalog-resolved upstream.
 */
export interface RunSummaryScreenViewModel {
  readonly summary: {
    readonly runId: string;
    readonly className: string;
    readonly reachedDepth: number;
    readonly bossesReached: number;
    readonly bossesDefeated: number;
    readonly activeSkillNames: readonly string[];
    readonly passiveEquipmentNames: readonly string[];
    readonly shardsEarned: number;
    readonly terminalReason: TerminalReason;
  };
  /**
   * The record-delta projection. Non-null with the finalize handler's NEW
   * marker right after finalization; after a reload the builder substitutes
   * the standing record with the marker off (truthful), so this is never
   * null in a built model — the null branch is component-level defense.
   */
  readonly record: {
    readonly isRecord: boolean;
    readonly priorRecordDepth: number;
  } | null;
  /**
   * Non-null only while the durable pending choice is unresolved
   * (`selectedId === null`). After a RESOLVE the committed record is kept
   * with `selectedId` + `commitId` set and the navigation gate routes away;
   * after a DECLINE it is cleared. The radiogroup renders only in this
   * window; a resolved terminal renders no dispatch surface.
   */
  readonly pendingRelicChoice: {
    readonly options: readonly {
      readonly id: ContentId;
      readonly name: string;
      readonly cappedDescription: string;
    }[];
  } | null;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
}

export interface RunSummaryScreenProps {
  readonly model: RunSummaryScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

const TERMINAL_REASON_WORDS: Readonly<Record<TerminalReason, string>> =
  Object.freeze({
    death: "terminated.",
    completion: "complete.",
    abandoned: "abandoned.",
  });

const TERMINAL_STAMPS: Readonly<
  Record<TerminalReason, { readonly label: string; readonly note: string }>
> = Object.freeze({
  death: {
    label: "Integrity collapsed",
    note: "shards finalized // checkpoint closed",
  },
  completion: {
    label: "Run complete",
    note: "run finalized // checkpoint closed",
  },
  abandoned: {
    label: "Run abandoned",
    note: "run finalized // checkpoint closed",
  },
});

const TERMINAL_NOTES: Readonly<Record<TerminalReason, string>> = Object.freeze({
  death:
    "Integrity reached zero. Your living-run state is finalized and cleared; the result below is now part of the local archive.",
  completion:
    "The run reached its end. Your living-run state is finalized and cleared; the result below is now part of the local archive.",
  abandoned:
    "The living run was abandoned. Its final state is recorded below and cleared from the archive.",
});

/**
 * Placeholder glyphs for the authored relics (the mock's stand-in icons,
 * aria-hidden); unknown future relics fall back to the neutral mark instead
 * of breaking the row.
 */
const RELIC_GLYPHS: Readonly<Record<string, string>> = Object.freeze({
  "relic-backfeed-cell": "+",
  "relic-quiet-prism": "◇",
  "relic-spare-vector": "↺",
});

function relicGlyph(id: ContentId): string {
  return RELIC_GLYPHS[id] ?? "◇";
}

function formatDepth(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return safe.toString().padStart(2, "0");
}

function formatCount(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return safe.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function classInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((word) => word.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return initials === "" ? "--" : initials;
}

function moveRadioFocus(event: KeyboardEvent<HTMLButtonElement>) {
  const direction =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
  const isBoundaryKey = event.key === "Home" || event.key === "End";
  if (direction === 0 && !isBoundaryKey) {
    return;
  }

  const group = event.currentTarget.closest('[role="radiogroup"]');
  const availableRadios = Array.from(
    group?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]:not([aria-disabled="true"]):not(:disabled)',
    ) ?? [],
  );
  const currentIndex = availableRadios.indexOf(event.currentTarget);
  if (currentIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? availableRadios.length - 1
        : (currentIndex + direction + availableRadios.length) %
          availableRadios.length;
  const nextRadio = availableRadios[nextIndex];
  nextRadio?.focus();
  if (nextRadio !== event.currentTarget) {
    nextRadio?.click();
  }
}

/**
 * Run terminal screen (mocks/run-summary.html): the reason-derived terminal
 * head, the summary panel (metric tiles, catalog-resolved build tags, the
 * terminal rule note), the carry-over relic radiogroup while the durable
 * pending choice is unresolved, and the record callout with the transient
 * NEW marker. Every state is text + border + data attribute, never color
 * alone (CA-08); selection commits immediately (CA-18) and the navigation
 * gate routes away once the durable choice resolves.
 */
export function RunSummaryScreen({ model, dispatch }: RunSummaryScreenProps) {
  const idPrefix = useId();
  const summaryTitleId = `${idPrefix}-summary-title`;
  const relicTitleId = `${idPrefix}-relic-title`;
  const noticeId = `${idPrefix}-notice`;

  const { summary } = model;
  const pending = model.pendingRelicChoice;
  const isBusy = model.isBusy;
  const record = model.record;
  const recordState =
    record === null ? "none" : record.isRecord ? "new" : "current";
  const recordMetricValue =
    recordState === "new"
      ? "NEW"
      : recordState === "current" && record !== null
        ? formatDepth(record.priorRecordDepth)
        : "—";
  const recordDepth =
    recordState === "none"
      ? "—"
      : recordState === "new"
        ? formatDepth(summary.reachedDepth)
        : record !== null
          ? formatDepth(record.priorRecordDepth)
          : "—";
  const recordNote =
    recordState === "new"
      ? record !== null && record.priorRecordDepth > 0
        ? `Replaces Depth ${formatDepth(record.priorRecordDepth)} in this local profile.`
        : "First depth record in this local profile."
      : recordState === "current"
        ? "Standing record in this local profile."
        : "No depth record is on file yet.";
  const reason = summary.terminalReason;
  const stamp = TERMINAL_STAMPS[reason];

  return (
    <div className="app-shell">
      <AppStatusBar shards={null} activeRun={null} isBusy={isBusy} />

      <main className="run-summary" aria-busy={isBusy}>
        <p className="run-summary__crumb">
          <span>Local archive</span>
          <span aria-hidden="true">/</span>
          <span>Run {summary.runId}</span>
          <span aria-hidden="true">/</span>
          <span data-active="true">Terminal summary</span>
        </p>

        <div className="run-summary__head" data-reason={reason}>
          <div>
            <h1 className="run-summary__title">
              Run{" "}
              <span className="run-summary__reason">
                {TERMINAL_REASON_WORDS[reason]}
              </span>
            </h1>
            <p className="run-summary__lede">{TERMINAL_NOTES[reason]}</p>
          </div>
          <div className="run-summary__stamp" data-reason={reason}>
            {stamp.label}
            <small>{stamp.note}</small>
          </div>
        </div>

        <div className="run-summary__grid">
          <section
            className="surface-panel run-summary__panel"
            aria-labelledby={summaryTitleId}
          >
            <div className="run-summary__panel-head">
              <div>
                <p className="signal-eyebrow" data-tone="danger">
                  Run result // local only
                </p>
                <h2 id={summaryTitleId}>
                  {summary.className} survived {summary.reachedDepth}{" "}
                  {summary.reachedDepth === 1 ? "depth." : "depths."}
                </h2>
                <p className="run-summary__panel-copy">
                  No global leaderboard submission. This record belongs to this
                  browser profile.
                </p>
              </div>
              <p className="run-summary__code" aria-hidden="true">
                result / {formatDepth(summary.reachedDepth)}-
                {classInitials(summary.className)}
              </p>
            </div>

            <div
              className="run-summary__metrics"
              aria-label="Run summary metrics"
            >
              <div className="run-summary__metric">
                <span>Reached depth</span>
                <strong>{formatDepth(summary.reachedDepth)}</strong>
              </div>
              <div className="run-summary__metric">
                <span>Shards earned</span>
                <strong>+{formatCount(summary.shardsEarned)}</strong>
              </div>
              <div className="run-summary__metric">
                <span>Bosses cleared</span>
                <strong>{formatDepth(summary.bossesDefeated)}</strong>
              </div>
              <div className="run-summary__metric" data-record={recordState}>
                <span>Record result</span>
                <strong>{recordMetricValue}</strong>
              </div>
            </div>

            <div className="run-summary__build">
              <div className="run-summary__build-head">
                <span>Major build contents</span>
                <strong>
                  {summary.activeSkillNames.length} active //{" "}
                  {summary.passiveEquipmentNames.length} passive
                </strong>
              </div>
              <div className="run-summary__tags">
                {summary.activeSkillNames.map((name, index) => (
                  <span
                    key={`skill-${name}-${index}`}
                    className="run-summary__tag"
                    data-tag-type="skill"
                  >
                    {name}
                  </span>
                ))}
                {summary.passiveEquipmentNames.map((name, index) => (
                  <span
                    key={`equipment-${name}-${index}`}
                    className="run-summary__tag run-summary__tag--equipment"
                    data-tag-type="equipment"
                  >
                    {name}
                  </span>
                ))}
                {summary.activeSkillNames.length === 0 &&
                summary.passiveEquipmentNames.length === 0 ? (
                  <p className="run-summary__tags-empty">
                    No build contents were recorded.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="run-summary__final-note">
              <b aria-hidden="true">!</b>
              <span>
                <strong>Terminal rule:</strong> the terminal finalized the
                earned Shards and removed the living run. A refresh cannot
                resurrect or duplicate this result.
              </span>
            </div>
          </section>

          <aside
            className="side-stack"
            aria-label="Carry-over and next run actions"
          >
            {pending !== null ? (
              <section className="surface-panel side-panel">
                <p className="signal-eyebrow run-summary__relic-eyebrow">
                  Carry-over relic
                </p>
                <h2>Choose one for next run.</h2>
                <p className="run-summary__side-copy">
                  One bounded relic can carry forward. It adds utility, not
                  infinite damage or ball-speed growth.
                </p>
                <div
                  className="relic-list"
                  role="radiogroup"
                  aria-labelledby={relicTitleId}
                  aria-busy={isBusy}
                >
                  <h3 id={relicTitleId} className="visually-hidden">
                    Carry-over relic choice
                  </h3>
                  {pending.options.map((option, index) => (
                    <button
                      key={option.id}
                      type="button"
                      className="relic-option"
                      role="radio"
                      aria-checked="false"
                      data-relic-id={option.id}
                      disabled={isBusy}
                      tabIndex={index === 0 ? 0 : -1}
                      onKeyDown={moveRadioFocus}
                      onClick={() => {
                        if (!isBusy) {
                          dispatch({
                            type: "terminal/resolve-relic",
                            relicId: option.id,
                          });
                        }
                      }}
                    >
                      <span className="relic-option__icon" aria-hidden="true">
                        <span>{relicGlyph(option.id)}</span>
                      </span>
                      <span>
                        <b className="relic-option__name">{option.name}</b>
                        <span className="relic-option__copy">
                          {option.cappedDescription}
                        </span>
                      </span>
                      <span className="relic-option__check" aria-hidden="true">
                        ✓
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="surface-panel side-panel">
              <div className="run-summary__record" data-record={recordState}>
                <b className="run-summary__record-label">
                  {recordState === "new"
                    ? "Personal record // new"
                    : recordState === "current"
                      ? "Personal record // current"
                      : "Personal record // none"}
                </b>
                <strong className="run-summary__record-depth">
                  {recordState === "none" ? "—" : `Depth ${recordDepth}`}
                </strong>
                <span className="run-summary__record-note">{recordNote}</span>
              </div>

              {model.saveSignal !== null ? (
                <SaveSignal signal={model.saveSignal} />
              ) : null}

              <div className="run-summary__actions">
                <button
                  type="button"
                  className="action-button action-button--danger"
                  onClick={() =>
                    dispatch(
                      pending === null
                        ? { type: "run/return-to-archive" }
                        : { type: "terminal/resolve-relic", relicId: null },
                    )
                  }
                  disabled={isBusy}
                  aria-busy={isBusy}
                  aria-describedby={isBusy ? noticeId : undefined}
                >
                  Try again <span aria-hidden="true">→</span>
                </button>
                {isBusy ? (
                  <p id={noticeId} role="status" aria-live="polite">
                    Durable action in progress. Actions are disabled until the
                    save finishes.
                  </p>
                ) : null}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}