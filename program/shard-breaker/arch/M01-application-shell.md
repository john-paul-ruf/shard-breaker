# M01 — Application Shell and Command Store

> **Registry note:** This file is a per-module deep record for the application
> shell. In PROGRAM-CONFIG.md's Module Registry this module is row **M06**
> (Application orchestration, `src/app/` + `src/main.tsx`); the ID in this
> heading follows the archived per-module deep-file numbering, which covers
> M01–M13 across all modules. Program sessions and STATE.md use the registry
> IDs (M01–M08) — see the PROGRAM-CONFIG registry for the authoritative list.

## Boundary

- **Paths:** `./src/main.tsx`, `./src/app/`
- **Session-owned pathspecs:** `./src/main.tsx`, `./src/app/**/*`
- **Purpose:** Bootstrap dependencies, load validated local state, expose one
  command dispatch boundary, derive the active screen, and publish committed
  application snapshots.

## Public API

- `App`
- `AppProps`
- `createAppStore()`
- `AppStore`
- `AppStoreDependencies`
- `AppState`
- `AppCommand`
- `ScreenDescriptor`
- `SaveSignalView`
- `LoadStatus`
- `LaunchMode`
- `deriveScreen()`
- `dispatch(command)`
- `subscribe(listener)`
- `getSnapshot()`

UI and game code may dispatch typed commands and observe snapshots. They may
not mutate domain state or call IndexedDB directly.

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/main.tsx` | Browser entry, dependency construction, CSS imports, and React mount |
| `./src/app/App.tsx` | Top-level loading/error state and screen composition |
| `./src/app/appStore.ts` | Serialized command execution, reducer call, durable commit, subscription publication |
| `./src/app/commands.ts` | Narrow serializable UI/game command boundary and adapter messages |
| `./src/app/navigation.ts` | Pure derivation of `ScreenDescriptor` from validated state |

## Dependency and Implementation Rules

- Depends on M05 (run domain), M07 (persistence), and M08 (screens, deep-file
  numbering; the UI module). It is the only module that joins those layers.
- Construct dependencies explicitly in `./src/main.tsx`; inject repositories,
  seed source, and clock metadata rather than hiding them in globals.
- Apply a pure transition before persistence, but do not publish the next
  durable snapshot until the repository commit succeeds.
- Serialize durable command handling so revisions cannot race within one tab.
- Keep `./src/app/commands.ts` free of screen/component imports. M06/M08 may
  import this narrow boundary without creating a runtime composition cycle.
- Derive navigation; do not let a screen force a phase that the run state does
  not permit.

## Tests

- Colocate store/navigation tests under `./src/app/`.
- Cover successful publication, rejected transitions, failed saves, stale
  revisions, loading invalid data, and screen derivation for every run phase.

## Durable launch application contract (SESSION-02/06, historical)

- `commands.ts` — `AppCommand` union: `home/select-class` (carries `classId`),
  `run/request-start`, `run/resume`, `run/cancel-replacement`,
  `run/confirm-abandon-and-start`, `run/return-to-archive`. Controlled intent
  only; no metadata from the DOM, no React/screen imports, no mutable
  re-exports.
- `createAppStore(dependencies)` receives the immutable `ContentCatalog`, the
  narrow `RunLifecycleRepository`, and injected clock, identity, and opaque-seed
  sources. It exposes one referentially stable frozen `AppState` snapshot until
  a real publication and an idempotent subscription-removal function.
- Initialization and every `AppCommand` share one serialized executor.
  Initialization loads first, bootstraps only `profile-missing`, reloads the
  validated state, selects the first unlocked class when needed, and always
  returns a recovered living run to launch archive mode.
- Start and confirmed replacement invoke the pure run-domain reducer, pass its
  explicit instruction to persistence, and publish durable next state only
  after repository success. Confirmed replacement is intentionally two commits:
  committed abandonment is published before replacement creation, and a failed
  second commit remains a truthful no-run archive warning. Resume, Cancel,
  class selection, and Return-to-archive do not write persistence.
- `deriveScreen(state)` maps a validated checkpoint-mode living run by phase:
  `route` → `{ id: "route-map" }`, `room` → `{ id: "room" }`, `reward` →
  `{ id: "reward" }`, otherwise `{ id: "home", mode: "checkpoint" }`; non-ready
  or non-checkpoint state returns `{ id: "home", mode: "archive" }`. `App`
  observes with `useSyncExternalStore`, initializes once under React Strict
  Mode, resolves content labels through the catalog, and renders bounded
  loading/fatal states or the controlled `HomeScreen`, `RouteMapScreen`,
  `RoomScreen`, or `RewardsScreen`.
- `./src/main.tsx` checks the mount point, IndexedDB, UUID generation, and
  secure random bytes before composition. It opens persistence once, injects
  metadata sources, mounts React 19 under Strict Mode, and renders an
  actionable unsupported state instead of allowing a blank-page startup
  failure.

## Route app commands (route-drafting SESSION-01, historical)

- `commands.ts` — `AppCommand` extended with `route/materialize`,
  `route/select-offer` (carries `offerId`), `route/commit`.
- `appStore.ts` — three new handlers: `handleMaterializeRoute` (injects
  `commitId`/`now`, builds `MaterializeRoute` run command, calls `runReducer`,
  persists via `saveCheckpoint`, publishes state + save signal),
  `handleSelectRouteOffer`, `handleCommitRoute`. All three added to
  `isDurableCommand` and `runRejectionMessage` with bounded messages for the
  new route rejection codes.
- `appStore.test.ts` — 5 store integration tests: materialize → offers
  populated, select → selection persisted, commit → room phase,
  re-materialize rejected, unknown offer rejected.

## Room/reward application commands (room-resolution SESSION-02)

- `commands.ts` — `AppCommand` extended with `room/buy-shop-item` (carries
  `itemId`), `room/commit-recovery`, `room/resolve`, `reward/select` (carries
  `cardId`).
- `appStore.ts` — four new handlers (`handleBuyShopItem`,
  `handleCommitRecovery`, `handleResolveRoom`, `handleSelectReward`) following
  the existing `saveCheckpoint` handler pattern; `isDurableCommand` and the
  `handleCommand` switch extended; `runRejectionMessage` covers all ten new
  rejection codes. `handleSelectReward` derives the replacement disclosure from
  the pre/post build (head-change on a full side) and publishes "Reward
  selected; replaced <name>. Advancing to Depth N."

## Room/reward navigation (room-resolution SESSION-03)

- `navigation.ts` — `ScreenDescriptor` gained `{ readonly id: "room" }` and
  `{ readonly id: "reward" }` (verified at HEAD: `src/app/navigation.ts`).
  `deriveScreen` returns `room` for `phase === "room"` and `reward` for
  `phase === "reward"` in checkpoint mode; the room-phase fallback to
  `home/checkpoint` is removed.
- `App.tsx` — added `createRoomModel(state, catalog)` and
  `createRewardsModel(state, catalog)` (module-private); both return
  `RoomModelResult` / `RewardsModelResult` discriminated results mirroring the
  existing `HomeModelResult`/`RouteMapModelResult` pattern and render
  `RoomScreen`/`RewardsScreen` or `ErrorShell` for the new descriptors.
- **Content-facade edge:** `App.tsx` value-imports `ROUTE_SUPPORT_DEFINITIONS`
  from `src/domain/content/rooms.ts` to resolve objective display names
  (`src/app/App.tsx:15`, `objectiveNamesFor` at line 220). This is a realized
  content-orchestration runtime import, declared in the registry as an expected
  content edge and recorded as a follow-up, not a contract break: a
  `listRouteSupport()` facade lookup on `ContentCatalog` would keep
  objective-name resolution behind the catalog like every other content read.
  Recorded for Planner as a small cleanup/facade follow-up (STATE.md Current
  Blockers).


<!-- run-summary-metaprogression SESSION-01 -->
## Terminal command surface and store publish (run-summary-metaprogression SESSION-01)

- `src/app/commands.ts`: `AppCommand` gains `{ type: "terminal/resolve-relic";
  relicId: ContentId | null }` (durable; added to `isDurableCommand`).
- `src/app/appStore.ts`: `AppState` gains `terminalRecord: TerminalRecordView | null`
  where `interface TerminalRecordView { isRecord: boolean; priorRecordDepth: number }`
  — a transient projection computed by the finalize handler from the PRE-finalization
  snapshot (`livingRun.depth > profile.records.highestReachedDepth`), published with
  the finalized profile, cleared on resolve/decline/initialize/failure. Finalize save
  signal names the Shards (`Run lost. +N shards banked to the archive.`). New handler
  `handleTerminalResolveRelic` (reducer → repository → fresh profile publish,
  catalog-resolved display name in the signal). `runRejectionMessage` covers the two
  new domain rejection codes (`no-pending-relic-choice`, `unknown-relic-choice`).

## Change History

| Date | Change |
|------|--------|
| 2026-09-24 | combat-engine SESSION-05: Added the room-boss screen branch and boss model builder. |
| 2026-09-24 | combat-engine SESSION-04/07: Added the room-combat screen branch, combat model builder, combat app command surface, and the CA-13 banked-currency save signal. |
| 2026-09-25 | run-summary-metaprogression SESSION-01: App command surface gains `terminal/resolve-relic` + handler + transient `terminalRecord` publish — see the fragment below. |
| 2026-08-29 | Imported deep-file contract into the Forge registry. |
| 2026-08-29 | Added the serialized durable application store, launch navigation, React binding, and browser composition root. |
| 2026-09-14 | route-drafting SESSION-01: Added route/materialize, route/select-offer, route/commit app commands and store handlers with saveCheckpoint persistence. |
| 2026-09-14 | route-drafting SESSION-02: Added route-map screen descriptor and App routing for phase "route". |
| 2026-09-22 | room-resolution SESSION-02: Added room/buy-shop-item, room/commit-recovery, room/resolve, reward/select app commands and store handlers with saveCheckpoint persistence and replacement-disclosure save signal. |
| 2026-09-22 | room-resolution SESSION-03: Added room/reward screen descriptors (`{ id: "room" }`, `{ id: "reward" }`), App model/render branches for room and reward phases, and the content-facade objective-name read. |
| 2026-09-22 | Archivist final reconciliation: declared the dual module numbering (deep-file M06 vs registry M06), merged the Change History, repaired the deriveScreen enumeration to all five descriptors, and corrected the SESSION-03 edge record to the mechanically-derived content-rooms import. |


<!-- combat-engine SESSION-05 -->
## Boss screen and room-boss branch (combat-engine SESSION-05)

- `src/app/navigation.ts` — `ScreenDescriptor` gains `{ id: "room-boss" }`;
  `deriveScreen` branches boss rooms BEFORE the generic combat branch.
- `src/app/App.tsx` — `createBossModel(state, catalog)`: resolves the routed
  archetype via `catalog.getBoss`, applies the room's modifier IDs, builds
  modifier chips with compatibility text, injects the two Arena closures
  (`createInitialState` = `createBossCombatState` closure; `resolveVolleyEffects`
  = S02's production resolver). Breach maps to `combat/launch` with the
  checkpoint's committed aim (durable pre-launch first assault), gated on the
  room being unresolved, disabled while busy.
- `src/ui/screens/BossScreen.tsx` (new) — per `mocks/boss.html`: identity card,
  boss state rows (`data-phase`/`data-current-phase`), phase steps with text
  labels, modifier chips with compatibility text, TelegraphBanner with
  step-derived countdown text, boss integrity meter, S04 Arena host, Breach
  action, clear-gated advance. 14 screen tests + App derivation/composition
  rows.

<!-- combat-engine SESSION-04/07 (Archivist-integrated record) -->
## Combat screen branch, combat commands, and currency save signal (combat-engine)

- `src/app/commands.ts` — `AppCommand` extended with `combat/launch` (carries
  `aimAngle`), `combat/use-skill` (carries `skillId`),
  `combat/report-outcome` (carries the room-scoped `CombatOutcomeMessage`);
  all durable (`isDurableCommand`). Bounded rejection messages cover the
  combat codes (`combat-checkpoint-missing`, `invalid-aim-angle`,
  `unknown-outcome-id`, `duplicate-outcome-id`, skill codes).
- `src/app/appStore.ts` — three new durable handlers following the
  `saveCheckpoint` pattern: `handleCombatLaunch` (persists the unchanged valid
  pre-launch checkpoint and flips the room to `in_progress`; the live volley
  is the bridge's ephemeral session), `handleCombatUseSkill`, and
  `handleCombatReportOutcome`. The outcome handler branches on the
  transition's instruction kind: `finalize-death` routes to the repository's
  one-transaction terminal boundary and publishes archive-mode truth
  (`livingRun: null`); otherwise it persists the checkpoint and banks the
  seeded clear-time currency (CA-13) — the bounded save signal names the
  amount ("Room resolved. <n> room shards banked.") when the committed
  `runCurrency` delta is positive.
- `src/app/navigation.ts` — `ScreenDescriptor` gains `{ id: "room-combat" }`;
  `deriveScreen` returns it for room-phase runs whose `roomState.roomType` is
  battle/elite, keeping `{ id: "room" }` for utility rooms. Current descriptor
  set at HEAD `97553fd` (seven): `home/archive`, `home/checkpoint`,
  `route-map`, `room`, `room-boss`, `room-combat`, `reward`.
- `src/app/App.tsx` — `createCombatModel(state, catalog)` mirrors
  `createRoomModel`: catalog-resolved skill display from
  `checkpoint.skillCharges`, passive summary, the clear-outcome gate, a
  telegraph projection from the checkpoint's pending hazard, and the two Arena
  closures — `createInitialState` (`fromCombatCheckpoint` over run/room
  context) and `resolveVolleyEffects` (S02's production resolver closed over
  catalog/build/charges with the empty `ROLLED_PARAMS_CARRIER_LANDING` params
  per the recorded deferral). Realizes the M06→M09 [R] App-side edge.
