# Database Design — SHARDBREAK

## Engine

SHARDBREAK uses **browser IndexedDB** through the architecture's `idb` typed
adapter. The database is local to the deployed origin; it stores gameplay
state only and has no server, account, or network dependency.

| Setting | Value |
|---------|-------|
| Database name | `shardbreak` |
| IndexedDB version | `1` |
| Current save schema version | `1` |
| Object stores | `profile`, `livingRun` |
| Singleton key | `recordKey = "current"` in both stores |
| Runtime validation | Zod schemas plus domain/content-ID validation before every read is accepted or write is committed |
| Migration entry point | `./src/migrations/001_initial.ts`, called from `./src/persistence/database.ts` during `onupgradeneeded` |

IndexedDB does not provide relational foreign keys, `CHECK` constraints, or
cross-store transactions by itself. The singleton keys, versioned envelopes,
Zod validation, and pure run reducer provide those safety guarantees at the
application boundary. The database version controls structural migrations;
`saveSchemaVersion` controls the serialized record format. Neither version is
allowed to change the meaning of a committed outcome silently.

## Schema Overview

There is one current permanent profile record and zero or one current living
run record. The profile owns Shards, unlocks, capped permanent progression,
the local depth record, and the last terminal summary. The living run owns all
temporary state needed to resume a run: its fixed seed, depth, class, build,
Integrity, route offers, materialized room, safe combat checkpoint, shop or
recovery state, and revealed reward draft.

The stores are deliberately small and document-oriented because the entire
game is a single local profile. A room's generated data is stored with the
living run rather than regenerated from the seed on refresh. The seed and
event keys remain the source of reproducibility, while the persisted drafts
and checkpoints prevent a refresh from rerolling or duplicating an outcome.

### Relationship narrative

- `profile` is the permanent root. It may exist without a living run.
- `livingRun` is optional and references catalog content by validated opaque
  `ContentId` values; it never owns a second profile.
- `livingRun.classId`, build IDs, room IDs, boss IDs, enhancement IDs, and
  reward base IDs are logical references into the immutable bundled catalog,
  not rows in IndexedDB.
- A terminal finalization reads both singleton records in one read/write
  transaction, updates `profile`, and deletes `livingRun` before the
  transaction can commit. This is the only normal path from living run to
  terminal profile state.
- A profile import replaces permanent profile fields only. It does not read,
  include, overwrite, or delete `livingRun`.

## Object Stores

### `profile`

One record keyed by the literal `"current"`. This record is the permanent
local profile and is also the source for profile export.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `recordKey` | string | PK; exactly `"current"` | Singleton key; never generated from user input. |
| `profileId` | string | Required; UUID-shaped opaque ID | Local profile identity only; it is not authentication. |
| `saveSchemaVersion` | number | Required; exactly `1` for this release | Future incompatible versions are rejected or explicitly migrated. |
| `contentVersion` | string | Required; known bundled catalog version | Prevents old IDs or semantics from being interpreted by a different catalog. |
| `revision` | number | Required; safe integer `>= 0` | Incremented on every successful profile mutation. |
| `createdAt` | number | Required; finite epoch milliseconds | Metadata only; never used to seed gameplay. |
| `updatedAt` | number | Required; finite epoch milliseconds | Metadata only; never used to seed gameplay. |
| `lastCommitId` | string | Required; non-empty | The most recent successful profile mutation or bootstrap commit. |
| `shards` | number | Required; safe integer `>= 0` | Permanent currency; never confused with run currency. |
| `unlocks` | object | Required; unique known IDs in each list | Permanent classes, starting choices, content, relics, and cosmetics. |
| `utilityUpgradeLevels` | array | Unique known upgrade IDs; non-negative safe levels within catalog caps | Capped permanent utility only; no unbounded combat-stat growth. |
| `relicState` | object | At most one equipped-for-next-run relic | Stores the single selected carry-over relic; unlocked relic IDs live in `unlocks.relicIds`. |
| `records` | object | Non-negative safe integers | Local, non-authoritative personal depth and boss records. |
| `lastRunSummary` | object or null | Validated terminal summary when present | Preserves the summary after `livingRun` is deleted and allows refresh recovery. |
| `pendingRelicChoice` | object or null | One unresolved choice at most; source run ID required | Stored during terminal finalization so relic selection can happen after the living run is deleted. |
| `lastFinalizedRunId` | string or null | Opaque run ID when present | Helps reject a retried terminal command after its living run was already removed. |

#### `profile` value shapes

The following shapes are serialized data contracts. They are validated at the
persistence boundary; they are not executable content.

```typescript
type ContentId = string;

type ProfileUnlocks = {
  classIds: ContentId[];
  startingChoiceIds: ContentId[];
  contentIds: ContentId[];
  relicIds: ContentId[];
  cosmeticIds: ContentId[];
};

type UtilityUpgradeLevel = {
  upgradeId: ContentId;
  level: number;
};

type RelicState = {
  equippedForNextRunId: ContentId | null;
};

type PersonalRecords = {
  highestReachedDepth: number;
  highestBossDepth: number;
  bossesDefeated: number;
};

type RunSummarySnapshot = {
  runId: string;
  classId: ContentId;
  reachedDepth: number;
  bossesReached: number;
  bossesDefeated: number;
  activeSkillIds: ContentId[];
  passiveEquipmentIds: ContentId[];
  carryOverRelicId: ContentId | null;
  shardsEarned: number;
  terminalReason: "death" | "completion" | "abandoned";
  completedAt: number;
};

type PendingRelicChoice = {
  sourceRunId: string;
  options: ContentId[];
  selectedId: ContentId | null;
  commitId: string | null;
};
```

The stored profile envelope is equivalent to:

```typescript
type ProfileRecord = {
  recordKey: "current";
  profileId: string;
  saveSchemaVersion: 1;
  contentVersion: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  lastCommitId: string;
  shards: number;
  unlocks: ProfileUnlocks;
  utilityUpgradeLevels: UtilityUpgradeLevel[];
  relicState: RelicState;
  records: PersonalRecords;
  lastRunSummary: RunSummarySnapshot | null;
  pendingRelicChoice: PendingRelicChoice | null;
  lastFinalizedRunId: string | null;
};
```

**Indexes:**

- The primary key index on `recordKey` is the only index. Every profile read
  addresses the singleton key directly; there is no supported list or filter
  query that would justify a secondary index.

**Relationships:**

- `unlocks.*Ids`, `relicState.*Id`, and summary content IDs reference the
  immutable bundled catalog at the profile's `contentVersion`.
- `pendingRelicChoice.sourceRunId` and `lastFinalizedRunId` are logical
  references to a terminal run, not foreign keys. The living-run record may
  already be deleted when either is present.

### `livingRun`

Zero or one record keyed by the literal `"current"`. Absence of this record
means that no run can be resumed. A living run is never exported.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `recordKey` | string | PK; exactly `"current"` | Singleton key. |
| `runId` | string | Required; UUID-shaped opaque ID | Distinguishes this run from stale commands and prior runs. |
| `saveSchemaVersion` | number | Required; exactly `1` for this release | Validated before load and write. |
| `contentVersion` | string | Required; known bundled catalog version | All referenced content must exist in this version. |
| `revision` | number | Required; safe integer `>= 0` | Expected by every durable command; incremented after each commit. |
| `createdAt` | number | Required; finite epoch milliseconds | Metadata only. |
| `updatedAt` | number | Required; finite epoch milliseconds | Metadata only. |
| `lastCommitId` | string | Required; non-empty | Idempotency and diagnostics marker for the latest durable transition. |
| `seed` | string | Required; non-empty opaque run seed | Kept as a string so deterministic generators are not limited by floating-point integer precision. |
| `phase` | string enum | `route`, `room`, or `reward` | Terminal phases are not retained; finalization deletes this record. |
| `depth` | number | Required; safe integer `>= 1` | Current numbered floor. |
| `cycle` | number | Required; safe integer `>= 1` and `floor((depth - 1) / 3) + 1` | Stored for diagnostics and validated against `depth`. |
| `classId` | `ContentId` | Required; available class at run start | The class's authored starting profile is applied when the run is created. |
| `integrityCurrent` | number | Safe integer `0..integrityMax` | `0` triggers terminal finalization. |
| `integrityMax` | number | Safe integer `>= 1`; within authored run-effect cap | Recovery cannot exceed this value. |
| `runCurrency` | number | Safe integer `>= 0` | Temporary shop economy; never Shards. |
| `build` | object | Max 3 active skills and max 4 passive items | Current run loadout and optional single relic. |
| `progress` | object | Non-negative safe counters | Tracks room and boss progress for the run summary without an unbounded event log. |
| `routeState` | object or null | Required during `route` phase | Persisted route offers prevent refresh rerolls. |
| `roomState` | object or null | Required during `room` phase; valid materialized room | Contains room generation, safe combat checkpoint, and one-time utility state. |
| `rewardState` | object or null | Required during `reward` phase; exactly 3 cards | Contains the fully revealed draft and one-time selection state. |

#### `livingRun` value shapes

```typescript
type RunPhase = "route" | "room" | "reward";
type RoomType = "battle" | "elite" | "shop" | "recovery" | "boss";
type EventKey = string;
type OutcomeId = string;

type BuildSnapshot = {
  activeSkillIds: ContentId[]; // unique; length 0..3
  passiveEquipmentIds: ContentId[]; // unique; length 0..4
  carryOverRelicId: ContentId | null;
};

type RouteOfferSnapshot = {
  offerId: string;
  roomType: RoomType;
  roomEventKey: EventKey;
  riskTier: number;
  rewardPreviewId: ContentId | null;
  visibleCost: number;
  availability: "available" | "unavailable";
};

type RouteState = {
  eventKey: EventKey;
  offers: RouteOfferSnapshot[];
  selectedOfferId: string | null;
  committed: boolean;
};

type SkillChargeSnapshot = {
  skillId: ContentId;
  remaining: number;
  maximum: number;
};

type CombatEnemySnapshot = {
  enemyInstanceId: string;
  enemyId: ContentId;
  health: number;
  stateId: string;
  defeated: boolean;
};

type HazardStateSnapshot = {
  hazardInstanceId: string;
  hazardId: ContentId;
  state: "telegraphed" | "active" | "resolved";
  remainingSteps: number;
};

type BossCombatStateSnapshot = {
  archetypeId: ContentId;
  health: number;
  phaseId: string;
  modifierIds: ContentId[];
  activeTelegraphId: string | null;
  counters: Array<{
    counterId: string;
    value: number;
  }>;
};

type CombatCheckpoint = {
  kind: "pre_launch" | "loss_of_ball";
  paddleX: number;
  aimAngle: number;
  ballAttached: true;
  enemies: CombatEnemySnapshot[];
  hazards: HazardStateSnapshot[];
  bossState: BossCombatStateSnapshot | null;
  skillCharges: SkillChargeSnapshot[];
};

type ShopItemSnapshot = {
  itemId: ContentId;
  price: number;
  effectParams: Array<{
    key: string;
    value: string | number | boolean;
  }>;
};

type ShopState = {
  inventory: ShopItemSnapshot[];
  purchasedItemIds: ContentId[];
};

type RecoveryState = {
  eventKey: EventKey;
  restoreAmount: number;
  committed: boolean;
  commitId: string | null;
};

type BossState = {
  archetypeId: ContentId;
  modifierIds: ContentId[];
  phaseId: string;
  defeated: boolean;
};

type ThreatProfileSnapshot = {
  budget: number;
  durabilityFactor: number;
  density: number;
  formationId: ContentId;
  hazardIds: ContentId[];
  bossModifierIds: ContentId[];
};

type RoomState = {
  roomId: string;
  roomType: RoomType;
  eventKey: EventKey;
  status: "ready" | "in_progress" | "resolved";
  objectiveIds: ContentId[];
  threatProfile: ThreatProfileSnapshot;
  combatCheckpoint: CombatCheckpoint | null;
  processedOutcomeIds: OutcomeId[];
  shop: ShopState | null;
  recovery: RecoveryState | null;
  boss: BossState | null;
  resolutionCommitId: string | null;
};

type RewardCardSnapshot = {
  cardId: string;
  baseRewardId: ContentId;
  rewardType: "skill" | "equipment" | "upgrade" | "currency" | "relic";
  enhancementIds: ContentId[];
  rolledParams: Array<{
    key: string;
    value: string | number | boolean;
  }>;
  materialCost: number;
  tradeoffId: ContentId | null;
};

type RewardState = {
  eventKey: EventKey;
  sourceRoomId: string;
  cards: [RewardCardSnapshot, RewardCardSnapshot, RewardCardSnapshot];
  selectedCardId: string | null;
  selectionCommitId: string | null;
  status: "offered" | "selected" | "applied";
};
```

`effectParams` and `rolledParams` are closed validated value objects in the
implementation, not arbitrary code or URLs. Their keys are allowlisted by the
authored item or reward definition. Persistence must reject functions, class
instances, oversized values, non-finite numbers, unexpected keys, and content
identifiers that are not available in `contentVersion`.

The stored living-run envelope is equivalent to:

```typescript
type LivingRunRecord = {
  recordKey: "current";
  runId: string;
  saveSchemaVersion: 1;
  contentVersion: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
  lastCommitId: string;
  seed: string;
  phase: RunPhase;
  depth: number;
  cycle: number;
  classId: ContentId;
  integrityCurrent: number;
  integrityMax: number;
  runCurrency: number;
  build: BuildSnapshot;
  progress: {
    roomsResolved: number;
    bossesReached: number;
    bossesDefeated: number;
  };
  routeState: RouteState | null;
  roomState: RoomState | null;
  rewardState: RewardState | null;
};
```

**Indexes:**

- The primary key index on `recordKey` is the only index. Resume, checkpoint,
  and terminal queries always address the current singleton; the application
  never scans living runs or maintains a second active-run index.

**Relationships:**

- `classId`, build IDs, route previews, room objectives, enemy/formation IDs,
  boss IDs, hazard IDs, enhancement IDs, and reward IDs reference the bundled
  catalog at `contentVersion`.
- `roomState.eventKey`, `routeState.eventKey`, and `rewardState.eventKey`
  identify deterministic generated events. They are not database foreign keys.
- `rewardState.sourceRoomId` and `roomState.resolutionCommitId` connect the
  reward or room completion to the current run's materialized room.

## Invariants and Validation Rules

The repository validates records with Zod before exposing them to the domain,
and validates the domain transition again before writing. The following rules
are mandatory:

- There is at most one `profile` record and at most one `livingRun` record;
  both use the literal singleton key.
- `saveSchemaVersion` must be supported. A newer or incompatible version is
  rejected without changing the existing record.
- Every number is finite and a safe integer unless the field is explicitly a
  real-valued combat parameter; all persisted combat parameters still have
  authored finite ranges.
- A living run has `depth >= 1`, `cycle = floor((depth - 1) / 3) + 1`, and a
  boss room is mandatory whenever `depth % 3 === 0`.
- `integrityCurrent` is between zero and `integrityMax`; `integrityMax` and
  all permanent utility levels remain within catalog-authored caps.
- Active skill IDs are unique and limited to three. Passive equipment IDs are
  unique and limited to four. Skill charges are integer values from zero to
  their authored maximum and cannot be negative.
- A route stores every generated offer before commitment. A selected offer
  must be one of those offers and can be committed once only.
- A shop stores finite inventory and prices before the shop is shown. A
  purchase must reference an unpurchased inventory item and have an affordable
  non-negative price.
- A recovery event stores its authored restore amount before commitment;
  applying it clamps current Integrity to `integrityMax` and cannot happen
  twice for the same room event.
- A reward state contains exactly three unique card IDs. Each card's base
  reward and enhancement IDs are known and compatible. `selectedCardId` is
  either null or one of those three IDs, and an applied reward cannot be
  selected again.
- `processedOutcomeIds` is scoped to the materialized room. Together with
  `roomId`, `resolutionCommitId`, `selectionCommitId`, `committed`, and the
  expected `revision`, it prevents duplicate combat outcomes, purchases,
  recovery, room completion, and reward selection without growing an
  unbounded run-wide event log.
- `records.highestReachedDepth` is updated only as part of a committed floor
  entry. It is the greatest numbered floor entered by a valid checkpoint,
  including a boss floor reached before death; it is never inferred from an
  uncommitted Canvas frame.
- Profile unlock lists and relic lists contain unique known IDs. A selected
  or equipped relic must be unlocked, and there is never more than one
  carry-over relic on a run.
- Imported profile JSON is parsed as data, checked for format/version,
  canonical digest, ranges, known IDs, and caps before any profile write.
  Invalid input leaves both existing stores untouched.

## Transaction Boundaries

All commands that can change durable state carry an `expectedRevision` and a
caller-generated `commitId`. The repository checks both the current record and
the domain transition before writing.

| Operation | IndexedDB transaction | Atomic effect |
|-----------|----------------------|---------------|
| Bootstrap profile | `profile` read/write | Create the singleton default profile only when it does not exist. |
| Start run | `profile`, `livingRun` read/write | Verify no living run exists, then create exactly one living run from the profile. |
| Checkpoint or room action | `livingRun` read/write; `profile` also when a floor record changes | Verify run ID and revision, then replace the current living record with revision + 1. A floor entry updates the profile record in the same transaction. |
| Finalize death/completion | `profile`, `livingRun` read/write | Calculate Shards and record/summary changes, optionally store a pending relic choice, write the new profile, and delete `livingRun` in one transaction. |
| Abandon run | `livingRun` read/write | Verify the run ID/revision and delete the singleton; no silent new run is created. |
| Choose relic or dismiss terminal summary | `profile` read/write | Apply or resolve the one pending profile choice exactly once. |
| Export profile | `profile` readonly | Read permanent profile progression only; never read living-run state into the export. |
| Import profile | `profile` read/write | Validate and digest-check the complete incoming payload before replacing permanent profile fields. `livingRun` is not part of the transaction. |
| Reset profile | `profile`, `livingRun` read/write | After explicit confirmation, delete the old profile and living run and create a fresh default profile atomically. |

If a transaction aborts, the prior valid checkpoint remains. If a response is
lost after commit, a retry with the old revision is rejected as stale; a
terminal retry also finds no matching living run or matches
`lastFinalizedRunId` and cannot award Shards twice.

## Seed Data

The migration contains **no content seed rows**. Classes, skills, equipment,
rooms, bosses, enhancements, relics, and cosmetics are immutable bundled
catalog definitions owned by `./src/domain/content/`.

On first boot, the persistence repository creates the profile singleton with:

- `shards = 0`;
- zero personal depth and boss records;
- the catalog's explicitly available initial classes in `unlocks.classIds`;
- empty run-scoped and permanent unlock lists beyond those initial classes;
- no utility upgrade levels, no selected relic, no pending relic choice, and
  no last terminal summary.

The bootstrap write is a normal validated profile commit, not a migration
side effect. This keeps upgrades safe for an existing profile and lets the
catalog define which initial content is available.

## Query Patterns

| Pattern | Query shape | Index used |
|---------|-------------|------------|
| Load the local profile | `profile.get("current")` | `profile` primary key `recordKey` |
| Load a living run | `livingRun.get("current")` | `livingRun` primary key `recordKey` |
| Create a run only if none exists | Read `livingRun.get("current")`, then `livingRun.put(record)` in one transaction | `livingRun` primary key `recordKey` |
| Save a checkpoint | Read current living run, compare `runId`/`revision`, then `livingRun.put(next)` | `livingRun` primary key `recordKey` |
| Record a new reached floor | Read both current records, update profile record and living run in one transaction | Both primary key indexes |
| Finalize a run | Read both current records, `profile.put(nextProfile)`, then `livingRun.delete("current")` | Both primary key indexes |
| Resolve a pending relic choice | Read current profile, compare pending source/commit, then `profile.put(nextProfile)` | `profile` primary key `recordKey` |
| Export permanent progression | Read current profile and project only exportable fields | `profile` primary key `recordKey` |
| Import permanent progression | Validate in memory, then replace current profile in one write transaction | `profile` primary key `recordKey` |
| Reset local data | Delete both singleton keys and create a validated default profile in one transaction | Both primary key indexes |

No query lists historical runs, individual rooms, or catalog entities. Adding
secondary indexes or an event-log store would be speculative and would create
another source of truth for a product that intentionally supports one living
run.

## Profile Transfer Format

`exportProfile()` produces canonical JSON containing permanent progression
only. Active living-run state, route offers, shop inventory, room checkpoints,
reward drafts, and combat state are excluded.

```typescript
type ProfileExport = {
  format: "shardbreak-profile";
  exportSchemaVersion: 1;
  contentVersion: string;
  profile: {
    shards: number;
    unlocks: ProfileUnlocks;
    utilityUpgradeLevels: UtilityUpgradeLevel[];
    relicState: RelicState;
    records: PersonalRecords;
  };
  digest: {
    algorithm: "SHA-256";
    value: string;
  };
};
```

The digest is computed over the canonical payload without the `digest` field.
It detects accidental corruption or ordinary edit mismatch; it is not a
competitive anti-cheat mechanism. Import must validate the format marker,
export schema, content version compatibility, digest, known IDs, ranges, and
caps before replacing the profile's permanent fields. The current local
`livingRun` remains byte-for-byte untouched by import.

## Migration History

| # | Description | File |
|---|-------------|------|
| 001 | Create singleton `profile` and `livingRun` object stores for save schema version 1 | `./src/migrations/001_initial.ts` |

Migrations are forward-only. Once released, `001_initial.ts` must not be
edited to change an existing record's meaning. A future structural change
gets a new numbered migration and an explicit save-schema migration or
rejection path. The initial migration is idempotent when its object stores
already exist, which makes upgrade callback wiring safe during development.
