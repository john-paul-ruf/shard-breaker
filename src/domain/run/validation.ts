import type { ContentCatalog, ContentId } from "../content/catalog";
import type {
  BuildSnapshot,
  LivingRun,
  Profile,
  RouteState,
  RunState,
} from "./model";
import { CURRENT_RECORD_KEY, SAVE_SCHEMA_VERSION } from "./model";
import { cycleForDepth, isValidDepth } from "./routes";

/** A single cross-field defect with a stable machine code and a locating path. */
export interface ValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type ValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

const MAX_ACTIVE_SKILLS = 3;
const MAX_PASSIVE_EQUIPMENT = 4;

function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasUniqueValues(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

class IssueCollector {
  private readonly issues: ValidationIssue[] = [];

  add(code: string, path: string, message: string): void {
    this.issues.push({ code, path, message });
  }

  require(condition: boolean, code: string, path: string, message: string): void {
    if (!condition) {
      this.add(code, path, message);
    }
  }

  result(): ValidationResult {
    return this.issues.length === 0
      ? { ok: true }
      : { ok: false, issues: [...this.issues] };
  }
}

function checkKnownIds(
  collector: IssueCollector,
  ids: readonly ContentId[],
  catalog: ContentCatalog,
  path: string,
): void {
  collector.require(
    hasUniqueValues(ids),
    "duplicate-content-id",
    path,
    "content IDs must be unique",
  );
  for (const id of ids) {
    collector.require(
      catalog.hasClass(id),
      "unknown-content-id",
      path,
      `unknown content ID: ${id}`,
    );
  }
}

function collectProfileIssues(
  collector: IssueCollector,
  profile: Profile,
  catalog: ContentCatalog,
): void {
  collector.require(
    profile.recordKey === CURRENT_RECORD_KEY,
    "invalid-record-key",
    "profile.recordKey",
    "profile must use the singleton record key",
  );
  collector.require(
    profile.saveSchemaVersion === SAVE_SCHEMA_VERSION,
    "unsupported-save-schema",
    "profile.saveSchemaVersion",
    "unsupported save schema version",
  );
  collector.require(
    profile.contentVersion === catalog.contentVersion,
    "content-version-mismatch",
    "profile.contentVersion",
    "profile content version does not match the catalog",
  );
  collector.require(
    isSafeNonNegativeInteger(profile.revision),
    "invalid-revision",
    "profile.revision",
    "revision must be a safe integer >= 0",
  );
  collector.require(
    Number.isFinite(profile.createdAt) && Number.isFinite(profile.updatedAt),
    "invalid-timestamp",
    "profile.timestamps",
    "createdAt/updatedAt must be finite",
  );
  collector.require(
    profile.lastCommitId.length > 0,
    "empty-commit-id",
    "profile.lastCommitId",
    "lastCommitId must be non-empty",
  );
  collector.require(
    isSafeNonNegativeInteger(profile.shards),
    "invalid-shards",
    "profile.shards",
    "shards must be a safe integer >= 0",
  );

  // The class-unlock projection is the only unlock list the catalog can
  // presently resolve; other unlock lists must still be unique.
  checkKnownIds(collector, profile.unlocks.classIds, catalog, "profile.unlocks.classIds");
  for (const [key, ids] of [
    ["startingChoiceIds", profile.unlocks.startingChoiceIds],
    ["contentIds", profile.unlocks.contentIds],
    ["relicIds", profile.unlocks.relicIds],
    ["cosmeticIds", profile.unlocks.cosmeticIds],
  ] as const) {
    collector.require(
      hasUniqueValues(ids),
      "duplicate-content-id",
      `profile.unlocks.${key}`,
      "content IDs must be unique",
    );
  }

  for (const upgrade of profile.utilityUpgradeLevels) {
    collector.require(
      isSafeNonNegativeInteger(upgrade.level),
      "invalid-upgrade-level",
      "profile.utilityUpgradeLevels",
      "utility upgrade level must be a safe integer >= 0",
    );
  }

  const records = profile.records;
  collector.require(
    isSafeNonNegativeInteger(records.highestReachedDepth) &&
      isSafeNonNegativeInteger(records.highestBossDepth) &&
      isSafeNonNegativeInteger(records.bossesDefeated),
    "invalid-records",
    "profile.records",
    "personal records must be safe integers >= 0",
  );

  const relic = profile.relicState.equippedForNextRunId;
  collector.require(
    relic === null || profile.unlocks.relicIds.includes(relic),
    "unequipped-relic",
    "profile.relicState.equippedForNextRunId",
    "an equipped carry-over relic must be unlocked",
  );

  if (profile.lastFinalizedRunId !== null) {
    collector.require(
      profile.lastFinalizedRunId.length > 0,
      "empty-finalized-run-id",
      "profile.lastFinalizedRunId",
      "lastFinalizedRunId must be non-empty when present",
    );
  }
}

function collectBuildIssues(collector: IssueCollector, build: BuildSnapshot): void {
  collector.require(
    build.activeSkillIds.length <= MAX_ACTIVE_SKILLS &&
      hasUniqueValues(build.activeSkillIds),
    "invalid-active-skills",
    "livingRun.build.activeSkillIds",
    "active skills must be unique and at most three",
  );
  collector.require(
    build.passiveEquipmentIds.length <= MAX_PASSIVE_EQUIPMENT &&
      hasUniqueValues(build.passiveEquipmentIds),
    "invalid-passive-equipment",
    "livingRun.build.passiveEquipmentIds",
    "passive equipment must be unique and at most four",
  );
}

function collectRouteIssues(collector: IssueCollector, route: RouteState): void {
  const offerIds = route.offers.map((offer) => offer.offerId);
  collector.require(
    hasUniqueValues(offerIds),
    "duplicate-route-offer",
    "livingRun.routeState.offers",
    "route offer IDs must be unique",
  );
  if (route.offers.length === 0) {
    collector.require(
      route.selectedOfferId === null && !route.committed,
      "premature-route-commitment",
      "livingRun.routeState",
      "an unmaterialized route cannot have a selection or commitment",
    );
    return;
  }
  collector.require(
    route.selectedOfferId === null || offerIds.includes(route.selectedOfferId),
    "unknown-route-selection",
    "livingRun.routeState.selectedOfferId",
    "a selected offer must be one of the stored offers",
  );
  collector.require(
    !route.committed || route.selectedOfferId !== null,
    "route-committed-without-selection",
    "livingRun.routeState.committed",
    "a committed route must have a selection",
  );
}

function collectLivingRunIssues(
  collector: IssueCollector,
  run: LivingRun,
  catalog: ContentCatalog,
): void {
  collector.require(
    run.recordKey === CURRENT_RECORD_KEY,
    "invalid-record-key",
    "livingRun.recordKey",
    "living run must use the singleton record key",
  );
  collector.require(
    run.saveSchemaVersion === SAVE_SCHEMA_VERSION,
    "unsupported-save-schema",
    "livingRun.saveSchemaVersion",
    "unsupported save schema version",
  );
  collector.require(
    run.contentVersion === catalog.contentVersion,
    "content-version-mismatch",
    "livingRun.contentVersion",
    "living run content version does not match the catalog",
  );
  collector.require(
    isSafeNonNegativeInteger(run.revision),
    "invalid-revision",
    "livingRun.revision",
    "revision must be a safe integer >= 0",
  );
  collector.require(
    Number.isFinite(run.createdAt) && Number.isFinite(run.updatedAt),
    "invalid-timestamp",
    "livingRun.timestamps",
    "createdAt/updatedAt must be finite",
  );
  collector.require(
    run.lastCommitId.length > 0,
    "empty-commit-id",
    "livingRun.lastCommitId",
    "lastCommitId must be non-empty",
  );
  collector.require(
    run.seed.length > 0,
    "empty-seed",
    "livingRun.seed",
    "seed must be non-empty",
  );

  if (isValidDepth(run.depth)) {
    collector.require(
      run.cycle === cycleForDepth(run.depth),
      "invalid-cycle",
      "livingRun.cycle",
      "cycle must equal floor((depth - 1) / 3) + 1",
    );
  } else {
    collector.add(
      "invalid-depth",
      "livingRun.depth",
      "depth must be a safe integer >= 1",
    );
  }

  collector.require(
    catalog.hasClass(run.classId),
    "unknown-class",
    "livingRun.classId",
    "living run references an unknown class",
  );
  collector.require(
    Number.isSafeInteger(run.integrityMax) && run.integrityMax >= 1,
    "invalid-integrity-max",
    "livingRun.integrityMax",
    "integrityMax must be a safe integer >= 1",
  );
  collector.require(
    Number.isSafeInteger(run.integrityCurrent) &&
      run.integrityCurrent >= 0 &&
      run.integrityCurrent <= run.integrityMax,
    "invalid-integrity-current",
    "livingRun.integrityCurrent",
    "integrityCurrent must be a safe integer within 0..integrityMax",
  );
  collector.require(
    isSafeNonNegativeInteger(run.runCurrency),
    "invalid-run-currency",
    "livingRun.runCurrency",
    "runCurrency must be a safe integer >= 0",
  );

  collectBuildIssues(collector, run.build);

  collector.require(
    isSafeNonNegativeInteger(run.progress.roomsResolved) &&
      isSafeNonNegativeInteger(run.progress.bossesReached) &&
      isSafeNonNegativeInteger(run.progress.bossesDefeated),
    "invalid-progress",
    "livingRun.progress",
    "progress counters must be safe integers >= 0",
  );

  // Phase-state coherence: exactly the phase's own state is present.
  const phaseStatePresent = {
    route: run.routeState !== null,
    room: run.roomState !== null,
    reward: run.rewardState !== null,
  };
  collector.require(
    phaseStatePresent[run.phase],
    "missing-phase-state",
    "livingRun.phase",
    `phase "${run.phase}" requires its matching state`,
  );
  collector.require(
    run.phase === "route" || run.routeState === null,
    "unexpected-route-state",
    "livingRun.routeState",
    "route state is only valid during the route phase",
  );
  collector.require(
    run.phase === "room" || run.roomState === null,
    "unexpected-room-state",
    "livingRun.roomState",
    "room state is only valid during the room phase",
  );
  collector.require(
    run.phase === "reward" || run.rewardState === null,
    "unexpected-reward-state",
    "livingRun.rewardState",
    "reward state is only valid during the reward phase",
  );

  if (run.routeState !== null) {
    collectRouteIssues(collector, run.routeState);
  }
}

export function validateProfile(profile: Profile, catalog: ContentCatalog): ValidationResult {
  const collector = new IssueCollector();
  collectProfileIssues(collector, profile, catalog);
  return collector.result();
}

export function validateLivingRun(run: LivingRun, catalog: ContentCatalog): ValidationResult {
  const collector = new IssueCollector();
  collectLivingRunIssues(collector, run, catalog);
  return collector.result();
}

/**
 * Validate the combined authoritative state: the permanent profile always, and
 * the living run when present. Returns every issue found so callers can report
 * a complete failure rather than the first one.
 */
export function validateRunState(state: RunState, catalog: ContentCatalog): ValidationResult {
  const collector = new IssueCollector();
  collectProfileIssues(collector, state.profile, catalog);
  if (state.livingRun !== null) {
    collectLivingRunIssues(collector, state.livingRun, catalog);
  }
  return collector.result();
}
