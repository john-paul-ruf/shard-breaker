# M05 — Run and Profile State Machine

## Boundary

- **Path:** `./src/domain/run/`
- **Session-owned pathspec:** `./src/domain/run/**/*`
- **Purpose:** Authoritatively model profile/living-run phases and all meaningful
  transitions: lifecycle, routes, rooms, builds, rewards, utility rooms,
  Integrity, terminal results, records, Shards, unlocks, and relics.

## Public API

- `Profile`, `LivingRun`, `RunState`, `ProfileState`
- `RunPhase`, `RunCommand`, `RunTransition`
- `BuildState`, `RouteState`, `RoomState`, `RewardDraft`
- `RunSummary`, `TerminalState`
- `runReducer()`
- `validateRunCommand()`
- `calculateShards()`
- `calculateRecordUpdate()`

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/domain/run/model.ts` | Profile, living-run, phase, build, route, room, reward, and summary types |
| `./src/domain/run/reducer.ts` | Pure command dispatch and transition composition |
| `./src/domain/run/commands.ts` | Serializable lifecycle/route/room/reward/terminal commands |
| `./src/domain/run/routes.ts` | Depth/cycle rules, route commitment, mandatory boss scheduling |
| `./src/domain/run/rewards.ts` | Exactly-three draft, capacity/replacement, one-time application |
| `./src/domain/run/threat.ts` | Sublinear cycle budget and composition policy |
| `./src/domain/run/progression.ts` | Shards, reached-depth records, unlocks, terminal summary, relic effects |
| `./src/domain/run/validation.ts` | Cross-field invariants and transition guards |

## Dependency and Implementation Rules

- Depends on M02, M03, and M04. It has no framework, browser, Canvas, or
  persistence imports.
- All transitions are pure and immutable and return a typed rejection or a next
  state plus an idempotent persistence instruction.
- Enforce one living run, depth 1 start, cycle formula, every-third-floor boss,
  class Integrity, one-point ball loss, build limits, non-negative charges and
  currency, bounded recovery, known compatible IDs, and phase legality.
- Store materialized offers/drafts before choice. Reject duplicate route,
  purchase, recovery, combat outcome, room clear, reward, and finalization IDs.
- `highestReachedDepth` changes only on committed floor entry, including a boss
  floor reached before death.
- Terminal state is projected into a profile summary/pending relic choice; the
  durable living-run deletion is M07's atomic responsibility.

## Tests

- Use table-driven transition tests for every phase and rejection reason.
- Cover idempotent retries, stale identity, slot/currency/cap limits, refresh-safe
  materialized state, arbitrary safe depths, record rules, Shard calculation,
  and terminal/abandon distinctions.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M05 contract into the Forge registry. |

