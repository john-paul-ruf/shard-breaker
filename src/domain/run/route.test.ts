import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import type { RunCommand, RunPersistenceInstruction } from "./commands";
import { runReducer } from "./reducer";
import type { LivingRun, Profile, RunState } from "./model";
import {
  createDefaultProfile,
  createInitialLivingRun,
} from "./model";
import { isBossDepth, routeEventKey } from "./routes";
import { validateLivingRun, validateRunState } from "./validation";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;

const GLITCH_KNIGHT = asContentId("class-glitch-knight");

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-1",
    now: 1_700_000_000_000,
    commitId: "commit-boot",
  });
}

function makeLivingRun(
  overrides: Partial<LivingRun> = {},
): LivingRun {
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

function selectCommand(
  overrides: Partial<Extract<RunCommand, { type: "SelectRouteOffer" }>> = {},
): RunCommand {
  return {
    type: "SelectRouteOffer",
    runId: "run-1",
    expectedRevision: 0,
    offerId: "offer-unknown",
    commitId: "commit-select",
    now: 1_700_000_000_200,
    ...overrides,
  };
}

function commitCommand(
  overrides: Partial<Extract<RunCommand, { type: "CommitRoute" }>> = {},
): RunCommand {
  return {
    type: "CommitRoute",
    runId: "run-1",
    expectedRevision: 0,
    commitId: "commit-route",
    now: 1_700_000_000_300,
    ...overrides,
  };
}

function assertSaveCheckpoint(
  persistence: RunPersistenceInstruction,
  expectedRevision: number,
): void {
  expect(persistence).toEqual({
    kind: "save-checkpoint",
    runId: "run-1",
    commitId: expect.any(String),
    expectedRevision,
  });
}

describe("runReducer — MaterializeRoute", () => {
  it("materializes four non-boss offers on a depth-1 run", () => {
    const state = deepFreeze(stateWith(makeLivingRun()));
    const transition = runReducer(state, deepFreeze(materializeCommand()), catalog);

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = transition.state.livingRun!;
      const route = run.routeState!;
      expect(route.offers).toHaveLength(4);
      expect(route.offers.map((o) => o.roomType)).toEqual([
        "battle",
        "elite",
        "shop",
        "recovery",
      ]);
      expect(route.selectedOfferId).toBeNull();
      expect(route.committed).toBe(false);
      expect(route.eventKey).toBe(routeEventKey("run-1", catalog.contentVersion, 1));
      for (const offer of route.offers) {
        expect(offer.offerId).toContain(route.eventKey);
        expect(offer.roomEventKey).toContain(route.eventKey);
        expect(offer.availability).toBe("available");
      }
      expect(run.revision).toBe(1);
      expect(run.updatedAt).toBe(1_700_000_000_100);
      expect(run.lastCommitId).toBe("commit-materialize");
      expect(validateLivingRun(run, catalog)).toEqual({ ok: true });
      assertSaveCheckpoint(transition.persistence, 0);
    }
  });

  it("materializes exactly one boss offer on a boss depth", () => {
    const bossRun = makeLivingRun({
      depth: 3,
      cycle: 1,
      routeState: {
        eventKey: routeEventKey("run-1", catalog.contentVersion, 3),
        offers: [],
        selectedOfferId: null,
        committed: false,
      },
    });
    const state = deepFreeze(stateWith(bossRun));
    const transition = runReducer(state, materializeCommand({ now: 200 }), catalog);

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const route = transition.state.livingRun!.routeState!;
      expect(route.offers).toHaveLength(1);
      expect(route.offers[0]!.roomType).toBe("boss");
      expect(isBossDepth(3)).toBe(true);
      expect(validateLivingRun(transition.state.livingRun!, catalog)).toEqual({ ok: true });
    }
  });

  it("rejects re-materialization with route-already-materialized", () => {
    const state = deepFreeze(stateWith(makeLivingRun()));
    const first = runReducer(state, materializeCommand(), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runReducer(first.state, materializeCommand({ expectedRevision: 1 }), catalog);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("route-already-materialized");
      expect(second.state).toBe(first.state);
    }
  });

  it("rejects materialization when routeState is null (wrong phase)", () => {
    const roomRun = makeLivingRun({
      phase: "room",
      routeState: null,
      roomState: {
        roomId: "room-1",
        roomType: "battle",
        eventKey: "room:1",
        status: "ready",
        objectiveIds: [],
        threatProfile: {
          budget: 6,
          durabilityFactor: 1,
          density: 3,
          formationId: asContentId("formation-glassway-columns"),
          hazardIds: [],
          bossModifierIds: [],
        },
        combatCheckpoint: null,
        processedOutcomeIds: [],
        shop: null,
        recovery: null,
        boss: null,
        resolutionCommitId: null,
      },
    });
    const state = deepFreeze(stateWith(roomRun));
    const transition = runReducer(state, materializeCommand(), catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("invalid-state");
    }
  });

  it.each([
    ["runId", materializeCommand({ runId: "" })],
    ["commitId", materializeCommand({ commitId: "" })],
    ["expectedRevision", materializeCommand({ expectedRevision: -1 })],
    ["now", materializeCommand({ now: Number.NaN })],
  ])("rejects invalid metadata field %s", (field, command) => {
    const transition = runReducer(stateWith(makeLivingRun()), command, catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "invalid-metadata", field });
    }
  });

  it("rejects stale run revision", () => {
    const transition = runReducer(
      stateWith(makeLivingRun()),
      materializeCommand({ expectedRevision: 5 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("stale-run-revision");
    }
  });
});

describe("runReducer — SelectRouteOffer", () => {
  function materializedState(): RunState {
    const state = stateWith(makeLivingRun());
    const transition = runReducer(state, materializeCommand(), catalog);
    if (!transition.ok) throw new Error("materialize must succeed");
    return transition.state;
  }

  it("selects a valid offer and bumps revision", () => {
    const state = deepFreeze(materializedState());
    const offerId = state.livingRun!.routeState!.offers[0]!.offerId;
    const transition = runReducer(
      state,
      selectCommand({ offerId, expectedRevision: 1, now: 200 }),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const route = transition.state.livingRun!.routeState!;
      expect(route.selectedOfferId).toBe(offerId);
      expect(route.committed).toBe(false);
      expect(transition.state.livingRun!.revision).toBe(2);
      expect(transition.state.livingRun!.lastCommitId).toBe("commit-select");
      expect(validateLivingRun(transition.state.livingRun!, catalog)).toEqual({ ok: true });
      assertSaveCheckpoint(transition.persistence, 1);
    }
  });

  it("rejects an unknown offer", () => {
    const state = deepFreeze(materializedState());
    const transition = runReducer(
      state,
      selectCommand({ offerId: "offer-fake", expectedRevision: 1 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("unknown-route-offer");
      expect(transition.state).toBe(state);
    }
  });

  it("rejects selection before materialization (empty offers)", () => {
    const state = deepFreeze(stateWith(makeLivingRun()));
    const transition = runReducer(
      state,
      selectCommand({ offerId: "offer-fake" }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("route-not-materialized");
    }
  });

  it("rejects selection after commit", () => {
    let state = materializedState();
    const offerId = state.livingRun!.routeState!.offers[0]!.offerId;
    state = runReducer(state, selectCommand({ offerId, expectedRevision: 1 }), catalog).state;
    const committedRoute = {
      ...state.livingRun!.routeState!,
      committed: true,
    };
    const committedState: RunState = {
      profile: state.profile,
      livingRun: { ...state.livingRun!, routeState: committedRoute },
    };
    const transition = runReducer(
      committedState,
      selectCommand({ offerId, expectedRevision: 2 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("route-already-committed");
    }
  });
});

describe("runReducer — CommitRoute", () => {
  function selectedState(): RunState {
    let state = stateWith(makeLivingRun());
    state = runReducer(state, materializeCommand(), catalog).state;
    const offerId = state.livingRun!.routeState!.offers[0]!.offerId;
    state = runReducer(
      state,
      selectCommand({ offerId, expectedRevision: 1, now: 200 }),
      catalog,
    ).state;
    return state;
  }

  it("transitions to room phase with a populated roomState", () => {
    const state = deepFreeze(selectedState());
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 2, now: 300 }),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = transition.state.livingRun!;
      expect(run.phase).toBe("room");
      expect(run.routeState).toBeNull();
      expect(run.roomState).not.toBeNull();
      const room = run.roomState!;
      expect(room.status).toBe("ready");
      expect(room.combatCheckpoint).not.toBeNull();
      expect(room.combatCheckpoint?.kind).toBe("pre_launch");
      expect(room.processedOutcomeIds).toEqual([]);
      expect(room.resolutionCommitId).toBeNull();
      expect(room.threatProfile).toBeDefined();
      expect(room.threatProfile.bossModifierIds).toEqual([]);
      // battle offer is first → shop/recovery/boss must be null
      expect(room.shop).toBeNull();
      expect(room.recovery).toBeNull();
      expect(room.boss).toBeNull();
      expect(run.revision).toBe(3);
      expect(run.updatedAt).toBe(300);
      expect(run.lastCommitId).toBe("commit-route");
      expect(validateLivingRun(run, catalog)).toEqual({ ok: true });
      assertSaveCheckpoint(transition.persistence, 2);
    }
  });

  it("populates shop state when the shop offer is committed", () => {
    let state = stateWith(makeLivingRun());
    state = runReducer(state, materializeCommand(), catalog).state;
    const shopOffer = state.livingRun!.routeState!.offers.find(
      (o) => o.roomType === "shop",
    )!;
    state = runReducer(
      state,
      selectCommand({ offerId: shopOffer.offerId, expectedRevision: 1, now: 200 }),
      catalog,
    ).state;
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 2, now: 300 }),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const room = transition.state.livingRun!.roomState!;
      expect(room.roomType).toBe("shop");
      expect(room.shop).not.toBeNull();
      expect(room.shop!.inventory.length).toBeGreaterThan(0);
      expect(room.shop!.purchasedItemIds).toEqual([]);
      expect(room.recovery).toBeNull();
      expect(room.boss).toBeNull();
    }
  });

  it("populates recovery state when the recovery offer is committed", () => {
    let state = stateWith(makeLivingRun());
    state = runReducer(state, materializeCommand(), catalog).state;
    const recoveryOffer = state.livingRun!.routeState!.offers.find(
      (o) => o.roomType === "recovery",
    )!;
    state = runReducer(
      state,
      selectCommand({ offerId: recoveryOffer.offerId, expectedRevision: 1, now: 200 }),
      catalog,
    ).state;
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 2, now: 300 }),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const room = transition.state.livingRun!.roomState!;
      expect(room.roomType).toBe("recovery");
      expect(room.recovery).not.toBeNull();
      expect(room.recovery!.restoreAmount).toBe(1);
      expect(room.shop).toBeNull();
      expect(room.boss).toBeNull();
    }
  });

  it("commits a boss room on boss depth with boss state", () => {
    const bossRun = makeLivingRun({
      depth: 3,
      cycle: 1,
      routeState: {
        eventKey: routeEventKey("run-1", catalog.contentVersion, 3),
        offers: [],
        selectedOfferId: null,
        committed: false,
      },
    });
    let state = stateWith(bossRun);
    state = runReducer(state, materializeCommand(), catalog).state;
    const bossOfferId = state.livingRun!.routeState!.offers[0]!.offerId;
    state = runReducer(
      state,
      selectCommand({ offerId: bossOfferId, expectedRevision: 1, now: 200 }),
      catalog,
    ).state;
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 2, now: 300 }),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const room = transition.state.livingRun!.roomState!;
      expect(room.roomType).toBe("boss");
      expect(room.boss).not.toBeNull();
      expect(room.boss!.defeated).toBe(false);
      expect(room.boss!.phaseId).toBe("routing");
      expect(room.shop).toBeNull();
      expect(room.recovery).toBeNull();
      expect(validateLivingRun(transition.state.livingRun!, catalog)).toEqual({ ok: true });
    }
  });

  it("rejects commit without selection", () => {
    let state = stateWith(makeLivingRun());
    state = runReducer(state, materializeCommand(), catalog).state;
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 1 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("route-selection-missing");
    }
  });

  it("rejects commit before materialization (empty offers)", () => {
    const state = deepFreeze(stateWith(makeLivingRun()));
    const transition = runReducer(state, commitCommand(), catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("route-not-materialized");
    }
  });

  it("rejects a second commit with invalid-state (routeState is null)", () => {
    let state = selectedState();
    state = runReducer(state, commitCommand({ expectedRevision: 2, now: 300 }), catalog).state;
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 3, now: 400 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("invalid-state");
    }
  });

  it("rejects commit with stale run revision", () => {
    const state = deepFreeze(selectedState());
    const transition = runReducer(
      state,
      commitCommand({ expectedRevision: 9 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("stale-run-revision");
    }
  });
});

describe("full route lifecycle coherence", () => {
  it("materialize → select → commit produces a valid room-phase run", () => {
    let state = deepFreeze(stateWith(makeLivingRun()));

    const mat = runReducer(state, materializeCommand(), catalog);
    expect(mat.ok).toBe(true);
    if (!mat.ok) return;
    state = mat.state;

    const offerId = state.livingRun!.routeState!.offers[0]!.offerId;
    const sel = runReducer(
      state,
      selectCommand({ offerId, expectedRevision: 1, now: 200 }),
      catalog,
    );
    expect(sel.ok).toBe(true);
    if (!sel.ok) return;
    state = sel.state;

    const com = runReducer(state, commitCommand({ expectedRevision: 2, now: 300 }), catalog);
    expect(com.ok).toBe(true);
    if (!com.ok) return;
    state = com.state;

    const run = state.livingRun!;
    expect(run.phase).toBe("room");
    expect(run.routeState).toBeNull();
    expect(run.roomState).not.toBeNull();
    expect(run.revision).toBe(3);
    expect(validateRunState(state, catalog)).toEqual({ ok: true });
  });
});