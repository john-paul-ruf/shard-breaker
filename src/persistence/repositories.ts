import type { ContentCatalog } from "../domain/content/catalog";
import type { Profile, ProfileCreationMetadata, RunState } from "../domain/run/model";
import { createDefaultProfile, CURRENT_RECORD_KEY } from "../domain/run/model";
import {
  LIVING_RUN_STORE_NAME,
  PROFILE_STORE_NAME,
} from "../migrations/001_initial";
import type {
  AbandonRunPersistenceInstruction,
  PersistenceResult,
  RunLifecycleRepository,
  ShardbreakDatabase,
  StartRunPersistenceInstruction,
} from "./envelopes";
import {
  parseLivingRunRecord,
  parseProfileRecord,
  parseRunStateRecords,
} from "./validation";

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

function expectedFailure<T>(
  code:
    | "invalid-living-run"
    | "living-run-exists"
    | "living-run-missing"
    | "profile-missing"
    | "stale-profile-revision"
    | "stale-run"
    | "stale-run-revision",
  message: string,
  cause: Readonly<Record<string, string | number>>,
): PersistenceResult<T> {
  const boundedCause = Object.fromEntries(
    Object.entries(cause).map(([key, value]) => [
      key.slice(0, 80),
      typeof value === "string" ? value.slice(0, 160) : value,
    ]),
  );
  return { ok: false, error: { code, message, cause: boundedCause } };
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

function startProposalIssue(
  instruction: StartRunPersistenceInstruction,
  profile: Profile,
): string | null {
  const run = instruction.proposedRun;
  if (run.runId !== instruction.runId) return "runId";
  if (run.lastCommitId !== instruction.commitId) return "lastCommitId";
  if (run.revision !== 0) return "revision";
  if (run.createdAt !== run.updatedAt) return "updatedAt";
  if (run.depth !== 1 || run.cycle !== 1 || run.phase !== "route") return "phase";
  if (run.integrityCurrent !== run.integrityMax) return "integrityCurrent";
  if (run.runCurrency !== 0) return "runCurrency";
  if (
    run.build.activeSkillIds.length !== 0 ||
    run.build.passiveEquipmentIds.length !== 0 ||
    run.build.carryOverRelicId !== profile.relicState.equippedForNextRunId
  ) {
    return "build";
  }
  if (
    run.progress.roomsResolved !== 0 ||
    run.progress.bossesReached !== 0 ||
    run.progress.bossesDefeated !== 0
  ) {
    return "progress";
  }
  if (
    run.routeState === null ||
    run.routeState.offers.length !== 0 ||
    run.routeState.selectedOfferId !== null ||
    run.routeState.committed ||
    run.roomState !== null ||
    run.rewardState !== null
  ) {
    return "routeState";
  }
  return null;
}

async function startRun(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
  instruction: StartRunPersistenceInstruction,
): Promise<PersistenceResult<RunState>> {
  const stores = [PROFILE_STORE_NAME, LIVING_RUN_STORE_NAME] as const;
  try {
    const transaction = database.transaction(stores, "readwrite");
    const [storedProfile, storedLivingRun] = await Promise.all([
      transaction.objectStore(PROFILE_STORE_NAME).get(CURRENT_RECORD_KEY),
      transaction.objectStore(LIVING_RUN_STORE_NAME).get(CURRENT_RECORD_KEY),
    ]);

    if (storedProfile === undefined) {
      await transaction.done;
      return expectedFailure(
        "profile-missing",
        "No local profile was found.",
        { operation: "start-run" },
      );
    }
    const profileResult = parseProfileRecord(storedProfile, catalog);
    if (!profileResult.ok) {
      await transaction.done;
      return profileResult;
    }
    if (profileResult.value.revision !== instruction.expectedProfileRevision) {
      await transaction.done;
      return expectedFailure(
        "stale-profile-revision",
        "The profile changed before the run could start.",
        {
          expected: instruction.expectedProfileRevision,
          actual: profileResult.value.revision,
        },
      );
    }

    if (storedLivingRun !== undefined) {
      const existingState = parseRunStateRecords(
        profileResult.value,
        storedLivingRun,
        catalog,
      );
      await transaction.done;
      return existingState.ok
        ? expectedFailure(
            "living-run-exists",
            "A living run already exists.",
            { runId: existingState.value.livingRun?.runId ?? "unknown" },
          )
        : existingState;
    }

    const proposedRunResult = parseLivingRunRecord(instruction.proposedRun, catalog);
    if (!proposedRunResult.ok) {
      await transaction.done;
      return proposedRunResult;
    }
    if (!profileResult.value.unlocks.classIds.includes(proposedRunResult.value.classId)) {
      await transaction.done;
      return expectedFailure(
        "invalid-living-run",
        "The proposed run is invalid.",
        { field: "classId" },
      );
    }
    const proposalIssue = startProposalIssue(instruction, profileResult.value);
    if (proposalIssue !== null) {
      await transaction.done;
      return expectedFailure(
        "invalid-living-run",
        "The proposed run is invalid.",
        { field: proposalIssue },
      );
    }

    const stateResult = parseRunStateRecords(
      profileResult.value,
      proposedRunResult.value,
      catalog,
    );
    if (!stateResult.ok || stateResult.value.livingRun === null) {
      await transaction.done;
      return stateResult.ok
        ? expectedFailure(
            "invalid-living-run",
            "The proposed run is invalid.",
            { field: "livingRun" },
          )
        : stateResult;
    }

    await transaction
      .objectStore(LIVING_RUN_STORE_NAME)
      .put(stateResult.value.livingRun);
    await transaction.done;
    return stateResult;
  } catch (cause) {
    return transactionFailure("start-run", stores, cause);
  }
}

async function abandonRun(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
  instruction: AbandonRunPersistenceInstruction,
): Promise<PersistenceResult<RunState>> {
  const loaded = await loadState(database, catalog);
  if (!loaded.ok) {
    return loaded;
  }
  if (loaded.value.livingRun === null) {
    return expectedFailure(
      "living-run-missing",
      "No living run was found.",
      { operation: "abandon-run" },
    );
  }

  const stores = [LIVING_RUN_STORE_NAME] as const;
  try {
    const transaction = database.transaction(LIVING_RUN_STORE_NAME, "readwrite");
    const storedLivingRun = await transaction.store.get(CURRENT_RECORD_KEY);
    if (storedLivingRun === undefined) {
      await transaction.done;
      return expectedFailure(
        "living-run-missing",
        "No living run was found.",
        { operation: "abandon-run" },
      );
    }
    const livingRunResult = parseLivingRunRecord(storedLivingRun, catalog);
    if (!livingRunResult.ok) {
      await transaction.done;
      return livingRunResult;
    }
    if (livingRunResult.value.runId !== instruction.runId) {
      await transaction.done;
      return expectedFailure(
        "stale-run",
        "The living run changed before it could be abandoned.",
        { expected: instruction.runId, actual: livingRunResult.value.runId },
      );
    }
    if (livingRunResult.value.revision !== instruction.expectedRevision) {
      await transaction.done;
      return expectedFailure(
        "stale-run-revision",
        "The living run changed before it could be abandoned.",
        {
          expected: instruction.expectedRevision,
          actual: livingRunResult.value.revision,
        },
      );
    }

    await transaction.store.delete(CURRENT_RECORD_KEY);
    await transaction.done;
    return { ok: true, value: { profile: loaded.value.profile, livingRun: null } };
  } catch (cause) {
    return transactionFailure("abandon-run", stores, cause);
  }
}

/** Construct the atomic profile and living-run lifecycle boundary. */
export function createRunLifecycleRepository(
  database: ShardbreakDatabase,
  catalog: ContentCatalog,
): RunLifecycleRepository {
  return Object.freeze({
    bootstrapProfile: (metadata: ProfileCreationMetadata) =>
      bootstrapProfile(database, catalog, metadata),
    loadState: () => loadState(database, catalog),
    startRun: (instruction: StartRunPersistenceInstruction) =>
      startRun(database, catalog, instruction),
    abandonRun: (instruction: AbandonRunPersistenceInstruction) =>
      abandonRun(database, catalog, instruction),
  });
}
