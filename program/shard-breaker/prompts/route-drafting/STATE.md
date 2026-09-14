# State Tracker — Shard Breaker / route-drafting

## Program / Feature / Intent / Sessions

- **Program:** Shard Breaker (`shard-breaker`)
- **Feature:** route-drafting
- **Intent:** Wire the committed deterministic generators into the run lifecycle so a player can materialize deterministic route offers, select one, and commit it into a populated room — all durable across reload.
- **Sessions:** 2

## Session Status

| # | Session | Modules | Owns | Status | Checkpoint | Completed | Notes |
|---|---------|---------|------|--------|------------|-----------|-------|
| 01 | Route transitions and atomic room persistence | M03, M04, M06 | `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/route.test.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts` | pending | — | — | Domain transitions + persistence + store wiring. |
| 02 | Route UI, application wiring, and browser journey | M07, M06, M10, M08 | `src/ui/screens/RouteMapScreen.tsx`, `src/ui/screens/RouteMapScreen.test.tsx`, `src/ui/components/RouteCard.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts`, `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts` | pending | — | — | Consumes S01 committed contracts. |

## Wave Plan

| Wave | Sessions | Why concurrent |
|------|----------|----------------|
| 1 | 01 | S02 depends on committed reducer/repository/app-store contracts from S01. |
| 2 | 02 | S02 consumes S01's committed APIs; disjoint `Owns`. |

## Dependency Graph

```
S01 ──► S02
```

## Architecture Reference (feature-specific only; full config in PROGRAM-CONFIG)

The functional core / imperative shell is already built. `AppStore` serializes commands, injects `commitId`/`now`/`runId`/`seed`, invokes the pure `runReducer`, and delegates atomic writes to `RunLifecycleRepository`. The pure generators (`generateRouteOptions`, `generateRoomCandidate`) in M02 are committed, tested, and read-only. This feature is an integration/wiring task: add three new run commands (`MaterializeRoute`, `SelectRouteOffer`, `CommitRoute`), a new `save-checkpoint` persistence instruction, a `saveCheckpoint` repository method, app-store handlers, a `RouteMapScreen` + `RouteCard`, navigation, styles, and a browser journey.

## Scope Summary (modules affected, indexed by ID)

| ID | Module | Affected | Reason |
|----|--------|----------|--------|
| M02 | Seeded generation | Read only | `generateRouteOptions`/`generateRoomCandidate` consumed unchanged. |
| M03 | Run domain | Modified (S01) | `MaterializeRoute`/`SelectRouteOffer`/`CommitRoute` commands + reducer transitions + `save-checkpoint` instruction. |
| M04 | Persistence | Modified (S01) | New `saveCheckpoint` repository method + `save-checkpoint` instruction type; migration untouched. |
| M06 | App orchestration | Modified (S01+S02) | Route app commands + store handlers (S01); navigation + App routing (S02). |
| M07 | UI screens/components | Modified (S02) | New `RouteMapScreen` + `RouteCard`. |
| M10 | Styles | Modified (S02) | Route-map CSS. |
| M08 | Browser composition/acceptance | Modified (S02) | Route journey extension + IndexedDB reader. |

No Author artifact (`specs/`, `mocks/`, `arch/`, migrations) is modified.

## Design Decisions (choice + rationale)

1. **Route offers are persisted before display.** Determinism requires durable persistence, not regeneration — a reload must return the same offers. `MaterializeRoute` is an explicit durable action that bumps the living-run revision and saves the populated `routeState.offers`.
2. **Selection and room entry are separate durable actions.** Each player choice is a commit point with its own revision bump. `SelectRouteOffer` persists the selection; `CommitRoute` persists the room transition. This matches the mock's "Selecting a card does not enter it" and "Committed route is saved before room load."
3. **Existing generators are reused without modification.** M02 is committed, pure, and tested. The reducer calls `generateRouteOptions`/`generateRoomCandidate` directly with a `RouteGenerationContext`/`RoomGenerationContext` built from the living run's own `seed`/`contentVersion`/`depth`/`cycle`/`integrityCurrent`/`integrityMax`/`runCurrency`/`routeEventKey`. Only `commitId`/`now` are injected by the store.
4. **The reducer stays pure.** Generators are pure (catalog + context → frozen offers), so the reducer calls them directly. The reducer signature already accepts `catalog: ContentCatalog`. No new impure dependency enters the domain.
5. **Generator output is mapped to durable snapshots inside the reducer.** `GeneratedRouteOffer` → `RouteOfferSnapshot` (drop `displayName`/`summary`/`riskLabel`/`rewardLabel`/`counterplay`/`roomDefinitionId` — display fields resolved from catalog by `roomType` at render time). `GeneratedRoomCandidate` → `RoomState` (drop `authoredRoomId`/`displayName`/`summary`/`counterplay` and the `threatProfile.diagnostics` field). This keeps display strings out of the durable record and avoids touching `model.ts`.
6. **Checkpoint persistence = atomic living-run revision bump.** Reuses the existing singleton-key transaction pattern: one IndexedDB read/write transaction, validate the stored revision matches the command's `expectedRevision`, `put` the new run, return the validated state. No migration needed — zod schemas already accept populated route/room state.
7. **`MaterializeRoute` is idempotent.** Re-dispatching when offers already exist is rejected (`route-already-materialized`); offers never reroll. The semantic validation in `persistence/validation.ts` already permits non-empty offers at any depth (the empty-route depth-1 check only fires when offers are empty).
8. **Navigation adds `route-map` as a third screen** for `phase === "route"` with non-empty offers in checkpoint mode. Committed-room UI is out of scope (the room screen is the next feature); the e2e proof inspects `roomState` in IndexedDB after `CommitRoute`.
9. **No schema/migration change.** The zod schemas in `persistence/validation.ts` and the domain validation in `run/validation.ts` already accept populated `routeState.offers`, `routeState.selectedOfferId`, `routeState.committed`, and a full `roomState`. The `roomStateSchema` already validates `threatProfile`, `shop`, `recovery`, `boss` against the room type.

## Verification Baseline

| Gate | Command | Scope | Evidence | Status |
|------|---------|-------|----------|--------|
| Lint | `npm run lint` | ESLint + Stylelint | Executed this turn: pass. | verified |
| Types | `npm run typecheck` | `tsc -b --pretty false` | Executed this turn: pass. | verified |
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)` | Executed this turn: 185 passed across 11 files. | verified |
| Production build | `npm run build` | Typecheck + Vite output in `dist/` | Executed this turn: pass (145 modules, 344 kB JS). | verified |
| Standard local gate | `npm run verify` | Lint + types + unit + build | Executed this turn: pass. | verified |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | `tests/e2e/run-lifecycle.spec.ts` | Not executed this turn (requires localhost binding + port). Prior sandbox runs reported `EPERM` on localhost binding. S02-CP3 records the actual result and, if it recurs, records it as `unverified` with cause; unit/build gate must still pass. | unverified (environmental) |

**Known hazards:** Browser e2e requires `PLAYWRIGHT_PORT` and permission to bind `127.0.0.1`. Prior sandboxed runs reported `EPERM`. This is an environmental limitation, not a code defect. S02-CP3 owns recording the actual e2e result. The `webServer` config starts Vite on the assigned port with `--strictPort`.

**Build freshness:** `npm run build` executed this turn produces `dist/assets/index-CAqMclZu.js` (344.10 kB) and `dist/assets/index-Ce6bwcxY.css` (10.00 kB). S02's e2e builds the intended source revision via the `webServer.command` (`npm run dev`), not a preview server.

## Capability Readiness

| ID | Approved behavior / entry point | Required facts + producer owners | CA IDs / prerequisites | Integration owner / checkpoint | Status | Proof / checked sources | Open gaps + correction owners |
|----|--------------------------------|---------------------------------|------------------------|--------------------------------|--------|-------------------------|-------------------------------|
| CAP-01 | Start/resume a living run → `MaterializeRoute` persists four deterministic route offers → reload returns the same offers. Entry: `route/materialize` app command → `MaterializeRoute` run command → `runReducer` → `saveCheckpoint`. | `LivingRun` (seed, contentVersion, depth, cycle, integrityCurrent, integrityMax, runCurrency, routeEventKey) — produced by `StartRun` (committed). `generateRouteOptions` — M02, committed, pure, tested (`generators.test.ts` 14 tests). `catalog` — M01, committed. `commitId`/`now` — injected by `AppStore`. | CA-01 | S01-CP1 (domain), S01-CP2 (persistence), S01-CP3 (store). S02-CP3 (browser). | planned | M02 generators verified by `src/domain/random/generators.test.ts` (14 tests, executed this turn). `StartRun` verified by `lifecycle.test.ts` (47 tests). `parseLivingRunRecord` accepts populated routeState (zod schema inspected). | None. S01 produces the reducer transition + repository method + store handler. |
| CAP-02 | `SelectRouteOffer` persists the selection → reload preserves `selectedOfferId`. Entry: `route/select-offer` app command → `SelectRouteOffer` run command → `runReducer` → `saveCheckpoint`. | Materialized `routeState.offers` — produced by CAP-01. `offerId` — from the materialized offers. `expectedRevision` — from the current living run. | CA-01 (materialized offers must exist) | S01-CP3 (store). S02-CP3 (browser). | planned | Validation `collectRouteIssues` inspected: selectedOfferId must be in offers; committed requires selection. | None. |
| CAP-03 | `CommitRoute` transitions to `room` phase with a populated `roomState` → reload returns the same committed room. Entry: `route/commit` app command → `CommitRoute` run command → `runReducer` → `saveCheckpoint`. | Selected `routeState.selectedOfferId` — produced by CAP-02. `generateRoomCandidate` — M02, committed, pure, tested. `RoomGenerationContext` (adds `selectedOfferId`) — built from living run. | CA-01, CA-02 (selection must exist) | S01-CP3 (store). S02-CP3 (browser). | planned | `generateRoomCandidate` verified by `generators.test.ts`. `roomStateSchema` in `persistence/validation.ts` inspected: accepts full threat/shop/recovery/boss state. Phase-state coherence in `run/validation.ts` inspected: room phase requires roomState, routeState null. | None. |

**First narrow journey:** Start/resume → `MaterializeRoute` persists four deterministic route offers → reload returns the same offers → `SelectRouteOffer` persists the Battle selection → reload preserves selection → `CommitRoute` transitions to `room` phase with a populated `roomState` → reload returns the same committed room. Unit-proved by S01 checkpoints; browser-proved by S02-CP3 (or recorded as `unverified` if the sandbox denies localhost binding).

## Contract Agreements

| ID | Required meaning / authority | Producer → boundary → consumer | Mapping / constraints | Correction + proof owners / checkpoints | Agreement | Producer | Proof / evidence / checked sources |
|----|------------------------------|--------------------------------|-----------------------|----------------------------------------|-----------|----------|------------------------------------|
| CA-01 | A materialized route persists exactly the deterministic offers for `(runSeed, contentVersion, depth, routeEventKey)`. Offers never reroll on reload. Selection absent, not committed. | S01 `runReducer` (`MaterializeRoute`) → `RouteState.offers: RouteOfferSnapshot[]` → S01 `saveCheckpoint` repository → S02 `RouteMapScreen` (reads via `AppStore`). | `GeneratedRouteOffer` → `RouteOfferSnapshot`: keep `offerId`, `roomType`, `roomEventKey`, `riskTier`, `rewardPreviewId`, `visibleCost`, `availability`; drop `displayName`, `summary`, `riskLabel`, `rewardLabel`, `counterplay`, `roomDefinitionId`. `roomType ∈ {"battle","elite","shop","recovery","boss"}`. Boss depth (`depth % 3 === 0`) → exactly one boss offer. Non-boss → four offers (battle, elite, shop, recovery). Idempotent: re-materialize rejected (`route-already-materialized`). Revision bumps on save. | S01-CP1 (domain mapping + rejection), S01-CP2 (persistence), S01-CP3 (store wiring), S02-CP3 (browser reload proof). | agreed | planned | planned. Sources inspected: `generators.ts` (`generateRouteOptions`), `model.ts` (`RouteOfferSnapshot`), `validation.ts` (`collectRouteIssues`), `persistence/validation.ts` (`routeStateSchema`). |
| CA-02 | A selected offer persists `selectedOfferId` as a durable fact. The selection must be one of the materialized offers. Selection does not enter the room. | S01 `runReducer` (`SelectRouteOffer`) → `RouteState.selectedOfferId` → S01 `saveCheckpoint` → S02 `RouteMapScreen`. | `selectedOfferId` must be in `routeState.offers.map(o => o.offerId)`. Reject if offers empty (`route-not-materialized`), if already committed (`route-already-committed`), if offerId not in offers (`unknown-route-offer`). Revision bumps on save. | S01-CP1 (domain), S01-CP3 (store), S02-CP3 (browser). | agreed | planned | planned. Sources inspected: `validation.ts` (`collectRouteIssues`: selectedOfferId in offers), `model.ts` (`RouteState.selectedOfferId`). |
| CA-03 | A committed route transitions `phase: "route" → "room"`, nulls `routeState`, populates `roomState` from `generateRoomCandidate`, and persists. The room is deterministic for `(runSeed, contentVersion, depth, selectedOfferId)`. | S01 `runReducer` (`CommitRoute`) → `RoomState` (from `GeneratedRoomCandidate`) → S01 `saveCheckpoint` → S02 e2e (IndexedDB inspection). | `GeneratedRoomCandidate` → `RoomState`: keep `roomId`, `roomType`, `eventKey`, `status`, `objectiveIds`, `combatCheckpoint`, `processedOutcomeIds`, `shop`, `recovery`, `boss`, `resolutionCommitId`; map `threatProfile` by dropping `diagnostics`; drop `authoredRoomId`, `displayName`, `summary`, `counterplay`. Phase-state coherence: `phase: "room"`, `routeState: null`, `roomState ≠ null`. Reject if no selection (`route-selection-missing`), if already committed (`route-already-committed`), if roomType mismatch with boss-depth rule. Revision bumps on save. | S01-CP1 (domain mapping), S01-CP2 (persistence), S01-CP3 (store), S02-CP3 (browser IndexedDB proof). | agreed | planned | planned. Sources inspected: `generators.ts` (`generateRoomCandidate`), `model.ts` (`RoomState`, `ThreatProfileSnapshot`), `validation.ts` (phase-state coherence), `persistence/validation.ts` (`roomStateSchema`, `threatProfileSchema`). |

## Current Blockers

None. All required M02 generators are committed and ready. No unresolved product decisions. No schema/migration change needed. The `.gitignore` has been updated by the builder: `/program/` is no longer ignored and `.DS_Store` is un-anchored, so the program home is trackable and the integration checkout should be clean.

## Handoff Notes (Orchestrator writes here after each session — from Coder's Handoff section, verbatim)

*(Accumulates during the run.)*