import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import type { LivingRun, Profile, RunState } from "./model";
import {
  createDefaultProfile,
  createInitialLivingRun,
  CURRENT_RECORD_KEY,
  SAVE_SCHEMA_VERSION,
} from "./model";
import { createInitialRouteState, cycleForDepth, isValidDepth } from "./routes";
import { validateLivingRun, validateProfile, validateRunState } from "./validation";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;

const GLITCH_KNIGHT = asContentId("class-glitch-knight");

function makeProfile(): Profile {
  return createDefaultProfile(catalog, {
    profileId: "profile-1",
    now: 1_700_000_000_000,
    commitId: "commit-boot",
  });
}

function makeLivingRun(): LivingRun {
  return createInitialLivingRun(catalog.contentVersion, GLITCH_KNIGHT, 4, null, {
    runId: "run-1",
    seed: "seed-1",
    now: 1_700_000_000_000,
    commitId: "commit-start",
  });
}

describe("default profile factory", () => {
  it("produces a valid version-1 default profile", () => {
    const profile = makeProfile();
    expect(profile.recordKey).toBe(CURRENT_RECORD_KEY);
    expect(profile.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
    expect(profile.contentVersion).toBe(catalog.contentVersion);
    expect(profile.revision).toBe(0);
    expect(profile.shards).toBe(0);
    expect(profile.records).toEqual({
      highestReachedDepth: 0,
      highestBossDepth: 0,
      bossesDefeated: 0,
    });
    expect(profile.relicState.equippedForNextRunId).toBeNull();
    expect(profile.lastRunSummary).toBeNull();
    expect(profile.pendingRelicChoice).toBeNull();
    expect(profile.lastFinalizedRunId).toBeNull();
    expect([...profile.unlocks.classIds]).toEqual([
      "class-circuit-rogue",
      "class-glitch-knight",
    ]);
    expect(validateProfile(profile, catalog)).toEqual({ ok: true });
  });
});

describe("depth and cycle rules", () => {
  it.each([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 2],
    [6, 2],
    [7, 3],
    [9, 3],
    [Number.MAX_SAFE_INTEGER, Math.floor((Number.MAX_SAFE_INTEGER - 1) / 3) + 1],
  ])("cycle for depth %i is %i", (depth, expected) => {
    expect(cycleForDepth(depth)).toBe(expected);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid depth %p",
    (depth) => {
      expect(isValidDepth(depth)).toBe(false);
      expect(() => cycleForDepth(depth)).toThrow(RangeError);
    },
  );
});

describe("class starting Integrity", () => {
  it.each([
    ["class-circuit-rogue", 3],
    ["class-glitch-knight", 4],
    ["class-neon-mage", 2],
  ] as const)("%s starts at Integrity %i", (id, integrity) => {
    const result = catalog.getClass(asContentId(id));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.startingIntegrity).toBe(integrity);
    }
  });
});

describe("initial route checkpoint", () => {
  it("creates a named, empty, uncommitted route with a deterministic key", () => {
    const route = createInitialRouteState("run-1", catalog.contentVersion);
    expect(route).toEqual({
      eventKey: "route:content-1:run-1:1",
      offers: [],
      selectedOfferId: null,
      committed: false,
    });
    expect(createInitialRouteState("run-1", catalog.contentVersion)).toEqual(route);
  });

  it("opens a new living run at depth 1, cycle 1, route phase", () => {
    const run = makeLivingRun();
    expect(run.depth).toBe(1);
    expect(run.cycle).toBe(1);
    expect(run.phase).toBe("route");
    expect(run.integrityCurrent).toBe(4);
    expect(run.integrityMax).toBe(4);
    expect(run.build).toEqual({
      activeSkillIds: [],
      passiveEquipmentIds: [],
      carryOverRelicId: null,
    });
    expect(run.roomState).toBeNull();
    expect(run.rewardState).toBeNull();
    expect(run.routeState?.offers).toEqual([]);
    expect(validateLivingRun(run, catalog)).toEqual({ ok: true });
  });
});

describe("cross-field state validation", () => {
  it("accepts a coherent profile-plus-living-run state", () => {
    const state: RunState = { profile: makeProfile(), livingRun: makeLivingRun() };
    expect(validateRunState(state, catalog)).toEqual({ ok: true });
  });

  it.each([
    [
      "cycle mismatch",
      (run: LivingRun): LivingRun => ({ ...run, cycle: 5 }),
      "invalid-cycle",
    ],
    [
      "integrity above max",
      (run: LivingRun): LivingRun => ({ ...run, integrityCurrent: 9 }),
      "invalid-integrity-current",
    ],
    [
      "unknown class",
      (run: LivingRun): LivingRun => ({ ...run, classId: asContentId("class-ghost") }),
      "unknown-class",
    ],
    [
      "duplicate active skills",
      (run: LivingRun): LivingRun => ({
        ...run,
        build: {
          ...run.build,
          activeSkillIds: [asContentId("skill-a"), asContentId("skill-a")],
        },
      }),
      "invalid-active-skills",
    ],
    [
      "phase-state mismatch",
      (run: LivingRun): LivingRun => ({ ...run, phase: "room", routeState: null }),
      "missing-phase-state",
    ],
    [
      "premature route commitment",
      (run: LivingRun): LivingRun => ({
        ...run,
        routeState: { ...run.routeState!, committed: true },
      }),
      "premature-route-commitment",
    ],
  ])("rejects %s", (_label, mutate, code) => {
    const state: RunState = { profile: makeProfile(), livingRun: mutate(makeLivingRun()) };
    const result = validateRunState(state, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.code)).toContain(code);
    }
  });
});
