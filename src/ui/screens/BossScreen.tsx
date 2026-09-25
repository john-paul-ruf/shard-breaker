import type { AppCommand } from "../../app/commands";
import type { ContentId } from "../../domain/content/catalog";
import type { EffectSnapshot } from "../../domain/combat/effects";
import type { BossCombatRuntime } from "../../domain/combat/bossState";
import { bossCountdownSeconds } from "../../domain/combat/bossState";
import type { CombatState } from "../../domain/combat/model";
import type { RoomType } from "../../domain/run/model";
import { AppStatusBar } from "../components/AppStatusBar";
import { IntegrityMeter } from "../components/IntegrityMeter";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";
import { TelegraphBanner } from "../components/TelegraphBanner";
import type { TelegraphBannerProps } from "../components/TelegraphBanner";
import { Arena } from "../../game/Arena";

/**
 * One modifier chip row: the compatible registry entry plus whether the room
 * selected it (S06 wires selection; this screen renders what the model holds).
 */
export interface BossScreenModifierChip {
  readonly modifierId: ContentId;
  readonly displayName: string;
  readonly isApplied: boolean;
  readonly cappedDescription: string;
}

/**
 * The boss room's display model. Composed App-side (`createBossModel`) from
 * the durable `roomState.boss` plus catalog lookups; the arena's two closures
 * mirror the CombatScreen contract (arch M06 import rules).
 */
export interface BossScreenViewModel {
  readonly runId: string;
  readonly className: string;
  readonly depth: number;
  readonly cycle: number;
  readonly roomType: RoomType;
  readonly roomName: string;
  readonly roomSummary: string;
  readonly objectiveNames: readonly string[];
  readonly integrityCurrent: number;
  readonly integrityMaximum: number;
  readonly runCurrency: number;
  readonly skillDisplay: readonly {
    readonly skillId: ContentId;
    readonly name: string;
    readonly description: string;
    readonly charges: number;
    readonly maximum: number;
  }[];
  readonly passiveCount: number;
  readonly passiveSummary: string;
  readonly hasClearOutcome: boolean;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
  /** Catalog-resolved archetype for the routed `roomState.boss.archetypeId`. */
  readonly boss: BossCombatRuntime;
  /** Compatible modifiers for the archetype with per-room application state. */
  readonly modifierChips: readonly BossScreenModifierChip[];
  /** The room's committed aim when Breach begins the first assault; null after. */
  readonly breachAim: number | null;
  readonly canBreach: boolean;
  readonly createInitialState: () => CombatState;
  readonly resolveVolleyEffects: () => EffectSnapshot;
}

export interface BossScreenProps {
  readonly model: BossScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

const ROOM_TYPE_LABELS: Readonly<Record<RoomType, string>> = Object.freeze({
  battle: "Battle",
  elite: "Elite",
  shop: "Shop",
  recovery: "Recovery",
  boss: "Boss",
});

function formatDepth(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return String(safe).padStart(2, "0");
}

/**
 * Boss room screen (mocks/boss.html): the boss identity card and arena at
 * left, the decision rail — phase state rows, phase steps with text labels,
 * integrity, modifier chips, telegraph, and the clear-gated advance action —
 * at right. Every state is text + border + label; nothing is color-only
 * (CA-08 boss share), and every telegraph is DOM content with a step-derived
 * countdown (CA-10).
 */
export function BossScreen({ model, dispatch }: BossScreenProps) {
  const canAdvance = !model.isBusy && model.hasClearOutcome;
  const projection = model.boss.projection;
  const telegraph = projection.telegraph;
  const breachEnabled = model.canBreach && !model.isBusy && model.breachAim !== null;

  const telegraphBanner: TelegraphBannerProps | null =
    telegraph === null
      ? null
      : {
          title: `TELEGRAPH // ${telegraph.displayName.toUpperCase()} IN ${bossCountdownSeconds(telegraph.remainingSteps)}s`,
          detail: `Counter: ${telegraph.counterplay} Static text persists when motion is reduced.`,
          tone: telegraph.state === "active" ? "active" : "incoming",
        };

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={null}
        activeRun={{ depth: model.depth, className: model.className }}
        isBusy={model.isBusy}
        onReturnToArchive={() => dispatch({ type: "run/return-to-archive" })}
      />

      <main className="room-screen" aria-busy={model.isBusy}>
        <header className="room-header">
          <p className="signal-eyebrow" data-tone="success">
            Live run · mandatory boss floor
          </p>
          <h1 className="room-header__title">
            {model.boss.definition.displayName}{" "}
            <span className="room-header__divider">//</span>{" "}
            {ROOM_TYPE_LABELS[model.roomType]}
          </h1>
          <p className="room-header__summary">
            {model.boss.definition.identitySummary}
          </p>
          <div className="room-header__stats" aria-label="Run status">
            <div className="room-header__stat">
              <span>Depth</span>
              <strong>{formatDepth(model.depth)}</strong>
            </div>
            <div className="room-header__stat">
              <span>Cycle</span>
              <strong>{formatDepth(model.cycle)}</strong>
            </div>
            <div className="room-header__stat">
              <span>Integrity</span>
              <strong>
                <IntegrityMeter
                  current={model.integrityCurrent}
                  maximum={model.integrityMaximum}
                />
              </strong>
            </div>
            <div className="room-header__stat">
              <span>Room shards</span>
              <strong>{formatDepth(model.runCurrency)}</strong>
            </div>
          </div>
        </header>

        <div className="combat-grid">
          <Arena
            model={{
              roomName: model.boss.definition.displayName,
              skillDisplay: model.skillDisplay,
              isBusy: model.isBusy,
            }}
            dispatch={dispatch}
            createInitialState={model.createInitialState}
            resolveVolleyEffects={model.resolveVolleyEffects}
          />

          <aside
            className="side-stack"
            aria-label="Boss information and controls"
          >
            <section className="surface-panel side-panel">
              <p className="signal-eyebrow" data-tone="warning">
                Boss identity
              </p>
              <h2>{model.boss.definition.displayName} — pattern lock.</h2>
              <p className="side-panel__skillnote">
                {model.boss.definition.counterplay}
              </p>
              <dl
                className="side-panel__passive boss-state-rows"
                aria-label="Boss state"
              >
                <div className="boss-state-row">
                  <dt>Phase</dt>
                  <dd data-phase={projection.phaseId}>
                    {formatDepth(projection.phaseIndex + 1)} /{" "}
                    {formatDepth(model.boss.definition.phases.length)} —{" "}
                    {projection.phaseDisplayName}
                  </dd>
                </div>
                <div className="boss-state-row">
                  <dt>Transition</dt>
                  <dd>{projection.transitionCondition}</dd>
                </div>
                <div className="boss-state-row">
                  <dt>High-impact attack</dt>
                  <dd>
                    {telegraph === null
                      ? model.boss.definition.telegraphs
                          .map((entry) => entry.displayName)
                          .join(" · ")
                      : telegraph.displayName}
                  </dd>
                </div>
              </dl>
              <ol
                className="phase-steps"
                aria-label="Boss phases"
                data-current-phase={projection.phaseId}
              >
                {model.boss.definition.phases.map((phase, index) => (
                  <li
                    key={phase.id}
                    className="phase-step"
                    data-state={
                      index === projection.phaseIndex
                        ? "current"
                        : index < projection.phaseIndex
                          ? "done"
                          : "upcoming"
                    }
                  >
                    <span className="phase-step__label">
                      {formatDepth(index + 1)} {phase.displayName}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="side-panel__integrity">
                <span>Boss integrity</span>
                <IntegrityMeter
                  current={projection.health}
                  maximum={projection.maxHealth}
                  label="Boss integrity"
                />
              </div>
            </section>

            <section className="surface-panel side-panel">
              <p className="signal-eyebrow" data-tone="warning">
                Cycle modifiers
              </p>
              {model.modifierChips.length > 0 ? (
                <ul className="modifier-chips" aria-label="Cycle modifiers">
                  {model.modifierChips.map((chip) => (
                    <li
                      key={chip.modifierId}
                      className="modifier-chip"
                      data-applied={chip.isApplied ? "true" : "false"}
                    >
                      <b>
                        {chip.displayName}
                        {chip.isApplied ? " · applied" : " · compatible"}
                      </b>
                      <span>{chip.cappedDescription}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="side-panel__skillnote">
                  No cycle modifiers routed for this floor.
                </p>
              )}
              <p className="side-panel__passive">
                <span>Modifiers change composition and timing</span>
                <b>They cannot remove every viable response.</b>
              </p>
            </section>

            {model.saveSignal !== null ? (
              <SaveSignal signal={model.saveSignal} />
            ) : null}

            <div className="combat-actions">
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => {
                  if (model.breachAim === null) {
                    return;
                  }
                  dispatch({
                    type: "combat/launch",
                    aimAngle: model.breachAim,
                  });
                }}
                disabled={!breachEnabled}
                aria-busy={model.isBusy}
              >
                Breach {model.boss.definition.displayName}{" "}
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => dispatch({ type: "room/resolve" })}
                disabled={!canAdvance}
                aria-busy={model.isBusy}
              >
                Advance to reward draft
              </button>
              {!canAdvance ? (
                <p className="combat-actions__reason" role="status">
                  {model.hasClearOutcome
                    ? "Durable action in progress. Actions are disabled until the save finishes."
                    : "Defeat the boss to open the reward draft."}
                </p>
              ) : null}
            </div>

            {telegraphBanner !== null ? (
              <TelegraphBanner
                title={telegraphBanner.title}
                detail={telegraphBanner.detail}
                tone={telegraphBanner.tone}
              />
            ) : null}
          </aside>
        </div>
      </main>
    </div>
  );
}