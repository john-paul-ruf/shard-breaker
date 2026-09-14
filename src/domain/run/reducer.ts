import type { ContentCatalog } from "../content/catalog";
import type { GeneratedRouteOffer, GeneratedRoomCandidate } from "../random/generators";
import { generateRouteOptions, generateRoomCandidate } from "../random/generators";
import type { RunCommand, RunRejection, RunTransition } from "./commands";
import type {
  LivingRun,
  RouteOfferSnapshot,
  RoomState,
  RouteState,
  RunState,
  ThreatProfileSnapshot,
} from "./model";
import { createInitialLivingRun } from "./model";
import { isBossDepth, routeEventKey } from "./routes";
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
  }
}
