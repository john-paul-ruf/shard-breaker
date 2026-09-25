import type { AppCommand } from "../../app/commands";
import type { ContentId } from "../../domain/content/catalog";
import type { EffectSnapshot } from "../../domain/combat/effects";
import type { CombatState } from "../../domain/combat/model";
import type { RoomType } from "../../domain/run/model";
import { AppStatusBar } from "../components/AppStatusBar";
import { IntegrityMeter } from "../components/IntegrityMeter";
import { SaveSignal } from "../components/SaveSignal";
import { TelegraphBanner } from "../components/TelegraphBanner";
import type { SaveSignalView } from "../components/SaveSignal";
import { Arena } from "../../game/Arena";
import type { ArenaViewModel } from "../../game/Arena";

/**
 * The combat room's display model. `arena` is the narrow slice the Arena
 * host consumes; the durable checkpoint and the run-context reconstruction
 * closure stay App-owned (arch M06 import rules).
 */
export interface CombatScreenViewModel {
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
  readonly arena: ArenaViewModel;
  /** Checkpoint→state reconstruction (CA-03), injected by App.tsx. */
  readonly createInitialState: () => CombatState;
  /** Per-volley effect snapshot provider (production: the S02 resolver). */
  readonly resolveVolleyEffects: () => EffectSnapshot;
}

export interface CombatScreenProps {
  readonly model: CombatScreenViewModel;
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
 * Combat room screen: the arena panel at left and the decision rail —
 * objective, integrity, skill charges, passive summary, telegraph, save
 * signal, and the clear-gated advance action — at right (mocks/combat.html).
 */
export function CombatScreen({ model, dispatch }: CombatScreenProps) {
  const canAdvance = !model.isBusy && model.hasClearOutcome;
  const arenaModel: ArenaViewModel = {
    roomName: model.roomName,
    skillDisplay: model.skillDisplay,
    isBusy: model.isBusy,
  };

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={null}
        activeRun={{ depth: model.depth, className: model.className }}
        isBusy={model.isBusy}
        onReturnToArchive={() => dispatch({ type: "run/return-to-archive" })}
      />

      <main className="room-screen combat-screen" aria-busy={model.isBusy}>
        <header className="room-header">
          <p className="signal-eyebrow" data-tone="success">
            Live run · combat room
          </p>
          <h1 className="room-header__title">
            {model.roomName} <span className="room-header__divider">//</span>{" "}
            {ROOM_TYPE_LABELS[model.roomType]}
          </h1>
          <p className="room-header__summary">{model.roomSummary}</p>
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
            model={arenaModel}
            dispatch={dispatch}
            createInitialState={model.createInitialState}
            resolveVolleyEffects={model.resolveVolleyEffects}
          />

          <aside
            className="side-stack"
            aria-label="Combat controls and diagnostics"
          >
            <section className="surface-panel side-panel">
              <p className="signal-eyebrow">Room objective</p>
              <h2>Break the formation.</h2>
              <ul className="side-panel__objectives">
                {model.objectiveNames.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
              <div className="side-panel__integrity">
                <span>Integrity</span>
                <IntegrityMeter
                  current={model.integrityCurrent}
                  maximum={model.integrityMaximum}
                  label="Run Integrity"
                />
              </div>
            </section>

            <section className="surface-panel side-panel">
              <p className="signal-eyebrow">Active skills // room charges</p>
              {model.skillDisplay.length > 0 ? (
                <p className="side-panel__skillnote">
                  Charges are room-scoped and cannot carry over. A skill
                  disables at zero.
                </p>
              ) : (
                <p className="side-panel__skillnote">
                  No active skills are equipped yet. Room charges appear here
                  once a draft grants one.
                </p>
              )}
              <p className="side-panel__passive">
                <span>Passive equipment {model.passiveCount} held</span>
                <b>{model.passiveSummary}</b>
              </p>
            </section>

            {model.saveSignal !== null ? (
              <SaveSignal signal={model.saveSignal} />
            ) : null}

            <div className="combat-actions">
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
                    : "Clear the room's combat encounter before it can be resolved."}
                </p>
              ) : null}
            </div>

            <TelegraphBanner
              title="Telegraph // hazard lane"
              detail="Hatch marks show danger before impact. Color and text remain when motion is reduced."
              tone="incoming"
            />
          </aside>
        </div>
      </main>
    </div>
  );
}