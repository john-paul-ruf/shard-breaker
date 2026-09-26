# State Tracker — Shard Breaker / run-summary-metaprogression

## Program / Feature / Intent / Sessions

- **Program:** Shard Breaker (`shard-breaker`)
- **Feature:** run-summary-metaprogression
- **Intent:** Build the run terminal so a finished run is worth something: the death
  finalization awards deterministic Shards into the permanent profile (FR-11), the
  persisted summary is displayed on a dedicated run-summary screen per
  `mocks/run-summary.html` (FR-13), the terminal offers one bounded carry-over relic
  choice that resolves exactly once into `unlocks.relicIds` +
  `relicState.equippedForNextRunId` and is carried by the next run's build (FR-11), and
  boss progress counters finally gain their producers so the summary's boss facts are
  real. The boss progress numbers and the death journey (green, 17/17) are the entry
  point; the battle-clear/boss browser journeys (B-3) are NOT in scope.
- **Sessions:** 3

**Inherited work reconciliation (inspected 2026-09-25 at HEAD `d9656ac`):**
`prompts/combat-engine/FINAL-REPORT.md`, `prompts/combat-engine/STATE.md`,
`prompts/room-resolution/FINAL-REPORT.md`, `.program/ledger.md`, `.program/blockers.md`,
`.program/decisions.md`, `program/shard-breaker/ARCHIVIST-LOG.md`,
`program/shard-breaker/CLEANUP-LEDGER.md` (via the final Archivist note) and
`program/shard-breaker/PROGRAM-CONFIG.md` were read in full. Every open item carries a
disposition:

- **B-3 (human decision pending — battle-clear/boss browser journeys structurally
  unreachable by play; 7,625-launch probe / 0 clears):** open, owner = human + Planner
  journey re-spec. **Not blocking this feature**: it blocks CAP-11's browser half,
  CAP-13's battle/boss journeys, and CAP-08/09 browser defeat proof — all outside this
  feature's scope. This feature's browser proof rides the **death journey**, which is
  green. If the human later chooses rebalance or a test affordance, that follow-up
  session is independent of this plan (no shared lease paths except
  `tests/e2e/run-lifecycle.spec.ts` — serialized by wave order either way).
- **`bossesReached`/`bossesDefeated` have no producer** (verified mechanically:
  initialized to 0 in `createInitialLivingRun`, incremented nowhere — the only reads are
  the death summary mapping and validation bounds). This feature owns the producer
  (CAP-17, SESSION-01-CP2). Without it FR-13's "boss progress" summary fact would be an
  eternal zero.
- **`deathTransition` hardcodes `shardsEarned: 0`** (CA-14-era interim, recorded in the
  combat-engine design decisions as "Shards economy = next feature"). This feature owns
  the real rule (CAP-14/CA-16). Known stale assertions that this authorized contract
  change invalidates, with their owning sessions: `src/domain/run/combat.test.ts:1038`
  (S01-CP2), `src/persistence/repositories.test.ts:972` (S01-CP3),
  `src/app/appStore.test.ts:1377` (S01-CP4), `tests/e2e/run-lifecycle.spec.ts:961`
  (S03-CP1). All are exact-value fixture assertions, updated in the same checkpoint as
  the formula per the contract-change rule — no B-1-style out-of-lease repair is
  expected this run.
- **`RunLifecycleRepository` exhaustive typed fixtures** (`src/app/App.test.tsx`
  `createMemoryRepository`, `src/app/App.test.tsx` is the only exhaustive fixture —
  `appStore.test.ts`'s `createRouteMemoryRepository` is a second literal): the B-4
  lesson (adding a required member orphans the fixture) is planned inside SESSION-01's
  lease this time — both fixture files are in S01's `Owns`, patched at the same
  checkpoint as the interface change.
- **Rolled-params durable carrier** (kept empty, `ROLLED_PARAMS_CARRIER_LANDING = []`):
  carried; Author/persistence-schema territory; not this feature's scope. The resolver
  still consumes empty params, never invents values.
- **Wall-hit currency carrier** (`WALL_HITS_CARRIER_LANDING = 0`): carried; bridge/store
  owners; not in scope.
- **`glyphFor` canvas threading** (renderer fallback draws health ticks only): carried;
  bridge owner; not in scope.
- **Lost-outcome-when-busy bridge/store seam**: carried; bridge/store owners. S03's
  journeys must reuse the recorded mitigations (wait for `aria-busy` to clear; the
  CA-15 reload path) — inherited hardening in `tests/e2e/run-lifecycle.spec.ts` is
  preserved.
- **`listRouteSupport()` facade follow-up** (Archivist log): carried unchanged; S02
  keeps the existing `ROUTE_SUPPORT_DEFINITIONS` read pattern in `App.tsx` (already a
  declared edge).
- **Profile screen / unlock spending / export / import / reset** (FR-12, FR-11 spending
  side, `mocks/profile.html`): explicitly out of scope — a future feature. The summary
  screen therefore omits the mock's `VIEW LOCAL PROFILE` action (its target screen does
  not exist); recorded in Design Decisions 6.
- **Relic gameplay effects** (Backfeed Cell +1 charge, Quiet Prism earlier telegraph,
  Spare Vector route risk): authored as content identity and displayed copy only; the
  simulation does not consume relics this feature. Deferral class identical to the
  rolled-params/wall-hit carriers: swap points named in CA-18, owner = a future
  combat/generator feature. The UI never claims an effect fired; it displays the
  authored capped description, exactly like the presentational-only effect keys landed
  by combat-engine S02.
- **E2e fresh-port flake class** and the **narrow vitest form** hazard: carried into
  every gate (see Verification Baseline).
- **Inspection limitations:** `.program/` scratch (orchestrator conversation, sessions/)
  was read where present; the authoritative executed-run records are the committed
  FINAL-REPORT.md files and `prompts/combat-engine/STATE.md`. The Verification Baseline
  below was **re-executed** at `d9656ac` rather than trusted from the close report.

## Session Status

| # | Session | Modules | Owns | Status | Checkpoint | Completed | Notes |
|---|---------|---------|------|--------|------------|-----------|-------|
| 01 | Terminal economy, relic pipeline, and boss progress counters (domain → persistence → store) | M01, M03, M04, M06 | `src/domain/content/relics.ts`, `src/domain/content/relics.test.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/run/reducer.ts`, `src/domain/run/commands.ts`, `src/domain/run/validation.ts`, `src/domain/run/combat.test.ts`, `src/domain/run/lifecycle.test.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/app/App.test.tsx` | done | 5/5 | 2026-09-25 | Shards formula + boss counters + `ResolveRelicChoice` + pending-relic emission + `resolveRelicChoice` repository capability + `terminal/resolve-relic` command + `terminalRecord` state. All stale-fixture updates landed in the same checkpoints as the contract changes; all THREE exhaustive repository fixtures (incl. `appStore.test.ts` `repositoryFor`) patched in the CP3 commit. |
| 02 | Run summary screen and terminal navigation | M06 (App composition), M07, M10 (styles) | `src/app/navigation.ts`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/ui/screens/RunSummaryScreen.tsx`, `src/ui/screens/RunSummaryScreen.test.tsx`, `src/styles/global.css`, `src/styles/responsive.css` | pending | — | — | `mocks/run-summary.html` component contract; `deriveScreen` terminal gate on the persisted `pendingRelicChoice`; screen-first checkpoints. |
| 03 | Browser journeys: terminal summary, Shards, relic carry-over | M08 | `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts` | pending | — | — | Death-journey adaptation (shards 20, summary screen), new terminal→relic→carry-over journey through the real transport. Fresh port per invocation. |

## Wave Plan

| Wave | Sessions | Why concurrent |
|------|----------|----------------|
| 1 | 01 | The terminal pipeline (content → reducer → persistence → store command) is one column; every later session consumes its committed types. Sole member: it owns every file the contract changes touch, so all stale fixtures repair in-checkpoint. |
| 2 | 02 | Consumes S01's committed command/state surface; screen-first, then App composition. |
| 3 | 03 | Consumes S01 + S02; browser proof through the real transport. |

Linear plan — no concurrent pairs. The only file shared across sessions
(`src/app/App.test.tsx`, S01 member-addition → S02 composition rows) is serialized by
the dependency order; no other lease overlaps. S03's e2e lease is disjoint from
everything and runs last.

## Dependency Graph

```
S01 ──► S02 ──► S03
```

## Architecture Reference (feature-specific only; full config in PROGRAM-CONFIG)

Functional core / imperative shell. This feature adds **no new module**; it extends
existing ones along the committed dependency direction:

- **M01** gains `src/domain/content/relics.ts` — authored `RelicDefinition` registry
  (three relics) + catalog facade (`listRelics`/`getRelic`) registered through the
  existing `registerKnownId` validation (same pattern as bosses/skills).
- **M03** (run domain) gains the terminal Shards rule, boss progress counter
  increments, the `ResolveRelicChoice` command/transition, and the finalize-death
  instruction's pending-relic emission. Pure, serializable, catalog-aware; no clock,
  random, or persistence imports.
- **M04** gains the `resolveRelicChoice` one-transaction profile capability and the
  finalize proposal's Shards + pending-relic application. No schema/migration change:
  `pendingRelicChoice`, `relicState`, `unlocks.relicIds`, `shards`, and
  `lastRunSummary` are all committed, validated profile fields
  (`src/persistence/validation.ts` `profileRecordSchema`).
- **M06** gains the `terminal/resolve-relic` app command, the store handler, the
  transient `terminalRecord` projection, and the run-summary screen composition.
- **M07** gains `RunSummaryScreen` per the mock; **M10** gains the terminal styles
  (token-only, B-2's formatting discipline).
- **M08** gains the browser journeys; the IndexedDB reader in `tests/e2e/indexedDb.ts`
  extends with the profile's relic fields.

Durable contract anchors (verified at `d9656ac`): `createInitialLivingRun` already
consumes `state.profile.relicState.equippedForNextRunId` into
`build.carryOverRelicId` (`src/domain/run/reducer.ts:119`); `combinedStateDiagnostics`
already rejects a carry-over relic not present in `unlocks.relicIds`
(`src/persistence/validation.ts`); `pendingRelicChoiceSchema` already enforces
`selectedId ∈ options` and the `selectedId ⟺ commitId` pairing; the finalize repository
boundary (`finalizeDeath` + `proposalFromInstruction` + `finalizeRetryIssue` +
`summaryMismatchIssue`) is the one normal path from living run to terminal profile
state. Migration 001 is untouched; no Author artifact is touched.

## Scope Summary (modules affected, indexed by ID)

| ID | Module | Affected | Reason |
|----|--------|----------|--------|
| M01 | Authored content | Modified (S01) | `relics.ts` new; catalog facade + registration. |
| M02 | Seeded generation | Untouched | The Shards rule is a pure function of summary facts; no seed stream, no generator change. |
| M03 | Run domain | Modified (S01) | Terminal Shards award, boss counters, `ResolveRelicChoice`, finalize instruction extension. |
| M04 | Persistence | Modified (S01, scoped) | Finalize proposal extension (shards + pending relic); new `resolveRelicChoice` capability; no schema change. |
| M05 | Immutable migration | Untouched | All consumed profile shapes already exist in migration-001-era schemas. |
| M06 | Application orchestration | Modified (S01 store/command surface, S02 composition) | `terminal/resolve-relic` command + handler + `terminalRecord`; run-summary screen model + branch. |
| M07 | React UI and styles | Modified (S02) | `RunSummaryScreen` + tests + terminal styles. |
| M08 | Browser composition and acceptance | Modified (S03) | Terminal/relic journeys + IndexedDB reader extension. |
| M09 | Combat domain | Untouched | Relic effects are deferred (CA-18); no combat-domain change. |
| M10 | Game bridge (incl. Arena host) | Untouched | Styles only (`src/styles/` is M07's lease in this plan; registry M07 owns styles). |

No Author artifact (`specs/`, `mocks/`) is modified. Migration 001 is untouched.

## Design Decisions (choice + rationale)

1. **Three sessions, linear, sliced by column.** Column 1 = the terminal pipeline
   (content → domain → persistence → store command surface), provable at unit/store
   level. Column 2 = the screen consuming it, provable at component level. Column 3 =
   the browser proof through the real transport. Layer-wise slicing was rejected: the
   terminal pipeline is one behavior (the finalization transaction must carry Shards
   AND the pending relic choice atomically, or the screen would offer a choice whose
   durable record the finalization dropped); splitting it would put producer and
   consumer in different sessions with a silent mid-wave gap.
2. **The Shards rule is a visible pure function, not a seeded draw** (CA-16):
   `shardsEarned = 20 × reachedDepth + 50 × bossesDefeated`, exported as
   `terminalShardAward` beside `battleCurrencyGrant` (S02's precedent for exported,
   testable economy rules). Rationale: terminal Shards are computed from facts already
   in the summary (no stream, no hidden reroll — FR-11 "visible, deterministic outcome
   rules"); constants are module-level and reversible. The mock's "+186" is sample
   data, not an authored constant (same reading as every prior mock number).
3. **Boss progress counters are produced in the reducer, where the facts are decided**
   (CAP-17): `progress.bossesReached` increments exactly once per committed boss room
   (`CommitRoute`), `progress.bossesDefeated` exactly once per accepted boss clear
   outcome (CA-02 ledger guarantees once-only). This is required for FR-13's summary
   facts and is the only place the counters can be written coherently with the
   existing validation (`bossesDefeated ≤ bossesReached`).
4. **The terminal relic choice is the authored unlock rule** (CA-18): the default
   profile keeps `unlocks.relicIds` empty per `specs/database.md` seed data ("empty run
   unlock lists beyond those initial classes"); every death finalization writes
   `pendingRelicChoice` with the catalog's three relics as options; resolving the
   choice adds the chosen relic to `unlocks.relicIds` AND equips it into
   `relicState.equippedForNextRunId` in the same profile mutation (satisfying the
   committed `unequipped-relic` validation rule and the
   `carryOverRelicId ∈ unlocks.relicIds` state rule). Declining (null) clears the
   pending choice with no relic. One relic slot stays active at a time; a later choice
   replaces the earlier one.
5. **Choice resolution is immediate-on-select** (mock-faithful): the relic radiogroup's
   selection dispatches `terminal/resolve-relic` durably (the
   room-resolution S03 precedent: when the producer applies immediately, the selection
   IS the commit); the mock's "Selected: X // saved with terminal result." note maps to
   the committed SaveSignal, and the screen unmounts to the archive. `Try again` with
   an unresolved choice dispatches the decline (`relicId: null`) — the dismissal path
   `specs/database.md`'s transaction table requires — and then lands on the archive.
6. **The terminal screen gates navigation on the persisted `pendingRelicChoice`**
   (selectedId === null), not on transient UI state: the gate is durable, survives
   reload (database.md: `lastRunSummary` "allows refresh recovery"), and every death
   ends at the terminal until the choice resolves. Consequence recorded for S03: the
   death journey's final reload expectation evolves from the archive heading to the
   terminal screen, then returns to the archive via the decline path — the journey's
   behavioral assertion (durable truth after reload) is preserved, its screen
   expectation adapts to the new approved surface.
7. **The record-delta marker is transient UI state, not a schema change.** After
   finalization the profile no longer knows the prior record, so "NEW" is computed by
   the finalize handler (pre-finalization `records.highestReachedDepth` vs
   `summary.reachedDepth`) and published as `AppState.terminalRecord`. No persisted
   shape widens; reload shows the record callout without the NEW marker (truthful).
8. **Relic effects are deferred with named swap points** (same deferral class as the
   rolled-params and wall-hit carriers): Backfeed Cell (+1 first-room charge) → the
   room-entry charge initialization in the generator's checkpoint emission; Quiet Prism
   (earlier telegraph) → hazard step timing in the combat domain; Spare Vector (route
   risk reveal) → the route-offer risk display. The UI displays authored copy only and
   never claims an effect fired. Owner: a future combat/generator feature; recorded in
   CA-18 and Capability Readiness.
9. **`resolveRelicChoice` is a required repository capability**, added together with
   its exhaustive-fixture members in the same checkpoint (the B-4 lesson applied at
   planning time, not after a blocked session). The store keeps the fail-closed guard
   pattern: an absent implementation is a typed refusal, never a fabricated success.
10. **No reroll, no double-award**: the Shards award rides the existing CA-14
    finalize retry rules (`finalizeRetryIssue` already rejects a retried terminal
    against a removed run), and the relic choice is once-only via the schema's
    `selectedId ⟺ commitId` coherence plus a repository-level resolved-pending
    rejection.

## Verification Baseline

| Gate | Command | Scope | Evidence | Status |
|------|---------|-------|----------|--------|
| Lint | `npm run lint` | ESLint + Stylelint | Re-executed at planning (2026-09-25, tree at `d9656ac`): exit 0, **0 errors + 1 pre-existing** react-refresh/only-export-components warning (`src/ui/screens/RouteMapScreen.tsx:55` `createRouteMapScreenModel` export alongside the component). Leave it; record if the count changes. Do not "fix" it by moving the export (public API consumed by `App.tsx` and its tests). | verified |
| Types | `npm run typecheck` | `tsc -b --pretty false` | Re-executed at planning (`d9656ac`): exit 0. | verified |
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)` | Re-executed at planning (`d9656ac`): **607 passed / 30 files**, exit 0, 3.70s. jsdom `HTMLCanvasElement.getContext` stderr in Arena-free suites is pre-existing noise. After SESSION-01 (Orchestrator-verified at receive): **649 passed / 31 files**, exit 0 (exactly +41 tests / +1 file `relics.test.ts`). **Recorded hazard: `npm run test:unit -- <patterns>` does not filter — use `npx vitest run <paths>` with file+test counts read in both directions** (S06 recorded the `node_modules/.bin/vitest` fallback for shells where `npx` cannot resolve the binary). | verified |
| Production build | `npm run build` | Typecheck + Vite output in `dist/` | Re-executed at planning (`d9656ac`): exit 0, **170 modules**, `index-CH8gmHQO.js` 466.62 kB, `index-BYhadsZB.css` 36.47 kB. After SESSION-01 (Orchestrator-verified): exit 0, **171 modules**, `index-Cdgno3dD.js` 472.64 kB (relics.ts enters the graph; CSS hash unchanged). Rollup comment-position warnings from `node_modules/zod/v4/core/*` are upstream noise. | verified |
| Standard local gate | `npm run verify` | Lint + types + unit + build | Re-executed green at the combat-engine close (`97553fd`); components re-executed at planning. | verified |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | `tests/e2e/run-lifecycle.spec.ts` | Inherited record: **17/17** (15 room-resolution + loss-checkpoint + death; Orchestrator re-executed on fresh ports 8083/8084 at the combat-engine close). **Not re-executed at planning** — the fresh-port hazard binds every S03 invocation. | inherited |

**Baseline hazards (all binding):** (1) narrow vitest form required for filtering;
(2) the RouteMapScreen react-refresh warning is pre-existing — do not fix by moving the
export; (3) fresh Playwright port per e2e invocation (port reuse seconds after a Vite
kill produced save-signal/strict-order flakes; `webServer.reuseExistingServer` is
disabled when PLAYWRIGHT_PORT is set; Orchestrator assigns one free port per slot);
(4) e2e must assert via IndexedDB reads + reload, not rendered copy alone (Custom Rule);
(5) firefox/webkit/mobile Playwright projects exist in config but are NOT part of the
recorded baseline — do not silently extend acceptance scope; (6) the store's
serialized-command contract silently drops commands during a durable save's busy
window — journeys wait for `aria-busy` to clear (the hardened `returnToArchive`
pattern) and use the CA-15 reload path.

## Capability Readiness

| ID | Approved behavior / entry point | Required facts + producer owners | CA IDs / prerequisites | Integration owner / checkpoint | Status | Proof / checked sources | Open gaps + correction owners |
|----|--------------------------------|---------------------------------|------------------------|--------------------------------|--------|-------------------------|-------------------------------|
| CAP-14 | Terminal Shards economy: death finalization awards deterministic Shards into `profile.shards` exactly once. Entry: the finalize-death transition (existing). | `summary.reachedDepth`, `summary.bossesDefeated` (CAP-17 producer **landed S01-CP2**, commit `bb2c72a`); formula constants (**landed S01-CP2**, `terminalShardAward` at `reducer.ts:645`, commit `bb2c72a`). | CA-16 | S01-CP2 (reducer) ✅, S01-CP3 (repository proposal) ✅ `dd3c88a`, S01-CP4 (store publish) ✅ `4421993`, S03-CP2 (browser) | producer complete | Producer rows verified by Orchestrator at receive: formula rows 20/110/260/310 in `combat.test.ts`; `proposalFromInstruction` adds `storedProfile.shards + summary.shardsEarned` in the same transaction; stale exact-value fixtures repaired in-checkpoint (`combat.test.ts:1042`, `repositories.test.ts`, `appStore.test.ts`); `run-lifecycle.spec.ts:961` remains S03's (in its lease) | Browser proof lands S03; the formula is pure — no seed, no reroll. Retry safety inherited CA-14's rules (verified: retried finalize still rejects with `profile.shards` unchanged). |
| CAP-15 | Run summary screen: persisted `lastRunSummary` displayed per `mocks/run-summary.html` — terminal treatment, class/depth/bosses/build/Shards/reason, record callout with NEW marker, relic strip while unresolved. Entry: `deriveScreen` terminal gate. | `profile.lastRunSummary` (committed producer, browser-proven at the combat-engine close); `profile.records` (committed); `terminalRecord` (**landed S01-CP4**, commit `4421993`: `AppState.terminalRecord: { isRecord: boolean; priorRecordDepth: number } | null`, cleared on resolve/decline); catalog display names (committed). | CA-19 | S02-CP1/CP2 (component), S03-CP2 (browser) | planned | Mock contract read at planning (`mocks/run-summary.html`); committed summary producer verified (`deathTransition` → `runSummarySchema` round-trip, browser-proven death journey) | The screen replaces the archive as the post-death landing while the relic choice is unresolved (Design Decision 6); S03 must adapt the death journey's final reload expectation. |
| CAP-16 | Carry-over relic: authored relics; terminal `pendingRelicChoice`; one-time resolve (choose → unlock + equip; decline → clear); next `StartRun` carries the equipped relic into `build.carryOverRelicId`. Entry: summary screen radiogroup. | Relic content (**landed S01-CP1**, commit `8b4cc26`); `pendingRelicChoice` emission (**landed S01-CP2**, `bb2c72a`); `resolveRelicChoice` capability (**landed S01-CP3**, `dd3c88a` — required member, all three exhaustive fixtures patched); `terminal/resolve-relic` command (**landed S01-CP4**, `4421993`); carry-over consumption committed and now **proven** with the freshly equipped relic (S01-CP5 `ec82a45`, `lifecycle.test.ts` + `parseRunStateRecords`). | CA-18 | S01-CP2/CP3/CP4 (pipeline) ✅, S02-CP1 (UI), S03-CP2 (browser incl. build carry) | producer complete | Committed carry-over consumer verified at `d9656ac`; schema coherence rules verified in `src/persistence/validation.ts` (`pendingRelicChoiceSchema`, `unequipped-relic`, `relic-locked`) | Relic **gameplay effects** deferred (Design Decision 8) — display-only this feature; swap points named in CA-18; owner = future combat/generator feature. |
| CAP-17 | Boss progress counters gain producers: `bossesReached` at boss-room commit, `bossesDefeated` at boss clear. Entry: `CommitRoute` / `ReportCombatOutcome` clear branch. | Boss routing (committed generator); CA-02 ledger (committed). | CA-17 | S01-CP2 (reducer + tests) ✅ `bb2c72a`, S02 (summary display), S03 (browser shows zeros on the reachable depth-1 path) | producer complete | Producer landed and Orchestrator-verified: `commitRoute` increments `bossesReached` once per boss-room commit; boss clear increments `bossesDefeated` once (CA-02 once-only); non-boss no-op; `parseLivingRunRecord` round-trip; `bossesDefeated ≤ bossesReached` coherence enforced (the old CA-13 boss-clear fixture needed the committed route reflected — fixed in-lease at CP2) | The browser proof of `bossesDefeated > 0` requires reaching a boss defeat by play — **becomes reachable once the approved follow-up feature `threat-rebalance` lands its boss journey (human decision 2026-09-25: B-3 option (a), rebalance). Not this feature's proof obligation — this feature's browser rows show the truthful zeros; unit-level proofs land S01-CP2. |

**First narrow journey (planned):** start → battle → three reload-separated losses →
death finalization → run summary screen (Shards +20 in IndexedDB) → select Backfeed
Cell → `pendingRelicChoice` resolved + `unlocks.relicIds` + `relicState.equippedForNextRunId`
in IndexedDB → reload → launch archive → start a new run → `build.carryOverRelicId ===
"relic-backfeed-cell"` in IndexedDB. This crosses the real transport (pointer →
input → engine → combat domain → outcome command → reducer → repository → IndexedDB →
reload → new-run start), closes FR-11's award/choose/carry loop and FR-13's summary
surface. Proven at S03-CP2; every earlier "verified" row is producer/component level.

## Contract Agreements

| ID | Required meaning / authority | Producer → boundary → consumer | Mapping / constraints | Correction + proof owners / checkpoints | Agreement | Producer | Proof / evidence / checked sources |
|----|------------------------------|--------------------------------|-----------------------|----------------------------------------|-----------|----------|------------------------------------|
| CA-16 | Death finalization awards `shardsEarned = 20 × reachedDepth + 50 × bossesDefeated` (constants `SHARDS_PER_DEPTH = 20`, `SHARDS_PER_BOSS = 50`) and the repository adds it to `profile.shards` in the same terminal transaction. Exactly once — a retried finalize finds no living run and is rejected without changes (inherited CA-14 retry rules). | S01 `deathTransition` (formula → `summary.shardsEarned`) → `finalize-death` instruction → S01 `proposalFromInstruction` (`profile.shards += summary.shardsEarned`) → store publish + summary display + browser IndexedDB assertions. | Shards are permanent currency, never `runCurrency`. Safe non-negative integer (schema already bounds). Depth-1/0-boss death = 20. `summaryMismatchIssue` unchanged (shardsEarned is not a run-coherence field). | S01-CP2 (formula + reducer row) ✅ `bb2c72a`, S01-CP3 (repository row + retry no-double-award row) ✅ `dd3c88a`, S01-CP4 (store publish row) ✅ `4421993`, S03-CP2 (browser exact value). | agreed | done (S01-CP2/3/4 — Orchestrator re-executed 649/31 + formula/transaction/retry rows read in committed code) | done at unit level (stale exact-value fixtures repaired in the same checkpoints); browser exact-value proof remains S03-CP2. |
| CA-17 | `progress.bossesReached` increments exactly once when `CommitRoute` materializes a boss room; `progress.bossesDefeated` increments exactly once when the boss room's `clear` outcome is accepted (CA-02 ledger once-only). Counters persist with the run and satisfy `bossesDefeated ≤ bossesReached`. | S01 reducer (`commitRoute`, `reportCombatOutcome` clear branch) → `LivingRun.progress` → death summary mapping (`deathTransition` reads the counters verbatim) → summary display + records. | Non-boss rooms change nothing. The counters are run facts, not room facts; a reload mid-room preserves them (persisted with every checkpoint). | S01-CP2 (reducer rows: boss commit at depth 3, boss clear, non-boss no-op) ✅ `bb2c72a`. | agreed | done (producer; Orchestrator read the committed rows + round-trip at receive) | done at unit level; browser `bossesDefeated > 0` proof remains threat-rebalance's boss journey (B-3 resolution); S03 browser rows assert the truthful zeros. |
| CA-18 | Every death finalization writes `pendingRelicChoice { sourceRunId: runId, options: catalog relic IDs in authored registry order, selectedId: null, commitId: null }`; `ResolveRelicChoice(relicId \| null)` resolves it exactly once — choose adds the relic to `unlocks.relicIds` AND sets `relicState.equippedForNextRunId` in the same profile mutation (satisfying committed `unequipped-relic` + `relic-locked` rules); decline clears `pendingRelicChoice` with no relic; a resolved choice can never resolve again. `StartRun` consumes `equippedForNextRunId` into `build.carryOverRelicId` (committed producer, `reducer.ts:119`). | S01 `deathTransition` (emission) → finalize-death instruction gains the pending choice → S01 `proposalFromInstruction` (applies to the profile) → S01 `resolveRelicChoice` reducer transition → `resolve-relic-choice` instruction → S01 repository `resolveRelicChoice` (one profile read/write transaction, stale-profile-revision guard, resolved-pending rejection) → store handler + screen radiogroup → next run's build. | Options ≤ 16 (schema cap; 3 authored). `selectedId ⟺ commitId` pairing enforced by the committed `pendingRelicChoiceSchema`. Relic IDs follow `registerKnownId` kebab rule: `relic-backfeed-cell`, `relic-quiet-prism`, `relic-spare-vector`. Authored `cappedDescription` copy is display-only — gameplay effects are deferred with swap points (Design Decision 8): Backfeed Cell → room-entry charge init; Quiet Prism → hazard step timing; Spare Vector → route risk display. Exhaustive repository fixtures (`App.test.tsx` `createMemoryRepository`, `appStore.test.ts` `createRouteMemoryRepository`) gain the `resolveRelicChoice` member at the SAME checkpoint as the interface change (B-4 lesson, pre-planned). | S01-CP1 (content + facade) ✅ `8b4cc26`, S01-CP2 (emission + transition) ✅ `bb2c72a`, S01-CP3 (repository + fixtures) ✅ `dd3c88a` — all THREE exhaustive fixtures (incl. the third, `appStore.test.ts` `repositoryFor`) patched in the same commit, S01-CP4 (command + handler) ✅ `4421993`, S02-CP1 (UI), S03-CP2 (browser: choose → IndexedDB → reload → archive → start → build carry). | agreed | done (producer pipeline; Orchestrator read emission shape, choose=unlock+equip one mutation, decline=clear, double-resolve/stale/forged rejections, StartRun carry-over proof at CP5 `ec82a45`) | done at unit level; UI + browser legs remain S02/S03. |
| CA-19 | The terminal screen renders the persisted summary truthfully: terminal treatment (reason-derived stamp), metrics (reached depth, Shards earned, bosses cleared, record result), build tags catalog-resolved by ID, record callout (NEW only when the finalize handler computed it; reload shows the record without the marker), relic strip only while `pendingRelicChoice.selectedId === null`. Navigation gates on the persisted pending choice (durable across reload); no color-only state (CA-08 discipline). | S02 `deriveScreen` gate + `createRunSummaryModel` → `RunSummaryScreen` → S03 browser journeys. | `lastRunSummary` is validated at the persistence boundary (committed `runSummarySchema` + semantic diagnostics); the screen fail-closes on a missing summary/pending pair like every other model builder. | S02-CP1 (screen), S02-CP2 (App composition), S03-CP2 (browser). | agreed | planned (S02-CP1) | planned. |

**Provisional-CA note:** none of the above is provisional — every producer fact CA-16..CA-19
consumes is either committed at `d9656ac` (summary shape, profile schema, carry-over
consumption, CA-02 ledger) or is this feature's own planned producer with its owning
checkpoint named. Orchestrator rechecks each mapping at the named checkpoint before
dispatching dependents, per the standing provisional-recheck protocol.

## Current Blockers

**None owned by this feature.**

**Decision recorded 2026-09-25 (human):** B-3 is resolved — option (a), **rebalance
threat numbers** so the first battle room is clearable by play. The follow-up feature is
planned at `prompts/threat-rebalance/` (2 sessions: probe + balance constants with the
clearability sweep, then the battle-clear/boss browser journeys). **Dispatch order: this
feature's waves 1–3 first, then threat-rebalance** — the only shared lease path is
`tests/e2e/run-lifecycle.spec.ts`, serialized by that order. No change to this plan's
leases, checkpoints, or proofs; the death journey this feature rides stays green under
rebalance because threat-rebalance's CA-20 pins the recorded losing fixture
(−0.6 aim / paddle 80) as still losing at depth 1.

Inherited, non-blocking records with dispositions in the reconciliation above:
rolled-params carrier, wall-hit carrier, glyph threading, lost-outcome-when-busy seam,
`listRouteSupport()` facade. Environmental hazards (narrow vitest form, fresh Playwright
port) are recorded in the Verification Baseline and bind every session gate.

## Handoff Notes (Orchestrator writes here after each session — from Coder's Handoff section, verbatim)

### SESSION-01 — done, checkpoint 5, 2026-09-25 (commits `8b4cc26`, `bb2c72a`, `dd3c88a`, `4421993`, `ec82a45`)

- **session:** 01
- **status:** done
- **checkpoint:** 5
- **notes:** CAP-14 (CA-16) producer complete: `terminalShardAward` + `SHARDS_PER_DEPTH`/`SHARDS_PER_BOSS` exported beside `battleCurrencyGrant` (`src/domain/run/reducer.ts`), applied in `deathTransition`, awarded in `proposalFromInstruction` (`profile.shards += summary.shardsEarned`), published by the finalize handler; browser proof remains S03-CP2. CAP-17 (CA-17) producer complete: `bossesReached` at boss-room CommitRoute, `bossesDefeated` at boss clear, once-only via CA-02 ledger, unit rows landed; browser rows are S03's truthful zeros. CAP-16 (CA-18) pipeline complete: relics.ts content + `listRelics`/`getRelic` facade (CP1), `pendingRelicChoice` emission + `ResolveRelicChoice` transition (CP2), required `resolveRelicChoice` repository capability (CP3), `terminal/resolve-relic` + handler + `terminalRecord` publish (CP4). Producer contribution ≠ proven capability: S02 (screen) and S03 (browser through real transport) are the named integration owners.
- **delivered:** Terminal Shards economy (20/depth + 50/boss, visible pure function, once-only via inherited CA-14 retry rules — verified `finalizeRetryIssue` unchanged and retried-finalize rows still reject with the profile untouched); boss progress counter producers; authored relic registry (3 relics, mock-verbatim copy, `registerKnownId` kebab rule); pending-relic emission + one-time `ResolveRelicChoice` (choose = unlock+equip in ONE profile mutation, replace-previous one-slot; decline = pending cleared, `relicState` untouched); `resolveRelicChoice` one-transaction repository capability; `terminal/resolve-relic` app command + fail-closed handler + transient `terminalRecord { isRecord, priorRecordDepth }`; CA-19 consumed only through that published shape; StartRun carry-over consumption proven with the freshly equipped relic (`build.carryOverRelicId` + `parseRunStateRecords` accept).
- **verification:** narrow `npx vitest run <paths>` at every checkpoint, counts read in both directions (CP1: 2 files/32; CP2: 2 files/112; CP3: 4 files/118; CP4: 2 files/63; CP5 `npm run verify` exit 0 — lint 0 errors + the 1 pre-existing RouteMapScreen react-refresh warning, count unchanged; typecheck 0; unit **649 tests / 31 files** vs baseline 607/30 — +41 tests +1 file (`relics.test.ts`), counted exactly; build 171 modules (baseline 170 — relics.ts enters the graph), new bundle `index-Cdgno3dD.js` 472.64 kB, CSS hash unchanged `index-BYhadsZB.css`). CA-16 boundaries: depth1/0-boss=20, depth8/2-boss=260, depth8/3-boss=310, repository adds exactly once (`profile.shards = stored+20`), retried finalize rejected with `profile.shards` unchanged. CA-17 boundaries: boss commit +1 exactly once, boss clear +1 exactly once with replay rejected, non-boss no-op, `parseLivingRunRecord` round-trip. CA-18 boundaries: strict-schema round-trip accept + rider-field reject through `parseProfileRecord`, double-resolve rejected with zero durable change, resolve-after-decline rejected (forged instruction fails closed), stale revision rejected, `unequipped-relic`/`relic-locked` coherence via `validateProfile`/`parseRunStateRecords`. Zero `Math.random`/`Date.now`/`performance.now` in domain/persistence changes (grep = 0). Orchestrator re-executed at receive: typecheck 0, lint 0 errors + 1 pre-existing warning, 649/31, build 171 modules `index-Cdgno3dD.js` 472.64 kB (hash matches).
- **surprises:** (1) **Preflight drift:** the envelope claimed "exactly TWO exhaustive `RunLifecycleRepository` literal fixtures" — there is a **third**: `appStore.test.ts:55` `repositoryFor()` is a fully-typed `RunLifecycleRepository` literal. It is in-lease, so all THREE gained `resolveRelicChoice` in the same CP3 commit as the interface change (B-4 lesson held; `needsOwnerCorrection` none). (2) `runRejectionMessage` cases for the two new rejection codes landed at **CP2** (with the codes), not CP4 as the session sketch assumed — `runRejectionMessage`'s exhaustive switch makes the split un-typecheckable; behavior identical. (3) The CA-13 boss-clear fixture (combat.test.ts ~:950) built a boss room directly without `CommitRoute`, leaving `bossesReached: 0` — the new `bossesDefeated` increment tripped `bossesDefeated ≤ bossesReached` on `parseLivingRunRecord`; fixed by reflecting the committed route in the fixture (`bossesReached: 1`). Same latent hazard exists in `appStore.test.ts`'s `bossesDefeated`-zero rows but they only assert currency, so they pass unchanged. (4) `runInRoomPhase`-style fixtures at depth 3 need materialize→select→commit (initial route offers are empty); my CA-17 rows drive the full route. (5) e2e `run-lifecycle.spec.ts:961` (`shardsEarned` 0→20) is S03's file, untouched per lease. (6) Test-authoring error caught in self-review: my first "survives the summary" draft asserted a fabricated rejection of a well-formed deeper loss; replaced with a valid depth-4 route-phase terminal that proves the counters survive — the fabricated case was deleted, not weakened.
- **followUp:** **S02** consumes: `AppState.terminalRecord: { isRecord: boolean; priorRecordDepth: number } | null`; `AppCommand { type: "terminal/resolve-relic"; relicId: ContentId | null }`; pending gate = persisted `profile.pendingRelicChoice !== null && selectedId === null`; relics resolve via `catalog.listRelics()`/`getRelic()` (`displayName`, `cappedDescription`); save signals: `"Run lost. +20 shards banked to the archive."`, `"Backfeed Cell equipped for the next run."` (catalog-resolved), `"Relic choice declined."`; `runRejectionMessage` messages for `no-pending-relic-choice`/`unknown-relic-choice` are landed. **S03**: death journey's final reload expectation moves from archive to the terminal screen (Design Decision 6), decline path returns to archive; IndexedDB reads: `profile.shards` (+20), `lastRunSummary.shardsEarned` (20), `pendingRelicChoice.selectedId/commitId`, `unlocks.relicIds`, `relicState.equippedForNextRunId`, next run `build.carryOverRelicId === "relic-backfeed-cell"`; boss counters will read truthful zeros on the reachable depth-1 path (`bossesDefeated > 0` is B-3/threat-rebalance territory, recorded in CAP-17 — not this feature's defect). **Orchestrator:** CA-16/17/18 producer rows are ready for recheck; CA-19 producer is S02's.
- **needsOwnerCorrection:** — (all stale fixtures and all three exhaustive repository fixtures were in-lease; nothing outside the lease was touched or needed)
- **needsDesignSource:** — (`mocks/run-summary.html` read for relic copy; screen itself is S02's)
- **blockedReason:** —
- **filesTouched:** `src/domain/content/relics.ts`, `src/domain/content/relics.test.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/run/reducer.ts`, `src/domain/run/commands.ts`, `src/domain/run/validation.ts`, `src/domain/run/combat.test.ts`, `src/domain/run/lifecycle.test.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/app/App.test.tsx`.
