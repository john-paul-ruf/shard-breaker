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
import {
  AIM_MAX_DEVIATION,
  MAX_SUPPORTED_BALL_SPEED,
  PADDLE_Y,
  WORLD_WIDTH,
} from "./model";
import {
  HAZARD_DEFLECT_FACTOR,
  HAZARD_PULSE_STEPS,
  PADDLE_MAX_X,
  PADDLE_MIN_X,
  launchBall,
  movePaddle,
  stepCombat,
} from "./rules";
import { outcomeIdFor } from "./results";

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

describe("combat simulation core", () => {
  function withEnemy(
    enemyOverrides: Partial<{
      enemyId: ContentId;
      behavior: "static" | "regenerating" | "phasing" | "splintering";
      behaviorParam: number;
      health: number;
      maxHealth: number;
      x: number;
      y: number;
    }> = {},
    ballOverrides: Partial<{ x: number; y: number; vx: number; vy: number }> = {},
  ) {
    const base = createCombatState(catalog, initContext({ density: 1 }));
    const enemy = base.enemies[0]!;
    return {
      ...base,
      phase: "live" as const,
      balls: [
        Object.freeze({ x: 10, y: 90, vx: 0.1, vy: -0.1, attached: false, ...ballOverrides }),
      ],
      enemies: [Object.freeze({ ...enemy, ...enemyOverrides })],
    };
  }

  it("launches only from pre-launch and clamps the aim cone", () => {
    const state = createCombatState(catalog, initContext());
    const launched = launchBall(state, Math.PI);
    expect(launched.phase).toBe("live");
    expect(launched.aimAngle).toBe(AIM_MAX_DEVIATION);
    expect(launched.balls[0]!.attached).toBe(false);
    expect(launched.balls[0]!.vy).toBeLessThan(0);
    expect(() => launchBall(launched, 0)).toThrow(RangeError);
    expect(() => launchBall(state, Number.NaN)).toThrow(RangeError);
    const left = launchBall(state, -Math.PI);
    expect(left.aimAngle).toBe(-AIM_MAX_DEVIATION);
  });

  it("clamps paddle movement to the legal band in any phase", () => {
    const state = createCombatState(catalog, initContext());
    const moved = movePaddle(state, -50);
    expect(moved.paddleX).toBe(PADDLE_MIN_X);
    const right = movePaddle(state, WORLD_WIDTH + 50);
    expect(right.paddleX).toBe(PADDLE_MAX_X);
    const live = launchBall(moved, 0);
    expect(movePaddle(live, 40).paddleX).toBe(40);
    expect(() => movePaddle(state, Number.NaN)).toThrow(RangeError);
  });

  it("keeps the attached ball riding the paddle", () => {
    const state = movePaddle(createCombatState(catalog, initContext()), 60);
    expect(state.balls[0]!.x).toBe(60);
    expect(state.balls[0]!.y).toBe(PADDLE_Y - 2);
    expect(state.balls[0]!.attached).toBe(true);
  });

  it("refuses to step a pre-launch arena and treats zero steps as a no-op", () => {
    const state = createCombatState(catalog, initContext());
    expect(() => stepCombat(state, 1)).toThrow(RangeError);
    expect(stepCombat(state, 0)).toBe(state);
  });

  it("is deterministic: same command script, same frozen state", () => {
    const script = (start: ReturnType<typeof createCombatState>) =>
      stepCombat(stepCombat(launchBall(movePaddle(start, 70), 0.3), 17), 23);
    expect(script(createCombatState(catalog, initContext()))).toEqual(
      script(createCombatState(catalog, initContext())),
    );
  });

  it("is frame-chunking equivalent on a live volley", () => {
    const start = launchBall(
      movePaddle(createCombatState(catalog, initContext({ density: 12 })), 80),
      0.2,
    );
    const oneShot = stepCombat(start, 60);
    const chunked = stepCombat(stepCombat(start, 30), 30);
    expect(chunked).toEqual(oneShot);
  });

  it("wall hits increment the counter and reflect the ball inward", () => {
    const state = createCombatState(catalog, initContext({ density: 1 }));
    const stepped = stepCombat(
      launchBall(movePaddle(state, 80), 0.5),
      240,
    );
    expect(stepped.wallHits).toBeGreaterThanOrEqual(0);
    const ball = stepped.balls[0]!;
    if (stepped.outcome === null) {
      expect(ball.x).toBeGreaterThanOrEqual(0);
      expect(ball.x).toBeLessThanOrEqual(WORLD_WIDTH);
    }
  });

  it("paddle bounce returns upfield with a cone-bounded angle", () => {
    const state = createCombatState(catalog, initContext({ density: 0 }));
    let current = launchBall(movePaddle(state, 80), 0);
    let bounced = false;
    for (let i = 0; i < 600 && !bounced; i += 1) {
      current = stepCombat(current, 1);
      const ball = current.balls[0]!;
      if (ball.vy < 0 && ball.y < PADDLE_Y && current.step > 10) {
        bounced = true;
      }
    }
    expect(bounced).toBe(true);
    const ball = current.balls[0]!;
    const deviation = Math.atan2(Math.abs(ball.vx), Math.abs(ball.vy));
    expect(deviation).toBeLessThanOrEqual(AIM_MAX_DEVIATION + 1e-9);
  });

  it("a descending ball outside the paddle span is not bounced", () => {
    const state = createCombatState(catalog, initContext({ density: 0 }));
    const offTarget = {
      ...state,
      phase: "live" as const,
      balls: [Object.freeze({ x: 120, y: 93, vx: 0, vy: 48, attached: false })],
    };
    const stepped = stepCombat(offTarget, 24);
    expect(stepped.outcome?.kind).toBe("loss_of_ball");
    expect(stepped.phase).toBe("pre_launch");
    expect(stepped.wallHits).toBe(0);
  });

  it("damages one enemy per contact and marks defeat at zero health", () => {
    const base = createCombatState(catalog, initContext({ density: 1 }));
    const enemy = base.enemies[0]!;
    const launched = launchBall(movePaddle(base, enemy.x), 0);
    let current = launched;
    for (let i = 0; i < 30; i += 1) {
      current = stepCombat(current, 60);
      if (current.enemies[0]!.health < enemy.health) break;
      if (current.outcome !== null) break;
    }
    expect(current.enemies[0]!.health).toBeLessThan(enemy.health);
    expect(current.enemies[0]!.defeated).toBe(current.enemies[0]!.health <= 0);
  });

  it("emits exactly one loss outcome and restores a pre-launch state", () => {
    const context = initContext({ density: 0, hazardIds: [] });
    const state = createCombatState(catalog, context);
    let current = launchBall(movePaddle(state, 20), 0.5);
    let sawLoss = false;
    for (let i = 0; i < 20; i += 1) {
      current = stepCombat(current, 60);
      if (current.outcome?.kind === "loss_of_ball") {
        sawLoss = true;
        break;
      }
      if (current.outcome !== null) break;
    }
    expect(sawLoss).toBe(true);
    expect(current.phase).toBe("pre_launch");
    expect(current.balls[0]!.attached).toBe(true);
    expect(current.losses).toBe(1);
    expect(current.outcome!.outcomeId).toBe(
      outcomeIdFor(context.eventKey, "loss_of_ball", 0),
    );
    expect(stepCombat(current, 60)).toBe(current);
  });

  it("emits exactly one clear outcome when the last enemy falls", () => {
    const context = initContext({ density: 1 });
    const base = createCombatState(catalog, context);
    const enemy = base.enemies[0]!;
    const basic = {
      ...base,
      enemies: [
        Object.freeze({
          ...enemy,
          enemyId: asContentId("enemy-sprite-basic"),
          behavior: "static" as const,
          behaviorParam: 0,
          health: 1,
          maxHealth: 1,
        }),
      ],
    };
    let current = launchBall(movePaddle(basic, enemy.x), 0);
    for (let i = 0; i < 30; i += 1) {
      current = stepCombat(current, 60);
      if (current.outcome !== null) break;
    }
    expect(current.outcome!.kind).toBe("clear");
    expect(current.phase).toBe("resolved");
    expect(current.outcome!.outcomeId).toBe(
      outcomeIdFor(context.eventKey, "clear", 0),
    );
    expect(stepCombat(current, 60)).toBe(current);
  });

  it("splinters on defeat into two deterministic 1-HP static children", () => {
    const base = createCombatState(catalog, initContext({ density: 1 }));
    const mitosis = base.enemies[0]!;
    const seeded = {
      ...base,
      enemies: [
        Object.freeze({
          ...mitosis,
          enemyId: asContentId("enemy-sprite-mitosis"),
          behavior: "splintering" as const,
          behaviorParam: 0,
        }),
      ],
    };
    let current = launchBall(movePaddle(seeded, mitosis.x), 0);
    let splintered = false;
    for (let i = 0; i < 30; i += 1) {
      current = stepCombat(current, 60);
      if (current.enemies.length === 2) {
        splintered = true;
        break;
      }
      if (current.outcome !== null) break;
    }
    expect(splintered).toBe(true);
    const children = current.enemies.filter(
      (enemy) => enemy.instanceId.endsWith(":a") || enemy.instanceId.endsWith(":b"),
    );
    expect(children).toHaveLength(2);
    expect(children.map((enemy) => enemy.instanceId).sort()).toEqual(
      [`${mitosis.instanceId}:a`, `${mitosis.instanceId}:b`].sort(),
    );
    for (const child of children) {
      expect(child.health).toBe(1);
      expect(child.behavior).toBe("static");
      expect(child.defeated).toBe(false);
    }
  });

  it("phasing enemies are intangible while their clock is inside the window", () => {
    const seeded = withEnemy({
      enemyId: asContentId("enemy-sprite-drifter"),
      behavior: "phasing",
      behaviorParam: 60,
    });
    const overlapping = {
      ...seeded,
      balls: [{ x: seeded.enemies[0]!.x, y: seeded.enemies[0]!.y, vx: 0.1, vy: -0.1, attached: false }],
    };
    const stepped = stepCombat(overlapping, 1);
    expect(stepped.enemies[0]!.behaviorClock).toBe(1);
    expect(stepped.enemies[0]!.health).toBe(stepped.enemies[0]!.maxHealth);
  });

  it("regenerating enemies heal one hit point per cooldown window", () => {
    const seeded = withEnemy({
      enemyId: asContentId("enemy-sprite-regen"),
      behavior: "regenerating",
      behaviorParam: 3,
      health: 1,
      maxHealth: 2,
    });
    const stepped = stepCombat(seeded, 2);
    expect(stepped.enemies[0]!.health).toBe(1);
    const healed = stepCombat(seeded, 3);
    expect(healed.enemies[0]!.health).toBe(2);
    expect(healed.enemies[0]!.behaviorClock).toBe(0);
  });

  it("no tunneling at the maximum supported ball speed", () => {
    const base = createCombatState(catalog, initContext({ density: 3 }));
    const boosted = {
      ...base,
      phase: "live" as const,
      balls: [
        Object.freeze({
          x: 80,
          y: 40,
          vx: 0,
          vy: MAX_SUPPORTED_BALL_SPEED,
          attached: false,
        }),
      ],
    };
    const stepped = stepCombat(boosted, 1);
    const live = stepped.balls[0]!;
    const overlapping = stepped.enemies.filter(
      (enemy) =>
        !enemy.defeated &&
        Math.abs(live.x - enemy.x) <= enemy.halfWidth &&
        Math.abs(live.y - enemy.y) <= enemy.halfHeight,
    );
    expect(overlapping.length).toBeLessThanOrEqual(1);
  });

  it("hazards telegraph, activate, then resolve across fixed steps", () => {
    const context = initContext({ density: 0, hazardIds: [HAZARD_SHIFT] });
    const base = createCombatState(catalog, context);
    const live = {
      ...base,
      phase: "live" as const,
      balls: [Object.freeze({ x: 80, y: 50, vx: 0.1, vy: -0.1, attached: false })],
    };
    const tele = stepCombat(live, HAZARD_TELEGRAPH_STEPS - 1);
    expect(tele.hazards[0]!.state).toBe("telegraphed");
    const active = stepCombat(live, HAZARD_TELEGRAPH_STEPS);
    expect(active.hazards[0]!.state).toBe("active");
    const resolved = stepCombat(active, HAZARD_PULSE_STEPS);
    expect(resolved.hazards[0]!.state).toBe("resolved");
  });

  it("bends the ball once on entering an active hazard lane at preserved speed", () => {
    const context = initContext({ density: 0, hazardIds: [HAZARD_SHIFT] });
    const base = createCombatState(catalog, context);
    const laneX = base.hazards[0]!.laneX;
    const entry = {
      ...base,
      phase: "live" as const,
      hazards: [
        Object.freeze({ ...base.hazards[0]!, state: "active" as const, remainingSteps: 0 }),
      ],
      balls: [
        Object.freeze({
          x: laneX - 10,
          y: 50,
          vx: 24,
          vy: -Math.sqrt(48 * 48 - 24 * 24),
          attached: false,
        }),
      ],
    };
    const before = stepCombat(entry, 9);
    expect(before.balls[0]!.vx).toBeCloseTo(24, 9);
    const bent = stepCombat(before, 1);
    const ball = bent.balls[0]!;
    expect(ball.vx).toBeCloseTo(24 * HAZARD_DEFLECT_FACTOR, 6);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(48, 6);
  });
});