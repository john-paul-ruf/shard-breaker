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

| Date | Change |
|------|--------|
| 2026-08-29 | Added the controlled accessible launch archive and restored-checkpoint composition. |
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
