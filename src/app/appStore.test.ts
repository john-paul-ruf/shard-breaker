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
} from "../persistence/envelopes";
import { createAppStore } from "./appStore";

const catalog = createContentCatalog();
const CIRCUIT_ROGUE = "class-circuit-rogue" as ContentId;
const GLITCH_KNIGHT = "class-glitch-knight" as ContentId;

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
    GLITCH_KNIGHT,
    4,
    null,
    {
      runId: "run-restored",
      seed: "seed-restored",
      now: 1_700_000_000_100,
      commitId: "commit-start",
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

function repositoryFor(
  state: RunState,
  overrides: Partial<RunLifecycleRepository> = {},
): RunLifecycleRepository {
  return {
    bootstrapProfile: vi.fn(async () => success(state.profile)),
    loadState: vi.fn(async () => success(state)),
    startRun: vi.fn(async () => success(state)),
    abandonRun: vi.fn(async () => success(state)),
    ...overrides,
  };
}

function createTestStore(repository: RunLifecycleRepository) {
  const ids = ["profile-created", "commit-bootstrap-created"];
  return createAppStore({
    catalog,
    repository,
    clock: () => 1_700_000_000_500,
    createId: () => ids.shift() ?? "id-extra",
    createSeed: () => "seed-created",
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
