import type { ContentCatalog } from "../domain/content/catalog";
import type { Profile, ProfileCreationMetadata, RunState } from "../domain/run/model";
import { createDefaultProfile, CURRENT_RECORD_KEY } from "../domain/run/model";
import {
  LIVING_RUN_STORE_NAME,
  PROFILE_STORE_NAME,
} from "../migrations/001_initial";
import type {
  PersistenceResult,
  ShardbreakDatabase,
} from "./envelopes";
import { parseProfileRecord, parseRunStateRecords } from "./validation";

function transactionDiagnostic(
  operation: string,
  stores: readonly string[],
  cause: unknown,
): Readonly<Record<string, string | readonly string[]>> {
  const errorName =
    cause instanceof DOMException || cause instanceof Error ? cause.name : "UnknownError";
  return {
    operation: operation.slice(0, 80),
    stores: stores.map((store) => store.slice(0, 80)),
    errorName: errorName.slice(0, 80),
  };
}

function transactionFailure<T>(
  operation: string,
  stores: readonly string[],
  cause: unknown,
): PersistenceResult<T> {
  return {
    ok: false,
    error: {
      code: "transaction-failed",
      message: "The local save transaction failed.",
      cause: transactionDiagnostic(operation, stores, cause),
    },
  };
}

async function bootstrapProfile(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
  metadata: ProfileCreationMetadata,
): Promise<PersistenceResult<Profile>> {
  const stores = [PROFILE_STORE_NAME] as const;
  try {
    const transaction = database.transaction(PROFILE_STORE_NAME, "readwrite");
    const existing = await transaction.store.get(CURRENT_RECORD_KEY);
    if (existing !== undefined) {
      const result = parseProfileRecord(existing, catalog);
      await transaction.done;
      return result;
    }

    const candidate = createDefaultProfile(catalog, metadata);
    const result = parseProfileRecord(candidate, catalog);
    if (!result.ok) {
      await transaction.done;
      return result;
    }
    await transaction.store.add(result.value);
    await transaction.done;
    return result;
  } catch (cause) {
    return transactionFailure("bootstrap-profile", stores, cause);
  }
}

async function loadState(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
): Promise<PersistenceResult<RunState>> {
  const stores = [PROFILE_STORE_NAME, LIVING_RUN_STORE_NAME] as const;
  try {
    const transaction = database.transaction(stores, "readonly");
    const [profile, livingRun] = await Promise.all([
      transaction.objectStore(PROFILE_STORE_NAME).get(CURRENT_RECORD_KEY),
      transaction.objectStore(LIVING_RUN_STORE_NAME).get(CURRENT_RECORD_KEY),
    ]);
    await transaction.done;
    if (profile === undefined) {
      return {
        ok: false,
        error: {
          code: "profile-missing",
          message: "No local profile was found.",
        },
      };
    }
    return parseRunStateRecords(profile, livingRun, catalog);
  } catch (cause) {
    return transactionFailure("load-state", stores, cause);
  }
}

/** Construct the checkpoint-two profile bootstrap and combined-load boundary. */
export function createRunLifecycleRepository(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
) {
  return Object.freeze({
    bootstrapProfile: (metadata: ProfileCreationMetadata) =>
      bootstrapProfile(database, catalog, metadata),
    loadState: () => loadState(database, catalog),
  });
}
