// @vitest-environment jsdom
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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

afterEach(cleanup);

const catalog = createContentCatalog();
const CIRCUIT_ROGUE = "class-circuit-rogue" as ContentId;
const GLITCH_KNIGHT = "class-glitch-knight" as ContentId;

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-app",
    now: 1_700_000_000_000,
    commitId: "commit-app-bootstrap",
  });
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
      ...overrides,
    };
  }

  it("derives checkpoint only for a ready living run in checkpoint mode", () => {
    expect(deriveScreen(state({ launchMode: "checkpoint" }))).toEqual({
      id: "home",
      mode: "checkpoint",
    });
    expect(
      deriveScreen(state({ livingRun: null, launchMode: "checkpoint" })),
    ).toEqual({ id: "home", mode: "archive" });
    expect(
      deriveScreen(state({ loadStatus: "failed", launchMode: "checkpoint" })),
    ).toEqual({ id: "home", mode: "archive" });
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

    expect(
      await screen.findByRole("heading", { name: "Checkpoint restored" }),
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
      screen.queryByRole("heading", { name: "Checkpoint restored" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Resume living run" }));
    expect(
      await screen.findByRole("heading", { name: "Checkpoint restored" }),
    ).toBeInTheDocument();
    expect(memory.repository.startRun).toHaveBeenCalledTimes(1);
    expect(memory.repository.abandonRun).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Return to Launch Archive" }),
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
      await screen.findByRole("heading", { name: "Checkpoint restored" }),
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
});
