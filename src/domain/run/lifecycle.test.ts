import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import type { RunCommand } from "./commands";
import { runReducer } from "./reducer";
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

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function startCommand(overrides: Partial<Extract<RunCommand, { type: "StartRun" }>> = {}): RunCommand {
  return {
    type: "StartRun",
    classId: GLITCH_KNIGHT,
    runId: "run-1",
    seed: "seed-1",
    now: 1_700_000_000_000,
    commitId: "commit-start",
    expectedProfileRevision: 0,
    ...overrides,
  };
}

function abandonCommand(
  overrides: Partial<Extract<RunCommand, { type: "AbandonRun" }>> = {},
): RunCommand {
  return {
    type: "AbandonRun",
    runId: "run-1",
    expectedRevision: 0,
    commitId: "commit-abandon",
    ...overrides,
  };
}

describe("runReducer — StartRun", () => {
  it("creates one living run without mutating the profile", () => {
    const profile = makeProfile();
    const state = deepFreeze<RunState>({ profile, livingRun: null });
    const transition = runReducer(state, deepFreeze(startCommand()), catalog);

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      expect(transition.state.livingRun).not.toBeNull();
      expect(transition.state.livingRun?.depth).toBe(1);
      expect(transition.state.livingRun?.cycle).toBe(1);
      expect(transition.state.livingRun?.integrityCurrent).toBe(4);
      expect(transition.state.livingRun?.classId).toBe("class-glitch-knight");
      // The profile is carried through unchanged, not incremented.
      expect(transition.state.profile).toBe(profile);
      expect(transition.state.profile.revision).toBe(0);
      expect(transition.persistence).toEqual({
        kind: "start-run",
        runId: "run-1",
        commitId: "commit-start",
        expectedProfileRevision: 0,
      });
    }
    expect(profile.revision).toBe(0);
  });

  it("copies a single equipped carry-over relic into the new build", () => {
    const base = makeProfile();
    const relicId = asContentId("relic-echo");
    const profile: Profile = {
      ...base,
      unlocks: { ...base.unlocks, relicIds: [relicId] },
      relicState: { equippedForNextRunId: relicId },
    };
    const transition = runReducer({ profile, livingRun: null }, startCommand(), catalog);
    expect(transition.ok).toBe(true);
    if (transition.ok) {
      expect(transition.state.livingRun?.build.carryOverRelicId).toBe(relicId);
    }
  });

  it("rejects starting over an existing living run without overwriting it", () => {
    const livingRun = makeLivingRun();
    const state = deepFreeze<RunState>({ profile: makeProfile(), livingRun });
    const transition = runReducer(state, startCommand({ runId: "run-2" }), catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "living-run-exists", runId: "run-1" });
      expect(transition.state.livingRun).toBe(livingRun);
    }
  });

  it("rejects an unknown class", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      startCommand({ classId: asContentId("class-ghost") }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("unknown-class");
    }
  });

  it("rejects a known but locked class", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      startCommand({ classId: asContentId("class-neon-mage") }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({
        code: "class-locked",
        classId: "class-neon-mage",
      });
    }
  });

  it("rejects a stale profile revision", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      startCommand({ expectedProfileRevision: 5 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({
        code: "stale-profile-revision",
        expected: 5,
        actual: 0,
      });
    }
  });

  it.each([
    ["classId", startCommand({ classId: asContentId("") })],
    ["runId", startCommand({ runId: "" })],
    ["seed", startCommand({ seed: "" })],
    ["now", startCommand({ now: Number.NaN })],
    ["commitId", startCommand({ commitId: "" })],
    ["expectedProfileRevision", startCommand({ expectedProfileRevision: -1 })],
  ])("rejects invalid metadata field %s", (field, command) => {
    const transition = runReducer({ profile: makeProfile(), livingRun: null }, command, catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "invalid-metadata", field });
    }
  });

  it("rejects a malformed incoming state", () => {
    const base = makeProfile();
    const profile: Profile = { ...base, shards: -1 };
    const transition = runReducer({ profile, livingRun: null }, startCommand(), catalog);
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("invalid-state");
    }
  });
});

describe("runReducer — AbandonRun", () => {
  it("removes the living run and grants nothing", () => {
    const profile = makeProfile();
    const livingRun = makeLivingRun();
    const state = deepFreeze<RunState>({ profile, livingRun });
    const transition = runReducer(state, deepFreeze(abandonCommand()), catalog);

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      expect(transition.state.livingRun).toBeNull();
      expect(transition.state.profile).toBe(profile);
      expect(transition.state.profile.shards).toBe(0);
      expect(transition.state.profile.lastRunSummary).toBeNull();
      expect(transition.persistence).toEqual({
        kind: "abandon-run",
        runId: "run-1",
        commitId: "commit-abandon",
        expectedRevision: 0,
      });
    }
  });

  it("rejects abandoning when there is no living run", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      abandonCommand(),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "no-living-run" });
    }
  });

  it("rejects a mismatched run ID", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: makeLivingRun() },
      abandonCommand({ runId: "run-2" }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error.code).toBe("stale-run");
    }
  });

  it("rejects a stale run revision", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: makeLivingRun() },
      abandonCommand({ expectedRevision: 3 }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({
        code: "stale-run-revision",
        expected: 3,
        actual: 0,
      });
    }
  });

  it.each([
    ["runId", abandonCommand({ runId: "" })],
    ["commitId", abandonCommand({ commitId: "" })],
    ["expectedRevision", abandonCommand({ expectedRevision: -1 })],
  ])("rejects invalid metadata field %s", (field, command) => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: makeLivingRun() },
      command,
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "invalid-metadata", field });
    }
  });
});
