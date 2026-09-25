import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import { createCombatState, fromCombatCheckpoint, toCombatCheckpoint } from "./layout";
import type { BossCombatInitContext } from "./bossState";
import { bossSweepIdFor, createBossCombatState } from "./bossState";
import type { CombatInitContext } from "./model";
import { FORMATION_TOP_Y } from "./layout";
import { WORLD_WIDTH } from "./model";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const WARDEN = asContentId("boss-warden");
const EVENT_KEY = "route:content-1:run-layout:6:room:room-boss-mandatory";

function baseContext(
  overrides: Partial<CombatInitContext> = {},
): CombatInitContext {
  return {
    seed: "seed-layout-1",
    contentVersion: "content-1",
    roomId: `${EVENT_KEY}:candidate`,
    eventKey: EVENT_KEY,
    formationId: asContentId("room-boss-mandatory"),
    density: 6,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [],
    ...overrides,
  };
}

function bossContext(
  overrides: Partial<BossCombatInitContext> = {},
): BossCombatInitContext {
  return {
    ...baseContext({ density: 0 }),
    archetypeId: WARDEN,
    modifierIds: [],
    ...overrides,
  };
}

describe("layout context — boss composition passthrough", () => {
  it("accepts the boss context extension and keeps the base arena invariant to boss fields", () => {
    const plain = createCombatState(catalog, baseContext({ density: 0 }));
    const extended = createCombatState(
      catalog,
      bossContext({
        modifierIds: [asContentId("boss-modifier-split-lane")],
      }),
    );

    // The base arena is modifier-independent: modifier effects compose in the
    // boss layer on top of this arena, so rebuilds and replays stay stable.
    expect(extended).toEqual(plain);
  });

  it("round-trips a boss room's durable base arena through the persisted checkpoint", () => {
    const context = baseContext({ density: 10 });
    const state = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(state);
    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);

    expect(rebuilt).toEqual(state);
    // Density 10 holds two formation rows (5 columns): the boss-room cap that
    // keeps S05's composed anatomy above the paddle.
    expect(state.enemies).toHaveLength(10);
    const rowYs = new Set(state.enemies.map((enemy) => enemy.y));
    expect(rowYs.size).toBe(2);
    for (const y of rowYs) {
      expect(y).toBeLessThanOrEqual(FORMATION_TOP_Y + 28 + 4);
    }
  });

  it("keeps base hazard instance IDs disjoint from composed boss sweep-lane IDs", () => {
    const context = baseContext({
      density: 0,
      hazardIds: [asContentId("hazard-shift-lane")],
    });
    const runtime = createBossCombatState(
      catalog,
      bossContext({
        hazardIds: context.hazardIds,
        modifierIds: [asContentId("boss-modifier-split-lane")],
      }),
    );

    const baseIds = runtime.arena.hazards
      .filter((hazard) => hazard.instanceId.startsWith(`${EVENT_KEY}:hazard:`))
      .map((hazard) => hazard.instanceId);
    const sweepIds = runtime.arena.hazards
      .filter((hazard) => hazard.instanceId.startsWith(`${EVENT_KEY}:boss:hazard:`))
      .map((hazard) => hazard.instanceId);
    expect(baseIds).toHaveLength(1);
    expect(sweepIds).toHaveLength(3);
    expect(bossSweepIdFor(EVENT_KEY, 0)).not.toBe(baseIds[0]);
    expect(new Set(runtime.arena.hazards.map((hazard) => hazard.instanceId)).size).toBe(
      runtime.arena.hazards.length,
    );
    // Lane geometry still spreads inside the formation span.
    for (const hazard of runtime.arena.hazards) {
      expect(hazard.laneX).toBeGreaterThan(0);
      expect(hazard.laneX).toBeLessThan(WORLD_WIDTH);
    }
  });
});