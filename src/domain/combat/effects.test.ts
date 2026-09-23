import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import type { EffectParam, SkillChargeSnapshot } from "../run/model";
import {
  MAX_BALL_SPEED_FACTOR,
  NEUTRAL_EFFECTS,
  resolveEffects,
  resolveVolleyEffects,
} from "./effects";
import { createCombatState } from "./layout";
import type { CombatInitContext } from "./model";
import { AIM_MAX_DEVIATION } from "./model";
import { HAZARD_DEFLECT_FACTOR, launchBall, movePaddle, stepCombat } from "./rules";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const HAZARD_SHIFT = asContentId("hazard-shift-lane");

const param = (key: string, value: number): EffectParam =>
  Object.freeze({ key, value });

const buildWith = (...equipmentIds: string[]) => ({
  activeSkillIds: [] as ContentId[],
  passiveEquipmentIds: equipmentIds.map(asContentId),
  carryOverRelicId: null,
});

describe("resolveEffects — enhancement params", () => {
  it("returns the neutral snapshot for an empty build with no rolled params", () => {
    expect(resolveEffects(catalog, buildWith(), [])).toEqual(NEUTRAL_EFFECTS);
  });

  it("maps rolled pierce to both damage bonus and pierce layers", () => {
    const snapshot = resolveEffects(catalog, buildWith(), [param("pierce", 2)]);
    expect(snapshot.ballDamageBonus).toBe(2);
    expect(snapshot.pierceLayers).toBe(2);
    expect(snapshot.impactForceBonus).toBe(0);
  });

  it("maps rolled momentum to damage only", () => {
    const snapshot = resolveEffects(catalog, buildWith(), [param("momentum", 3)]);
    expect(snapshot.ballDamageBonus).toBe(3);
    expect(snapshot.pierceLayers).toBe(0);
  });

  it("maps rolled amplitude to impact force", () => {
    const snapshot = resolveEffects(catalog, buildWith(), [param("amplitude", 4)]);
    expect(snapshot.impactForceBonus).toBe(4);
    expect(snapshot.ballDamageBonus).toBe(0);
  });

  it("maps rolled hazard-shield to hazard-step reduction", () => {
    const snapshot = resolveEffects(
      catalog,
      buildWith(),
      [param("hazard-shield", 4)],
    );
    expect(snapshot.hazardStepReduction).toBe(4);
  });

  it("maps rolled bonus-charges to extra charges", () => {
    const snapshot = resolveEffects(catalog, buildWith(), [
      param("bonus-charges", 2),
    ]);
    expect(snapshot.extraCharges).toBe(2);
  });

  it("adds independent enhancement contributions", () => {
    const snapshot = resolveEffects(
      catalog,
      buildWith(),
      [param("pierce", 1), param("momentum", 2), param("amplitude", 4)],
    );
    expect(snapshot.ballDamageBonus).toBe(3);
    expect(snapshot.pierceLayers).toBe(1);
    expect(snapshot.impactForceBonus).toBe(4);
  });

  it("ignores unknown keys and non-numeric values without throwing", () => {
    const snapshot = resolveEffects(catalog, buildWith(), [
      param("unknown-key", 9),
      { key: "pierce", value: "not-a-number" },
    ]);
    expect(snapshot).toEqual(NEUTRAL_EFFECTS);
  });

  it("ignores presentational-only keys", () => {
    const snapshot = resolveEffects(
      catalog,
      buildWith(),
      [
        param("primed", 2),
        param("charge-persistence", 1),
        param("haste", 4),
        param("echo", 1),
        param("stability", 3),
        param("quick-recharge", 2),
        param("focus", 1),
        param("cleanup", 2),
        param("anchor", 4),
      ],
    );
    expect(snapshot).toEqual(NEUTRAL_EFFECTS);
  });
});

describe("resolveEffects — equipment", () => {
  it("maps Soft Patch to one softened hazard step", () => {
    const snapshot = resolveEffects(catalog, buildWith("equipment-soft-patch"), []);
    expect(snapshot.hazardStepReduction).toBe(1);
  });

  it("maps Fractal Core to a one-per-wall-hit currency rate", () => {
    const snapshot = resolveEffects(catalog, buildWith("equipment-fractal-core"), []);
    expect(snapshot.wallHitCurrencyRate).toBe(1);
  });

  it("stacks equipment with rolled enhancement contributions", () => {
    const snapshot = resolveEffects(catalog, buildWith("equipment-soft-patch"), [
      param("hazard-shield", 2),
    ]);
    expect(snapshot.hazardStepReduction).toBe(3);
  });

  it("fails closed on unknown equipment IDs", () => {
    const snapshot = resolveEffects(
      catalog,
      buildWith("equipment-unknown", "equipment-fractal-core"),
      [],
    );
    expect(snapshot.wallHitCurrencyRate).toBe(1);
  });

  it("ignores presentational equipment keys", () => {
    const snapshot = resolveEffects(
      catalog,
      buildWith(
        "equipment-arc-coil",
        "equipment-static-ward",
        "equipment-mirror-plating",
        "equipment-power-cell",
      ),
      [],
    );
    expect(snapshot).toEqual(NEUTRAL_EFFECTS);
  });
});

describe("resolveVolleyEffects — spent skills", () => {
  const charge = (
    skillId: string,
    remaining: number,
    maximum: number,
  ): SkillChargeSnapshot =>
    Object.freeze({
      skillId: asContentId(skillId),
      remaining,
      maximum,
    });

  it("returns the build snapshot while every skill is unspent", () => {
    const build = buildWith();
    expect(
      resolveVolleyEffects(catalog, build, [], [charge("skill-overclock", 1, 1)]),
    ).toEqual(resolveEffects(catalog, build, []));
  });

  it("speeds the launch when an Overclock charge was spent", () => {
    const snapshot = resolveVolleyEffects(
      catalog,
      buildWith(),
      [],
      [charge("skill-overclock", 0, 1)],
    );
    expect(snapshot.ballSpeedFactor).toBe(1.25);
  });

  it("adds impact force when a Shield Bash charge was spent", () => {
    const snapshot = resolveVolleyEffects(
      catalog,
      buildWith(),
      [],
      [charge("skill-shield-bash", 1, 2)],
    );
    expect(snapshot.impactForceBonus).toBe(1);
  });

  it("widens paddle bounces when a Rebound Lens charge was spent", () => {
    const snapshot = resolveVolleyEffects(
      catalog,
      buildWith(),
      [],
      [charge("skill-rebound-lens", 0, 2)],
    );
    expect(snapshot.reboundWidenFactor).toBe(1.5);
  });

  it("caps the speed factor at the authored ceiling", () => {
    const snapshot = resolveVolleyEffects(
      catalog,
      buildWith(),
      [],
      [
        charge("skill-overclock", 0, 1),
        charge("skill-cascade", 1, 2),
      ],
    );
    expect(snapshot.ballSpeedFactor).toBe(MAX_BALL_SPEED_FACTOR);
  });

  it("ignores unknown skills and never throws", () => {
    const snapshot = resolveVolleyEffects(
      catalog,
      buildWith(),
      [],
      [charge("skill-unknown", 0, 1)],
    );
    expect(snapshot).toEqual(resolveEffects(catalog, buildWith(), []));
  });
});

describe("effect consumption inside the simulation", () => {
  function initContext(
    overrides: Partial<CombatInitContext> = {},
  ): CombatInitContext {
    return {
      seed: "seed-effects",
      contentVersion: "content-1",
      roomId: "room-effects",
      eventKey: "route:content-1:run-1:1:room:room-battle-glassway",
      formationId: asContentId("room-battle-glassway"),
      density: 1,
      durabilityFactor: 1,
      lossCount: 0,
      hazardIds: [],
      ...overrides,
    };
  }

  it("scales the launch speed by the snapshot's ballSpeedFactor", () => {
    const state = createCombatState(catalog, initContext());
    const neutral = launchBall(state, 0);
    const boosted = launchBall(
      state,
      0,
      { ...NEUTRAL_EFFECTS, ballSpeedFactor: 1.25 },
    );
    expect(Math.hypot(boosted.balls[0]!.vx, boosted.balls[0]!.vy)).toBeCloseTo(
      Math.hypot(neutral.balls[0]!.vx, neutral.balls[0]!.vy) * 1.25,
      9,
    );
  });

  it("softens the hazard bend with hazardStepReduction", () => {
    const context = initContext({ density: 0, hazardIds: [HAZARD_SHIFT] });
    const state = createCombatState(catalog, context);
    const laneX = state.hazards[0]!.laneX;
    const entry = {
      ...state,
      phase: "live" as const,
      hazards: [
        Object.freeze({
          ...state.hazards[0]!,
          state: "active" as const,
          remainingSteps: 0,
        }),
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
    const softened = stepCombat(entry, 10, {
      ...NEUTRAL_EFFECTS,
      hazardStepReduction: 0.5,
    });
    const ball = softened.balls[0]!;
    // factor 1.5 / (1 + 0.5) = 1.0 → the straight path is preserved
    expect(ball.vx).toBeCloseTo(24, 6);
    expect(Math.hypot(ball.vx, ball.vy)).toBeCloseTo(48, 6);
  });

  it("deals extra impact force per hit", () => {
    const state = createCombatState(catalog, initContext({ density: 1 }));
    const enemy = state.enemies[0]!;
    const seeded = {
      ...state,
      enemies: [
        Object.freeze({
          ...enemy,
          enemyId: asContentId("enemy-sprite-basic"),
          behavior: "static" as const,
          behaviorParam: 0,
          health: 5,
          maxHealth: 5,
        }),
      ],
    };
    const live = launchBall(movePaddle(seeded, enemy.x), 0);
    const neutral = stepCombat(live, 300);
    expect(neutral.enemies[0]!.health).toBe(4);
    const forced = stepCombat(live, 300, {
      ...NEUTRAL_EFFECTS,
      impactForceBonus: 3,
    });
    expect(forced.enemies[0]!.health).toBe(1);
    expect(forced.enemies[0]!.defeated).toBe(false);
  });

  it("lets the ball pierce through a struck enemy to a second target", () => {
    const state = createCombatState(catalog, initContext({ density: 2 }));
    const [first, second] = [state.enemies[0]!, state.enemies[1]!];
    const staticRow = (row: typeof first, y: number) =>
      Object.freeze({
        ...row,
        enemyId: asContentId("enemy-sprite-basic"),
        behavior: "static" as const,
        behaviorParam: 0,
        health: 1,
        maxHealth: 1,
        x: 40,
        y,
      });
    const seeded = {
      ...state,
      // Same column, stacked rows: an ascending ball meets the lower one first.
      enemies: [staticRow(first, 48), staticRow(second, 20)],
    };
    const live = launchBall(movePaddle(seeded, 40), 0);
    const pierced = stepCombat(live, 300, {
      ...NEUTRAL_EFFECTS,
      pierceLayers: 1,
    });
    expect(pierced.enemies.every((enemy) => enemy.defeated)).toBe(true);
    const deflected = stepCombat(live, 300);
    expect(deflected.enemies.every((enemy) => enemy.defeated)).toBe(false);
  });

  it("widens paddle bounces with reboundWidenFactor inside the aim cone", () => {
    const state = createCombatState(catalog, initContext({ density: 0 }));
    const offset = 8;
    const live = {
      ...state,
      phase: "live" as const,
      balls: [
        Object.freeze({
          x: state.paddleX + offset,
          y: 92,
          vx: 0,
          vy: 48,
          attached: false,
        }),
      ],
    };
    const widened = stepCombat(live, 8, {
      ...NEUTRAL_EFFECTS,
      reboundWidenFactor: 1.5,
    });
    const ball = widened.balls[0]!;
    const deviation = Math.atan2(Math.abs(ball.vx), Math.abs(ball.vy));
    expect(deviation).toBeCloseTo(
      (offset / 15) * AIM_MAX_DEVIATION * 1.5,
      9,
    );
    expect(deviation).toBeLessThanOrEqual(AIM_MAX_DEVIATION + 1e-9);
  });

  it("reproduces the neutral simulation exactly with an empty snapshot", () => {
    const context = initContext({ density: 6 });
    const state = launchBall(movePaddle(createCombatState(catalog, context), 70), 0.3);
    expect(stepCombat(state, 40, NEUTRAL_EFFECTS)).toEqual(stepCombat(state, 40));
    expect(HAZARD_DEFLECT_FACTOR).toBe(1.5);
  });
});