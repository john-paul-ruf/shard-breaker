// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ContentId } from "../domain/content/catalog";
import { createContentCatalog } from "../domain/content/catalog";
import type {
  LivingRun,
  Profile,
  ProfileCreationMetadata,
  RunState,
} from "../domain/run/model";
import {
  createDefaultProfile,
  createInitialLivingRun,
} from "../domain/run/model";
import type {
  PersistenceError,
  PersistenceResult,
  RunLifecycleRepository,
} from "../persistence/envelopes";
import { App } from "./App";
import type { AppCommand } from "./commands";
import type { AppState, AppStore } from "./appStore";
import { createAppStore } from "./appStore";
import { deriveScreen } from "./navigation";
import { createCombatState, toCombatCheckpoint } from "../domain/combat/layout";

afterEach(cleanup);

const catalog = createContentCatalog();
const CIRCUIT_ROGUE = "class-circuit-rogue" as ContentId;
const GLITCH_KNIGHT = "class-glitch-knight" as ContentId;
const BACKFEED_CELL = "relic-backfeed-cell" as ContentId;

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-app",
    now: 1_700_000_000_000,
    commitId: "commit-app-bootstrap",
  });
}

/** A finalized terminal profile: summary recorded, relic choice still open. */
function makeTerminalProfile(): Profile {
  const profile = makeProfile();
  return {
    ...profile,
    lastRunSummary: {
      runId: "run-terminal-1",
      classId: CIRCUIT_ROGUE,
      reachedDepth: 1,
      bossesReached: 0,
      bossesDefeated: 0,
      activeSkillIds: [],
      passiveEquipmentIds: [],
      carryOverRelicId: null,
      shardsEarned: 20,
      terminalReason: "death",
      completedAt: 1_700_000_000_400,
    },
    pendingRelicChoice: {
      sourceRunId: "run-terminal-1",
      options: [
        "relic-backfeed-cell" as ContentId,
        "relic-quiet-prism" as ContentId,
        "relic-spare-vector" as ContentId,
      ],
      selectedId: null,
      commitId: null,
    },
  };
}

/**
 * The post-resolve durable shape (F1/S01 committed schema): the pending
 * record is kept with selectedId + commitId set, never nulled by a choose.
 */
function makeResolvedProfile(): Profile {
  const profile = makeTerminalProfile();
  return {
    ...profile,
    pendingRelicChoice: {
      ...profile.pendingRelicChoice!,
      selectedId: BACKFEED_CELL,
      commitId: "commit-resolve",
    },
  };
}

function rewardCard(index: number) {
  return {
    cardId: `reward-key:card:${String(index)}`,
    baseRewardId: (
      index === 1 ? "equipment-fractal-core" : "skill-phase-shunt"
    ) as ContentId,
    rewardType: index === 1 ? ("equipment" as const) : ("skill" as const),
    enhancementIds: [],
    rolledParams: [],
    materialCost: index + 1,
    tradeoffId: null,
  };
}

function makeLivingRun(
  classId: ContentId = GLITCH_KNIGHT,
  runId = "run-restored",
): LivingRun {
  const classResult = catalog.getClass(classId);
  if (!classResult.ok) {
    throw new Error("test living run requires a known class");
  }
  return createInitialLivingRun(
    catalog.contentVersion,
    classId,
    classResult.value.startingIntegrity,
    null,
    {
      runId,
      seed: `seed-${runId}`,
      now: 1_700_000_000_100,
      commitId: `commit-${runId}`,
    },
  );
}

function success<T>(value: T): PersistenceResult<T> {
  return { ok: true, value };
}

function failure(
  code: PersistenceError["code"],
  message: string,
): PersistenceResult<never> {
  return { ok: false, error: { code, message } };
}

interface MemoryRepositoryOptions {
  readonly profile: Profile | null;
  readonly livingRun: LivingRun | null;
  readonly loadFailure?: PersistenceError;
  readonly startFailure?: PersistenceError;
}

interface MemoryRepositoryHarness {
  readonly repository: RunLifecycleRepository;
  getState(): RunState | null;
}

function createMemoryRepository(
  options: MemoryRepositoryOptions,
): MemoryRepositoryHarness {
  let profile = options.profile;
  let livingRun = options.livingRun;

  const repository: RunLifecycleRepository = {
    bootstrapProfile: vi.fn<RunLifecycleRepository["bootstrapProfile"]>(
      async (metadata: ProfileCreationMetadata) => {
        profile ??= createDefaultProfile(catalog, metadata);
        return success(profile);
      },
    ),
    loadState: vi.fn<RunLifecycleRepository["loadState"]>(async () => {
      if (options.loadFailure !== undefined) {
        return { ok: false as const, error: options.loadFailure };
      }
      return profile === null
        ? failure("profile-missing", "No local profile was found.")
        : success({ profile, livingRun });
    }),
    startRun: vi.fn<RunLifecycleRepository["startRun"]>(async (instruction) => {
      if (options.startFailure !== undefined) {
        return { ok: false as const, error: options.startFailure };
      }
      if (profile === null) {
        return failure("profile-missing", "No local profile was found.");
      }
      livingRun = instruction.proposedRun;
      return success({ profile, livingRun });
    }),
    abandonRun: vi.fn<RunLifecycleRepository["abandonRun"]>(async () => {
      if (profile === null) {
        return failure("profile-missing", "No local profile was found.");
      }
      livingRun = null;
      return success({ profile, livingRun });
    }),
    saveCheckpoint: vi.fn<RunLifecycleRepository["saveCheckpoint"]>(
      async (instruction) => {
        if (profile === null) {
          return failure("profile-missing", "No local profile was found.");
        }
        livingRun = instruction.proposedRun;
        return success({ profile, livingRun });
      },
    ),
    finalizeDeath: vi.fn<RunLifecycleRepository["finalizeDeath"]>(
      async (instruction) => {
        if (profile === null) {
          return failure("profile-missing", "No local profile was found.");
        }
        livingRun = null;
        profile = {
          ...profile,
          lastRunSummary: instruction.summary,
          pendingRelicChoice: instruction.pendingRelicChoice,
          revision: profile.revision + 1,
        };
        return success({ profile, livingRun });
      },
    ),
    resolveRelicChoice: vi.fn<RunLifecycleRepository["resolveRelicChoice"]>(
      async (instruction) => {
        if (profile === null) {
          return failure("profile-missing", "No local profile was found.");
        }
        profile = instruction.proposedProfile;
        return success({ profile, livingRun: null });
      },
    ),
  };

  return {
    repository,
    getState: () =>
      profile === null ? null : { profile, livingRun },
  };
}

function createStore(
  repository: RunLifecycleRepository,
  suppliedIds: readonly string[] = [
    "profile-created",
    "commit-bootstrap-created",
    "run-created",
    "commit-start-created",
    "commit-abandon-created",
    "run-replacement-created",
    "commit-replacement-created",
  ],
): AppStore {
  const ids = [...suppliedIds];
  return createAppStore({
    catalog,
    repository,
    clock: () => 1_700_000_000_500,
    createId: () => ids.shift() ?? "id-extra",
    createSeed: () => "seed-created",
  });
}

function observeStore(baseStore: AppStore) {
  let activeSubscriptions = 0;
  let maximumActiveSubscriptions = 0;
  const initialize = vi.fn(() => baseStore.initialize());
  const dispatch = vi.fn((command: AppCommand) => baseStore.dispatch(command));
  const store: AppStore = {
    initialize,
    dispatch,
    getSnapshot: () => baseStore.getSnapshot(),
    subscribe: (listener) => {
      activeSubscriptions += 1;
      maximumActiveSubscriptions = Math.max(
        maximumActiveSubscriptions,
        activeSubscriptions,
      );
      const unsubscribe = baseStore.subscribe(listener);
      let isActive = true;
      return () => {
        if (isActive) {
          isActive = false;
          activeSubscriptions -= 1;
          unsubscribe();
        }
      };
    },
  };
  return {
    store,
    initialize,
    dispatch,
    get activeSubscriptions() {
      return activeSubscriptions;
    },
    get maximumActiveSubscriptions() {
      return maximumActiveSubscriptions;
    },
  };
}

function renderApp(baseStore: AppStore) {
  const observed = observeStore(baseStore);
  const rendered = render(
    <StrictMode>
      <App store={observed.store} catalog={catalog} />
    </StrictMode>,
  );
  return { ...rendered, observed };
}

describe("deriveScreen", () => {
  function state(overrides: Partial<AppState> = {}): AppState {
    return {
      loadStatus: "ready",
      profile: makeProfile(),
      livingRun: makeLivingRun(),
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: null,
      fatalMessage: null,
      terminalRecord: null,
      ...overrides,
    };
  }

  it("derives route-map for a living run in route phase checkpoint mode", () => {
    expect(deriveScreen(state({ launchMode: "checkpoint" }))).toEqual({
      id: "route-map",
    });
  });

  it("derives room-combat for a combat room in room phase checkpoint mode", () => {
    const livingRun = makeLivingRun();
    const roomRun: LivingRun = {
      ...livingRun,
      phase: "room",
      routeState: null,
      roomState: {
        roomId: "room-1",
        roomType: "battle",
        eventKey: "room-1",
        status: "ready",
        objectiveIds: [],
        threatProfile: {
          budget: 0,
          durabilityFactor: 1,
          density: 0,
          formationId: "formation-glassway-columns" as ContentId,
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
    };
    expect(deriveScreen(state({ launchMode: "checkpoint", livingRun: roomRun })))
      .toEqual({ id: "room-combat" });
  });

  it("derives room for a utility room in room phase checkpoint mode", () => {
    const livingRun = makeLivingRun();
    const roomRun: LivingRun = {
      ...livingRun,
      phase: "room",
      routeState: null,
      roomState: {
        roomId: "room-2",
        roomType: "shop",
        eventKey: "room-2",
        status: "ready",
        objectiveIds: [],
        threatProfile: {
          budget: 0,
          durabilityFactor: 1,
          density: 0,
          formationId: "formation-utility-clear" as ContentId,
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
    };
    expect(deriveScreen(state({ launchMode: "checkpoint", livingRun: roomRun })))
      .toEqual({ id: "room" });
  });

  it("derives reward for a living run in reward phase checkpoint mode", () => {
    const livingRun = makeLivingRun();
    const rewardRun: LivingRun = {
      ...livingRun,
      phase: "reward",
      routeState: null,
      roomState: null,
      rewardState: {
        eventKey: "reward-1",
        sourceRoomId: "room-1",
        cards: [
          rewardCard(0),
          rewardCard(1),
          rewardCard(2),
        ],
        selectedCardId: null,
        selectionCommitId: null,
        status: "offered",
        displacedRewardId: null,
        displacedSlot: null,
      },
    };
    expect(deriveScreen(state({ launchMode: "checkpoint", livingRun: rewardRun })))
      .toEqual({ id: "reward" });
  });

  it("derives archive when no living run or not in checkpoint mode", () => {
    expect(
      deriveScreen(state({ livingRun: null, launchMode: "checkpoint" })),
    ).toEqual({ id: "home", mode: "archive" });
    expect(
      deriveScreen(state({ loadStatus: "failed", launchMode: "checkpoint" })),
    ).toEqual({ id: "home", mode: "archive" });
    expect(deriveScreen(state({ launchMode: "archive" }))).toEqual({
      id: "home",
      mode: "archive",
    });
  });

  it("derives run-summary only from the persisted unresolved pending choice", () => {
    const profile = makeTerminalProfile();
    expect(
      deriveScreen(
        state({
          profile,
          livingRun: null,
          launchMode: "archive",
          terminalRecord: { isRecord: true, priorRecordDepth: 0 },
        }),
      ),
    ).toEqual({ id: "run-summary" });

    // A summary with a resolved pending choice (kept durable with
    // selectedId + commitId set) is past-choice: the archive takes over.
    expect(
      deriveScreen(
        state({
          profile: makeResolvedProfile(),
          livingRun: null,
          launchMode: "archive",
        }),
      ),
    ).toEqual({ id: "home", mode: "archive" });

    // Decline clears the pending record entirely: gate off.
    expect(
      deriveScreen(
        state({
          profile: { ...profile, pendingRelicChoice: null },
          livingRun: null,
          launchMode: "archive",
        }),
      ),
    ).toEqual({ id: "home", mode: "archive" });

    // The persisted pending choice IS the gate: a corrupt summary-less pair
    // still derives the terminal; the model builder fail-closes it.
    expect(
      deriveScreen(
        state({
          profile: { ...profile, lastRunSummary: null },
          livingRun: null,
          launchMode: "archive",
        }),
      ),
    ).toEqual({ id: "run-summary" });

    expect(
      deriveScreen(state({ profile: null, livingRun: null })),
    ).toEqual({ id: "home", mode: "archive" });

    // A living run never shows a terminal screen even with a pending choice.
    expect(
      deriveScreen(state({ profile, launchMode: "checkpoint" })),
    ).toEqual({ id: "route-map" });
  });
});

describe("App integration", () => {
  it("shows loading, bootstraps a fresh archive once, and keeps one active subscription", async () => {
    const memory = createMemoryRepository({
      profile: null,
      livingRun: null,
    });
    const rendered = renderApp(createStore(memory.repository));

    expect(
      screen.getByRole("heading", { name: "Opening local archive" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Validating the last committed profile",
    );

    expect(
      await screen.findByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Circuit Rogue/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: /Neon Mage/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(memory.repository.bootstrapProfile).toHaveBeenCalledTimes(1);
    expect(rendered.observed.initialize).toHaveBeenCalledTimes(1);
    expect(rendered.observed.maximumActiveSubscriptions).toBe(1);
    expect(rendered.observed.activeSubscriptions).toBe(1);

    rendered.unmount();
    expect(rendered.observed.activeSubscriptions).toBe(0);
  });

  it("renders a bounded invalid-data failure without claiming a reset", async () => {
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
      loadFailure: {
        code: "invalid-profile",
        message: "The saved profile is invalid.",
      },
    });
    renderApp(createStore(memory.repository));

    expect(
      await screen.findByRole("heading", { name: "Local archive unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The saved profile is invalid. Existing local data was not reset.",
    );
    expect(screen.getByText(/Check this browser's storage permissions/)).toBeInTheDocument();
    expect(memory.repository.bootstrapProfile).not.toHaveBeenCalled();
  });

  it("selects an unlocked class, starts durably, then recovers through explicit Resume", async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
    });
    const firstStore = createStore(memory.repository, [
      "run-glitch",
      "commit-run-glitch",
    ]);
    const firstRender = renderApp(firstStore);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("radio", { name: /Glitch Knight/ }));
    await waitFor(() =>
      expect(firstStore.getSnapshot().selectedClassId).toBe(GLITCH_KNIGHT),
    );
    await user.click(screen.getByRole("button", { name: "Start new run" }));

    // A new run opens on the route phase, so the route map renders.
    expect(
      await screen.findByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Glitch Knight/).length).toBeGreaterThan(0);
    expect(memory.repository.startRun).toHaveBeenCalledTimes(1);
    expect(firstStore.getSnapshot().livingRun?.classId).toBe(GLITCH_KNIGHT);

    firstRender.unmount();
    const reloadedStore = createStore(memory.repository);
    renderApp(reloadedStore);
    expect(
      await screen.findByRole("heading", { name: "Living run detected" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Pick the next pressure point." }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume living run" }));
    expect(
      await screen.findByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeInTheDocument();
    expect(memory.repository.startRun).toHaveBeenCalledTimes(1);
    expect(memory.repository.abandonRun).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Return to archive" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();
    expect(reloadedStore.getSnapshot().livingRun?.runId).toBe("run-glitch");
  });

  it("opens and cancels the no-overwrite guard without a persistence write", async () => {
    const user = userEvent.setup();
    const livingRun = makeLivingRun(CIRCUIT_ROGUE);
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun,
    });
    const store = createStore(memory.repository);
    renderApp(store);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));
    expect(
      await screen.findByRole("dialog", { name: "Living run detected" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(store.getSnapshot().livingRun).toBe(livingRun);
    expect(memory.repository.startRun).not.toHaveBeenCalled();
    expect(memory.repository.abandonRun).not.toHaveBeenCalled();
  });

  it("abandons explicitly and starts the selected replacement as two writes", async () => {
    const user = userEvent.setup();
    const oldRun = makeLivingRun(GLITCH_KNIGHT, "run-old");
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: oldRun,
    });
    const store = createStore(memory.repository, [
      "commit-abandon",
      "run-replacement",
      "commit-replacement",
    ]);
    renderApp(store);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Living run detected",
    });
    expect(dialog).toHaveAccessibleDescription(/Glitch Knight at Depth 01/);
    await user.click(screen.getByRole("button", { name: "Abandon & start" }));

    expect(
      await screen.findByRole("heading", { name: "Pick the next pressure point." }),
    ).toBeInTheDocument();
    const committed = memory.getState();
    expect(committed?.livingRun).toMatchObject({
      runId: "run-replacement",
      classId: CIRCUIT_ROGUE,
    });
    expect(committed?.livingRun?.runId).not.toBe(oldRun.runId);
    expect(memory.repository.abandonRun).toHaveBeenCalledTimes(1);
    expect(memory.repository.startRun).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(memory.repository.abandonRun).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(memory.repository.startRun).mock.invocationCallOrder[0] ??
        Number.MAX_SAFE_INTEGER,
    );
  });

  it("keeps committed profile data visible when a start save fails", async () => {
    const user = userEvent.setup();
    const profile = { ...makeProfile(), shards: 91 };
    const memory = createMemoryRepository({
      profile,
      livingRun: null,
      startFailure: {
        code: "transaction-failed",
        message: "The local save transaction failed.",
      },
    });
    const store = createStore(memory.repository, ["run-failed", "commit-failed"]);
    renderApp(store);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The new run was not saved. The local save transaction failed.",
    );
    expect(screen.getByLabelText("91 Shards")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();
    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun: null,
      loadStatus: "ready",
    });
  });

  it("starts a run, auto-materializes the route map, selects Battle, and commits to room", async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
    });
    const store = createStore(memory.repository, [
      "run-route",
      "commit-route-start",
      "commit-materialize",
      "commit-select",
      "commit-room",
    ]);
    render(
      <App store={store} catalog={catalog} />,
    );
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));

    const routeHeading = await screen.findByRole("heading", {
      name: "Pick the next pressure point.",
    });
    expect(routeHeading).toBeInTheDocument();

    // Wait for the cards to materialize.
    await waitFor(
      () =>
        expect(store.getSnapshot().livingRun?.routeState?.offers).toHaveLength(4),
      { timeout: 5000 },
    );
    await screen.findByRole("radio", { name: "battle // Glassway" }, { timeout: 5000 });

    expect(memory.repository.startRun).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(memory.repository.saveCheckpoint).toHaveBeenCalledTimes(1),
    );
    expect(store.getSnapshot().livingRun?.routeState?.offers).toHaveLength(4);

    // Select Battle.
    await user.click(screen.getByRole("radio", { name: "battle // Glassway" }));
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.routeState?.selectedOfferId).not.toBeNull(),
    );
    const selectedOfferId = store.getSnapshot().livingRun?.routeState?.selectedOfferId;
    expect(selectedOfferId).not.toBeNull();

    // Commit to room.
    await user.click(screen.getByRole("button", { name: "Enter selected room" }));
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("room"),
    );
    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.phase).toBe("room");
    expect(snapshot.livingRun?.routeState).toBeNull();
    expect(snapshot.livingRun?.roomState).not.toBeNull();
    expect(snapshot.livingRun?.roomState?.status).toBe("ready");
    expect(memory.repository.saveCheckpoint).toHaveBeenCalledTimes(3);
  });
});

describe("App combat composition", () => {
  it("renders CombatScreen with arena controls for a committed battle room", async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
    });
    const store = createStore(memory.repository, [
      "run-combat",
      "commit-combat-start",
    ]);
    render(<App store={store} catalog={catalog} />);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));
    await screen.findByRole("heading", {
      name: "Pick the next pressure point.",
    });
    await waitFor(
      () =>
        expect(store.getSnapshot().livingRun?.routeState?.offers).toHaveLength(4),
      { timeout: 5000 },
    );

    await user.click(screen.getByRole("radio", { name: "battle // Glassway" }));
    await user.click(screen.getByRole("button", { name: "Enter selected room" }));
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("room"),
    );

    // The combat branch renders the arena screen, not the utility placeholder.
    expect(
      await screen.findByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Combat arena" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Launch ball/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
    expect(screen.getByText("Clear the Glassway")).toBeInTheDocument();
  });
});

describe("App room resolution integration", () => {
  it("walks start → route → recovery room → resolve → reward draft → confirm → depth 2", async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
    });
    const store = createStore(memory.repository, [
      "run-journey",
      "commit-journey-start",
    ]);
    renderApp(store);
    await screen.findByRole("heading", { name: "Choose your signal." });

    // Start → route map (auto-materialized).
    await user.click(screen.getByRole("button", { name: "Start new run" }));
    await screen.findByRole("heading", {
      name: "Pick the next pressure point.",
    });
    await waitFor(
      () =>
        expect(store.getSnapshot().livingRun?.routeState?.offers).toHaveLength(4),
      { timeout: 5000 },
    );

    // Select Recovery and commit into the room.
    await user.click(screen.getByRole("radio", { name: "recovery // Soft Reset" }));
    await user.click(screen.getByRole("button", { name: "Enter selected room" }));
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("room"),
    );

    // Room screen shows the recovery offer and resolves.
    expect(
      await screen.findByRole("heading", { name: /Soft Reset \/\/ Recovery/ }),
    ).toBeInTheDocument();
    expect(store.getSnapshot().livingRun?.roomState?.roomType).toBe("recovery");

    // Commit recovery: integrity clamps at max for a fresh full run.
    await user.click(screen.getByRole("button", { name: "Commit recovery" }));
    await waitFor(() =>
      expect(
        store.getSnapshot().livingRun?.roomState?.recovery?.committed,
      ).toBe(true),
    );
    expect(store.getSnapshot().livingRun?.integrityCurrent).toBe(3);
    expect(store.getSnapshot().livingRun?.integrityMax).toBe(3);

    // Resolve → reward phase with three cards.
    await user.click(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    );
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("reward"),
    );
    const rewardGroup = await screen.findByRole("radiogroup", {
      name: "Three reward cards",
    });
    expect(within(rewardGroup).getAllByRole("radio")).toHaveLength(3);
    expect(memory.getState()?.livingRun?.progress.roomsResolved).toBe(1);

    // Stage the first card and confirm; the single command applies it.
    await user.click(
      within(rewardGroup).getAllByRole("radio")[0] as HTMLElement,
    );
    const stagedCardId = store.getSnapshot().livingRun?.rewardState?.cards[0]
      ?.cardId;
    expect(stagedCardId).toBeDefined();
    await user.click(screen.getByRole("button", { name: "Confirm draft" }));

    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("route"),
    );
    const advanced = store.getSnapshot().livingRun;
    expect(advanced?.depth).toBe(2);
    expect(advanced?.rewardState).toBeNull();
    expect(advanced?.routeState?.offers).toHaveLength(4);

    // The route map renders at depth 2 with fresh offers.
    expect(
      await screen.findByRole("heading", {
        name: "Pick the next pressure point.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Depth 02 · Circuit Rogue/)).toBeInTheDocument();
  });

  it("opens the shop room with unaffordable buys disabled and resolves through the reward draft", async () => {
    const user = userEvent.setup();
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: null,
    });
    const store = createStore(memory.repository, [
      "run-shop",
      "commit-shop-start",
    ]);
    renderApp(store);
    await screen.findByRole("heading", { name: "Choose your signal." });

    await user.click(screen.getByRole("button", { name: "Start new run" }));
    await screen.findByRole("heading", {
      name: "Pick the next pressure point.",
    });
    await waitFor(
      () =>
        expect(store.getSnapshot().livingRun?.routeState?.offers).toHaveLength(4),
      { timeout: 5000 },
    );

    await user.click(screen.getByRole("radio", { name: "shop // Patchbay" }));
    await user.click(screen.getByRole("button", { name: "Enter selected room" }));
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("room"),
    );

    expect(
      await screen.findByRole("heading", { name: /Patchbay \/\/ Shop/ }),
    ).toBeInTheDocument();
    const buys = screen.getAllByRole("button", { name: "Buy" });
    expect(buys.length).toBeGreaterThan(0);
    for (const buy of buys) {
      expect(buy).toBeDisabled();
    }
    expect(screen.getAllByText("Not enough room shards").length).toBeGreaterThan(0);

    await user.click(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    );
    await waitFor(() =>
      expect(store.getSnapshot().livingRun?.phase).toBe("reward"),
    );
    await screen.findByRole("radiogroup", { name: "Three reward cards" });
  });
});
describe("App boss composition", () => {
  function bossRoomRun(): LivingRun {
    const livingRun = makeLivingRun();
    return {
      ...livingRun,
      phase: "room",
      routeState: null,
      roomState: {
        roomId: "room-boss-1",
        roomType: "boss",
        eventKey: "room-boss-1",
        status: "ready",
        objectiveIds: [],
        threatProfile: {
          budget: 0,
          durabilityFactor: 1,
          density: 0,
          formationId: "formation-boss-arena" as ContentId,
          hazardIds: [],
          bossModifierIds: [],
        },
        combatCheckpoint: null,
        processedOutcomeIds: [],
        shop: null,
        recovery: null,
        boss: {
          archetypeId: "boss-warden" as ContentId,
          modifierIds: [],
          phaseId: "routing",
          defeated: false,
        },
        resolutionCommitId: null,
      },
    };
  }

  it("derives room-boss for a boss room before the generic combat branch", () => {
    const base = makeLivingRun();
    const appState: AppState = {
      loadStatus: "ready",
      profile: makeProfile(),
      livingRun: base,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "checkpoint",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: null,
      fatalMessage: null,
      terminalRecord: null,
    };
    expect(deriveScreen({ ...appState, livingRun: bossRoomRun() })).toEqual({
      id: "room-boss",
    });
    const battleRoom: LivingRun = {
      ...base,
      phase: "room",
      routeState: null,
      roomState: {
        roomId: "room-battle-1",
        roomType: "battle",
        eventKey: "room-battle-1",
        status: "ready",
        objectiveIds: [],
        threatProfile: {
          budget: 0,
          durabilityFactor: 1,
          density: 0,
          formationId: "formation-glassway-columns" as ContentId,
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
    };
    expect(deriveScreen({ ...appState, livingRun: battleRoom })).toEqual({
      id: "room-combat",
    });
  });

  it("renders BossScreen with the routed identity, phase steps, telegraph, and Breach control", async () => {
    const user = userEvent.setup();
    const livingRun = bossRoomRun();
    // A real checkpoint from the committed generator contract: the composed
    // boss arena derives from this room's deterministic context.
    const roomState = livingRun.roomState!;
    const checkpoint = toCombatCheckpoint(
      createCombatState(catalog, {
        seed: livingRun.seed,
        contentVersion: livingRun.contentVersion,
        roomId: roomState.roomId,
        eventKey: roomState.eventKey,
        formationId: roomState.threatProfile.formationId,
        density: 0,
        durabilityFactor: 1,
        lossCount: 0,
        hazardIds: [],
      }),
    );
    const memory = createMemoryRepository({
      profile: makeProfile(),
      livingRun: {
        ...livingRun,
        roomState: { ...roomState, combatCheckpoint: checkpoint },
      },
    });
    const store = createStore(memory.repository);
    renderApp(store);
    await screen.findByRole("heading", { name: "Living run detected" });
    await user.click(screen.getByRole("button", { name: "Resume living run" }));

    expect(
      await screen.findByRole("heading", { name: /Warden \/\/ Boss/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("01 / 03 — Lock")).toBeInTheDocument();
    expect(screen.getByText("Outer node breaks")).toBeInTheDocument();
    expect(screen.getByText("Prism sweep")).toBeInTheDocument();
    const phaseSteps = screen.getByLabelText("Boss phases");
    const stepLabels = within(phaseSteps)
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(stepLabels).toEqual(["01 Lock", "02 Split", "03 Breach"]);
    expect(screen.getByRole("button", { name: /Breach Warden/ })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
    expect(screen.getByText("Defeat the boss to open the reward draft.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Combat arena" })).toBeInTheDocument();
    const banner = document.querySelector(".telegraph-banner");
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent("TELEGRAPH // PRISM SWEEP IN");
  });
});

describe("App run summary composition (CA-19)", () => {
  function readyState(overrides: Partial<AppState> = {}): AppState {
    return {
      loadStatus: "ready",
      profile: makeTerminalProfile(),
      livingRun: null,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: null,
      fatalMessage: null,
      // The transient record marker is cleared by initialize; the NEW
      // callout is proven at the component level (RunSummaryScreen tests).
      terminalRecord: null,
      ...overrides,
    };
  }

  function terminalRepository(initialProfile: Profile): RunLifecycleRepository {
    let profile = initialProfile;
    return {
      bootstrapProfile: vi.fn(),
      loadState: vi.fn(async () => success({ profile, livingRun: null })),
      startRun: vi.fn(),
      abandonRun: vi.fn(),
      saveCheckpoint: vi.fn(),
      finalizeDeath: vi.fn(),
      resolveRelicChoice: vi.fn<RunLifecycleRepository["resolveRelicChoice"]>(
        async (instruction) => {
          profile = instruction.proposedProfile;
          return success({ profile, livingRun: null });
        },
      ),
    };
  }

  it("renders the run summary screen for a finalized profile with an unresolved choice", async () => {
    const store = createStore(terminalRepository(readyState().profile!));
    renderApp(store);

    expect(
      await screen.findByRole("heading", { name: "Run terminated." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Shards earned")).toBeInTheDocument();
    expect(screen.getByText("+20")).toBeInTheDocument();
    const group = screen.getByRole("radiogroup", {
      name: "Carry-over relic choice",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
  });

  it("resolves through the screen and lands on the archive (post-resolve derivation)", async () => {
    const user = userEvent.setup();
    const store = createStore(terminalRepository(readyState().profile!));
    renderApp(store);
    await screen.findByRole("heading", { name: "Run terminated." });

    await user.click(screen.getByRole("radio", { name: /Backfeed Cell/ }));
    await waitFor(() =>
      expect(
        store.getSnapshot().profile?.pendingRelicChoice?.selectedId,
      ).toBe(BACKFEED_CELL),
    );
    // The durable record is KEPT with selectedId + commitId set (S01's
    // committed schema), and the gate now routes away to the archive.
    const committed = store.getSnapshot().profile!;
    expect(committed.pendingRelicChoice).toMatchObject({
      selectedId: BACKFEED_CELL,
      commitId: expect.any(String),
    });
    expect(
      await screen.findByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();
  });

  it("declines through Try again and lands on the archive (gate off)", async () => {
    const user = userEvent.setup();
    const store = createStore(terminalRepository(readyState().profile!));
    renderApp(store);
    await screen.findByRole("heading", { name: "Run terminated." });

    await user.click(screen.getByRole("button", { name: /Try again/ }));
    await waitFor(() =>
      expect(store.getSnapshot().profile?.pendingRelicChoice).toBeNull(),
    );
    expect(
      await screen.findByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Relic choice declined.",
    );
  });

  it("fail-closes to the ErrorShell on a summary-less pending pair", async () => {
    const profile = {
      ...readyState().profile!,
      lastRunSummary: null,
    };
    const store = createStore(terminalRepository(profile));
    renderApp(store);

    expect(
      await screen.findByRole("heading", { name: "Local archive unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "no finalized run summary",
    );
  });
});