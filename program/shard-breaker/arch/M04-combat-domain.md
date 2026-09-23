# M04 — Deterministic Combat Domain

> **Registry note:** This file is a per-module deep record for the combat
> domain. In PROGRAM-CONFIG.md's Module Registry this module is row **M09**
> (Combat domain, `src/domain/combat/`); the ID in this heading follows the
> archived per-module deep-file numbering (M01–M13). Program sessions and
> STATE.md use the registry IDs — see the PROGRAM-CONFIG registry for the
> authoritative list.

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
| `./src/domain/combat/layout.ts` | Seeded layout materialization and checkpoint round-trip |
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
| 2026-09-23 | combat-engine SESSION-01: created `src/domain/combat/` (model/layout/rules/results) and extended M01 content with `enemies.ts` + `listEnemies()`/`getEnemy()` — see the fragment below. |

<!-- combat-engine SESSION-01 -->
## Combat core (combat-engine SESSION-01)

Pure, deterministic, DOM-free module. Imports only `content/*` (type-only),
`random/seededRng`, and its own files; `run/model` imports are type-only
(mirrored durable shapes). No React/Canvas/persistence/app imports. No
`Math.random`/wall-clock; all randomness through
`deriveStream(seed, contentVersion, "<eventKey>:combat-layout:<row>:<col>")`.

### `model.ts` — world constants and state shapes
- Constants: `WORLD_WIDTH=160`, `WORLD_HEIGHT=100`, `PADDLE_Y=94`,
  `SIMULATION_STEP_SECONDS=1/120`, `BALL_BASE_SPEED=48`, `PADDLE_HALF_WIDTH=15`,
  `AIM_MAX_DEVIATION=π/3`, `MAX_SUPPORTED_BALL_SPEED=4×base`,
  `BALL_SUBSTEP_DISPLACEMENT=2`.
- Types: `CombatPhase`, `BallState`, `EnemyInstance`, `HazardInstance`,
  `CombatOutcome {outcomeId, kind: "loss_of_ball"|"clear"}`, `CombatState`
  (adds durable `losses` counter beside `wallHits`; outcome set once per volley),
  `CombatInitContext {seed, contentVersion, roomId, eventKey, formationId,
  density, durabilityFactor, lossCount, hazardIds}`, `CombatCommand`.
- y grows downward: paddle at high y, enemies at low y. Coordinates are logical
  units; frame rate and DPR never reach this layer.

### `layout.ts` — seeded materialization + checkpoint round-trip
- `createCombatState(catalog, context)`: validates context (non-blank keys,
  content version must match catalog, density safe int ≥ 0 ≤ 512,
  durabilityFactor ≥ 1, unique hazard IDs), grid `cols = density≤4?3 :
  density≤8?4 : 5`, `rows = ceil(density/cols)`; per-cell enemy definitions from
  `catalog.listEnemies()` sorted by ID; `health = max(1, round(baseHealth ×
  durabilityFactor))`; hazards placed in evenly spread lanes, `state:
  "telegraphed"`, `remainingSteps = HAZARD_TELEGRAPH_STEPS (240)`. Freezes all
  outputs. Geometry constants exported: `FORMATION_INSET_X=20`,
  `FORMATION_TOP_Y=16`, `FORMATION_INSET_Y=28`, `ENEMY_HALF_WIDTH=6`,
  `ENEMY_HALF_HEIGHT=4`, `HAZARD_HALF_WIDTH=8`.
- `toCombatCheckpoint(state, skillCharges?)`: emits the exact
  `combatCheckpointSchema` shape (`kind` derived from the durable `losses`
  count; `stateId` = behavior; `bossState: null`); throws on non-pre-launch
  phases (live volleys are never persisted) and on >3 charges.
- `fromCombatCheckpoint(checkpoint, staticContext, catalog)`: re-derives layout
  from the same seeded stream, verifies stored rows against it (stale/foreign
  checkpoints fail closed), clamps paddle/aim into legal bands. **Signature
  note for S03:** takes the catalog as third argument.

### `rules.ts` — fixed-step simulation
- `stepCombat(state, steps)`: per tick — hazards → enemy behavior clocks →
  ball substeps (substep displacement ≤ 2 units; each substep runs the
  collision cascade walls → paddle → enemies sorted by (y, x, instanceId) →
  loss boundary). Deterministic, immutable, frozen outputs. Steps after a
  volley end are no-ops. One enemy hit per tick.
- `launchBall(state, angle)`: pre-launch only, finite angle, clamped to
  ±π/3, explicit-launch rule preserved.
- `movePaddle(state, x)`: any phase, clamped to
  `[PADDLE_HALF_WIDTH, WORLD_WIDTH − PADDLE_HALF_WIDTH]`; attached ball rides.
- Outcomes: loss = ball past bottom → `{kind:"loss_of_ball",
  outcomeId: <eventKey>:outcome:loss_of_ball:<losses>}`, phase returns to
  pre-launch with re-attached ball, `losses += 1`. Clear = last instance
  defeated → `{kind:"clear", outcomeId: ...:clear:0}`, phase `resolved`.
- Behaviors: phasing intangible first `behaviorParam` steps of a
  `2×behaviorParam` cycle; regenerating heals 1 HP per `behaviorParam` steps
  while damaged; splintering defeat spawns `<instanceId>:a`/`:b` 1-HP static
  children at the parent position.
- Hazard lane: one speed-preserving bend per lane entry (factor 1.5),
  telegraph 240 steps → active pulse 120 steps → resolved.
- **S02 effect hook points:** `settleHit` (impact force), `launchBall` (speed),
  `bendVelocity` (hazard mitigation), paddle bounce block (rebound shaping).

### `results.ts` — outcome identity (CA-02 producer)
- `outcomeIdFor(eventKey, kind, index)` → `<eventKey>:outcome:<kind>:<index>`.
- `validateOutcomeId(state, kind, outcomeId)`: total typed check (bounded
  512, room-prefixed, numeric index). Index semantics: count of prior
  same-kind outcomes in the room (`losses` on the state; seeded from
  `CombatInitContext.lossCount` for rebuilds).

## Test-only edge (sanctioned pattern)
`src/domain/combat/combat.test.ts` imports `parseLivingRunRecord` from
`src/persistence/validation` — the same test-only persistence edge
`src/domain/run/room.test.ts` already establishes for the CA-01 proof. Not a
runtime module edge.