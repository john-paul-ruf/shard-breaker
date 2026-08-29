import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import type { ContentId } from "../domain/content/catalog";
import { createContentCatalog } from "../domain/content/catalog";
import type { LivingRun, Profile } from "../domain/run/model";
import { createInitialLivingRun } from "../domain/run/model";
import { openDatabase } from "./database";
import type { ShardbreakDatabase } from "./envelopes";
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
