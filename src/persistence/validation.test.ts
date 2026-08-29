import { describe, expect, it } from "vitest";

import type { ContentId } from "../domain/content/catalog";
import { createContentCatalog } from "../domain/content/catalog";
import type { LivingRun, Profile } from "../domain/run/model";
import { createDefaultProfile, createInitialLivingRun } from "../domain/run/model";
import {
  parseLivingRunRecord,
  parseProfileRecord,
  parseRunStateRecords,
} from "./validation";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-1",
    now: 1_700_000_000_000,
    commitId: "commit-bootstrap",
  });
}

function makeLivingRun(): LivingRun {
  return createInitialLivingRun(
    catalog.contentVersion,
    asContentId("class-glitch-knight"),
    4,
    null,
    {
      runId: "run-1",
      seed: "seed-1",
      now: 1_700_000_000_100,
      commitId: "commit-start",
    },
  );
}

function makeShopRun(): LivingRun {
  return {
    ...makeLivingRun(),
    phase: "room",
    routeState: null,
    roomState: {
      roomId: "room-1",
      roomType: "shop",
      eventKey: "room:run-1:1",
      status: "ready",
      objectiveIds: [],
      threatProfile: {
        budget: 1,
        durabilityFactor: 1.25,
        density: 0.5,
        formationId: asContentId("formation-empty"),
        hazardIds: [],
        bossModifierIds: [],
      },
      combatCheckpoint: null,
      processedOutcomeIds: [],
      shop: {
        inventory: [
          {
            itemId: asContentId("item-test"),
            price: 2,
            effectParams: [{ key: "amount", value: 1.5 }],
          },
        ],
        purchasedItemIds: [],
      },
      recovery: null,
      boss: null,
      resolutionCommitId: null,
    },
    rewardState: null,
  };
}

function makeRewardRun(): LivingRun {
  const card = (index: number) => ({
    cardId: `card-${String(index)}`,
    baseRewardId: asContentId(`reward-${String(index)}`),
    rewardType: "currency" as const,
    enhancementIds: [] as ContentId[],
    rolledParams: [{ key: "amount", value: index }],
    materialCost: 0,
    tradeoffId: null,
  });
  return {
    ...makeLivingRun(),
    phase: "reward",
    routeState: null,
    roomState: null,
    rewardState: {
      eventKey: "reward:run-1:1",
      sourceRoomId: "room-1",
      cards: [card(1), card(2), card(3)],
      selectedCardId: null,
      selectionCommitId: null,
      status: "offered",
    },
  };
}

describe("profile record validation", () => {
  it("accepts and deeply clones the complete default profile", () => {
    const profile = makeProfile();
    const result = parseProfileRecord(profile, catalog);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(profile);
      expect(result.value).not.toBe(profile);
      expect(result.value.unlocks).not.toBe(profile.unlocks);
      expect(result.value.unlocks.classIds).not.toBe(profile.unlocks.classIds);
    }
  });

  it.each([
    ["unsupported schema", (profile: Profile) => ({ ...profile, saveSchemaVersion: 2 })],
    ["unsupported content", (profile: Profile) => ({ ...profile, contentVersion: "content-2" })],
    ["NaN", (profile: Profile) => ({ ...profile, shards: Number.NaN })],
    ["Infinity", (profile: Profile) => ({ ...profile, updatedAt: Number.POSITIVE_INFINITY })],
    ["unsafe integer", (profile: Profile) => ({ ...profile, revision: 2 ** 53 })],
    [
      "unknown class unlock",
      (profile: Profile) => ({
        ...profile,
        unlocks: {
          ...profile.unlocks,
          classIds: [...profile.unlocks.classIds, asContentId("class-unknown")],
        },
      }),
    ],
    [
      "duplicate unlock",
      (profile: Profile) => ({
        ...profile,
        unlocks: {
          ...profile.unlocks,
          classIds: [profile.unlocks.classIds[0]!, profile.unlocks.classIds[0]!],
        },
      }),
    ],
  ])("rejects %s", (_label, mutate) => {
    const result = parseProfileRecord(mutate(makeProfile()), catalog);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-profile" } });
  });

  it("rejects unexpected keys and oversized strings", () => {
    expect(
      parseProfileRecord({ ...makeProfile(), unexpected: true }, catalog),
    ).toMatchObject({ ok: false, error: { code: "invalid-profile" } });
    expect(
      parseProfileRecord({ ...makeProfile(), profileId: "x".repeat(257) }, catalog),
    ).toMatchObject({ ok: false, error: { code: "invalid-profile" } });
  });
});

describe("living-run record validation", () => {
  it("accepts and deeply clones the complete depth-one run", () => {
    const run = makeLivingRun();
    const result = parseLivingRunRecord(run, catalog);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(run);
      expect(result.value).not.toBe(run);
      expect(result.value.routeState).not.toBe(run.routeState);
    }
  });

  it.each([
    ["unknown class", (run: LivingRun) => ({ ...run, classId: asContentId("class-unknown") })],
    ["wrong class Integrity", (run: LivingRun) => ({ ...run, integrityMax: 3 })],
    ["unsafe depth", (run: LivingRun) => ({ ...run, depth: 2 ** 53 })],
    ["bad cycle", (run: LivingRun) => ({ ...run, cycle: 2 })],
    ["infinite currency", (run: LivingRun) => ({ ...run, runCurrency: Number.POSITIVE_INFINITY })],
    [
      "active-skill cap",
      (run: LivingRun) => ({
        ...run,
        build: {
          ...run.build,
          activeSkillIds: ["a", "b", "c", "d"].map(asContentId),
        },
      }),
    ],
    [
      "duplicate passive ID",
      (run: LivingRun) => ({
        ...run,
        build: {
          ...run.build,
          passiveEquipmentIds: [asContentId("equipment-a"), asContentId("equipment-a")],
        },
      }),
    ],
    ["incoherent phase", (run: LivingRun) => ({ ...run, phase: "room" as const })],
    [
      "wrong empty-route event key",
      (run: LivingRun) => ({
        ...run,
        routeState: { ...run.routeState!, eventKey: "route:wrong" },
      }),
    ],
  ])("rejects %s", (_label, mutate) => {
    const result = parseLivingRunRecord(mutate(makeLivingRun()), catalog);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });
  });

  it("rejects unexpected nested keys", () => {
    const run = makeLivingRun();
    const result = parseLivingRunRecord(
      { ...run, build: { ...run.build, executable: "no" } },
      catalog,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });
  });

  it("rejects malformed, duplicate, non-finite, and executable parameter values", () => {
    const malformed = makeShopRun();
    const shop = malformed.roomState!.shop!;
    const withValue = (value: unknown) => ({
      ...malformed,
      roomState: {
        ...malformed.roomState!,
        shop: {
          ...shop,
          inventory: [
            {
              ...shop.inventory[0]!,
              effectParams: [{ key: "amount", value }],
            },
          ],
        },
      },
    });

    for (const value of [{ nested: true }, Number.NaN, Number.POSITIVE_INFINITY, () => 1]) {
      expect(parseLivingRunRecord(withValue(value), catalog)).toMatchObject({
        ok: false,
        error: { code: "invalid-living-run" },
      });
    }

    expect(
      parseLivingRunRecord(
        {
          ...malformed,
          roomState: {
            ...malformed.roomState!,
            shop: {
              ...shop,
              inventory: [
                {
                  ...shop.inventory[0]!,
                  effectParams: [
                    { key: "amount", value: 1 },
                    { key: "amount", value: 2 },
                  ],
                },
              ],
            },
          },
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });
  });

  it("rejects class instances nested inside otherwise valid data", () => {
    class Parameter {
      readonly key = "amount";
      readonly value = 1;
    }
    const run = makeShopRun();
    const result = parseLivingRunRecord(
      {
        ...run,
        roomState: {
          ...run.roomState!,
          shop: {
            ...run.roomState!.shop!,
            inventory: [
              {
                ...run.roomState!.shop!.inventory[0]!,
                effectParams: [new Parameter()],
              },
            ],
          },
        },
      },
      catalog,
    );
    expect(result).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });
  });

  it("requires exactly three unique reward cards with legal rolled params", () => {
    const valid = makeRewardRun();
    expect(parseLivingRunRecord(valid, catalog).ok).toBe(true);

    expect(
      parseLivingRunRecord(
        {
          ...valid,
          rewardState: {
            ...valid.rewardState!,
            cards: valid.rewardState!.cards.slice(0, 2),
          },
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });

    expect(
      parseLivingRunRecord(
        {
          ...valid,
          rewardState: {
            ...valid.rewardState!,
            cards: [
              valid.rewardState!.cards[0],
              valid.rewardState!.cards[0],
              valid.rewardState!.cards[2],
            ],
          },
        },
        catalog,
      ),
    ).toMatchObject({ ok: false, error: { code: "invalid-living-run" } });
  });
});

describe("combined state validation", () => {
  it("accepts a matching unlocked profile and living run", () => {
    expect(parseRunStateRecords(makeProfile(), makeLivingRun(), catalog).ok).toBe(true);
  });

  it("rejects a known class that is locked in the profile", () => {
    const run = {
      ...makeLivingRun(),
      classId: asContentId("class-neon-mage"),
      integrityCurrent: 2,
      integrityMax: 2,
    };
    expect(parseRunStateRecords(makeProfile(), run, catalog)).toMatchObject({
      ok: false,
      error: { code: "invalid-living-run" },
    });
  });
});
