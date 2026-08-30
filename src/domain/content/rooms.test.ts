import { describe, expect, it } from "vitest";

import { createContentCatalog } from "./catalog";
import { BOSS_ROUTING_IDENTITIES } from "./bosses";
import {
  RECOVERY_RESTORE_AMOUNT,
  ROOM_DEFINITIONS,
  ROUTE_SUPPORT_DEFINITIONS,
  SHOP_SERVICE_DEFINITIONS,
} from "./rooms";

describe("route and utility content", () => {
  it("authors one named room in each stable presentation category", () => {
    expect(
      ROOM_DEFINITIONS.map(({ roomType, displayName }) => ({
        roomType,
        displayName,
      })),
    ).toEqual([
      { roomType: "battle", displayName: "Glassway" },
      { roomType: "elite", displayName: "Overclock Pit" },
      { roomType: "shop", displayName: "Patchbay" },
      { roomType: "recovery", displayName: "Soft Reset" },
      { roomType: "boss", displayName: "Mandatory Boss" },
    ]);
  });

  it("gives every route visible labels and bounded risk", () => {
    for (const room of ROOM_DEFINITIONS) {
      expect(room.summary.trim()).not.toBe("");
      expect(room.riskLabel.trim()).not.toBe("");
      expect(room.rewardLabel.trim()).not.toBe("");
      expect(room.counterplay.trim()).not.toBe("");
      expect(Number.isSafeInteger(room.baseRiskTier)).toBe(true);
      expect(room.baseRiskTier).toBeGreaterThanOrEqual(0);
      expect(room.baseRiskTier).toBeLessThanOrEqual(5);
    }
  });

  it("defines every nested room reference as the expected support kind", () => {
    const supportById = new Map(
      ROUTE_SUPPORT_DEFINITIONS.map((definition) => [
        definition.id,
        definition,
      ]),
    );

    for (const room of ROOM_DEFINITIONS) {
      expect(supportById.get(room.formationId)?.kind).toBe("formation");
      for (const objectiveId of room.objectiveIds) {
        expect(supportById.get(objectiveId)?.kind).toBe("objective");
      }
      for (const hazardId of room.hazardPoolIds) {
        expect(supportById.get(hazardId)?.kind).toBe("hazard");
      }
      if (room.rewardPreviewId !== null) {
        expect(supportById.get(room.rewardPreviewId)?.kind).toBe(
          "reward-preview",
        );
      }
    }
  });

  it("limits utility effects to finite run-currency Integrity restoration", () => {
    expect(RECOVERY_RESTORE_AMOUNT).toBe(1);
    expect(SHOP_SERVICE_DEFINITIONS).toHaveLength(2);

    for (const service of SHOP_SERVICE_DEFINITIONS) {
      expect(Number.isSafeInteger(service.basePrice)).toBe(true);
      expect(service.basePrice).toBeGreaterThan(0);
      expect(service.effect.kind).toBe("restore-integrity");
      expect([1, 2]).toContain(service.effect.amount);
      expect(service.description).toContain("never above the run maximum");
    }
  });

  it("exposes the four stable boss routing identities without combat state", () => {
    expect(
      BOSS_ROUTING_IDENTITIES.map(({ id, displayName }) => ({ id, displayName })),
    ).toEqual([
      { id: "boss-warden", displayName: "Warden" },
      { id: "boss-broodmother", displayName: "Broodmother" },
      { id: "boss-null-architect", displayName: "Null Architect" },
      { id: "boss-leech", displayName: "Leech" },
    ]);
    for (const boss of BOSS_ROUTING_IDENTITIES) {
      expect(boss.identityLabel.trim()).not.toBe("");
      expect(Object.keys(boss).sort()).toEqual([
        "displayName",
        "id",
        "identityLabel",
      ]);
    }
  });

  it("resolves every route, service, boss, and nested ID through content-1", () => {
    const catalog = createContentCatalog();
    const referencedIds = ROOM_DEFINITIONS.flatMap((room) => [
      room.id,
      room.formationId,
      ...room.objectiveIds,
      ...room.hazardPoolIds,
      ...(room.rewardPreviewId === null ? [] : [room.rewardPreviewId]),
    ]);

    for (const id of [
      ...referencedIds,
      ...SHOP_SERVICE_DEFINITIONS.map((service) => service.id),
      ...BOSS_ROUTING_IDENTITIES.map((boss) => boss.id),
    ]) {
      expect(catalog.hasContent(id)).toBe(true);
    }
  });
});
