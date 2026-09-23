import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import type { RunCommand } from "./commands";
import { runReducer } from "./reducer";
import type { LivingRun, Profile, RewardState, RunState } from "./model";
import { createDefaultProfile, createInitialLivingRun } from "./model";
import { cycleForDepth, routeEventKey } from "./routes";
import { validateRunState } from "./validation";
import { parseLivingRunRecord } from "../../persistence/validation";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;

const GLITCH_KNIGHT = asContentId("class-glitch-knight");
const TEST_CURRENCY = 999;

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-1",
    now: 1_700_000_000_000,
    commitId: "commit-boot",
  });
}

function makeLivingRun(overrides: Partial<LivingRun> = {}): LivingRun {
  return {
    ...createInitialLivingRun(catalog.contentVersion, GLITCH_KNIGHT, 4, null, {
      runId: "run-1",
      seed: "seed-1",
      now: 1_700_000_000_000,
      commitId: "commit-start",
    }),
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function stateWith(run: LivingRun | null): RunState {
  return { profile: makeProfile(), livingRun: run };
}

function materializeCommand(
  overrides: Partial<Extract<RunCommand, { type: "MaterializeRoute" }>> = {},
): RunCommand {
  return {
    type: "MaterializeRoute",
    runId: "run-1",
    expectedRevision: 0,
    commitId: "commit-materialize",
    now: 1_700_000_000_100,
    ...overrides,
  };
}

function selectRouteCommand(offerId: string, expectedRevision: number): RunCommand {
  return {
    type: "SelectRouteOffer",
    runId: "run-1",
    expectedRevision,
    offerId,
    commitId: "commit-select",
    now: 1_700_000_000_200,
  };
}

function commitRouteCommand(expectedRevision: number): RunCommand {
  return {
    type: "CommitRoute",
    runId: "run-1",
    expectedRevision,
    commitId: "commit-route",
    now: 1_700_000_000_300,
  };
}

function buyShopItemCommand(
  expectedRevision: number,
  overrides: Partial<Extract<RunCommand, { type: "BuyShopItem" }>> = {},
): RunCommand {
  return {
    type: "BuyShopItem",
    runId: "run-1",
    expectedRevision,
    itemId: "item-unknown",
    commitId: "commit-buy",
    now: 1_700_000_000_400,
    ...overrides,
  };
}

function commitRecoveryCommand(
  expectedRevision: number,
  overrides: Partial<Extract<RunCommand, { type: "CommitRecovery" }>> = {},
): RunCommand {
  return {
    type: "CommitRecovery",
    runId: "run-1",
    expectedRevision,
    commitId: "commit-recovery",
    now: 1_700_000_000_400,
    ...overrides,
  };
}

function resolveCommand(
  expectedRevision: number,
  overrides: Partial<Extract<RunCommand, { type: "ResolveRoom" }>> = {},
): RunCommand {
  return {
    type: "ResolveRoom",
    runId: "run-1",
    expectedRevision,
    commitId: "commit-resolve",
    now: 1_700_000_000_400,
    ...overrides,
  };
}

function selectRewardCommand(
  expectedRevision: number,
  cardId: string,
  overrides: Partial<Extract<RunCommand, { type: "SelectReward" }>> = {},
): RunCommand {
  return {
    type: "SelectReward",
    runId: "run-1",
    expectedRevision,
    cardId,
    commitId: "commit-reward",
    now: 1_700_000_000_500,
    ...overrides,
  };
}

/** Drive the committed lifecycle to `phase: "room"` for the requested room type. */
function runInRoomPhase(roomType: "battle" | "shop" | "recovery"): RunState {
  let state = stateWith(makeLivingRun());
  const materialized = runReducer(state, materializeCommand(), catalog);
  if (!materialized.ok) throw new Error("materialize must succeed");
  state = materialized.state;
  const offer = state.livingRun!.routeState!.offers.find(
    (candidate) => candidate.roomType === roomType,
  )!;
  const selected = runReducer(state, selectRouteCommand(offer.offerId, 1), catalog);
  if (!selected.ok) throw new Error("select must succeed");
  state = selected.state;
  const committed = runReducer(state, commitRouteCommand(2), catalog);
  if (!committed.ok) throw new Error("commit must succeed");
  return committed.state;
}

/** A shop-room state whose run currency can afford any seeded inventory item. */
function fundedShopRoomState(): RunState {
  const state = runInRoomPhase("shop");
  return {
    ...state,
    livingRun: { ...state.livingRun!, runCurrency: TEST_CURRENCY },
  };
}

/** Resolve a utility room and return the advanced reward-phase state. */
function runInRewardPhase(roomType: "shop" | "recovery"): RunState {
  const state = runInRoomPhase(roomType);
  const resolved = runReducer(state, resolveCommand(3), catalog);
  if (!resolved.ok) throw new Error(`resolve must succeed for ${roomType}`);
  return resolved.state;
}

function expectRejection(transition: ReturnType<typeof runReducer>, code: string): void {
  expect(transition.ok).toBe(false);
  if (!transition.ok) {
    expect(transition.error.code).toBe(code);
  }
}

function expectInvalidMetadata(
  transition: ReturnType<typeof runReducer>,
  field: string,
): void {
  expect(transition.ok).toBe(false);
  if (!transition.ok) {
    expect(transition.error).toEqual({ code: "invalid-metadata", field });
  }
}

function expectPersistableLivingRun(state: RunState): LivingRun {
  const run = state.livingRun!;
  expect(validateRunState(state, catalog)).toEqual({ ok: true });
  const parsed = parseLivingRunRecord(run, catalog);
  expect(parsed.ok).toBe(true);
  return run;
}

describe("runReducer — BuyShopItem", () => {
  it("purchases an item, deducts currency, and marks the room in progress", () => {
    const state = fundedShopRoomState();
    const room = state.livingRun!.roomState!;
    const item = room.shop!.inventory[0]!;
    const currencyBefore = state.livingRun!.runCurrency;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(buyShopItemCommand(3, { itemId: item.itemId })),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.roomState!.shop!.purchasedItemIds).toEqual([item.itemId]);
      expect(run.runCurrency).toBe(currencyBefore - item.price);
      expect(run.roomState!.status).toBe("in_progress");
      expect(run.roomState!.shop!.inventory).toEqual(room.shop!.inventory);
      expect(run.revision).toBe(4);
      expect(run.lastCommitId).toBe("commit-buy");
      expect(transition.persistence).toEqual({
        kind: "save-checkpoint",
        runId: "run-1",
        commitId: "commit-buy",
        expectedRevision: 3,
      });
      expect(run.updatedAt).toBe(1_700_000_000_400);
    }
  });

  it("rejects a re-purchase of the same item", () => {
    const state = fundedShopRoomState();
    const item = state.livingRun!.roomState!.shop!.inventory[0]!;
    const first = runReducer(state, buyShopItemCommand(3, { itemId: item.itemId }), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runReducer(
      first.state,
      buyShopItemCommand(4, { itemId: item.itemId }),
      catalog,
    );
    expectRejection(second, "shop-item-already-purchased");
    expect(second.state).toBe(first.state);
  });

  it("rejects a purchase the run currency cannot afford", () => {
    const state = fundedShopRoomState();
    const item = state.livingRun!.roomState!.shop!.inventory[0]!;
    const brokeState: RunState = {
      ...state,
      livingRun: { ...state.livingRun!, runCurrency: 0 },
    };

    const transition = runReducer(
      brokeState,
      buyShopItemCommand(3, { itemId: item.itemId }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("insufficient-currency");
      if (transition.error.code === "insufficient-currency") {
        expect(transition.error.required).toBe(item.price);
        expect(transition.error.available).toBe(0);
      }
      expect(transition.state).toBe(brokeState);
    }
  });

  it("rejects an item that is not in the shop inventory", () => {
    const state = fundedShopRoomState();
    const transition = runReducer(
      state,
      buyShopItemCommand(3, { itemId: "item-not-stock" }),
      catalog,
    );
    expectRejection(transition, "unknown-shop-item");
    expect(transition.state).toBe(state);
  });

  it("rejects a purchase in a non-shop room", () => {
    const state = runInRoomPhase("recovery");
    const transition = runReducer(state, buyShopItemCommand(3), catalog);
    expectRejection(transition, "room-not-shop-type");
    if (!transition.ok && transition.error.code === "room-not-shop-type") {
      expect(transition.error.roomType).toBe("recovery");
    }
  });

  it("rejects a purchase in a resolved room", () => {
    const state = fundedShopRoomState();
    const room = state.livingRun!.roomState!;
    const resolvedState: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: { ...room, status: "resolved", resolutionCommitId: "commit-prior" },
      },
    };
    const item = room.shop!.inventory[0]!;
    const transition = runReducer(
      resolvedState,
      buyShopItemCommand(3, { itemId: item.itemId }),
      catalog,
    );
    expectRejection(transition, "room-already-resolved");
    expect(transition.state).toBe(resolvedState);
  });

  it("rejects a purchase outside the room phase", () => {
    const state = stateWith(makeLivingRun());
    const transition = runReducer(state, buyShopItemCommand(0), catalog);
    expectRejection(transition, "invalid-state");
  });

  it("rejects stale metadata and revisions", () => {
    const state = fundedShopRoomState();
    expectInvalidMetadata(runReducer(state, buyShopItemCommand(3, { runId: "" }), catalog), "runId");
    expectInvalidMetadata(runReducer(state, buyShopItemCommand(3, { itemId: "" }), catalog), "itemId");
    expectInvalidMetadata(runReducer(state, buyShopItemCommand(3, { now: Number.NaN }), catalog), "now");
    const stale = runReducer(state, buyShopItemCommand(9, { itemId: "item-not-stock" }), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});

describe("runReducer — CommitRecovery", () => {
  it("restores integrity, clamps to the maximum, and marks committed", () => {
    const state = runInRoomPhase("recovery");
    const room = state.livingRun!.roomState!;
    const restoreAmount = room.recovery!.restoreAmount;
    const before = state.livingRun!.integrityCurrent;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(commitRecoveryCommand(3)),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.roomState!.recovery!.committed).toBe(true);
      expect(run.roomState!.recovery!.commitId).toBe("commit-recovery");
      expect(run.integrityCurrent).toBe(Math.min(before + restoreAmount, run.integrityMax));
      expect(run.roomState!.status).toBe("in_progress");
      expect(run.revision).toBe(4);
      expect(run.lastCommitId).toBe("commit-recovery");
      expect(transition.persistence).toEqual({
        kind: "save-checkpoint",
        runId: "run-1",
        commitId: "commit-recovery",
        expectedRevision: 3,
      });
      expect(run.updatedAt).toBe(1_700_000_000_400);
    }
  });

  it("clamps a full-integrity restore without exceeding the maximum", () => {
    const state = runInRoomPhase("recovery");
    const fullState: RunState = {
      ...state,
      livingRun: { ...state.livingRun!, integrityCurrent: state.livingRun!.integrityMax },
    };

    const transition = runReducer(fullState, commitRecoveryCommand(3), catalog);
    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.integrityCurrent).toBe(run.integrityMax);
      expect(run.roomState!.recovery!.committed).toBe(true);
    }
  });

  it("rejects a re-commit after recovery was applied", () => {
    const state = runInRoomPhase("recovery");
    const first = runReducer(state, commitRecoveryCommand(3), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runReducer(first.state, commitRecoveryCommand(4), catalog);
    expectRejection(second, "recovery-already-committed");
    expect(second.state).toBe(first.state);
  });

  it("rejects a commit in a non-recovery room", () => {
    const state = runInRoomPhase("shop");
    const transition = runReducer(state, commitRecoveryCommand(3), catalog);
    expectRejection(transition, "room-not-recovery-type");
    if (!transition.ok && transition.error.code === "room-not-recovery-type") {
      expect(transition.error.roomType).toBe("shop");
    }
  });

  it("rejects a commit in a resolved room", () => {
    const state = runInRoomPhase("recovery");
    const room = state.livingRun!.roomState!;
    const resolvedState: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: { ...room, status: "resolved", resolutionCommitId: "commit-prior" },
      },
    };
    const transition = runReducer(resolvedState, commitRecoveryCommand(3), catalog);
    expectRejection(transition, "room-already-resolved");
  });

  it("rejects stale metadata and revisions", () => {
    const state = runInRoomPhase("recovery");
    expectInvalidMetadata(runReducer(state, commitRecoveryCommand(3, { runId: "" }), catalog), "runId");
    expectInvalidMetadata(runReducer(state, commitRecoveryCommand(3, { commitId: "" }), catalog), "commitId");
    expectInvalidMetadata(runReducer(state, commitRecoveryCommand(3, { now: Number.NaN }), catalog), "now");
    const stale = runReducer(state, commitRecoveryCommand(9), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});describe("runReducer — ResolveRoom", () => {
  it.each([
    ["shop"],
    ["recovery"],
  ])("resolves a %s room into the reward phase with three cards", (roomType) => {
    const state = runInRoomPhase(roomType as "shop" | "recovery");
    const roomsResolvedBefore = state.livingRun!.progress.roomsResolved;
    const roomBefore = state.livingRun!.roomState!;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(resolveCommand(3)),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.phase).toBe("reward");
      const reward = run.rewardState!;
      expect(run.roomState).toBeNull();
      expect(reward.cards).toHaveLength(3);
      expect(new Set(reward.cards.map((card) => card.cardId)).size).toBe(3);
      expect(reward.status).toBe("offered");
      expect(reward.selectedCardId).toBeNull();
      expect(reward.selectionCommitId).toBeNull();
      expect(reward.displacedRewardId).toBeNull();
      expect(reward.displacedSlot).toBeNull();
      expect(reward.sourceRoomId).toBe(`${roomBefore.eventKey}:candidate`);
      expect(reward.eventKey).toBe(`${roomBefore.eventKey}:reward`);
      expect(run.progress.roomsResolved).toBe(roomsResolvedBefore + 1);
      expect(run.revision).toBe(4);
      expect(run.lastCommitId).toBe("commit-resolve");
      expect(transition.persistence).toEqual({
        kind: "save-checkpoint",
        runId: "run-1",
        commitId: "commit-resolve",
        expectedRevision: 3,
      });
      expect(run.updatedAt).toBe(1_700_000_000_400);

      // Reload simulation: the durable record parses back to the same draft.
      const reloaded = parseLivingRunRecord(run, catalog);
      expect(reloaded.ok).toBe(true);
      if (reloaded.ok) {
        expect(reloaded.value.rewardState).toEqual(reward);
      }
    }
  });

  it("maps every generated card field without loss (CA-01)", () => {
    const state = runInRewardPhase("shop");
    const reward = state.livingRun!.rewardState!;
    for (const card of reward.cards) {
      expect(card.rewardType === "skill" || card.rewardType === "equipment").toBe(true);
      expect(
        card.rewardType === "skill"
          ? catalog.getSkill(card.baseRewardId).ok
          : catalog.getEquipment(card.baseRewardId).ok,
      ).toBe(true);
      expect(new Set(card.enhancementIds).size).toBe(card.enhancementIds.length);
      expect(card.rolledParams).toHaveLength(card.enhancementIds.length);
      for (const param of card.rolledParams) {
        const enhancement = catalog.getEnhancement(
          card.enhancementIds[card.rolledParams.indexOf(param)] as ContentId,
        );
        expect(enhancement.ok).toBe(true);
        if (enhancement.ok) {
          expect(param.key).toBe(enhancement.value.effectKey);
        }
      }
      expect(Number.isSafeInteger(card.materialCost)).toBe(true);
      expect(card.materialCost).toBeGreaterThanOrEqual(0);
      expect(card.tradeoffId).toBeNull();
    }
  });

  it("rejects a battle room with combat-not-implemented", () => {
    const state = runInRoomPhase("battle");
    const transition = runReducer(state, resolveCommand(3), catalog);
    expectRejection(transition, "combat-not-implemented");
    if (!transition.ok && transition.error.code === "combat-not-implemented") {
      expect(transition.error.roomType).toBe("battle");
    }
    expect(transition.state).toBe(state);
  });

  it("rejects a re-resolve of an already-resolved room", () => {
    const state = runInRoomPhase("shop");
    const room = state.livingRun!.roomState!;
    const resolvedRoomState: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: { ...room, status: "resolved", resolutionCommitId: "commit-prior" },
      },
    };
    const transition = runReducer(resolvedRoomState, resolveCommand(3), catalog);
    expectRejection(transition, "room-already-resolved");
    expect(transition.state).toBe(resolvedRoomState);
  });

  it("rejects resolution outside the room phase", () => {
    const state = stateWith(makeLivingRun());
    const transition = runReducer(state, resolveCommand(0), catalog);
    expectRejection(transition, "invalid-state");
  });

  it("rejects stale metadata and revisions", () => {
    const state = runInRoomPhase("shop");
    expectInvalidMetadata(runReducer(state, resolveCommand(3, { runId: "" }), catalog), "runId");
    expectInvalidMetadata(runReducer(state, resolveCommand(3, { commitId: "" }), catalog), "commitId");
    expectInvalidMetadata(runReducer(state, resolveCommand(3, { now: Number.NaN }), catalog), "now");
    const stale = runReducer(state, resolveCommand(9), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});

function buildCard(
  cardId: string,
  baseRewardId: ContentId,
  rewardType: "skill" | "equipment",
) {
  return {
    cardId,
    baseRewardId,
    rewardType,
    enhancementIds: [] as ContentId[],
    rolledParams: [],
    materialCost: 0,
    tradeoffId: null,
  };
}

function fullBuildStateWith(state: RunState, card: ReturnType<typeof buildCard>): RunState {
  return {
    ...state,
    livingRun: {
      ...state.livingRun!,
      rewardState: {
        ...state.livingRun!.rewardState!,
        cards: [card, ...state.livingRun!.rewardState!.cards.slice(1)] as unknown as RewardState["cards"],
      },
    },
  };
}

describe("runReducer — SelectReward", () => {
  it("applies the reward, advances depth, and materializes the next route", () => {
    const state = runInRewardPhase("shop");
    const reward = state.livingRun!.rewardState!;
    const card = reward.cards[0]!;
    const depthBefore = state.livingRun!.depth;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(selectRewardCommand(4, card.cardId)),
      catalog,
    );

    expect(transition.ok, JSON.stringify(transition.ok ? null : transition.error)).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.phase).toBe("route");
      expect(run.routeState).not.toBeNull();
      expect(run.rewardState).toBeNull();
      expect(run.depth).toBe(depthBefore + 1);
      expect(run.cycle).toBe(cycleForDepth(depthBefore + 1));
      expect(run.routeState!.eventKey).toBe(
        routeEventKey("run-1", catalog.contentVersion, depthBefore + 1),
      );
      expect(run.routeState!.offers.length).toBeGreaterThan(0);
      expect(run.routeState!.selectedOfferId).toBeNull();
      expect(run.routeState!.committed).toBe(false);
      expect(run.revision).toBe(5);
      expect(transition.persistence).toEqual({
        kind: "save-checkpoint",
        runId: "run-1",
        commitId: "commit-reward",
        expectedRevision: 4,
      });
      expect(run.updatedAt).toBe(1_700_000_000_500);
    }
  });

  it("replaces the earliest skill when the active side is full", () => {
    const state = runInRewardPhase("shop");
    const fullState: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        build: {
          ...state.livingRun!.build,
          activeSkillIds: [
            asContentId("skill-phase-shunt"),
            asContentId("skill-prism-burst"),
            asContentId("skill-rebound-lens"),
          ],
        },
      },
    };
    const skillCard = buildCard("replacement-card", asContentId("skill-shield-bash"), "skill");
    const draftState = fullBuildStateWith(fullState, skillCard);

    const transition = runReducer(
      deepFreeze(draftState),
      deepFreeze(selectRewardCommand(4, "replacement-card")),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.build.activeSkillIds).toEqual([
        "skill-prism-burst",
        "skill-rebound-lens",
        "skill-shield-bash",
      ]);
      // Displacement is visible in the durable build diff; the applied record
      // itself is not retained once the phase returns to route.
      expect(run.build.activeSkillIds[0]).not.toBe("skill-phase-shunt");
      expect(run.build.activeSkillIds).toHaveLength(3);
    }
  });

  it("replaces the earliest equipment item when the passive side is full", () => {
    const state = runInRewardPhase("recovery");
    const fullEquipmentState: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        build: {
          ...state.livingRun!.build,
          passiveEquipmentIds: [
            asContentId("equipment-fractal-core"),
            asContentId("equipment-arc-coil"),
            asContentId("equipment-soft-patch"),
            asContentId("equipment-static-ward"),
          ],
        },
      },
    };
    const equipmentCard = buildCard(
      "replacement-equipment-card",
      asContentId("equipment-mirror-plating"),
      "equipment",
    );
    const draftState = fullBuildStateWith(fullEquipmentState, equipmentCard);

    const transition = runReducer(
      deepFreeze(draftState),
      deepFreeze(selectRewardCommand(4, "replacement-equipment-card")),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.build.passiveEquipmentIds).toEqual([
        "equipment-arc-coil",
        "equipment-soft-patch",
        "equipment-static-ward",
        "equipment-mirror-plating",
      ]);
      expect(run.build.passiveEquipmentIds[0]).not.toBe("equipment-fractal-core");
      expect(run.build.passiveEquipmentIds).toHaveLength(4);
    }
  });

  it("appends without displacement while a side has capacity", () => {
    const state = runInRewardPhase("shop");
    const reward = state.livingRun!.rewardState!;
    const skillCard = reward.cards.find((card) => card.rewardType === "skill");
    if (skillCard === undefined) {
      throw new Error("seeded draft fixture must include a skill card for this room");
    }
    const activeBefore = [...state.livingRun!.build.activeSkillIds];

    const transition = runReducer(state, selectRewardCommand(4, skillCard.cardId), catalog);
    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.build.activeSkillIds).toEqual([...activeBefore, skillCard.baseRewardId]);
      expect(run.build.activeSkillIds).toHaveLength(activeBefore.length + 1);
    }
  });

  it("rejects a second selection from the same draft", () => {
    const state = runInRewardPhase("shop");
    const cardId = state.livingRun!.rewardState!.cards[0]!.cardId;
    const first = runReducer(state, selectRewardCommand(4, cardId), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runReducer(first.state, selectRewardCommand(5, cardId), catalog);
    expectRejection(second, "invalid-state");
    expect(second.state).toBe(first.state);
  });

  it("rejects a card outside the draft", () => {
    const state = runInRewardPhase("shop");
    const transition = runReducer(state, selectRewardCommand(4, "card-not-in-draft"), catalog);
    expectRejection(transition, "unknown-reward-card");
    expect(transition.state).toBe(state);
  });

  it("rejects a selection outside the reward phase", () => {
    const state = stateWith(makeLivingRun());
    const transition = runReducer(state, selectRewardCommand(0, "any"), catalog);
    expectRejection(transition, "invalid-state");
  });

  it("rejects stale metadata and revisions", () => {
    const state = runInRewardPhase("shop");
    expectInvalidMetadata(runReducer(state, selectRewardCommand(4, "", { runId: "" }), catalog), "runId");
    expectInvalidMetadata(runReducer(state, selectRewardCommand(4, "", { cardId: "" }), catalog), "cardId");
    expectInvalidMetadata(runReducer(state, selectRewardCommand(4, "any", { now: Number.NaN }), catalog), "now");
    const stale = runReducer(state, selectRewardCommand(9, "any"), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});

describe("full room lifecycle coherence", () => {
  it("commit → recovery → resolve → select produces a valid depth-2 route run", () => {
    let state = runInRoomPhase("recovery");
    const recovered = runReducer(state, commitRecoveryCommand(3), catalog);
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) return;
    state = recovered.state;

    const resolved = runReducer(state, resolveCommand(4), catalog);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    state = resolved.state;

    const cardId = state.livingRun!.rewardState!.cards[0]!.cardId;
    const advanced = runReducer(state, selectRewardCommand(5, cardId), catalog);
    expect(advanced.ok).toBe(true);
    if (!advanced.ok) return;
    state = advanced.state;

    const run = state.livingRun!;
    expect(run.phase).toBe("route");
    expect(run.depth).toBe(2);
    expect(run.cycle).toBe(cycleForDepth(2));
    expect(run.routeState!.offers.length).toBeGreaterThan(0);
    expect(run.progress.roomsResolved).toBe(1);
    expect(run.revision).toBe(6);
    expect(validateRunState(state, catalog)).toEqual({ ok: true });
    expect(parseLivingRunRecord(run, catalog).ok).toBe(true);
  });
});
