import { describe, expect, it } from "vitest";

import type { ContentId } from "./catalog";
import { createContentCatalog } from "./catalog";
import type { BossModifierDefinition } from "./bosses";
import { BOSS_DEFINITIONS, BOSS_ROUTING_IDENTITIES } from "./bosses";

const asContentId = (value: string): ContentId => value as ContentId;

describe("boss content", () => {
  it("authors exactly four archetypes matching the routing identities", () => {
    expect(BOSS_DEFINITIONS).toHaveLength(4);
    expect(BOSS_DEFINITIONS.map((boss) => boss.id)).toEqual(
      BOSS_ROUTING_IDENTITIES.map((identity) => identity.id),
    );
  });

  it("keeps every definition an immutable extension of its routing identity", () => {
    for (const boss of BOSS_DEFINITIONS) {
      expect(boss.id.startsWith("boss-")).toBe(true);
      expect(boss.displayName.trim()).not.toBe("");
      expect(boss.identityLabel.trim()).not.toBe("");
      expect(boss.identitySummary.trim()).not.toBe("");
      expect(boss.counterplay.trim()).not.toBe("");
      expect(Object.isFrozen(boss)).toBe(true);
      expect(Object.isFrozen(boss.phases)).toBe(true);
      expect(Object.isFrozen(boss.telegraphs)).toBe(true);
      expect(Object.isFrozen(boss.compatibleModifiers)).toBe(true);
    }
    expect(Object.isFrozen(BOSS_DEFINITIONS)).toBe(true);
  });

  it("preserves the routing-identity fields without combat fields on the routing list", () => {
    expect(
      BOSS_ROUTING_IDENTITIES.map(({ id, displayName, identityLabel }) => ({
        id,
        displayName,
        identityLabel,
      })),
    ).toEqual([
      {
        id: "boss-warden",
        displayName: "Warden",
        identityLabel:
          "Shield lattice — break outer nodes before pressuring the core.",
      },
      {
        id: "boss-broodmother",
        displayName: "Broodmother",
        identityLabel:
          "Swarm control — clear spawned lanes before they close angles.",
      },
      {
        id: "boss-null-architect",
        displayName: "Null Architect",
        identityLabel:
          "Field denial — preserve a safe rebound route through shifting space.",
      },
      {
        id: "boss-leech",
        displayName: "Leech",
        identityLabel:
          "Sustain pressure — interrupt recovery windows with focused hits.",
      },
    ]);
    for (const identity of BOSS_ROUTING_IDENTITIES) {
      expect(Object.keys(identity).sort()).toEqual([
        "displayName",
        "id",
        "identityLabel",
      ]);
    }
  });

  it.each(BOSS_DEFINITIONS.map((boss) => [boss.displayName, boss] as const))(
    "%s carries three descending phases with conditions",
    (_name, boss) => {
      expect(boss.phases).toHaveLength(3);
      for (const [index, phase] of boss.phases.entries()) {
        expect(phase.id.trim()).not.toBe("");
        expect(phase.id).not.toBe("routing");
        expect(phase.displayName.trim()).not.toBe("");
        expect(phase.transitionCondition.trim()).not.toBe("");
        expect(phase.hpThreshold).toBeGreaterThan(0);
        expect(phase.hpThreshold).toBeLessThanOrEqual(1);
        if (index > 0) {
          expect(phase.hpThreshold).toBeLessThan(
            boss.phases[index - 1]!.hpThreshold,
          );
        }
      }
      expect(boss.phases[0]!.hpThreshold).toBe(1);
    },
  );

  it.each(BOSS_DEFINITIONS.map((boss) => [boss.displayName, boss] as const))(
    "%s telegraphs every high-impact attack with name, counterplay, and a timed window",
    (_name, boss) => {
      expect(boss.telegraphs.length).toBeGreaterThanOrEqual(2);
      const telegraphIds = new Set<string>();
      for (const telegraph of boss.telegraphs) {
        expect(telegraph.id.trim()).not.toBe("");
        expect(telegraph.displayName.trim()).not.toBe("");
        expect(telegraph.counterplay.trim()).not.toBe("");
        expect(telegraph.windowSeconds).toBeGreaterThan(0);
        expect(telegraph.windowSeconds).toBeLessThanOrEqual(4);
        telegraphIds.add(telegraph.id);
      }
      expect(telegraphIds.size).toBe(boss.telegraphs.length);
    },
  );

  it.each(BOSS_DEFINITIONS.map((boss) => [boss.displayName, boss] as const))(
    "%s holds a bounded node count and two to three capped modifiers",
    (_name, boss) => {
      expect([1, 2, 3]).toContain(boss.shieldNodeCount);
      expect(boss.compatibleModifiers.length).toBeGreaterThanOrEqual(2);
      expect(boss.compatibleModifiers.length).toBeLessThanOrEqual(3);
      const modifierIds = new Set<string>();
      for (const entry of boss.compatibleModifiers) {
        expect(entry.id.startsWith("boss-modifier-")).toBe(true);
        expect(entry.displayName.trim()).not.toBe("");
        expect(entry.cappedDescription.trim()).not.toBe("");
        expect(
          entry.compatibleArchetypeIds === "any" ||
            entry.compatibleArchetypeIds.includes(boss.id),
        ).toBe(true);
        modifierIds.add(entry.id);
      }
      expect(modifierIds.size).toBe(boss.compatibleModifiers.length);
    },
  );

  it("carries shared modifiers as the same frozen definitions across archetypes", () => {
    const ids = BOSS_DEFINITIONS.flatMap((boss) =>
      boss.compatibleModifiers.map((entry) => entry.id),
    );
    // 4 archetypes × (2 shared + 1 archetype-specific) = 12 slots over 6
    // unique definitions: reuse is by identity, never duplicate authoring.
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(6);
    const definitionsById = new Map<string, BossModifierDefinition>();
    for (const boss of BOSS_DEFINITIONS) {
      for (const entry of boss.compatibleModifiers) {
        const existing = definitionsById.get(entry.id);
        if (existing === undefined) {
          definitionsById.set(entry.id, entry);
        } else {
          expect(existing).toBe(entry);
        }
      }
    }
  });

  it("resolves every boss definition through the catalog facade", () => {
    const catalog = createContentCatalog();
    for (const boss of BOSS_DEFINITIONS) {
      const result = catalog.getBoss(boss.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(boss);
      }
      expect(catalog.hasContent(boss.id)).toBe(true);
    }
  });

  it("resolves the full warden anatomy through catalog lookups", () => {
    const catalog = createContentCatalog();
    const result = catalog.getBoss(asContentId("boss-warden"));
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.phases.map((phase) => phase.id)).toEqual([
      "lock",
      "split",
      "breach",
    ]);
    expect(result.value.telegraphs.map((telegraph) => telegraph.id)).toEqual([
      "prism-sweep",
      "lattice-recycle",
    ]);
    expect(result.value.shieldNodeCount).toBe(3);
  });

  it("returns a typed rejection for an unknown boss ID", () => {
    const catalog = createContentCatalog();
    expect(catalog.getBoss(asContentId("boss-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "boss-unknown",
    });
  });
});