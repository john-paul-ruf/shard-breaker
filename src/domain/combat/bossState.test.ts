import { describe, expect, it } from "vitest";

import { createContentCatalog } from "../content/catalog";
import type { ContentId } from "../content/catalog";
import { BOSS_DEFINITIONS } from "../content/bosses";
import { deriveStream } from "../random/seededRng";
import { createCombatState } from "./layout";
import type { CombatState } from "./model";
import { launchBall, movePaddle, stepCombat } from "./rules";
import {
  BOSS_SWEEP_HALF_WIDTH_BASE,
  BOSS_SWEEP_MAX_COVERAGE,
  BOSS_SWEEP_MAX_HALF_WIDTH,
  BOSS_TELEGRAPH_MIN_STEPS,
  WIDENED_SWEEP_WIDTH_FACTOR,
  applyBossModifiers,
  bossCoreIdFor,
  bossCountdownSeconds,
  bossNodeIdFor,
  bossSweepIdFor,
  createBossCombatState,
  deriveBossProjection,
  stepBoss,
} from "./bossState";
import type { BossCombatInitContext } from "./bossState";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const WARDEN = asContentId("boss-warden");
const EVENT_KEY = "route:content-1:run-1:3:room:room-boss-mandatory";

function initContext(
  overrides: Partial<BossCombatInitContext> = {},
): BossCombatInitContext {
  return {
    seed: "seed-boss-1",
    contentVersion: "content-1",
    roomId: `${EVENT_KEY}:candidate`,
    eventKey: EVENT_KEY,
    formationId: asContentId("room-boss-mandatory"),
    density: 6,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [],
    archetypeId: WARDEN,
    modifierIds: [],
    ...overrides,
  };
}

function liveArena(state: CombatState, paddleX = 80): CombatState {
  return launchBall(movePaddle(state, paddleX), 0.2);
}

describe("boss arena composition", () => {
  it("materializes the routed anatomy, formation rows, and sweep lanes", () => {
    const runtime = createBossCombatState(catalog, initContext());

    const enemies = runtime.arena.enemies;
    expect(enemies.filter((enemy) => enemy.enemyId === WARDEN).length).toBe(4);
    expect(
      enemies.filter((enemy) =>
        enemy.instanceId.startsWith(`${EVENT_KEY}:boss:node:`),
      ),
    ).toHaveLength(3);
    expect(
      enemies.some((enemy) => enemy.instanceId === bossCoreIdFor(EVENT_KEY)),
    ).toBe(true);
    expect(runtime.arena.hazards).toHaveLength(2);
    expect(runtime.arena.hazards.every((hazard) => hazard.laneX > 0)).toBe(true);
    expect(Object.isFrozen(runtime.arena)).toBe(true);
  });

  it("is deterministic and seed-sensitive through the boss-layout stream", () => {
    expect(createBossCombatState(catalog, initContext())).toEqual(
      createBossCombatState(catalog, initContext()),
    );
    const base = createBossCombatState(catalog, initContext());
    const other = createBossCombatState(catalog, initContext({ seed: "seed-2" }));
    // Anatomy and lane structure match; only the shuffled lane order (and so
    // the earliest projected telegraph and its countdown) may differ.
    expect(other.arena.enemies.map((enemy) => enemy.instanceId)).toEqual(
      base.arena.enemies.map((enemy) => enemy.instanceId),
    );
    expect(other.arena.hazards).toHaveLength(base.arena.hazards.length);
    expect(other.arena).not.toEqual(base.arena);
  });

  it("chains sweep lanes by deriving their window order from the layout stream", () => {
    const runtime = createBossCombatState(catalog, initContext());
    const layoutRng = deriveStream(
      "seed-boss-1",
      catalog.contentVersion,
      `${EVENT_KEY}:boss-layout`,
    );
    const expectedOrder = layoutRng.shuffle(
      BOSS_DEFINITIONS.find((boss) => boss.id === WARDEN)!.telegraphs,
    );
    expect(
      runtime.arena.hazards.map((hazard) => hazard.instanceId),
    ).toEqual(
      expectedOrder.map((_telegraph, index) => bossSweepIdFor(EVENT_KEY, index)),
    );
    const [first, second] = runtime.arena.hazards;
    expect(second!.remainingSteps).toBeGreaterThan(first!.remainingSteps);
  });

  it("fails closed on an unknown archetype and on a foreign base arena", () => {
    expect(() =>
      createBossCombatState(
        catalog,
        initContext({ archetypeId: asContentId("boss-unknown") }),
      ),
    ).toThrow(RangeError);
    const foreign = createCombatState(
      catalog,
      initContext({ eventKey: "route:content-1:run-1:3:room:other" }),
    );
    expect(() => createBossCombatState(catalog, initContext(), foreign)).toThrow(
      RangeError,
    );
  });

  it("caps total sweep coverage below half the field", () => {
    const runtime = createBossCombatState(
      catalog,
      initContext({
        modifierIds: [
          asContentId("boss-modifier-split-lane"),
          asContentId("boss-modifier-widened-sweep"),
        ],
      }),
    );
    const coverage =
      runtime.arena.hazards.reduce(
        (total, hazard) => total + hazard.halfWidth * 2,
        0,
      ) / 160;
    expect(runtime.arena.hazards).toHaveLength(3);
    expect(coverage).toBeLessThanOrEqual(BOSS_SWEEP_MAX_COVERAGE);
    expect(
      runtime.arena.hazards.every(
        (hazard) => hazard.halfWidth <= BOSS_SWEEP_MAX_HALF_WIDTH,
      ),
    ).toBe(true);
  });
});

describe("boss modifier application (CA-11/CA-12 mechanics)", () => {
  it("applies compatible modifiers through the capped-effect registry", () => {
    const warden = catalog.getBoss(WARDEN);
    expect(warden.ok).toBe(true);
    if (!warden.ok) return;
    const resolution = applyBossModifiers(warden.value, [
      asContentId("boss-modifier-split-lane"),
      asContentId("boss-modifier-arc-saturation"),
    ]);
    expect(resolution.ignored).toEqual([]);
    expect(resolution.applied.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-split-lane",
      "boss-modifier-arc-saturation",
    ]);
  });

  it("ignores a second lane-adding modifier once the sweep-lane cap is reached", () => {
    const broodmother = catalog.getBoss(asContentId("boss-broodmother"));
    expect(broodmother.ok).toBe(true);
    if (!broodmother.ok) return;
    const resolution = applyBossModifiers(broodmother.value, [
      asContentId("boss-modifier-split-lane"),
      asContentId("boss-modifier-twin-brood"),
    ]);
    expect(resolution.applied.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-split-lane",
    ]);
    expect(resolution.ignored).toEqual([
      {
        modifierId: "boss-modifier-twin-brood",
        reason: "modifier-cap-reached",
      },
    ]);
  });

  it("fails closed on unknown, incompatible, and duplicated IDs", () => {
    const warden = catalog.getBoss(WARDEN);
    expect(warden.ok).toBe(true);
    if (!warden.ok) return;
    const resolution = applyBossModifiers(warden.value, [
      asContentId("boss-modifier-unknown"),
      asContentId("boss-modifier-twin-brood"),
      asContentId("boss-modifier-split-lane"),
      asContentId("boss-modifier-split-lane"),
    ]);
    expect(resolution.applied.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-split-lane",
    ]);
    expect(resolution.ignored).toEqual([
      {
        modifierId: "boss-modifier-unknown",
        reason: "unknown-modifier",
      },
      {
        modifierId: "boss-modifier-twin-brood",
        reason: "incompatible-with-archetype",
      },
      {
        modifierId: "boss-modifier-split-lane",
        reason: "duplicate-modifier",
      },
    ]);
  });

  it("never shortens a telegraph below the bounded minimum window", () => {
    const runtime = createBossCombatState(
      catalog,
      initContext({ modifierIds: [asContentId("boss-modifier-arc-saturation")] }),
    );
    for (const hazard of runtime.arena.hazards) {
      expect(hazard.remainingSteps).toBeGreaterThanOrEqual(
        BOSS_TELEGRAPH_MIN_STEPS,
      );
    }
  });
});

describe("boss phase projection", () => {
  it("projects phase one at full core health with the authored condition", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    expect(runtime.projection.phaseIndex).toBe(0);
    expect(runtime.projection.phaseId).toBe("lock");
    expect(runtime.projection.transitionCondition).toBe("Outer node breaks");
    expect(runtime.projection.health).toBe(runtime.projection.maxHealth);
    expect(runtime.projection.defeated).toBe(false);
  });

  it("advances the phase exactly when the core crosses the authored threshold", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    const arena = runtime.arena;
    const core = arena.enemies.find(
      (enemy) => enemy.instanceId === bossCoreIdFor(EVENT_KEY),
    )!;
    const below = {
      ...arena,
      enemies: arena.enemies.map((enemy) =>
        enemy === core
          ? { ...enemy, health: Math.floor(core.maxHealth * 0.7) }
          : enemy,
      ),
    };
    const projection = deriveBossProjection(runtime.definition, below);
    expect(projection.phaseId).toBe("split");
    expect(projection.transitionCondition).toBe(
      "Warden falls below 70% integrity",
    );
  });

  it("derives a step-counted telegraph countdown and counterplay from the arena", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    const telegraph = runtime.projection.telegraph;
    expect(telegraph).not.toBeNull();
    if (telegraph === null) return;
    expect(telegraph.state).toBe("telegraphed");
    expect(telegraph.remainingSteps).toBeGreaterThan(0);
    expect(telegraph.counterplay.length).toBeGreaterThan(0);
    expect(bossCountdownSeconds(telegraph.remainingSteps)).toMatch(/^\d+\.\d$/);
    expect(Number(bossCountdownSeconds(telegraph.remainingSteps))).toBeGreaterThan(0);
  });

  it("keeps the projection deterministic in the volley state alone", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    const stepped = stepCombat(liveArena(runtime.arena), 30);
    expect(deriveBossProjection(runtime.definition, stepped)).toEqual(
      deriveBossProjection(runtime.definition, stepped),
    );
  });

  it("reports broken shield nodes through the bounded counter row", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    const node = runtime.arena.enemies.find((enemy) =>
      enemy.instanceId.startsWith(`${EVENT_KEY}:boss:node:0`),
    )!;
    const damaged = {
      ...runtime.arena,
      enemies: runtime.arena.enemies.map((enemy) =>
        enemy === node ? { ...enemy, defeated: true, health: 0 } : enemy,
      ),
    };
    const projection = deriveBossProjection(runtime.definition, damaged);
    expect(projection.counters).toHaveLength(1);
    expect(projection.counters[0]!.counterId).toBe(
      `${EVENT_KEY}:boss:nodes-broken`,
    );
    expect(projection.counters[0]!.value).toBe(1);
  });
});

describe("boss volley integration", () => {
  it("steps the composed arena through S01's loop without residue", () => {
    const runtime = createBossCombatState(catalog, initContext());
    const stepped = stepBoss(runtime, liveArena(runtime.arena), 60);
    expect(stepped.arena.step).toBe(60);
    expect(stepped.arena.phase).toBe("live");
    expect(Object.isFrozen(stepped.arena)).toBe(true);
    const direct = stepCombat(liveArena(runtime.arena), 60);
    expect(stepped.arena).toEqual(direct);
  });

  it("freezes the projection when the volley has ended (no further steps)", () => {
    const runtime = createBossCombatState(catalog, initContext({ density: 0 }));
    const ended: CombatState = {
      ...runtime.arena,
      phase: "resolved" as const,
      outcome: {
        kind: "clear" as const,
        outcomeId: `${EVENT_KEY}:outcome:clear:0`,
      },
    };
    expect(stepBoss(runtime, ended, 10).arena).toBe(ended);
  });

  it("drives a composed boss volley through a real node hit", () => {
    const runtime = createBossCombatState(catalog, initContext());
    const node = runtime.arena.enemies.find((enemy) =>
      enemy.instanceId.startsWith(`${EVENT_KEY}:boss:node:`),
    )!;
    let current = launchBall(movePaddle(runtime.arena, node.x), 0);
    let damaged = false;
    for (let index = 0; index < 40 && !damaged; index += 1) {
      current = stepCombat(current, 30);
      damaged = current.enemies.some(
        (enemy) =>
          enemy.instanceId === node.instanceId && enemy.health < node.health,
      );
    }
    expect(damaged).toBe(true);
    const projection = deriveBossProjection(runtime.definition, current);
    // The node row took the hit; the core (the projection's health) is untouched.
    expect(
      current.enemies.find((enemy) => enemy.instanceId === node.instanceId)!.health,
    ).toBeLessThan(node.health);
    expect(projection.health).toBe(projection.maxHealth);
    expect(projection.counters[0]!.value).toBe(0);
  });

  it("identifies node rows by their composed instance IDs", () => {
    for (const index of [0, 1, 2]) {
      expect(bossNodeIdFor(EVENT_KEY, index)).toBe(
        `${EVENT_KEY}:boss:node:${String(index)}`,
      );
    }
  });
});

describe("boss modifier application through composition (CA-12)", () => {
  it("renders each archetype's authored modifier as an observable arena effect", () => {
    // Warden: widened sweep widens every lane to the width cap.
    const warden = createBossCombatState(
      catalog,
      initContext({ modifierIds: [asContentId("boss-modifier-widened-sweep")] }),
    );
    expect(warden.appliedModifiers.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-widened-sweep",
    ]);
    const widenedHalfWidth = Math.min(
      BOSS_SWEEP_MAX_HALF_WIDTH,
      Math.round(BOSS_SWEEP_HALF_WIDTH_BASE * WIDENED_SWEEP_WIDTH_FACTOR),
    );
    expect(
      warden.arena.hazards.every((hazard) => hazard.halfWidth === widenedHalfWidth),
    ).toBe(true);

    // Broodmother: twin brood adds one lane inside the cap.
    const broodmother = createBossCombatState(
      catalog,
      initContext({
        archetypeId: asContentId("boss-broodmother"),
        modifierIds: [asContentId("boss-modifier-twin-brood")],
      }),
    );
    expect(broodmother.arena.hazards).toHaveLength(3);

    // Null Architect: denied band adds one lane inside the cap.
    const architect = createBossCombatState(
      catalog,
      initContext({
        archetypeId: asContentId("boss-null-architect"),
        modifierIds: [asContentId("boss-modifier-denied-band")],
      }),
    );
    expect(architect.arena.hazards).toHaveLength(3);

    // Leech: siphon lane widens like the warden's sweep.
    const leech = createBossCombatState(
      catalog,
      initContext({
        archetypeId: asContentId("boss-leech"),
        modifierIds: [asContentId("boss-modifier-siphon-lane")],
      }),
    );
    expect(leech.appliedModifiers.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-siphon-lane",
    ]);
    expect(
      leech.arena.hazards.every((hazard) => hazard.halfWidth === widenedHalfWidth),
    ).toBe(true);
  });

  it("shortens telegraph windows within the bounded floor (arc saturation)", () => {
    const plain = createBossCombatState(catalog, initContext());
    const saturated = createBossCombatState(
      catalog,
      initContext({ modifierIds: [asContentId("boss-modifier-arc-saturation")] }),
    );
    const plainFirst = plain.arena.hazards[0]!;
    const saturatedFirst = saturated.arena.hazards[0]!;
    expect(saturatedFirst.remainingSteps).toBeLessThan(plainFirst.remainingSteps);
    expect(saturatedFirst.remainingSteps).toBeGreaterThanOrEqual(
      BOSS_TELEGRAPH_MIN_STEPS,
    );
  });

  it("ignores unknown, incompatible, and duplicated IDs through composition without throwing", () => {
    const runtime = createBossCombatState(
      catalog,
      initContext({
        modifierIds: [
          asContentId("boss-modifier-unknown"),
          asContentId("boss-modifier-twin-brood"),
          asContentId("boss-modifier-split-lane"),
          asContentId("boss-modifier-split-lane"),
        ],
      }),
    );
    expect(runtime.ignoredModifiers).toEqual([
      { modifierId: "boss-modifier-unknown", reason: "unknown-modifier" },
      {
        modifierId: "boss-modifier-twin-brood",
        reason: "incompatible-with-archetype",
      },
      { modifierId: "boss-modifier-split-lane", reason: "duplicate-modifier" },
    ]);
    expect(runtime.appliedModifiers.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-split-lane",
    ]);
    // The surviving modifier still shaped the arena.
    expect(runtime.arena.hazards).toHaveLength(3);
  });

  it("honors the sweep-lane cap through composition", () => {
    const runtime = createBossCombatState(
      catalog,
      initContext({
        archetypeId: asContentId("boss-broodmother"),
        modifierIds: [
          asContentId("boss-modifier-split-lane"),
          asContentId("boss-modifier-twin-brood"),
        ],
      }),
    );
    expect(runtime.arena.hazards).toHaveLength(3);
    expect(runtime.ignoredModifiers).toEqual([
      { modifierId: "boss-modifier-twin-brood", reason: "modifier-cap-reached" },
    ]);
  });

  it("keeps the volley simulable on a modifier-composed arena", () => {
    const runtime = createBossCombatState(
      catalog,
      initContext({ modifierIds: [asContentId("boss-modifier-arc-saturation")] }),
    );
    const stepped = stepBoss(runtime, liveArena(runtime.arena), 30);
    expect(stepped.arena.step).toBe(30);
    expect(stepped.arena.phase).toBe("live");
    expect(stepped.projection.telegraph).not.toBeNull();
  });

  it("treats stored modifier IDs as untrusted data (fail closed, never throw)", () => {
    // A stored/imported payload may hold unknown, stale, or repeated IDs.
    const storedIds = [
      "boss-modifier-arc-saturation",
      "boss-modifier-stale-from-storage",
      "boss-modifier-split-lane",
      "boss-modifier-arc-saturation",
    ].map(asContentId);
    const runtime = createBossCombatState(
      catalog,
      initContext({ modifierIds: storedIds }),
    );
    expect(runtime.appliedModifiers.map((entry) => entry.modifierId)).toEqual([
      "boss-modifier-arc-saturation",
      "boss-modifier-split-lane",
    ]);
    expect(runtime.ignoredModifiers).toEqual([
      {
        modifierId: "boss-modifier-stale-from-storage",
        reason: "unknown-modifier",
      },
      {
        modifierId: "boss-modifier-arc-saturation",
        reason: "duplicate-modifier",
      },
    ]);
  });
});
