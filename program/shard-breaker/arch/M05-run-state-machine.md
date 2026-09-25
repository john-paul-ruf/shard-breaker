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
| 2026-09-24 | combat-engine SESSION-07: Added battleCurrencyGrant (CA-13 seeded clear-time currency rule) and the finalize-death transition replacing the interim loss-at-0 rejection (CAP-12) — see the fragment below. |
| 2026-08-29 | Imported Genesis M05 contract into the Forge registry. |
| 2026-09-14 | route-drafting SESSION-01: Added MaterializeRoute/SelectRouteOffer/CommitRoute commands, reducer transitions with generator-to-snapshot mapping, save-checkpoint persistence instruction. |
| 2026-09-22 | room-resolution SESSION-02: Added BuyShopItem/CommitRecovery/ResolveRoom/SelectReward commands, four reducer transitions with generator-to-snapshot mapping, RewardState replacement fields, and ten new rejection codes. |
| 2026-09-23 | combat-engine SESSION-02: Added LaunchBall/UseSkill/ReportCombatOutcome commands and reducer transitions consuming the combat domain (M03→M09), combat-phase validation invariants, and the narrowed `combat-not-implemented` ("clear first") semantics. |

<!-- SESSION-02 -->
## M05 — Run and profile state machine (`./src/domain/run/`)

- `model.ts` — full serialized v1 domain types (readonly): `Profile`, `LivingRun`,
  `RunState` (`{ profile; livingRun | null }`), plus nested `ProfileUnlocks`,
  `UtilityUpgradeLevel`, `RelicState`, `PersonalRecords`, `RunSummarySnapshot`,
  `PendingRelicChoice`, `BuildSnapshot`, `RunProgress`, `RouteState`,
  `RouteOfferSnapshot`, `RoomState` and its combat/shop/recovery/boss/threat
  snapshots, `RewardState`/`RewardCardSnapshot`, `EffectParam`. Constants
  `SAVE_SCHEMA_VERSION = 1`, `CURRENT_RECORD_KEY = "current"`. Factories
  `createDefaultProfile(catalog, {profileId, now, commitId})` and
  `createInitialLivingRun(contentVersion, classId, startingIntegrity,
  carryOverRelicId, {runId, seed, now, commitId})` — all nondeterministic inputs are
  parameters.
- `routes.ts` — `isValidDepth(depth)`; `cycleForDepth(depth)` (`floor((depth-1)/3)+1`,
  throws `RangeError` on unsafe/zero/negative depth); `isBossDepth(depth)`;
  `routeEventKey(runId, contentVersion, depth)`; `createInitialRouteState(runId,
  contentVersion)` → empty offers, null selection, uncommitted, deterministic key.
- `validation.ts` — `ValidationIssue`, `ValidationResult`; `validateProfile`,
  `validateLivingRun`, `validateRunState` (cross-field: singleton key, versions,
  revisions, known class IDs, depth/cycle, Integrity bounds, build caps, phase-state
  coherence, closed empty-route rule).
- `commands.ts` — `RunCommand` (`StartRun` | `AbandonRun`, caller-supplied identity /
  seed / clock / revision metadata); discriminated `RunRejection`
  (`living-run-exists`, `no-living-run`, `unknown-class`, `class-locked`,
  `stale-profile-revision`, `stale-run`, `stale-run-revision`, `invalid-metadata`,
  `invalid-state`); `RunPersistenceInstruction` (`start-run` | `abandon-run`);
  `RunTransition`.
- `reducer.ts` — `runReducer(state, command, catalog): RunTransition`. Pure. `StartRun`
  creates exactly one depth-1/cycle-1 living run with class Integrity and an optional
  copied carry-over relic, and does not mutate/increment the profile. `AbandonRun`
  removes the living run and grants nothing. No React/browser/persistence/random/time
  imports.

<!-- route-drafting SESSION-01 -->
## Route transitions (route-drafting SESSION-01)

- `commands.ts` — `RunCommand` extended with `MaterializeRoute`, `SelectRouteOffer`,
  `CommitRoute` (all carry `runId`, `expectedRevision`, `commitId`; materialize/commit
  also carry `now`; select carries `offerId` and `now`). New rejection codes:
  `route-already-materialized`, `route-not-materialized`, `route-already-committed`,
  `unknown-route-offer`, `route-selection-missing`. `RunPersistenceInstruction`
  extended with `save-checkpoint`.
- `reducer.ts` — three new transitions: `materializeRoute` (builds
  `RouteGenerationContext`, calls `generateRouteOptions`, maps
  `GeneratedRouteOffer` → `RouteOfferSnapshot` dropping display fields,
  idempotent reject if offers exist), `selectRouteOffer` (sets `selectedOfferId`,
  validates against offers), `commitRoute` (builds `RoomGenerationContext` with
  `selectedOfferId`, calls `generateRoomCandidate`, maps `GeneratedRoomCandidate` →
  `RoomState` dropping display fields and `threatProfile.diagnostics`, transitions
  `phase: "route" → "room"`, nulls `routeState`). All bump revision, set
  `updatedAt`/`lastCommitId`, emit `save-checkpoint` persistence instruction.
- `route.test.ts` — 22 domain tests covering materialize (4 offers, boss depth,
  idempotent), select (valid, unknown, empty, committed), commit (phase transition,
  room population, boss-depth, rejections), and `validateLivingRun` on all results.

<!-- room-resolution SESSION-02 -->
## Room resolution commands (room-resolution SESSION-02)

- `commands.ts` — `RunCommand` extended with `BuyShopItem` (carries `itemId`),
  `CommitRecovery`, `ResolveRoom`, `SelectReward` (carries `cardId`); all carry
  `runId` / `expectedRevision` / `commitId` / `now`. `RunRejection` gains ten
  codes: `shop-item-already-purchased`, `insufficient-currency`,
  `unknown-shop-item`, `room-not-shop-type`, `room-not-recovery-type`,
  `room-already-resolved`, `recovery-already-committed`,
  `combat-not-implemented`, `reward-already-selected`, `unknown-reward-card`.
  New exported type `RoomTypeForRejection`. No new persistence instruction
  kinds — all four transitions emit the existing `save-checkpoint`.
- `model.ts` (additive) — `RewardState` gains `displacedRewardId: ContentId | null`
  and `displacedSlot: "active" | "passive" | null`. As of this session's reducer the
  fields are always `null` on produced states (the applied record is transient);
  they are part of the durable schema for the replacement contract (CA-05) and
  future summary surfaces.
- `reducer.ts` — `runReducer` handles the four new commands.
  `resolveRoom` transitions `phase: "room" → "reward"`, nulls `roomState`
  (phase-state coherence requires only the phase's own state), and populates
  `rewardState` from `generateRewardDraft` via private `mapRewardCard`/
  `mapRewardDraft` helpers (frozen, field-preserving). `selectReward` applies
  the card to the build (append, or replace-earliest on a full side),
  increments depth/cycle, materializes the next route via
  `generateRouteOptions` + `mapRouteOffer`, transitions
  `phase: "reward" → "route"`, and nulls `rewardState` (CAP-05/CA-05
  observable success; phase-state coherence). Displacement is disclosed by the
  store signal, not by a retained record. Private `requireOpenRoomPhase`
  helper factored for the three room-phase transitions.

<!-- combat-engine SESSION-02 -->
## Combat transitions (combat-engine SESSION-02)

- `commands.ts` — `CombatOutcomeMessage` (`{outcomeId, kind:
  loss_of_ball|clear}`); commands `LaunchBall`, `UseSkill`,
  `ReportCombatOutcome`; rejections `unknown-skill`, `skill-not-in-build`,
  `skill-no-charges`, `combat-checkpoint-missing`, `invalid-aim-angle`,
  `unknown-outcome-id`, `duplicate-outcome-id`.
- `reducer.ts` — imports combat layout/rules/results/effects (realized M03→M09
  runtime edge, prescribed by the plan); `combatContextFor` derives
  `CombatInitContext` from run+room (loss ledger seeds the CA-02 index);
  loss branch decrements `integrityCurrent` by exactly 1 and re-emits the
  pre-launch checkpoint carrying the advanced loss count; `resolveRoom`
  accepts combat rooms only after the room's clear outcome is on
  `processedOutcomeIds` (`combat-not-implemented` code kept, meaning narrowed
  to "clear first"). Launch persists the unchanged valid pre-launch checkpoint
  and flips the room to `in_progress`; the live volley is the bridge's
  ephemeral session (durable-write Custom Rule: live volleys are never
  persisted, and `toCombatCheckpoint` throws on non-pre-launch phases).
  Interim death boundary: at integrity 1 a loss commits with integrity 0 and
  the room open in pre-launch; a loss at 0 is rejected `invalid-state`
  (finalization = CAP-12/S07; no fabricated survival).
- `validation.ts` — room-level invariants: combat↔utility checkpoint
  coherence, skill charges within authored maximums, unresolved battle/elite
  rooms must carry a non-defeated enemy, CA-02 ledger room-scoping/uniqueness.


<!-- combat-engine SESSION-07 -->
## Currency grant and death terminal (combat-engine SESSION-07)

- `reducer.ts` (M03) — new export `battleCurrencyGrant(seed, contentVersion,
  roomEventKey, roomType, depth): number` — the CA-13 seeded clear-time grant
  rule: one Mulberry32 draw from
  `(seed, contentVersion, "<roomEventKey>:battle-currency")`; battle 15–60,
  elite 25–80 (strictly greater range), plus a `2×depth` term capped at +32.
  Pure and deterministic; the reducer's `ReportCombatOutcome` clear branch is
  the sole consumer (battle/elite grant, boss/utility 0; depth-1 grant observed
  = 23 room shards). Session-sketch mapping recorded: the sketch omitted the
  `depth` parameter, but CA-13's approved range (+2×depth capped +32) requires
  it. New module-private `WALL_HITS_CARRIER_LANDING = 0` beside S02's
  `ROLLED_PARAMS_CARRIER_LANDING`: the volley's wall-hit count lives in the
  bridge's ephemeral session and the committed outcome message carries only the
  outcome identity, so the Fractal Core `wallHitCurrencyRate` term contributes
  zero until a durable wall-hit carrier lands (producer seam owned by the
  bridge's outcome dispatcher; same deferral class as the rolled-params
  carrier). Rolled-params carrier decision (CA-13 planning authority):
  `ROLLED_PARAMS_CARRIER_LANDING` stays `[]` — a durable carrier requires
  widening the committed reward/durable shapes (SelectReward retains only
  granted items; rolled params live on consumed draft cards), which is
  persistence-schema/Author territory beyond the lease; the resolver consumes
  empty params, never invents values.
- `commands.ts` (M03) — `RunPersistenceInstruction` gains the `finalize-death`
  variant: `{ kind, runId, commitId, expectedRevision, summary:
  RunSummarySnapshot }`.
- Store handler (`appStore.ts`, M06) — `combat/report-outcome` branches on the
  transition's instruction kind: `finalize-death` routes to
  `handleCombatFinalizeDeath`, which persists through the repository boundary
  and publishes archive-mode truth (`livingRun: null`, bounded terminal save
  signal). A missing repository implementation fails closed with a rejection
  message. E2e reader (`tests/e2e/indexedDb.ts`, M08) — `StoredProfileRecord`
  gains `lastRunSummary` (new `StoredRunSummaryRecord`) and
  `lastFinalizedRunId`; `StoredLivingRunRecord.roomState.processedOutcomeIds`
  narrows to `readonly string[]`.
- Journey evidence recorded: clearing a battle room by pure pointer play is
  structurally unreachable (exhaustive probe: 7,625 deterministic launches
  across 25 seeds × 61 angles × 5 paddles — zero clears; a loss restores the
  room-entry formation snapshot, so volley damage never accumulates). The
  CA-13/CA-15 browser proofs for clear-time currency and boss defeat remain
  planned; see the session handoff's follow-up for the owner seam.
