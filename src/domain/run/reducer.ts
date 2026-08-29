import type { ContentCatalog } from "../content/catalog";
import type { RunCommand, RunRejection, RunTransition } from "./commands";
import type { RunState } from "./model";
import { createInitialLivingRun } from "./model";
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
  }
}
