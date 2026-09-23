import type { ContentCatalog, ContentId } from "../content/catalog";
import type {
  GeneratedRewardCard,
  GeneratedRouteOffer,
  GeneratedRoomCandidate,
} from "../random/generators";
import {
  generateRewardDraft,
  generateRouteOptions,
  generateRoomCandidate,
} from "../random/generators";
import type { CombatInitContext } from "../combat/model";
import { AIM_MAX_DEVIATION } from "../combat/model";
import { fromCombatCheckpoint, toCombatCheckpoint } from "../combat/layout";
import { launchBall } from "../combat/rules";
import { outcomeIdFor } from "../combat/results";
import { resolveEffects, resolveVolleyEffects } from "../combat/effects";
import type { RunCommand, RunRejection, RunTransition } from "./commands";
import type { CombatOutcomeMessage } from "./commands";
import type {
  CombatCheckpoint,
  EffectParam,
  LivingRun,
  RewardCardSnapshot,
  RewardState,
  RouteOfferSnapshot,
  RoomState,
  RouteState,
  RunState,
  ThreatProfileSnapshot,
} from "./model";
import { createInitialLivingRun } from "./model";
import { cycleForDepth, isBossDepth, routeEventKey } from "./routes";
import { validateRunState } from "./validation";

function reject(state: RunState, error: RunRejection): RunTransition {
  return { ok: false, state, error };
}

function isNonEmptyString(value: string): boolean {
  return value.length > 0;
}

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function invalidStateRejection(state: RunState, catalog: ContentCatalog): RunRejection | null {
  const result = validateRunState(state, catalog);
  return result.ok
    ? null
    : { code: "invalid-state", issues: result.issues.map((issue) => issue.message) };
}

function startMetadataField(command: Extract<RunCommand, { type: "StartRun" }>): string | null {
  if (!isNonEmptyString(command.classId)) return "classId";
  if (!isNonEmptyString(command.runId)) return "runId";
  if (!isNonEmptyString(command.seed)) return "seed";
  if (!Number.isFinite(command.now)) return "now";
  if (!isNonEmptyString(command.commitId)) return "commitId";
  if (!isSafeNonNegativeInteger(command.expectedProfileRevision)) {
    return "expectedProfileRevision";
  }
  return null;
}

function abandonMetadataField(
  command: Extract<RunCommand, { type: "AbandonRun" }>,
): string | null {
  if (!isNonEmptyString(command.runId)) return "runId";
  if (!isNonEmptyString(command.commitId)) return "commitId";
  if (!isSafeNonNegativeInteger(command.expectedRevision)) return "expectedRevision";
  return null;
}

function startRun(
  state: RunState,
  command: Extract<RunCommand, { type: "StartRun" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = startMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  if (state.livingRun !== null) {
    return reject(state, { code: "living-run-exists", runId: state.livingRun.runId });
  }

  const classResult = catalog.getClass(command.classId);
  if (!classResult.ok) {
    return reject(state, { code: "unknown-class", classId: command.classId });
  }

  if (!state.profile.unlocks.classIds.includes(command.classId)) {
    return reject(state, { code: "class-locked", classId: command.classId });
  }

  if (command.expectedProfileRevision !== state.profile.revision) {
    return reject(state, {
      code: "stale-profile-revision",
      expected: command.expectedProfileRevision,
      actual: state.profile.revision,
    });
  }

  const livingRun = createInitialLivingRun(
    state.profile.contentVersion,
    command.classId,
    classResult.value.startingIntegrity,
    state.profile.relicState.equippedForNextRunId,
    {
      runId: command.runId,
      seed: command.seed,
      now: command.now,
      commitId: command.commitId,
    },
  );

  // Creating a run must not mutate or increment the profile.
  return {
    ok: true,
    state: { profile: state.profile, livingRun },
    persistence: {
      kind: "start-run",
      runId: command.runId,
      commitId: command.commitId,
      expectedProfileRevision: command.expectedProfileRevision,
    },
  };
}

function abandonRun(
  state: RunState,
  command: Extract<RunCommand, { type: "AbandonRun" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = abandonMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  if (state.livingRun === null) {
    return reject(state, { code: "no-living-run" });
  }

  if (state.livingRun.runId !== command.runId) {
    return reject(state, {
      code: "stale-run",
      expected: command.runId,
      actual: state.livingRun.runId,
    });
  }

  if (state.livingRun.revision !== command.expectedRevision) {
    return reject(state, {
      code: "stale-run-revision",
      expected: command.expectedRevision,
      actual: state.livingRun.revision,
    });
  }

  return {
    ok: true,
    state: { profile: state.profile, livingRun: null },
    persistence: {
      kind: "abandon-run",
      runId: command.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function routeCommandMetadataField(command: {
  readonly runId: string;
  readonly commitId: string;
  readonly expectedRevision: number;
  readonly now?: number;
}): string | null {
  if (!isNonEmptyString(command.runId)) return "runId";
  if (!isNonEmptyString(command.commitId)) return "commitId";
  if (!isSafeNonNegativeInteger(command.expectedRevision)) return "expectedRevision";
  if (command.now !== undefined && !Number.isFinite(command.now)) return "now";
  return null;
}

function requireLivingRun(
  state: RunState,
  command: { readonly runId: string; readonly expectedRevision: number },
): { ok: true; run: LivingRun } | { ok: false; transition: RunTransition } {
  if (state.livingRun === null) {
    return { ok: false, transition: reject(state, { code: "no-living-run" }) };
  }
  if (state.livingRun.runId !== command.runId) {
    return {
      ok: false,
      transition: reject(state, {
        code: "stale-run",
        expected: command.runId,
        actual: state.livingRun.runId,
      }),
    };
  }
  if (state.livingRun.revision !== command.expectedRevision) {
    return {
      ok: false,
      transition: reject(state, {
        code: "stale-run-revision",
        expected: command.expectedRevision,
        actual: state.livingRun.revision,
      }),
    };
  }
  return { ok: true, run: state.livingRun };
}

function mapRouteOffer(offer: GeneratedRouteOffer): RouteOfferSnapshot {
  return Object.freeze({
    offerId: offer.offerId,
    roomType: offer.roomType,
    roomEventKey: offer.roomEventKey,
    riskTier: offer.riskTier,
    rewardPreviewId: offer.rewardPreviewId,
    visibleCost: offer.visibleCost,
    availability: offer.availability,
  });
}

function mapThreatProfile(
  profile: GeneratedRoomCandidate["threatProfile"],
): ThreatProfileSnapshot {
  return Object.freeze({
    budget: profile.budget,
    durabilityFactor: profile.durabilityFactor,
    density: profile.density,
    formationId: profile.formationId,
    hazardIds: Object.freeze([...profile.hazardIds]),
    bossModifierIds: Object.freeze([...profile.bossModifierIds]),
  });
}

function mapRoomCandidate(candidate: GeneratedRoomCandidate): RoomState {
  return Object.freeze({
    roomId: candidate.roomId,
    roomType: candidate.roomType,
    eventKey: candidate.eventKey,
    status: candidate.status,
    objectiveIds: Object.freeze([...candidate.objectiveIds]),
    threatProfile: mapThreatProfile(candidate.threatProfile),
    combatCheckpoint: candidate.combatCheckpoint,
    processedOutcomeIds: Object.freeze([...candidate.processedOutcomeIds]),
    shop: candidate.shop,
    recovery: candidate.recovery,
    boss: candidate.boss,
    resolutionCommitId: candidate.resolutionCommitId,
  });
}

function mapRewardCard(card: GeneratedRewardCard): RewardCardSnapshot {
  return Object.freeze({
    cardId: card.cardId,
    baseRewardId: card.baseRewardId,
    rewardType: card.rewardType,
    enhancementIds: Object.freeze([...card.enhancementIds]),
    rolledParams: Object.freeze([...card.rolledParams]),
    materialCost: card.materialCost,
    tradeoffId: card.tradeoffId,
  });
}

function mapRewardDraft(draft: {
  readonly eventKey: string;
  readonly sourceRoomId: string;
  readonly cards: readonly [
    GeneratedRewardCard,
    GeneratedRewardCard,
    GeneratedRewardCard,
  ];
}): RewardState {
  return Object.freeze({
    eventKey: draft.eventKey,
    sourceRoomId: draft.sourceRoomId,
    cards: Object.freeze([
      mapRewardCard(draft.cards[0]),
      mapRewardCard(draft.cards[1]),
      mapRewardCard(draft.cards[2]),
    ]) as RewardState["cards"],
    selectedCardId: null,
    selectionCommitId: null,
    status: "offered",
    displacedRewardId: null,
    displacedSlot: null,
  });
}

function materializeRoute(
  state: RunState,
  command: Extract<RunCommand, { type: "MaterializeRoute" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = routeCommandMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const living = requireLivingRun(state, command);
  if (!living.ok) return living.transition;
  const run = living.run;

  const routeState = run.routeState;
  if (routeState === null) {
    return reject(state, { code: "invalid-state", issues: ["route phase required"] });
  }
  if (routeState.offers.length !== 0) {
    return reject(state, { code: "route-already-materialized", runId: run.runId });
  }

  const eventKey = routeEventKey(run.runId, run.contentVersion, run.depth);
  const offers = generateRouteOptions(catalog, {
    seed: run.seed,
    contentVersion: run.contentVersion,
    runId: run.runId,
    depth: run.depth,
    cycle: run.cycle,
    integrityCurrent: run.integrityCurrent,
    integrityMax: run.integrityMax,
    runCurrency: run.runCurrency,
    routeEventKey: eventKey,
  });

  const newRouteState: RouteState = Object.freeze({
    eventKey,
    offers: Object.freeze(offers.map(mapRouteOffer)),
    selectedOfferId: null,
    committed: false,
  });

  const updatedRun: LivingRun = {
    ...run,
    routeState: newRouteState,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function selectRouteOffer(
  state: RunState,
  command: Extract<RunCommand, { type: "SelectRouteOffer" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (badField === null && !isNonEmptyString(command.offerId)) {
    badField = "offerId";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const living = requireLivingRun(state, command);
  if (!living.ok) return living.transition;
  const run = living.run;

  const routeState = run.routeState;
  if (routeState === null) {
    return reject(state, { code: "invalid-state", issues: ["route phase required"] });
  }
  if (routeState.offers.length === 0) {
    return reject(state, { code: "route-not-materialized", runId: run.runId });
  }
  if (routeState.committed) {
    return reject(state, { code: "route-already-committed", runId: run.runId });
  }
  if (!routeState.offers.some((offer) => offer.offerId === command.offerId)) {
    return reject(state, { code: "unknown-route-offer", offerId: command.offerId });
  }

  const newRouteState: RouteState = Object.freeze({
    ...routeState,
    selectedOfferId: command.offerId,
  });

  const updatedRun: LivingRun = {
    ...run,
    routeState: newRouteState,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function commitRoute(
  state: RunState,
  command: Extract<RunCommand, { type: "CommitRoute" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = routeCommandMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const living = requireLivingRun(state, command);
  if (!living.ok) return living.transition;
  const run = living.run;

  const routeState = run.routeState;
  if (routeState === null) {
    return reject(state, { code: "invalid-state", issues: ["route phase required"] });
  }
  if (routeState.offers.length === 0) {
    return reject(state, { code: "route-not-materialized", runId: run.runId });
  }
  if (routeState.selectedOfferId === null) {
    return reject(state, { code: "route-selection-missing", runId: run.runId });
  }
  if (routeState.committed) {
    return reject(state, { code: "route-already-committed", runId: run.runId });
  }

  const candidate = generateRoomCandidate(catalog, {
    seed: run.seed,
    contentVersion: run.contentVersion,
    runId: run.runId,
    depth: run.depth,
    cycle: run.cycle,
    integrityCurrent: run.integrityCurrent,
    integrityMax: run.integrityMax,
    runCurrency: run.runCurrency,
    routeEventKey: routeState.eventKey,
    selectedOfferId: routeState.selectedOfferId,
  });

  if (isBossDepth(run.depth) !== (candidate.roomType === "boss")) {
    return reject(state, {
      code: "invalid-state",
      issues: ["room type does not satisfy the boss-floor rule"],
    });
  }

  const roomState = mapRoomCandidate(candidate);

  const updatedRun: LivingRun = {
    ...run,
    phase: "room",
    routeState: null,
    roomState,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function requireOpenRoomPhase(
  state: RunState,
  command: { readonly runId: string; readonly expectedRevision: number },
): { ok: true; run: LivingRun; room: RoomState } | { ok: false; transition: RunTransition } {
  const living = requireLivingRun(state, command);
  if (!living.ok) return living;
  const run = living.run;

  if (run.phase !== "room" || run.roomState === null) {
    return {
      ok: false,
      transition: reject(state, { code: "invalid-state", issues: ["room phase required"] }),
    };
  }
  return { ok: true, run, room: run.roomState };
}

function isCombatRoomType(roomType: RoomState["roomType"]): boolean {
  return roomType === "battle" || roomType === "elite" || roomType === "boss";
}

/**
 * The static combat context for this room's arena: deterministic streams
 * derive from `(seed, contentVersion, eventKey)`, threat numbers come from the
 * committed threat profile, and the room's CA-02 loss ledger seeds the same
 * kind loss index so a rebuilt state continues the room's outcome identity.
 */
function combatContextFor(run: LivingRun, room: RoomState): CombatInitContext {
  return {
    seed: run.seed,
    contentVersion: run.contentVersion,
    roomId: room.roomId,
    eventKey: room.eventKey,
    formationId: room.threatProfile.formationId,
    density: room.threatProfile.density,
    durabilityFactor: room.threatProfile.durabilityFactor,
    lossCount: room.processedOutcomeIds.filter((outcomeId) =>
      outcomeId.startsWith(`${room.eventKey}:outcome:loss_of_ball:`),
    ).length,
    hazardIds: room.threatProfile.hazardIds,
  };
}

/**
 * Enhancement params rolled onto granted reward cards. The committed
 * SelectReward retains only the granted items, so the rolled-key carrier is
 * recorded deferral debt (room-resolution decision 10, tracked to CA-13);
 * until it lands the resolver runs on equipment and charge-gated skills
 * only. Empty, never invented.
 */
const ROLLED_PARAMS_CARRIER_LANDING: readonly EffectParam[] = Object.freeze([]);

/**
 * Launch the ball in this room's combat arena. The command validates the aim
 * against S01's legal cone and mirrors the room-entry checkpoint through
 * `fromCombatCheckpoint` (which fails closed on stale or foreign layouts),
 * then flips the room to in-progress. The persisted checkpoint stays the
 * still-valid pre-launch snapshot: a live volley is never persisted (Custom
 * Rule), and S01's `toCombatCheckpoint` rejects live phases by design, so
 * the volley itself lives in the bridge's ephemeral session.
 */
function launchBallInRoom(
  state: RunState,
  command: Extract<RunCommand, { type: "LaunchBall" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (badField === null && !Number.isFinite(command.aimAngle)) {
    badField = "aimAngle";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (!isCombatRoomType(room.roomType)) {
    return reject(state, { code: "combat-not-implemented", roomType: room.roomType });
  }
  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  const checkpoint = room.combatCheckpoint;
  if (checkpoint === null) {
    return reject(state, { code: "combat-checkpoint-missing", roomId: room.roomId });
  }
  if (Math.abs(command.aimAngle) > AIM_MAX_DEVIATION) {
    return reject(state, { code: "invalid-aim-angle" });
  }

  const context = combatContextFor(run, room);
  let combatState;
  try {
    combatState = fromCombatCheckpoint(checkpoint, context, catalog);
  } catch {
    return reject(state, {
      code: "invalid-state",
      issues: ["the stored combat checkpoint does not match this room's layout"],
    });
  }
  const volley = resolveVolleyEffects(
    catalog,
    run.build,
    ROLLED_PARAMS_CARRIER_LANDING,
    checkpoint.skillCharges,
  );
  // The launch itself is validated here so a corrupt arena fails closed
  // before the room flips to in-progress; the resulting live volley stays
  // ephemeral in the bridge.
  launchBall(combatState, command.aimAngle, volley);

  const updatedRoom: RoomState = Object.freeze({
    ...room,
    status: "in_progress",
    combatCheckpoint: checkpoint,
  });

  const updatedRun: LivingRun = {
    ...run,
    roomState: updatedRoom,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

/**
 * Spend one charge of a held skill. Charges initialize on first use from the
 * authored maximum plus the effect snapshot's bonus (persisted immediately),
 * then decrement; a skill with no remaining charges is rejected. Presenta-
 * tional skill effects are the arena's display concern; charge-gated
 * simulation effects are resolved by the bridge per volley.
 */
function useSkillInRoom(
  state: RunState,
  command: Extract<RunCommand, { type: "UseSkill" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (badField === null && !isNonEmptyString(command.skillId)) {
    badField = "skillId";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (!isCombatRoomType(room.roomType)) {
    return reject(state, { code: "combat-not-implemented", roomType: room.roomType });
  }
  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  const checkpoint = room.combatCheckpoint;
  if (checkpoint === null) {
    return reject(state, { code: "combat-checkpoint-missing", roomId: room.roomId });
  }

  const skillResult = catalog.getSkill(command.skillId);
  if (!skillResult.ok) {
    return reject(state, { code: "unknown-skill", skillId: command.skillId });
  }
  if (!run.build.activeSkillIds.includes(command.skillId)) {
    return reject(state, { code: "skill-not-in-build", skillId: command.skillId });
  }

  const existing = checkpoint.skillCharges.find(
    (charge) => charge.skillId === command.skillId,
  );
  let updatedCharges;
  if (existing === undefined) {
    const maximum =
      skillResult.value.maxCharges +
      resolveEffects(catalog, run.build, ROLLED_PARAMS_CARRIER_LANDING).extraCharges;
    const remaining = maximum - 1;
    if (remaining < 0) {
      return reject(state, { code: "skill-no-charges", skillId: command.skillId });
    }
    updatedCharges = Object.freeze([
      ...checkpoint.skillCharges,
      Object.freeze({ skillId: command.skillId, remaining, maximum }),
    ]);
  } else {
    const remaining = existing.remaining - 1;
    if (remaining < 0) {
      return reject(state, { code: "skill-no-charges", skillId: command.skillId });
    }
    updatedCharges = Object.freeze(
      checkpoint.skillCharges.map((charge) =>
        charge === existing ? Object.freeze({ ...charge, remaining }) : charge,
      ),
    );
  }

  const context = combatContextFor(run, room);
  let rebuilt;
  try {
    rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
  } catch {
    return reject(state, {
      code: "invalid-state",
      issues: ["the stored combat checkpoint does not match this room's layout"],
    });
  }
  const updatedCheckpoint = toCombatCheckpoint(rebuilt, updatedCharges);

  const updatedRoom: RoomState = Object.freeze({
    ...room,
    status: "in_progress",
    combatCheckpoint: updatedCheckpoint,
  });

  const updatedRun: LivingRun = {
    ...run,
    roomState: updatedRoom,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

/**
 * Record one bridge-reported volley end (CA-02). The outcome ID must be
 * exactly this room's next same-kind identity and is accepted at most once;
 * a loss decrements Integrity by exactly one and restores a valid pre-launch
 * checkpoint with the room's advanced loss ledger, and a clear enables room
 * resolution.
 */
function reportCombatOutcome(
  state: RunState,
  command: Extract<RunCommand, { type: "ReportCombatOutcome" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (
    badField === null &&
    (!isNonEmptyString(command.outcome.outcomeId) ||
      (command.outcome.kind !== "loss_of_ball" && command.outcome.kind !== "clear"))
  ) {
    badField = "outcome";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (!isCombatRoomType(room.roomType)) {
    return reject(state, { code: "combat-not-implemented", roomType: room.roomType });
  }
  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  const checkpoint = room.combatCheckpoint;
  if (checkpoint === null) {
    return reject(state, { code: "combat-checkpoint-missing", roomId: room.roomId });
  }

  const reported: CombatOutcomeMessage = command.outcome;
  if (room.processedOutcomeIds.includes(reported.outcomeId)) {
    return reject(state, { code: "duplicate-outcome-id", outcomeId: reported.outcomeId });
  }
  const priorCount = room.processedOutcomeIds.filter((outcomeId) =>
    outcomeId.startsWith(`${room.eventKey}:outcome:${reported.kind}:`),
  ).length;
  const expectedId = outcomeIdFor(room.eventKey, reported.kind, priorCount);
  if (reported.outcomeId !== expectedId) {
    return reject(state, { code: "unknown-outcome-id", outcomeId: reported.outcomeId });
  }

  const recordedOutcomeIds = Object.freeze([
    ...room.processedOutcomeIds,
    reported.outcomeId,
  ]);

  const context = combatContextFor(run, room);
  let rebuilt;
  try {
    rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
  } catch {
    return reject(state, {
      code: "invalid-state",
      issues: ["the stored combat checkpoint does not match this room's layout"],
    });
  }

  let updatedRun: LivingRun;
  if (reported.kind === "clear") {
    const updatedRoom: RoomState = Object.freeze({
      ...room,
      status: "in_progress",
      processedOutcomeIds: recordedOutcomeIds,
    });
    updatedRun = {
      ...run,
      roomState: updatedRoom,
      revision: run.revision + 1,
      updatedAt: command.now,
      lastCommitId: command.commitId,
    };
  } else {
    // CA-04: a loss costs exactly one Integrity and restores a valid
    // pre-launch checkpoint. Reaching 0 is the death boundary owned by
    // CAP-12 (S07): until finalization lands, a loss at 1 commits with
    // integrity 0 and the room still open in pre-launch; a further loss at
    // 0 is rejected — no fabricated survival.
    const integrityCurrent = run.integrityCurrent - 1;
    if (integrityCurrent < 0) {
      return reject(state, {
        code: "invalid-state",
        issues: ["integrity is already depleted"],
      });
    }
    const restoredState = { ...rebuilt, losses: context.lossCount + 1 };
    const restoredCheckpoint: CombatCheckpoint = toCombatCheckpoint(
      restoredState,
      checkpoint.skillCharges,
    );
    const updatedRoom: RoomState = Object.freeze({
      ...room,
      status: "in_progress",
      processedOutcomeIds: recordedOutcomeIds,
      combatCheckpoint: restoredCheckpoint,
    });
    updatedRun = {
      ...run,
      roomState: updatedRoom,
      integrityCurrent,
      revision: run.revision + 1,
      updatedAt: command.now,
      lastCommitId: command.commitId,
    };
  }

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function buyShopItem(
  state: RunState,
  command: Extract<RunCommand, { type: "BuyShopItem" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (badField === null && !isNonEmptyString(command.itemId)) {
    badField = "itemId";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (room.roomType !== "shop") {
    return reject(state, { code: "room-not-shop-type", roomType: room.roomType });
  }
  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  const shop = room.shop;
  if (shop === null) {
    return reject(state, { code: "invalid-state", issues: ["shop state required"] });
  }

  const item = shop.inventory.find((candidate) => candidate.itemId === command.itemId);
  if (item === undefined) {
    return reject(state, { code: "unknown-shop-item", itemId: command.itemId as ContentId });
  }
  if (shop.purchasedItemIds.includes(item.itemId)) {
    return reject(state, { code: "shop-item-already-purchased", itemId: item.itemId });
  }
  if (run.runCurrency < item.price) {
    return reject(state, {
      code: "insufficient-currency",
      required: item.price,
      available: run.runCurrency,
    });
  }

  const updatedRoom: RoomState = Object.freeze({
    ...room,
    status: "in_progress",
    shop: Object.freeze({
      ...shop,
      purchasedItemIds: Object.freeze([...shop.purchasedItemIds, item.itemId]),
    }),
  });

  const updatedRun: LivingRun = {
    ...run,
    roomState: updatedRoom,
    runCurrency: run.runCurrency - item.price,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function commitRecovery(
  state: RunState,
  command: Extract<RunCommand, { type: "CommitRecovery" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = routeCommandMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (room.roomType !== "recovery") {
    return reject(state, { code: "room-not-recovery-type", roomType: room.roomType });
  }
  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  const recovery = room.recovery;
  if (recovery === null) {
    return reject(state, { code: "invalid-state", issues: ["recovery state required"] });
  }
  if (recovery.committed) {
    return reject(state, { code: "recovery-already-committed", roomId: room.roomId });
  }

  const updatedRoom: RoomState = Object.freeze({
    ...room,
    status: "in_progress",
    recovery: Object.freeze({
      ...recovery,
      committed: true,
      commitId: command.commitId,
    }),
  });

  const updatedRun: LivingRun = {
    ...run,
    roomState: updatedRoom,
    integrityCurrent: Math.min(
      run.integrityCurrent + recovery.restoreAmount,
      run.integrityMax,
    ),
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function resolveRoom(
  state: RunState,
  command: Extract<RunCommand, { type: "ResolveRoom" }>,
  catalog: ContentCatalog,
): RunTransition {
  const badField = routeCommandMetadataField(command);
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const roomPhase = requireOpenRoomPhase(state, command);
  if (!roomPhase.ok) return roomPhase.transition;
  const { run, room } = roomPhase;

  if (room.status === "resolved") {
    return reject(state, { code: "room-already-resolved", roomId: room.roomId });
  }
  if (isCombatRoomType(room.roomType)) {
    // The code name stays (fail-closed guard); the meaning narrowed to
    // "clear first": a combat room resolves only after its clear outcome is
    // on this room's CA-02 ledger.
    if (
      !room.processedOutcomeIds.includes(outcomeIdFor(room.eventKey, "clear", 0))
    ) {
      return reject(state, { code: "combat-not-implemented", roomType: room.roomType });
    }
  }

  const rewardDraft = generateRewardDraft(catalog, {
    seed: run.seed,
    contentVersion: run.contentVersion,
    runId: run.runId,
    depth: run.depth,
    cycle: run.cycle,
    roomEventKey: room.eventKey,
    roomType: room.roomType,
    activeSkillSlotsUsed: run.build.activeSkillIds.length,
    passiveEquipmentSlotsUsed: run.build.passiveEquipmentIds.length,
  });

  const updatedRun: LivingRun = {
    ...run,
    phase: "reward",
    roomState: null,
    rewardState: mapRewardDraft(rewardDraft),
    progress: { ...run.progress, roomsResolved: run.progress.roomsResolved + 1 },
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

function selectReward(
  state: RunState,
  command: Extract<RunCommand, { type: "SelectReward" }>,
  catalog: ContentCatalog,
): RunTransition {
  let badField = routeCommandMetadataField(command);
  if (badField === null && !isNonEmptyString(command.cardId)) {
    badField = "cardId";
  }
  if (badField !== null) {
    return reject(state, { code: "invalid-metadata", field: badField });
  }

  const invalidState = invalidStateRejection(state, catalog);
  if (invalidState !== null) {
    return reject(state, invalidState);
  }

  const living = requireLivingRun(state, command);
  if (!living.ok) return living.transition;
  const run = living.run;

  const rewardState = run.rewardState;
  if (run.phase !== "reward" || rewardState === null) {
    return reject(state, { code: "invalid-state", issues: ["reward phase required"] });
  }
  if (rewardState.status !== "offered") {
    return reject(state, { code: "reward-already-selected", status: rewardState.status });
  }
  const card = rewardState.cards.find((candidate) => candidate.cardId === command.cardId);
  if (card === undefined) {
    return reject(state, { code: "unknown-reward-card", cardId: command.cardId });
  }

  const build = run.build;
  let activeSkillIds = build.activeSkillIds;
  let passiveEquipmentIds = build.passiveEquipmentIds;

  if (card.rewardType === "skill") {
    if (build.activeSkillIds.length < 3) {
      activeSkillIds = Object.freeze([...build.activeSkillIds, card.baseRewardId]);
    } else {
      activeSkillIds = Object.freeze([
        ...build.activeSkillIds.slice(1),
        card.baseRewardId,
      ]);
    }
  } else if (card.rewardType === "equipment") {
    if (build.passiveEquipmentIds.length < 4) {
      passiveEquipmentIds = Object.freeze([
        ...build.passiveEquipmentIds,
        card.baseRewardId,
      ]);
    } else {
      passiveEquipmentIds = Object.freeze([
        ...build.passiveEquipmentIds.slice(1),
        card.baseRewardId,
      ]);
    }
  }

  const newDepth = run.depth + 1;
  const newCycle = cycleForDepth(newDepth);
  const newRouteEventKey = routeEventKey(run.runId, run.contentVersion, newDepth);
  const offers = generateRouteOptions(catalog, {
    seed: run.seed,
    contentVersion: run.contentVersion,
    runId: run.runId,
    depth: newDepth,
    cycle: newCycle,
    integrityCurrent: run.integrityCurrent,
    integrityMax: run.integrityMax,
    runCurrency: run.runCurrency,
    routeEventKey: newRouteEventKey,
  });

  const newRouteState: RouteState = Object.freeze({
    eventKey: newRouteEventKey,
    offers: Object.freeze(offers.map(mapRouteOffer)),
    selectedOfferId: null,
    committed: false,
  });

  const updatedRun: LivingRun = {
    ...run,
    build: Object.freeze({
      ...build,
      activeSkillIds,
      passiveEquipmentIds,
    }),
    phase: "route",
    depth: newDepth,
    cycle: newCycle,
    routeState: newRouteState,
    rewardState: null,
    revision: run.revision + 1,
    updatedAt: command.now,
    lastCommitId: command.commitId,
  };

  const newState: RunState = { profile: state.profile, livingRun: updatedRun };
  const validation = invalidStateRejection(newState, catalog);
  if (validation !== null) {
    return reject(state, validation);
  }

  return {
    ok: true,
    state: newState,
    persistence: {
      kind: "save-checkpoint",
      runId: run.runId,
      commitId: command.commitId,
      expectedRevision: command.expectedRevision,
    },
  };
}

/**
 * Pure lifecycle transition. Given the current authoritative state and a
 * serializable command, it returns either the next state plus an idempotent
 * persistence instruction, or a typed rejection with the state left unchanged.
 * It reads no clock, random source, browser, or persistence adapter.
 */
export function runReducer(
  state: RunState,
  command: RunCommand,
  catalog: ContentCatalog,
): RunTransition {
  switch (command.type) {
    case "StartRun":
      return startRun(state, command, catalog);
    case "AbandonRun":
      return abandonRun(state, command, catalog);
    case "MaterializeRoute":
      return materializeRoute(state, command, catalog);
    case "SelectRouteOffer":
      return selectRouteOffer(state, command, catalog);
    case "CommitRoute":
      return commitRoute(state, command, catalog);
    case "BuyShopItem":
      return buyShopItem(state, command, catalog);
    case "CommitRecovery":
      return commitRecovery(state, command, catalog);
    case "LaunchBall":
      return launchBallInRoom(state, command, catalog);
    case "UseSkill":
      return useSkillInRoom(state, command, catalog);
    case "ReportCombatOutcome":
      return reportCombatOutcome(state, command, catalog);
    case "ResolveRoom":
      return resolveRoom(state, command, catalog);
    case "SelectReward":
      return selectReward(state, command, catalog);
  }
}
