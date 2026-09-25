import { describe, expect, it } from "vitest";

import type {
  ContentId,
  ContentVersion,
} from "../content/catalog";
import { CONTENT_VERSION, createContentCatalog } from "../content/catalog";
import type { LivingRun } from "../run/model";
import { createInitialLivingRun } from "../run/model";
import { parseLivingRunRecord } from "../../persistence/validation";
import type { RoomType } from "../content/rooms";
import {
  BOSS_ROOM_MAX_DENSITY,
  MAX_BOSS_MODIFIERS,
  SHOP_PRICE_CAP,
  THREAT_LIMITS,
  generateRewardDraft,
  generateRoomCandidate,
  generateRouteOptions,
  generateShopInventory,
  generateThreatProfile,
} from "./generators";
import type {
  GeneratedRewardCard,
  GeneratedRouteOffer,
  RewardGenerationContext,
  RoomGenerationContext,
  RouteGenerationContext,
  ShopGenerationContext,
  ThreatGenerationContext,
} from "./generators";
import { deriveStream } from "./seededRng";

const catalog = createContentCatalog();
const highBossDepth = Number.MAX_SAFE_INTEGER - 1;

const cycleForDepth = (depth: number): number =>
  Math.floor((depth - 1) / 3) + 1;

function routeContext(
  seed: string,
  depth = 1,
  overrides: Partial<RouteGenerationContext> = {},
): RouteGenerationContext {
  return {
    seed,
    contentVersion: CONTENT_VERSION,
    runId: "run-generation-test",
    depth,
    cycle: cycleForDepth(depth),
    integrityCurrent: 3,
    integrityMax: 3,
    runCurrency: 0,
    routeEventKey: `route:${CONTENT_VERSION}:run-generation-test:${String(depth)}`,
    ...overrides,
  };
}

function roomIdFor(roomType: RoomType): ContentId {
  const room = catalog
    .listRooms()
    .find((definition) => definition.roomType === roomType);
  if (room === undefined) {
    throw new Error(`missing test room: ${roomType}`);
  }
  return room.id;
}

function threatContext(
  seed: string,
  depth: number,
  roomType: RoomType,
): ThreatGenerationContext {
  return {
    seed,
    contentVersion: CONTENT_VERSION,
    depth,
    cycle: cycleForDepth(depth),
    roomEventKey: `room:${roomType}:${String(depth)}`,
    roomDefinitionId: roomIdFor(roomType),
  };
}

function shopContext(seed: string, depth = 1): ShopGenerationContext {
  return {
    seed,
    contentVersion: CONTENT_VERSION,
    depth,
    cycle: cycleForDepth(depth),
    roomEventKey: `room:shop:${String(depth)}`,
  };
}

function rewardContext(
  seed: string,
  depth = 1,
  overrides: Partial<RewardGenerationContext> = {},
): RewardGenerationContext {
  return {
    seed,
    contentVersion: CONTENT_VERSION,
    runId: "run-generation-test",
    depth,
    cycle: cycleForDepth(depth),
    roomEventKey: `room:battle:${CONTENT_VERSION}:run-generation-test:${String(depth)}`,
    roomType: "battle",
    activeSkillSlotsUsed: 0,
    passiveEquipmentSlotsUsed: 0,
    ...overrides,
  };
}

function assertValidRewardCard(card: GeneratedRewardCard): void {
  expect(card.rewardType === "skill" || card.rewardType === "equipment").toBe(
    true,
  );
  expect(
    card.rewardType === "skill"
      ? catalog.getSkill(card.baseRewardId).ok
      : catalog.getEquipment(card.baseRewardId).ok,
  ).toBe(true);
  const enhancements = card.enhancementIds.map((enhancementId) => {
    const enhancement = catalog.getEnhancement(enhancementId);
    expect(enhancement.ok).toBe(true);
    if (!enhancement.ok) {
      throw new Error(`unknown enhancement in test: ${enhancementId}`);
    }
    return enhancement.value;
  });
  expect(new Set(card.enhancementIds).size).toBe(card.enhancementIds.length);
  expect(
    enhancements.every(
      (enhancement) =>
        enhancement.compatibleRewardType === "any" ||
        enhancement.compatibleRewardType === card.rewardType,
    ),
  ).toBe(true);
  expect(card.rolledParams).toHaveLength(enhancements.length);
  for (const param of card.rolledParams) {
    expect(enhancements.some((e) => e.effectKey === param.key)).toBe(true);
    expect([1, 2, 3, 4]).toContain(param.value);
  }
  expect(Number.isSafeInteger(card.materialCost)).toBe(true);
  expect(card.materialCost).toBeGreaterThanOrEqual(0);
  expect(card.materialCost).toBeLessThanOrEqual(9);
  expect(card.tradeoffId).toBeNull();
}

function roomContextForOffer(
  context: RouteGenerationContext,
  offer: GeneratedRouteOffer,
): RoomGenerationContext {
  return { ...context, selectedOfferId: offer.offerId };
}

/**
 * Materialize the boss room for one seed at a boss depth (must satisfy
 * depth % 3 === 0; cycle = floor((depth - 1) / 3) + 1 follows).
 */
function bossRoomCandidate(
  seed: string,
  depth: number,
): ReturnType<typeof generateRoomCandidate> {
  const context = routeContext(seed, depth);
  const offer = generateRouteOptions(catalog, context)[0]!;
  return generateRoomCandidate(catalog, roomContextForOffer(context, offer));
}

function classResultFor(run: LivingRun) {
  const result = catalog.getClass(run.classId);
  if (!result.ok) {
    throw new Error("test fixture references an unknown class");
  }
  return result.value;
}

/**
 * Assemble a valid room-phase living run carrying the generated boss room,
 * with the class's authored starting integrity so semantic validation passes.
 */
function bossRoomRun(room: ReturnType<typeof generateRoomCandidate>): LivingRun {
  const run = createInitialLivingRun(
    catalog.contentVersion,
    catalog.initialClassUnlockIds()[0]!,
    4,
    null,
    {
      runId: "run-boss-persist",
      seed: "seed-boss-persist",
      now: 1_700_000_000_000,
      commitId: "commit-start",
    },
  );
  const startingIntegrity = classResultFor(run).startingIntegrity;
  return {
    ...run,
    integrityCurrent: startingIntegrity,
    integrityMax: startingIntegrity,
    depth: 6,
    cycle: 2,
    phase: "room",
    routeState: null,
    rewardState: null,
    roomState: {
      roomId: room.roomId,
      roomType: room.roomType,
      eventKey: room.eventKey,
      status: room.status,
      objectiveIds: [...room.objectiveIds],
      threatProfile: {
        budget: room.threatProfile.budget,
        durabilityFactor: room.threatProfile.durabilityFactor,
        density: room.threatProfile.density,
        formationId: room.threatProfile.formationId,
        hazardIds: [...room.threatProfile.hazardIds],
        bossModifierIds: [...room.threatProfile.bossModifierIds],
      },
      combatCheckpoint: room.combatCheckpoint,
      processedOutcomeIds: [],
      shop: null,
      recovery: null,
      boss: {
        archetypeId: room.boss!.archetypeId,
        modifierIds: [...room.boss!.modifierIds],
        phaseId: room.boss!.phaseId,
        defeated: room.boss!.defeated,
      },
      resolutionCommitId: null,
    },
  };
}

describe("deterministic route generation", () => {
  it("emits four fully described non-boss offers in keyboard order", () => {
    const offers = generateRouteOptions(
      catalog,
      routeContext("four-routes", 2, {
        integrityCurrent: 3,
        integrityMax: 3,
        runCurrency: 0,
      }),
    );

    expect(offers.map((offer) => offer.roomType)).toEqual([
      "battle",
      "elite",
      "shop",
      "recovery",
    ]);
    expect(new Set(offers.map((offer) => offer.offerId)).size).toBe(4);
    expect(new Set(offers.map((offer) => offer.roomEventKey)).size).toBe(4);
    for (const offer of offers) {
      expect(offer.availability).toBe("available");
      expect(offer.displayName.trim()).not.toBe("");
      expect(offer.summary.trim()).not.toBe("");
      expect(offer.riskLabel.trim()).not.toBe("");
      expect(offer.rewardLabel.trim()).not.toBe("");
      expect(offer.counterplay.trim()).not.toBe("");
      expect(offer.riskTier).toBeGreaterThanOrEqual(0);
      expect(offer.riskTier).toBeLessThanOrEqual(5);
      expect(catalog.hasContent(offer.roomDefinitionId)).toBe(true);
      if (offer.rewardPreviewId !== null) {
        expect(catalog.hasContent(offer.rewardPreviewId)).toBe(true);
      }
    }
    expect(
      offers.find((offer) => offer.roomType === "shop")?.visibleCost,
    ).toBeGreaterThan(0);
    expect(
      offers.find((offer) => offer.roomType === "recovery")?.availability,
    ).toBe("available");
  });

  it.each([3, 6, highBossDepth])(
    "locks boss depth %s to one available boss offer",
    (depth) => {
      const offers = generateRouteOptions(catalog, routeContext("boss-lock", depth));
      expect(offers).toHaveLength(1);
      expect(offers[0]).toMatchObject({
        roomType: "boss",
        availability: "available",
        visibleCost: 0,
      });
    },
  );

  it("is byte-for-byte reproducible and isolated from unrelated draws", () => {
    const context = routeContext("refresh-stable", 2);
    const expected = JSON.stringify(generateRouteOptions(catalog, context));
    const unrelated = deriveStream(
      context.seed,
      context.contentVersion,
      "unrelated:reward-draft",
    );
    Array.from({ length: 200 }, () => unrelated.nextUint32());

    expect(JSON.stringify(generateRouteOptions(catalog, context))).toBe(expected);
    const shopOffer = generateRouteOptions(catalog, context).find(
      (offer) => offer.roomType === "shop",
    );
    expect(shopOffer).toBeDefined();
    if (shopOffer !== undefined) {
      const roomContext = roomContextForOffer(context, shopOffer);
      expect(JSON.stringify(generateRoomCandidate(catalog, roomContext))).toBe(
        JSON.stringify(generateRoomCandidate(catalog, roomContext)),
      );
    }
  });

  it("changes representative generated output when the seed changes", () => {
    const first = routeContext("representative-seed-a", 2);
    const second = routeContext("representative-seed-b", 2, {
      routeEventKey: first.routeEventKey,
    });
    const firstOffers = generateRouteOptions(catalog, first);
    const secondOffers = generateRouteOptions(catalog, second);
    const firstShop = firstOffers.find((offer) => offer.roomType === "shop")!;
    const secondShop = secondOffers.find((offer) => offer.roomType === "shop")!;

    expect(
      JSON.stringify({
        offers: firstOffers,
        room: generateRoomCandidate(
          catalog,
          roomContextForOffer(first, firstShop),
        ),
      }),
    ).not.toBe(
      JSON.stringify({
        offers: secondOffers,
        room: generateRoomCandidate(
          catalog,
          roomContextForOffer(second, secondShop),
        ),
      }),
    );
  });

  it("freezes offer arrays and protects later generations from callers", () => {
    const context = routeContext("immutable-routes", 1);
    const offers = generateRouteOptions(catalog, context);
    const expected = JSON.stringify(offers);

    expect(Object.isFrozen(offers)).toBe(true);
    expect(Object.isFrozen(offers[0])).toBe(true);
    expect(() => {
      (offers as GeneratedRouteOffer[]).push(offers[0]!);
    }).toThrow();
    expect(JSON.stringify(generateRouteOptions(catalog, context))).toBe(expected);
  });
});

describe("bounded threat generation", () => {
  it("stays finite, known, sublinear, and capped through safe high depth", () => {
    const contexts = [
      threatContext("threat-bounds", 1, "battle"),
      threatContext("threat-bounds", 3, "boss"),
      threatContext("threat-bounds", 100, "battle"),
      threatContext(
        "threat-bounds",
        Number.MAX_SAFE_INTEGER,
        "battle",
      ),
    ];
    const profiles = contexts.map((context) =>
      generateThreatProfile(catalog, context),
    );

    for (const profile of profiles) {
      expect(Number.isSafeInteger(profile.budget)).toBe(true);
      expect(profile.budget).toBeGreaterThanOrEqual(0);
      expect(profile.budget).toBeLessThanOrEqual(THREAT_LIMITS.maxBudget);
      expect(Number.isFinite(profile.durabilityFactor)).toBe(true);
      expect(profile.durabilityFactor).toBeGreaterThanOrEqual(1);
      expect(profile.durabilityFactor).toBeLessThanOrEqual(
        THREAT_LIMITS.maxDurabilityFactor,
      );
      expect(Number.isSafeInteger(profile.density)).toBe(true);
      expect(profile.density).toBeLessThanOrEqual(THREAT_LIMITS.maxDensity);
      expect(profile.hazardIds.length).toBeLessThanOrEqual(
        THREAT_LIMITS.maxHazards,
      );
      expect(catalog.hasContent(profile.formationId)).toBe(true);
      for (const hazardId of profile.hazardIds) {
        expect(catalog.hasContent(hazardId)).toBe(true);
      }
      expect(
        Object.values(profile.diagnostics).every(Number.isFinite),
      ).toBe(true);
    }

    const depthOne = profiles[0]!;
    const safeMaximum = profiles.at(-1)!;
    expect(safeMaximum.durabilityFactor).toBeLessThanOrEqual(4);
    expect(safeMaximum.durabilityFactor - depthOne.durabilityFactor).toBeLessThan(
      3,
    );
    expect(safeMaximum.durabilityFactor).toBeLessThan(
      depthOne.durabilityFactor * 4,
    );
  });

  it("keeps utility rooms threat-free while retaining a known formation", () => {
    for (const roomType of ["shop", "recovery"] as const) {
      const profile = generateThreatProfile(
        catalog,
        threatContext("utility-threat", 100, roomType),
      );
      expect(profile).toMatchObject({
        budget: 0,
        durabilityFactor: 1,
        density: 0,
        hazardIds: [],
      });
      expect(catalog.hasContent(profile.formationId)).toBe(true);
    }
  });

  it("varies elite hazards only after sorting the authored candidate pool", () => {
    const choices = new Set<string>();
    for (let index = 0; index < 32; index += 1) {
      const profile = generateThreatProfile(
        catalog,
        threatContext(`hazard-choice-${String(index)}`, 2, "elite"),
      );
      expect(profile.hazardIds).toHaveLength(1);
      choices.add(profile.hazardIds[0]!);
    }

    expect(choices.size).toBe(2);
  });

  it("caps boss-room density so the composed boss anatomy always fits", () => {
    for (const depth of [3, 9, Number.MAX_SAFE_INTEGER]) {
      const profile = generateThreatProfile(
        catalog,
        threatContext("boss-density", depth, "boss"),
      );
      expect(profile.density).toBeLessThanOrEqual(BOSS_ROOM_MAX_DENSITY);
      expect(profile.density).toBeGreaterThan(0);
    }
    // The cap must bind: an uncapped boss room would exceed it.
    expect(3 + Math.floor(Math.log2(Number.MAX_SAFE_INTEGER + 1) / 2) + 5 + 1).toBeGreaterThan(
      BOSS_ROOM_MAX_DENSITY,
    );
  });
});

describe("shop and room candidates", () => {
  it("materializes finite unique known services with allowlisted params", () => {
    const inventory = generateShopInventory(
      catalog,
      shopContext("stable-shop", Number.MAX_SAFE_INTEGER),
    );
    const repeated = generateShopInventory(
      catalog,
      shopContext("stable-shop", Number.MAX_SAFE_INTEGER),
    );

    expect(inventory.length).toBeGreaterThan(0);
    expect(inventory.length).toBe(catalog.listShopServices().length);
    expect(new Set(inventory.map((item) => item.itemId)).size).toBe(
      inventory.length,
    );
    expect(JSON.stringify(inventory)).toBe(JSON.stringify(repeated));
    for (const item of inventory) {
      expect(catalog.getShopService(item.itemId).ok).toBe(true);
      expect(Number.isSafeInteger(item.price)).toBe(true);
      expect(item.price).toBeGreaterThan(0);
      expect(item.price).toBeLessThanOrEqual(SHOP_PRICE_CAP);
      expect(item.effectParams).toEqual([
        { key: "restoreAmount", value: item.effectParams[0]?.value },
      ]);
      expect([1, 2]).toContain(item.effectParams[0]?.value);
    }
    expect(Object.isFrozen(inventory)).toBe(true);
    expect(Object.isFrozen(inventory[0]?.effectParams)).toBe(true);
  });

  it("composes each route category without charging or committing", () => {
    const context = Object.freeze(
      routeContext("candidate-shapes", 2, {
        integrityCurrent: 3,
        integrityMax: 3,
        runCurrency: 0,
      }),
    );
    const contextBefore = JSON.stringify(context);
    const offers = generateRouteOptions(catalog, context);

    for (const offer of offers) {
      const room = generateRoomCandidate(
        catalog,
        roomContextForOffer(context, offer),
      );
      expect(room).toMatchObject({
        authoredRoomId: offer.roomDefinitionId,
        roomType: offer.roomType,
        eventKey: offer.roomEventKey,
        status: "ready",
        processedOutcomeIds: [],
        resolutionCommitId: null,
      });
      const isCombatRoom =
        offer.roomType === "battle" || offer.roomType === "elite";
      expect(room.combatCheckpoint === null).toBe(!isCombatRoom);
      if (isCombatRoom) {
        expect(room.combatCheckpoint?.kind).toBe("pre_launch");
      }
      expect(Object.isFrozen(room)).toBe(true);
      expect(Object.isFrozen(room.objectiveIds)).toBe(true);
      expect(catalog.hasContent(room.threatProfile.formationId)).toBe(true);
      expect(room.shop === null).toBe(offer.roomType !== "shop");
      expect(room.recovery === null).toBe(offer.roomType !== "recovery");
      expect(room.boss).toBeNull();
    }

    const shopOffer = offers.find((offer) => offer.roomType === "shop")!;
    const shopRoom = generateRoomCandidate(
      catalog,
      roomContextForOffer(context, shopOffer),
    );
    expect(shopRoom.shop?.purchasedItemIds).toEqual([]);
    expect(shopRoom.shop?.inventory.length).toBeGreaterThan(0);

    const recoveryOffer = offers.find(
      (offer) => offer.roomType === "recovery",
    )!;
    const recoveryRoom = generateRoomCandidate(
      catalog,
      roomContextForOffer(context, recoveryOffer),
    );
    expect(recoveryRoom.recovery).toMatchObject({
      restoreAmount: 1,
      committed: false,
      commitId: null,
    });
    expect(JSON.stringify(context)).toBe(contextBefore);
  });

  it("selects a stable known boss identity without combat modifiers", () => {
    const context = routeContext("boss-candidate", 3);
    const offer = generateRouteOptions(catalog, context)[0]!;
    const first = generateRoomCandidate(
      catalog,
      roomContextForOffer(context, offer),
    );
    const second = generateRoomCandidate(
      catalog,
      roomContextForOffer(context, offer),
    );

    expect(first.boss).not.toBeNull();
    expect(first.combatCheckpoint?.kind).toBe("pre_launch");
    expect(first.boss).toEqual(second.boss);
    expect(catalog.hasContent(first.boss!.archetypeId)).toBe(true);
    expect(first.boss).toMatchObject({
      modifierIds: [],
      phaseId: "routing",
      defeated: false,
    });

    const routedBosses = new Set<ContentId>();
    for (let index = 0; index < 64; index += 1) {
      const seededContext = routeContext(`boss-pool-${String(index)}`, 3);
      const seededOffer = generateRouteOptions(catalog, seededContext)[0]!;
      routedBosses.add(
        generateRoomCandidate(
          catalog,
          roomContextForOffer(seededContext, seededOffer),
        ).boss!.archetypeId,
      );
    }
    expect([...routedBosses].sort()).toEqual(
      catalog
        .listBosses()
        .map((boss) => boss.id)
        .sort(),
    );
  });

  it("rejects unsafe contexts and a selection outside the route", () => {
    expect(() =>
      generateRouteOptions(catalog, routeContext("invalid-depth", 0)),
    ).toThrow(RangeError);
    expect(() =>
      generateRouteOptions(
        catalog,
        routeContext("unsafe-depth", Number.MAX_SAFE_INTEGER + 1),
      ),
    ).toThrow(RangeError);
    expect(() =>
      generateRouteOptions(catalog, routeContext("wrong-cycle", 2, { cycle: 2 })),
    ).toThrow(RangeError);
    expect(() =>
      generateRouteOptions(
        catalog,
        routeContext("wrong-version", 1, {
          contentVersion: "content-2" as ContentVersion,
        }),
      ),
    ).toThrow(RangeError);

    const context = routeContext("invalid-selection", 1);
    expect(() =>
      generateRoomCandidate(catalog, {
        ...context,
        selectedOfferId: "offer-not-in-route",
      }),
    ).toThrow(RangeError);
  });
});

describe("reward draft generation", () => {
  it("produces exactly three unique cards with known, compatible content", () => {
    const context = rewardContext("draft-shapes", 2);
    const draft = generateRewardDraft(catalog, context);

    expect(draft.cards).toHaveLength(3);
    expect(new Set(draft.cards.map((card) => card.cardId)).size).toBe(3);
    for (const [index, card] of draft.cards.entries()) {
      expect(card.cardId).toBe(
        `${context.roomEventKey}:reward:card:${card.baseRewardId}:${String(index)}`,
      );
      assertValidRewardCard(card);
      expect(catalog.hasContent(card.baseRewardId)).toBe(true);
    }
    expect(draft.eventKey).toBe(`${context.roomEventKey}:reward`);
    expect(draft.sourceRoomId).toBe(`${context.roomEventKey}:candidate`);
  });

  it("is byte-for-byte reproducible and isolated from unrelated draws", () => {
    const context = rewardContext("reward-stable", 4);
    const expected = JSON.stringify(generateRewardDraft(catalog, context));
    const unrelated = deriveStream(
      context.seed,
      context.contentVersion,
      `${context.roomEventKey}:unrelated`,
    );
    Array.from({ length: 200 }, () => unrelated.nextUint32());

    expect(JSON.stringify(generateRewardDraft(catalog, context))).toBe(expected);
  });

  it("varies with seed, depth, and event key", () => {
    const base = rewardContext("reward-variation", 2);
    const otherSeed = rewardContext("reward-variation-other", 2);
    const otherDepth = rewardContext("reward-variation", 5);
    const otherEventKey = rewardContext("reward-variation", 2, {
      roomEventKey: `${base.roomEventKey}:elite`,
    });

    const baseJson = JSON.stringify(generateRewardDraft(catalog, base));
    expect(JSON.stringify(generateRewardDraft(catalog, otherSeed))).not.toBe(
      baseJson,
    );
    expect(JSON.stringify(generateRewardDraft(catalog, otherDepth))).not.toBe(
      baseJson,
    );
    expect(JSON.stringify(generateRewardDraft(catalog, otherEventKey))).not.toBe(
      baseJson,
    );
  });

  it("keeps every enhancement within its depth gate", () => {
    for (const depth of [1, 2, 3, 7]) {
      const context = rewardContext(`reward-depth-${String(depth)}`, depth);
      const draft = generateRewardDraft(catalog, context);
      for (const card of draft.cards) {
        for (const enhancementId of card.enhancementIds) {
          const enhancement = catalog.getEnhancement(enhancementId);
          expect(enhancement.ok).toBe(true);
          if (enhancement.ok) {
            expect(enhancement.value.minDepth).toBeLessThanOrEqual(depth);
          }
        }
      }
    }

    const seenAt = (depth: number): Set<ContentId> => {
      const seen = new Set<ContentId>();
      for (let index = 0; index < 24; index += 1) {
        const draft = generateRewardDraft(
          catalog,
          rewardContext(`reward-gate-${String(index)}`, depth),
        );
        for (const enhancementId of draft.cards.flatMap(
          (card) => card.enhancementIds,
        )) {
          seen.add(enhancementId);
        }
      }
      return seen;
    };

    const minDepthOf = (enhancementId: ContentId): number => {
      const enhancement = catalog.getEnhancement(enhancementId);
      if (!enhancement.ok) {
        throw new Error(`unknown enhancement in test: ${enhancementId}`);
      }
      return enhancement.value.minDepth;
    };

    const shallow = seenAt(1);
    expect(shallow.size).toBeGreaterThan(0);
    for (const enhancementId of shallow) {
      expect(minDepthOf(enhancementId)).toBe(1);
    }
    const midDepth = seenAt(2);
    expect([...midDepth].every((enhancementId) => minDepthOf(enhancementId) <= 2)).toBe(
      true,
    );
    expect(
      [...midDepth].some((enhancementId) => minDepthOf(enhancementId) === 2),
    ).toBe(true);
    const deep = seenAt(3);
    expect(
      [...deep].some((enhancementId) => minDepthOf(enhancementId) === 3),
    ).toBe(true);
  });

  it("respects build slots: a full side never generates that kind", () => {
    const skillsFull = generateRewardDraft(
      catalog,
      rewardContext("slots-skill-full", 2, { activeSkillSlotsUsed: 3 }),
    );
    expect(
      skillsFull.cards.every((card) => card.rewardType === "equipment"),
    ).toBe(true);

    const equipmentFull = generateRewardDraft(
      catalog,
      rewardContext("slots-equipment-full", 2, {
        passiveEquipmentSlotsUsed: 4,
      }),
    );
    expect(
      equipmentFull.cards.every((card) => card.rewardType === "skill"),
    ).toBe(true);

    const bothPartial = generateRewardDraft(
      catalog,
      rewardContext("slots-partial", 2, {
        activeSkillSlotsUsed: 2,
        passiveEquipmentSlotsUsed: 3,
      }),
    );
    for (const card of bothPartial.cards) {
      assertValidRewardCard(card);
    }
  });

  it("rejects unsafe reward contexts with typed errors", () => {
    expect(() =>
      generateRewardDraft(catalog, rewardContext("reward-bad-depth", 0)),
    ).toThrow(RangeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-wrong-cycle", 2, { cycle: 2 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-wrong-version", 1, {
          contentVersion: "content-2" as ContentVersion,
        }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-blank-key", 1, { roomEventKey: "   " }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-blank-run", 1, { runId: "" }),
      ),
    ).toThrow(TypeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-bad-slots", 1, { activeSkillSlotsUsed: 4 }),
      ),
    ).toThrow(RangeError);
    expect(() =>
      generateRewardDraft(
        catalog,
        rewardContext("reward-bad-equipment-slots", 1, {
          passiveEquipmentSlotsUsed: -1,
        }),
      ),
    ).toThrow(RangeError);
  });

  it("freezes the draft, its cards, and all nested arrays", () => {
    const draft = generateRewardDraft(catalog, rewardContext("frozen-draft", 1));
    const expected = JSON.stringify(draft);

    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.cards)).toBe(true);
    for (const card of draft.cards) {
      expect(Object.isFrozen(card)).toBe(true);
      expect(Object.isFrozen(card.enhancementIds)).toBe(true);
      expect(Object.isFrozen(card.rolledParams)).toBe(true);
      for (const param of card.rolledParams) {
        expect(Object.isFrozen(param)).toBe(true);
      }
    }
    expect(() => {
      (draft.cards as unknown as GeneratedRewardCard[]).push(draft.cards[0]!);
    }).toThrow();
    expect(JSON.stringify(generateRewardDraft(catalog, rewardContext("frozen-draft", 1)))).toBe(
      expected,
    );
  });
});

describe("boss modifier selection (CA-11)", () => {
  it("keeps cycle-1 boss rooms at zero modifiers", () => {
    const room = bossRoomCandidate("cycle-one-empty", 3);
    expect(room.boss).not.toBeNull();
    expect(room.boss!.modifierIds).toEqual([]);
    expect(room.threatProfile.bossModifierIds).toEqual([]);
  });

  it("selects deterministic compatible modifiers at cycle >= 2", () => {
    const first = bossRoomCandidate("cycle-two-selection", 6);
    const second = bossRoomCandidate("cycle-two-selection", 6);

    expect(first.boss).not.toBeNull();
    expect(first.boss!.modifierIds).toEqual(second.boss!.modifierIds);
    expect(first.boss!.modifierIds.length).toBeGreaterThanOrEqual(0);
    expect(first.boss!.modifierIds.length).toBeLessThanOrEqual(
      MAX_BOSS_MODIFIERS,
    );

    const routed = catalog.getBoss(first.boss!.archetypeId);
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    for (const modifierId of first.boss!.modifierIds) {
      const compatible = routed.value.compatibleModifiers.some(
        (entry) => entry.id === modifierId,
      );
      expect(compatible).toBe(true);
    }

    // The threat projection is derived by the same rule for the same room.
    expect(first.threatProfile.bossModifierIds).toEqual(
      first.boss!.modifierIds,
    );
  });

  it("varies the selection with the stream inputs", () => {
    const seen = new Set<string>();
    for (let index = 0; index < 24; index += 1) {
      const room = bossRoomCandidate(`cycle-two-pool-${String(index)}`, 6);
      seen.add(JSON.stringify(room.boss!.modifierIds));
    }
    // Three compatible modifiers per archetype, two drawn: the shuffle must
    // produce more than one ordered pair across seeds (order OR membership).
    expect(seen.size).toBeGreaterThan(1);
  });

  it("caps the selection at two and only draws archetype-compatible IDs across seeds", () => {
    const sharedIds = new Set(catalog.listBosses().flatMap((boss) =>
      boss.compatibleModifiers
        .filter((entry) => entry.compatibleArchetypeIds === "any")
        .map((entry) => entry.id),
    ));
    for (let index = 0; index < 48; index += 1) {
      const room = bossRoomCandidate(`compat-pool-${String(index)}`, 6);
      const boss = room.boss!;
      expect(boss.modifierIds.length).toBeLessThanOrEqual(MAX_BOSS_MODIFIERS);
      expect(new Set(boss.modifierIds).size).toBe(boss.modifierIds.length);
      const routed = catalog.getBoss(boss.archetypeId);
      expect(routed.ok).toBe(true);
      if (!routed.ok) continue;
      for (const modifierId of boss.modifierIds) {
        expect(
          routed.value.compatibleModifiers.some(
            (entry) => entry.id === modifierId,
          ),
        ).toBe(true);
      }
    }
    // Every archetype's registry holds the shared pair plus its own entry, so
    // a compliant selection can never exceed the authored pool.
    expect(sharedIds.size).toBe(2);
  });

  it("derives the threat projection from the same stream key as the boss state", () => {
    // An unrelated draw on a different stream must not move either producer.
    const context = routeContext("projection-isolation", 6);
    const offer = generateRouteOptions(catalog, context)[0]!;
    const expectedBoss = JSON.stringify(
      generateRoomCandidate(catalog, roomContextForOffer(context, offer)).boss,
    );
    const unrelated = deriveStream(
      context.seed,
      context.contentVersion,
      `${offer.roomEventKey}:unrelated-draw`,
    );
    Array.from({ length: 64 }, () => unrelated.nextUint32());

    const room = generateRoomCandidate(
      catalog,
      roomContextForOffer(context, offer),
    );
    expect(JSON.stringify(room.boss)).toBe(expectedBoss);
    expect(room.threatProfile.bossModifierIds).toEqual(room.boss!.modifierIds);
  });

  it("emits a boss room whose durable boss shape round-trips persistence", () => {
    const room = bossRoomCandidate("persistence-roundtrip", 6);
    const run = bossRoomRun(room);

    const parsed = parseLivingRunRecord(run, catalog);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const persistedBoss = parsed.value.roomState!.boss!;
    expect(persistedBoss).toEqual({
      archetypeId: room.boss!.archetypeId,
      modifierIds: room.boss!.modifierIds,
      phaseId: "routing",
      defeated: false,
    });
    expect(Object.keys(parsed.value.roomState!.boss!).sort()).toEqual([
      "archetypeId",
      "defeated",
      "modifierIds",
      "phaseId",
    ]);
  });

  it("rejects a boss state that rides display fields the schema does not allow", () => {
    const room = bossRoomCandidate("persistence-negative", 6);
    const run = bossRoomRun(room) as unknown as {
      roomState: { boss: Record<string, unknown> };
    };
    run.roomState.boss = {
      ...run.roomState.boss,
      displayName: "Warden",
    };

    const parsed = parseLivingRunRecord(run, catalog);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("invalid-living-run");
    expect(JSON.stringify(parsed.error.cause)).toContain("boss");
  });
});
