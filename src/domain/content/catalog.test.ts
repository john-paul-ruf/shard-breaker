import { describe, expect, it } from "vitest";

import type { ContentId } from "./catalog";
import { CONTENT_VERSION, createContentCatalog } from "./catalog";
import { BOSS_ROUTING_IDENTITIES } from "./bosses";
import type { ClassDefinition } from "./classes";
import { CLASS_DEFINITIONS } from "./classes";
import {
  ROOM_DEFINITIONS,
  ROUTE_SUPPORT_DEFINITIONS,
  SHOP_SERVICE_DEFINITIONS,
} from "./rooms";

const asContentId = (value: string): ContentId => value as ContentId;

describe("content catalog", () => {
  it("exposes the stable content-1 version distinct from other versions", () => {
    const catalog = createContentCatalog();
    expect(catalog.contentVersion).toBe("content-1");
    expect(CONTENT_VERSION).toBe("content-1");
  });

  it("enumerates exactly three unique, known classes", () => {
    const catalog = createContentCatalog();
    const classes = catalog.listClasses();
    expect(classes).toHaveLength(3);
    const ids = classes.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(catalog.hasClass(id)).toBe(true);
    }
  });

  it.each([
    ["class-circuit-rogue", "Circuit Rogue", 3, "initial"],
    ["class-glitch-knight", "Glitch Knight", 4, "initial"],
    ["class-neon-mage", "Neon Mage", 2, "locked"],
  ] as const)(
    "defines %s with exact Integrity and availability",
    (id, displayName, integrity, availability) => {
      const catalog = createContentCatalog();
      const result = catalog.getClass(asContentId(id));
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.displayName).toBe(displayName);
        expect(result.value.startingIntegrity).toBe(integrity);
        expect(result.value.availability).toBe(availability);
      }
    },
  );

  it("unlocks exactly the two initial classes and keeps Neon Mage locked", () => {
    const catalog = createContentCatalog();
    expect([...catalog.initialClassUnlockIds()]).toEqual([
      "class-circuit-rogue",
      "class-glitch-knight",
    ]);
    expect(catalog.initialClassUnlockIds()).not.toContain("class-neon-mage");
  });

  it("returns a typed rejection for an unknown class ID", () => {
    const catalog = createContentCatalog();
    const result = catalog.getClass(asContentId("class-does-not-exist"));
    expect(result).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "class-does-not-exist",
    });
    expect(catalog.hasClass(asContentId("class-does-not-exist"))).toBe(false);
  });

  it("enumerates an immutable, frozen class list", () => {
    const catalog = createContentCatalog();
    const classes = catalog.listClasses();
    expect(Object.isFrozen(classes)).toBe(true);
    expect(Object.isFrozen(CLASS_DEFINITIONS)).toBe(true);
    expect(() => {
      (classes as ClassDefinition[]).push(classes[0]!);
    }).toThrow();
  });

  it("keeps every authored ID globally unique and known", () => {
    const catalog = createContentCatalog();
    const definitions = [
      ...CLASS_DEFINITIONS,
      ...ROOM_DEFINITIONS,
      ...ROUTE_SUPPORT_DEFINITIONS,
      ...SHOP_SERVICE_DEFINITIONS,
      ...BOSS_ROUTING_IDENTITIES,
    ];
    const ids = definitions.map((definition) => definition.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(catalog.hasContent(id)).toBe(true);
    }
    expect(catalog.hasContent(asContentId("unknown-content"))).toBe(false);
  });

  it("enumerates and totally looks up route and utility content", () => {
    const catalog = createContentCatalog();

    expect(catalog.listRooms()).toHaveLength(5);
    expect(catalog.listShopServices()).toHaveLength(2);
    expect(catalog.listBosses()).toHaveLength(4);
    expect(catalog.getRoom(asContentId("room-battle-glassway"))).toMatchObject({
      ok: true,
      value: { displayName: "Glassway" },
    });
    expect(
      catalog.getShopService(asContentId("shop-service-integrity-patch")),
    ).toMatchObject({ ok: true, value: { basePrice: 20 } });
    expect(catalog.getBoss(asContentId("boss-null-architect"))).toMatchObject({
      ok: true,
      value: { displayName: "Null Architect" },
    });
    expect(catalog.getRoom(asContentId("room-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "room-unknown",
    });
  });

  it("returns frozen route, shop, and boss enumerations", () => {
    const catalog = createContentCatalog();

    expect(Object.isFrozen(catalog.listRooms())).toBe(true);
    expect(Object.isFrozen(catalog.listShopServices())).toBe(true);
    expect(Object.isFrozen(catalog.listBosses())).toBe(true);
  });
});
