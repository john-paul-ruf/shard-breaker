import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import type { ContentId } from "../domain/content/catalog";
import { createContentCatalog } from "../domain/content/catalog";
import type { RunCommand } from "../domain/run/commands";
import type { LivingRun, Profile, RunState } from "../domain/run/model";
import { createInitialLivingRun } from "../domain/run/model";
import { runReducer } from "../domain/run/reducer";
import { openDatabase } from "./database";
import type {
  AbandonRunPersistenceInstruction,
  RunLifecycleRepository,
  SaveCheckpointPersistenceInstruction,
  ShardbreakDatabase,
  StartRunPersistenceInstruction,
} from "./envelopes";
import { createRunLifecycleRepository } from "./repositories";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
let databaseSequence = 0;

interface TestDatabase {
  readonly database: ShardbreakDatabase;
  readonly factory: IDBFactory;
  readonly name: string;
}

async function deleteDatabase(factory: IDBFactory, name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = factory.deleteDatabase(name);
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
    request.addEventListener("blocked", () => reject(new Error("database deletion blocked")));
  });
}

async function openTestDatabase(): Promise<TestDatabase> {
  const factory = new IDBFactory();
  const name = `shardbreak-test-${String(databaseSequence += 1)}`;
  const result = await openDatabase({ name, indexedDB: factory });
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return { database: result.value, factory, name };
}

async function closeAndDelete(testDatabase: TestDatabase): Promise<void> {
  testDatabase.database.close();
  await deleteDatabase(testDatabase.factory, testDatabase.name);
}

const profileMetadata = {
  profileId: "profile-1",
  now: 1_700_000_000_000,
  commitId: "commit-bootstrap",
} as const;

async function bootstrap(repository: RunLifecycleRepository): Promise<Profile> {
  const result = await repository.bootstrapProfile(profileMetadata);
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  return result.value;
}

function startInstruction(
  profile: Profile,
  overrides: Partial<Extract<RunCommand, { type: "StartRun" }>> = {},
): StartRunPersistenceInstruction {
  const command: Extract<RunCommand, { type: "StartRun" }> = {
    type: "StartRun",
    classId: asContentId("class-glitch-knight"),
    runId: "run-1",
    seed: "seed-1",
    now: profileMetadata.now + 1,
    commitId: "commit-start",
    expectedProfileRevision: profile.revision,
    ...overrides,
  };
  const transition = runReducer({ profile, livingRun: null }, command, catalog);
  if (!transition.ok || transition.persistence.kind !== "start-run") {
    throw new Error("test start command must produce a start transition");
  }
  if (transition.state.livingRun === null) {
    throw new Error("test start transition must contain a living run");
  }
  return {
    ...transition.persistence,
    proposedRun: transition.state.livingRun,
  };
}

function abandonInstruction(
  overrides: Partial<AbandonRunPersistenceInstruction> = {},
): AbandonRunPersistenceInstruction {
  return {
    kind: "abandon-run",
    runId: "run-1",
    commitId: "commit-abandon",
    expectedRevision: 0,
    ...overrides,
  };
}

function abortingStartDatabase(database: ShardbreakDatabase): ShardbreakDatabase {
  return {
    transaction: (
      storeNames: readonly ["profile", "livingRun"],
      mode: "readwrite",
    ) => {
      const transaction = database.transaction(storeNames, mode);
      return {
        objectStore: (name: "profile" | "livingRun") => {
          if (name === "profile") {
            return {
              get: () => transaction.objectStore("profile").get("current"),
            };
          }
          return {
            get: () => transaction.objectStore("livingRun").get("current"),
            put: async (run: LivingRun) => {
              const key = await transaction.objectStore("livingRun").put(run);
              transaction.abort();
              return key;
            },
          };
        },
        done: transaction.done,
      };
    },
  } as unknown as ShardbreakDatabase;
}

describe("database migration", () => {
  it("creates exactly two singleton stores with no indexes", async () => {
    const testDatabase = await openTestDatabase();
    try {
      expect(testDatabase.database.version).toBe(1);
      expect([...testDatabase.database.objectStoreNames].sort()).toEqual([
        "livingRun",
        "profile",
      ]);

      const transaction = testDatabase.database.transaction(
        ["profile", "livingRun"],
        "readonly",
      );
      for (const name of ["profile", "livingRun"] as const) {
        const store = transaction.objectStore(name);
        expect(store.keyPath).toBe("recordKey");
        expect(store.indexNames.length).toBe(0);
      }
      await transaction.done;
    } finally {
      await closeAndDelete(testDatabase);
    }
  });
});

describe("profile bootstrap and loading", () => {
  it("creates the singleton once and returns the original on repeated bootstrap", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const first = await repository.bootstrapProfile(profileMetadata);
      const second = await repository.bootstrapProfile({
        profileId: "profile-replacement",
        now: profileMetadata.now + 10_000,
        commitId: "commit-replacement",
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      if (first.ok && second.ok) {
        expect(second.value).toEqual(first.value);
        expect(second.value.profileId).toBe("profile-1");
        expect(second.value.lastCommitId).toBe("commit-bootstrap");
      }
      expect(await testDatabase.database.count("profile")).toBe(1);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("reloads the same valid profile after the database is closed and reopened", async () => {
    const testDatabase = await openTestDatabase();
    const repository = createRunLifecycleRepository(testDatabase.database, catalog);
    const bootstrapped = await repository.bootstrapProfile(profileMetadata);
    expect(bootstrapped.ok).toBe(true);
    testDatabase.database.close();

    const reopened = await openDatabase({
      name: testDatabase.name,
      indexedDB: testDatabase.factory,
    });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) {
      await deleteDatabase(testDatabase.factory, testDatabase.name);
      throw new Error(reopened.error.message);
    }
    try {
      const loaded = await createRunLifecycleRepository(reopened.value, catalog).loadState();
      expect(loaded.ok).toBe(true);
      if (loaded.ok && bootstrapped.ok) {
        expect(loaded.value).toEqual({ profile: bootstrapped.value, livingRun: null });
      }
    } finally {
      reopened.value.close();
      await deleteDatabase(testDatabase.factory, testDatabase.name);
    }
  });

  it("returns profile-missing when load runs before bootstrap", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const loaded = await createRunLifecycleRepository(
        testDatabase.database,
        catalog,
      ).loadState();
      expect(loaded).toMatchObject({
        ok: false,
        error: { code: "profile-missing" },
      });
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects an invalid existing profile without overwriting it", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const bootstrapped = await repository.bootstrapProfile(profileMetadata);
      expect(bootstrapped.ok).toBe(true);
      if (!bootstrapped.ok) return;

      const invalidProfile: Profile = { ...bootstrapped.value, shards: -1 };
      await testDatabase.database.put("profile", invalidProfile);
      const result = await repository.bootstrapProfile({
        profileId: "profile-replacement",
        now: profileMetadata.now + 1,
        commitId: "commit-replacement",
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid-profile" },
      });
      expect(await testDatabase.database.get("profile", "current")).toEqual(invalidProfile);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects an invalid living run without changing the valid profile", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const bootstrapped = await repository.bootstrapProfile(profileMetadata);
      expect(bootstrapped.ok).toBe(true);
      if (!bootstrapped.ok) return;

      const invalidRun: LivingRun = {
        ...createInitialLivingRun(
          catalog.contentVersion,
          asContentId("class-glitch-knight"),
          4,
          null,
          {
            runId: "run-invalid",
            seed: "seed-invalid",
            now: profileMetadata.now + 1,
            commitId: "commit-invalid",
          },
        ),
        cycle: 9,
      };
      await testDatabase.database.put("livingRun", invalidRun);
      const profileBefore = await testDatabase.database.get("profile", "current");

      const loaded = await repository.loadState();

      expect(loaded).toMatchObject({
        ok: false,
        error: { code: "invalid-living-run" },
      });
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.get("livingRun", "current")).toEqual(invalidRun);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("converts operations on a closed handle to a typed transaction error", async () => {
    const testDatabase = await openTestDatabase();
    const repository = createRunLifecycleRepository(testDatabase.database, catalog);
    testDatabase.database.close();
    try {
      expect(await repository.loadState()).toMatchObject({
        ok: false,
        error: { code: "transaction-failed" },
      });
    } finally {
      await deleteDatabase(testDatabase.factory, testDatabase.name);
    }
  });
});

describe("atomic run start", () => {
  it("creates exactly one run and leaves permanent profile progression unchanged", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const profileBefore = await testDatabase.database.get("profile", "current");

      const started = await repository.startRun(startInstruction(profile));

      expect(started.ok).toBe(true);
      if (started.ok) {
        expect(started.value.profile).toEqual(profile);
        expect(started.value.livingRun).toMatchObject({
          runId: "run-1",
          revision: 0,
          depth: 1,
          cycle: 1,
          classId: "class-glitch-knight",
          integrityCurrent: 4,
          integrityMax: 4,
        });
      }
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.count("livingRun")).toBe(1);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("enforces one living run and rejects a duplicate retry without overwriting", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const instruction = startInstruction(profile);
      const first = await repository.startRun(instruction);
      expect(first.ok).toBe(true);
      const storedBefore = await testDatabase.database.get("livingRun", "current");

      const retry = await repository.startRun(instruction);
      const otherRun = await repository.startRun(
        startInstruction(profile, {
          runId: "run-2",
          seed: "seed-2",
          commitId: "commit-start-2",
        }),
      );

      expect(retry).toMatchObject({
        ok: false,
        error: { code: "living-run-exists" },
      });
      expect(otherRun).toMatchObject({
        ok: false,
        error: { code: "living-run-exists" },
      });
      expect(await testDatabase.database.get("livingRun", "current")).toEqual(storedBefore);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects a stale profile revision before writing", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const instruction = startInstruction(profile);

      const result = await repository.startRun({
        ...instruction,
        expectedProfileRevision: profile.revision + 1,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "stale-profile-revision" },
      });
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects a locked class and leaves both prior records intact", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const profileBefore = await testDatabase.database.get("profile", "current");
      const proposedRun = createInitialLivingRun(
        profile.contentVersion,
        asContentId("class-neon-mage"),
        2,
        null,
        {
          runId: "run-locked",
          seed: "seed-locked",
          now: profileMetadata.now + 1,
          commitId: "commit-locked",
        },
      );

      const result = await repository.startRun({
        kind: "start-run",
        runId: proposedRun.runId,
        commitId: proposedRun.lastCommitId,
        expectedProfileRevision: profile.revision,
        proposedRun,
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid-living-run" },
      });
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects malformed proposed state inside the transaction without partial writes", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const profileBefore = await testDatabase.database.get("profile", "current");
      const instruction = startInstruction(profile);

      const result = await repository.startRun({
        ...instruction,
        proposedRun: { ...instruction.proposedRun, cycle: 9 },
      });

      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid-living-run" },
      });
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rolls back a living-run put when the transaction aborts before completion", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const profileBefore = await testDatabase.database.get("profile", "current");
      const abortingRepository = createRunLifecycleRepository(
        abortingStartDatabase(testDatabase.database),
        catalog,
      );

      const result = await abortingRepository.startRun(startInstruction(profile));

      expect(result).toMatchObject({
        ok: false,
        error: { code: "transaction-failed" },
      });
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("recovers the committed run after closing and reopening", async () => {
    const testDatabase = await openTestDatabase();
    const repository = createRunLifecycleRepository(testDatabase.database, catalog);
    const profile = await bootstrap(repository);
    const started = await repository.startRun(startInstruction(profile));
    expect(started.ok).toBe(true);
    testDatabase.database.close();

    const reopened = await openDatabase({
      name: testDatabase.name,
      indexedDB: testDatabase.factory,
    });
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) {
      await deleteDatabase(testDatabase.factory, testDatabase.name);
      throw new Error(reopened.error.message);
    }
    try {
      const loaded = await createRunLifecycleRepository(reopened.value, catalog).loadState();
      expect(loaded.ok).toBe(true);
      if (loaded.ok && started.ok) {
        expect(loaded.value).toEqual(started.value);
      }
    } finally {
      reopened.value.close();
      await deleteDatabase(testDatabase.factory, testDatabase.name);
    }
  });
});

describe("atomic explicit abandon", () => {
  it("deletes only the matching run and returns unchanged profile progression", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const started = await repository.startRun(startInstruction(profile));
      expect(started.ok).toBe(true);
      const profileBefore = await testDatabase.database.get("profile", "current");

      const abandoned = await repository.abandonRun(abandonInstruction());

      expect(abandoned.ok).toBe(true);
      if (abandoned.ok) {
        expect(abandoned.value).toEqual({ profile, livingRun: null });
        expect(abandoned.value.profile.shards).toBe(0);
        expect(abandoned.value.profile.lastRunSummary).toBeNull();
      }
      expect(await testDatabase.database.get("profile", "current")).toEqual(profileBefore);
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects stale identity and revision while preserving the run", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      await repository.startRun(startInstruction(profile));
      const runBefore = await testDatabase.database.get("livingRun", "current");

      const staleRun = await repository.abandonRun(
        abandonInstruction({ runId: "run-other" }),
      );
      const staleRevision = await repository.abandonRun(
        abandonInstruction({ expectedRevision: 4 }),
      );

      expect(staleRun).toMatchObject({ ok: false, error: { code: "stale-run" } });
      expect(staleRevision).toMatchObject({
        ok: false,
        error: { code: "stale-run-revision" },
      });
      expect(await testDatabase.database.get("livingRun", "current")).toEqual(runBefore);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects a duplicate abandon retry and creates no replacement", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      await repository.startRun(startInstruction(profile));

      expect((await repository.abandonRun(abandonInstruction())).ok).toBe(true);
      expect(await repository.abandonRun(abandonInstruction())).toMatchObject({
        ok: false,
        error: { code: "living-run-missing" },
      });
      expect(await testDatabase.database.get("livingRun", "current")).toBeUndefined();
      expect(await testDatabase.database.count("profile")).toBe(1);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });
});

function checkpointInstruction(
  state: RunState,
  command: Extract<RunCommand, { readonly type: "MaterializeRoute" | "SelectRouteOffer" | "CommitRoute" }>,
): SaveCheckpointPersistenceInstruction {
  const transition = runReducer(state, command, catalog);
  if (!transition.ok || transition.persistence.kind !== "save-checkpoint") {
    throw new Error("test route command must produce a save-checkpoint transition");
  }
  if (transition.state.livingRun === null) {
    throw new Error("test route transition must contain a living run");
  }
  return {
    ...transition.persistence,
    proposedRun: transition.state.livingRun,
  };
}

async function startAndCheckpoint(
  repository: RunLifecycleRepository,
  profile: Profile,
): Promise<RunState> {
  const started = await repository.startRun(startInstruction(profile));
  if (!started.ok) throw new Error("start must succeed");
  if (started.value.livingRun === null) throw new Error("start must produce a living run");
  return started.value;
}

describe("atomic save-checkpoint", () => {
  it("persists populated route offers and reloads them after reopen", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const started = await repository.startRun(startInstruction(profile));
      expect(started.ok).toBe(true);
      if (!started.ok) return;
      const livingRun = started.value.livingRun!;

      const instruction = checkpointInstruction(started.value, {
        type: "MaterializeRoute",
        runId: livingRun.runId,
        expectedRevision: livingRun.revision,
        commitId: "commit-materialize",
        now: profileMetadata.now + 2,
      });
      const result = await repository.saveCheckpoint(instruction);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.livingRun!.routeState!.offers).toHaveLength(4);
        expect(result.value.livingRun!.revision).toBe(1);
      }

      const stored = await testDatabase.database.get("livingRun", "current");
      expect(stored).toBeDefined();
      expect(stored!.routeState!.offers).toHaveLength(4);

      testDatabase.database.close();
      const reopened = await openDatabase({
        name: testDatabase.name,
        indexedDB: testDatabase.factory,
      });
      expect(reopened.ok).toBe(true);
      if (!reopened.ok) return;
      try {
        const loaded = await createRunLifecycleRepository(reopened.value, catalog).loadState();
        expect(loaded.ok).toBe(true);
        if (loaded.ok) {
          expect(loaded.value.livingRun!.routeState!.offers).toHaveLength(4);
          expect(loaded.value.livingRun!.routeState!.offers.map((o) => o.roomType))
            .toEqual(["battle", "elite", "shop", "recovery"]);
          expect(loaded.value.livingRun!.revision).toBe(1);
        }
      } finally {
        reopened.value.close();
      }
    } finally {
      await deleteDatabase(testDatabase.factory, testDatabase.name);
    }
  });

  it("rejects a stale revision and preserves the stored run unchanged", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const started = await startAndCheckpoint(repository, profile);
      const livingRun = started.livingRun!;

      const validInstruction = checkpointInstruction(started, {
        type: "MaterializeRoute",
        runId: livingRun.runId,
        expectedRevision: livingRun.revision,
        commitId: "commit-materialize",
        now: profileMetadata.now + 2,
      });
      const staleInstruction: SaveCheckpointPersistenceInstruction = {
        ...validInstruction,
        expectedRevision: 9,
      };
      const result = await repository.saveCheckpoint(staleInstruction);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "stale-run-revision" },
      });
      const stored = await testDatabase.database.get("livingRun", "current");
      expect(stored).toBeDefined();
      expect(stored!.revision).toBe(0);
      expect(stored!.routeState!.offers).toHaveLength(0);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("rejects a missing living run with living-run-missing", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);

      const fakeRun = createInitialLivingRun(
        profile.contentVersion,
        asContentId("class-glitch-knight"),
        4,
        null,
        { runId: "run-ghost", seed: "seed-ghost", now: 1, commitId: "commit-ghost" },
      );
      const instruction = checkpointInstruction(
        { profile, livingRun: fakeRun },
        {
          type: "MaterializeRoute",
          runId: "run-ghost",
          expectedRevision: 0,
          commitId: "commit-ghost-materialize",
          now: 2,
        },
      );
      const result = await repository.saveCheckpoint(instruction);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "living-run-missing" },
      });
    } finally {
      await closeAndDelete(testDatabase);
    }
  });

  it("persists populated roomState after commit and reloads the same room", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const started = await startAndCheckpoint(repository, profile);
      const livingRun = started.livingRun!;

      const materialized = checkpointInstruction(started, {
        type: "MaterializeRoute",
        runId: livingRun.runId,
        expectedRevision: livingRun.revision,
        commitId: "commit-materialize",
        now: profileMetadata.now + 2,
      });
      const matResult = await repository.saveCheckpoint(materialized);
      expect(matResult.ok).toBe(true);
      if (!matResult.ok) return;
      const materializedRun = matResult.value.livingRun!;

      const offerId = materializedRun.routeState!.offers[0]!.offerId;
      const selected = checkpointInstruction(matResult.value, {
        type: "SelectRouteOffer",
        runId: materializedRun.runId,
        expectedRevision: materializedRun.revision,
        offerId,
        commitId: "commit-select",
        now: profileMetadata.now + 3,
      });
      const selResult = await repository.saveCheckpoint(selected);
      expect(selResult.ok).toBe(true);
      if (!selResult.ok) return;
      const selectedRun = selResult.value.livingRun!;

      const committed = checkpointInstruction(selResult.value, {
        type: "CommitRoute",
        runId: selectedRun.runId,
        expectedRevision: selectedRun.revision,
        commitId: "commit-route",
        now: profileMetadata.now + 4,
      });
      const comResult = await repository.saveCheckpoint(committed);
      expect(comResult.ok).toBe(true);
      if (!comResult.ok) return;
      const committedRun = comResult.value.livingRun!;
      expect(committedRun.phase).toBe("room");
      expect(committedRun.routeState).toBeNull();
      expect(committedRun.roomState).not.toBeNull();
      expect(committedRun.roomState!.status).toBe("ready");
      expect(committedRun.revision).toBe(3);

      const stored = await testDatabase.database.get("livingRun", "current");
      expect(stored).toBeDefined();
      expect(stored!.phase).toBe("room");
      expect(stored!.roomState!.roomType).toBe(committedRun.roomState!.roomType);

      testDatabase.database.close();
      const reopened = await openDatabase({
        name: testDatabase.name,
        indexedDB: testDatabase.factory,
      });
      expect(reopened.ok).toBe(true);
      if (!reopened.ok) return;
      try {
        const loaded = await createRunLifecycleRepository(reopened.value, catalog).loadState();
        expect(loaded.ok).toBe(true);
        if (loaded.ok) {
          expect(loaded.value.livingRun!.phase).toBe("room");
          expect(loaded.value.livingRun!.roomState).toEqual(committedRun.roomState);
        }
      } finally {
        reopened.value.close();
      }
    } finally {
      await deleteDatabase(testDatabase.factory, testDatabase.name);
    }
  });

  it("rejects a malformed proposed run without overwriting the stored run", async () => {
    const testDatabase = await openTestDatabase();
    try {
      const repository = createRunLifecycleRepository(testDatabase.database, catalog);
      const profile = await bootstrap(repository);
      const started = await startAndCheckpoint(repository, profile);
      const livingRun = started.livingRun!;
      const storedBefore = await testDatabase.database.get("livingRun", "current");

      const instruction = checkpointInstruction(started, {
        type: "MaterializeRoute",
        runId: livingRun.runId,
        expectedRevision: livingRun.revision,
        commitId: "commit-materialize",
        now: profileMetadata.now + 2,
      });
      const malformed: SaveCheckpointPersistenceInstruction = {
        ...instruction,
        proposedRun: { ...instruction.proposedRun, cycle: 9 },
      };
      const result = await repository.saveCheckpoint(malformed);
      expect(result).toMatchObject({
        ok: false,
        error: { code: "invalid-living-run" },
      });
      expect(await testDatabase.database.get("livingRun", "current")).toEqual(storedBefore);
    } finally {
      await closeAndDelete(testDatabase);
    }
  });
});
