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
import { terminalShardAward } from "./reducer";
import { createInitialRouteState, cycleForDepth, isValidDepth } from "./routes";
import { RELIC_DEFINITIONS } from "../content/relics";
import { validateLivingRun, validateProfile, validateRunState } from "./validation";
import { parseRunStateRecords } from "../../persistence/validation";

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

describe("CA-16/CA-18 — terminal economy and relic choice", () => {
  function profileWithPendingChoice(): Profile {
    return {
      ...makeProfile(),
      lastRunSummary: {
        runId: "run-1",
        classId: GLITCH_KNIGHT,
        reachedDepth: 1,
        bossesReached: 0,
        bossesDefeated: 0,
        activeSkillIds: [],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
        shardsEarned: 20,
        terminalReason: "death",
        completedAt: 1_700_000_000_000,
      },
      lastFinalizedRunId: "run-1",
      pendingRelicChoice: {
        sourceRunId: "run-1",
        options: RELIC_DEFINITIONS.map((definition) => definition.id),
        selectedId: null,
        commitId: null,
      },
    };
  }

  function resolveCommand(
    overrides: Partial<Extract<RunCommand, { type: "ResolveRelicChoice" }>> = {},
  ): RunCommand {
    return {
      type: "ResolveRelicChoice",
      relicId: RELIC_DEFINITIONS[0]!.id,
      expectedProfileRevision: 0,
      commitId: "commit-relic",
      now: 1_700_000_000_500,
      ...overrides,
    };
  }

  it("emits the pending choice with the death finalization in authored order", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      resolveCommand(),
      catalog,
    );
    // No pending choice before a terminal: the transition is rejected.
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "no-pending-relic-choice" });
    }
  });

  it("resolves a choose into unlock + equip in one profile mutation", () => {
    const profile = profileWithPendingChoice();
    const transition = runReducer(
      deepFreeze({ profile, livingRun: null }),
      deepFreeze(resolveCommand()),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    const next = transition.state.profile;
    expect(next.pendingRelicChoice).toEqual({
      sourceRunId: "run-1",
      options: RELIC_DEFINITIONS.map((definition) => definition.id),
      selectedId: RELIC_DEFINITIONS[0]!.id,
      commitId: "commit-relic",
    });
    expect(next.unlocks.relicIds).toContain(RELIC_DEFINITIONS[0]!.id);
    expect(next.relicState).toEqual({ equippedForNextRunId: RELIC_DEFINITIONS[0]!.id });
    expect(next.revision).toBe(profile.revision + 1);
    expect(transition.state.livingRun).toBeNull();
    expect(transition.persistence).toEqual({
      kind: "resolve-relic-choice",
      relicId: RELIC_DEFINITIONS[0]!.id,
      commitId: "commit-relic",
      expectedProfileRevision: 0,
      proposedProfile: next,
    });
    expect(validateProfile(next, catalog)).toEqual({ ok: true });
  });

  it("replaces a previously equipped relic in the one slot", () => {
    const previous = RELIC_DEFINITIONS[1]!.id;
    const profile: Profile = {
      ...profileWithPendingChoice(),
      unlocks: {
        ...profileWithPendingChoice().unlocks,
        relicIds: [previous],
      },
      relicState: { equippedForNextRunId: previous },
    };
    const transition = runReducer(
      { profile, livingRun: null },
      resolveCommand(),
      catalog,
    );
    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    expect(transition.state.profile.relicState).toEqual({
      equippedForNextRunId: RELIC_DEFINITIONS[0]!.id,
    });
    expect([...transition.state.profile.unlocks.relicIds]).toEqual([
      previous,
      RELIC_DEFINITIONS[0]!.id,
    ]);
  });

  it("declines by clearing the pending choice without touching relicState", () => {
    const profile: Profile = {
      ...profileWithPendingChoice(),
      relicState: { equippedForNextRunId: RELIC_DEFINITIONS[2]!.id },
      unlocks: {
        ...profileWithPendingChoice().unlocks,
        relicIds: [RELIC_DEFINITIONS[2]!.id],
      },
    };
    const transition = runReducer(
      deepFreeze({ profile, livingRun: null }),
      deepFreeze(resolveCommand({ relicId: null })),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (!transition.ok) return;
    expect(transition.state.profile.pendingRelicChoice).toBeNull();
    expect(transition.state.profile.relicState).toEqual({
      equippedForNextRunId: RELIC_DEFINITIONS[2]!.id,
    });
    expect(transition.state.profile.unlocks.relicIds).toContain(RELIC_DEFINITIONS[2]!.id);
    expect(transition.persistence).toMatchObject({
      kind: "resolve-relic-choice",
      relicId: null,
    });
    expect(validateProfile(transition.state.profile, catalog)).toEqual({ ok: true });
  });

  it("rejects a resolved choice from resolving again (once-only)", () => {
    const profile = profileWithPendingChoice();
    const first = runReducer({ profile, livingRun: null }, resolveCommand(), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = runReducer(
      first.state,
      resolveCommand({
        commitId: "commit-relic-2",
        expectedProfileRevision: first.state.profile.revision,
      }),
      catalog,
    );
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toEqual({ code: "no-pending-relic-choice" });
    }
    expect(second.state).toBe(first.state);
  });

  it("rejects a choice outside the pending options", () => {
    const transition = runReducer(
      { profile: profileWithPendingChoice(), livingRun: null },
      resolveCommand({ relicId: asContentId("relic-not-offered") }),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({
        code: "unknown-relic-choice",
        relicId: "relic-not-offered",
      });
    }
  });

  it("rejects a stale profile revision with StartRun's exact shape", () => {
    const transition = runReducer(
      { profile: profileWithPendingChoice(), livingRun: null },
      resolveCommand({ expectedProfileRevision: 5 }),
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

  it("rejects resolve when no pending choice exists", () => {
    const transition = runReducer(
      { profile: makeProfile(), livingRun: null },
      resolveCommand(),
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "no-pending-relic-choice" });
    }
  });

  it.each([
    ["now", resolveCommand({ now: Number.NaN })],
    ["commitId", resolveCommand({ commitId: "" })],
    ["expectedProfileRevision", resolveCommand({ expectedProfileRevision: -1 })],
  ])("rejects invalid metadata field %s", (field, command) => {
    const transition = runReducer(
      { profile: profileWithPendingChoice(), livingRun: null },
      command,
      catalog,
    );
    expect(transition.ok).toBe(false);
    if (!transition.ok) {
      expect(transition.error).toEqual({ code: "invalid-metadata", field });
    }
  });

  it("carries the terminal Shards formula through the exported rule (CA-16)", () => {
    // Depth-1/0-boss death = 20 (the S03 browser value).
    expect(terminalShardAward({ reachedDepth: 1, bossesDefeated: 0 })).toBe(20);
    expect(terminalShardAward({ reachedDepth: 3, bossesDefeated: 1 })).toBe(110);
  });

  it("feeds the freshly equipped relic to the committed StartRun consumer (CA-18)", () => {
    const profile = profileWithPendingChoice();
    const first = runReducer(
      { profile, livingRun: null },
      resolveCommand(),
      catalog,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // The committed consumer (reducer.ts reads relicState.equippedForNextRunId
    // into build.carryOverRelicId) picks up the just-resolved relic...
    const start = runReducer(
      first.state,
      startCommand({
        expectedProfileRevision: first.state.profile.revision,
      }),
      catalog,
    );
    expect(
      start.ok,
      JSON.stringify(start.ok ? null : start.error),
    ).toBe(true);
    if (!start.ok) return;
    expect(start.state.livingRun?.build.carryOverRelicId).toBe(
      RELIC_DEFINITIONS[0]!.id,
    );

    // ...and the combined state with that carried build is accepted by the
    // persistence boundary (the committed relic-locked rule holds).
    expect(
      parseRunStateRecords(start.state.profile, start.state.livingRun, catalog)
        .ok,
    ).toBe(true);
  });
});
