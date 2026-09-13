# M04 — Deterministic Combat Domain

## Boundary

- **Path:** `./src/domain/combat/`
- **Session-owned pathspec:** `./src/domain/combat/**/*`
- **Purpose:** Own arena coordinates, paddle/ball rules, fixed-step collision
  resolution, enemies, hazards, boss phases, telegraphs, and validated outcomes.

## Public API

- `CombatState`
- `CombatCommand`
- `CombatOutcome`
- `CombatEvent`
- `OutcomeId`
- `WorldPoint`, `PaddleState`, `BallState`, `EnemyState`, `HazardState`
- `BossPhaseState`, `TelegraphState`
- `createCombatState()`
- `advanceCombat()`

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/domain/combat/model.ts` | Stable world-space state and tagged commands/events |
| `./src/domain/combat/rules.ts` | Fixed-timestep transitions, collision ordering, bounds, launch/loss/clear rules |
| `./src/domain/combat/bossState.ts` | Boss phases, telegraph timing, counters, compatible modifier effects |
| `./src/domain/combat/results.ts` | Outcome identity, room scoping, and result validation helpers |

## Dependency and Implementation Rules

- Depends on M02 and deterministic initialization contracts from M03. It never
  imports React, Canvas, DOM, persistence, or the application store.
- Use one documented stable world coordinate system. Frame rate and device
  pixel ratio cannot affect simulation outcomes.
- Resolve simultaneous contacts in a deterministic documented order and prevent
  tunneling/duplicate hits at supported ball speeds.
- A launch is explicit. Pointer motion can update aim/paddle intent but cannot
  launch a parked ball.
- High-impact effects expose named telegraphs and counterplay data in addition
  to render geometry.
- Each durable loss, skill use, phase result, and room clear has a room-scoped
  `OutcomeId`; M05 remains the authority that accepts it at most once.

## Tests

- Cover wall/paddle/brick collisions, launch bounds, dropped-ball detection,
  clear objectives, fixed-step equivalence across frame chunking, hazards,
  telegraph transitions, every boss phase, and outcome ID stability.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M04 contract into the Forge registry. |

