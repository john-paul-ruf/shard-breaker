# M07 — Persistence and Profile Transfer

## Boundary

- **Path:** `./src/persistence/`
- **Session-owned pathspec:** `./src/persistence/**/*`
- **Read-only dependency:** `./src/migrations/001_initial.ts`
- **Purpose:** Open the versioned IndexedDB database, validate envelopes, enforce
  revisions and transaction boundaries, and export/import permanent profiles.

## Public API

- `openDatabase()`
- `loadProfile()`
- `loadLivingRun()`
- `saveCheckpoint()`
- `finalizeRunAtomically()`
- `abandonRunAtomically()`
- `exportProfile()`
- `validateImport()`
- `importProfileAtomically()`
- `resetProfileAtomically()`
- `ProfileEnvelope`, `LivingRunEnvelope`, `SaveRevision`, `SaveSchemaVersion`
- `ImportResult`, `PersistenceError`

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/persistence/database.ts` | `idb` connection and DB-owned migration wiring |
| `./src/persistence/repositories.ts` | Singleton reads and atomic profile/living-run transactions |
| `./src/persistence/envelopes.ts` | Versioned serialized contracts and database typing |
| `./src/persistence/validation.ts` | Zod parsing, known-ID/range/cap checks, migration guards |
| `./src/persistence/transfer.ts` | Canonical permanent-profile projection, SHA-256 digest, import pipeline |

## Dependency and Implementation Rules

- Depends on M02, M05 persistence projections, and read-only M11.
- Use database `shardbreak`, version 1, stores `profile` and `livingRun`, and
  singleton key `"current"` exactly as defined by the database spec.
- Validate stored/imported data before exposing it and validate a transition
  again before writing. Treat every local record as untrusted input.
- Check `runId`, `expectedRevision`, and commit/outcome identity inside the same
  transaction as the write.
- Start run checks/creates both singleton state as one transaction. Finalization
  updates profile and deletes living run atomically. Reset replaces both only
  after explicit confirmation from M01/UI.
- Import writes permanent profile fields only and never reads, rewrites, or
  deletes `livingRun`. Export never includes living-run data.
- Canonical digest is corruption detection, not anti-cheat. Never claim local
  records are authoritative competitive scores.
- Do not modify `./src/migrations/001_initial.ts`; request DB if schema structure
  must change.

## Tests

- Use a deterministic IndexedDB test adapter/fake to cover bootstrap, atomic
  rollback, revisions, retries, finalization, abandon/reset, invalid records,
  canonical export/digest, malicious/oversized imports, and living-run isolation.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M07 and database contracts into the Forge registry. |
| 2026-08-29 | Added the run-lifecycle repository, v1 envelope validation, and migration-backed database opening. |

<!-- SESSION-04 -->
## Run-lifecycle foundation API

- `envelopes.ts` defines `ShardbreakDatabaseSchema`, `ShardbreakDatabase`,
  `ProfileEnvelope`, `LivingRunEnvelope`, `SaveRevision`,
  `PersistenceResult<T>`, `PersistenceError`, the start/abandon persistence
  instructions, and `RunLifecycleRepository`.
- `database.ts` exports `DatabaseOpenOptions` and `openDatabase(options?)`. The
  production default opens `shardbreak` version 1; tests may inject a unique
  name and `IDBFactory`. Migration 001 remains the sole schema creator.
- `validation.ts` exports strict, cloning parsers for profiles, living runs,
  and combined state: `parseProfileRecord()`, `parseLivingRunRecord()`, and
  `parseRunStateRecords()`.
- `repositories.ts` exports `createRunLifecycleRepository(database, catalog)`
  with `bootstrapProfile()`, `loadState()`, `startRun()`, and `abandonRun()`.
  Start checks both singleton stores and writes within one transaction;
  abandon verifies the current run identity/revision and deletes it within one
  transaction. Transfer, reset, checkpoint, and terminal-finalization APIs
  remain deferred.
