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
| `./src/domain/combat/effects.ts` | Build-driven effect resolution into simulation modifiers |
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
| 2026-09-24 | combat-engine SESSION-05: added bossState.ts (boss phase machine composing over the volley loop; capped modifier application; fail-closed policies) — see the fragment below. |
| 2026-08-29 | Imported Genesis M04 contract into the Forge registry. |
| 2026-09-23 | combat-engine SESSION-01: created `src/domain/combat/` (model/layout/rules/results) and extended M01 content with `enemies.ts` + `listEnemies()`/`getEnemy()` — see the fragment below. |
| 2026-09-23 | combat-engine SESSION-02: added `effects.ts` (build-driven effect resolution) and consumed effects in `rules.ts` hooks — see the fragment below. |

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

<!-- combat-engine SESSION-02 -->
## Effect resolution (combat-engine SESSION-02)

### `effects.ts` (new)
- `EffectSnapshot` — bounded, frozen simulation modifiers:
  `ballDamageBonus`, `impactForceBonus`, `hazardStepReduction`,
  `extraCharges`, `pierceLayers`, `reboundWidenFactor`, `ballSpeedFactor`,
  `primedSkillIds` (reserved; empty until a carrier lands),
  `wallHitCurrencyRate` (consumed by S07's grant).
- `NEUTRAL_EFFECTS` — zero-contribution snapshot; the pre-effect behavior.
- `resolveEffects(catalog, build, rolledParams)` — build-driven snapshot:
  enhancements `pierce`/`momentum` → damage (+ layers for pierce),
  `amplitude` → impact force, `hazard-shield` → hazard softening,
  `bonus-charges` → extra charges; equipment `soft-patch` → 1 hazard step,
  `fractal-core` → currency rate 1. Skills deliberately not mapped here
  (charge-gated; see `resolveVolleyEffects`). Unknown keys/IDs fail closed.
- `resolveVolleyEffects(catalog, build, rolledParams, skillCharges)` —
  spent skills (charge entry below maximum) contribute: `overclock` →
  +0.25 speed (cap `MAX_BALL_SPEED_FACTOR = 1.25`), `shield-bash` → +1
  impact, `rebound-lens` → ×1.5 rebound widening (cap
  `MAX_REBOUND_WIDEN_FACTOR = 2`).
- Simulatable keys recorded in `effects.ts`; presentational-only keys
  (per the S02 State Update): enhancements `primed`, `charge-persistence`,
  `haste`, `echo`, `stability`, `quick-recharge`, `focus`, `cleanup`,
  `anchor`; skills `phase-shunt`, `prism-burst`, `null-thread`,
  `specter-step`, `cascade`; equipment `arc-coil`, `static-ward`,
  `mirror-plating`, `power-cell`, `echo-chip`, `hard-light`.

### `rules.ts` (extended, backward compatible)
- Optional trailing `EffectSnapshot` parameter (defaults to
  `NEUTRAL_EFFECTS`) on `stepCombat(state, steps, effects?)` and
  `launchBall(state, angle, effects?)`; `bendVelocity` softens by
  `1 + stepReduction`; paddle bounce deviation scales by
  `reboundWidenFactor`; hit damage scales by `impactForceBonus`; new
  pierce-through path with `PIERCE_TRAVEL_PER_LAYER = 2` exported. All S01
  call sites unchanged.

### Mapping notes recorded by S02
- The session sketch mapped `haste` → `ballSpeedFactor`; the authored `haste`
  description is cooldown-based with no simulation target this feature, so it
  is presentational-only and `overclock` (skill) → speed factor instead —
  mapped per authored meaning.
- `rolledParams` have no durable carrier after the committed `SelectReward`
  (room-resolution decision 10); the resolver consumes equipment +
  charge-gated skills with empty params, never invented values. The single
  swap point is `ROLLED_PARAMS_CARRIER_LANDING = []` in `run/reducer.ts` —
  prerequisite owned by S07/CA-13 planning.


<!-- combat-engine SESSION-05 -->
## Boss combat layer (combat-engine SESSION-05)

Pure boss layer composing over S01's volley loop WITHOUT modifying `rules.ts`:

- `BossCombatInitContext extends CombatInitContext` — adds `archetypeId`,
  `modifierIds`.
- `createBossCombatState(catalog, context, baseArena?) → BossCombatRuntime` —
  composes the deterministic S01 volley arena plus the routed anatomy (shield
  nodes + core as ordinary enemy rows so `stepCombat`'s cascade damages them),
  plus sweep lanes chained off `<eventKey>:boss-layout`; lanes resolve to
  authored telegraphs by `hazardId`; instance IDs are chain-positional. Fails
  closed on unknown archetype, foreign base arena, coverage-cap violation, and
  anatomy that cannot fit above the paddle.
- `stepBoss(state, volleyState, steps) → BossCombatRuntime` — advances the
  volley through `stepCombat` and re-derives the projection; the returned
  runtime always carries the caller's current volley state. Steps after a
  volley end are no-ops (S01 exactly-once).
- `deriveBossProjection(definition, arena) → BossCombatProjection` — phase at
  authored health thresholds (core row), earliest live telegraph with
  step-derived countdown (`bossCountdownSeconds`), nodes-broken counter,
  `defeated` on the standard `clear` outcome.
- `applyBossModifiers(definition, ids) → { applied, ignored }` — capped effect
  registry; unknown/incompatible/duplicate/cap-exceeding IDs fail closed with
  bounded diagnostics (CA-12 mechanics; proofs stay S06-CP2).
- Caps: `BOSS_TELEGRAPH_MIN_STEPS=120`, `BOSS_SWEEP_MAX_HALF_WIDTH=12`,
  `BOSS_SWEEP_MAX_COVERAGE=0.45`, `MAX_BOSS_SWEEP_LANES=3`. Durable checkpoints
  keep `bossState: null` — boss anatomy/sweep lanes/phase progress are
  arena-ephemeral, recomposed deterministically from the boss-layout stream on
  loss restore; the boss is defeated only by the volley that clears the room.
  S06/S07 must not expect boss progress to survive reload mid-room.
- S06 note: `createBossCombatState` fails closed when threat density leaves no
  anatomy room above the paddle — S06's threat composition owns reconciling
  boss-room density so composition never trips that guard in production.
  *(Resolved by S06: `BOSS_ROOM_MAX_DENSITY = 10` caps boss-room formation
  density in `random/generators.ts`, never loosening the combat-layer guard;
  S06 also added `layout.test.ts` — context-passthrough and
  instance-ID-disjointness rows; `bossState.ts` itself was unchanged by S06.)*
