# SESSION-01 — Route transitions and atomic room persistence

> **Program:** Shard Breaker
> **Feature:** route-drafting
> **Slug:** session-01
> **Summary:** Wire deterministic route/room transitions into the pure reducer, add atomic checkpoint persistence, and wire app-store handlers so route offers, selection, and room commit are durable across reload.
> **Wave:** 1
> **Modules:** M03, M04, M06 (M02 read)
> **Depends on:** —
> **Concurrent with:** —
> **Owns:** `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/route.test.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`
> **Reads:** `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/run/validation.ts`, `src/domain/run/lifecycle.test.ts`, `src/domain/random/generators.ts`, `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/persistence/database.ts`, `src/persistence/validation.ts`, `src/persistence/validation.test.ts`, `src/migrations/001_initial.ts`, `src/app/navigation.ts`
> **Resources:** —
> **Checkpoints:** 3

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M02 | Seeded generation | `src/domain/random/generators.ts` | `generateRouteOptions`/`generateRoomCandidate` are the pure producers consumed unchanged. |
| M01 | Authored content | `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts` | `ContentCatalog` passed to reducer; room display fields resolved at render. |
| M03 | Run domain | `src/domain/run/model.ts`, `routes.ts`, `validation.ts`, `lifecycle.test.ts` | `RouteState`/`RoomState`/`LivingRun` shapes, route event keys, validation rules, existing test patterns. |
| M04 | Persistence | `src/persistence/envelopes.ts`, `repositories.ts`, `validation.ts`, `database.ts` | `RunLifecycleRepository` interface to extend; `saveCheckpoint` to add; singleton-key transaction pattern to reuse. |
| M06 | App orchestration | `src/app/appStore.ts`, `commands.ts` | `AppCommand` union to extend; store handlers to add. |

## Context

The lifecycle foundation is complete: profile bootstrap, class selection, guarded run replacement, resume, validation, IndexedDB persistence, and 185 passing tests. `npm run verify` passes (lint + typecheck + 185 unit tests + production build).

The deterministic generators `generateRouteOptions` and `generateRoomCandidate` (M02) are fully implemented and tested (14 generator tests) but **never wired into the run lifecycle**. The reducer only handles `StartRun` and `AbandonRun`. A new living run opens at `phase: "route"` with an empty `routeState.offers: []` — there is no command to materialize offers, select one, or commit it into a room.

This session adds three new run commands — `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute` — to the pure reducer, a `save-checkpoint` persistence instruction, a `saveCheckpoint` repository method, and the app-store handlers that dispatch them. The generators are consumed unchanged. No schema or migration change is needed; the zod schemas in `persistence/validation.ts` already accept populated route/room state.

## Capabilities

### CAP-01 — Materialize deterministic route offers
**Approved behavior:** After starting/resuming a living run, dispatching `MaterializeRoute` populates `routeState.offers` with the deterministic route options for the current depth and persists them. A reload returns the same offers. Re-dispatching is rejected; offers never reroll.

**Entry point:** `route/materialize` app command → `MaterializeRoute` run command → `runReducer(state, command, catalog)` → `saveCheckpoint` repository method → published `AppState`.

**Observable success:** `livingRun.routeState.offers` has exactly four offers (non-boss depth) or one boss offer (`depth % 3 === 0`); `routeState.committed === false`; `routeState.selectedOfferId === null`; `livingRun.revision` incremented; IndexedDB `livingRun[current]` contains the populated offers after reload.

**Rejection paths:** `route-already-materialized` (offers already present), `no-living-run`, `stale-run-revision`, `invalid-state`.

**Required facts + producers:**
- `LivingRun` (seed, contentVersion, depth, cycle, integrityCurrent, integrityMax, runCurrency, routeEventKey) — produced by `StartRun` (committed, verified by `lifecycle.test.ts`).
- `generateRouteOptions(catalog, context)` — M02, committed, pure, tested (`generators.test.ts`).
- `catalog: ContentCatalog` — M01, committed.
- `commitId: string`, `now: number` — injected by `AppStore` via `createId()`/`clock()`.

**Integration owner/checkpoint:** S01-CP1 (domain), S01-CP2 (persistence), S01-CP3 (store). S02-CP3 (browser reload proof).

### CAP-02 — Select a route offer
**Approved behavior:** `SelectRouteOffer` persists `routeState.selectedOfferId` as a durable fact. Selection does not enter the room.

**Entry point:** `route/select-offer` app command → `SelectRouteOffer` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `routeState.selectedOfferId` is one of the materialized offer IDs; revision incremented; reload preserves selection.

**Rejection paths:** `route-not-materialized` (empty offers), `route-already-committed`, `unknown-route-offer` (offerId not in offers), `no-living-run`, `stale-run-revision`.

**Required facts:** Materialized `routeState.offers` — produced by CAP-01.

**Integration owner/checkpoint:** S01-CP3 (store). S02-CP3 (browser).

### CAP-03 — Commit the selected route into a room
**Approved behavior:** `CommitRoute` transitions `phase: "route" → "room"`, nulls `routeState`, populates `roomState` from `generateRoomCandidate`, and persists. Reload returns the same room.

**Entry point:** `route/commit` app command → `CommitRoute` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `phase === "room"`, `routeState === null`, `roomState !== null` with `status: "ready"`, populated `threatProfile`, and room-type-appropriate `shop`/`recovery`/`boss`; revision incremented; reload returns the same room.

**Rejection paths:** `route-selection-missing`, `route-already-committed`, `no-living-run`, `stale-run-revision`.

**Required facts:** `routeState.selectedOfferId` — produced by CAP-02. `generateRoomCandidate(catalog, context)` — M02, committed, tested. `RoomGenerationContext` (extends `RouteGenerationContext` with `selectedOfferId`) — built from living run.

**Integration owner/checkpoint:** S01-CP1 (domain mapping), S01-CP2 (persistence), S01-CP3 (store). S02-CP3 (browser IndexedDB proof).

## Contract Agreements

### CA-01 — Materialized route offers (agreed, producer planned)
**Required meaning:** A materialized route persists exactly the deterministic offers for `(runSeed, contentVersion, depth, routeEventKey)`. Offers never reroll on reload. Selection absent, not committed.

**Producer → boundary → consumer:** S01 `runReducer` (`MaterializeRoute`) → `RouteState.offers: RouteOfferSnapshot[]` → S01 `saveCheckpoint` repository → S02 `RouteMapScreen`.

**Mapping:** `GeneratedRouteOffer` → `RouteOfferSnapshot`:
| GeneratedRouteOffer field | RouteOfferSnapshot field | Keep? |
|---------------------------|-------------------------|-------|
| `offerId` | `offerId` | yes |
| `roomType` | `roomType` | yes |
| `roomEventKey` | `roomEventKey` | yes |
| `riskTier` | `riskTier` | yes |
| `rewardPreviewId` | `rewardPreviewId` | yes |
| `visibleCost` | `visibleCost` | yes |
| `availability` | `availability` | yes |
| `roomDefinitionId` | — | drop (display resolved by `roomType` at render) |
| `displayName` | — | drop |
| `summary` | — | drop |
| `riskLabel` | — | drop |
| `rewardLabel` | — | drop |
| `counterplay` | — | drop |

**Constraints:** `roomType ∈ {"battle","elite","shop","recovery","boss"}`. Boss depth (`depth % 3 === 0`) → exactly one boss offer. Non-boss → four offers. Idempotent. Revision bumps on save. `routeState.eventKey` must equal `routeEventKey(runId, contentVersion, depth)` (already set by `createInitialRouteState`; non-boss depths beyond 1 require the reducer to set the correct event key).

**Checkpoint-0 recheck:** Read `src/domain/random/generators.ts` (`generateRouteOptions`), `src/domain/run/model.ts` (`RouteOfferSnapshot`, `RouteState`), `src/domain/run/validation.ts` (`collectRouteIssues`), `src/persistence/validation.ts` (`routeStateSchema`). Confirm the mapping preserves all durable fields and drops only display fields.

**Boundary assertions (S01-CP1):** Unit test: `MaterializeRoute` on a depth-1 run produces four offers with correct `roomType`/`offerId`/`roomEventKey`. Unit test: boss depth produces one boss offer. Unit test: re-materialize rejected. Unit test: resulting `LivingRun` passes `validateLivingRun`.

### CA-02 — Selected route offer (agreed, producer planned)
**Required meaning:** `selectedOfferId` is a durable fact; it must be one of the materialized offers. Selection does not enter the room.

**Mapping:** `selectedOfferId: string | null` → persists the chosen `offerId`. Constraints: must be in `offers.map(o => o.offerId)`; reject if offers empty; reject if `committed === true`.

**Checkpoint-0 recheck:** Read `src/domain/run/validation.ts` (`collectRouteIssues`: `unknown-route-selection`, `route-committed-without-selection`).

### CA-03 — Committed route → room (agreed, producer planned)
**Required meaning:** `phase: "route" → "room"`, `routeState: null`, `roomState` populated deterministically from `(runSeed, contentVersion, depth, selectedOfferId)`.

**Mapping:** `GeneratedRoomCandidate` → `RoomState`:
| GeneratedRoomCandidate field | RoomState field | Keep? |
|------------------------------|-----------------|-------|
| `roomId` | `roomId` | yes |
| `roomType` | `roomType` | yes |
| `eventKey` | `eventKey` | yes |
| `status` | `status` | yes |
| `objectiveIds` | `objectiveIds` | yes |
| `combatCheckpoint` | `combatCheckpoint` | yes (null at this stage) |
| `processedOutcomeIds` | `processedOutcomeIds` | yes |
| `shop` | `shop` | yes (null unless shop room) |
| `recovery` | `recovery` | yes (null unless recovery room) |
| `boss` | `boss` | yes (null unless boss room) |
| `resolutionCommitId` | `resolutionCommitId` | yes (null at this stage) |
| `threatProfile` | `threatProfile` | yes, but drop `diagnostics` |
| `authoredRoomId` | — | drop |
| `displayName` | — | drop |
| `summary` | — | drop |
| `counterplay` | — | drop |

**`threatProfile` sub-mapping:** `GeneratedThreatProfile` → `ThreatProfileSnapshot`: keep `budget`, `durabilityFactor`, `density`, `formationId`, `hazardIds`, `bossModifierIds`; drop `diagnostics`.

**Constraints:** Phase-state coherence: `phase === "room"` ⇒ `routeState === null`, `roomState !== null`. Reject if no selection. Reject if `committed === true`. Boss depth (`depth % 3 === 0`) ⇒ `roomType === "boss"` (validated by `livingRunSemanticDiagnostics`). Revision bumps on save.

**Checkpoint-0 recheck:** Read `src/domain/run/validation.ts` (phase-state coherence block), `src/persistence/validation.ts` (`roomStateSchema`, `threatProfileSchema`, `expectedUtilityState` superRefine).

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/run/commands.ts` | Modify | Add `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute` to `RunCommand` union; add `route-*` rejection codes; add `save-checkpoint` to `RunPersistenceInstruction`. |
| `src/domain/run/reducer.ts` | Modify | Add `materializeRoute`, `selectRouteOffer`, `commitRoute` transitions; extend `runReducer` switch; map generator output to snapshots. |
| `src/domain/run/route.test.ts` | Create | Unit tests for the three new commands: materialize (4 offers, boss, idempotent), select (valid, unknown, empty, committed), commit (phase transition, room population, boss-depth rule, rejections). |
| `src/persistence/envelopes.ts` | Modify | Add `SaveCheckpointPersistenceInstruction`; extend `RunLifecycleRepository` with `saveCheckpoint(instruction)`. |
| `src/persistence/repositories.ts` | Modify | Implement `saveCheckpoint`: one read/write transaction, validate stored revision, `put` new run, return validated state. |
| `src/persistence/repositories.test.ts` | Modify | Add tests for `saveCheckpoint`: success, stale revision, missing living run, validation of populated route/room state. |
| `src/app/commands.ts` | Modify | Add `route/materialize`, `route/select-offer`, `route/commit` to `AppCommand`. |
| `src/app/appStore.ts` | Modify | Add handlers for the three new app commands; inject `commitId`/`now`; call `saveCheckpoint`; publish state + save signal; add `routeState` to the checkpoint view. |
| `src/app/appStore.test.ts` | Modify | Add integration tests: materialize → offers populated; select → selection persisted; commit → room phase; reload behavior via memory repository. |

## Implementation

### Checkpoint 1 — Domain transitions and mapping

Read before modify: `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/run/validation.ts`, `src/domain/random/generators.ts`, `src/domain/content/rooms.ts`.

1. **Extend `RunCommand`** in `commands.ts`:
   ```typescript
   | {
       readonly type: "MaterializeRoute";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly commitId: string;
       readonly now: number;
     }
   | {
       readonly type: "SelectRouteOffer";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly offerId: string;
       readonly commitId: string;
     }
   | {
       readonly type: "CommitRoute";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly commitId: string;
       readonly now: number;
     }
   ```
   Add rejection codes: `route-already-materialized`, `route-not-materialized`, `route-already-committed`, `unknown-route-offer`, `route-selection-missing`.

2. **Extend `RunPersistenceInstruction`**:
   ```typescript
   | {
       readonly kind: "save-checkpoint";
       readonly runId: string;
       readonly commitId: string;
       readonly expectedRevision: number;
     }
   ```

3. **Implement `materializeRoute`** in `reducer.ts`:
   - Validate metadata (runId, commitId, expectedRevision, now).
   - Validate current state.
   - Require `livingRun !== null` else `no-living-run`.
   - Require `runId === livingRun.runId` else `stale-run`.
   - Require `expectedRevision === livingRun.revision` else `stale-run-revision`.
   - Require `routeState !== null` (phase must be route) else `invalid-state`.
   - Require `routeState.offers.length === 0` else `route-already-materialized`.
   - Compute the route event key: `routeEventKey(runId, contentVersion, depth)` (reuse from `routes.ts`; for depth 1 it already matches; for deeper depths it must be computed).
   - Build `RouteGenerationContext` from the living run: `{ seed, contentVersion, runId, depth, cycle, integrityCurrent, integrityMax, runCurrency, routeEventKey }`.
   - Call `generateRouteOptions(catalog, context)`.
   - Map each `GeneratedRouteOffer` → `RouteOfferSnapshot` (drop display fields).
   - Return new `LivingRun`: `routeState: { eventKey, offers, selectedOfferId: null, committed: false }`, `revision: revision + 1`, `updatedAt: now`, `lastCommitId: commitId`. Profile unchanged.
   - Persistence: `{ kind: "save-checkpoint", runId, commitId, expectedRevision }`.

4. **Implement `selectRouteOffer`**:
   - Validate metadata.
   - Require living run, runId match, revision match.
   - Require `routeState !== null` else `invalid-state`.
   - Require `routeState.offers.length > 0` else `route-not-materialized`.
   - Require `!routeState.committed` else `route-already-committed`.
   - Require `routeState.offers.some(o => o.offerId === command.offerId)` else `unknown-route-offer`.
   - Return new living run with `routeState.selectedOfferId = offerId`, `revision + 1`, `updatedAt: now`, `lastCommitId: commitId`.
   - Persistence: `save-checkpoint`.

5. **Implement `commitRoute`**:
   - Validate metadata.
   - Require living run, runId match, revision match.
   - Require `routeState !== null` else `invalid-state`.
   - Require `routeState.offers.length > 0` else `route-not-materialized`.
   - Require `routeState.selectedOfferId !== null` else `route-selection-missing`.
   - Require `!routeState.committed` else `route-already-committed`.
   - Build `RoomGenerationContext` from the living run + `selectedOfferId`.
   - Call `generateRoomCandidate(catalog, context)`.
   - Map `GeneratedRoomCandidate` → `RoomState` (drop display fields, drop `threatProfile.diagnostics`, drop `authoredRoomId`).
   - Verify boss-depth rule: if `isBossDepth(depth)`, `roomType` must be `"boss"`; if not, must not be.
   - Return new living run: `phase: "room"`, `routeState: null`, `roomState: <mapped>`, `revision + 1`, `updatedAt: now`, `lastCommitId: commitId`.
   - Persistence: `save-checkpoint`.

6. **Extend `runReducer` switch** with the three new cases.

7. **Create `route.test.ts`**: Follow the patterns in `lifecycle.test.ts` (deepFreeze, `startCommand` helper, catalog). Test:
   - Materialize on depth-1 run → 4 offers, types `[battle, elite, shop, recovery]`, `selectedOfferId === null`, `committed === false`, revision bumped, persistence `save-checkpoint`.
   - Materialize on boss depth (use a run with `depth: 3`, `cycle: 1`) → 1 boss offer.
   - Re-materialize → `route-already-materialized`.
   - Select valid offer → `selectedOfferId` set, revision bumped.
   - Select unknown offer → `unknown-route-offer`.
   - Select before materialize (empty offers) → `route-not-materialized`.
   - Select after commit (simulate `committed: true`) → `route-already-committed`.
   - Commit after select → `phase: "room"`, `routeState: null`, `roomState` populated with correct `roomType`, `status: "ready"`, `threatProfile` present, `combatCheckpoint: null`, room-type `shop`/`recovery`/`boss` present when appropriate.
   - Commit without selection → `route-selection-missing`.
   - Commit twice → `route-already-committed` (second commit sees `routeState: null` ⇒ `invalid-state` or a dedicated check; choose the clearest rejection).
   - All resulting living runs pass `validateLivingRun(run, catalog)`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/domain/run/route.test.ts src/domain/run/lifecycle.test.ts` pass. The three new commands work in the pure reducer with generator output mapped to durable snapshots.

### Checkpoint 2 — Persistence

Read before modify: `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts`, `src/persistence/validation.ts`, `src/migrations/001_initial.ts`.

1. **Extend `envelopes.ts`**:
   - Add `SaveCheckpointPersistenceInstruction = Extract<RunPersistenceInstruction, { kind: "save-checkpoint" }> & { readonly proposedRun: LivingRun }` (mirror the `StartRunPersistenceInstruction` pattern — the adapter validates the exact proposed record).
   - Add `saveCheckpoint(instruction: SaveCheckpointPersistenceInstruction): Promise<PersistenceResult<RunState>>` to `RunLifecycleRepository`.

2. **Implement `saveCheckpoint` in `repositories.ts`**:
   - One `readwrite` transaction on `[PROFILE_STORE_NAME, LIVING_RUN_STORE_NAME]`.
   - Read stored living run; if undefined → `living-run-missing`.
   - Parse stored living run via `parseLivingRunRecord`.
   - Require `runId` match else `stale-run`.
   - Require `revision === expectedRevision` else `stale-run-revision`.
   - Parse the proposed run via `parseLivingRunRecord(instruction.proposedRun, catalog)`.
   - Run `parseRunStateRecords(profile, proposedRun, catalog)` for combined validation.
   - `put` the proposed run to `LIVING_RUN_STORE_NAME`.
   - Return `{ profile, livingRun: proposedRun }`.
   - Follow the exact error-bounding and diagnostic patterns from `startRun`/`abandonRun`.

3. **Extend `repositories.test.ts`**: Add tests using the existing `fake-indexeddb` harness (see existing test file for the setup pattern):
   - `saveCheckpoint` succeeds: stores a run, checkpoints it with populated routeState, reloads the same offers.
   - Stale revision → rejected, stored run unchanged.
   - Missing living run → `living-run-missing`.
   - Checkpoint with populated roomState validates and reloads.
   - Checkpoint with a malformed proposed run → `invalid-living-run`, stored run unchanged.

4. **Wire the repository factory** in `createRunLifecycleRepository` to include `saveCheckpoint`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/persistence/repositories.test.ts src/persistence/validation.test.ts` pass. `saveCheckpoint` atomically persists and reloads populated route/room state.

### Checkpoint 3 — App store wiring

Read before modify: `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/app/navigation.ts`.

1. **Extend `AppCommand`** in `commands.ts`:
   ```typescript
   | { readonly type: "route/materialize" }
   | { readonly type: "route/select-offer"; readonly offerId: string }
   | { readonly type: "route/commit" }
   ```

2. **Add store handlers** in `appStore.ts`:
   - `handleMaterializeRoute`: build `MaterializeRoute` run command with `runId`, `expectedRevision` from `state.livingRun`, `commitId: createId()`, `now: clock()`. Call `runReducer`. On success, call `repository.saveCheckpoint({ ...persistence, proposedRun })`. Publish new `livingRun` + save signal ("Route offers saved at Depth N."). Handle rejections with bounded messages.
   - `handleSelectRouteOffer`: similar; `offerId` from the app command. Save signal ("Route selection saved.").
   - `handleCommitRoute`: similar. Save signal ("Committed route to {roomType} room."). After commit, the living run is in `phase: "room"`.
   - Extend `isDurableCommand` to include the three new route commands.
   - Extend `runRejectionMessage` with the new rejection codes.

3. **Extend `App.test.tsx`**: Add integration tests using the existing `createMemoryRepository` harness (extend it with a `saveCheckpoint` mock that updates the in-memory living run):
   - Start a run → dispatch `route/materialize` → snapshot has 4 offers.
   - Dispatch `route/select-offer` with a valid offerId → snapshot has `selectedOfferId`.
   - Dispatch `route/commit` → snapshot `phase === "room"`, `routeState === null`, `roomState !== null`.
   - Dispatch `route/materialize` again → rejected (already in room phase or already materialized).
   - Select unknown offer → rejected, state unchanged.

4. **Run the full gate**: `npm run verify`.

**Commit when:** `npm run verify` passes (lint + typecheck + all unit/component tests + build). The three route commands are wired through the store to persistence.

## Verification

**PROGRAM-CONFIG commands (resolved against Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP3.**
- `npm run test:unit -- src/domain/run/route.test.ts` — new domain tests. **Must pass at CP1.**
- `npm run test:unit -- src/persistence/repositories.test.ts` — persistence tests. **Must pass at CP2.**
- `npm run test:unit -- src/app/appStore.test.ts` — store integration. **Must pass at CP3.**

**Integration proofs (CAP/CA):**
- CA-01 proof (S01-CP1): `route.test.ts` asserts `MaterializeRoute` produces exactly four non-boss offers (or one boss offer) with correct `offerId`/`roomType`/`roomEventKey`, and `validateLivingRun` passes on the result. Re-materialize is rejected.
- CA-01 persistence proof (S01-CP2): `repositories.test.ts` asserts `saveCheckpoint` persists populated offers and reload returns them.
- CA-02 proof (S01-CP1/CP3): `route.test.ts` asserts `SelectRouteOffer` sets `selectedOfferId` to a valid offer and rejects unknown/empty/committed.
- CA-03 proof (S01-CP1/CP2): `route.test.ts` asserts `CommitRoute` transitions to room phase with populated `roomState`; `repositories.test.ts` asserts reload returns the same room.

**Browser proof:** Owned by S02-CP3. S01 does not run e2e.

## State Update

After CP3, update STATE.md:
- Session 01 status → `done`, checkpoint → 3.
- CAP-01/02/03 producer status → `ready` (reducer + persistence + store committed).
- CA-01/02/03 producer → `ready`; proof → `verified` for unit, `planned` for browser (S02-CP3).
- Record actual test counts and any surprises in Handoff Notes.