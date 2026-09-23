import { createCombatState, toCombatCheckpoint } from "../combat/layout";
import type {
  ContentCatalog,
  ContentId,
  ContentVersion,
} from "../content/catalog";
import type { EnhancementDefinition } from "../content/enhancements";
import type { EquipmentDefinition } from "../content/equipment";
import type { CombatCheckpoint, EffectParam } from "../run/model";
import type { RoomDefinition, RoomType } from "../content/rooms";
import { RECOVERY_RESTORE_AMOUNT } from "../content/rooms";
import type { SkillDefinition } from "../content/skills";
import type { EventKey } from "./seededRng";
import { deriveStream } from "./seededRng";

export interface RouteGenerationContext {
  readonly seed: string;
  readonly contentVersion: ContentVersion;
  readonly runId: string;
  readonly depth: number;
  readonly cycle: number;
  readonly integrityCurrent: number;
  readonly integrityMax: number;
  readonly runCurrency: number;
  readonly routeEventKey: EventKey;
}

export interface GeneratedRouteOffer {
  readonly offerId: string;
  readonly roomDefinitionId: ContentId;
  readonly roomType: RoomType;
  readonly roomEventKey: EventKey;
  readonly displayName: string;
  readonly summary: string;
  readonly riskLabel: string;
  readonly rewardLabel: string;
  readonly counterplay: string;
  readonly riskTier: number;
  readonly rewardPreviewId: ContentId | null;
  readonly visibleCost: number;
  readonly availability: "available" | "unavailable";
}

export interface ThreatGenerationContext {
  readonly seed: string;
  readonly contentVersion: ContentVersion;
  readonly depth: number;
  readonly cycle: number;
  readonly roomEventKey: EventKey;
  readonly roomDefinitionId: ContentId;
}

export interface ThreatDiagnostics {
  readonly depthFactor: number;
  readonly cycleFactor: number;
  readonly budgetJitter: number;
  readonly durabilityJitter: number;
}

export interface GeneratedThreatProfile {
  readonly budget: number;
  readonly durabilityFactor: number;
  readonly density: number;
  readonly formationId: ContentId;
  readonly hazardIds: readonly ContentId[];
  readonly bossModifierIds: readonly ContentId[];
  readonly diagnostics: ThreatDiagnostics;
}

export interface ShopGenerationContext {
  readonly seed: string;
  readonly contentVersion: ContentVersion;
  readonly depth: number;
  readonly cycle: number;
  readonly roomEventKey: EventKey;
}

export interface GeneratedEffectParam {
  readonly key: "restoreAmount";
  readonly value: 1 | 2;
}

export interface GeneratedShopItem {
  readonly itemId: ContentId;
  readonly price: number;
  readonly effectParams: readonly GeneratedEffectParam[];
}

export interface GeneratedShopState {
  readonly inventory: readonly GeneratedShopItem[];
  readonly purchasedItemIds: readonly ContentId[];
}

export interface GeneratedRecoveryState {
  readonly eventKey: EventKey;
  readonly restoreAmount: 1;
  readonly committed: false;
  readonly commitId: null;
}

export interface GeneratedBossState {
  readonly archetypeId: ContentId;
  readonly modifierIds: readonly ContentId[];
  readonly phaseId: "routing";
  readonly defeated: false;
  readonly displayName: string;
  readonly identityLabel: string;
}

export interface RoomGenerationContext extends RouteGenerationContext {
  readonly selectedOfferId: string;
}

export interface GeneratedRoomCandidate {
  readonly roomId: string;
  readonly authoredRoomId: ContentId;
  readonly roomType: RoomType;
  readonly eventKey: EventKey;
  readonly status: "ready";
  readonly displayName: string;
  readonly summary: string;
  readonly counterplay: string;
  readonly objectiveIds: readonly ContentId[];
  readonly threatProfile: GeneratedThreatProfile;
  readonly combatCheckpoint: CombatCheckpoint | null;
  readonly processedOutcomeIds: readonly string[];
  readonly shop: GeneratedShopState | null;
  readonly recovery: GeneratedRecoveryState | null;
  readonly boss: GeneratedBossState | null;
  readonly resolutionCommitId: null;
}

/** Caller-supplied coordinates for a seeded three-card reward draft. */
export interface RewardGenerationContext {
  readonly seed: string;
  readonly contentVersion: ContentVersion;
  readonly runId: string;
  readonly depth: number;
  readonly cycle: number;
  readonly roomEventKey: EventKey;
  readonly roomType: RoomType;
  readonly activeSkillSlotsUsed: number;
  readonly passiveEquipmentSlotsUsed: number;
}

/** One fully revealed reward card as generated, before reducer mapping. */
export interface GeneratedRewardCard {
  readonly cardId: string;
  readonly baseRewardId: ContentId;
  readonly rewardType: "skill" | "equipment";
  readonly enhancementIds: readonly ContentId[];
  readonly rolledParams: readonly EffectParam[];
  readonly materialCost: number;
  readonly tradeoffId: ContentId | null;
}

/** The complete, deterministic reward draft for one resolved room. */
export interface GeneratedRewardDraft {
  readonly eventKey: EventKey;
  readonly sourceRoomId: string;
  readonly cards: readonly [
    GeneratedRewardCard,
    GeneratedRewardCard,
    GeneratedRewardCard,
  ];
}

export const THREAT_LIMITS = Object.freeze({
  maxBudget: 72,
  maxDurabilityFactor: 4,
  maxDensity: 12,
  maxHazards: 2,
});

export const SHOP_PRICE_CAP = 96;

const NON_BOSS_PRESENTATION_ORDER: readonly RoomType[] = Object.freeze([
  "battle",
  "elite",
  "shop",
  "recovery",
]);

interface BaseGenerationContext {
  readonly seed: string;
  readonly contentVersion: ContentVersion;
  readonly depth: number;
  readonly cycle: number;
}

const compareIds = (left: ContentId, right: ContentId): number =>
  left < right ? -1 : left > right ? 1 : 0;

function requireNonBlank(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${label} must be a non-blank string`);
  }
}

function validateBaseContext(
  catalog: ContentCatalog,
  context: BaseGenerationContext,
): void {
  requireNonBlank(context.seed, "seed");
  requireNonBlank(context.contentVersion, "contentVersion");
  if (context.contentVersion !== catalog.contentVersion) {
    throw new RangeError(
      `content version ${context.contentVersion} does not match ${catalog.contentVersion}`,
    );
  }
  if (!Number.isSafeInteger(context.depth) || context.depth < 1) {
    throw new RangeError("depth must be a safe integer >= 1");
  }
  if (!Number.isSafeInteger(context.cycle) || context.cycle < 1) {
    throw new RangeError("cycle must be a safe integer >= 1");
  }
  const expectedCycle = Math.floor((context.depth - 1) / 3) + 1;
  if (context.cycle !== expectedCycle) {
    throw new RangeError(
      `cycle ${String(context.cycle)} does not match depth ${String(context.depth)}`,
    );
  }
}

function validateRouteContext(
  catalog: ContentCatalog,
  context: RouteGenerationContext,
): void {
  validateBaseContext(catalog, context);
  requireNonBlank(context.runId, "runId");
  requireNonBlank(context.routeEventKey, "routeEventKey");
  if (!Number.isSafeInteger(context.integrityMax) || context.integrityMax < 1) {
    throw new RangeError("integrityMax must be a safe integer >= 1");
  }
  if (
    !Number.isSafeInteger(context.integrityCurrent) ||
    context.integrityCurrent < 0 ||
    context.integrityCurrent > context.integrityMax
  ) {
    throw new RangeError("integrityCurrent must be within the run maximum");
  }
  if (!Number.isSafeInteger(context.runCurrency) || context.runCurrency < 0) {
    throw new RangeError("runCurrency must be a non-negative safe integer");
  }
}

function requireRoom(
  catalog: ContentCatalog,
  roomDefinitionId: ContentId,
): RoomDefinition {
  const result = catalog.getRoom(roomDefinitionId);
  if (!result.ok) {
    throw new RangeError(`unknown room definition: ${roomDefinitionId}`);
  }
  return result.value;
}

function requireRoomType(
  catalog: ContentCatalog,
  roomType: RoomType,
): RoomDefinition {
  const room = catalog
    .listRooms()
    .find((definition) => definition.roomType === roomType);
  if (room === undefined) {
    throw new Error(`catalog has no ${roomType} room`);
  }
  return room;
}

function roomEventKey(
  context: RouteGenerationContext,
  room: RoomDefinition,
): EventKey {
  return `${context.routeEventKey}:room:${room.id}`;
}

function riskTierFor(
  context: RouteGenerationContext,
  room: RoomDefinition,
): number {
  if (room.baseRiskTier === 0 || room.roomType === "boss") {
    return room.baseRiskTier;
  }
  const rng = deriveStream(
    context.seed,
    context.contentVersion,
    `${context.routeEventKey}:risk:${room.id}`,
  );
  return Math.max(1, Math.min(5, room.baseRiskTier + rng.nextInt(3) - 1));
}

function offerForRoom(
  catalog: ContentCatalog,
  context: RouteGenerationContext,
  room: RoomDefinition,
): GeneratedRouteOffer {
  const eventKey = roomEventKey(context, room);
  const visibleCost =
    room.roomType === "shop"
      ? Math.min(
          ...generateShopInventory(catalog, {
            seed: context.seed,
            contentVersion: context.contentVersion,
            depth: context.depth,
            cycle: context.cycle,
            roomEventKey: eventKey,
          }).map((item) => item.price),
        )
      : 0;

  return Object.freeze({
    offerId: `${context.routeEventKey}:offer:${room.id}`,
    roomDefinitionId: room.id,
    roomType: room.roomType,
    roomEventKey: eventKey,
    displayName: room.displayName,
    summary: room.summary,
    riskLabel: room.riskLabel,
    rewardLabel: room.rewardLabel,
    counterplay: room.counterplay,
    riskTier: riskTierFor(context, room),
    rewardPreviewId: room.rewardPreviewId,
    visibleCost,
    availability: "available",
  });
}

/** Generate the complete persisted choice set for one route event. */
export function generateRouteOptions(
  catalog: ContentCatalog,
  context: RouteGenerationContext,
): readonly GeneratedRouteOffer[] {
  validateRouteContext(catalog, context);

  if (context.depth % 3 === 0) {
    return Object.freeze([
      offerForRoom(catalog, context, requireRoomType(catalog, "boss")),
    ]);
  }

  return Object.freeze(
    NON_BOSS_PRESENTATION_ORDER.map((roomType) =>
      offerForRoom(catalog, context, requireRoomType(catalog, roomType)),
    ),
  );
}

const roundToThousandth = (value: number): number =>
  Math.round(value * 1_000) / 1_000;

/** Generate bounded threat data without importing or mutating run state. */
export function generateThreatProfile(
  catalog: ContentCatalog,
  context: ThreatGenerationContext,
): GeneratedThreatProfile {
  validateBaseContext(catalog, context);
  requireNonBlank(context.roomEventKey, "roomEventKey");
  const room = requireRoom(catalog, context.roomDefinitionId);
  const rng = deriveStream(
    context.seed,
    context.contentVersion,
    `${context.roomEventKey}:threat-profile`,
  );
  const depthFactor = Math.log2(context.depth + 1);
  const cycleFactor = Math.log2(context.cycle + 1);
  const budgetJitter = rng.nextInt(4);
  const durabilityJitter = rng.nextInt(6) / 100;
  const densityJitter = rng.nextInt(2);
  const isUtility = room.roomType === "shop" || room.roomType === "recovery";

  const budget = isUtility
    ? 0
    : Math.min(
        THREAT_LIMITS.maxBudget,
        6 +
          Math.floor(depthFactor * 3) +
          Math.floor(cycleFactor * 2) +
          room.baseRiskTier * 2 +
          budgetJitter,
      );
  const durabilityFactor = isUtility
    ? 1
    : Math.min(
        THREAT_LIMITS.maxDurabilityFactor,
        roundToThousandth(
          1 + depthFactor * 0.075 + cycleFactor * 0.025 + durabilityJitter,
        ),
      );
  const density = isUtility
    ? 0
    : Math.min(
        THREAT_LIMITS.maxDensity,
        3 +
          Math.floor(depthFactor / 2) +
          room.baseRiskTier +
          densityJitter,
      );

  const hazardPool = [...room.hazardPoolIds].sort(compareIds);
  const hazardCount = isUtility
    ? 0
    : Math.min(
        hazardPool.length,
        THREAT_LIMITS.maxHazards,
        1 + (context.cycle >= 3 ? 1 : 0),
      );
  const hazardIds = Object.freeze(
    [...rng.shuffle(hazardPool).slice(0, hazardCount)],
  );
  const diagnostics = Object.freeze({
    depthFactor: roundToThousandth(depthFactor),
    cycleFactor: roundToThousandth(cycleFactor),
    budgetJitter,
    durabilityJitter,
  });

  return Object.freeze({
    budget,
    durabilityFactor,
    density,
    formationId: room.formationId,
    hazardIds,
    bossModifierIds: Object.freeze([]),
    diagnostics,
  });
}

/** Materialize finite service order, prices, and allowlisted effect params. */
export function generateShopInventory(
  catalog: ContentCatalog,
  context: ShopGenerationContext,
): readonly GeneratedShopItem[] {
  validateBaseContext(catalog, context);
  requireNonBlank(context.roomEventKey, "roomEventKey");
  const sortedServices = [...catalog.listShopServices()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const orderRng = deriveStream(
    context.seed,
    context.contentVersion,
    `${context.roomEventKey}:shop-order`,
  );
  const orderedServices = orderRng.shuffle(sortedServices);
  const depthSurcharge = Math.min(16, Math.floor(Math.log2(context.depth + 1)));
  const cycleSurcharge = Math.min(8, Math.floor(Math.log2(context.cycle + 1)));

  return Object.freeze(
    orderedServices.map((service) => {
      const priceRng = deriveStream(
        context.seed,
        context.contentVersion,
        `${context.roomEventKey}:shop-price:${service.id}`,
      );
      const price = Math.min(
        SHOP_PRICE_CAP,
        service.basePrice + depthSurcharge + cycleSurcharge + priceRng.nextInt(5),
      );
      return Object.freeze({
        itemId: service.id,
        price,
        effectParams: Object.freeze([
          Object.freeze({
            key: "restoreAmount",
            value: service.effect.amount,
          }),
        ]),
      });
    }),
  );
}

function generateBossState(
  catalog: ContentCatalog,
  context: BaseGenerationContext & { readonly roomEventKey: EventKey },
): GeneratedBossState {
  const bosses = [...catalog.listBosses()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  if (bosses.length === 0) {
    throw new Error("catalog has no boss routing identities");
  }
  const rng = deriveStream(
    context.seed,
    context.contentVersion,
    `${context.roomEventKey}:boss-identity`,
  );
  const identity = rng.pick(bosses);

  return Object.freeze({
    archetypeId: identity.id,
    modifierIds: Object.freeze([]),
    phaseId: "routing",
    defeated: false,
    displayName: identity.displayName,
    identityLabel: identity.identityLabel,
  });
}

/** Compose one selected offer into inert, persistence-compatible room data. */
export function generateRoomCandidate(
  catalog: ContentCatalog,
  context: RoomGenerationContext,
): GeneratedRoomCandidate {
  validateRouteContext(catalog, context);
  requireNonBlank(context.selectedOfferId, "selectedOfferId");
  const offer = generateRouteOptions(catalog, context).find(
    (candidate) => candidate.offerId === context.selectedOfferId,
  );
  if (offer === undefined) {
    throw new RangeError("selectedOfferId is not part of this route event");
  }
  const room = requireRoom(catalog, offer.roomDefinitionId);
  const threatProfile = generateThreatProfile(catalog, {
    seed: context.seed,
    contentVersion: context.contentVersion,
    depth: context.depth,
    cycle: context.cycle,
    roomEventKey: offer.roomEventKey,
    roomDefinitionId: room.id,
  });
  const shopInventory =
    room.roomType === "shop"
      ? generateShopInventory(catalog, {
          seed: context.seed,
          contentVersion: context.contentVersion,
          depth: context.depth,
          cycle: context.cycle,
          roomEventKey: offer.roomEventKey,
        })
      : null;

  return Object.freeze({
    roomId: `${offer.roomEventKey}:candidate`,
    authoredRoomId: room.id,
    roomType: room.roomType,
    eventKey: offer.roomEventKey,
    status: "ready",
    displayName: room.displayName,
    summary: room.summary,
    counterplay: room.counterplay,
    objectiveIds: Object.freeze([...room.objectiveIds]),
    threatProfile,
    combatCheckpoint: room.roomType === "battle" || room.roomType === "elite" || room.roomType === "boss"
      ? toCombatCheckpoint(
          createCombatState(catalog, {
            seed: context.seed,
            contentVersion: context.contentVersion,
            roomId: `${offer.roomEventKey}:candidate`,
            eventKey: offer.roomEventKey,
            formationId: threatProfile.formationId,
            density: threatProfile.density,
            durabilityFactor: threatProfile.durabilityFactor,
            lossCount: 0,
            hazardIds: threatProfile.hazardIds,
          }),
        )
      : null,
    processedOutcomeIds: Object.freeze([]),
    shop:
      shopInventory === null
        ? null
        : Object.freeze({
            inventory: shopInventory,
            purchasedItemIds: Object.freeze([]),
          }),
    recovery:
      room.roomType === "recovery"
        ? Object.freeze({
            eventKey: `${offer.roomEventKey}:recovery`,
            restoreAmount: RECOVERY_RESTORE_AMOUNT,
            committed: false,
            commitId: null,
          })
        : null,
    boss:
      room.roomType === "boss"
        ? generateBossState(catalog, {
            seed: context.seed,
            contentVersion: context.contentVersion,
            depth: context.depth,
            cycle: context.cycle,
            roomEventKey: offer.roomEventKey,
          })
        : null,
    resolutionCommitId: null,
  });
}

const MAX_ACTIVE_SKILL_SLOTS = 3;
const MAX_PASSIVE_EQUIPMENT_SLOTS = 4;
const MAX_ENHANCEMENTS_PER_CARD = 2;
const MATERIAL_COST_SPREAD = 10;

type RewardKind = "skill" | "equipment";

interface RewardBaseCandidates {
  readonly skills: readonly SkillDefinition[];
  readonly equipment: readonly EquipmentDefinition[];
}

function requireRewardBase(
  catalog: ContentCatalog,
  kind: RewardKind,
  baseRewardId: ContentId,
): void {
  const result = kind === "skill" ? catalog.getSkill(baseRewardId) : catalog.getEquipment(baseRewardId);
  if (!result.ok) {
    throw new RangeError(
      `unknown ${kind} reward base in catalog: ${baseRewardId}`,
    );
  }
}

function validateRewardContext(
  catalog: ContentCatalog,
  context: RewardGenerationContext,
): void {
  validateBaseContext(catalog, context);
  requireNonBlank(context.runId, "runId");
  requireNonBlank(context.roomEventKey, "roomEventKey");
  if (
    context.roomType !== "battle" &&
    context.roomType !== "elite" &&
    context.roomType !== "shop" &&
    context.roomType !== "recovery" &&
    context.roomType !== "boss"
  ) {
    throw new RangeError("roomType must be an authored room type");
  }
  if (
    !Number.isSafeInteger(context.activeSkillSlotsUsed) ||
    context.activeSkillSlotsUsed < 0 ||
    context.activeSkillSlotsUsed > MAX_ACTIVE_SKILL_SLOTS
  ) {
    throw new RangeError(
      `activeSkillSlotsUsed must be a safe integer within 0..${MAX_ACTIVE_SKILL_SLOTS}`,
    );
  }
  if (
    !Number.isSafeInteger(context.passiveEquipmentSlotsUsed) ||
    context.passiveEquipmentSlotsUsed < 0 ||
    context.passiveEquipmentSlotsUsed > MAX_PASSIVE_EQUIPMENT_SLOTS
  ) {
    throw new RangeError(
      `passiveEquipmentSlotsUsed must be a safe integer within 0..${MAX_PASSIVE_EQUIPMENT_SLOTS}`,
    );
  }
}

function rewardKindsFor(
  context: RewardGenerationContext,
): readonly RewardKind[] {
  const kinds: RewardKind[] = [];
  if (context.activeSkillSlotsUsed < MAX_ACTIVE_SKILL_SLOTS) {
    kinds.push("skill");
  }
  if (context.passiveEquipmentSlotsUsed < MAX_PASSIVE_EQUIPMENT_SLOTS) {
    kinds.push("equipment");
  }
  // Both build sides full is an authoring/flow defect: the generator keeps
  // producing equipment cards so a draft always has three cards, while the
  // reducer stays the authoritative guard against overfull builds.
  return kinds.length === 0 ? ["equipment"] : kinds;
}

function enhancementCandidatesFor(
  catalog: ContentCatalog,
  kind: RewardKind,
  depth: number,
): readonly EnhancementDefinition[] {
  return catalog
    .listEnhancements()
    .filter(
      (definition) =>
        definition.minDepth <= depth &&
        (definition.compatibleRewardType === "any" ||
          definition.compatibleRewardType === kind),
    );
}

function generateRewardCard(
  catalog: ContentCatalog,
  context: RewardGenerationContext,
  rewardEventKey: EventKey,
  baseIds: RewardBaseCandidates,
  index: number,
): GeneratedRewardCard {
  const cardSlotKey = `${rewardEventKey}:card:${String(index)}`;
  const rng = deriveStream(context.seed, context.contentVersion, cardSlotKey);
  const kind = rng.pick(rewardKindsFor(context));
  const baseRewardId = rng.pick(kind === "skill" ? baseIds.skills : baseIds.equipment).id;
  requireRewardBase(catalog, kind, baseRewardId);

  const eligible = enhancementCandidatesFor(catalog, kind, context.depth);
  const enhancementCount = rng.nextInt(MAX_ENHANCEMENTS_PER_CARD + 1);
  const chosenEnhancements = rng
    .shuffle(eligible)
    .slice(0, enhancementCount)
    .sort((left, right) => compareIds(left.id, right.id));
  const rolledParams = Object.freeze(
    chosenEnhancements.map((enhancement) => {
      const paramRng = deriveStream(
        context.seed,
        context.contentVersion,
        `${cardSlotKey}:param:${enhancement.effectKey}`,
      );
      return Object.freeze({
        key: enhancement.effectKey,
        value: paramRng.nextInt(4) + 1,
      }) satisfies EffectParam;
    }),
  );

  return Object.freeze({
    cardId: `${rewardEventKey}:card:${baseRewardId}:${String(index)}`,
    baseRewardId,
    rewardType: kind,
    enhancementIds: Object.freeze(
      chosenEnhancements.map((enhancement) => enhancement.id),
    ),
    rolledParams,
    materialCost: rng.nextInt(MATERIAL_COST_SPREAD),
    tradeoffId: null,
  });
}

/**
 * Compose the deterministic three-card reward draft for a resolved room. Each
 * card derives its own named stream from
 * `(seed, contentVersion, <roomEventKey>:reward:card:<index>)` so unrelated
 * draws cannot perturb it, and every content reference is catalog-validated.
 */
export function generateRewardDraft(
  catalog: ContentCatalog,
  context: RewardGenerationContext,
): GeneratedRewardDraft {
  validateRewardContext(catalog, context);

  const skills = [...catalog.listSkills()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  const equipment = [...catalog.listEquipment()].sort((left, right) =>
    compareIds(left.id, right.id),
  );
  if (skills.length === 0 || equipment.length === 0) {
    throw new Error("catalog has no skill and equipment reward bases");
  }

  const rewardEventKey = `${context.roomEventKey}:reward`;
  const baseIds: RewardBaseCandidates = { skills, equipment };
  const cards = [0, 1, 2].map((index) =>
    generateRewardCard(catalog, context, rewardEventKey, baseIds, index),
  );

  return Object.freeze({
    eventKey: rewardEventKey,
    sourceRoomId: `${context.roomEventKey}:candidate`,
    cards: Object.freeze(cards) as GeneratedRewardDraft["cards"],
  });
}
