import type { ContentCatalog, ContentId, ContentVersion } from "../content/catalog";
import { createInitialRouteState } from "./routes";

/**
 * Serialized save-record format version. Distinct from the IndexedDB structural
 * version and the content version; a deployment may never reinterpret a
 * committed record by silently changing this value.
 */
export const SAVE_SCHEMA_VERSION = 1;
export type SaveSchemaVersion = typeof SAVE_SCHEMA_VERSION;

/** Singleton key shared by the `profile` and `livingRun` stores. */
export const CURRENT_RECORD_KEY = "current";
export type RecordKey = typeof CURRENT_RECORD_KEY;

export type RunPhase = "route" | "room" | "reward";
export type RoomType = "battle" | "elite" | "shop" | "recovery" | "boss";
export type EventKey = string;
export type OutcomeId = string;
export type TerminalReason = "death" | "completion" | "abandoned";

// --- Profile value shapes -------------------------------------------------

export interface ProfileUnlocks {
  readonly classIds: readonly ContentId[];
  readonly startingChoiceIds: readonly ContentId[];
  readonly contentIds: readonly ContentId[];
  readonly relicIds: readonly ContentId[];
  readonly cosmeticIds: readonly ContentId[];
}

export interface UtilityUpgradeLevel {
  readonly upgradeId: ContentId;
  readonly level: number;
}

export interface RelicState {
  readonly equippedForNextRunId: ContentId | null;
}

export interface PersonalRecords {
  readonly highestReachedDepth: number;
  readonly highestBossDepth: number;
  readonly bossesDefeated: number;
}

export interface RunSummarySnapshot {
  readonly runId: string;
  readonly classId: ContentId;
  readonly reachedDepth: number;
  readonly bossesReached: number;
  readonly bossesDefeated: number;
  readonly activeSkillIds: readonly ContentId[];
  readonly passiveEquipmentIds: readonly ContentId[];
  readonly carryOverRelicId: ContentId | null;
  readonly shardsEarned: number;
  readonly terminalReason: TerminalReason;
  readonly completedAt: number;
}

export interface PendingRelicChoice {
  readonly sourceRunId: string;
  readonly options: readonly ContentId[];
  readonly selectedId: ContentId | null;
  readonly commitId: string | null;
}

export interface Profile {
  readonly recordKey: RecordKey;
  readonly profileId: string;
  readonly saveSchemaVersion: SaveSchemaVersion;
  readonly contentVersion: ContentVersion;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastCommitId: string;
  readonly shards: number;
  readonly unlocks: ProfileUnlocks;
  readonly utilityUpgradeLevels: readonly UtilityUpgradeLevel[];
  readonly relicState: RelicState;
  readonly records: PersonalRecords;
  readonly lastRunSummary: RunSummarySnapshot | null;
  readonly pendingRelicChoice: PendingRelicChoice | null;
  readonly lastFinalizedRunId: string | null;
}

// --- Living-run value shapes ----------------------------------------------

export interface BuildSnapshot {
  readonly activeSkillIds: readonly ContentId[];
  readonly passiveEquipmentIds: readonly ContentId[];
  readonly carryOverRelicId: ContentId | null;
}

export interface RunProgress {
  readonly roomsResolved: number;
  readonly bossesReached: number;
  readonly bossesDefeated: number;
}

export interface RouteOfferSnapshot {
  readonly offerId: string;
  readonly roomType: RoomType;
  readonly roomEventKey: EventKey;
  readonly riskTier: number;
  readonly rewardPreviewId: ContentId | null;
  readonly visibleCost: number;
  readonly availability: "available" | "unavailable";
}

export interface RouteState {
  readonly eventKey: EventKey;
  readonly offers: readonly RouteOfferSnapshot[];
  readonly selectedOfferId: string | null;
  readonly committed: boolean;
}

export interface SkillChargeSnapshot {
  readonly skillId: ContentId;
  readonly remaining: number;
  readonly maximum: number;
}

export interface CombatEnemySnapshot {
  readonly enemyInstanceId: string;
  readonly enemyId: ContentId;
  readonly health: number;
  readonly stateId: string;
  readonly defeated: boolean;
}

export interface HazardStateSnapshot {
  readonly hazardInstanceId: string;
  readonly hazardId: ContentId;
  readonly state: "telegraphed" | "active" | "resolved";
  readonly remainingSteps: number;
}

export interface BossCombatStateSnapshot {
  readonly archetypeId: ContentId;
  readonly health: number;
  readonly phaseId: string;
  readonly modifierIds: readonly ContentId[];
  readonly activeTelegraphId: string | null;
  readonly counters: readonly { readonly counterId: string; readonly value: number }[];
}

export interface CombatCheckpoint {
  readonly kind: "pre_launch" | "loss_of_ball";
  readonly paddleX: number;
  readonly aimAngle: number;
  readonly ballAttached: true;
  readonly enemies: readonly CombatEnemySnapshot[];
  readonly hazards: readonly HazardStateSnapshot[];
  readonly bossState: BossCombatStateSnapshot | null;
  readonly skillCharges: readonly SkillChargeSnapshot[];
}

export type EffectParamValue = string | number | boolean;

export interface EffectParam {
  readonly key: string;
  readonly value: EffectParamValue;
}

export interface ShopItemSnapshot {
  readonly itemId: ContentId;
  readonly price: number;
  readonly effectParams: readonly EffectParam[];
}

export interface ShopState {
  readonly inventory: readonly ShopItemSnapshot[];
  readonly purchasedItemIds: readonly ContentId[];
}

export interface RecoveryState {
  readonly eventKey: EventKey;
  readonly restoreAmount: number;
  readonly committed: boolean;
  readonly commitId: string | null;
}

export interface BossState {
  readonly archetypeId: ContentId;
  readonly modifierIds: readonly ContentId[];
  readonly phaseId: string;
  readonly defeated: boolean;
}

export interface ThreatProfileSnapshot {
  readonly budget: number;
  readonly durabilityFactor: number;
  readonly density: number;
  readonly formationId: ContentId;
  readonly hazardIds: readonly ContentId[];
  readonly bossModifierIds: readonly ContentId[];
}

export interface RoomState {
  readonly roomId: string;
  readonly roomType: RoomType;
  readonly eventKey: EventKey;
  readonly status: "ready" | "in_progress" | "resolved";
  readonly objectiveIds: readonly ContentId[];
  readonly threatProfile: ThreatProfileSnapshot;
  readonly combatCheckpoint: CombatCheckpoint | null;
  readonly processedOutcomeIds: readonly OutcomeId[];
  readonly shop: ShopState | null;
  readonly recovery: RecoveryState | null;
  readonly boss: BossState | null;
  readonly resolutionCommitId: string | null;
}

export interface RewardCardSnapshot {
  readonly cardId: string;
  readonly baseRewardId: ContentId;
  readonly rewardType: "skill" | "equipment" | "upgrade" | "currency" | "relic";
  readonly enhancementIds: readonly ContentId[];
  readonly rolledParams: readonly EffectParam[];
  readonly materialCost: number;
  readonly tradeoffId: ContentId | null;
}

export interface RewardState {
  readonly eventKey: EventKey;
  readonly sourceRoomId: string;
  readonly cards: readonly [RewardCardSnapshot, RewardCardSnapshot, RewardCardSnapshot];
  readonly selectedCardId: string | null;
  readonly selectionCommitId: string | null;
  readonly status: "offered" | "selected" | "applied";
}

export interface LivingRun {
  readonly recordKey: RecordKey;
  readonly runId: string;
  readonly saveSchemaVersion: SaveSchemaVersion;
  readonly contentVersion: ContentVersion;
  readonly revision: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastCommitId: string;
  readonly seed: string;
  readonly phase: RunPhase;
  readonly depth: number;
  readonly cycle: number;
  readonly classId: ContentId;
  readonly integrityCurrent: number;
  readonly integrityMax: number;
  readonly runCurrency: number;
  readonly build: BuildSnapshot;
  readonly progress: RunProgress;
  readonly routeState: RouteState | null;
  readonly roomState: RoomState | null;
  readonly rewardState: RewardState | null;
}

/**
 * Combined authoritative run state: exactly one permanent profile and zero or
 * one living run. Adapters observe and persist this snapshot; the pure reducer
 * derives the next one.
 */
export interface RunState {
  readonly profile: Profile;
  readonly livingRun: LivingRun | null;
}

/** Caller-supplied, nondeterministic inputs for a fresh profile. */
export interface ProfileCreationMetadata {
  readonly profileId: string;
  readonly now: number;
  readonly commitId: string;
}

/**
 * Build the version-1 default profile. Zero Shards and records, exactly the
 * catalog's initial class unlocks, no upgrades/relic/summary/pending choice,
 * revision 0, and the known schema/content versions. All nondeterministic
 * inputs arrive as parameters so the factory stays pure.
 */
export function createDefaultProfile(
  catalog: ContentCatalog,
  metadata: ProfileCreationMetadata,
): Profile {
  return {
    recordKey: CURRENT_RECORD_KEY,
    profileId: metadata.profileId,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion: catalog.contentVersion,
    revision: 0,
    createdAt: metadata.now,
    updatedAt: metadata.now,
    lastCommitId: metadata.commitId,
    shards: 0,
    unlocks: {
      classIds: [...catalog.initialClassUnlockIds()],
      startingChoiceIds: [],
      contentIds: [],
      relicIds: [],
      cosmeticIds: [],
    },
    utilityUpgradeLevels: [],
    relicState: { equippedForNextRunId: null },
    records: {
      highestReachedDepth: 0,
      highestBossDepth: 0,
      bossesDefeated: 0,
    },
    lastRunSummary: null,
    pendingRelicChoice: null,
    lastFinalizedRunId: null,
  };
}

/** Caller-supplied identity for a freshly created living run. */
export interface RunCreationMetadata {
  readonly runId: string;
  readonly seed: string;
  readonly now: number;
  readonly commitId: string;
}

/**
 * Build the depth-1 living run for a class. Integrity starts at the class
 * maximum, the build is empty aside from an optional carry-over relic, progress
 * is zeroed, and the run opens on a named but unmaterialized route checkpoint
 * (empty offers, no selection, uncommitted).
 */
export function createInitialLivingRun(
  contentVersion: ContentVersion,
  classId: ContentId,
  startingIntegrity: number,
  carryOverRelicId: ContentId | null,
  metadata: RunCreationMetadata,
): LivingRun {
  return {
    recordKey: CURRENT_RECORD_KEY,
    runId: metadata.runId,
    saveSchemaVersion: SAVE_SCHEMA_VERSION,
    contentVersion,
    revision: 0,
    createdAt: metadata.now,
    updatedAt: metadata.now,
    lastCommitId: metadata.commitId,
    seed: metadata.seed,
    phase: "route",
    depth: 1,
    cycle: 1,
    classId,
    integrityCurrent: startingIntegrity,
    integrityMax: startingIntegrity,
    runCurrency: 0,
    build: {
      activeSkillIds: [],
      passiveEquipmentIds: [],
      carryOverRelicId,
    },
    progress: {
      roomsResolved: 0,
      bossesReached: 0,
      bossesDefeated: 0,
    },
    routeState: createInitialRouteState(metadata.runId, contentVersion),
    roomState: null,
    rewardState: null,
  };
}
