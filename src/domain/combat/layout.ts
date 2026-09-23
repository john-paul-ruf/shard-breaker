import type { ContentCatalog, ContentId } from "../content/catalog";
import type {
  CombatCheckpoint,
  CombatEnemySnapshot,
  HazardStateSnapshot,
  SkillChargeSnapshot,
} from "../run/model";
import { deriveStream } from "../random/seededRng";
import type {
  BallState,
  CombatInitContext,
  CombatPhase,
  CombatState,
  EnemyInstance,
  HazardInstance,
} from "./model";
import { AIM_MAX_DEVIATION, PADDLE_HALF_WIDTH, PADDLE_Y, WORLD_WIDTH } from "./model";

/**
 * Schema caps mirrored from `combatCheckpointSchema`
 * (`src/persistence/validation.ts`). These mirror committed validation instead
 * of importing the persistence layer — the combat domain never imports
 * persistence — and S02's generator change owns closing the numeric gap
 * between generator-emitted counts and these bounds.
 */
export const MAX_LAYOUT_ENEMIES = 512;
export const MAX_LAYOUT_HAZARDS = 128;

/**
 * Grid geometry for the formation block inside the upper field. Columns scale
 * with density, rows follow, and cells are spread across a fixed inset region
 * so every density reads cleanly at render time.
 */
export const FORMATION_INSET_X = 20;
export const FORMATION_TOP_Y = 16;
export const FORMATION_INSET_Y = 28;
export const ENEMY_HALF_WIDTH = 6;
export const ENEMY_HALF_HEIGHT = 4;
export const HAZARD_HALF_WIDTH = 8;
/** Steps a hazard stays telegraphed before activating. */
export const HAZARD_TELEGRAPH_STEPS = 240;

const compareIds = (left: ContentId, right: ContentId): number =>
  left < right ? -1 : left > right ? 1 : 0;

const compareEnemies = (
  left: { readonly id: ContentId },
  right: { readonly id: ContentId },
): number => compareIds(left.id, right.id);

function requireNonBlank(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`);
  }
}

function requireFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be a finite number`);
  }
}

function positionForCell(row: number, col: number, cols: number): { x: number; y: number } {
  const spanX = WORLD_WIDTH - FORMATION_INSET_X * 2;
  return {
    x: FORMATION_INSET_X + ((col + 0.5) * spanX) / cols,
    y: FORMATION_TOP_Y + row * FORMATION_INSET_Y + ENEMY_HALF_HEIGHT,
  };
}

function hazardInstanceIdFor(eventKey: string, index: number): string {
  return `${eventKey}:hazard:${String(index)}`;
}

function attachedBall(paddleX: number): BallState {
  return Object.freeze({
    x: paddleX,
    y: PADDLE_Y - 2,
    vx: 0,
    vy: 0,
    attached: true,
  });
}

/**
 * Materialize the arena for one room: validate the caller's threat context,
 * lay out enemies on a density-derived grid with per-cell seeded definitions,
 * place telegraphed hazards in lanes, and freeze every output. Deterministic:
 * same context, same frozen state.
 */
export function createCombatState(
  catalog: ContentCatalog,
  context: CombatInitContext,
): CombatState {
  requireNonBlank(context.seed, "seed");
  requireNonBlank(context.contentVersion, "contentVersion");
  if (context.contentVersion !== catalog.contentVersion) {
    throw new RangeError(
      `content version ${context.contentVersion} does not match ${catalog.contentVersion}`,
    );
  }
  requireNonBlank(context.roomId, "roomId");
  requireNonBlank(context.eventKey, "eventKey");
  requireFinite(context.density, "density");
  requireFinite(context.durabilityFactor, "durabilityFactor");
  if (context.density < 0 || !Number.isSafeInteger(context.density)) {
    throw new RangeError("density must be a safe integer >= 0");
  }
  if (context.durabilityFactor < 1) {
    throw new RangeError("durabilityFactor must be >= 1");
  }
  if (!Number.isSafeInteger(context.lossCount) || context.lossCount < 0) {
    throw new RangeError("lossCount must be a safe integer >= 0");
  }
  if (context.density > MAX_LAYOUT_ENEMIES) {
    throw new RangeError(`density exceeds the persisted enemy cap: ${String(MAX_LAYOUT_ENEMIES)}`);
  }
  const hazardIds = [...context.hazardIds].sort(compareIds);
  if (hazardIds.length > MAX_LAYOUT_HAZARDS) {
    throw new RangeError(
      `hazard count exceeds the persisted hazard cap: ${String(MAX_LAYOUT_HAZARDS)}`,
    );
  }
  if (new Set(hazardIds).size !== hazardIds.length) {
    throw new RangeError("hazard IDs must be unique in a room");
  }

  const enemies: EnemyInstance[] = [];
  if (context.density > 0) {
    const cols = context.density <= 4 ? 3 : context.density <= 8 ? 4 : 5;
    const rows = Math.ceil(context.density / cols);
    const enemyPool = [...catalog.listEnemies()].sort(compareEnemies);
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const cellIndex = row * cols + col;
        if (cellIndex >= context.density) {
          continue;
        }
        const rng = deriveStream(
          context.seed,
          catalog.contentVersion,
          `${context.eventKey}:combat-layout:${String(row)}:${String(col)}`,
        );
        const definition = rng.pick(enemyPool);
        const health = Math.max(
          1,
          Math.round(definition.baseHealth * context.durabilityFactor),
        );
        const position = positionForCell(row, col, cols);
        enemies.push(
          Object.freeze({
            instanceId: `${context.eventKey}:enemy:${String(cellIndex)}`,
            enemyId: definition.id,
            health,
            maxHealth: health,
            x: position.x,
            y: position.y,
            halfWidth: ENEMY_HALF_WIDTH,
            halfHeight: ENEMY_HALF_HEIGHT,
            behavior: definition.behavior,
            behaviorParam: definition.behaviorParam,
            behaviorClock: 0,
            defeated: false,
          }),
        );
      }
    }
  }

  const hazards: HazardInstance[] = hazardIds.map((hazardId, index) => {
    const spanX = WORLD_WIDTH - FORMATION_INSET_X * 2;
    const laneX =
      FORMATION_INSET_X + ((index + 0.5) * spanX) / Math.max(1, hazardIds.length);
    return Object.freeze({
      instanceId: hazardInstanceIdFor(context.eventKey, index),
      hazardId,
      laneX,
      halfWidth: HAZARD_HALF_WIDTH,
      state: "telegraphed",
      remainingSteps: HAZARD_TELEGRAPH_STEPS,
    } satisfies HazardInstance);
  });

  return Object.freeze({
    roomId: context.roomId,
    eventKey: context.eventKey,
    phase: "pre_launch" as CombatPhase,
    step: 0,
    paddleX: WORLD_WIDTH / 2,
    aimAngle: 0,
    balls: Object.freeze([attachedBall(WORLD_WIDTH / 2)]),
    enemies: Object.freeze(enemies),
    hazards: Object.freeze(hazards),
    wallHits: 0,
    losses: context.lossCount,
    outcome: null,
  } satisfies CombatState);
}

/**
 * Emit the exact persisted checkpoint shape. Field names mirror
 * `CombatEnemySnapshot`/`HazardStateSnapshot`/`SkillChargeSnapshot` in
 * `src/domain/run/model.ts`; `bossState` stays null until boss rules land.
 * Only resumable moments are checkpointable: room entry (`pre_launch`) and a
 * loss restore (`loss_of_ball`). A live volley and a resolved room are never
 * persisted (Custom Rule: frames are ephemeral; a clear is reported, not
 * checkpointed).
 */
export function toCombatCheckpoint(
  state: CombatState,
  skillCharges: readonly SkillChargeSnapshot[] = [],
): CombatCheckpoint {
  if (skillCharges.length > 3) {
    throw new RangeError("skillCharges must hold at most 3 entries");
  }
  if (state.phase !== "pre_launch") {
    throw new RangeError(`only pre-launch moments are checkpointed, saw ${state.phase}`);
  }
  const kind = state.losses > 0 ? "loss_of_ball" : "pre_launch";
  const enemies: CombatEnemySnapshot[] = state.enemies.map((enemy) => ({
    enemyInstanceId: enemy.instanceId,
    enemyId: enemy.enemyId,
    health: enemy.health,
    stateId: enemy.behavior,
    defeated: enemy.defeated,
  }));
  const hazards: HazardStateSnapshot[] = state.hazards.map((hazard) => ({
    hazardInstanceId: hazard.instanceId,
    hazardId: hazard.hazardId,
    state: hazard.state,
    remainingSteps: hazard.remainingSteps,
  }));
  return Object.freeze({
    kind,
    paddleX: state.paddleX,
    aimAngle: state.aimAngle,
    ballAttached: true,
    enemies: Object.freeze(enemies),
    hazards: Object.freeze(hazards),
    bossState: null,
    skillCharges: Object.freeze([...skillCharges]),
  } satisfies CombatCheckpoint);
}

function clampPaddle(x: number): number {
  return Math.max(PADDLE_HALF_WIDTH, Math.min(WORLD_WIDTH - PADDLE_HALF_WIDTH, x));
}

function clampAim(angle: number): number {
  return Math.max(-AIM_MAX_DEVIATION, Math.min(AIM_MAX_DEVIATION, angle));
}

/**
 * Rebuild a `pre_launch`-phase state from a checkpoint plus the static room
 * context the room already holds. Layout geometry re-derives from the same
 * seeded stream and the stored rows are verified against it, so a checkpoint
 * from another room or a stale layout fails closed instead of silently
 * misplacing the formation. Paddle and aim clamp into their legal bands so a
 * rebuilt state is always legal even from foreign data.
 */
export function fromCombatCheckpoint(
  checkpoint: CombatCheckpoint,
  staticContext: CombatInitContext,
  catalog: ContentCatalog,
): CombatState {
  if (checkpoint.kind === "loss_of_ball" && staticContext.lossCount < 1) {
    throw new RangeError("a loss checkpoint requires a prior loss count in the room context");
  }
  if (checkpoint.kind === "pre_launch" && staticContext.lossCount > 0) {
    throw new RangeError("a pre-launch checkpoint cannot follow a processed loss");
  }
  const rebuilt = createCombatState(catalog, staticContext);
  if (
    checkpoint.enemies.length !== rebuilt.enemies.length ||
    checkpoint.hazards.length !== rebuilt.hazards.length
  ) {
    throw new RangeError("checkpoint rows do not match the room's deterministic layout");
  }
  const enemies = rebuilt.enemies.map((enemy, index) => {
    const stored = checkpoint.enemies[index];
    if (stored === undefined || stored.enemyInstanceId !== enemy.instanceId) {
      throw new RangeError(
        `checkpoint enemy layout does not match the rebuilt layout at index ${String(index)}`,
      );
    }
    return Object.freeze({
      ...enemy,
      health: stored.health,
      defeated: stored.defeated,
    } satisfies EnemyInstance);
  });
  const hazards = rebuilt.hazards.map((hazard, index) => {
    const stored = checkpoint.hazards[index];
    if (
      stored === undefined ||
      stored.hazardInstanceId !== hazardInstanceIdFor(staticContext.eventKey, index)
    ) {
      throw new RangeError(
        `checkpoint hazard layout does not match the rebuilt layout at index ${String(index)}`,
      );
    }
    return Object.freeze({
      ...hazard,
      state: stored.state,
      remainingSteps: stored.remainingSteps,
    } satisfies HazardInstance);
  });
  return Object.freeze({
    ...rebuilt,
    paddleX: clampPaddle(checkpoint.paddleX),
    aimAngle: clampAim(checkpoint.aimAngle),
    balls: Object.freeze([attachedBall(clampPaddle(checkpoint.paddleX))]),
    enemies: Object.freeze(enemies),
    hazards: Object.freeze(hazards),
  } satisfies CombatState);
}