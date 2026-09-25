import type { BossDefinition } from "../content/bosses";
import type { ContentCatalog, ContentId } from "../content/catalog";
import { deriveStream } from "../random/seededRng";
import {
  FORMATION_INSET_X,
  FORMATION_TOP_Y,
  createCombatState,
} from "./layout";
import type {
  CombatInitContext,
  CombatState,
  EnemyInstance,
  HazardInstance,
} from "./model";
import { PADDLE_Y, SIMULATION_STEP_SECONDS, WORLD_WIDTH } from "./model";
import { stepCombat } from "./rules";

/**
 * Boss combat rules (CAP-08). This layer composes over S01's volley loop
 * WITHOUT modifying it: the routed boss's anatomy — shield nodes and the core
 * — is materialized as ordinary arena enemy rows, so `stepCombat`'s fixed-step
 * collision cascade damages and defeats them, and the volley's own clear
 * outcome (`results.ts` identity) fires exactly once when every row falls.
 * `stepBoss` steps the volley through S01's loop and re-derives the boss
 * projection (phase, telegraph countdown, counters) from the returned state.
 *
 * Durable semantics: boss anatomy and sweep lanes are arena-ephemeral. The
 * durable checkpoint stays S01's formation snapshot (`bossState: null`), and
 * a loss restore recomposes the anatomy deterministically from
 * `(seed, contentVersion, <eventKey>:boss-layout)` — each volley is a fresh
 * assault, and the boss is defeated only by the volley that clears the room.
 */

/** Node rows spawn with this base health before durability scaling. */
export const BOSS_NODE_BASE_HEALTH = 2;
/** The core row spawns with this base health before durability scaling. */
export const BOSS_CORE_BASE_HEALTH = 6;
export const BOSS_NODE_HALF_WIDTH = 7;
export const BOSS_NODE_HALF_HEIGHT = 5;
export const BOSS_CORE_HALF_WIDTH = 10;
export const BOSS_CORE_HALF_HEIGHT = 7;
/**
 * Telegraph windows never shorten below this many steps (1s at
 * `SIMULATION_STEP_SECONDS`), so a capped modifier can never remove the time
 * to read the warning — one bounded part of the viable-response guarantee.
 */
export const BOSS_TELEGRAPH_MIN_STEPS = 120;
/** Base half-width of a boss sweep lane (world units). */
export const BOSS_SWEEP_HALF_WIDTH_BASE = 8;
/** Hard half-width cap for sweep lanes; a widened sweep stays bankable. */
export const BOSS_SWEEP_MAX_HALF_WIDTH = 12;
/**
 * Total sweep-lane coverage cap as a fraction of the field width. At or below
 * it, more than half the field is always lane-free, so at least one rebound
 * route survives every allowed modifier application.
 */
export const BOSS_SWEEP_MAX_COVERAGE = 0.45;
/** Arc saturation shortens telegraph windows by this factor. */
export const ARC_SATURATION_STEP_FACTOR = 0.75;
/** Widened/siphon sweeps widen lane half-width by this factor. */
export const WIDENED_SWEEP_WIDTH_FACTOR = 1.5;

/** Boss anatomy instance identity inside the composed arena. */
export function bossNodeIdFor(eventKey: string, index: number): string {
  return `${eventKey}:boss:node:${String(index)}`;
}

export function bossCoreIdFor(eventKey: string): string {
  return `${eventKey}:boss:core`;
}

/**
 * Sweep-lane instance identity: chain-positional (unique per lane, including
 * modifier-added repeats). The lane's authored telegraph rides on the hazard
 * row's `hazardId`, which the projection resolves back to its definition.
 */
export function bossSweepIdFor(eventKey: string, laneIndex: number): string {
  return `${eventKey}:boss:hazard:${String(laneIndex)}`;
}

const SWEEP_PREFIX = ":boss:hazard:";

function sweepLaneIndex(instanceId: string): number | null {
  const marker = instanceId.indexOf(SWEEP_PREFIX);
  if (marker < 0) {
    return null;
  }
  const suffix = instanceId.slice(marker + SWEEP_PREFIX.length);
  return /^\d+$/.test(suffix) ? Number(suffix) : null;
}

/** One applied modifier's capped projection onto the boss arena. */
export interface BossModifierApplication {
  readonly modifierId: ContentId;
  readonly displayName: string;
  /** Multiplier applied to authored telegraph windows (floors at `BOSS_TELEGRAPH_MIN_STEPS`). */
  readonly telegraphStepFactor: number;
  /** Additional sweep lanes this modifier contributes within the lane cap. */
  readonly extraSweepLanes: number;
  /** Half-width multiplier applied to sweep lanes, clamped to the width cap. */
  readonly sweepWidthFactor: number;
}

/** A modifier ID that failed closed, with a bounded diagnostic reason. */
export interface IgnoredModifier {
  readonly modifierId: ContentId;
  readonly reason:
    | "unknown-modifier"
    | "incompatible-with-archetype"
    | "duplicate-modifier"
    | "modifier-cap-reached";
}

export interface BossModifierResolution {
  readonly applied: readonly BossModifierApplication[];
  readonly ignored: readonly IgnoredModifier[];
}

/**
 * The boss projection derived from the volley state: phase at health
 * thresholds, the earliest live telegraph with its step-derived countdown,
 * and the bounded counters. Deterministic in the volley state alone.
 */
export interface BossCombatProjection {
  readonly archetypeId: ContentId;
  readonly eventKey: string;
  readonly phaseIndex: number;
  readonly phaseId: string;
  readonly phaseDisplayName: string;
  readonly transitionCondition: string;
  readonly health: number;
  readonly maxHealth: number;
  readonly defeated: boolean;
  readonly telegraph: {
    readonly laneIndex: number;
    readonly telegraphId: string;
    readonly displayName: string;
    readonly counterplay: string;
    readonly state: "telegraphed" | "active";
    readonly remainingSteps: number;
    readonly totalSteps: number;
  } | null;
  readonly counters: readonly {
    readonly counterId: string;
    readonly value: number;
  }[];
}

/** The boss runtime: the projection plus the composed arena it projects. */
export interface BossCombatRuntime {
  readonly projection: BossCombatProjection;
  readonly arena: CombatState;
  readonly definition: BossDefinition;
  readonly appliedModifiers: readonly BossModifierApplication[];
  readonly ignoredModifiers: readonly IgnoredModifier[];
}

/**
 * The boss init context: S01's combat context plus the routed archetype and
 * the room's selected modifier IDs (empty until S06's selection lands).
 */
export interface BossCombatInitContext extends CombatInitContext {
  readonly archetypeId: ContentId;
  readonly modifierIds: readonly ContentId[];
}

/**
 * The authored modifier-effect registry keyed by modifier ID. Effects are
 * deliberately bounded: window factors floor at `BOSS_TELEGRAPH_MIN_STEPS`,
 * lane additions cap at `MAX_BOSS_SWEEP_LANES`, and width factors clamp so
 * total lane coverage can never cross `BOSS_SWEEP_MAX_COVERAGE` — every
 * application leaves a viable rebound response.
 */
const MODIFIER_EFFECTS: Readonly<
  Record<
    string,
    {
      readonly telegraphStepFactor?: number;
      readonly extraSweepLanes?: number;
      readonly sweepWidthFactor?: number;
    }
  >
> = Object.freeze({
  "boss-modifier-arc-saturation": Object.freeze({
    telegraphStepFactor: ARC_SATURATION_STEP_FACTOR,
  }),
  "boss-modifier-split-lane": Object.freeze({ extraSweepLanes: 1 }),
  "boss-modifier-widened-sweep": Object.freeze({
    sweepWidthFactor: WIDENED_SWEEP_WIDTH_FACTOR,
  }),
  "boss-modifier-twin-brood": Object.freeze({ extraSweepLanes: 1 }),
  "boss-modifier-denied-band": Object.freeze({ extraSweepLanes: 1 }),
  "boss-modifier-siphon-lane": Object.freeze({
    sweepWidthFactor: WIDENED_SWEEP_WIDTH_FACTOR,
  }),
});

const MAX_BOSS_SWEEP_LANES = 3;
const MAX_EXTRA_SWEEP_LANES = MAX_BOSS_SWEEP_LANES - 2;
/** Steps a sweep lane stays active after its warning, per S01's hazard pulse. */
const SWEEP_PULSE_STEPS = 120;

/**
 * Apply the room's selected modifier IDs against the archetype's compatible
 * registry. Unknown, incompatible, duplicated, and cap-exceeding IDs fail
 * closed — ignored with a bounded diagnostic, never thrown — so stored or
 * imported data can never crash a volley mid-simulation (CA-12).
 */
export function applyBossModifiers(
  definition: BossDefinition,
  modifierIds: readonly ContentId[],
): BossModifierResolution {
  const applied: BossModifierApplication[] = [];
  const ignored: IgnoredModifier[] = [];
  let extraSweepLanes = 0;

  for (const modifierId of modifierIds) {
    const effect = MODIFIER_EFFECTS[modifierId];
    if (effect === undefined) {
      ignored.push({ modifierId, reason: "unknown-modifier" });
      continue;
    }
    const compatible = definition.compatibleModifiers.find(
      (entry) => entry.id === modifierId,
    );
    if (compatible === undefined) {
      ignored.push({ modifierId, reason: "incompatible-with-archetype" });
      continue;
    }
    if (applied.some((entry) => entry.modifierId === modifierId)) {
      ignored.push({ modifierId, reason: "duplicate-modifier" });
      continue;
    }
    const requestedLanes = effect.extraSweepLanes ?? 0;
    if (requestedLanes > 0 && extraSweepLanes >= MAX_EXTRA_SWEEP_LANES) {
      ignored.push({ modifierId, reason: "modifier-cap-reached" });
      continue;
    }
    extraSweepLanes += requestedLanes;
    applied.push(
      Object.freeze({
        modifierId,
        displayName: compatible.displayName,
        telegraphStepFactor: effect.telegraphStepFactor ?? 1,
        extraSweepLanes: requestedLanes,
        sweepWidthFactor: effect.sweepWidthFactor ?? 1,
      }),
    );
  }

  return Object.freeze({
    applied: Object.freeze(applied),
    ignored: Object.freeze(ignored),
  });
}

/**
 * Compose the boss arena: the deterministic S01 volley layout plus the routed
 * anatomy (shield nodes, then the core below them) plus sweep lanes chained
 * so each lane's active window follows the previous lane's resolution. Fails
 * closed when the threat context leaves no room for the anatomy above the
 * paddle zone — boss threat composition is S06's lease.
 */
export function createBossCombatState(
  catalog: ContentCatalog,
  context: BossCombatInitContext,
  baseArena?: CombatState,
): BossCombatRuntime {
  const bossResult = catalog.getBoss(context.archetypeId);
  if (!bossResult.ok) {
    throw new RangeError(`unknown boss archetype: ${context.archetypeId}`);
  }
  const definition = bossResult.value;
  const base = baseArena ?? createCombatState(catalog, context);
  if (base.eventKey !== context.eventKey) {
    throw new RangeError("the base arena does not match the boss context's event key");
  }

  const resolution = applyBossModifiers(definition, context.modifierIds);
  let extraSweepLanes = 0;
  for (const application of resolution.applied) {
    extraSweepLanes += application.extraSweepLanes;
  }
  const widthFactor = resolution.applied.reduce(
    (factor, application) => factor * application.sweepWidthFactor,
    1,
  );
  const windowFactor = resolution.applied.reduce(
    (factor, application) => Math.min(factor, application.telegraphStepFactor),
    1,
  );

  const layout = deriveStream(
    context.seed,
    catalog.contentVersion,
    `${context.eventKey}:boss-layout`,
  );

  const halfWidth = Math.min(
    BOSS_SWEEP_MAX_HALF_WIDTH,
    Math.round(BOSS_SWEEP_HALF_WIDTH_BASE * widthFactor),
  );
  const laneCount = Math.min(
    MAX_BOSS_SWEEP_LANES,
    definition.telegraphs.length + extraSweepLanes,
  );
  const coverage = (laneCount * halfWidth * 2) / WORLD_WIDTH;
  if (coverage > BOSS_SWEEP_MAX_COVERAGE) {
    throw new RangeError(
      "boss sweep lanes would exceed the viable-response coverage cap",
    );
  }

  const columns =
    context.density === 0
      ? 0
      : context.density <= 4
        ? 3
        : context.density <= 8
          ? 4
          : 5;
  const rows = context.density === 0 ? 0 : Math.ceil(context.density / columns);
  const formationBottom =
    rows === 0 ? FORMATION_TOP_Y : FORMATION_TOP_Y + (rows - 1) * 28 + 8;
  const bossTopY = formationBottom + 6;
  const nodeY = bossTopY + BOSS_NODE_HALF_HEIGHT;
  const coreY =
    bossTopY + BOSS_NODE_HALF_HEIGHT * 2 + 2 + BOSS_CORE_HALF_HEIGHT;
  if (coreY + BOSS_CORE_HALF_HEIGHT >= PADDLE_Y - 8) {
    throw new RangeError(
      "the room's threat density leaves no room for the boss anatomy above the paddle",
    );
  }

  const nodeHealth = Math.max(
    1,
    Math.round(BOSS_NODE_BASE_HEALTH * context.durabilityFactor),
  );
  const coreHealth = Math.max(
    1,
    Math.round(BOSS_CORE_BASE_HEALTH * context.durabilityFactor),
  );

  const spanX = WORLD_WIDTH - FORMATION_INSET_X * 2;
  const nodeSpan = spanX / Math.max(1, definition.shieldNodeCount);
  const nodes: EnemyInstance[] = [];
  for (let index = 0; index < definition.shieldNodeCount; index += 1) {
    nodes.push(
      Object.freeze({
        instanceId: bossNodeIdFor(context.eventKey, index),
        enemyId: context.archetypeId,
        health: nodeHealth,
        maxHealth: nodeHealth,
        x: FORMATION_INSET_X + (index + 0.5) * nodeSpan,
        y: nodeY,
        halfWidth: BOSS_NODE_HALF_WIDTH,
        halfHeight: BOSS_NODE_HALF_HEIGHT,
        behavior: "static" as const,
        behaviorParam: 0,
        behaviorClock: 0,
        defeated: false,
      }),
    );
  }
  const core: EnemyInstance = Object.freeze({
    instanceId: bossCoreIdFor(context.eventKey),
    enemyId: context.archetypeId,
    health: coreHealth,
    maxHealth: coreHealth,
    x: WORLD_WIDTH / 2,
    y: coreY,
    halfWidth: BOSS_CORE_HALF_WIDTH,
    halfHeight: BOSS_CORE_HALF_HEIGHT,
    behavior: "static" as const,
    behaviorParam: 0,
    behaviorClock: 0,
    defeated: false,
  });

  // Sweep lanes: the layout stream shuffles the authored telegraphs into lane
  // order; modifier-added lanes cycle the same sequence. Each lane's warning
  // begins after the previous lane's full warning plus its active pulse, all
  // advanced per tick by S01's hazard clock.
  const laneSequence = layout.shuffle(
    definition.telegraphs.map((telegraph, index) => ({ telegraph, index })),
  );
  const spanXFull = WORLD_WIDTH - FORMATION_INSET_X * 2;
  const sweeps: HazardInstance[] = [];
  let elapsedSteps = 0;
  for (let lane = 0; lane < laneCount; lane += 1) {
    const entry = laneSequence[lane % laneSequence.length]!;
    const totalSteps = Math.max(
      BOSS_TELEGRAPH_MIN_STEPS,
      Math.round((entry.telegraph.windowSeconds * windowFactor) / SIMULATION_STEP_SECONDS),
    );
    elapsedSteps += totalSteps;
    sweeps.push(
      Object.freeze({
        instanceId: bossSweepIdFor(context.eventKey, lane),
        hazardId: entry.telegraph.id as ContentId,
        laneX: FORMATION_INSET_X + ((lane + 0.5) * spanXFull) / laneCount,
        halfWidth,
        state: "telegraphed" as const,
        remainingSteps: elapsedSteps,
      }),
    );
    elapsedSteps += SWEEP_PULSE_STEPS;
  }

  const arena: CombatState = Object.freeze({
    ...base,
    enemies: Object.freeze([...base.enemies, ...nodes, core]),
    hazards: Object.freeze([...base.hazards, ...sweeps]),
  });

  return Object.freeze({
    projection: deriveBossProjection(definition, arena),
    arena,
    definition,
    appliedModifiers: resolution.applied,
    ignoredModifiers: resolution.ignored,
  });
}

/**
 * Derive the boss projection from the volley state alone: the core row's
 * health selects the phase at the authored thresholds, the earliest live
 * sweep lane carries the telegraph with its step-derived countdown, and the
 * defeated node rows feed the counter. Sweep lanes resolve back to their
 * authored telegraph through the hazard row's `hazardId`, so lane order and
 * modifier-added repeats never misattribute a warning. Deterministic.
 */
export function deriveBossProjection(
  definition: BossDefinition,
  arena: CombatState,
): BossCombatProjection {
  const core = arena.enemies.find(
    (enemy) => enemy.instanceId === bossCoreIdFor(arena.eventKey),
  );
  if (core === undefined) {
    throw new RangeError("the volley state carries no boss core row");
  }
  const ratio = core.maxHealth > 0 ? core.health / core.maxHealth : 0;
  let phaseIndex = 0;
  for (const [index, phase] of definition.phases.entries()) {
    if (ratio <= phase.hpThreshold) {
      phaseIndex = index;
    }
  }
  const phase = definition.phases[phaseIndex]!;

  let telegraph: BossCombatProjection["telegraph"] = null;
  let earliestRemaining = Number.POSITIVE_INFINITY;
  for (const hazard of arena.hazards) {
    if (hazard.state === "resolved") {
      continue;
    }
    const laneIndex = sweepLaneIndex(hazard.instanceId);
    if (laneIndex === null) {
      continue;
    }
    const authored = definition.telegraphs.find(
      (entry) => entry.id === hazard.hazardId,
    );
    if (authored === undefined) {
      continue;
    }
    if (hazard.remainingSteps < earliestRemaining) {
      earliestRemaining = hazard.remainingSteps;
      telegraph = Object.freeze({
        laneIndex,
        telegraphId: authored.id,
        displayName: authored.displayName,
        counterplay: authored.counterplay,
        state:
          hazard.state === "active" ? ("active" as const) : ("telegraphed" as const),
        remainingSteps: hazard.remainingSteps,
        totalSteps: Math.max(
          BOSS_TELEGRAPH_MIN_STEPS,
          Math.round(authored.windowSeconds / SIMULATION_STEP_SECONDS),
        ),
      });
    }
  }

  const counterId = `${arena.eventKey}:boss:nodes-broken`;
  const counters = Object.freeze([
    Object.freeze({
      counterId,
      value: arena.enemies.filter(
        (enemy) =>
          enemy.instanceId.startsWith(`${arena.eventKey}:boss:node:`) &&
          enemy.defeated,
      ).length,
    }),
  ]);

  return Object.freeze({
    archetypeId: definition.id,
    eventKey: arena.eventKey,
    phaseIndex,
    phaseId: phase.id,
    phaseDisplayName: phase.displayName,
    transitionCondition: phase.transitionCondition,
    health: core.health,
    maxHealth: core.maxHealth,
    defeated: arena.phase === "resolved" && arena.outcome?.kind === "clear",
    telegraph,
    counters,
  });
}

/**
 * Step the boss encounter: advance the caller's volley state through S01's
 * loop and re-derive the projection from the stepped arena. The returned
 * runtime always carries the current volley state, so a caller that has
 * already ended (or replaced) its volley projects against that state. Steps
 * after a volley end are no-ops (S01's exactly-once guarantee), so the boss
 * projection freezes with the room.
 */
export function stepBoss(
  state: BossCombatRuntime,
  volleyState: CombatState,
  steps: number,
): BossCombatRuntime {
  const arena = stepCombat(volleyState, steps);
  if (arena === state.arena) {
    return state;
  }
  return Object.freeze({
    ...state,
    arena,
    projection: deriveBossProjection(state.definition, arena),
  });
}

/** Step-derived countdown seconds for DOM text (CA-10; never animated). */
export function bossCountdownSeconds(remainingSteps: number): string {
  const seconds = Math.max(0, remainingSteps) * SIMULATION_STEP_SECONDS;
  return (Math.round(seconds * 10) / 10).toFixed(1);
}