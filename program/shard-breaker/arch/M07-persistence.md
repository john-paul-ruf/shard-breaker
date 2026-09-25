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
| 2026-09-24 | combat-engine SESSION-07 + OWNER-FINALIZE-REPO: added the finalizeDeath one-transaction terminal boundary (sanctioned scoped seam), then tightened it to a required repository capability (`97553fd`) — see the fragment below. |
| 2026-08-29 | Imported Genesis M07 and database contracts into the Forge registry. |
| 2026-08-29 | Added the run-lifecycle repository, v1 envelope validation, and migration-backed database opening. |
| 2026-09-14 | route-drafting SESSION-01: Added saveCheckpoint repository method and SaveCheckpointPersistenceInstruction for atomic checkpoint persistence. |
| 2026-09-22 | room-resolution SESSION-02: Extended rewardStateSchema with nullable displacedRewardId/displacedSlot fields; empty-route rules untouched. |

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
  transaction. Transfer, reset, and terminal-finalization APIs remain deferred.

<!-- route-drafting SESSION-01 -->
## Checkpoint persistence (route-drafting SESSION-01)

- `envelopes.ts` — `SaveCheckpointPersistenceInstruction` added
  (`Extract<RunPersistenceInstruction, { kind: "save-checkpoint" }> & { readonly proposedRun: LivingRun }`).
  `RunLifecycleRepository` extended with `saveCheckpoint(instruction)`.
- `repositories.ts` — `saveCheckpoint` implemented: one `readwrite` transaction on
  `[PROFILE_STORE_NAME, LIVING_RUN_STORE_NAME]`, reads stored living run,
  validates `runId`/`revision` match, parses proposed run via
  `parseLivingRunRecord`, runs `parseRunStateRecords` for combined validation,
  `put`s the proposed run, returns `{ profile, livingRun: proposedRun }`.
- `repositories.test.ts` — 5 checkpoint tests: success with populated routeState,
  stale revision, missing living run, populated roomState, malformed proposed run.

<!-- room-resolution SESSION-02 -->
## Reward replacement schema (room-resolution SESSION-02)

- `src/persistence/validation.ts` — `rewardStateSchema` gains
  `displacedRewardId` (nullable content ID) and `displacedSlot` (nullable
  `"active" | "passive"` enum) — Correction 2's durable replacement record.
  No other rule touched; the `invalid-empty-route-depth` invariant and its
  "empty route after depth one" test row pass unchanged (Correction 1).


<!-- combat-engine SESSION-07 -->
## Death terminal transaction (combat-engine SESSION-07)

- `envelopes.ts` (M04, sanctioned scoped seam) — new exported type
  `FinalizeDeathPersistenceInstruction`; `RunLifecycleRepository` gains
  `finalizeDeath(instruction)`. Landed by SESSION-07 as an **optional
  capability** because the committed exhaustive typed fixture in
  `src/app/App.test.tsx` (outside the session's lease) implemented the
  interface literally; OWNER-FINALIZE-REPO then added the fixture member and
  tightened the envelope to a **required capability** at `97553fd`. The
  fail-closed discipline is unchanged: the store still treats an absent
  implementation as a typed refusal — the pre-finalization archive stays
  published, never a fabricated success.
- `repositories.ts` (M04, sanctioned scoped seam) — `finalizeDeath` implemented
  per `specs/database.md`'s "Finalize death/completion" boundary: one
  read/write transaction over both singleton stores — validate the stored
  profile, validate the proposed terminal profile, verify the living run's
  identity/revision, verify the summary describes the dying run (field-level
  mismatch fails closed), write the profile, delete the living run. Retry after
  a committed finalization finds no living run and is rejected without changes
  when the instruction matches `lastFinalizedRunId`/summary
  (`living-run-missing`), or with `invalid-living-run` when it does not (no
  double-award path). Trust-level note: the depleted-integrity precondition is
  the reducer's authority (the terminal transition never persists a
  zero-integrity checkpoint, so the stored record legitimately stands one loss
  above zero when the instruction arrives); identity, revision, and summary
  coherence are this layer's checks — the same trust level as abandon-run.
