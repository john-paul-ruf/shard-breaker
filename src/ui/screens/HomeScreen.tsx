import { useId, useRef } from "react";
import type { KeyboardEvent } from "react";
import type { AppCommand } from "../../app/commands";
import type { ContentId } from "../../domain/content/catalog";
import { AppStatusBar } from "../components/AppStatusBar";
import { ConfirmationDialog } from "../components/ConfirmationDialog";
import { IntegrityMeter } from "../components/IntegrityMeter";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";

export interface HomeScreenViewModel {
  readonly mode: "archive" | "checkpoint";
  readonly loadState: "ready" | "busy" | "error";
  readonly shards: number;
  readonly highestReachedDepth: number;
  readonly classes: readonly {
    readonly id: ContentId;
    readonly name: string;
    readonly startingIntegrity: number;
    readonly tradeoff: string;
    readonly isUnlocked: boolean;
  }[];
  readonly selectedClassId: ContentId;
  readonly livingRun: {
    readonly runId: string;
    readonly classId: ContentId;
    readonly className: string;
    readonly depth: number;
    readonly integrityCurrent: number;
    readonly integrityMaximum: number;
    readonly bossesDefeated: number;
  } | null;
  readonly isReplacementGuardOpen: boolean;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
}

export interface HomeScreenProps {
  readonly model: HomeScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

function formatTelemetryCount(value: number): string {
  const safeValue = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return safeValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDepth(value: number): string {
  return formatTelemetryCount(value).padStart(2, "0");
}

function classGlyph(name: string): string {
  const glyph = name
    .trim()
    .split(/\s+/)
    .map((word) => word.slice(0, 1))
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return glyph === "" ? "◇" : glyph;
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

/** Controlled launch archive and durable lifecycle-checkpoint composition. */
export function HomeScreen({ model, dispatch }: HomeScreenProps) {
  const idPrefix = useId();
  const startButtonRef = useRef<HTMLButtonElement>(null);
  const livingRun = model.livingRun;
  const isBusy = model.isBusy || model.loadState === "busy";
  const isMutationDisabled = model.loadState !== "ready" || model.isBusy;
  const selectedClassIsAvailable = model.classes.some(
    (classView) => classView.isUnlocked && classView.id === model.selectedClassId,
  );
  const firstAvailableClassId = model.classes.find(
    (classView) => classView.isUnlocked,
  )?.id;
  const unlockedCount = model.classes.filter((classView) => classView.isUnlocked).length;

  const heroTitleId = `${idPrefix}-hero-title`;
  const panelTitleId = `${idPrefix}-panel-title`;
  const selectorTitleId = `${idPrefix}-selector-title`;
  const checkpointTitleId = `${idPrefix}-checkpoint-title`;
  const livingRunTitleId = `${idPrefix}-living-run-title`;
  const livingRunDescriptionId = `${idPrefix}-living-run-description`;
  const noticeId = `${idPrefix}-load-notice`;
  const helpId = `${idPrefix}-launch-help`;

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={model.shards}
        activeRun={
          livingRun === null
            ? null
            : { depth: livingRun.depth, className: livingRun.className }
        }
        isBusy={isBusy}
      />

      <main className="launch-archive" aria-busy={isBusy}>
        <div className="launch-archive__grid">
          <section className="launch-hero" aria-labelledby={heroTitleId}>
            <div>
              <p className="signal-eyebrow">Local arcade · run protocol</p>
              <h1 id={heroTitleId}>Break the loop. Keep the Shards.</h1>
              <p>
                A one-pointer roguelite where <strong>every brick is an enemy</strong>,
                every ricochet is a decision, and every third floor tests your build.
              </p>
              <div className="run-loop-steps" aria-label="The three-step run loop">
                <div>
                  <strong>01</strong>
                  <br />
                  Aim &amp; launch
                </div>
                <div>
                  <strong>02</strong>
                  <br />
                  Draft the signal
                </div>
                <div>
                  <strong>03</strong>
                  <br />
                  Push deeper
                </div>
              </div>
            </div>
            <p>
              Personal record
              <br />
              <strong>
                Depth {formatDepth(model.highestReachedDepth)} · local only
              </strong>
            </p>
          </section>

          <section className="launch-panel" aria-labelledby={panelTitleId}>
            <div>
              <p
                className="signal-eyebrow"
                data-tone={model.mode === "checkpoint" ? "success" : undefined}
              >
                {model.mode === "archive"
                  ? "Launch archive"
                  : "Launch archive · durable checkpoint"}
              </p>
              <h2 id={panelTitleId}>
                {model.mode === "archive" ? "Choose your signal." : "Living run archive"}
              </h2>
              {model.mode === "archive" ? (
                <>
                  <p>Start clean, or return to the last valid checkpoint.</p>
                  <p>Local profile · offline archive</p>
                </>
              ) : null}
            </div>

            {model.loadState === "error" ? (
              <p id={noticeId} role="alert">
                Archive recovery failed. Last committed data remains visible;
                actions are disabled until recovery succeeds.
              </p>
            ) : model.loadState === "busy" ? (
              <p id={noticeId} role="status" aria-live="polite">
                Loading the local archive. Actions are disabled until the last
                committed checkpoint is ready.
              </p>
            ) : model.isBusy ? (
              <p id={noticeId} role="status" aria-live="polite">
                Durable action in progress. Actions are disabled until the save
                finishes.
              </p>
            ) : null}
            <SaveSignal signal={model.saveSignal} />

            {livingRun !== null ? (
              <section className="living-run-strip" aria-labelledby={livingRunTitleId}>
                <div>
                  <h3 id={livingRunTitleId}>Living run detected</h3>
                  <p id={livingRunDescriptionId}>
                    {livingRun.className} · Depth {formatDepth(livingRun.depth)} ·
                    checkpoint saved locally
                  </p>
                  <div>
                    <IntegrityMeter
                      current={livingRun.integrityCurrent}
                      maximum={livingRun.integrityMaximum}
                      label="Living run Integrity"
                    />
                    {" · "}
                    <span>
                      {formatTelemetryCount(livingRun.bossesDefeated)} bosses defeated
                    </span>
                  </div>
                </div>
                {model.mode === "archive" ? (
                  <button
                    type="button"
                    className="action-button action-button--primary"
                    onClick={() => dispatch({ type: "run/resume" })}
                    disabled={isMutationDisabled}
                    aria-busy={isBusy}
                    aria-describedby={
                      isMutationDisabled
                        ? `${livingRunDescriptionId} ${noticeId}`
                        : livingRunDescriptionId
                    }
                  >
                    Resume living run
                  </button>
                ) : (
                  <span className="signal-eyebrow" data-tone="success">
                    Checkpoint open
                  </span>
                )}
              </section>
            ) : null}

            {model.mode === "archive" ? (
              <>
                <div>
                  <p className="signal-eyebrow">New run · starting class</p>
                  <p>
                    {unlockedCount} available · {model.classes.length} total
                  </p>
                </div>
                <div
                  className="class-selector"
                  role="radiogroup"
                  aria-labelledby={selectorTitleId}
                  aria-busy={isBusy}
                >
                  <h3 id={selectorTitleId}>Starting class</h3>
                  {model.classes.map((classView) => {
                    const isSelected =
                      classView.isUnlocked && classView.id === model.selectedClassId;
                    const isTabStop =
                      isSelected ||
                      (!selectedClassIsAvailable &&
                        classView.id === firstAvailableClassId);
                    const integrity = formatTelemetryCount(
                      classView.startingIntegrity,
                    );

                    return (
                      <button
                        key={classView.id}
                        type="button"
                        className="class-card"
                        role="radio"
                        aria-checked={isSelected}
                        aria-disabled={
                          !classView.isUnlocked || isMutationDisabled
                            ? "true"
                            : undefined
                        }
                        aria-describedby={
                          isMutationDisabled ? noticeId : undefined
                        }
                        aria-busy={isBusy}
                        disabled={isMutationDisabled}
                        tabIndex={isTabStop ? 0 : -1}
                        onKeyDown={moveRadioFocus}
                        onClick={() => {
                          if (classView.isUnlocked && !isMutationDisabled) {
                            dispatch({
                              type: "home/select-class",
                              classId: classView.id,
                            });
                          }
                        }}
                      >
                        <span aria-hidden="true">{classGlyph(classView.name)}</span>
                        <span>
                          <strong>{classView.name}</strong>
                          <br />
                          <span>{classView.tradeoff}</span>
                          <br />
                          <strong>
                            {isSelected
                              ? "SELECTED"
                              : classView.isUnlocked
                                ? "AVAILABLE"
                                : "LOCKED"}
                          </strong>
                          {!classView.isUnlocked ? (
                            <span>
                              {" "}· Unlock this class in the local archive before
                              starting.
                            </span>
                          ) : null}
                        </span>
                        <span aria-label={`Starting Integrity ${integrity}`}>
                          <strong>{integrity.padStart(2, "0")}</strong> INT
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="launch-actions">
                  <button
                    ref={startButtonRef}
                    type="button"
                    className="action-button action-button--primary"
                    onClick={() => dispatch({ type: "run/request-start" })}
                    disabled={isMutationDisabled}
                    aria-busy={isBusy}
                    aria-describedby={
                      isMutationDisabled ? `${helpId} ${noticeId}` : helpId
                    }
                  >
                    Start new run
                  </button>
                </div>
                <p id={helpId}>
                  <strong aria-hidden="true">i · </strong>
                  Pointer movement aims. The explicit launch action starts the
                  ball. No refresh can reroll a committed route or reward.
                </p>
              </>
            ) : (
              <section className="checkpoint-open" aria-labelledby={checkpointTitleId}>
                {livingRun !== null ? (
                  <>
                    <p className="signal-eyebrow" data-tone="success">
                      Checkpoint saved · local only
                    </p>
                    <h1 id={checkpointTitleId}>Checkpoint restored</h1>
                    <p>
                      <strong>{livingRun.className}</strong> at Depth{" "}
                      {formatDepth(livingRun.depth)}.
                    </p>
                    <IntegrityMeter
                      current={livingRun.integrityCurrent}
                      maximum={livingRun.integrityMaximum}
                    />
                    <p>
                      {formatTelemetryCount(livingRun.bossesDefeated)} bosses defeated
                    </p>
                  </>
                ) : (
                  <>
                    <h1 id={checkpointTitleId}>Checkpoint unavailable</h1>
                    <p role="alert">
                      No living run is available. Return to the launch archive
                      before starting again.
                    </p>
                  </>
                )}
                <button
                  type="button"
                  className="action-button action-button--quiet"
                  onClick={() => dispatch({ type: "run/return-to-archive" })}
                  disabled={isMutationDisabled}
                  aria-busy={isBusy}
                  aria-describedby={isMutationDisabled ? noticeId : undefined}
                >
                  Return to Launch Archive
                </button>
              </section>
            )}
          </section>
        </div>
      </main>

      {livingRun !== null ? (
        <ConfirmationDialog
          isOpen={model.isReplacementGuardOpen}
          title="Living run detected"
          description={`Starting a new run cannot silently replace ${livingRun.className} at Depth ${formatDepth(livingRun.depth)}. Resume it, abandon it permanently, or cancel.`}
          isBusy={isMutationDisabled}
          returnFocusRef={startButtonRef}
          onResume={() => dispatch({ type: "run/resume" })}
          onConfirmAbandon={() =>
            dispatch({ type: "run/confirm-abandon-and-start" })
          }
          onCancel={() => dispatch({ type: "run/cancel-replacement" })}
        />
      ) : null}
    </div>
  );
}
