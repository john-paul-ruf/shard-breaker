import { describe, expect, it } from "vitest";

import type { ContentId } from "./catalog";
import { createContentCatalog } from "./catalog";
import type { EnemyDefinition } from "./enemies";
import { ENEMY_DEFINITIONS } from "./enemies";

const asContentId = (value: string): ContentId => value as ContentId;

describe("enemy content", () => {
  it("authors six distinct enemies covering every behavior and health tier", () => {
    expect(ENEMY_DEFINITIONS).toHaveLength(6);
    expect(new Set(ENEMY_DEFINITIONS.map((enemy) => enemy.id)).size).toBe(6);
    expect(new Set(ENEMY_DEFINITIONS.map((enemy) => enemy.behavior)).size).toBe(
      4,
    );
    for (const health of [1, 2, 3] as const) {
      expect(ENEMY_DEFINITIONS.some((enemy) => enemy.baseHealth === health)).toBe(
        true,
      );
    }
    for (const behavior of [
      "static",
      "regenerating",
      "phasing",
      "splintering",
    ] as const) {
      expect(ENEMY_DEFINITIONS.some((enemy) => enemy.behavior === behavior)).toBe(
        true,
      );
    }
  });

  it("gives every enemy visible labels and a bounded behavior param", () => {
    for (const enemy of ENEMY_DEFINITIONS) {
      expect(enemy.id.startsWith("enemy-")).toBe(true);
      expect(enemy.displayName.trim()).not.toBe("");
      expect(enemy.glyph.trim()).not.toBe("");
      expect([1, 2, 3]).toContain(enemy.baseHealth);
      expect(enemy.availability).toBe("initial");
      if (enemy.behavior === "static" || enemy.behavior === "splintering") {
        expect(enemy.behaviorParam).toBe(0);
      } else {
        expect(Number.isSafeInteger(enemy.behaviorParam)).toBe(true);
        expect(enemy.behaviorParam).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("creates distinct targeting priorities from behavior and health", () => {
    const catalog = createContentCatalog();
    const prism = catalog.getEnemy(asContentId("enemy-sprite-prism"));
    expect(prism.ok).toBe(true);
    if (prism.ok) {
      expect(prism.value.displayName).toBe("Prism");
      expect(prism.value.baseHealth).toBe(3);
    }
    const drifter = catalog.getEnemy(asContentId("enemy-sprite-drifter"));
    expect(drifter.ok).toBe(true);
    if (drifter.ok) {
      expect(drifter.value.behavior).toBe("phasing");
      expect(drifter.value.baseHealth).toBe(1);
    }
  });

  it("resolves every authored enemy through the catalog facade", () => {
    const catalog = createContentCatalog();
    for (const enemy of ENEMY_DEFINITIONS) {
      const result = catalog.getEnemy(enemy.id);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.displayName).toBe(enemy.displayName);
        expect(result.value.behavior).toBe(enemy.behavior);
      }
      expect(catalog.hasContent(enemy.id)).toBe(true);
    }
  });

  it("returns a typed rejection for an unknown enemy ID", () => {
    const catalog = createContentCatalog();
    expect(catalog.getEnemy(asContentId("enemy-unknown"))).toEqual({
      ok: false,
      code: "unknown-content-id",
      contentId: "enemy-unknown",
    });
  });

  it("returns frozen enemy arrays and protects them from mutation", () => {
    const catalog = createContentCatalog();
    expect(Object.isFrozen(ENEMY_DEFINITIONS)).toBe(true);
    expect(Object.isFrozen(catalog.listEnemies())).toBe(true);
    expect(() => {
      (catalog.listEnemies() as EnemyDefinition[]).push(ENEMY_DEFINITIONS[0]!);
    }).toThrow();
  });
});