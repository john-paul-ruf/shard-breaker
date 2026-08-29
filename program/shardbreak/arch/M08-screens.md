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

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M08 and screen design contracts into the Forge registry. |

