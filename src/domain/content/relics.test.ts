import { describe, expect, it } from "vitest";

import { RELIC_DEFINITIONS } from "./relics";

describe("relic registry", () => {
  it("authors exactly three relics in stable authored order", () => {
    expect(RELIC_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "relic-backfeed-cell",
      "relic-quiet-prism",
      "relic-spare-vector",
    ]);
  });

  it("keeps every relic ID unique and kebab-cased", () => {
    const ids = RELIC_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)).toBe(true);
    }
  });

  it("gives every relic non-blank display copy", () => {
    for (const definition of RELIC_DEFINITIONS) {
      expect(definition.id.startsWith("relic-")).toBe(true);
      expect(definition.displayName.trim().length).toBeGreaterThan(0);
      expect(definition.cappedDescription.trim().length).toBeGreaterThan(0);
      expect(definition.cappedDescription).toBe(definition.cappedDescription.trim());
    }
  });

  it("freezes the registry against mutation", () => {
    expect(Object.isFrozen(RELIC_DEFINITIONS)).toBe(true);
    for (const definition of RELIC_DEFINITIONS) {
      expect(Object.isFrozen(definition)).toBe(true);
    }
  });
});