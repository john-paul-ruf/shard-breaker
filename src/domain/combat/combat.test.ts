import { describe, expect, it } from "vitest";

import { createContentCatalog } from "../content/catalog";
import type { ContentId } from "../content/catalog";
import { parseLivingRunRecord } from "../../persistence/validation";
import type { CombatCheckpoint, LivingRun } from "../run/model";
import { createInitialLivingRun } from "../run/model";
import {
  ENEMY_HALF_HEIGHT,
  ENEMY_HALF_WIDTH,
  FORMATION_INSET_X,
  FORMATION_TOP_Y,
  FORMATION_INSET_Y,
  HAZARD_TELEGRAPH_STEPS,
  MAX_LAYOUT_ENEMIES,
  createCombatState,
  fromCombatCheckpoint,
  toCombatCheckpoint,
} from "./layout";
import type { CombatInitContext } from "./model";
import { WORLD_WIDTH } from "./model";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const BATTLE_ROOM = asContentId("room-battle-glassway");
const HAZARD_SHIFT = asContentId("hazard-shift-lane");
const HAZARD_PULSE = asContentId("hazard-overclock-pulse");

function initContext(overrides: Partial<CombatInitContext> = {}): CombatInitContext {
  return {
    seed: "seed-1",
    contentVersion: "content-1",
    roomId: "route:content-1:run-1:1:room:room-battle-glassway:candidate",
    eventKey: "route:content-1:run-1:1:room:room-battle-glassway",
    formationId: BATTLE_ROOM,
    density: 6,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [HAZARD_SHIFT],
    ...overrides,
  };
}

describe("combat layout", () => {
  it("materializes a frozen pre-launch state from a threat context", () => {
    const state = createCombatState(catalog, initContext());

    expect(state.phase).toBe("pre_launch");
    expect(state.step).toBe(0);
    expect(state.paddleX).toBe(WORLD_WIDTH / 2);
    expect(state.aimAngle).toBe(0);
    expect(state.balls).toHaveLength(1);
    expect(state.balls[0]!.attached).toBe(true);
    expect(state.losses).toBe(0);
    expect(state.outcome).toBeNull();
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.enemies)).toBe(true);
    expect(Object.isFrozen(state.hazards)).toBe(true);
    expect(Object.isFrozen(state.balls)).toBe(true);
    expect(Object.isFrozen(state.enemies[0])).toBe(true);
  });

  it("is deterministic for identical contexts and seed-sensitive otherwise", () => {
    const context = initContext();
    expect(createCombatState(catalog, context)).toEqual(
      createCombatState(catalog, context),
    );
    expect(createCombatState(catalog, initContext({ seed: "seed-2" }))).not.toEqual(
      createCombatState(catalog, context),
    );
  });

  it("lays out exactly density enemies in the documented grid shape", () => {
    for (const [density, cols] of [
      [3, 3],
      [4, 3],
      [5, 4],
      [8, 4],
      [9, 5],
      [12, 5],
    ] as const) {
      const state = createCombatState(catalog, initContext({ density }));
      expect(state.enemies).toHaveLength(density);
      for (const [index, enemy] of state.enemies.entries()) {
        expect(enemy.instanceId).toBe(`${state.eventKey}:enemy:${String(index)}`);
        expect(enemy.x).toBeCloseTo(
          FORMATION_INSET_X +
            (((index % cols) + 0.5) * (WORLD_WIDTH - 2 * FORMATION_INSET_X)) / cols,
          6,
        );
        expect(enemy.y).toBe(
          FORMATION_TOP_Y +
            Math.floor(index / cols) * FORMATION_INSET_Y +
            ENEMY_HALF_HEIGHT,
        );
        expect(enemy.halfWidth).toBe(ENEMY_HALF_WIDTH);
        expect(enemy.halfHeight).toBe(ENEMY_HALF_HEIGHT);
        expect(enemy.defeated).toBe(false);
      }
      expect(state.enemies.length).toBeLessThanOrEqual(MAX_LAYOUT_ENEMIES);
    }
  });

  it("scales enemy health by durability and floors at 1", () => {
    const state = createCombatState(catalog, initContext({ durabilityFactor: 2 }));
    for (const enemy of state.enemies) {
      const definition = catalog.getEnemy(enemy.enemyId);
      expect(definition.ok).toBe(true);
      if (definition.ok) {
        expect(enemy.health).toBe(
          Math.max(1, Math.round(definition.value.baseHealth * 2)),
        );
        expect(enemy.maxHealth).toBe(enemy.health);
      }
    }
  });

  it("places one telegraphed hazard per sorted hazard ID in spread lanes", () => {
    const state = createCombatState(
      catalog,
      initContext({ hazardIds: [HAZARD_PULSE, HAZARD_SHIFT] }),
    );
    expect(state.hazards).toHaveLength(2);
    expect(state.hazards.map((hazard) => hazard.hazardId)).toEqual([
      HAZARD_PULSE,
      HAZARD_SHIFT,
    ]);
    for (const hazard of state.hazards) {
      expect(hazard.state).toBe("telegraphed");
      expect(hazard.remainingSteps).toBe(HAZARD_TELEGRAPH_STEPS);
      expect(hazard.laneX).toBeGreaterThan(0);
      expect(hazard.laneX).toBeLessThan(WORLD_WIDTH);
    }
    expect(state.hazards[0]!.laneX).toBeLessThan(state.hazards[1]!.laneX);
    expect([...state.hazards].map((h) => h.hazardId)).toEqual(
      [...state.hazards].map((h) => h.hazardId).sort(),
    );
  });

  it("rejects invalid init contexts and cap violations", () => {
    expect(() => createCombatState(catalog, initContext({ density: -1 }))).toThrow(
      RangeError,
    );
    expect(() => createCombatState(catalog, initContext({ density: 5.5 }))).toThrow(
      RangeError,
    );
    expect(() =>
      createCombatState(catalog, initContext({ durabilityFactor: 0.5 })),
    ).toThrow(RangeError);
    expect(() => createCombatState(catalog, initContext({ seed: "  " }))).toThrow(
      TypeError,
    );
    expect(() =>
      createCombatState(catalog, initContext({ contentVersion: "content-9" })),
    ).toThrow(RangeError);
    expect(() =>
      createCombatState(catalog, initContext({ density: MAX_LAYOUT_ENEMIES + 1 })),
    ).toThrow(RangeError);
    expect(() =>
      createCombatState(
        catalog,
        initContext({ hazardIds: [HAZARD_SHIFT, HAZARD_PULSE, HAZARD_SHIFT] }),
      ),
    ).toThrow(RangeError);
  });
});

describe("combat checkpoint round-trip", () => {
  it("emits the pre-launch snapshot shape exactly", () => {
    const state = createCombatState(catalog, initContext({ density: 6 }));
    const checkpoint = toCombatCheckpoint(state);

    expect(checkpoint.kind).toBe("pre_launch");
    expect(checkpoint.paddleX).toBe(WORLD_WIDTH / 2);
    expect(checkpoint.aimAngle).toBe(0);
    expect(checkpoint.ballAttached).toBe(true);
    expect(checkpoint.bossState).toBeNull();
    expect(checkpoint.skillCharges).toEqual([]);
    expect(checkpoint.enemies).toHaveLength(6);
    for (const enemy of checkpoint.enemies) {
      expect(Object.keys(enemy).sort()).toEqual([
        "defeated",
        "enemyId",
        "enemyInstanceId",
        "health",
        "stateId",
      ]);
      expect(enemy.enemyId.startsWith("enemy-")).toBe(true);
    }
    expect(checkpoint.hazards).toHaveLength(1);
    expect(checkpoint.hazards[0]!.state).toBe("telegraphed");
    expect(Object.keys(checkpoint).sort()).toEqual([
      "aimAngle",
      "ballAttached",
      "bossState",
      "enemies",
      "hazards",
      "kind",
      "paddleX",
      "skillCharges",
    ]);
  });

  it("round-trips: fromCombatCheckpoint(toCombatCheckpoint(state)) deep-equals the state", () => {
    const context = initContext({ density: 9, hazardIds: [HAZARD_SHIFT, HAZARD_PULSE] });
    const state = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(state);
    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);

    expect(rebuilt).toEqual(state);
  });

  it("rejects a checkpoint whose rows do not match the rebuilt layout", () => {
    const context = initContext({ density: 6 });
    const state = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(state);
    expect(() =>
      fromCombatCheckpoint(checkpoint, initContext({ density: 9 }), catalog),
    ).toThrow(RangeError);
  });

  it("emits loss_of_ball semantics from the room's loss ledger", () => {
    const context = initContext({ lossCount: 1 });
    const state = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(state);
    expect(checkpoint.kind).toBe("loss_of_ball");

    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
    expect(rebuilt.losses).toBe(1);
  });
});

describe("CA-01 — persistence proof via parseLivingRunRecord", () => {
  const GLITCH_KNIGHT = asContentId("class-glitch-knight");

  function runWithCheckpoint(
    checkpoint: CombatCheckpoint,
    overrides: Partial<LivingRun> = {},
  ): LivingRun {
    const base = createInitialLivingRun(catalog.contentVersion, GLITCH_KNIGHT, 4, null, {
      runId: "run-1",
      seed: "seed-1",
      now: 1_700_000_000_000,
      commitId: "commit-start",
    });
    const roomEventKey = "route:content-1:run-1:1:room:room-battle-glassway";
    const roomState = {
      roomId: `${roomEventKey}:candidate`,
      roomType: "battle",
      eventKey: roomEventKey,
      status: "ready",
      objectiveIds: [asContentId("objective-clear-glassway")],
      threatProfile: {
        budget: 12,
        durabilityFactor: 1,
        density: 6,
        formationId: asContentId("formation-glassway-columns"),
        hazardIds: [HAZARD_SHIFT],
        bossModifierIds: [],
      },
      combatCheckpoint: checkpoint,
      processedOutcomeIds: [],
      shop: null,
      recovery: null,
      boss: null,
      resolutionCommitId: null,
    } as const;
    return {
      ...base,
      phase: "room",
      routeState: null,
      rewardState: null,
      roomState: roomState as unknown as LivingRun["roomState"],
      ...overrides,
    };
  }

  it("accepts a full LivingRun carrying the produced checkpoint", () => {
    const state = createCombatState(catalog, initContext({ density: 6 }));
    const checkpoint = toCombatCheckpoint(state);
    const run = runWithCheckpoint(checkpoint);

    expect(parseLivingRunRecord(run, catalog).ok).toBe(true);
  });

  it("rejects a mutated checkpoint with duplicate enemy instance IDs", () => {
    const state = createCombatState(catalog, initContext({ density: 6 }));
    const checkpoint = toCombatCheckpoint(state);
    expect(checkpoint.enemies.length).toBeGreaterThan(1);
    const duplicated = {
      ...checkpoint,
      enemies: checkpoint.enemies.map((enemy, index) =>
        index === 1
          ? { ...enemy, enemyInstanceId: checkpoint.enemies[0]!.enemyInstanceId }
          : enemy,
      ),
    };
    const run = runWithCheckpoint(duplicated);

    const parsed = parseLivingRunRecord(run, catalog);
    expect(parsed.ok).toBe(false);
  });

});