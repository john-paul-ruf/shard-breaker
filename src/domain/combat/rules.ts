import type {
  BallState,
  CombatOutcome,
  CombatState,
  EnemyInstance,
  HazardInstance,
} from "./model";
import {
  AIM_MAX_DEVIATION,
  BALL_BASE_SPEED,
  BALL_SUBSTEP_DISPLACEMENT,
  PADDLE_HALF_WIDTH,
  PADDLE_Y,
  SIMULATION_STEP_SECONDS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from "./model";
import { outcomeIdFor } from "./results";
import type { EffectSnapshot } from "./effects";
import { NEUTRAL_EFFECTS } from "./effects";

/**
 * How strongly an active hazard pulse bends a ball entering the lane. The
 * horizontal component is scaled by this factor with total speed preserved —
 * a deterministic angle bend, applied once per lane entry, never per substep.
 */
export const HAZARD_DEFLECT_FACTOR = 1.5;
/**
 * Paddle bounce geometry: the hit offset across the paddle face maps linearly
 * from straight-up at the center (steep) to the full legal cone at the edges
 * (shallow), so the return angle is always inside the legal aim cone.
 */
export const PADDLE_MIN_X = PADDLE_HALF_WIDTH;
export const PADDLE_MAX_X = WORLD_WIDTH - PADDLE_HALF_WIDTH;
/** Active hazards pulse for this many steps after the telegraph ends. */
export const HAZARD_PULSE_STEPS = 120;
/** How far the ball travels past the entry point per consumed pierce layer. */
export const PIERCE_TRAVEL_PER_LAYER = 2;

const IMPACT_SEPARATION = 0.001;

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function clampPaddle(x: number): number {
  return clamp(x, PADDLE_MIN_X, PADDLE_MAX_X);
}

function clampAim(angle: number): number {
  return clamp(angle, -AIM_MAX_DEVIATION, AIM_MAX_DEVIATION);
}

function requires(condition: boolean, message: string): void {
  if (!condition) {
    throw new RangeError(message);
  }
}

/**
 * Normalize an aim angle into a launch velocity. The angle is measured from
 * straight up (negative = leftward), clamped to the legal cone; y velocity is
 * always negative (upfield) at launch.
 */
export function velocityForAngle(
  angle: number,
  speed = BALL_BASE_SPEED,
): { vx: number; vy: number } {
  const clamped = clampAim(angle);
  return {
    vx: Math.sin(clamped) * speed,
    vy: -Math.cos(clamped) * speed,
  };
}

/**
 * Advance the simulation by `steps` fixed ticks. Per tick, in one documented
 * deterministic order: hazards → enemy behavior clocks → ball substeps, each
 * substep running the collision cascade in fixed order (walls → paddle →
 * enemies sorted by (y, x, instanceId) → loss boundary). Substeps bound the
 * per-check displacement to `BALL_SUBSTEP_DISPLACEMENT` so the maximum
 * supported speed can never cross a brick entirely. Inputs are never mutated;
 * every output is a fresh frozen state. Steps after a volley end are no-ops,
 * preserving the exactly-once outcome guarantee.
 *
 * The optional effect snapshot (CAP-03) modifies four hook points: hazard
 * softening at lane entry, impact force on enemy hits, pierce-through on
 * contact, and paddle-bounce shaping. A neutral snapshot reproduces the
 * pre-effect behavior exactly.
 */
export function stepCombat(
  state: CombatState,
  steps: number,
  effects: EffectSnapshot = NEUTRAL_EFFECTS,
): CombatState {
  requires(Number.isSafeInteger(steps) && steps >= 0, "steps must be a safe integer >= 0");
  if (state.phase === "resolved" || state.outcome !== null || steps === 0) {
    return state;
  }
  if (state.phase !== "live") {
    throw new RangeError(`cannot step a ${state.phase} arena; launch first`);
  }

  let current = state;
  for (let index = 0; index < steps; index += 1) {
    current = stepOnce(current, effects);
    if (current.outcome !== null) {
      return current;
    }
  }
  return current;
}

function stepOnce(state: CombatState, effects: EffectSnapshot): CombatState {
  const hazards = state.hazards.map(advanceHazard);
  let enemies: readonly EnemyInstance[] = state.enemies.map(advanceEnemyClock);
  const ball = state.balls[0];
  if (ball === undefined || ball.attached) {
    throw new RangeError("a live volley requires a moving ball");
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  const displacement = speed * SIMULATION_STEP_SECONDS;
  const substepCount = Math.max(1, Math.ceil(displacement / BALL_SUBSTEP_DISPLACEMENT));
  const substepSeconds = SIMULATION_STEP_SECONDS / substepCount;
  let x = ball.x;
  let y = ball.y;
  let vx = ball.vx;
  let vy = ball.vy;
  let wallHits = state.wallHits;
  let pierceLayers = effects.pierceLayers;
  const insideLaneAtTickStart = activeLaneAt(ball.x, hazards) !== null;

  for (let substep = 0; substep < substepCount; substep += 1) {
    x += vx * substepSeconds;
    y += vy * substepSeconds;

    // 1) Walls: left, right, top. Bottom is the loss boundary, not a wall.
    if (x < 0) {
      x = -x;
      vx = Math.abs(vx);
      wallHits += 1;
    } else if (x > WORLD_WIDTH) {
      x = 2 * WORLD_WIDTH - x;
      vx = -Math.abs(vx);
      wallHits += 1;
    }
    if (y < 0) {
      y = -y;
      vy = Math.abs(vy);
      wallHits += 1;
    }

    // 2) Active hazard lane: one softened bend per entry.
    if (!insideLaneAtTickStart) {
      const lane = activeLaneAt(x, hazards);
      if (lane !== null) {
        const bent = bendVelocity(vx, vy, speed, effects.hazardStepReduction);
        vx = bent.vx;
        vy = bent.vy;
      }
    }

    // 3) Paddle: reflect upfield with an offset-shaped angle when descending
    //    onto the paddle face; the widen factor shapes the rebound angle.
    if (y >= PADDLE_Y && vy > 0 && Math.abs(x - state.paddleX) <= PADDLE_HALF_WIDTH) {
      const offset = clamp((x - state.paddleX) / PADDLE_HALF_WIDTH, -1, 1);
      const deviation = Math.abs(offset) * AIM_MAX_DEVIATION * effects.reboundWidenFactor;
      const direction = offset >= 0 ? 1 : -1;
      vx = Math.sin(deviation) * speed * direction;
      vy = -Math.cos(deviation) * speed;
      y = PADDLE_Y - IMPACT_SEPARATION;
    }

    // 4) Enemies: nearest first by (y, x, instanceId); at most one hit per tick.
    //    A pierce layer lets the ball pass through the struck brick instead of
    //    deflecting, so it can clear stacked lanes without a rebound.
    const hit = pickEnemyHit(enemies, x, y);
    if (hit !== null) {
      const afterHit = applyEnemyHit(state, enemies, hazards, hit, effects);
      enemies = afterHit.enemies;
      if (pierceLayers <= 0) {
        const deflected = deflectOffEnemy(hit, x, y, vx, vy);
        return settleHit(
          state,
          afterHit.enemies,
          hazards,
          { x: deflected.x, y: deflected.y, vx: deflected.vx, vy: deflected.vy },
          wallHits,
          afterHit.outcome,
        );
      }
      pierceLayers -= 1;
      x += (Math.sign(vx) || 1) * PIERCE_TRAVEL_PER_LAYER;
      y += (Math.sign(vy) || 1) * PIERCE_TRAVEL_PER_LAYER;
      if (afterHit.outcome !== null) {
        return afterHit.state;
      }
      continue;
    }

    // 5) Loss boundary: beyond the field bottom ends the volley.
    if (y > WORLD_HEIGHT) {
      return settleLoss(state, enemies, hazards, wallHits);
    }
  }

  return freezeState(
    state,
    enemies,
    hazards,
    [{ x, y, vx, vy, attached: false }],
    wallHits,
    null,
    "live",
  );
}

function advanceHazard(hazard: HazardInstance): HazardInstance {
  if (hazard.state === "resolved") {
    return hazard;
  }
  if (hazard.state === "telegraphed") {
    return hazard.remainingSteps <= 1
      ? { ...hazard, state: "active", remainingSteps: 0 }
      : { ...hazard, remainingSteps: hazard.remainingSteps - 1 };
  }
  return hazard.remainingSteps + 1 >= HAZARD_PULSE_STEPS
    ? { ...hazard, state: "resolved", remainingSteps: 0 }
    : { ...hazard, remainingSteps: hazard.remainingSteps + 1 };
}

function advanceEnemyClock(enemy: EnemyInstance): EnemyInstance {
  if (enemy.defeated || enemy.behavior === "static" || enemy.behavior === "splintering") {
    return enemy;
  }
  if (enemy.behavior === "phasing") {
    return {
      ...enemy,
      behaviorClock: (enemy.behaviorClock + 1) % (enemy.behaviorParam * 2),
    };
  }
  // regenerating: heals one hit point every `behaviorParam` steps while damaged
  if (enemy.health >= enemy.maxHealth) {
    return enemy;
  }
  return enemy.behaviorClock + 1 >= enemy.behaviorParam
    ? { ...enemy, behaviorClock: 0, health: Math.min(enemy.maxHealth, enemy.health + 1) }
    : { ...enemy, behaviorClock: enemy.behaviorClock + 1 };
}

/** Phasing enemies are intangible for the first `behaviorParam` steps of each cycle. */
function isPhased(enemy: EnemyInstance): boolean {
  return enemy.behavior === "phasing" && enemy.behaviorClock < enemy.behaviorParam;
}

function activeLaneAt(
  x: number,
  hazards: readonly HazardInstance[],
): HazardInstance | null {
  for (const hazard of hazards) {
    if (hazard.state === "active" && Math.abs(x - hazard.laneX) <= hazard.halfWidth) {
      return hazard;
    }
  }
  return null;
}

/**
 * Speed-preserving lane-entry bend. `stepReduction` from the effect snapshot
 * divides the amplification factor, so higher reductions bend less; a fully
 * softened lane keeps the straight path. Total speed is always preserved.
 */
function bendVelocity(
  vx: number,
  vy: number,
  speed: number,
  stepReduction = 0,
): { vx: number; vy: number } {
  const softening = Math.max(0, stepReduction);
  const factor = HAZARD_DEFLECT_FACTOR / (1 + softening);
  const bentVx = vx * factor;
  if (Math.abs(bentVx) >= speed) {
    return { vx: Math.sign(vx) * speed, vy: 0 };
  }
  return {
    vx: bentVx,
    vy: Math.sign(vy) * Math.sqrt(Math.max(0, speed * speed - bentVx * bentVx)),
  };
}

function pickEnemyHit(
  enemies: readonly EnemyInstance[],
  x: number,
  y: number,
): EnemyInstance | null {
  const live = enemies
    .filter((enemy) => !enemy.defeated && !isPhased(enemy))
    .sort(
      (left, right) =>
        left.y - right.y ||
        left.x - right.x ||
        (left.instanceId < right.instanceId ? -1 : 1),
    );
  for (const enemy of live) {
    if (Math.abs(x - enemy.x) <= enemy.halfWidth && Math.abs(y - enemy.y) <= enemy.halfHeight) {
      return enemy;
    }
  }
  return null;
}

function deflectOffEnemy(
  enemy: EnemyInstance,
  x: number,
  y: number,
  vx: number,
  vy: number,
): { x: number; y: number; vx: number; vy: number } {
  const overlapX = enemy.halfWidth - Math.abs(x - enemy.x);
  const overlapY = enemy.halfHeight - Math.abs(y - enemy.y);
  if (overlapX < overlapY) {
    return {
      x: x < enemy.x ? enemy.x - enemy.halfWidth - IMPACT_SEPARATION : enemy.x + enemy.halfWidth + IMPACT_SEPARATION,
      y,
      vx: x < enemy.x ? -Math.abs(vx) : Math.abs(vx),
      vy,
    };
  }
  return {
    x,
    y: y < enemy.y ? enemy.y - enemy.halfHeight - IMPACT_SEPARATION : enemy.y + enemy.halfHeight + IMPACT_SEPARATION,
    vx,
    vy: y < enemy.y ? -Math.abs(vy) : Math.abs(vy),
  };
}

/**
 * Deal one impact to the struck enemy: the base hit plus the effect
 * snapshot's impact force (rolled amplitude values, or a spent Shield Bash
 * charge). Splintering enemies spawn two deterministic 1-HP static children
 * (`<instanceId>:a`/`:b`) on defeat. Returns the stepped state, the updated
 * enemy rows, and the clear outcome when every instance falls.
 */
function applyEnemyHit(
  state: CombatState,
  enemies: readonly EnemyInstance[],
  hazards: readonly HazardInstance[],
  hit: EnemyInstance,
  effects: EffectSnapshot,
): {
  readonly state: CombatState;
  readonly enemies: readonly EnemyInstance[];
  readonly outcome: CombatOutcome | null;
} {
  const damage = Math.max(1, 1 + Math.round(effects.impactForceBonus));
  const afterHit = enemies.flatMap((enemy) => {
    if (enemy !== hit) {
      return [enemy];
    }
    const defeated = enemy.health - damage <= 0;
    const updated = { ...enemy, health: enemy.health - damage, defeated };
    if (!defeated || enemy.behavior !== "splintering") {
      return [updated];
    }
    return [
      {
        ...enemy,
        instanceId: `${enemy.instanceId}:a`,
        health: 1,
        maxHealth: 1,
        behavior: "static" as const,
        behaviorParam: 0,
        defeated: false,
      },
      {
        ...enemy,
        instanceId: `${enemy.instanceId}:b`,
        health: 1,
        maxHealth: 1,
        behavior: "static" as const,
        behaviorParam: 0,
        defeated: false,
      },
    ];
  });
  const cleared = afterHit.every((enemy) => enemy.defeated);
  const outcome: CombatOutcome | null = cleared
    ? { kind: "clear", outcomeId: outcomeIdFor(state.eventKey, "clear", 0) }
    : null;
  return {
    state: freezeState(
      state,
      afterHit,
      hazards,
      state.balls,
      state.wallHits,
      outcome,
      cleared ? "resolved" : state.phase,
    ),
    enemies: afterHit,
    outcome,
  };
}

function settleHit(
  state: CombatState,
  enemies: readonly EnemyInstance[],
  hazards: readonly HazardInstance[],
  ball: { readonly x: number; readonly y: number; readonly vx: number; readonly vy: number },
  wallHits: number,
  outcome: CombatOutcome | null,
): CombatState {
  const ballState: BallState = Object.freeze({ ...ball, attached: false });
  if (outcome !== null) {
    return freezeState(state, enemies, hazards, [ballState], wallHits, outcome, "resolved");
  }
  return freezeState(state, enemies, hazards, [ballState], wallHits, null, "live");
}

function settleLoss(
  state: CombatState,
  enemies: readonly EnemyInstance[],
  hazards: readonly HazardInstance[],
  wallHits: number,
): CombatState {
  const outcome: CombatOutcome = {
    kind: "loss_of_ball",
    outcomeId: outcomeIdFor(state.eventKey, "loss_of_ball", state.losses),
  };
  return freezeState(
    state,
    enemies,
    hazards,
    [attachedBall(state.paddleX)],
    wallHits,
    outcome,
    "pre_launch",
  );
}

function attachedBall(paddleX: number): BallState {
  return Object.freeze({ x: paddleX, y: PADDLE_Y - 2, vx: 0, vy: 0, attached: true });
}

function freezeState(
  state: CombatState,
  enemies: readonly EnemyInstance[],
  hazards: readonly HazardInstance[],
  balls: readonly BallState[],
  wallHits: number,
  outcome: CombatOutcome | null,
  phase: CombatState["phase"],
): CombatState {
  return Object.freeze({
    ...state,
    phase,
    step: state.step + 1,
    balls: Object.freeze(balls),
    enemies: Object.freeze(enemies),
    hazards: Object.freeze(hazards),
    wallHits,
    losses: outcome?.kind === "loss_of_ball" ? state.losses + 1 : state.losses,
    outcome,
  } satisfies CombatState);
}

/**
 * Launch the attached ball. Explicit only: a live or resolved arena cannot
 * launch, and the angle clamps into the legal cone instead of wrapping. The
 * effect snapshot's `ballSpeedFactor` scales the launch speed (Overclock
 * contributes through `resolveVolleyEffects`); the new volley starts with no
 * outcome and the previous volley's outcome stays a room-level fact owned by
 * the caller.
 */
export function launchBall(
  state: CombatState,
  angle: number,
  effects: EffectSnapshot = NEUTRAL_EFFECTS,
): CombatState {
  requires(Number.isFinite(angle), "aim angle must be a finite real");
  requires(state.phase === "pre_launch", "launch requires a pre-launch arena");
  const clamped = clampAim(angle);
  const speed = BALL_BASE_SPEED * effects.ballSpeedFactor;
  const velocity = velocityForAngle(clamped, speed);
  const ball = state.balls[0];
  if (ball === undefined || !ball.attached) {
    throw new RangeError("launch requires an attached ball");
  }
  return Object.freeze({
    ...state,
    phase: "live" as const,
    aimAngle: clamped,
    outcome: null,
    balls: [
      { x: ball.x, y: ball.y, vx: velocity.vx, vy: velocity.vy, attached: false },
    ],
  } satisfies CombatState);
}

/**
 * Move the paddle. Legal in any phase; clamped to the field; the attached
 * ball rides along so the next launch starts from the paddle position.
 */
export function movePaddle(state: CombatState, x: number): CombatState {
  requires(Number.isFinite(x), "paddle x must be a finite real");
  const clamped = clampPaddle(x);
  const ball = state.balls[0];
  const balls =
    ball !== undefined && ball.attached
      ? [Object.freeze({ ...ball, x: clamped, y: PADDLE_Y - 2 })]
      : state.balls;
  return Object.freeze({
    ...state,
    paddleX: clamped,
    balls: Object.freeze(balls),
  } satisfies CombatState);
}