# State Tracker — Shard Breaker / combat-engine

## Program / Feature / Intent / Sessions

- **Program:** Shard Breaker (`shard-breaker`)
- **Feature:** combat-engine
- **Intent:** Build the deterministic combat domain, the real-time browser bridge, and the
  combat/boss room UI so a player can fight battle/elite/boss rooms with build-driven
  effects, earn run currency from clears, die irreversibly at zero Integrity, and prove the
  whole loop in the browser — replacing the "combat engine coming soon" placeholder and
  closing the recorded `runCurrency`-producer boundary from room-resolution.
- **Sessions:** 7

**Inherited work reconciliation (inspected 2026-09-23 at `230cf20`):** room-resolution
FINAL-REPORT.md + prompts/room-resolution/STATE.md + .program/ledger.md +
.program/blockers.md were read in full. Every open item carries a disposition:
- **Combat feature owns the `runCurrency` producer** (CAP-02 boundary) → owned here by
  SESSION-07 (CA-13).
- **All-duplicate-draft dead-end** (Planner-owned product question) → **resolved by approved
  design, no code change**: FR-9 and `mocks/rewards.html` prescribe replace-earliest on a
  full build side, and the committed `SelectReward` implements replacement including
  duplicate items — a draft whose every card duplicates held items still advances by
  replacement; no dead-end exists. S02 records this disposition in its State Update.
- **Combat placeholder replacement** (S03 follow-up) → SESSION-04.
- **`listRouteSupport()` facade follow-up** (Archivist) → carried unchanged; S04 keeps the
  existing `ROUTE_SUPPORT_DEFINITIONS` read pattern (already-declared M06→M01 edge).
- **Archivist standing recommendations** (dual numbering, fragment orphan rows,
  prompt-vs-spec contradictions, arch verification overstatement, unreconciled deep files,
  stale registry keys) → noted for Orchestrator's Archivist cadence; not implementation
  work. This plan's prompts were written to avoid the prompt-vs-spec contradiction pattern
  (view models derive from their own rendering specs; no self-contradicting steps).
- **E2e port-reuse flake class** → carried into every gate: fresh port per e2e invocation.
- **Inspection limitations:** `.program/` scratch (decisions.md, orchestrator
  conversation.md, sessions/) was read where present; the executed run records live in the
  committed FINAL-REPORT.md and prompts/room-resolution/STATE.md, which are authoritative.

## Session Status

| # | Session | Modules | Owns | Status | Checkpoint | Completed | Notes |
|---|---------|---------|------|--------|------------|-----------|-------|
| 01 | Combat content and deterministic combat core | M01, M09 | `src/domain/content/enemies.ts`, `src/domain/content/enemies.test.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/combat/model.ts`, `src/domain/combat/layout.ts`, `src/domain/combat/rules.ts`, `src/domain/combat/results.ts`, `src/domain/combat/combat.test.ts` | done | 4/4 | 2026-09-23 | Enemy content, catalog lookups, combat model/layout/rules; CA-01 checkpoint fidelity proof at CP2. |
| 02 | Build effects and combat integration into the run domain | M09, M03, M02, M06 | `src/domain/combat/effects.ts`, `src/domain/combat/effects.test.ts`, `src/domain/combat/rules.ts`, `src/domain/run/combat.test.ts`, `src/domain/run/commands.ts`, `src/domain/run/model.ts`, `src/domain/run/reducer.ts`, `src/domain/run/validation.ts`, `src/domain/random/generators.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts` | done | 4/4 | 2026-09-23 | Effects resolver; LaunchBall/UseSkill/ReportCombatOutcome run+app commands with store handlers; generator checkpoint emission (CA-03); two out-of-lease stale fixtures left RED pending Orchestrator owner repair (see Current Blockers). |
| 03 | Combat session bridge, fixed-step engine, and input | M10 | `src/game/engine.ts`, `src/game/engine.test.ts`, `src/game/input.ts`, `src/game/input.test.ts`, `src/game/session.ts`, `src/game/session.test.ts`, `src/game/renderer.ts`, `src/game/renderer.test.ts` | pending | — | — | rAF fixed-step engine, pointer input, ephemeral session, Canvas renderer, exactly-once outcome bridge (CA-05/06). |
| 04 | Arena host, combat room UI, and screen composition | M10 (Arena host), M08, M07 | `src/game/Arena.tsx`, `src/game/Arena.test.tsx`, `src/ui/screens/CombatScreen.tsx`, `src/ui/screens/CombatScreen.test.tsx`, `src/ui/components/TelegraphBanner.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/ui/screens/RoomScreen.tsx`, `src/ui/screens/RoomScreen.test.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts`, `src/styles/global.css`, `src/styles/responsive.css` | pending | — | — | Arena host + CombatScreen replacing the placeholder; RoomScreen combat-branch removal; `deriveScreen` combat branch; CA-07 explicit launch, CA-08 non-color states. |
| 05 | Boss content, boss rules, and boss room UI | M01, M09, M07, M06 | `src/domain/content/bosses.ts`, `src/domain/content/bosses.test.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/combat/bossState.ts`, `src/domain/combat/bossState.test.ts`, `src/domain/combat/combat.test.ts`, `src/ui/screens/BossScreen.tsx`, `src/ui/screens/BossScreen.test.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts` | pending | — | — | Boss archetypes with phases/telegraphs/counterplay/modifiers; boss phase machine; BossScreen. Shares `catalog.ts`/`combat.test.ts` with S01 — serialized by dependency order. |
| 06 | Boss modifier generation and threat composition | M02, M09 | `src/domain/random/generators.ts`, `src/domain/random/generators.test.ts`, `src/domain/combat/bossState.ts`, `src/domain/combat/bossState.test.ts`, `src/domain/combat/layout.ts`, `src/domain/combat/layout.test.ts` | pending | — | — | Seeded compatible modifier selection (cycle ≥ 2, ≤ 2, capped); failure-closed application (CA-11/12). |
| 07 | Currency producer, death terminal, and browser journeys | M03, M06, M07, M04 (terminal seam), M08 | `src/domain/run/reducer.ts`, `src/domain/run/combat.test.ts`, `src/domain/run/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/ui/screens/CombatScreen.tsx`, `src/ui/screens/CombatScreen.test.tsx`, `src/ui/screens/BossScreen.tsx`, `src/ui/screens/BossScreen.test.tsx`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/repositories.test.ts` | pending | — | — | `runCurrency` grant (closes CAP-02 boundary), `finalize-death` atomic terminal, full browser journeys. Persistence paths are in-lease solely for the CA-14 terminal transaction. |

## Wave Plan

| Wave | Sessions | Why concurrent |
|------|----------|----------------|
| 1 | 01 | Combat core + content; every later session reads it. |
| 2 | 02 | Consumes S01's model/rules API; makes rooms playable at the reducer and wires the app command surface. |
| 3 | 03 | Consumes S01 rules + S02 command surface. |
| 4 | 04 | Consumes S02 (data + commands) and S03 (bridge) — first browser-visible combat. |
| 5 | 05 | Consumes S01/S02/S04 (boss machine composes the arena; BossScreen reuses TelegraphBanner). Shares `catalog.ts`/`combat.test.ts` with S01 — already serialized. |
| 6 | 06 | Consumes S05's boss content/state machine and S02's generator seam (`generators.ts` shared with S02 — already serialized). |
| 7 | 07 | Consumes S02–S06; lands economy, terminal, and the browser journeys. |

Linear plan — every session consumes the previous wave's committed public API; the only
file-sharing pairs (S01/S05 on `catalog.ts` + `combat.test.ts`; S02/S06 on `generators.ts`
and `bossState.ts`; S02/S07 on app store + combat test; S04/S05 on app/navigation; S04/S07
on screens) are all serialized by the dependency order. No concurrent pairs; no overlapping
concurrent leases.

## Dependency Graph

```
S01 ──► S02 ──► S03 ──► S04 ──► S05 ──► S06 ──► S07
        (S05 also depends on S01/S02; S07 depends on S02–S06)
```

## Architecture Reference (feature-specific only; full config in PROGRAM-CONFIG)

Functional core / imperative shell. This feature adds two new modules: `src/domain/combat/`
(registry M09; deep-file M04 contract) — pure deterministic simulation: model/layout/rules/
results/effects/bossState; and `src/game/` (registry M10; deep-file M06 contract) —
engine/input/session/renderer/Arena. Dependency direction: content/random → combat → run
domain (M03 imports combat outcomes), app → combat+game (composition), ui → game (Arena
host). Run commands (`LaunchBall`, `UseSkill`, `ReportCombatOutcome`) are serializable;
frames are never persisted. Durable checkpoints: room entry (S02 generator emission),
loss-of-ball (restore pre-launch checkpoint), clear (enables resolve), death (terminal
finalization, one transaction). The persisted `CombatCheckpoint` shape already exists in
`src/domain/run/model.ts` and `src/persistence/validation.ts` (`combatCheckpointSchema`,
≤512 enemies, ≤128 hazards, ≤3 skill charges, unique instance IDs) — sessions must
round-trip it, never widen it silently.

## Scope Summary (modules affected, indexed by ID)

| ID | Module | Affected | Reason |
|----|--------|----------|--------|
| M01 | Authored content | Modified (S01, S05) | `enemies.ts` new; `bosses.ts` extended; catalog lookups. |
| M02 | Seeded generation | Modified (S02, S06) | Room-candidate combat checkpoints; boss modifier selection. |
| M03 | Run domain | Modified (S02, S07) | Combat commands/transitions, currency grant, death terminal. |
| M04 | Persistence | Modified (S07, scoped) | `finalizeDeath` extension only; no schema/migration change. |
| M05 | Immutable migration | Untouched | `CombatCheckpoint` shapes already validated by migration-001-era schemas. |
| M06 | Application orchestration | Modified (S02, S04, S05, S07) | S02: combat app commands + store handlers; S04/S05: combat/boss branches + model builders; S07: finalization handler. |
| M07 | React UI and styles | Modified (S04, S05, S07) | Combat/Boss screens, TelegraphBanner, styles. |
| M08 | Browser composition and acceptance | Modified (S07) | Combat/boss/death journeys + IndexedDB reader extension. |
| M09 | Combat domain | Created (S01, S02, S05, S06) | `src/domain/combat/` — new module. |
| M10 | Game bridge (incl. Arena host) | Created (S03, S04) | `src/game/` — new module. |

No Author artifact (`specs/`, `mocks/`) is modified. Migration 001 is untouched.

## Design Decisions (choice + rationale)

1. **Seven sessions, linear.** The combat stack is one capability chain (content → sim →
   bridge → UI → boss → modifiers → economy/terminal/proof); each wave consumes the
   previous wave's committed public API, so no concurrent pairs. The splits are real
   dependencies, not file separation: S01/S02 split at the simulation↔reducer contract;
   S03 exists because the bridge is a distinct module with its own test surface;
   S04/S05 split boss UI from generic combat UI (boss needs the arena host to exist);
   S07 owns economy+terminal+journeys because they prove one integrated behavior.
2. **Combat lives in two new modules per the pre-existing Author architecture**
   (`specs/architecture.md` module tree; deep arch files M04/M06): `src/domain/combat/`
   (pure, deterministic, DOM-free) and `src/game/` (bridge, imperative). Nothing is
   re-decided; the registry rows (M09/M10) formalize it.
3. **The persisted `CombatCheckpoint` shape is fixed by migration-001-era schemas** — S01
   builds to it; no new durable top-level shapes except `finalize-death`'s instruction
   payload (which reuses the committed `RunSummarySnapshot`).
4. **Battle/elite clear grants `runCurrency`; boss does not.** Visible-contract derivation:
   route cards promise "standard draft and run currency" for battle and "elite draft" for
   elite; the boss draft is the boss's reward (FR-7). Amounts specified in CA-13.
5. **Death finalization is minimal-honest.** FR-1 requires death to finalize and remove the
   run irreversibly; FR-13's full summary screen + Shards economy + relic choice are the
   next feature. S07 lands the durable terminal (records, `lastRunSummary`,
   `lastFinalizedRunId`, one transaction) with archive-screen feedback via existing profile
   fields. The summary screen is the next feature's entry point.
6. **All-duplicate-draft question resolved by approved design.** FR-9 + `mocks/rewards.html`
   prescribe replace-earliest including duplicates; the committed reducer already implements
   it. Disposition recorded; no code change; no re-planning.
7. **Boss modifiers are content-gated and capped, generated in M02, applied in M09.**
   Compatibility comes from authored `compatibleArchetypeIds`; caps from ≤2 per room and
   the "at least one viable response remains" assertion in S05/S06 tests.
8. **`combat-not-implemented` keeps its code name** but narrows after S02: it rejects
   combat resolution *without a recorded clear outcome* ("clear first") and remains the
   fail-closed guard.
9. **S07's persistence seam is a sanctioned scoped lease addition** (envelopes +
   repositories + their tests) because the terminal transaction is assigned to the
   persistence layer by database.md and cannot exist in any other file set. Recorded so the
   Archivist reconciles M04's fragment.
10. **S02 owns the app command surface** (`src/app/commands.ts`, `appStore.ts`) because the
    store handlers are the integration proof of the domain transitions (contract-change
    rule: producer and consumers pass together); S04/S07 modify the same files only after
    S02's lease closes (serialized waves).

## Verification Baseline

| Gate | Command | Scope | Evidence | Status |
|------|---------|-------|----------|--------|
| Lint | `npm run lint` | ESLint + Stylelint | Re-executed at replan (2026-09-23, tree at `230cf20`): exit 0, 1 pre-existing react-refresh warning (RouteMapScreen.tsx `createRouteMapScreenModel` export alongside the component). Leave it; record if the count changes. | verified |
| Types | `npm run typecheck` | `tsc -b --pretty false` | Re-executed at replan (`230cf20`): exit 0. | verified |
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)` | Baseline at replan (`230cf20`): 329 passed / 16 files. After S01: 366/18 (Orchestrator-verified). After S02: 424 passed / 426 with exactly the 2 pre-declared out-of-lease stale fixture failures (`generators.test.ts` candidate-shapes row; `route.test.ts:347` combatCheckpoint null assertion) — owned by the Orchestrator owner repair, recorded in Current Blockers. **Recorded hazard: `npm run test:unit -- <patterns>` does not filter — use `npx vitest run <paths>` with file counts read in both directions.** | verified-with-known-red |
| Production build | `npm run build` | Typecheck + Vite output in `dist/` | Re-executed at replan: exit 0, 155 modules. After S01: 156 modules, `index-CV0HohlA.js` 404.87 kB. After S02 (Orchestrator re-executed): exit 0, 161 modules, `index-JyMBokRN.js` 422.90 kB, CSS unchanged. Rollup comment-position warnings from `node_modules/zod/v4/core/*` are upstream noise, not product defects. | verified |
| Standard local gate | `npm run verify` | Lint + types + unit + build | S02's CP4: exit 0 with the 2 known stale fixtures excluded per session record; full-suite green pending the owner repair below. | verified-with-known-red |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | `tests/e2e/run-lifecycle.spec.ts` | Inherited verified record: 15/15 at room-resolution close (Orchestrator re-execution on port 8082; Playwright 1.62.1 + chromium-1234 installed). **Flake class: use a fresh port per invocation** — port reuse seconds after a prior Vite kill produced save-signal/strict-order flakes; deterministic green on a clean port. `webServer.reuseExistingServer` is disabled when PLAYWRIGHT_PORT is set; Orchestrator assigns one free port per session slot. | verified (inherited) |

**Baseline hazards:** (1) narrow vitest form required for filtering; (2) RouteMapScreen
react-refresh warning is pre-existing — do not "fix" by moving `createRouteMapScreenModel`
(public API consumed by `App.tsx` and its tests); (3) fresh Playwright port per e2e run;
(4) e2e must assert via IndexedDB reads + reload, not rendered copy alone (Custom Rule);
(5) firefox/webkit/mobile Playwright projects exist in config but are NOT part of the
recorded baseline — do not silently extend acceptance scope.

## Capability Readiness

| ID | Approved behavior / entry point | Required facts + producer owners | CA IDs / prerequisites | Integration owner / checkpoint | Status | Proof / checked sources | Open gaps + correction owners |
|----|--------------------------------|---------------------------------|------------------------|--------------------------------|--------|-------------------------|-------------------------------|
| CAP-01 | Authored enemies with distinct behaviors + catalog lookups. Entry: `catalog.listEnemies/getEnemy`. | `EnemyDefinition` set — S01-CP1. | CA-01 | S03-CP2 (layout consumed at room entry) | producer complete (S01); integration planned | S01-CP1: 2 files/27 tests exit 0; committed `108f928`; Orchestrator re-confirmed in the whole-suite receive run. | Integration proof (S03-CP2) remains planned with its owner. |
| CAP-02 | Deterministic arena simulation: aim/launch/paddle, brick damage/defeat, hazards, loss/clear outcomes, fixed-step determinism. Entry: `createCombatState`/`stepCombat` in `src/domain/combat/`. | Threat numbers from `ThreatProfileSnapshot` (committed producer `generateThreatProfile`); enemy data (CAP-01); stream keys from room `eventKey`. | CA-01, CA-02 | S02-CP2 (reducer consumes outcomes), S04-CP3 (live) | producer complete (S01); **reducer consumption landed (S02-CP2)**; live arena planned | S01-CP2/CP3 proofs + S02-CP2 reducer proofs (28 combat.test.ts tests; loss decrements exactly 1; rebuildable checkpoint; duplicate/foreign outcome rejection). Committed `f4f6c76` + `30f1f0c`. | Live arena proof (S04-CP3) remains planned with its owner. |
| CAP-03 | Build-driven effects: skills/equipment/enhancement `effectKey`s map to simulation modifiers. Entry: `resolveEffects` in `src/domain/combat/effects.ts`. | Effect keys — committed catalog (`enhancements.ts`, `skills.ts`, `equipment.ts`); rolled params — committed `RewardCardSnapshot`; build — committed `BuildSnapshot`. | CA-01 | S02-CP1 (resolver), S02-CP2/CP3 (commands consume), S04 (display) | **producer complete (S02-CP1)**; consumption landed (rules hooks); display planned | S02-CP1: effects.test.ts 26 tests + combat.test.ts 29 tests exit 0; committed `456814b`. Effect-key mapping recorded (haste presentational-only; overclock → speed factor). | `rolledParams` durable carrier missing post-SelectReward (room-resolution deferral) — tracked to S07/CA-13 planning; resolver consumes empty params, never invents. Display homes for presentational-only keys owned by S04. |
| CAP-04 | Combat room lifecycle at run level: launch/skill/outcome commands; loss = −1 Integrity + pre-launch checkpoint; clear enables resolve → existing reward flow. Entry: `combat/launch` etc. app commands → reducer → `saveCheckpoint`. | `combatCheckpoint` — emitted by S02's generator change (CA-03); outcomes — S01 identity format (CA-02). | CA-01..04 | S02-CP2/CP3; browser S07-CP4 | **full behavior landed (S02-CP2/CP3)**; browser planned | CA-02/03/04 proofs in combat.test.ts (28 tests) + appStore.test.ts handler tests; committed `f4f6c76`, `cb98586`. CA-04 interim state documented (integrity-1 loss commits at 0, room open; loss-at-0 rejected). | Browser proof S07-CP4 planned. Loss-at-0 finalization replaces the interim rejection at S07-CP2. |
| CAP-05 | Real-time bridge: fixed-step engine, pointer input, ephemeral session, renderer, exactly-once outcome dispatch. Entry: `createGameSession` in `src/game/session.ts`. | `stepCombat` (CAP-02); app command surface (CAP-04). | CA-05, CA-06 | S04-CP1/2 (Arena consumes), S07-CP4 (browser) | planned | — | — |
| CAP-06 | Combat room screen: arena + decision rail, explicit launch, DOM charges/integrity/telegraph, clear enables advance. Entry: `deriveScreen` → `room-combat`. | Arena/session APIs (CAP-05); combat model data (CAP-04); catalog display fields (committed). | CA-07, CA-08 | S04-CP3; browser S07-CP4 | planned | — | — |
| CAP-07 | `Arena` component: Canvas host, accessible controls, status line. Entry: `src/game/Arena.tsx`. | Session/RenderSnapshot (CAP-05). | CA-07 | S04-CP2 | planned | — | — |
| CAP-08 | Boss combat rules: phases, telegraphs, counters, capped modifier application. Entry: `src/domain/combat/bossState.ts`. | `BossDefinition` content (S05-CP1); threat `bossModifierIds` (CAP-10). | CA-09, CA-10, CA-12 | S06-CP2 (modifiers wired), S07-CP4 (browser) | planned | — | — |
| CAP-09 | Boss room screen: identity card, phase steps, telegraph banner, modifier chips, defeat enables advance. Entry: `BossScreen`. | Boss content (S05); Arena (S04); `roomState.boss` (committed generator shape). | CA-10 | S05-CP3; browser S07-CP4 | planned | — | — |
| CAP-10 | Seeded boss modifier selection: cycle ≥ 2, ≤ 2, archetype-compatible. Entry: `generateBossState` in `generators.ts`. | Boss `compatibleModifiers` (S05 content); `THREAT_LIMITS` semantics (committed). | CA-11 | S06-CP1; boss journey S07-CP4 (depth 3 = cycle 1 asserts empty modifiers) | planned | — | — |
| CAP-11 | Battle/elite currency grant: clear grants seeded `runCurrency` exactly once, durable. Entry: `ReportCombatOutcome` clear branch. | Outcome ledger (CA-02); stream key `battle-currency` (CA-13). | CA-02, CA-13 | S07-CP1 (reducer/store); S07-CP4 (browser, closes the recorded room-resolution CAP-02 boundary) | planned | — | Closes the recorded boundary. |
| CAP-12 | Death terminal: loss at 1 integrity finalizes the run irreversibly (summary + records + living-run deletion in one transaction). Entry: `finalize-death` instruction → repository finalization. | `RunSummarySnapshot` shape (committed model + `runSummarySchema`); one-transaction pattern per database.md. | CA-14 | S07-CP2 (reducer/store/repo); S07-CP4 (browser death journey) | planned | — | Full summary screen + Shards economy = next feature's entry point. |
| CAP-13 | Browser journeys: battle→currency→shop affordable; loss→reload→checkpoint; boss at depth 3; death. Entry: `tests/e2e/run-lifecycle.spec.ts` combat block. | All producers above committed before S07 dispatch. | CA-13, CA-14, CA-15 | S07-CP4 | planned | — | — |

**First narrow journey (planned):** start → route battle → arena → aim/launch → clear →
currency granted (IndexedDB) → advance → draft → confirm → shop route at depth 2 → a Buy
control is affordable → reload preserves everything. This crosses the real transport
(pointer → input → engine → combat domain → outcome command → reducer → repository →
IndexedDB → reload). Proven at S07-CP4; every earlier "verified" row above is producer or
component level only, never product parity.

## Contract Agreements

| ID | Required meaning / authority | Producer → boundary → consumer | Mapping / constraints | Correction + proof owners / checkpoints | Agreement | Producer | Proof / evidence / checked sources |
|----|------------------------------|--------------------------------|-----------------------|----------------------------------------|-----------|----------|------------------------------------|
| CA-01 | Combat checkpoints persist exactly as `combatCheckpointSchema` accepts (kind pre_launch/loss_of_ball; paddleX/aimAngle bounded reals; ballAttached true; ≤512 enemies with unique instanceIds; ≤128 hazards with telegraph/active/resolved; ≤3 skill charges with remaining ≤ maximum). | S01 `toCombatCheckpoint` → `RoomState.combatCheckpoint` → S02 reducer writes → S03 session rebuild → S07 e2e IndexedDB assertions. | Field names mirror `CombatEnemySnapshot`/`HazardStateSnapshot`/`SkillChargeSnapshot` in `src/domain/run/model.ts`; `bossState: null` until S05; frozen outputs. Note (S01): schema validates IDs as bounded unique strings, not catalog membership — domain-level coherence enforced in S02's validation rules. | S01-CP2 (producer proof), S02-CP1/CP2 (generator emission + reducer acceptance), S03-CP3 (rebuild), S07-CP4 (browser). | agreed | **done** — producer S01-CP2 `0577290`; consumer S02-CP1/CP2 `456814b`/`f4f6c76` | Producer proof: `parseLivingRunRecord` accept + duplicate-ID reject (Orchestrator re-executed). Consumer proof: every reducer-accepted/persisted state asserted via `expectPersistableLivingRun`; generator emission asserts schema acceptance + catalog-membership provenance. Remaining: S03-CP3 rebuild, S07-CP4 browser. |
| CA-02 | Outcomes are room-scoped, accepted at most once: `OutcomeId = <roomEventKey>:outcome:<kind>:<index>` (index = prior same-kind count in this room). | S01 `results.ts` (identity) → S02 `ReportCombatOutcome` (ledger in `processedOutcomeIds`) → S03 session (dedupe) → S07 e2e. | Foreign-room IDs rejected (`unknown-outcome-id`); duplicates rejected (`duplicate-outcome-id`); the ledger persists with the room. Per-kind independent indexing (S02). | S01-CP3 (format), S02-CP2 (validator), S03-CP3 (dedupe), S07-CP1 (grant-once proof). | agreed | **done** through validator — S01-CP3 `229680f` (producer), S02-CP2 `f4f6c76` (validator) | Validator proof: duplicate/foreign/next-index acceptance + per-kind independent indexing + room-scope ledger uniqueness (validation.ts + schema). Remaining: S03 session dedupe, S07 grant-once. |
| CA-03 | Combat room entry persists a real checkpoint: `generateRoomCandidate` emits `toCombatCheckpoint(createCombatState(...))` for battle/elite/boss from `ThreatProfileSnapshot`; utility rooms keep null; validation enforces coherence. | S02 generator change → `RoomState.combatCheckpoint` → S03 session init → S04 arena. | Stream keys deterministic `(seed, contentVersion, eventKey)`; boss rooms keep the `boss` routing state (plain formation this feature). Context mapping verified at S02-CP1: `combatContextFor`/generator supply {seed, contentVersion, roomId, eventKey, formationId, density, durabilityFactor, lossCount: 0, hazardIds}; boss rooms keep `boss` routing state. | S02-CP1 (producer+proof), S02-CP2 (validation rules). | agreed (**provisional → verified at S02-CP1**) | **done** — S02-CP1, commit `456814b` | Orchestrator recheck executed at receive: committed `generateRoomCandidate` emits `toCombatCheckpoint(createCombatState(...))` for battle/elite/boss (visible in the generators.test.ts failure output: 6 enemies, 1 hazard, pre_launch, paddleX 80, instance IDs derived from the room event key); utility rooms keep null; validation coherence in `validation.ts`. Two stale fixture assertions RED pending owner repair (see Current Blockers). Provisional status lifted; S03/S04 dispatch unblocked. |
| CA-04 | Loss-of-ball decrements `integrityCurrent` by exactly 1 per accepted outcome and restores a valid pre-launch checkpoint; reaching 0 is the death boundary (finalization = CAP-12, S07). | S02 reducer loss branch → `LivingRun.integrityCurrent` → S07 finalization. | At 0 before S07: the loss outcome still commits, the room stays open in pre-launch — an interim state, documented by S02 (loss at integrity 1 → commits with integrity 0; loss at 0 rejected `invalid-state`); no fabricated success. | S02-CP2 (−1 proof), S07-CP2 (0-boundary finalization). | agreed | **done** — S02-CP2, commit `f4f6c76` | Reducer tests: exactly-1 decrement, rebuildable loss checkpoint carrying the advanced loss count, loss-at-0 rejection with no durable change. Browser journey at S07-CP4 remains planned. |
| CA-05 | The bridge dispatches each outcome exactly once across re-entries/refreshes. | S03 `createGameSession` → `combat/report-outcome` → S02 store handler. | Session-level dedupe keyed by outcome ID; the reducer ledger is the second guard. | S03-CP3 (session tests incl. re-entry). | agreed | planned | Planned. |
| CA-06 | A session rebuilt from a checkpoint replays the same simulation trace (fixed-step equivalence across the rebuild boundary). | S03 session init from checkpoint → `stepCombat` trace. | Deterministic streams only; no wall-clock. | S03-CP3 (equivalence test). | agreed | planned | Planned. |
| CA-07 | Launch is explicit: only the launch control dispatches `combat/launch`; pointer movement aims/moves only; 44px targets; semantic button name ("Launch ball"). | S04 `Arena` launch control → app command → S02 reducer (aim validation ±π/3). | Disabled while busy / not pre-launch. | S04-CP2 (component tests), S07-CP4 (browser). | agreed | planned | Planned. |
| CA-08 | State is never color-only: loss/clear/telegraph change text + border + icon/pattern together; reduced-motion keeps static text. | S04 screens/banners → S07 e2e DOM assertions. | Telegraph text includes name + countdown + counterplay (mocks contract). | S04-CP3, S05-CP3, S07-CP4. | agreed | planned | Planned. |
| CA-09 | Boss content extends routing without breaking it: `listBosses()` entries keep `id/displayName/identityLabel`; `generateBossState` shape unchanged. | S05 `bosses.ts` → `catalog.getBoss` → S06 modifier selection. | Additive fields only; recheck `generateBossState` consumers at CP0. | S05-CP1 (compat proof via `generators.test.ts` unchanged). | agreed | planned | Planned. |
| CA-10 | Telegraphs are DOM content (name + countdown + counterplay), never canvas-only or color-only. | S05 boss machine → `BossScreen`/TelegraphBanner. | Countdown text is step-derived (deterministic), not animation-dependent. | S05-CP2/CP3. | agreed | planned | Planned. |
| CA-11 | Modifier selection: cycle ≥ 2 only, ≤ 2, archetype-compatible, stream `<roomEventKey>:boss-modifiers`; `boss.modifierIds` authoritative; `threatProfile.bossModifierIds` display projection. | S06 generator change → `RoomState.boss`/`threatProfile` → S05 machine application. | Emitted shapes unchanged; cycle 1 empty. | S06-CP1 (generator tests), S06-CP2 (application). | agreed (provisional against S06-CP1) | planned | Provisional-producer note: re-check at S06-CP1 before the S07 boss journey. |
| CA-12 | Unknown modifier IDs fail closed (ignored + bounded diagnostic), never throw mid-volley. | S06 `bossState.ts` application registry. | Stored/imported data treated as untrusted. | S06-CP2. | agreed | planned | Planned. |
| CA-13 | Clear of battle/elite grants seeded `runCurrency` exactly once (stream `<roomEventKey>:battle-currency`); battle 15–60 + 2×depth (cap +32); elite strictly greater range; boss grants 0. | S07 reducer clear branch → `LivingRun.runCurrency` → shop affordability → S07 e2e. | Grant in the same transition as the outcome (ledger-guaranteed once). | S07-CP1 (unit), S07-CP4 (browser affordable buy). | agreed | planned | Planned. Closes the recorded room-resolution CAP-02 boundary. Also owns the rolled-params durable carrier (S02 swap point `ROLLED_PARAMS_CARRIER_LANDING`). |
| CA-14 | Death: a loss at `integrityCurrent − 1 === 0` emits `finalize-death`; the repository updates the profile (records, `lastRunSummary`, `lastFinalizedRunId`) and deletes `livingRun` in ONE transaction; retry finds no living run and rejects without double-award. | S07 reducer → `finalize-death` instruction → repository `finalizeDeath` → validated profile + deleted run. | Reuses the committed `RunSummarySnapshot`/`runSummarySchema`; `shardsEarned: 0` (Shards economy = next feature); record rule: `highestReachedDepth = max(current, depth)` via committed floor entry. Replaces S02's interim rejection at integrity 0. | S07-CP2 (reducer + repo + store proofs). | agreed | planned | Planned. |
| CA-15 | Reload rules: after loss (integrity > 0) reload+resume returns phase room + pre-launch checkpoint, integrity decremented once; after death reload shows archive, no living run, summary recorded. | S07 e2e via `readShardbreakState` + reload. | Journeys assert IndexedDB, not rendered copy (Custom Rule). | S07-CP4. | agreed | planned | Planned. |

## Current Blockers

**B-1 (auto-clearing, owner repair assigned):** S02's authorized CA-03 generator change
invalidated two stale fixture assertions outside its lease:
`src/domain/random/generators.test.ts` (~line 399, "composes each route category…" row
asserts `combatCheckpoint: null`) and `src/domain/run/route.test.ts` (~line 347,
`expect(room.combatCheckpoint).toBeNull()`). Both now fail against the committed generator
(2 failed / 424 passing in the whole suite; Orchestrator re-executed). The repairs are
mechanical assertion updates (assert the new real `pre_launch` checkpoint / non-null) — no
behavioral assertions weakened. Orchestrator dispatches an owner-correction worker
(OWNER-TESTFIX-CA03) before dispatching SESSION-03, so the whole-suite gate is green before
dependent work starts. No human decision involved.

All other status: none. The room-resolution run closed clean; all inherited items carry
dispositions (see Inherited work reconciliation). CA-11 stays provisional against S06-CP1.
Environmental hazards (fresh Playwright port; narrow vitest form) are recorded in the
Verification Baseline and bind every session gate.

## Handoff Notes (Orchestrator writes here after each session — from Coder's Handoff section, verbatim)

### SESSION-01 — done, checkpoint 4, 2026-09-23 (commits `108f928`, `0577290`, `229680f`)

- **session:** 01
- **status:** done
- **checkpoint:** 4
- **notes:** M09 (`src/domain/combat/`) created — model/layout/rules/results; M01 extended with `EnemyDefinition` + 6 enemies and `listEnemies`/`getEnemy` facade (CAP-01, CAP-02 producer contributions complete; integration checkpoints S03-CP2/S04-CP3 remain future consumers). CA-01 producer proof landed at CP2: `combat.test.ts` builds a full `LivingRun` fixture (`roomState.combatCheckpoint` from `toCombatCheckpoint`) that `parseLivingRunRecord` accepts, and rejects the duplicate-`enemyInstanceId` mutation (schema verified against `src/persistence/validation.ts` `combatCheckpointSchema` at base `abca569`). CA-02 producer identity landed at CP3: `outcomeIdFor(eventKey, kind, index)` produces `<eventKey>:outcome:<kind>:<index>`; index = prior same-kind count, carried on `CombatState.losses` and seeded from `CombatInitContext.lossCount` (consumers S02/S03 derive it from the room's processed-loss ledger). Lease revision 1 used.
- **delivered:** `src/domain/content/enemies.ts` (+6 authored enemies with 4 distinct behaviors), `catalog.ts` enemy facade, `src/domain/combat/model.ts` (world constants, immutable state shapes), `layout.ts` (seeded grid materialization, `toCombatCheckpoint`/`fromCombatCheckpoint` round-trip with fail-closed layout verification), `rules.ts` (`stepCombat` fixed-step sim with substepped collision cascade walls→paddle→enemies→loss, `launchBall` explicit+clamped, `movePaddle`, loss/clear outcomes, phasing/regen/splinter behaviors, hazard telegraph→active→resolve), `results.ts` (CA-02 outcome identity), 65 new tests across `enemies.test.ts`/`catalog.test.ts`/`combat.test.ts`.
- **verification:** typecheck 0 at every checkpoint; CP1 narrow `npx vitest run src/domain/content/catalog.test.ts src/domain/content/enemies.test.ts` → 2 files/27 tests (no over-selection); CP2 narrow (combat+catalog) → 2 files/33 tests; CP3 narrow combat → 1 file/30 tests; CP4 `npm run verify` exit 0 → lint 0 errors + 1 pre-existing RouteMapScreen react-refresh warning (left untouched), 366 tests / 18 files (baseline 329/16 → +37/+2, exactly this session's additions), build 0 with 156 modules (`index-CV0HohlA.js` 404.87 kB; baseline 155 modules / `index-DFcVKeMJ.js` 403.46 kB — +1 module from combat entering the graph). CA-01 proof: `parseLivingRunRecord` accept + duplicate-ID reject, both asserted. Architecture compliance checked: combat imports only content (type-only) + `random/seededRng` + own files + `run/model` (type-only); persistence import exists only in the test file (the sanctioned `room.test.ts`-style edge); zero `Math.random`/`Date.now`/`performance.now`.
- **surprises:** (1) `npm run test:unit -- <patterns>` non-filtering hazard confirmed live; all narrow runs used `npx vitest run <paths>` with file+test counts read in both directions. (2) The committed `combatCheckpointSchema` is shape-level validation: enemy/hazard IDs and `threatProfile` references are bounded unique strings, not catalog-membership-checked — so CA-01's named mutate-reject case (duplicate `enemyInstanceId`) is proven, but a checkpoint with a syntactically valid unknown `enemyId` would also parse; catalog coherence for checkpoint enemies is a domain-level concern for S02's validation rules, recorded here per the no-invented-policy rule after my stricter negative control failed against the real schema. (3) `CombatInitContext` gained one field beyond the session sketch: `lossCount` (required so a rebuilt state can continue the room's CA-02 loss index); `CombatState` gained a durable `losses` counter beside `wallHits` for the same reason. (4) Hazard cap semantics mirrored as constants (`MAX_LAYOUT_ENEMIES=512`, `MAX_LAYOUT_HAZARDS=128`) rather than importing persistence (arch M04 forbids it); S02's generator change owns reconciling generator-emitted counts (`THREAT_LIMITS.maxHazards=2`) with these schema caps. (5) Combat deliberately does NOT import `random/generators.ts` (would invert the planned M02→M09 edge and cycle M02↔M09 via content); the session sketch's "THREAT_LIMITS semantics" reference is satisfied by mirrored constants. (6) Deviation from the session's `stepCombat(s,60)===chunked` sketch: chunking equivalence is proven on a live volley that does not end inside the test window (a volley that ends mid-chunk cannot be equal across boundaries — the shorter script stops at the outcome). (7) A transient untracked scratch script used for a failure trace was deleted; only in-lease files were ever written (verified per-commit via `git show --name-only`).
- **followUp:** S02: consume `createCombatState`/`stepCombat`/`launchBall`/`movePaddle` with `CombatInitContext` — `seed`/`contentVersion`/`lossCount` must come from the run/room (lossCount from `processedOutcomeIds` loss count); emit checkpoints at room entry via `toCombatCheckpoint(createCombatState(...))`; effect hook points left in `rules.ts`: `settleHit` (impact force), `launchBall` (speed), `bendVelocity` (hazard mitigation), the paddle-bounce block (rebound shaping); `skillCharges` pass-through is wired into `toCombatCheckpoint`. S03: `fromCombatCheckpoint(checkpoint, staticContext, catalog)` takes the catalog as third argument; rebuilt states are `pre_launch` with clamped paddle/aim; keep deriving stream keys from the room `eventKey` (`<eventKey>:combat-layout:<row>:<col>`). S05: boss content will extend `catalog.ts` (serialized after this lease); `toCombatCheckpoint` keeps `bossState: null` until boss rules land. S06: hazard cap semantics recorded in `layout.ts` mirror constants. Orchestrator/Archivist: M09 arch fragment written to `.program/signal/SESSION-01.arch.md`; registry M09 row already lists the file set — `enemies.ts`/`catalog.ts` deltas appended there for M01's fragment.
- **needsOwnerCorrection:** —
- **needsDesignSource:** —
- **blockedReason:** —
- **filesTouched:** all nine lease paths.

### SESSION-02 — done, checkpoint 4, 2026-09-23 (commits `456814b`, `f4f6c76`, `cb98586`, `30f1f0c`, `57a7fbf`)

- **session:** 02
- **status:** done
- **checkpoint:** 4
- **notes:** CAP-03 producer complete — `src/domain/combat/effects.ts` (`resolveEffects`, `resolveVolleyEffects`, `NEUTRAL_EFFECTS`) + rules.ts hook consumption (`impactForceBonus`, `pierceLayers`, `hazardStepReduction`, `ballSpeedFactor`, `reboundWidenFactor`, `wallHitCurrencyRate` reserved for S07); CAP-04 full run-level behavior — `LaunchBall`/`UseSkill`/`ReportCombatOutcome` commands + reducer transitions (`applySkillInRoom`, `launchBallInRoom`, `reportCombatOutcome`) + store handlers (`handleCombatLaunch/UseSkill/ReportOutcome`, `combat/launch`/`combat/use-skill`/`combat/report-outcome` app commands, all durable), generator emits real checkpoints for battle/elite/boss (CA-03 producer landed; Orchestrator recheck before S03/S04 dispatch). CA-01 consumer side: every reducer-accepted/persisted state passes `combatCheckpointSchema` (asserted via `expectPersistableLivingRun`/`parseLivingRunRecord` in combat.test.ts + validation.test.ts 26 tests). CA-02 validator side: exactly-once per room by `outcomeId` (per-kind next-index format; `duplicate-outcome-id`/`unknown-outcome-id`; ledger room-scope enforced in validation + schema uniqueness); loss ledger stacks indexes and persists. CA-04: loss decrements `integrityCurrent` exactly 1, restores a valid pre-launch checkpoint carrying the advanced loss count, `fromCombatCheckpoint`-rebuildable — **interim state documented: at integrity 1 a loss commits with integrity 0 and the room open in pre-launch; a loss at 0 is rejected `invalid-state` (death boundary = CAP-12/S07; no fabricated survival)**. All-duplicate-draft disposition recorded: resolved by approved design (FR-9 + mocks/rewards.html replace-earliest incl. duplicates; committed `SelectReward` implements it; no dead-end; no code change). App-command surface landed (`combat/launch`, `combat/use-skill`, `combat/report-outcome`); `resolveRoom`'s `combat-not-implemented` code retained, meaning narrowed to "clear first" (message updated, stale appStore assertion updated to match). Presentational-only keys: enhancements `primed`, `charge-persistence`, `haste`, `echo`, `stability`, `quick-recharge`, `focus`, `cleanup`, `anchor`; skills `phase-shunt`, `prism-burst`, `null-thread`, `specter-step`, `cascade`; equipment `arc-coil`, `static-ward`, `mirror-plating`, `power-cell`, `echo-chip`, `hard-light`.
- **delivered:** effects resolver module + tests (26 tests), rules.ts effect hooks with neutral-default backward compatibility, generator combat-checkpoint emission (CA-03), three run commands + rejections, reducer combat transitions with validation-before/after, combat-phase validation invariants + negative controls, narrowed resolveRoom, app command surface + three store handlers + handler tests, CA-02/03/04 proofs in `src/domain/run/combat.test.ts` (28 tests).
- **verification:** CP1 `npx vitest run src/domain/combat/effects.test.ts src/domain/combat/combat.test.ts` → 2 files/55 tests exit 0 (no over-selection; generators.test.ts 21/21 in isolation except the pre-declared stale row); CP2 `npx vitest run src/domain/run/combat.test.ts src/domain/run/room.test.ts src/domain/run/lifecycle.test.ts` → 3 files/102 tests exit 0, plus persistence validation (26) + repositories (22) + route.test.ts 21/22 (only the stale fixture failing); CP3 `npx vitest run src/app/appStore.test.ts src/domain/run/combat.test.ts src/domain/run/room.test.ts` → 3 files/92 tests exit 0; CP4 full `npm run verify`: lint exit 0 (0 errors + the 1 pre-existing RouteMapScreen react-refresh warning), typecheck exit 0, unit 424 passed / 426 with exactly the 2 pre-declared out-of-lease stale fixture failures, build exit 0 (161 modules, `index-JyMBokRN.js` 422.90 kB; baseline 156/404.87 kB — +5 modules from effects/generator combat composition). CA-04 boundary assertions: exactly-1 decrement, rebuildable loss checkpoint, loss-at-0 rejection with no durable change; CA-02: duplicate + foreign + next-index acceptance + independent per-kind indexing; CA-03: checkpoint emission for battle/elite/boss, null for utility, schema acceptance + catalog-membership provenance.
- **surprises:** (1) **Contract contradiction (prompt correction, evidence-preserved):** CP2's LaunchBall step said to "apply `launchBall`, persist the result's `toCombatCheckpoint` back into `roomState.combatCheckpoint`" — S01's `toCombatCheckpoint` throws on non-pre-launch phases by design and the Custom Rule forbids persisting live volleys; the proposed fix is disproved, correct behavior implemented (persist the unchanged valid pre-launch checkpoint, room flips to in_progress; the live volley is the bridge's ephemeral session). (2) **CP0 mapping contradiction:** the session sketch maps `haste` → `ballSpeedFactor`, but the authored `haste` description is cooldown-based (cooldowns tick faster) with no simulation target this feature; mapped per authored meaning and recorded — `overclock` skill → speed factor (charge-gated) instead. (3) **Real simulation bug caught by my own negative control:** the pierce path lost enemy defeats between substeps (stale enemy rows threaded into `freezeState`); fixed in `stepOnce` by threading `afterHit.enemies` forward — the pierce-to-second-target test now fails on the old code and passes on the fix. (4) **Lease seam — two out-of-lease test fixtures are now stale by the authorized CA-03 change and stay RED:** `src/domain/random/generators.test.ts:399` (`combatCheckpoint: null` row) and `src/domain/run/route.test.ts:347` (`expect(room.combatCheckpoint).toBeNull()`). Session says "update that fixture row and say so" but both files are outside my write set; repairs are mechanical (assert the new real checkpoint / non-null) — `needsOwnerCorrection` below. (5) ESLint's react-hooks heuristic flagged reducer-local `useSkillInRoom` as a Hook name; renamed `applySkillInRoom` (correction commit `30f1f0c`, lease-scoped). (6) One lost commit message (`f4f6c76` used `&&` instead of a pathspec separator); the pathspec was present and `git show --name-only` verified the exact 5 lease paths, so content is correct. (7) `rolledParams` have no durable carrier after the committed `SelectReward` (room-resolution deferral, decision 10) — the resolver runs on equipment + charge-gated skills only, empty params, never invented; tracked to CA-13/S07 with the S02-CP1 consumer proof still owed there. (8) Lease note: `src/domain/run/model.ts` needed no change — all required types existed; `CombatOutcomeMessage` went in commands.ts per the session's file table. (9) Lease revision 1 used throughout.
- **followUp:** (a) Owner repair for the two RED fixtures listed in needsOwnerCorrection before any full-suite gate is recorded green. (b) **S03 bridge:** consume `fromCombatCheckpoint(checkpoint, staticContext, catalog)` (catalog third arg), `resolveVolleyEffects(catalog, build, rolledParams, skillCharges)` per volley for `stepCombat`/`launchBall` threading, session-level outcome dedupe keyed by outcome ID (CA-05/06). (c) **S04 arena:** `EffectSnapshot` display + `CombatState` API; presentational-only keys above need display homes. (d) **S07:** `wallHitCurrencyRate` → `runCurrency` grant (CA-13); death boundary at integrity 0 (CAP-12/CA-14) must replace the interim rejection; the rolled-`effectKey` carrier (where rolledParams are durably stored post-SelectReward) is prerequisite for CAP-03's enhancement contributions to reach the simulation — with it, the resolver consumes real rolled values (currently `ROLLED_PARAMS_CARRIER_LANDING = []` in reducer.ts is the single swap point); loss-at-0-then-finalization browser journeys (CA-15). (e) **Orchestrator:** recheck CA-03 mapping (committed generator emits checkpoints via `createCombatState`/`toCombatCheckpoint` with `lossCount: 0`, boss rooms keep `boss` routing state) before dispatching S03/S04; Archivist: registry M09 gains `effects.ts`/`effects.test.ts`, M02→M09 and M03→M09 edges realized (fragment at `.program/signal/SESSION-02.arch.md`).
- **needsOwnerCorrection:** mechanical-owner-seam — paths `src/domain/random/generators.test.ts`, `src/domain/run/route.test.ts`; whyNeeded: the session-authorized CA-03 generator change invalidated two stale fixture assertions in files outside this lease; mechanical fix: in `generators.test.ts` "composes each route category…" replace the `combatCheckpoint: null` row with an assertion that battle/elite/boss candidates carry a real `pre_launch` checkpoint and utility rooms keep `null`; in `route.test.ts:347` change `expect(room.combatCheckpoint).toBeNull()` to assert a non-null `pre_launch` checkpoint for the battle commit; unblocks SESSION-03/04 dispatch and the final verification session's green suite.
- **needsDesignSource:** —
- **blockedReason:** —
- **filesTouched:** `src/domain/combat/effects.ts`, `src/domain/combat/effects.test.ts`, `src/domain/combat/rules.ts`, `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/validation.ts`, `src/domain/run/combat.test.ts`, `src/domain/random/generators.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`.