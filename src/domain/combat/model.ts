import type { ContentId } from "../content/catalog";
import type { EnemyBehavior } from "../content/enemies";

/**
 * One documented world coordinate system for every combat surface. x grows
 * right from 0 to `WORLD_WIDTH`; y grows down from 0 to `WORLD_HEIGHT` so the
 * paddle sits at high y and enemies at low y. Frame rate and device pixel
 * ratio never reach this layer: positions are logical units only.
 */
export const WORLD_WIDTH = 160;
export const WORLD_HEIGHT = 100;
export const PADDLE_Y = 94;
export const SIMULATION_STEP_SECONDS = 1 / 120;
export const BALL_BASE_SPEED = 48;
export const PADDLE_HALF_WIDTH = 15;
export const AIM_MAX_DEVIATION = Math.PI / 3;

/**
 * The maximum supported ball speed. At `BALL_BASE_SPEED * 4` the per-substep
 * displacement (see `BALL_SUBSTEP_DISPLACEMENT`) stays smaller than the
 * smallest enemy half-height, so one simulation step can never cross a brick
 * entirely.
 */
export const MAX_SUPPORTED_BALL_SPEED = BALL_BASE_SPEED * 4;
export const BALL_SUBSTEP_DISPLACEMENT = 2;

export type CombatPhase = "pre_launch" | "live" | "resolved";

/** Ball velocity is world units per second; position is world units. */
export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly attached: boolean;
}

export interface EnemyInstance {
  readonly instanceId: string;
  readonly enemyId: ContentId;
  readonly health: number;
  readonly maxHealth: number;
  readonly x: number;
  readonly y: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
  readonly behavior: EnemyBehavior;
  readonly behaviorParam: number;
  readonly behaviorClock: number;
  readonly defeated: boolean;
}

export interface HazardInstance {
  readonly instanceId: string;
  readonly hazardId: ContentId;
  readonly laneX: number;
  readonly halfWidth: number;
  readonly state: "telegraphed" | "active" | "resolved";
  readonly remainingSteps: number;
}

/** Exactly one outcome is emitted per volley end, identified per CA-02. */
export interface CombatOutcome {
  readonly outcomeId: string;
  readonly kind: "loss_of_ball" | "clear";
}

export interface CombatState {
  readonly roomId: string;
  readonly eventKey: string;
  readonly phase: CombatPhase;
  readonly step: number;
  readonly paddleX: number;
  readonly aimAngle: number;
  readonly balls: readonly BallState[];
  readonly enemies: readonly EnemyInstance[];
  readonly hazards: readonly HazardInstance[];
  readonly wallHits: number;
  readonly losses: number;
  readonly outcome: CombatOutcome | null;
}

/**
 * Caller-supplied coordinates for materializing one arena. Threat numbers
 * arrive from the committed producer `generateThreatProfile`; the seed and
 * content version come from the owning run; stream keys derive from the room
 * `eventKey`. `lossCount` seeds the same-kind loss index for CA-02 so a
 * rebuilt state continues the room's outcome ledger.
 */
export interface CombatInitContext {
  readonly seed: string;
  readonly contentVersion: string;
  readonly roomId: string;
  readonly eventKey: string;
  readonly formationId: ContentId;
  readonly density: number;
  readonly durabilityFactor: number;
  readonly lossCount: number;
  readonly hazardIds: readonly ContentId[];
}

/** Commands mutate a CombatState through the rules module only. */
export type CombatCommand =
  | { readonly type: "launch"; readonly angle: number }
  | { readonly type: "move_paddle"; readonly x: number }
  | { readonly type: "step"; readonly steps: number };