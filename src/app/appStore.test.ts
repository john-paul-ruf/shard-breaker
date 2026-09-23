import { describe, expect, it, vi } from "vitest";

import type { ContentId } from "../domain/content/catalog";
import { createContentCatalog } from "../domain/content/catalog";
import type { LivingRun, Profile, RunState } from "../domain/run/model";
import {
  createDefaultProfile,
  createInitialLivingRun,
} from "../domain/run/model";
import type {
  PersistenceError,
  PersistenceResult,
  RunLifecycleRepository,
  SaveCheckpointPersistenceInstruction,
  StartRunPersistenceInstruction,
} from "../persistence/envelopes";
import { createAppStore } from "./appStore";
import type { AppStore } from "./appStore";

const catalog = createContentCatalog();
const CIRCUIT_ROGUE = "class-circuit-rogue" as ContentId;
const GLITCH_KNIGHT = "class-glitch-knight" as ContentId;
const NEON_MAGE = "class-neon-mage" as ContentId;

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-1",
    now: 1_700_000_000_000,
    commitId: "commit-bootstrap",
  });
}

function makeLivingRun(overrides: Partial<LivingRun> = {}): LivingRun {
  return {
    ...createInitialLivingRun(
      catalog.contentVersion,
      GLITCH_KNIGHT,
      4,
      null,
      {
        runId: "run-restored",
        seed: "seed-restored",
        now: 1_700_000_000_100,
        commitId: "commit-start",
      },
    ),
    ...overrides,
  };
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

function repositoryFor(
  state: RunState,
  overrides: Partial<RunLifecycleRepository> = {},
): RunLifecycleRepository {
  return {
    bootstrapProfile: vi.fn(async () => success(state.profile)),
    loadState: vi.fn(async () => success(state)),
    startRun: vi.fn(async () => success(state)),
    abandonRun: vi.fn(async () => success(state)),
    saveCheckpoint: vi.fn(async () => success(state)),
    ...overrides,
  };
}

interface TestSources {
  readonly ids?: readonly string[];
  readonly seed?: string;
  readonly now?: number;
}

function createTestStore(
  repository: RunLifecycleRepository,
  sources: TestSources = {},
) {
  const ids = [...(sources.ids ?? ["profile-created", "commit-bootstrap-created"])];
  return createAppStore({
    catalog,
    repository,
    clock: () => sources.now ?? 1_700_000_000_500,
    createId: () => ids.shift() ?? "id-extra",
    createSeed: () => sources.seed ?? "seed-created",
  });
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

describe("createAppStore startup", () => {
  it("keeps snapshots stable, freezes publications, and removes subscriptions idempotently", async () => {
    const repository = repositoryFor({ profile: makeProfile(), livingRun: null });
    const store = createTestStore(repository);
    const initial = store.getSnapshot();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    expect(store.getSnapshot()).toBe(initial);
    expect(Object.isFrozen(initial)).toBe(true);

    await store.initialize();
    const ready = store.getSnapshot();
    expect(ready).not.toBe(initial);
    expect(store.getSnapshot()).toBe(ready);
    expect(Object.isFrozen(ready)).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    unsubscribe();
    await store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });
    expect(store.getSnapshot().selectedClassId).toBe(GLITCH_KNIGHT);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("runs initialization once when callers overlap", async () => {
    const repository = repositoryFor({ profile: makeProfile(), livingRun: null });
    const store = createTestStore(repository);

    await Promise.all([
      store.initialize(),
      store.initialize(),
      store.initialize(),
    ]);

    expect(repository.loadState).toHaveBeenCalledTimes(1);
    expect(repository.bootstrapProfile).not.toHaveBeenCalled();
  });

  it("bootstraps only an absent profile, then reloads the validated state", async () => {
    const profile = makeProfile();
    const loadState = vi
      .fn<RunLifecycleRepository["loadState"]>()
      .mockResolvedValueOnce(
        failure("profile-missing", "No local profile was found."),
      )
      .mockResolvedValueOnce(success({ profile, livingRun: null }));
    const repository = repositoryFor(
      { profile, livingRun: null },
      { loadState },
    );
    const store = createTestStore(repository);

    await store.initialize();

    expect(repository.bootstrapProfile).toHaveBeenCalledWith({
      profileId: "profile-created",
      now: 1_700_000_000_500,
      commitId: "commit-bootstrap-created",
    });
    expect(loadState).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot()).toMatchObject({
      loadStatus: "ready",
      profile,
      livingRun: null,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
    });
  });

  it("recovers a living run into archive mode with the first unlocked class selected", async () => {
    const livingRun = makeLivingRun();
    const store = createTestStore(
      repositoryFor({ profile: makeProfile(), livingRun }),
    );

    await store.initialize();

    expect(store.getSnapshot()).toMatchObject({
      loadStatus: "ready",
      livingRun,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
      isReplacementGuardOpen: false,
    });
  });

  it("fails closed on invalid existing data without attempting bootstrap", async () => {
    const repository = repositoryFor(
      { profile: makeProfile(), livingRun: null },
      {
        loadState: vi.fn(async () =>
          failure("invalid-profile", "The saved profile is invalid."),
        ),
      },
    );
    const store = createTestStore(repository);

    await store.initialize();

    expect(repository.bootstrapProfile).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({
      loadStatus: "failed",
      profile: null,
      livingRun: null,
      selectedClassId: null,
      launchMode: "archive",
      fatalMessage:
        "The saved profile is invalid. Existing local data was not reset.",
    });
  });

  it("serializes queued selection after startup and continues after a rejected selection", async () => {
    const pendingLoad = deferred<PersistenceResult<RunState>>();
    const profile = makeProfile();
    const repository = repositoryFor(
      { profile, livingRun: null },
      { loadState: vi.fn(() => pendingLoad.promise) },
    );
    const store = createTestStore(repository);

    const initialization = store.initialize();
    const rejectedSelection = store.dispatch({
      type: "home/select-class",
      classId: "class-unknown" as ContentId,
    });
    const validSelection = store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });
    pendingLoad.resolve(success({ profile, livingRun: null }));

    await Promise.all([initialization, rejectedSelection, validSelection]);
    expect(store.getSnapshot().selectedClassId).toBe(GLITCH_KNIGHT);
  });

  it("contains an adapter promise rejection and leaves the executor available", async () => {
    const repository = repositoryFor(
      { profile: makeProfile(), livingRun: null },
      { loadState: vi.fn(() => Promise.reject(new Error("adapter exploded"))) },
    );
    const store = createTestStore(repository);

    const initialization = store.initialize();
    const laterCommand = store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });
    await expect(initialization).resolves.toBeUndefined();
    await expect(laterCommand).resolves.toBeUndefined();
    expect(store.getSnapshot().loadStatus).toBe("failed");
  });
});

describe("createAppStore lifecycle commands", () => {
  it("selects only known unlocked classes and leaves durable state untouched", async () => {
    const profile = makeProfile();
    const repository = repositoryFor({ profile, livingRun: null });
    const store = createTestStore(repository);
    await store.initialize();

    const durableBefore = {
      profile: store.getSnapshot().profile,
      livingRun: store.getSnapshot().livingRun,
    };
    await store.dispatch({ type: "home/select-class", classId: NEON_MAGE });
    expect(store.getSnapshot().selectedClassId).toBe(CIRCUIT_ROGUE);
    await store.dispatch({
      type: "home/select-class",
      classId: "class-unknown" as ContentId,
    });
    expect(store.getSnapshot().selectedClassId).toBe(CIRCUIT_ROGUE);

    await store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });
    expect(store.getSnapshot()).toMatchObject({
      profile: durableBefore.profile,
      livingRun: durableBefore.livingRun,
      selectedClassId: GLITCH_KNIGHT,
    });
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("opens the replacement guard on the first Start click without overwriting", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = repositoryFor({ profile, livingRun });
    const store = createTestStore(repository);
    await store.initialize();

    await store.dispatch({ type: "run/request-start" });

    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun,
      isReplacementGuardOpen: true,
      isBusy: false,
    });
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("persists a new run before publishing its durable snapshot", async () => {
    const profile = makeProfile();
    const pendingStart = deferred<PersistenceResult<RunState>>();
    const startRun = vi.fn<RunLifecycleRepository["startRun"]>(
      () => pendingStart.promise,
    );
    const repository = repositoryFor(
      { profile, livingRun: null },
      { startRun },
    );
    const store = createTestStore(repository, {
      ids: ["run-new", "commit-start-new"],
      seed: "seed-new",
      now: 1_700_000_000_900,
    });
    await store.initialize();
    const publishedRuns: Array<LivingRun | null> = [];
    store.subscribe(() => publishedRuns.push(store.getSnapshot().livingRun));

    const start = store.dispatch({ type: "run/request-start" });
    await vi.waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));

    expect(store.getSnapshot()).toMatchObject({
      isBusy: true,
      livingRun: null,
      launchMode: "archive",
    });
    expect(publishedRuns.every((run) => run === null)).toBe(true);
    const instruction = startRun.mock.calls[0]?.[0];
    if (instruction === undefined) {
      throw new Error("expected a start persistence instruction");
    }
    expect(instruction).toMatchObject({
      kind: "start-run",
      runId: "run-new",
      commitId: "commit-start-new",
      expectedProfileRevision: profile.revision,
      proposedRun: {
        runId: "run-new",
        seed: "seed-new",
        createdAt: 1_700_000_000_900,
      },
    });

    pendingStart.resolve(
      success({ profile, livingRun: instruction.proposedRun }),
    );
    await start;
    expect(store.getSnapshot()).toMatchObject({
      livingRun: instruction.proposedRun,
      launchMode: "checkpoint",
      isBusy: false,
      saveSignal: {
        tone: "saved",
        message: "New Circuit Rogue run saved at Depth 1.",
      },
    });
  });

  it("keeps the prior durable state and reports a typed start rejection", async () => {
    const profile = makeProfile();
    const repository = repositoryFor(
      { profile, livingRun: null },
      {
        startRun: vi.fn(async () =>
          failure(
            "stale-profile-revision",
            "The profile changed before the run could start.",
          ),
        ),
      },
    );
    const store = createTestStore(repository, {
      ids: ["run-stale", "commit-stale"],
    });
    await store.initialize();

    await store.dispatch({ type: "run/request-start" });

    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun: null,
      launchMode: "archive",
      isBusy: false,
      saveSignal: {
        tone: "rejected",
        message:
          "The new run was not saved. The profile changed before the run could start.",
      },
    });
  });

  it("suppresses duplicate rapid Start commands and class changes while busy", async () => {
    const profile = makeProfile();
    const pendingStart = deferred<PersistenceResult<RunState>>();
    const startRun = vi.fn<RunLifecycleRepository["startRun"]>(
      () => pendingStart.promise,
    );
    const repository = repositoryFor(
      { profile, livingRun: null },
      { startRun },
    );
    const store = createTestStore(repository, {
      ids: ["run-one", "commit-one"],
    });
    await store.initialize();

    const first = store.dispatch({ type: "run/request-start" });
    const duplicate = store.dispatch({ type: "run/request-start" });
    await vi.waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));
    await store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });

    const instruction = startRun.mock.calls[0]?.[0];
    if (instruction === undefined) {
      throw new Error("expected a start persistence instruction");
    }
    pendingStart.resolve(
      success({ profile, livingRun: instruction.proposedRun }),
    );
    await Promise.all([first, duplicate]);

    expect(startRun).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().selectedClassId).toBe(CIRCUIT_ROGUE);
  });

  it("resumes exactly the restored class and depth with zero persistence writes", async () => {
    const livingRun = makeLivingRun();
    const repository = repositoryFor({
      profile: makeProfile(),
      livingRun,
    });
    const store = createTestStore(repository);
    await store.initialize();
    await store.dispatch({ type: "run/request-start" });

    await store.dispatch({ type: "run/resume" });

    expect(store.getSnapshot()).toMatchObject({
      livingRun,
      launchMode: "checkpoint",
      isReplacementGuardOpen: false,
      saveSignal: {
        tone: "saved",
        message: "Restored Glitch Knight at Depth 1.",
      },
    });
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("cancels replacement with zero writes and preserves selection and durable state", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = repositoryFor({ profile, livingRun });
    const store = createTestStore(repository);
    await store.initialize();
    await store.dispatch({
      type: "home/select-class",
      classId: GLITCH_KNIGHT,
    });
    await store.dispatch({ type: "run/request-start" });

    await store.dispatch({ type: "run/cancel-replacement" });

    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun,
      selectedClassId: GLITCH_KNIGHT,
      isReplacementGuardOpen: false,
    });
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("returns to archive mode without changing the living run", async () => {
    const livingRun = makeLivingRun();
    const repository = repositoryFor({
      profile: makeProfile(),
      livingRun,
    });
    const store = createTestStore(repository);
    await store.initialize();
    await store.dispatch({ type: "run/resume" });

    await store.dispatch({ type: "run/return-to-archive" });

    expect(store.getSnapshot()).toMatchObject({
      livingRun,
      launchMode: "archive",
    });
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(repository.abandonRun).not.toHaveBeenCalled();
  });

  it("commits abandon, publishes no-run truth, then commits the replacement", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const noRunState: RunState = { profile, livingRun: null };
    const pendingStart = deferred<PersistenceResult<RunState>>();
    const abandonRun = vi.fn<RunLifecycleRepository["abandonRun"]>(async () =>
      success(noRunState),
    );
    const startRun = vi.fn<RunLifecycleRepository["startRun"]>(
      () => pendingStart.promise,
    );
    const repository = repositoryFor(
      { profile, livingRun },
      { abandonRun, startRun },
    );
    const store = createTestStore(repository, {
      ids: ["commit-abandon", "run-replacement", "commit-replacement"],
      seed: "seed-replacement",
      now: 1_700_000_001_000,
    });
    await store.initialize();
    await store.dispatch({ type: "run/request-start" });

    const replacement = store.dispatch({
      type: "run/confirm-abandon-and-start",
    });
    await vi.waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));

    expect(abandonRun).toHaveBeenCalledWith({
      kind: "abandon-run",
      runId: livingRun.runId,
      expectedRevision: livingRun.revision,
      commitId: "commit-abandon",
    });
    expect(abandonRun.mock.invocationCallOrder[0]).toBeLessThan(
      startRun.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
    expect(store.getSnapshot()).toMatchObject({
      livingRun: null,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: true,
      saveSignal: { tone: "saved" },
    });

    const startInstruction = startRun.mock.calls[0]?.[0];
    if (startInstruction === undefined) {
      throw new Error("expected replacement start instruction");
    }
    expect(startInstruction).toMatchObject({
      kind: "start-run",
      runId: "run-replacement",
      commitId: "commit-replacement",
      proposedRun: {
        classId: CIRCUIT_ROGUE,
        seed: "seed-replacement",
      },
    });
    pendingStart.resolve(
      success({ profile, livingRun: startInstruction.proposedRun }),
    );
    await replacement;

    expect(store.getSnapshot()).toMatchObject({
      livingRun: startInstruction.proposedRun,
      launchMode: "checkpoint",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: {
        tone: "saved",
        message: "Replacement Circuit Rogue run saved at Depth 1.",
      },
    });
  });

  it("keeps the old run when abandon persistence fails", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = repositoryFor(
      { profile, livingRun },
      {
        abandonRun: vi.fn(async () =>
          failure(
            "stale-run-revision",
            "The living run changed before it could be abandoned.",
          ),
        ),
      },
    );
    const store = createTestStore(repository, { ids: ["commit-abandon"] });
    await store.initialize();
    await store.dispatch({ type: "run/request-start" });

    await store.dispatch({ type: "run/confirm-abandon-and-start" });

    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun,
      isBusy: false,
      saveSignal: {
        tone: "rejected",
        message:
          "The living run was not abandoned. The living run changed before it could be abandoned.",
      },
    });
    expect(repository.startRun).not.toHaveBeenCalled();
  });

  it("never resurrects an abandoned run when replacement creation fails", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = repositoryFor(
      { profile, livingRun },
      {
        abandonRun: vi.fn(async () => success({ profile, livingRun: null })),
        startRun: vi.fn(async () =>
          failure("transaction-failed", "The local save transaction failed."),
        ),
      },
    );
    const store = createTestStore(repository, {
      ids: ["commit-abandon", "run-replacement", "commit-replacement"],
    });
    await store.initialize();
    await store.dispatch({ type: "run/request-start" });

    await store.dispatch({ type: "run/confirm-abandon-and-start" });

    expect(store.getSnapshot()).toMatchObject({
      profile,
      livingRun: null,
      selectedClassId: CIRCUIT_ROGUE,
      launchMode: "archive",
      isReplacementGuardOpen: false,
      isBusy: false,
      saveSignal: {
        tone: "warning",
        message:
          "The previous run was abandoned, but the replacement run could not be started. The local save transaction failed.",
      },
    });
  });

  it("rejects an unguarded replacement without any persistence write", async () => {
    const livingRun = makeLivingRun();
    const repository = repositoryFor({
      profile: makeProfile(),
      livingRun,
    });
    const store = createTestStore(repository);
    await store.initialize();

    await store.dispatch({ type: "run/confirm-abandon-and-start" });

    expect(repository.abandonRun).not.toHaveBeenCalled();
    expect(repository.startRun).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toMatchObject({
      livingRun,
      saveSignal: { tone: "rejected" },
    });
  });
});

function createRouteMemoryRepository(
  profile: Profile,
  livingRun: LivingRun,
): RunLifecycleRepository {
  let currentRun = livingRun;
  return {
    bootstrapProfile: vi.fn(async () => success(profile)),
    loadState: vi.fn(async () => success({ profile, livingRun: currentRun })),
    startRun: vi.fn<RunLifecycleRepository["startRun"]>(async (instruction: StartRunPersistenceInstruction) => {
      currentRun = instruction.proposedRun;
      return success({ profile, livingRun: currentRun });
    }),
    abandonRun: vi.fn(async () => {
      currentRun = null as unknown as LivingRun;
      return success({ profile, livingRun: null });
    }),
    saveCheckpoint: vi.fn<RunLifecycleRepository["saveCheckpoint"]>(async (instruction: SaveCheckpointPersistenceInstruction) => {
      currentRun = instruction.proposedRun;
      return success({ profile, livingRun: currentRun });
    }),
  };
}

describe("createAppStore route commands", () => {
  it("materializes route offers and persists them via saveCheckpoint", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize"],
      now: 1_700_000_000_600,
    });
    await store.initialize();

    await store.dispatch({ type: "route/materialize" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.routeState?.offers).toHaveLength(4);
    expect(snapshot.livingRun?.routeState?.offers.map((o) => o.roomType))
      .toEqual(["battle", "elite", "shop", "recovery"]);
    expect(snapshot.livingRun?.routeState?.selectedOfferId).toBeNull();
    expect(snapshot.livingRun?.routeState?.committed).toBe(false);
    expect(snapshot.livingRun?.revision).toBe(1);
    expect(snapshot.isBusy).toBe(false);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Route offers saved at Depth 1.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(1);
    const instruction = vi.mocked(repository.saveCheckpoint).mock.calls[0]?.[0];
    expect(instruction).toMatchObject({
      kind: "save-checkpoint",
      runId: livingRun.runId,
      expectedRevision: 0,
      proposedRun: { revision: 1 },
    });
  });

  it("selects a route offer and persists the selection", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select"],
      now: 1_700_000_000_600,
    });
    await store.initialize();

    await store.dispatch({ type: "route/materialize" });
    const offerId = store.getSnapshot().livingRun!.routeState!.offers[0]!.offerId;
    await store.dispatch({ type: "route/select-offer", offerId });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.routeState?.selectedOfferId).toBe(offerId);
    expect(snapshot.livingRun?.revision).toBe(2);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Route selection saved.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(2);
  });

  it("commits the route and transitions to the room phase", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route"],
      now: 1_700_000_000_600,
    });
    await store.initialize();

    await store.dispatch({ type: "route/materialize" });
    const offerId = store.getSnapshot().livingRun!.routeState!.offers[0]!.offerId;
    await store.dispatch({ type: "route/select-offer", offerId });
    await store.dispatch({ type: "route/commit" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.phase).toBe("room");
    expect(snapshot.livingRun?.routeState).toBeNull();
    expect(snapshot.livingRun?.roomState).not.toBeNull();
    expect(snapshot.livingRun?.roomState?.status).toBe("ready");
    expect(snapshot.livingRun?.revision).toBe(3);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Committed route to battle room.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(3);
  });

  it("rejects re-materialization after offers exist", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-materialize-2"],
      now: 1_700_000_000_600,
    });
    await store.initialize();

    await store.dispatch({ type: "route/materialize" });
    const firstRevision = store.getSnapshot().livingRun!.revision;
    await store.dispatch({ type: "route/materialize" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.revision).toBe(firstRevision);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message: "Route offers are already materialized and cannot be rerolled.",
    });
  });

  it("rejects an unknown offer without changing state", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select"],
      now: 1_700_000_000_600,
    });
    await store.initialize();

    await store.dispatch({ type: "route/materialize" });
    const beforeSelect = store.getSnapshot().livingRun!;
    await store.dispatch({ type: "route/select-offer", offerId: "offer-fake" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun?.routeState?.selectedOfferId)
      .toBe(beforeSelect.routeState?.selectedOfferId);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message: "The selected route offer is not part of the current route.",
    });
  });
});
async function storeInRoomPhase(
  roomType: "battle" | "shop" | "recovery",
  store: AppStore,
): Promise<void> {
  await store.dispatch({ type: "route/materialize" });
  const offerId = store
    .getSnapshot()
    .livingRun!.routeState!.offers.find(
      (offer) => offer.roomType === roomType,
    )!.offerId;
  await store.dispatch({ type: "route/select-offer", offerId });
  await store.dispatch({ type: "route/commit" });
}

describe("createAppStore room and reward commands", () => {
  it("purchases a shop item, deducts currency, and persists via saveCheckpoint", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun({ runCurrency: 999 });
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-buy"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("shop", store);

    const before = store.getSnapshot().livingRun!;
    const item = before.roomState!.shop!.inventory[0]!;
    const currencyBefore = before.runCurrency;

    await store.dispatch({ type: "room/buy-shop-item", itemId: item.itemId });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.roomState!.shop!.purchasedItemIds).toEqual([item.itemId]);
    expect(snapshot.livingRun!.runCurrency).toBe(currencyBefore - item.price);
    expect(snapshot.livingRun!.roomState!.status).toBe("in_progress");
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Purchase saved.",
    });
    expect(vi.mocked(repository.saveCheckpoint).mock.calls.at(-1)?.[0]).toMatchObject({
      kind: "save-checkpoint",
      runId: livingRun.runId,
      proposedRun: { runCurrency: currencyBefore - item.price },
    });
  });

  it("commits recovery, restoring integrity clamped to the maximum", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-recovery"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("recovery", store);

    await store.dispatch({ type: "room/commit-recovery" });

    const snapshot = store.getSnapshot();
    const run = snapshot.livingRun!;
    expect(run.roomState!.recovery!.committed).toBe(true);
    expect(run.roomState!.recovery!.commitId).not.toBeNull();
    expect(run.integrityCurrent).toBe(Math.min(run.integrityCurrent, run.integrityMax));
    expect(run.roomState!.status).toBe("in_progress");
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Recovery committed.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(4);
  });

  it("resolves a utility room into the reward phase with a three-card draft", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-resolve"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("recovery", store);

    await store.dispatch({ type: "room/resolve" });

    const snapshot = store.getSnapshot();
    const run = snapshot.livingRun!;
    expect(run.phase).toBe("reward");
    expect(run.roomState).toBeNull();
    expect(run.rewardState!.cards).toHaveLength(3);
    expect(new Set(run.rewardState!.cards.map((card) => card.cardId)).size).toBe(3);
    expect(run.progress.roomsResolved).toBe(1);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Room resolved. Reward draft saved.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(4);
  });

  it("selects a reward and lands on a materialized route for the next depth", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: [
        "commit-materialize",
        "commit-select",
        "commit-route",
        "commit-resolve",
        "commit-reward",
      ],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("recovery", store);
    await store.dispatch({ type: "room/resolve" });
    const cardId = store.getSnapshot().livingRun!.rewardState!.cards[0]!.cardId;

    await store.dispatch({ type: "reward/select", cardId });

    const snapshot = store.getSnapshot();
    const run = snapshot.livingRun!;
    expect(run.phase).toBe("route");
    expect(run.rewardState).toBeNull();
    expect(run.depth).toBe(livingRun.depth + 1);
    expect(run.routeState!.offers.length).toBeGreaterThan(0);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: `Reward selected. Advancing to Depth ${String(run.depth)}.`,
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(5);
  });

  it("names the displaced reward in the save signal when a full side is replaced", async () => {
    // The slots-aware generator emits only equipment cards when the skill side
    // is full, so the replacement proof fills both sides and selects from the
    // all-equipment draft (same reducer replacement path, deterministic seed).
    const profile = makeProfile();
    const livingRun = makeLivingRun({
      build: {
        activeSkillIds: [
          "skill-phase-shunt" as ContentId,
          "skill-prism-burst" as ContentId,
          "skill-rebound-lens" as ContentId,
        ],
        passiveEquipmentIds: [
          "equipment-fractal-core" as ContentId,
          "equipment-arc-coil" as ContentId,
          "equipment-soft-patch" as ContentId,
          "equipment-static-ward" as ContentId,
        ],
        carryOverRelicId: null,
      },
    });
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: [
        "commit-materialize",
        "commit-select",
        "commit-route",
        "commit-resolve",
        "commit-reward",
      ],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("recovery", store);
    await store.dispatch({ type: "room/resolve" });

    const reward = store.getSnapshot().livingRun!.rewardState!;
    expect(reward.cards.every((card) => card.rewardType === "equipment")).toBe(true);
    const held = new Set(store.getSnapshot().livingRun!.build.passiveEquipmentIds);
    const equipmentCard = reward.cards.find((card) => !held.has(card.baseRewardId))!;

    await store.dispatch({ type: "reward/select", cardId: equipmentCard.cardId });

    const snapshot = store.getSnapshot();

    const build = snapshot.livingRun!.build;
    expect(build.activeSkillIds).toEqual([
      "skill-phase-shunt",
      "skill-prism-burst",
      "skill-rebound-lens",
    ]);
    expect(build.passiveEquipmentIds).toHaveLength(4);
    expect(build.passiveEquipmentIds).not.toContain("equipment-fractal-core");
    expect(build.passiveEquipmentIds).toContain(equipmentCard.baseRewardId);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message:
        "Reward selected; replaced Fractal Core. Advancing to Depth 2.",
    });
  });

  it("rejects resolving a battle room with the bounded combat message", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-resolve"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);

    await store.dispatch({ type: "room/resolve" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.phase).toBe("room");
    expect(snapshot.livingRun!.roomState!.status).toBe("ready");
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message:
        "Clear this room's combat encounter before it can be resolved.",
    });
  });

  it("rejects a second reward selection after the draft was consumed", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: [
        "commit-materialize",
        "commit-select",
        "commit-route",
        "commit-resolve",
        "commit-reward",
        "commit-reward-2",
      ],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("recovery", store);
    await store.dispatch({ type: "room/resolve" });
    const cardId = store.getSnapshot().livingRun!.rewardState!.cards[0]!.cardId;
    await store.dispatch({ type: "reward/select", cardId });

    await store.dispatch({ type: "reward/select", cardId });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.phase).toBe("route");
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message: "The current archive state is invalid. No saved data was changed.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(5);
  });
});

describe("createAppStore combat commands", () => {
  it("launches in a committed battle room, persisting via saveCheckpoint", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-launch"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);

    await store.dispatch({ type: "combat/launch", aimAngle: 0.2 });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.roomState!.status).toBe("in_progress");
    expect(snapshot.livingRun!.roomState!.combatCheckpoint).not.toBeNull();
    expect(snapshot.livingRun!.revision).toBe(4);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "saved",
      message: "Launch committed.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(4);
    expect(
      vi.mocked(repository.saveCheckpoint).mock.calls.at(-1)?.[0]
    ).toMatchObject({
      kind: "save-checkpoint",
      runId: livingRun.runId,
      proposedRun: { revision: 4 },
    });
  });

  it("reports a clear outcome and resolves the room through the store", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: [
        "commit-materialize",
        "commit-select",
        "commit-route",
        "commit-outcome",
        "commit-resolve",
      ],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);
    const eventKey = store.getSnapshot().livingRun!.roomState!.eventKey;

    await store.dispatch({
      type: "combat/report-outcome",
      outcome: { outcomeId: `${eventKey}:outcome:clear:0`, kind: "clear" },
    });
    expect(store.getSnapshot().saveSignal).toMatchObject({
      tone: "saved",
      message: "Combat outcome committed.",
    });

    await store.dispatch({ type: "room/resolve" });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.phase).toBe("reward");
    expect(snapshot.livingRun!.roomState).toBeNull();
    expect(snapshot.livingRun!.rewardState!.cards).toHaveLength(3);
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(5);
  });

  it("reports a loss outcome with the decrement visible in the published run", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun({ integrityCurrent: 3 });
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-outcome"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);
    const eventKey = store.getSnapshot().livingRun!.roomState!.eventKey;

    await store.dispatch({
      type: "combat/report-outcome",
      outcome: { outcomeId: `${eventKey}:outcome:loss_of_ball:0`, kind: "loss_of_ball" },
    });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun!.integrityCurrent).toBe(2);
    expect(snapshot.livingRun!.roomState!.processedOutcomeIds).toHaveLength(1);
    expect(snapshot.livingRun!.roomState!.combatCheckpoint!.kind).toBe("loss_of_ball");
    expect(snapshot.saveSignal).toMatchObject({ tone: "saved" });
  });

  it("spends a skill charge through the store and persists the ledger", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun({
      build: {
        activeSkillIds: ["skill-shield-bash" as ContentId],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
      },
    });
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route", "commit-skill"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);

    await store.dispatch({ type: "combat/use-skill", skillId: "skill-shield-bash" as ContentId });

    const charges = store.getSnapshot().livingRun!.roomState!.combatCheckpoint!.skillCharges;
    expect(charges).toEqual([
      { skillId: "skill-shield-bash", remaining: 1, maximum: 2 },
    ]);
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(4);
  });

  it("rejects combat commands outside a combat room without touching durable state", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: ["commit-materialize", "commit-select", "commit-route"],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("shop", store);
    const before = store.getSnapshot().livingRun;

    await store.dispatch({ type: "combat/launch", aimAngle: 0 });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun).toBe(before);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message: "Clear this room's combat encounter before it can be resolved.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(3);
  });

  it("rejects a duplicate outcome report and leaves the archive unchanged", async () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const repository = createRouteMemoryRepository(profile, livingRun);
    const store = createTestStore(repository, {
      ids: [
        "commit-materialize",
        "commit-select",
        "commit-route",
        "commit-outcome",
        "commit-outcome-2",
      ],
      now: 1_700_000_000_600,
    });
    await store.initialize();
    await storeInRoomPhase("battle", store);
    const eventKey = store.getSnapshot().livingRun!.roomState!.eventKey;
    const outcome = { outcomeId: `${eventKey}:outcome:clear:0`, kind: "clear" as const };
    await store.dispatch({ type: "combat/report-outcome", outcome });
    const afterFirst = store.getSnapshot().livingRun;

    await store.dispatch({ type: "combat/report-outcome", outcome });

    const snapshot = store.getSnapshot();
    expect(snapshot.livingRun).toBe(afterFirst);
    expect(snapshot.saveSignal).toMatchObject({
      tone: "rejected",
      message: "That combat outcome has already been recorded for this room.",
    });
    expect(repository.saveCheckpoint).toHaveBeenCalledTimes(4);
  });
});
