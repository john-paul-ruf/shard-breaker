import type { Page } from "@playwright/test";

const DATABASE_NAME = "shardbreak";
const OPERATION_TIMEOUT_MS = 4_000;

export interface StoredRunSummaryRecord {
  readonly runId: string;
  readonly classId: string;
  readonly reachedDepth: number;
  readonly bossesReached: number;
  readonly bossesDefeated: number;
  readonly activeSkillIds: readonly string[];
  readonly passiveEquipmentIds: readonly string[];
  readonly carryOverRelicId: string | null;
  readonly shardsEarned: number;
  readonly terminalReason: "death" | "completion" | "abandoned";
  readonly completedAt: number;
}

export interface StoredProfileRecord {
  readonly recordKey: "current";
  readonly profileId: string;
  readonly saveSchemaVersion: number;
  readonly contentVersion: string;
  readonly revision: number;
  readonly lastCommitId: string;
  readonly shards: number;
  readonly unlocks: {
    readonly classIds: readonly string[];
    readonly relicIds: readonly string[];
  };
  readonly relicState: {
    readonly equippedForNextRunId: string | null;
  };
  readonly records: {
    readonly highestReachedDepth: number;
    readonly highestBossDepth: number;
    readonly bossesDefeated: number;
  };
  readonly lastRunSummary: StoredRunSummaryRecord | null;
  /**
   * As stored (S01's F1 shape): an unresolved choice carries null
   * `selectedId`/`commitId`, a RESOLVE keeps the record with both set, and
   * a DECLINE clears it to null.
   */
  readonly pendingRelicChoice: {
    readonly sourceRunId: string;
    readonly options: readonly string[];
    readonly selectedId: string | null;
    readonly commitId: string | null;
  } | null;
  readonly lastFinalizedRunId: string | null;
}

export interface StoredLivingRunRecord {
  readonly recordKey: "current";
  readonly runId: string;
  readonly saveSchemaVersion: number;
  readonly contentVersion: string;
  readonly revision: number;
  readonly lastCommitId: string;
  readonly seed: string;
  readonly phase: string;
  readonly depth: number;
  readonly cycle: number;
  readonly classId: string;
  readonly integrityCurrent: number;
  readonly integrityMax: number;
  readonly routeState: {
    readonly eventKey: string;
    readonly offers: readonly unknown[];
    readonly selectedOfferId: string | null;
    readonly committed: boolean;
  } | null;
  readonly roomState: {
    readonly roomId: string;
    readonly roomType: string;
    readonly eventKey: string;
    readonly status: string;
    readonly objectiveIds: readonly unknown[];
    readonly threatProfile: {
      readonly budget: number;
      readonly durabilityFactor: number;
      readonly density: number;
      readonly formationId: string;
      readonly hazardIds: readonly unknown[];
      readonly bossModifierIds: readonly unknown[];
    } | null;
    readonly combatCheckpoint: unknown | null;
    readonly processedOutcomeIds: readonly string[];
    readonly shop: unknown | null;
    readonly recovery: unknown | null;
    readonly boss: unknown | null;
    readonly resolutionCommitId: string | null;
  } | null;
  readonly rewardState: {
    readonly eventKey: string;
    readonly sourceRoomId: string;
    readonly cards: readonly {
      readonly cardId: string;
      readonly baseRewardId: string;
      readonly rewardType: string;
      readonly materialCost: number;
    }[];
    readonly selectedCardId: string | null;
    readonly status: string;
  } | null;
  readonly runCurrency: number;
  readonly build: {
    readonly activeSkillIds: readonly string[];
    readonly passiveEquipmentIds: readonly string[];
    readonly carryOverRelicId: string | null;
  } | null;
}

export interface StoredLifecycleState {
  readonly profileKeys: readonly string[];
  readonly livingRunKeys: readonly string[];
  readonly profile: StoredProfileRecord | undefined;
  readonly livingRun: StoredLivingRunRecord | undefined;
}

/** Close the helper connection and delete the local singleton database. */
export async function deleteShardbreakDatabase(page: Page): Promise<void> {
  await page.evaluate<void, { databaseName: string; timeoutMs: number }>(
    async ({ databaseName, timeoutMs }) => {
      const boundedErrorName = (error: DOMException | null): string =>
        (error?.name ?? "UnknownError").slice(0, 80);

      const connection = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        const timeoutId = globalThis.setTimeout(() => {
          reject(new Error("IndexedDB open timed out while preparing deletion"));
        }, timeoutMs);

        request.addEventListener("success", () => {
          globalThis.clearTimeout(timeoutId);
          resolve(request.result);
        });
        request.addEventListener("error", () => {
          globalThis.clearTimeout(timeoutId);
          reject(
            new Error(
              `IndexedDB open failed while preparing deletion: ${boundedErrorName(request.error)}`,
            ),
          );
        });
        request.addEventListener("blocked", () => {
          globalThis.clearTimeout(timeoutId);
          reject(new Error("IndexedDB open was blocked while preparing deletion"));
        });
      });

      let sawVersionChange = false;
      connection.addEventListener("versionchange", () => {
        sawVersionChange = true;
        connection.close();
      });

      await new Promise<void>((resolve, reject) => {
        let sawBlocked = false;
        const request = indexedDB.deleteDatabase(databaseName);
        const timeoutId = globalThis.setTimeout(() => {
          connection.close();
          reject(
            new Error(
              `IndexedDB deletion timed out (blocked=${String(sawBlocked)}, versionchange=${String(sawVersionChange)})`,
            ),
          );
        }, timeoutMs);

        request.addEventListener("blocked", () => {
          sawBlocked = true;
        });
        request.addEventListener("error", () => {
          globalThis.clearTimeout(timeoutId);
          connection.close();
          reject(
            new Error(
              `IndexedDB deletion failed: ${boundedErrorName(request.error)}`,
            ),
          );
        });
        request.addEventListener("success", () => {
          globalThis.clearTimeout(timeoutId);
          connection.close();
          resolve();
        });
      });
    },
    { databaseName: DATABASE_NAME, timeoutMs: OPERATION_TIMEOUT_MS },
  );
}

/** Read both singleton stores without writing or synthesizing lifecycle state. */
export async function readShardbreakState(
  page: Page,
): Promise<StoredLifecycleState> {
  return page.evaluate<
    StoredLifecycleState,
    { databaseName: string; timeoutMs: number }
  >(
    async ({ databaseName, timeoutMs }) => {
      const boundedErrorName = (error: DOMException | null): string =>
        (error?.name ?? "UnknownError").slice(0, 80);
      let versionChanged = false;

      const connection = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        const timeoutId = globalThis.setTimeout(() => {
          reject(new Error("IndexedDB open timed out while reading lifecycle state"));
        }, timeoutMs);

        request.addEventListener("success", () => {
          globalThis.clearTimeout(timeoutId);
          resolve(request.result);
        });
        request.addEventListener("error", () => {
          globalThis.clearTimeout(timeoutId);
          reject(
            new Error(
              `IndexedDB open failed while reading lifecycle state: ${boundedErrorName(request.error)}`,
            ),
          );
        });
        request.addEventListener("blocked", () => {
          globalThis.clearTimeout(timeoutId);
          reject(new Error("IndexedDB open was blocked while reading lifecycle state"));
        });
      });

      connection.addEventListener("versionchange", () => {
        versionChanged = true;
        connection.close();
      });

      try {
        const transaction = connection.transaction(
          ["profile", "livingRun"],
          "readonly",
        );
        const profileRequest = transaction.objectStore("profile").get("current");
        const livingRunRequest = transaction
          .objectStore("livingRun")
          .get("current");
        const profileKeysRequest = transaction.objectStore("profile").getAllKeys();
        const livingRunKeysRequest = transaction
          .objectStore("livingRun")
          .getAllKeys();

        const transactionResult = await new Promise<StoredLifecycleState>(
          (resolve, reject) => {
            const timeoutId = globalThis.setTimeout(() => {
              transaction.abort();
              reject(
                new Error(
                  `IndexedDB read timed out (versionchange=${String(versionChanged)})`,
                ),
              );
            }, timeoutMs);

            transaction.addEventListener("complete", () => {
              globalThis.clearTimeout(timeoutId);
              resolve({
                profileKeys: profileKeysRequest.result.map(String),
                livingRunKeys: livingRunKeysRequest.result.map(String),
                profile: profileRequest.result as StoredProfileRecord | undefined,
                livingRun: livingRunRequest.result as
                  | StoredLivingRunRecord
                  | undefined,
              });
            });
            transaction.addEventListener("abort", () => {
              globalThis.clearTimeout(timeoutId);
              reject(
                new Error(
                  `IndexedDB read aborted: ${boundedErrorName(transaction.error)}`,
                ),
              );
            });
            transaction.addEventListener("error", () => {
              globalThis.clearTimeout(timeoutId);
              reject(
                new Error(
                  `IndexedDB read failed: ${boundedErrorName(transaction.error)}`,
                ),
              );
            });
          },
        );

        if (versionChanged) {
          throw new Error("IndexedDB version changed while reading lifecycle state");
        }
        return transactionResult;
      } finally {
        connection.close();
      }
    },
    { databaseName: DATABASE_NAME, timeoutMs: OPERATION_TIMEOUT_MS },
  );
}
