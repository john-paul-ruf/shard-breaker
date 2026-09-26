import { describe, expect, it } from "vitest";

import type { ContentId } from "./catalog";
import { CONTENT_VERSION, createContentCatalog } from "./catalog";
import { BOSS_ROUTING_IDENTITIES } from "./bosses";
import type { ClassDefinition } from "./classes";
import { CLASS_DEFINITIONS } from "./classes";
import type { EnhancementDefinition } from "./enhancements";
import { ENHANCEMENT_DEFINITIONS } from "./enhancements";
import { ENEMY_DEFINITIONS } from "./enemies";
import type { EquipmentDefinition } from "./equipment";
import { EQUIPMENT_DEFINITIONS } from "./equipment";
import {
  ROOM_DEFINITIONS,
  ROUTE_SUPPORT_DEFINITIONS,
  SHOP_SERVICE_DEFINITIONS,
} from "./rooms";
import { RELIC_DEFINITIONS } from "./relics";
import type { SkillDefinition } from "./skills";
import { SKILL_DEFINITIONS } from "./skills";

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
    const definitions: readonly { readonly id: ContentId }[] = [
      ...CLASS_DEFINITIONS,
      ...ROOM_DEFINITIONS,
      ...ROUTE_SUPPORT_DEFINITIONS,
      ...SHOP_SERVICE_DEFINITIONS,
      ...BOSS_ROUTING_IDENTITIES,
      ...SKILL_DEFINITIONS,
      ...EQUIPMENT_DEFINITIONS,
      ...ENHANCEMENT_DEFINITIONS,
      ...ENEMY_DEFINITIONS,
      ...RELIC_DEFINITIONS,
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

describe("boss catalog rows", () => {
  it("keeps listBosses entries routing-identity compatible for CA-09 consumers", () => {
    const catalog = createContentCatalog();
    const bosses = catalog.listBosses();
    expect(bosses).toHaveLength(4);
    for (const boss of bosses) {
      expect(boss.id.startsWith("boss-")).toBe(true);
      expect(boss.displayName.trim()).not.toBe("");
      expect(boss.identityLabel.trim()).not.toBe("");
      expect(catalog.hasContent(boss.id)).toBe(true);
    }
    expect(Object.isFrozen(bosses)).toBe(true);
  });

  it("resolves the full BossDefinition through getBoss for every archetype", () => {
    const catalog = createContentCatalog();
    for (const boss of BOSS_ROUTING_IDENTITIES) {
      const result = catalog.getBoss(boss.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.displayName).toBe(boss.displayName);
        expect(result.value.identityLabel).toBe(boss.identityLabel);
        expect(result.value.phases).toHaveLength(3);
        expect(result.value.telegraphs.length).toBeGreaterThanOrEqual(2);
        expect(result.value.compatibleModifiers.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps the unknown-boss lookup rejection typed", () => {
    const catalog = createContentCatalog();
    expect(catalog.getBoss(asContentId("boss-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "boss-unknown",
    });
  });
});

describe("reward content", () => {
  it("authors eight skills, eight equipment items, and fourteen enhancements", () => {
    expect(SKILL_DEFINITIONS).toHaveLength(8);
    expect(EQUIPMENT_DEFINITIONS).toHaveLength(8);
    expect(ENHANCEMENT_DEFINITIONS).toHaveLength(14);
    expect(createContentCatalog().listSkills()).toHaveLength(8);
    expect(createContentCatalog().listEquipment()).toHaveLength(8);
    expect(createContentCatalog().listEnhancements()).toHaveLength(14);
  });

  it("gives every reward definition visible labels and bounded or exact fields", () => {
    for (const skill of SKILL_DEFINITIONS) {
      expect(skill.id.startsWith("skill-")).toBe(true);
      expect(skill.displayName.trim()).not.toBe("");
      expect(skill.description.trim()).not.toBe("");
      expect([1, 2]).toContain(skill.maxCharges);
      expect(skill.effectKey.trim()).not.toBe("");
      expect(skill.availability).toBe("initial");
    }
    for (const item of EQUIPMENT_DEFINITIONS) {
      expect(item.id.startsWith("equipment-")).toBe(true);
      expect(item.displayName.trim()).not.toBe("");
      expect(item.description.trim()).not.toBe("");
      expect(item.effectKey.trim()).not.toBe("");
      expect(item.availability).toBe("initial");
    }
    for (const enhancement of ENHANCEMENT_DEFINITIONS) {
      expect(enhancement.id.startsWith("enhancement-")).toBe(true);
      expect(enhancement.displayName.trim()).not.toBe("");
      expect(enhancement.description.trim()).not.toBe("");
      expect(enhancement.effectKey.trim()).not.toBe("");
      expect(enhancement.minDepth).toBeGreaterThanOrEqual(1);
      expect(enhancement.minDepth).toBeLessThanOrEqual(3);
    }
  });

  it("keeps every skill, equipment, and enhancement ID unique and known", () => {
    const catalog = createContentCatalog();
    const ids = [
      ...SKILL_DEFINITIONS.map((definition) => definition.id),
      ...EQUIPMENT_DEFINITIONS.map((definition) => definition.id),
      ...ENHANCEMENT_DEFINITIONS.map((definition) => definition.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(catalog.hasContent(id)).toBe(true);
    }
  });

  it.each(["skill", "equipment", "any"] as const)(
    "gives at least one enhancement a %s compatibility policy",
    (compatibleRewardType) => {
      expect(
        ENHANCEMENT_DEFINITIONS.some(
          (definition) => definition.compatibleRewardType === compatibleRewardType,
        ),
      ).toBe(true);
      for (const definition of ENHANCEMENT_DEFINITIONS) {
        expect(
          ["skill", "equipment", "any"].includes(
            definition.compatibleRewardType,
          ),
        ).toBe(true);
      }
    },
  );

  it("keeps every enhancement effect key unique for unambiguous rolled params", () => {
    const effectKeys = ENHANCEMENT_DEFINITIONS.map(
      (definition) => definition.effectKey,
    );
    expect(new Set(effectKeys).size).toBe(effectKeys.length);
  });

  it("resolves typed lookups for skills, equipment, and enhancements", () => {
    const catalog = createContentCatalog();

    expect(catalog.getSkill(asContentId("skill-phase-shunt"))).toMatchObject({
      ok: true,
      value: { displayName: "Phase Shunt", maxCharges: 2 },
    });
    expect(
      catalog.getEquipment(asContentId("equipment-fractal-core")),
    ).toMatchObject({ ok: true, value: { displayName: "Fractal Core" } });
    expect(
      catalog.getEnhancement(asContentId("enhancement-overclocked")),
    ).toMatchObject({
      ok: true,
      value: { compatibleRewardType: "skill", minDepth: 1 },
    });
    expect(catalog.getSkill(asContentId("skill-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "skill-unknown",
    });
    expect(catalog.getEquipment(asContentId("equipment-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "equipment-unknown",
    });
    expect(catalog.getEnhancement(asContentId("enhancement-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "enhancement-unknown",
    });
  });

  it("returns frozen reward-content arrays and protects them from mutation", () => {
    const catalog = createContentCatalog();

    expect(Object.isFrozen(SKILL_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(EQUIPMENT_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(ENHANCEMENT_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(catalog.listSkills())).toBe(true);
    expect(Object.isFrozen(catalog.listEquipment())).toBe(true);
    expect(Object.isFrozen(catalog.listEnhancements())).toBe(true);
    expect(() => {
      (catalog.listSkills() as SkillDefinition[]).push(SKILL_DEFINITIONS[0]!);
    }).toThrow();
    expect(() => {
      (catalog.listEquipment() as EquipmentDefinition[]).push(
        EQUIPMENT_DEFINITIONS[0]!,
      );
    }).toThrow();
    expect(() => {
      (catalog.listEnhancements() as EnhancementDefinition[]).push(
        ENHANCEMENT_DEFINITIONS[0]!,
      );
    }).toThrow();
  });
});

describe("enemy content facade", () => {
  it("enumerates six enemies and totally looks them up", () => {
    const catalog = createContentCatalog();
    expect(catalog.listEnemies()).toHaveLength(6);
    expect(catalog.getEnemy(asContentId("enemy-sprite-prism"))).toMatchObject({
      ok: true,
      value: { displayName: "Prism", baseHealth: 3, behavior: "static" },
    });
    expect(catalog.getEnemy(asContentId("enemy-sprite-regen"))).toMatchObject({
      ok: true,
      value: { displayName: "Mender", behavior: "regenerating" },
    });
    expect(catalog.getEnemy(asContentId("enemy-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "enemy-unknown",
    });
    expect(Object.isFrozen(catalog.listEnemies())).toBe(true);
  });
});

describe("relic content facade", () => {
  it("enumerates exactly the three authored relics in authored order", () => {
    const catalog = createContentCatalog();
    expect(catalog.listRelics()).toEqual(RELIC_DEFINITIONS);
    expect(catalog.listRelics().map((relic) => relic.id)).toEqual([
      "relic-backfeed-cell",
      "relic-quiet-prism",
      "relic-spare-vector",
    ]);
  });

  it("resolves each authored relic through a typed lookup", () => {
    const catalog = createContentCatalog();
    expect(catalog.getRelic(asContentId("relic-backfeed-cell"))).toMatchObject({
      ok: true,
      value: { displayName: "Backfeed Cell" },
    });
    expect(catalog.getRelic(asContentId("relic-quiet-prism"))).toMatchObject({
      ok: true,
      value: { displayName: "Quiet Prism" },
    });
    expect(catalog.getRelic(asContentId("relic-spare-vector"))).toMatchObject({
      ok: true,
      value: { displayName: "Spare Vector" },
    });
    for (const definition of RELIC_DEFINITIONS) {
      expect(catalog.hasContent(definition.id)).toBe(true);
    }
  });

  it("keeps the unknown-relic lookup rejection typed", () => {
    const catalog = createContentCatalog();
    expect(catalog.getRelic(asContentId("relic-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "relic-unknown",
    });
  });

  it("returns a frozen relic enumeration", () => {
    const catalog = createContentCatalog();
    expect(Object.isFrozen(catalog.listRelics())).toBe(true);
  });
});