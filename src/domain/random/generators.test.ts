import { describe, expect, it } from "vitest";

import type {
  ContentId,
  ContentVersion,
} from "../content/catalog";
import { CONTENT_VERSION, createContentCatalog } from "../content/catalog";
import type { RoomType } from "../content/rooms";
import {
  SHOP_PRICE_CAP,
  THREAT_LIMITS,
  generateRoomCandidate,
  generateRouteOptions,
  generateShopInventory,
  generateThreatProfile,
} from "./generators";
import type {
  GeneratedRouteOffer,
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

function roomContextForOffer(
  context: RouteGenerationContext,
  offer: GeneratedRouteOffer,
): RoomGenerationContext {
  return { ...context, selectedOfferId: offer.offerId };
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
        combatCheckpoint: null,
        processedOutcomeIds: [],
        resolutionCommitId: null,
      });
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
