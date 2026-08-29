import { z } from "zod";

import type {
  ContentCatalog,
  ContentId,
  ContentVersion,
} from "../domain/content/catalog";
import type { LivingRun, Profile, RunState } from "../domain/run/model";
import { CURRENT_RECORD_KEY, SAVE_SCHEMA_VERSION } from "../domain/run/model";
import { isBossDepth, routeEventKey } from "../domain/run/routes";
import {
  validateLivingRun,
  validateProfile,
  validateRunState,
} from "../domain/run/validation";
import type { PersistenceErrorCode, PersistenceResult } from "./envelopes";

const MAX_ID_LENGTH = 256;
const MAX_EVENT_KEY_LENGTH = 512;
const MAX_PARAM_STRING_LENGTH = 512;
const MAX_UNLOCK_IDS = 256;
const MAX_UPGRADE_LEVELS = 128;
const MAX_ROUTE_OFFERS = 16;
const MAX_ROOM_OBJECTIVES = 64;
const MAX_COMBAT_ENEMIES = 512;
const MAX_HAZARDS = 128;
const MAX_MODIFIERS = 64;
const MAX_COUNTERS = 128;
const MAX_EFFECT_PARAMS = 32;
const MAX_SHOP_ITEMS = 128;
const MAX_PROCESSED_OUTCOMES = 1_024;
const MAX_REAL_MAGNITUDE = 1_000_000_000;
const MAX_DIAGNOSTIC_ISSUES = 16;

const boundedString = (maximum = MAX_ID_LENGTH) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value.trim().length > 0, "must contain a non-whitespace character");

const contentIdSchema = boundedString().transform((value) => value as ContentId);
const contentVersionSchema = boundedString().transform(
  (value) => value as ContentVersion,
);
const safeIntegerSchema = z
  .number()
  .finite()
  .min(-Number.MAX_SAFE_INTEGER)
  .max(Number.MAX_SAFE_INTEGER)
  .refine(Number.isSafeInteger, "must be a safe integer");
const nonNegativeSafeIntegerSchema = z
  .number()
  .finite()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .refine(Number.isSafeInteger, "must be a safe integer");
const positiveSafeIntegerSchema = z
  .number()
  .finite()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER)
  .refine(Number.isSafeInteger, "must be a safe integer");
const boundedRealSchema = z
  .number()
  .finite()
  .min(-MAX_REAL_MAGNITUDE)
  .max(MAX_REAL_MAGNITUDE);
const boundedNonNegativeRealSchema = boundedRealSchema.min(0);

function strictObject<const Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject(shape);
}

function uniqueStringsSchema(maximum: number) {
  return z
    .array(contentIdSchema)
    .max(maximum)
    .superRefine((values, context) => {
      if (new Set(values).size !== values.length) {
        context.addIssue({
          code: "custom",
          message: "content identifiers must be unique",
        });
      }
    });
}

const profileUnlocksSchema = strictObject({
  classIds: uniqueStringsSchema(MAX_UNLOCK_IDS),
  startingChoiceIds: uniqueStringsSchema(MAX_UNLOCK_IDS),
  contentIds: uniqueStringsSchema(MAX_UNLOCK_IDS),
  relicIds: uniqueStringsSchema(MAX_UNLOCK_IDS),
  cosmeticIds: uniqueStringsSchema(MAX_UNLOCK_IDS),
});

const utilityUpgradeLevelSchema = strictObject({
  upgradeId: contentIdSchema,
  level: nonNegativeSafeIntegerSchema,
});

const utilityUpgradeLevelsSchema = z
  .array(utilityUpgradeLevelSchema)
  .max(MAX_UPGRADE_LEVELS)
  .superRefine((levels, context) => {
    const ids = levels.map((level) => level.upgradeId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        message: "utility upgrade identifiers must be unique",
      });
    }
  });

const relicStateSchema = strictObject({
  equippedForNextRunId: contentIdSchema.nullable(),
});

const personalRecordsSchema = strictObject({
  highestReachedDepth: nonNegativeSafeIntegerSchema,
  highestBossDepth: nonNegativeSafeIntegerSchema,
  bossesDefeated: nonNegativeSafeIntegerSchema,
});

const runSummarySchema = strictObject({
  runId: boundedString(),
  classId: contentIdSchema,
  reachedDepth: positiveSafeIntegerSchema,
  bossesReached: nonNegativeSafeIntegerSchema,
  bossesDefeated: nonNegativeSafeIntegerSchema,
  activeSkillIds: uniqueStringsSchema(3),
  passiveEquipmentIds: uniqueStringsSchema(4),
  carryOverRelicId: contentIdSchema.nullable(),
  shardsEarned: nonNegativeSafeIntegerSchema,
  terminalReason: z.enum(["death", "completion", "abandoned"]),
  completedAt: safeIntegerSchema,
});

const pendingRelicChoiceSchema = strictObject({
  sourceRunId: boundedString(),
  options: uniqueStringsSchema(16),
  selectedId: contentIdSchema.nullable(),
  commitId: boundedString().nullable(),
}).superRefine((choice, context) => {
  if (choice.selectedId !== null && !choice.options.includes(choice.selectedId)) {
    context.addIssue({
      code: "custom",
      path: ["selectedId"],
      message: "selected relic must be one of the stored options",
    });
  }
  if ((choice.selectedId === null) !== (choice.commitId === null)) {
    context.addIssue({
      code: "custom",
      message: "selected relic and commit identity must be present together",
    });
  }
});

export const profileRecordSchema = strictObject({
  recordKey: z.literal(CURRENT_RECORD_KEY),
  profileId: boundedString(),
  saveSchemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  contentVersion: contentVersionSchema,
  revision: nonNegativeSafeIntegerSchema,
  createdAt: safeIntegerSchema,
  updatedAt: safeIntegerSchema,
  lastCommitId: boundedString(),
  shards: nonNegativeSafeIntegerSchema,
  unlocks: profileUnlocksSchema,
  utilityUpgradeLevels: utilityUpgradeLevelsSchema,
  relicState: relicStateSchema,
  records: personalRecordsSchema,
  lastRunSummary: runSummarySchema.nullable(),
  pendingRelicChoice: pendingRelicChoiceSchema.nullable(),
  lastFinalizedRunId: boundedString().nullable(),
}) satisfies z.ZodType<Profile>;

const buildSchema = strictObject({
  activeSkillIds: uniqueStringsSchema(3),
  passiveEquipmentIds: uniqueStringsSchema(4),
  carryOverRelicId: contentIdSchema.nullable(),
});

const runProgressSchema = strictObject({
  roomsResolved: nonNegativeSafeIntegerSchema,
  bossesReached: nonNegativeSafeIntegerSchema,
  bossesDefeated: nonNegativeSafeIntegerSchema,
});

const routeOfferSchema = strictObject({
  offerId: boundedString(),
  roomType: z.enum(["battle", "elite", "shop", "recovery", "boss"]),
  roomEventKey: boundedString(MAX_EVENT_KEY_LENGTH),
  riskTier: nonNegativeSafeIntegerSchema,
  rewardPreviewId: contentIdSchema.nullable(),
  visibleCost: nonNegativeSafeIntegerSchema,
  availability: z.enum(["available", "unavailable"]),
});

const routeStateSchema = strictObject({
  eventKey: boundedString(MAX_EVENT_KEY_LENGTH),
  offers: z.array(routeOfferSchema).max(MAX_ROUTE_OFFERS),
  selectedOfferId: boundedString().nullable(),
  committed: z.boolean(),
}).superRefine((route, context) => {
  const offerIds = route.offers.map((offer) => offer.offerId);
  if (new Set(offerIds).size !== offerIds.length) {
    context.addIssue({ code: "custom", path: ["offers"], message: "offer IDs must be unique" });
  }
});

const skillChargeSchema = strictObject({
  skillId: contentIdSchema,
  remaining: nonNegativeSafeIntegerSchema,
  maximum: nonNegativeSafeIntegerSchema,
}).superRefine((charge, context) => {
  if (charge.remaining > charge.maximum) {
    context.addIssue({
      code: "custom",
      path: ["remaining"],
      message: "remaining charges cannot exceed maximum charges",
    });
  }
});

const combatEnemySchema = strictObject({
  enemyInstanceId: boundedString(),
  enemyId: contentIdSchema,
  health: boundedNonNegativeRealSchema,
  stateId: boundedString(),
  defeated: z.boolean(),
});

const hazardStateSchema = strictObject({
  hazardInstanceId: boundedString(),
  hazardId: contentIdSchema,
  state: z.enum(["telegraphed", "active", "resolved"]),
  remainingSteps: nonNegativeSafeIntegerSchema,
});

const bossCounterSchema = strictObject({
  counterId: boundedString(),
  value: boundedRealSchema,
});

const bossCombatStateSchema = strictObject({
  archetypeId: contentIdSchema,
  health: boundedNonNegativeRealSchema,
  phaseId: boundedString(),
  modifierIds: uniqueStringsSchema(MAX_MODIFIERS),
  activeTelegraphId: boundedString().nullable(),
  counters: z.array(bossCounterSchema).max(MAX_COUNTERS),
}).superRefine((boss, context) => {
  const counterIds = boss.counters.map((counter) => counter.counterId);
  if (new Set(counterIds).size !== counterIds.length) {
    context.addIssue({
      code: "custom",
      path: ["counters"],
      message: "boss counter identifiers must be unique",
    });
  }
});

const combatCheckpointSchema = strictObject({
  kind: z.enum(["pre_launch", "loss_of_ball"]),
  paddleX: boundedRealSchema,
  aimAngle: boundedRealSchema,
  ballAttached: z.literal(true),
  enemies: z.array(combatEnemySchema).max(MAX_COMBAT_ENEMIES),
  hazards: z.array(hazardStateSchema).max(MAX_HAZARDS),
  bossState: bossCombatStateSchema.nullable(),
  skillCharges: z.array(skillChargeSchema).max(3),
}).superRefine((checkpoint, context) => {
  for (const [path, ids] of [
    ["enemies", checkpoint.enemies.map((enemy) => enemy.enemyInstanceId)],
    ["hazards", checkpoint.hazards.map((hazard) => hazard.hazardInstanceId)],
    ["skillCharges", checkpoint.skillCharges.map((charge) => charge.skillId)],
  ] as const) {
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: [path],
        message: `${path} identifiers must be unique`,
      });
    }
  }
});

const effectParamSchema = strictObject({
  key: boundedString(),
  value: z.union([
    boundedString(MAX_PARAM_STRING_LENGTH),
    boundedRealSchema,
    z.boolean(),
  ]),
});

const effectParamsSchema = z
  .array(effectParamSchema)
  .max(MAX_EFFECT_PARAMS)
  .superRefine((parameters, context) => {
    const keys = parameters.map((parameter) => parameter.key);
    if (new Set(keys).size !== keys.length) {
      context.addIssue({
        code: "custom",
        message: "parameter keys must be unique",
      });
    }
  });

const shopItemSchema = strictObject({
  itemId: contentIdSchema,
  price: nonNegativeSafeIntegerSchema,
  effectParams: effectParamsSchema,
});

const shopStateSchema = strictObject({
  inventory: z.array(shopItemSchema).max(MAX_SHOP_ITEMS),
  purchasedItemIds: uniqueStringsSchema(MAX_SHOP_ITEMS),
}).superRefine((shop, context) => {
  const inventoryIds = shop.inventory.map((item) => item.itemId);
  if (new Set(inventoryIds).size !== inventoryIds.length) {
    context.addIssue({
      code: "custom",
      path: ["inventory"],
      message: "shop inventory identifiers must be unique",
    });
  }
  if (shop.purchasedItemIds.some((id) => !inventoryIds.includes(id))) {
    context.addIssue({
      code: "custom",
      path: ["purchasedItemIds"],
      message: "purchased items must exist in the stored inventory",
    });
  }
});

const recoveryStateSchema = strictObject({
  eventKey: boundedString(MAX_EVENT_KEY_LENGTH),
  restoreAmount: nonNegativeSafeIntegerSchema,
  committed: z.boolean(),
  commitId: boundedString().nullable(),
}).superRefine((recovery, context) => {
  if (recovery.committed !== (recovery.commitId !== null)) {
    context.addIssue({
      code: "custom",
      message: "recovery commitment and commit identity must agree",
    });
  }
});

const bossStateSchema = strictObject({
  archetypeId: contentIdSchema,
  modifierIds: uniqueStringsSchema(MAX_MODIFIERS),
  phaseId: boundedString(),
  defeated: z.boolean(),
});

const threatProfileSchema = strictObject({
  budget: boundedNonNegativeRealSchema,
  durabilityFactor: boundedNonNegativeRealSchema,
  density: boundedNonNegativeRealSchema,
  formationId: contentIdSchema,
  hazardIds: uniqueStringsSchema(MAX_HAZARDS),
  bossModifierIds: uniqueStringsSchema(MAX_MODIFIERS),
});

const roomStateSchema = strictObject({
  roomId: boundedString(),
  roomType: z.enum(["battle", "elite", "shop", "recovery", "boss"]),
  eventKey: boundedString(MAX_EVENT_KEY_LENGTH),
  status: z.enum(["ready", "in_progress", "resolved"]),
  objectiveIds: uniqueStringsSchema(MAX_ROOM_OBJECTIVES),
  threatProfile: threatProfileSchema,
  combatCheckpoint: combatCheckpointSchema.nullable(),
  processedOutcomeIds: z.array(boundedString()).max(MAX_PROCESSED_OUTCOMES),
  shop: shopStateSchema.nullable(),
  recovery: recoveryStateSchema.nullable(),
  boss: bossStateSchema.nullable(),
  resolutionCommitId: boundedString().nullable(),
}).superRefine((room, context) => {
  if (new Set(room.processedOutcomeIds).size !== room.processedOutcomeIds.length) {
    context.addIssue({
      code: "custom",
      path: ["processedOutcomeIds"],
      message: "processed outcome identifiers must be unique",
    });
  }
  const expectedUtilityState = {
    shop: room.roomType === "shop",
    recovery: room.roomType === "recovery",
    boss: room.roomType === "boss",
  };
  for (const [key, expected] of Object.entries(expectedUtilityState)) {
    const value = room[key as keyof typeof expectedUtilityState];
    if ((value !== null) !== expected) {
      context.addIssue({
        code: "custom",
        path: [key],
        message: `${key} state must match the room type`,
      });
    }
  }
  if ((room.status === "resolved") !== (room.resolutionCommitId !== null)) {
    context.addIssue({
      code: "custom",
      path: ["resolutionCommitId"],
      message: "resolved status and resolution commit identity must agree",
    });
  }
});

const rewardCardSchema = strictObject({
  cardId: boundedString(),
  baseRewardId: contentIdSchema,
  rewardType: z.enum(["skill", "equipment", "upgrade", "currency", "relic"]),
  enhancementIds: uniqueStringsSchema(MAX_MODIFIERS),
  rolledParams: effectParamsSchema,
  materialCost: nonNegativeSafeIntegerSchema,
  tradeoffId: contentIdSchema.nullable(),
});

const rewardStateSchema = strictObject({
  eventKey: boundedString(MAX_EVENT_KEY_LENGTH),
  sourceRoomId: boundedString(),
  cards: z.tuple([rewardCardSchema, rewardCardSchema, rewardCardSchema]),
  selectedCardId: boundedString().nullable(),
  selectionCommitId: boundedString().nullable(),
  status: z.enum(["offered", "selected", "applied"]),
}).superRefine((reward, context) => {
  const cardIds = reward.cards.map((card) => card.cardId);
  if (new Set(cardIds).size !== cardIds.length) {
    context.addIssue({ code: "custom", path: ["cards"], message: "card IDs must be unique" });
  }
  if (reward.selectedCardId !== null && !cardIds.includes(reward.selectedCardId)) {
    context.addIssue({
      code: "custom",
      path: ["selectedCardId"],
      message: "selected card must be one of the stored cards",
    });
  }
  const isOffered = reward.status === "offered";
  const isSelected = reward.status === "selected";
  if (isOffered && (reward.selectedCardId !== null || reward.selectionCommitId !== null)) {
    context.addIssue({ code: "custom", message: "an offered reward cannot be selected or applied" });
  }
  if (isSelected && (reward.selectedCardId === null || reward.selectionCommitId !== null)) {
    context.addIssue({ code: "custom", message: "selected reward state is not coherent" });
  }
  if (
    reward.status === "applied" &&
    (reward.selectedCardId === null || reward.selectionCommitId === null)
  ) {
    context.addIssue({ code: "custom", message: "an applied reward requires selection identity" });
  }
});

export const livingRunRecordSchema = strictObject({
  recordKey: z.literal(CURRENT_RECORD_KEY),
  runId: boundedString(),
  saveSchemaVersion: z.literal(SAVE_SCHEMA_VERSION),
  contentVersion: contentVersionSchema,
  revision: nonNegativeSafeIntegerSchema,
  createdAt: safeIntegerSchema,
  updatedAt: safeIntegerSchema,
  lastCommitId: boundedString(),
  seed: boundedString(MAX_EVENT_KEY_LENGTH),
  phase: z.enum(["route", "room", "reward"]),
  depth: positiveSafeIntegerSchema,
  cycle: positiveSafeIntegerSchema,
  classId: contentIdSchema,
  integrityCurrent: nonNegativeSafeIntegerSchema,
  integrityMax: positiveSafeIntegerSchema,
  runCurrency: nonNegativeSafeIntegerSchema,
  build: buildSchema,
  progress: runProgressSchema,
  routeState: routeStateSchema.nullable(),
  roomState: roomStateSchema.nullable(),
  rewardState: rewardStateSchema.nullable(),
}) satisfies z.ZodType<LivingRun>;

interface SafeDiagnosticIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

function isPlainData(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return true;
  }
  if (typeof value !== "object") {
    return false;
  }
  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    const isValid = value.every((entry) => isPlainData(entry, ancestors));
    ancestors.delete(value);
    return isValid;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    ancestors.delete(value);
    return false;
  }

  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") {
      ancestors.delete(value);
      return false;
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !("value" in descriptor)) {
      ancestors.delete(value);
      return false;
    }
    if (!isPlainData(descriptor.value, ancestors)) {
      ancestors.delete(value);
      return false;
    }
  }
  ancestors.delete(value);
  return true;
}

function boundedMessage(message: string): string {
  return message.slice(0, 160);
}

function zodDiagnostics(error: z.ZodError): readonly SafeDiagnosticIssue[] {
  return error.issues.slice(0, MAX_DIAGNOSTIC_ISSUES).map((issue) => ({
    code: issue.code,
    path: issue.path.map(String).join("."),
    message: boundedMessage(issue.message),
  }));
}

function invalidResult<T>(
  code: Extract<PersistenceErrorCode, "invalid-profile" | "invalid-living-run">,
  message: string,
  cause: readonly SafeDiagnosticIssue[],
): PersistenceResult<T> {
  return { ok: false, error: { code, message, cause } };
}

function plainDataDiagnostic(): readonly SafeDiagnosticIssue[] {
  return [
    {
      code: "unsupported-data-value",
      path: "",
      message: "record must contain only acyclic plain data values",
    },
  ];
}

function domainDiagnostics(
  result: ReturnType<typeof validateProfile> | ReturnType<typeof validateLivingRun>,
): readonly SafeDiagnosticIssue[] {
  return result.ok
    ? []
    : result.issues.slice(0, MAX_DIAGNOSTIC_ISSUES).map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: boundedMessage(issue.message),
      }));
}

function profileSemanticDiagnostics(
  profile: Profile,
  catalog: ContentCatalog,
): readonly SafeDiagnosticIssue[] {
  const issues: SafeDiagnosticIssue[] = [];
  if (profile.createdAt > profile.updatedAt) {
    issues.push({
      code: "invalid-timestamp-order",
      path: "profile.updatedAt",
      message: "updatedAt cannot precede createdAt",
    });
  }
  for (const classId of catalog.initialClassUnlockIds()) {
    if (!profile.unlocks.classIds.includes(classId)) {
      issues.push({
        code: "missing-initial-class",
        path: "profile.unlocks.classIds",
        message: "profile is missing an initially available class",
      });
    }
  }
  if (
    profile.lastRunSummary !== null &&
    !catalog.hasClass(profile.lastRunSummary.classId)
  ) {
    issues.push({
      code: "unknown-summary-class",
      path: "profile.lastRunSummary.classId",
      message: "run summary references an unknown class",
    });
  }
  if (
    profile.lastRunSummary !== null &&
    profile.lastRunSummary.bossesDefeated > profile.lastRunSummary.bossesReached
  ) {
    issues.push({
      code: "invalid-summary-progress",
      path: "profile.lastRunSummary",
      message: "defeated bosses cannot exceed reached bosses",
    });
  }
  if (profile.records.highestBossDepth > profile.records.highestReachedDepth) {
    issues.push({
      code: "invalid-record-order",
      path: "profile.records",
      message: "highest boss depth cannot exceed highest reached depth",
    });
  }
  return issues;
}

function livingRunSemanticDiagnostics(
  run: LivingRun,
  catalog: ContentCatalog,
): readonly SafeDiagnosticIssue[] {
  const issues: SafeDiagnosticIssue[] = [];
  if (run.createdAt > run.updatedAt) {
    issues.push({
      code: "invalid-timestamp-order",
      path: "livingRun.updatedAt",
      message: "updatedAt cannot precede createdAt",
    });
  }
  const classResult = catalog.getClass(run.classId);
  if (classResult.ok && run.integrityMax !== classResult.value.startingIntegrity) {
    issues.push({
      code: "invalid-integrity-cap",
      path: "livingRun.integrityMax",
      message: "Integrity maximum is not authored for the selected class",
    });
  }
  if (run.progress.bossesDefeated > run.progress.bossesReached) {
    issues.push({
      code: "invalid-boss-progress",
      path: "livingRun.progress",
      message: "defeated bosses cannot exceed reached bosses",
    });
  }
  if (run.phase === "room" && run.roomState !== null) {
    if (isBossDepth(run.depth) !== (run.roomState.roomType === "boss")) {
      issues.push({
        code: "invalid-boss-room",
        path: "livingRun.roomState.roomType",
        message: "room type does not satisfy the mandatory boss-floor rule",
      });
    }
  }
  if (run.phase === "route" && run.routeState !== null && run.routeState.offers.length === 0) {
    const expectedKey = routeEventKey(run.runId, run.contentVersion, run.depth);
    if (run.routeState.eventKey !== expectedKey) {
      issues.push({
        code: "invalid-route-event-key",
        path: "livingRun.routeState.eventKey",
        message: "empty route state has an invalid deterministic event key",
      });
    }
  }
  return issues;
}

/** Parse, deeply clone, and semantically validate a complete profile record. */
export function parseProfileRecord(
  input: unknown,
  catalog: ContentCatalog,
): PersistenceResult<Profile> {
  if (!isPlainData(input)) {
    return invalidResult("invalid-profile", "The saved profile is invalid.", plainDataDiagnostic());
  }
  const parsed = profileRecordSchema.safeParse(input);
  if (!parsed.success) {
    return invalidResult(
      "invalid-profile",
      "The saved profile is invalid.",
      zodDiagnostics(parsed.error),
    );
  }
  const domainResult = validateProfile(parsed.data, catalog);
  const issues = [
    ...domainDiagnostics(domainResult),
    ...profileSemanticDiagnostics(parsed.data, catalog),
  ].slice(0, MAX_DIAGNOSTIC_ISSUES);
  return issues.length === 0
    ? { ok: true, value: parsed.data }
    : invalidResult("invalid-profile", "The saved profile is invalid.", issues);
}

/** Parse, deeply clone, and semantically validate a complete living-run record. */
export function parseLivingRunRecord(
  input: unknown,
  catalog: ContentCatalog,
): PersistenceResult<LivingRun> {
  if (!isPlainData(input)) {
    return invalidResult(
      "invalid-living-run",
      "The saved run is invalid.",
      plainDataDiagnostic(),
    );
  }
  const parsed = livingRunRecordSchema.safeParse(input);
  if (!parsed.success) {
    return invalidResult(
      "invalid-living-run",
      "The saved run is invalid.",
      zodDiagnostics(parsed.error),
    );
  }
  const domainResult = validateLivingRun(parsed.data, catalog);
  const issues = [
    ...domainDiagnostics(domainResult),
    ...livingRunSemanticDiagnostics(parsed.data, catalog),
  ].slice(0, MAX_DIAGNOSTIC_ISSUES);
  return issues.length === 0
    ? { ok: true, value: parsed.data }
    : invalidResult("invalid-living-run", "The saved run is invalid.", issues);
}

function combinedStateDiagnostics(
  state: RunState,
  catalog: ContentCatalog,
): readonly SafeDiagnosticIssue[] {
  const issues: SafeDiagnosticIssue[] = [];
  const domainResult = validateRunState(state, catalog);
  if (!domainResult.ok) {
    issues.push(
      ...domainResult.issues.map((issue) => ({
        code: issue.code,
        path: issue.path,
        message: boundedMessage(issue.message),
      })),
    );
  }
  const run = state.livingRun;
  if (run !== null) {
    if (run.contentVersion !== state.profile.contentVersion) {
      issues.push({
        code: "content-version-mismatch",
        path: "livingRun.contentVersion",
        message: "profile and living run content versions must match",
      });
    }
    if (!state.profile.unlocks.classIds.includes(run.classId)) {
      issues.push({
        code: "class-locked",
        path: "livingRun.classId",
        message: "living run class is not unlocked by the profile",
      });
    }
    const relicId = run.build.carryOverRelicId;
    if (relicId !== null && !state.profile.unlocks.relicIds.includes(relicId)) {
      issues.push({
        code: "relic-locked",
        path: "livingRun.build.carryOverRelicId",
        message: "living run carry-over relic is not unlocked by the profile",
      });
    }
  }
  return issues.slice(0, MAX_DIAGNOSTIC_ISSUES);
}

/** Validate the profile and optional stored run as one authoritative state. */
export function parseRunStateRecords(
  profileInput: unknown,
  livingRunInput: unknown | undefined,
  catalog: ContentCatalog,
): PersistenceResult<RunState> {
  const profileResult = parseProfileRecord(profileInput, catalog);
  if (!profileResult.ok) {
    return profileResult;
  }
  if (livingRunInput === undefined) {
    return { ok: true, value: { profile: profileResult.value, livingRun: null } };
  }
  const livingRunResult = parseLivingRunRecord(livingRunInput, catalog);
  if (!livingRunResult.ok) {
    return livingRunResult;
  }
  const state: RunState = {
    profile: profileResult.value,
    livingRun: livingRunResult.value,
  };
  const issues = combinedStateDiagnostics(state, catalog);
  return issues.length === 0
    ? { ok: true, value: state }
    : invalidResult("invalid-living-run", "The saved run is invalid.", issues);
}
