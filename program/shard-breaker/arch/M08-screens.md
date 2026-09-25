# M08 — Screen Compositions

## Boundary

- **Path:** `./src/ui/screens/`
- **Session-owned pathspec:** `./src/ui/screens/**/*`
- **Purpose:** Compose the seven staged player flows from controlled view models,
  accessible shared components, and typed commands.

## Public API

- `HomeScreen`
- `RouteMapScreen`
- `CombatScreen`
- `BossScreen`
- `RewardsScreen`
- `RunSummaryScreen`
- `ProfileScreen`
- Screen view-model and action props when not already exposed by M01

## Internal Structure

| File | Responsibility | Design Contract |
|------|----------------|-----------------|
| `./src/ui/screens/HomeScreen.tsx` | Start/resume/archive and no-overwrite guard | `./program/shardbreak/mocks/home.html` |
| `./src/ui/screens/RouteMapScreen.tsx` | Compare and commit route/utility choices | `./program/shardbreak/mocks/route-map.html` |
| `./src/ui/screens/CombatScreen.tsx` | Ordinary combat shell around M06 arena | `./program/shardbreak/mocks/combat.html` |
| `./src/ui/screens/BossScreen.tsx` | Boss identity, phase, modifiers, counterplay | `./program/shardbreak/mocks/boss.html` |
| `./src/ui/screens/RewardsScreen.tsx` | Exactly-three revealed single-choice draft | `./program/shardbreak/mocks/rewards.html` |
| `./src/ui/screens/RunSummaryScreen.tsx` | Final outcome, record, Shards, relic choice | `./program/shardbreak/mocks/run-summary.html` |
| `./src/ui/screens/ProfileScreen.tsx` | Unlocks, record, relic, transfer, reset | `./program/shardbreak/mocks/profile.html` |

## Dependency and Implementation Rules

- Depends on controlled M01 command/view contracts, M09, and M06 where combat
  screens host `Arena`.
- Screens render snapshots and dispatch actions. They never import reducers,
  repositories, IndexedDB, or mutable game internals.
- Replace mock links/shortcuts and sample values with real state. Preserve the
  mocks' hierarchy, labels, states, responsive intent, and design spec—not their
  CDN Tailwind implementation.
- Route and reward choices are semantic single-choice groups with selected,
  unavailable, committed, and resolved states visible beyond color.
- Destructive start/abandon/reset flows require `ConfirmationDialog`; a screen
  cannot bypass the one-living-run guard.
- Loading, invalid-save, pending-save, save-failure, and no-JavaScript/capability
  concerns receive explicit player-facing states.

## Tests

- React Testing Library covers accessible names/roles, keyboard operation,
  disabled reasons, selection/confirmation, command dispatch, and all important
  phase states. Playwright covers complete cross-screen flows.

<!-- SESSION-05 -->
## Launch Archive Contract

- `HomeScreenProps` is controlled by a `HomeScreenViewModel` plus
  `dispatch(command: AppCommand)`. `AppCommand`, `ContentId`, and save-feedback
  contracts are imported type-only; the screen has no application-store runtime
  dependency.
- `HomeScreenViewModel` exposes archive/checkpoint mode, ready/busy/error load
  state, local Shards and record depth, the three class projections and selected
  ID, zero/one durable living-run projection, replacement-guard/busy state, and
  controlled save feedback.
- Archive mode dispatches only `home/select-class`, `run/request-start`,
  `run/resume`, `run/cancel-replacement`, and
  `run/confirm-abandon-and-start`. A first Start request never dispatches
  abandonment directly when a living run exists.
- Checkpoint mode repeats the durable class, depth, Integrity, boss count, and
  saved state within the launch archive and dispatches only
  `run/return-to-archive`; it does not fabricate route, room, or reward content.
- The class selector implements a roving, arrow-key-operable radio group,
  preserves a visible locked Neon Mage explanation, and pairs checked/disabled
  semantics with `SELECTED`/`LOCKED` text.

## Change History
| 2026-09-22 | room-resolution SESSION-03: Added RoomScreen (shop/recovery/combat-placeholder) and RewardsScreen (3-card radiogroup with replacement disclosure) with catalog-resolved display. |

| Date | Change |
|------|--------|
| 2026-08-29 | Added the controlled accessible launch archive and restored-checkpoint composition. |
| 2026-09-24 | combat-engine SESSION-04: Added CombatScreen, room-combat derivation, App combat model; removed the RoomScreen combat branch and placeholder. |
| 2026-09-24 | combat-engine SESSION-05: Added BossScreen with room-boss derivation and boss model; BossScreen composes the S04 Arena host. |
| 2026-08-29 | Imported Genesis M08 and screen design contracts into the Forge registry. |
| 2026-09-14 | route-drafting SESSION-02: Added RouteMapScreen with catalog-resolved display, auto-materialize, radiogroup of RouteCards, commit bar, side panel. |

<!-- route-drafting SESSION-02 -->
## Route map screen (route-drafting SESSION-02)

- `RouteMapScreen.tsx` — controlled by `RouteMapScreenViewModel` (runId, className,
  depth, cycle, integrityCurrent/Maximum, routeOffers, selectedOfferId, committed,
  isBusy, saveSignal, rooms map). Auto-dispatches `route/materialize` on mount when
  offers are empty (with `setTimeout` retry to handle the durable-command lock race).
  Renders `AppStatusBar`, path panel (cycle/depth), radiogroup of `RouteCard`s,
  commit bar (selection readout + "Enter selected room" button, disabled without
  selection or when busy), and side panel (boss lock info, route reading signals).
  Dispatches `route/select-offer` and `route/commit`.
- `RouteMapScreen.test.tsx` — 17 screen tests: renders 4 cards, auto-materialize on
  mount, select dispatch, commit disabled without selection, commit dispatch, boss
  depth shows 1 card, busy disables actions.
- `App.tsx` — builds `RouteMapScreenViewModel` from `AppState` + catalog when
  `deriveScreen` returns `route-map`; renders `RouteMapScreen` instead of `HomeScreen`.
- `App.test.tsx` — `saveCheckpoint` mock added to `createMemoryRepository`; route
  integration test (start → route map → 4 cards → select → commit → room phase).
- `navigation.ts` — `ScreenDescriptor` extended with `{ id: "route-map" }`;
  `deriveScreen` returns it for `phase === "route"` in checkpoint mode.

<!-- room-resolution SESSION-03 -->
## Room and reward screens (room-resolution SESSION-03)

- `src/ui/screens/RoomScreen.tsx` (new) — exports `RoomScreenViewModel`,
  `RoomScreenProps`, `RoomScreen`. The view model renders catalog-resolved
  `objectiveNames`/`roomName`/`roomSummary` and a shop item list with
  precomputed `isPurchased`/`isAffordable`; `isBossRoom` selects the
  boss-specific placeholder copy.
- `src/ui/screens/RewardsScreen.tsx` (new) — exports `RewardsScreenViewModel`,
  `RewardsScreenProps`, `RewardsScreen`. The view model carries the full
  `ContentCatalog` plus `build`; display fields (base reward name/description,
  enhancement labels, replacement preview) are resolved inside the screen via
  the replace-earliest rule (`activeSkillIds[0]` / `passiveEquipmentIds[0]` at
  caps 3/4), because S02's applied `RewardState` is never durable.


<!-- combat-engine SESSION-04 -->
## Combat room screen (combat-engine SESSION-04)

- `src/ui/screens/CombatScreen.tsx` (new) — exports `CombatScreenViewModel`,
  `CombatScreenProps`, `CombatScreen`: status bar, room header
  (`{roomName} // {type}`), stats row (depth/cycle/integrity/room shards), the
  `<Arena>` panel, and the decision rail (objective list resolved through the
  catalog-facade pattern, integrity meter, skill-charge note, passive summary,
  save signal, telegraph banner projected from the durable checkpoint's pending
  hazard, and `Advance to reward draft` dispatching `room/resolve`, gated on
  `hasClearOutcome` — the reducer rejects an unresolved combat room).
- `src/app/navigation.ts` — `ScreenDescriptor` gains `{ id: "room-combat" }`;
  `deriveScreen` returns it for room-phase runs whose `roomState.roomType` is
  battle/elite/boss, keeping `{ id: "room" }` for utility rooms.
- `src/app/App.tsx` — `createCombatModel(state, catalog)` mirrors
  `createRoomModel`: catalog-resolved skill display from
  `checkpoint.skillCharges`, passive summary, the clear-outcome gate, a telegraph
  projection from the checkpoint's pending hazard, and the two Arena closures —
  `createInitialState` (`fromCombatCheckpoint` over run/room context) and
  `resolveVolleyEffects` (SESSION-02's production resolver closed over
  catalog/build/charges with the empty `ROLLED_PARAMS_CARRIER_LANDING` params per
  the recorded deferral; the durable carrier is CA-13/S07 planning scope).
- `src/ui/screens/RoomScreen.tsx` — combat branch removed (`isCombatRoom`,
  placeholder markup, and `RoomScreenViewModel.isBossRoom` deleted with the two
  placeholder test rows); utility-room behavior untouched. 10 CombatScreen tests,
  15 App rows (derivation + composition), RoomScreen 10 (−2 placeholders).


<!-- combat-engine SESSION-05 -->
## Boss screen composition (combat-engine SESSION-05)

- `src/app/navigation.ts` — `ScreenDescriptor` gains `{ id: "room-boss" }`;
  `deriveScreen` branches boss rooms before the generic combat branch.
- `src/app/App.tsx` — `createBossModel(state, catalog)` mirrors
  `createCombatModel`: resolves the routed archetype via `catalog.getBoss`,
  applies the room's modifier IDs, builds the modifier chips with compatibility
  text, and injects the two Arena closures (`createInitialState` via
  `createBossCombatState`, `resolveVolleyEffects` = S02's production resolver);
  Breach maps to `combat/launch` with the checkpoint's committed aim, gated on
  the room being unresolved and disabled while busy.
- `src/ui/screens/BossScreen.tsx` (new) — exports `BossScreenViewModel`,
  `BossScreenModifierChip`, `BossScreen`: identity card, boss state rows,
  phase steps with text labels (`01 Lock / 02 Split / 03 Breach`,
  `data-state` current/done/upcoming), modifier chips with compatibility text
  (`data-applied`), TelegraphBanner with step-derived countdown text
  (`TELEGRAPH // PRISM SWEEP IN <n.n>s` + `Counter: …`, `data-tone`
  pending/active/omitted), boss integrity meter, the S04 Arena host, the Breach
  action, and the clear-gated `Advance to reward draft`.
- CA-10 proof at CP3: BossScreen asserts text+label pairs for every
  telegraph/phase state (reduced-motion keeps static text per S04 CSS policy).
  CA-07 tension recorded for Planner: Breach is a second `combat/launch`
  dispatcher at room scope (durable pre-launch first assault only); the arena
  launch control remains the explicit in-volley launcher.
- Boss-specific CSS classes (`boss-state`, `boss-state-row`, `phase-steps`,
  `phase-step`, `modifier-chips`, `modifier-chip`) carry semantic data hooks;
  styling is an owner correction (B-2) targeting S07's visual pass.
