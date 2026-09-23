import type { AppCommand } from "../app/commands";
import type { CombatOutcome, CombatState } from "../domain/combat/model";
import type { EffectSnapshot } from "../domain/combat/effects";
import { NEUTRAL_EFFECTS } from "../domain/combat/effects";
import { launchBall, movePaddle, stepCombat } from "../domain/combat/rules";
import type { SkillChargeSnapshot } from "../domain/run/model";
import { createFrameClock, startEngine } from "./engine";
import type { EngineOptions, FrameClock } from "./engine";
import { createRenderSnapshot } from "./renderer";
import type { RenderSnapshot } from "./renderer";

/**
 * One bridge-reported volley end: the same payload the run domain's
 * `combat/report-outcome` app command carries. Derived from the app command
 * surface by `Extract` so the bridge cannot drift from the reducer's
 * serializable contract (`M10 → M06` type-only edge, arch M06).
 */
export type GameOutcomeMessage = Extract<
  AppCommand,
  { readonly type: "combat/report-outcome" }
>["outcome"];

/** A skill the player asked to use; the caller owns the durable command. */
export type SkillId = Extract<AppCommand, { readonly type: "combat/use-skill" }>["skillId"];

/**
 * The volley resolver the caller provides: the session calls it once per
 * launch with the room's live inputs and threads the returned snapshot into
 * `launchBall`/`stepCombat` for that volley. The production implementation is
 * `resolveVolleyEffects(catalog, build, rolledParams, skillCharges)` (S02);
 * it is wired by the caller because the catalog and build are app-owned
 * state and `src/game/` imports only combat modules and
 * `src/app/commands.ts` (arch M06 dependency rules).
 */
export type VolleyEffectsResolver = (
  skillCharges: readonly SkillChargeSnapshot[],
) => EffectSnapshot;

/** Structural mirror of the app command's outcome payload for dispatch. */
export interface GameOutcomeMessageLike {
  readonly outcomeId: string;
  readonly kind: "loss_of_ball" | "clear";
}

export interface GameSessionCallbacks {
  /** Dispatch `combat/report-outcome`; the store owns the durable write. */
  readonly onOutcome: (outcome: GameOutcomeMessageLike) => void;
  /** Receives the render snapshot after every executed engine batch. */
  readonly onRender: (snapshot: RenderSnapshot) => void;
  /**
   * The player asked to use a skill. The session only requests it — charges
   * are durable state the caller owns; it dispatches `combat/use-skill` and
   * publishes the fresh checkpoint back through `replaceState`.
   */
  readonly onSkillRequested: (skillId: SkillId) => void;
  /**
   * Per-volley effect snapshot provider. The default resolves
   * `resolveVolleyEffects(NEUTRAL)`; production callers wire the app-owned
   * catalog, build, and rolled params.
   */
  readonly resolveVolleyEffects: VolleyEffectsResolver;
}

export interface GameSessionOptions {
  /** Engine options (step size, catch-up cap) for tests and hosts. */
  readonly engine?: EngineOptions;
  /** Clock override; the production clock is rAF over performance.now. */
  readonly clock?: FrameClock;
}

export interface GameSession {
  /** Explicit launch (the dedicated control). Legal pre-launch only. */
  launch(angle: number): void;
  /** Move the paddle in world units; the session clamps through the domain. */
  movePaddle(x: number): void;
  /** Keyboard paddle nudge (the input layer's ArrowLeft/ArrowRight). */
  movePaddleBy(direction: -1 | 1): void;
  /** Request a skill use; the caller owns the durable command. */
  useSkill(skillId: SkillId): void;
  /** Swap in a fresh durable state (after a checkpoint publish). */
  replaceState(state: CombatState): void;
  /** Current world-space snapshot for the renderer. */
  snapshot(): RenderSnapshot;
  /** The session's live combat state. */
  state(): CombatState;
  /** Stop the engine; the session is inert afterwards. */
  stop(): void;
}

const KEYBOARD_PADDLE_STEP = 4;

/**
 * Extract the room-scoped skill charges a caller published with the current
 * state. The session never invents charges: callers that do not track them
 * publish an empty list and the resolver sees no spent skills.
 */
const chargeKey = "combatSkillCharges";

function readSkillCharges(state: CombatState): readonly SkillChargeSnapshot[] {
  const charges = (state as CombatState & { readonly [chargeKey]?: unknown })[
    chargeKey
  ];
  return Array.isArray(charges)
    ? (charges as readonly SkillChargeSnapshot[])
    : Object.freeze([]);
}

export { chargeKey as SKILL_CHARGES_STATE_KEY };

/**
 * The ephemeral combat session: owns the live `CombatState`, drives it with
 * the fixed-step engine, normalizes input into domain commands, and bridges
 * volley ends to the app store exactly once (CA-05) keyed by outcome ID.
 * Frames are ephemeral — the session persists nothing; the durable checkpoint
 * is the store's. After an outcome the session stops stepping and awaits a
 * fresh state through `replaceState` on the next checkpoint publish; re-entry
 * with the same outcome can never dispatch it twice.
 */
export function createGameSession(
  initial: CombatState,
  callbacks: GameSessionCallbacks,
  options: GameSessionOptions = {},
): GameSession {
  let current: CombatState = initial;
  let effects: EffectSnapshot = NEUTRAL_EFFECTS;
  let knownSkillCharges: readonly SkillChargeSnapshot[] =
    readSkillCharges(initial);
  const dispatchedOutcomes = new Set<string>();
  let engineStop: (() => void) | null = null;
  let stopped = false;

  if (initial.phase === "live") {
    ensureEngine();
  }

  function stopEngine(): void {
    engineStop?.();
    engineStop = null;
  }

  function ensureEngine(): void {
    if (stopped || engineStop !== null || current.phase !== "live") {
      return;
    }
    engineStop = startEngine(
      options.clock ?? createFrameClock(),
      (steps) => {
        if (current.phase !== "live") {
          stopEngine();
          return;
        }
        current = stepCombat(current, steps, effects);
        callbacks.onRender(createRenderSnapshot(current));
        if (current.outcome !== null) {
          bridgeOutcome(current.outcome);
          stopEngine();
        }
      },
      options.engine,
    );
  }

  function bridgeOutcome(outcome: CombatOutcome): void {
    if (dispatchedOutcomes.has(outcome.outcomeId)) {
      return;
    }
    dispatchedOutcomes.add(outcome.outcomeId);
    callbacks.onOutcome({ outcomeId: outcome.outcomeId, kind: outcome.kind });
  }

  return {
    launch(angle) {
      if (stopped || current.phase !== "pre_launch" || current.outcome !== null) {
        return;
      }
      effects = callbacks.resolveVolleyEffects(knownSkillCharges);
      current = launchBall(current, angle, effects);
      callbacks.onRender(createRenderSnapshot(current));
      ensureEngine();
    },
    movePaddle(x) {
      if (stopped) {
        return;
      }
      current = movePaddle(current, x);
      callbacks.onRender(createRenderSnapshot(current));
    },
    movePaddleBy(direction) {
      if (stopped) {
        return;
      }
      current = movePaddle(current, current.paddleX + direction * KEYBOARD_PADDLE_STEP);
      callbacks.onRender(createRenderSnapshot(current));
    },
    useSkill(skillId) {
      if (stopped) {
        return;
      }
      callbacks.onSkillRequested(skillId);
    },
    replaceState(state) {
      if (stopped) {
        return;
      }
      current = state;
      effects = NEUTRAL_EFFECTS;
      knownSkillCharges = readSkillCharges(state);
      if (state.phase === "live") {
        ensureEngine();
      } else {
        stopEngine();
      }
      callbacks.onRender(createRenderSnapshot(state));
    },
    snapshot() {
      return createRenderSnapshot(current);
    },
    state() {
      return current;
    },
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      stopEngine();
    },
  };
}
