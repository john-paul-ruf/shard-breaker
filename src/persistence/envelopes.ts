import type { DBSchema, IDBPDatabase } from "idb";

import type { RunPersistenceInstruction } from "../domain/run/commands";
import type {
  LivingRun,
  Profile,
  ProfileCreationMetadata,
  RunState,
  SaveSchemaVersion,
} from "../domain/run/model";
import { CURRENT_RECORD_KEY } from "../domain/run/model";

/** Stored profile envelope. The domain projection is the serialized contract. */
export type ProfileEnvelope = Profile;

/** Stored living-run envelope. The domain projection is the serialized contract. */
export type LivingRunEnvelope = LivingRun;

/** Monotonic record revision checked inside each durable transaction. */
export type SaveRevision = number;

export type { ProfileCreationMetadata, SaveSchemaVersion };

/** The two singleton stores created by migration 001. */
export interface ShardbreakDatabaseSchema extends DBSchema {
  profile: {
    key: typeof CURRENT_RECORD_KEY;
    value: ProfileEnvelope;
  };
  livingRun: {
    key: typeof CURRENT_RECORD_KEY;
    value: LivingRunEnvelope;
  };
}

export type ShardbreakDatabase = IDBPDatabase<ShardbreakDatabaseSchema>;

export type PersistenceErrorCode =
  | "database-unavailable"
  | "invalid-profile"
  | "invalid-living-run"
  | "profile-missing"
  | "living-run-exists"
  | "living-run-missing"
  | "stale-profile-revision"
  | "stale-run"
  | "stale-run-revision"
  | "transaction-failed";

/** Stable adapter failure; `cause` is diagnostic data and never a saved payload. */
export interface PersistenceError {
  readonly code: PersistenceErrorCode;
  readonly message: string;
  readonly cause?: unknown;
}

export type PersistenceResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: PersistenceError };

type DomainStartRunInstruction = Extract<
  RunPersistenceInstruction,
  { readonly kind: "start-run" }
>;

/**
 * M05 emits the durable identity separately from its next state. The adapter
 * requires both so it can validate the exact proposed record before writing.
 */
export type StartRunPersistenceInstruction = DomainStartRunInstruction & {
  readonly proposedRun: LivingRun;
};

export type AbandonRunPersistenceInstruction = Extract<
  RunPersistenceInstruction,
  { readonly kind: "abandon-run" }
>;

type DomainSaveCheckpointInstruction = Extract<
  RunPersistenceInstruction,
  { readonly kind: "save-checkpoint" }
>;

/**
 * A checkpoint instruction carries the exact proposed living run so the
 * adapter validates the complete record before writing it atomically.
 */
export type SaveCheckpointPersistenceInstruction = DomainSaveCheckpointInstruction & {
  readonly proposedRun: LivingRun;
};

export type FinalizeDeathPersistenceInstruction = Extract<
  RunPersistenceInstruction,
  { readonly kind: "finalize-death" }
>;

/** Narrow durable surface consumed by the application orchestration boundary. */
export interface RunLifecycleRepository {
  bootstrapProfile(
    metadata: ProfileCreationMetadata,
  ): Promise<PersistenceResult<Profile>>;
  loadState(): Promise<PersistenceResult<RunState>>;
  startRun(
    instruction: StartRunPersistenceInstruction,
  ): Promise<PersistenceResult<RunState>>;
  abandonRun(
    instruction: AbandonRunPersistenceInstruction,
  ): Promise<PersistenceResult<RunState>>;
  saveCheckpoint(
    instruction: SaveCheckpointPersistenceInstruction,
  ): Promise<PersistenceResult<RunState>>;
  /**
   * CA-14's one-transaction terminal boundary. Optional capability: older
   * repository fixtures without the member report the typed
   * `transaction-failed`-class refusal through the result channel — the
   * store treats an absent implementation as fail-closed, never as success.
   */
  finalizeDeath?(
    instruction: FinalizeDeathPersistenceInstruction,
  ): Promise<PersistenceResult<RunState>>;
}
