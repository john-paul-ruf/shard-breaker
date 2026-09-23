import { describe, expect, it } from "vitest";

import type { ContentId } from "../content/catalog";
import { createContentCatalog } from "../content/catalog";
import { AIM_MAX_DEVIATION } from "../combat/model";
import { outcomeIdFor } from "../combat/results";
import { fromCombatCheckpoint } from "../combat/layout";
import type { RunCommand } from "./commands";
import { runReducer } from "./reducer";
import type {
  LivingRun,
  Profile,
  RunState,
} from "./model";
import { createDefaultProfile, createInitialLivingRun } from "./model";
import { parseLivingRunRecord } from "../../persistence/validation";
import { validateRunState } from "./validation";

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

function makeLivingRun(overrides: Partial<LivingRun> = {}): LivingRun {
  return {
    ...createInitialLivingRun(catalog.contentVersion, GLITCH_KNIGHT, 4, null, {
      runId: "run-1",
      seed: "seed-1",
      now: 1_700_000_000_000,
      commitId: "commit-start",
    }),
    ...overrides,
  };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function stateWith(run: LivingRun | null): RunState {
  return { profile: makeProfile(), livingRun: run };
}

function materializeCommand(
  overrides: Partial<Extract<RunCommand, { type: "MaterializeRoute" }>> = {},
): RunCommand {
  return {
    type: "MaterializeRoute",
    runId: "run-1",
    expectedRevision: 0,
    commitId: "commit-materialize",
    now: 1_700_000_000_100,
    ...overrides,
  };
}

function selectRouteCommand(offerId: string, expectedRevision: number): RunCommand {
  return {
    type: "SelectRouteOffer",
    runId: "run-1",
    expectedRevision,
    offerId,
    commitId: "commit-select",
    now: 1_700_000_000_200,
  };
}

function commitRouteCommand(expectedRevision: number): RunCommand {
  return {
    type: "CommitRoute",
    runId: "run-1",
    expectedRevision,
    commitId: "commit-route",
    now: 1_700_000_000_300,
  };
}

function launchBallCommand(
  expectedRevision: number,
  overrides: Partial<Extract<RunCommand, { type: "LaunchBall" }>> = {},
): RunCommand {
  return {
    type: "LaunchBall",
    runId: "run-1",
    expectedRevision,
    aimAngle: 0.2,
    commitId: "commit-launch",
    now: 1_700_000_000_400,
    ...overrides,
  };
}

function useSkillCommand(
  expectedRevision: number,
  skillId: string,
  overrides: Partial<Extract<RunCommand, { type: "UseSkill" }>> = {},
): RunCommand {
  return {
    type: "UseSkill",
    runId: "run-1",
    expectedRevision,
    skillId: asContentId(skillId),
    commitId: "commit-skill",
    now: 1_700_000_000_450,
    ...overrides,
  };
}

function reportOutcomeCommand(
  expectedRevision: number,
  outcome: { outcomeId: string; kind: "loss_of_ball" | "clear" },
  overrides: Partial<Extract<RunCommand, { type: "ReportCombatOutcome" }>> = {},
): RunCommand {
  return {
    type: "ReportCombatOutcome",
    runId: "run-1",
    expectedRevision,
    outcome,
    commitId: "commit-outcome",
    now: 1_700_000_000_500,
    ...overrides,
  };
}

function resolveCommand(expectedRevision: number): RunCommand {
  return {
    type: "ResolveRoom",
    runId: "run-1",
    expectedRevision,
    commitId: "commit-resolve",
    now: 1_700_000_000_600,
  };
}

/** Drive the committed lifecycle to phase "room" for the requested room type. */
function runInRoomPhase(
  roomType: "battle" | "elite" | "shop" | "recovery" | "boss",
  overrides: Partial<LivingRun> = {},
): RunState {
  let state = stateWith(makeLivingRun(overrides));
  const materialized = runReducer(state, materializeCommand(), catalog);
  if (!materialized.ok) throw new Error("materialize must succeed");
  state = materialized.state;
  const offer = state.livingRun!.routeState!.offers.find(
    (candidate) => candidate.roomType === roomType,
  )!;
  const selected = runReducer(state, selectRouteCommand(offer.offerId, 1), catalog);
  if (!selected.ok) throw new Error("select must succeed");
  state = selected.state;
  const committed = runReducer(state, commitRouteCommand(2), catalog);
  if (!committed.ok) throw new Error("commit must succeed");
  return committed.state;
}

function expectRejection(
  transition: ReturnType<typeof runReducer>,
  code: string,
): void {
  expect(transition.ok).toBe(false);
  if (!transition.ok) {
    expect(transition.error.code).toBe(code);
  }
}

function expectInvalidMetadata(
  transition: ReturnType<typeof runReducer>,
  field: string,
): void {
  expect(transition.ok).toBe(false);
  if (!transition.ok) {
    expect(transition.error).toEqual({ code: "invalid-metadata", field });
  }
}

function expectPersistableLivingRun(state: RunState): LivingRun {
  const run = state.livingRun!;
  expect(validateRunState(state, catalog)).toEqual({ ok: true });
  const parsed = parseLivingRunRecord(run, catalog);
  expect(parsed.ok).toBe(true);
  return run;
}

describe("CA-03 — room-entry checkpoint emission and acceptance", () => {
  it("persists a real pre-launch checkpoint when a battle room is committed", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;

    expect(room.combatCheckpoint).not.toBeNull();
    const checkpoint = room.combatCheckpoint!;
    expect(checkpoint.kind).toBe("pre_launch");
    expect(checkpoint.ballAttached).toBe(true);
    expect(checkpoint.enemies.length).toBe(room.threatProfile.density);
    expect(checkpoint.enemies.every((enemy) => !enemy.defeated)).toBe(true);
    expect(checkpoint.hazards.map((hazard) => hazard.hazardId)).toEqual(
      room.threatProfile.hazardIds,
    );
    expectPersistableLivingRun(state);
  });

  it("persists a real checkpoint for an elite room committed at depth 2", () => {
    const state = runInRoomPhase("elite");
    const room = state.livingRun!.roomState!;
    expect(room.combatCheckpoint).not.toBeNull();
    expect(room.combatCheckpoint!.enemies.length).toBe(room.threatProfile.density);
    expectPersistableLivingRun(state);
  });

  it("keeps utility rooms checkpoint-free and their runs persistable", () => {
    for (const roomType of ["shop", "recovery"] as const) {
      const state = runInRoomPhase(roomType);
      const room = state.livingRun!.roomState!;
      expect(room.combatCheckpoint).toBeNull();
      expectPersistableLivingRun(state);
    }
  });

  it("emits checkpoint enemies only from the catalog", () => {
    const state = runInRoomPhase("battle");
    const checkpoint = state.livingRun!.roomState!.combatCheckpoint!;
    for (const enemy of checkpoint.enemies) {
      expect(catalog.getEnemy(enemy.enemyId).ok).toBe(true);
    }
  });
});

describe("validation — combat phase invariants", () => {
  it("rejects an unresolved battle checkpoint with no undefeated enemy", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const allDefeated = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: {
          ...room,
          combatCheckpoint: {
            ...room.combatCheckpoint!,
            enemies: room.combatCheckpoint!.enemies.map((enemy) => ({
              ...enemy,
              defeated: true,
            })),
          },
        },
      },
    };
    const result = validateRunState(allDefeated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "invalid-combat-checkpoint")).toBe(true);
    }
    const parsed = parseLivingRunRecord(allDefeated.livingRun!, catalog);
    expect(parsed.ok).toBe(false);
  });

  it("rejects a checkpoint whose charges exceed the authored maximum", () => {
    const state = runInRoomPhase("battle", {
      build: {
        activeSkillIds: [],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
      },
    });
    const room = state.livingRun!.roomState!;
    const inflated = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: {
          ...room,
          combatCheckpoint: {
            ...room.combatCheckpoint!,
            skillCharges: [
              { skillId: asContentId("skill-prism-burst"), remaining: 9, maximum: 9 },
            ],
          },
        },
      },
    };
    const result = validateRunState(inflated, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "invalid-skill-charges")).toBe(true);
    }
    const parsed = parseLivingRunRecord(inflated.livingRun!, catalog);
    expect(parsed.ok).toBe(false);
  });

  it("rejects a foreign outcome ID on the room ledger", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const foreign = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: {
          ...room,
          processedOutcomeIds: ["route:content-1:elsewhere:outcome:clear:0"],
        },
      },
    };
    const result = validateRunState(foreign, catalog);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((issue) => issue.code === "invalid-outcome-id")).toBe(true);
    }
  });
});

describe("runReducer — LaunchBall", () => {
  it("marks an open combat room in progress and keeps a valid checkpoint", () => {
    const state = runInRoomPhase("battle");
    const before = state.livingRun!.roomState!.combatCheckpoint;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(launchBallCommand(3)),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.roomState!.status).toBe("in_progress");
      expect(run.roomState!.combatCheckpoint).toEqual(before);
      expect(run.revision).toBe(4);
      expect(run.lastCommitId).toBe("commit-launch");
      expect(run.updatedAt).toBe(1_700_000_000_400);
      expect(transition.persistence).toEqual({
        kind: "save-checkpoint",
        runId: "run-1",
        commitId: "commit-launch",
        expectedRevision: 3,
      });
    }
  });

  it("rejects an aim outside S01's legal cone", () => {
    const state = runInRoomPhase("battle");
    const transition = runReducer(
      state,
      launchBallCommand(3, { aimAngle: AIM_MAX_DEVIATION + 0.01 }),
      catalog,
    );
    expectRejection(transition, "invalid-aim-angle");
    expect(transition.state).toBe(state);
  });

  it("accepts an aim at the cone boundary", () => {
    const state = runInRoomPhase("battle");
    const transition = runReducer(
      state,
      launchBallCommand(3, { aimAngle: AIM_MAX_DEVIATION }),
      catalog,
    );
    expect(transition.ok).toBe(true);
  });

  it("rejects a launch outside the room phase and on utility rooms", () => {
    const routeState = stateWith(makeLivingRun());
    expectRejection(
      runReducer(routeState, launchBallCommand(0), catalog),
      "invalid-state",
    );
    const shopState = runInRoomPhase("shop");
    expectRejection(
      runReducer(shopState, launchBallCommand(3), catalog),
      "combat-not-implemented",
    );
  });

  it("fails closed on a combat room whose checkpoint was stripped", () => {
    const state = runInRoomPhase("battle");
    const stripped: RunState = {
      ...state,
      livingRun: {
        ...state.livingRun!,
        roomState: { ...state.livingRun!.roomState!, combatCheckpoint: null },
      },
    };
    // CA-03 coherence makes such a state invalid outright; the combat
    // commands reject it before any arena work and leave it unchanged.
    const transition = runReducer(stripped, launchBallCommand(3), catalog);
    expectRejection(transition, "invalid-state");
    expect(transition.state).toBe(stripped);
    const parsed = parseLivingRunRecord(stripped.livingRun!, catalog);
    expect(parsed.ok).toBe(false);
  });

  it("rejects stale metadata and revisions", () => {
    const state = runInRoomPhase("battle");
    expectInvalidMetadata(runReducer(state, launchBallCommand(3, { runId: "" }), catalog), "runId");
    expectInvalidMetadata(runReducer(state, launchBallCommand(3, { now: Number.NaN }), catalog), "now");
    const stale = runReducer(state, launchBallCommand(9), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});

describe("runReducer — UseSkill", () => {
  it("initializes charges from the authored maximum plus effect bonus", () => {
    const state = runInRoomPhase("battle", {
      build: {
        activeSkillIds: [asContentId("skill-prism-burst")],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
      },
    });
    const before = state.livingRun!.roomState!.combatCheckpoint!;
    expect(before.skillCharges).toEqual([]);

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(useSkillCommand(3, "skill-prism-burst")),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      const charges = run.roomState!.combatCheckpoint!.skillCharges;
      expect(charges).toHaveLength(1);
      expect(charges[0]).toEqual({
        skillId: "skill-prism-burst",
        remaining: 1,
        maximum: 2,
      });
      expect(run.roomState!.status).toBe("in_progress");
    }
  });

  it("consumes one charge per use and reaches zero", () => {
    const state = runInRoomPhase("battle", {
      build: {
        activeSkillIds: [asContentId("skill-shield-bash")],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
      },
    });
    const first = runReducer(state, useSkillCommand(3, "skill-shield-bash"), catalog);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = runReducer(first.state, useSkillCommand(4, "skill-shield-bash"), catalog);
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const charges = second.state.livingRun!.roomState!.combatCheckpoint!.skillCharges;
    expect(charges[0]!.remaining).toBe(0);
    expectPersistableLivingRun(second.state);

    const third = runReducer(second.state, useSkillCommand(5, "skill-shield-bash"), catalog);
    expectRejection(third, "skill-no-charges");
    expect(third.state).toBe(second.state);
  });

  it("rejects a skill outside the catalog and one not in the active build", () => {
    const state = runInRoomPhase("battle", {
      build: {
        activeSkillIds: [asContentId("skill-prism-burst")],
        passiveEquipmentIds: [],
        carryOverRelicId: null,
      },
    });
    expectRejection(
      runReducer(state, useSkillCommand(3, "skill-cascade"), catalog),
      "skill-not-in-build",
    );
    expectRejection(
      runReducer(state, useSkillCommand(3, "skill-ghost"), catalog),
      "unknown-skill",
    );
  });

  it("rejects a skill use in a utility room and outside the room phase", () => {
    const shopState = runInRoomPhase("shop");
    expectRejection(
      runReducer(shopState, useSkillCommand(3, "skill-prism-burst"), catalog),
      "combat-not-implemented",
    );
    const routeState = stateWith(makeLivingRun());
    expectRejection(
      runReducer(routeState, useSkillCommand(0, "skill-prism-burst"), catalog),
      "invalid-state",
    );
  });

  it("rejects stale metadata and revisions", () => {
    const state = runInRoomPhase("battle");
    expectInvalidMetadata(
      runReducer(state, useSkillCommand(3, ""), catalog),
      "skillId",
    );
    const stale = runReducer(state, useSkillCommand(9, "skill-prism-burst"), catalog);
    expectRejection(stale, "stale-run-revision");
  });
});

describe("CA-02 — ReportCombatOutcome ledger", () => {
  it("records the room's first loss outcome and decrements integrity exactly 1", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const checkpointBefore = room.combatCheckpoint!;
    const integrityBefore = state.livingRun!.integrityCurrent;

    const transition = runReducer(
      deepFreeze(state),
      deepFreeze(
        reportOutcomeCommand(3, {
          outcomeId: outcomeIdFor(room.eventKey, "loss_of_ball", 0),
          kind: "loss_of_ball",
        }),
      ),
      catalog,
    );

    expect(transition.ok).toBe(true);
    if (transition.ok) {
      const run = expectPersistableLivingRun(transition.state);
      expect(run.integrityCurrent).toBe(integrityBefore - 1);
      expect(run.roomState!.processedOutcomeIds).toEqual([
        outcomeIdFor(room.eventKey, "loss_of_ball", 0),
      ]);

      // The restored checkpoint is a valid pre-launch snapshot carrying the
      // advanced loss ledger.
      const restored = run.roomState!.combatCheckpoint!;
      expect(restored.kind).toBe("loss_of_ball");
      expect(restored.ballAttached).toBe(true);
      expect(restored.enemies.length).toBe(checkpointBefore.enemies.length);
      expect(restored.paddleX).toBe(checkpointBefore.paddleX);
    }
  });

  it("restores a pre-launch checkpoint the combat domain can rebuild", () => {
    const state = runInRoomPhase("battle");
    const first = runReducer(
      state,
      reportOutcomeCommand(3, {
        outcomeId: outcomeIdFor(state.livingRun!.roomState!.eventKey, "loss_of_ball", 0),
        kind: "loss_of_ball",
      }),
      catalog,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const room = first.state.livingRun!.roomState!;
    const checkpoint = room.combatCheckpoint!;

    const context = {
      seed: first.state.livingRun!.seed,
      contentVersion: first.state.livingRun!.contentVersion,
      roomId: room.roomId,
      eventKey: room.eventKey,
      formationId: room.threatProfile.formationId,
      density: room.threatProfile.density,
      durabilityFactor: room.threatProfile.durabilityFactor,
      lossCount: 1,
      hazardIds: room.threatProfile.hazardIds,
    };
    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
    expect(rebuilt.phase).toBe("pre_launch");
    expect(rebuilt.losses).toBe(1);
    expect(rebuilt.balls[0]!.attached).toBe(true);
  });

  it("rejects a duplicate loss outcome and a foreign outcome ID", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const firstId = outcomeIdFor(room.eventKey, "loss_of_ball", 0);
    const first = runReducer(
      state,
      reportOutcomeCommand(3, { outcomeId: firstId, kind: "loss_of_ball" }),
      catalog,
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Same ID again → duplicate.
    const duplicate = runReducer(
      first.state,
      reportOutcomeCommand(4, { outcomeId: firstId, kind: "loss_of_ball" }),
      catalog,
    );
    expectRejection(duplicate, "duplicate-outcome-id");
    expect(duplicate.state).toBe(first.state);

    // Next expected loss is index 1, not 0 or a foreign key.
    expectRejection(
      runReducer(
        first.state,
        reportOutcomeCommand(4, {
          outcomeId: outcomeIdFor(room.eventKey, "loss_of_ball", 0),
          kind: "loss_of_ball",
        }),
        catalog,
      ),
      "duplicate-outcome-id",
    );
    expectRejection(
      runReducer(
        first.state,
        reportOutcomeCommand(4, {
          outcomeId: "route:content-1:other-room:outcome:loss_of_ball:0",
          kind: "loss_of_ball",
        }),
        catalog,
      ),
      "unknown-outcome-id",
    );
    // Clear outcomes index independently of losses: after one loss the
    // room's first clear is still the expected next outcome (CA-02).
    const clearAfterLoss = runReducer(
      first.state,
      reportOutcomeCommand(4, {
        outcomeId: outcomeIdFor(room.eventKey, "clear", 0),
        kind: "clear",
      }),
      catalog,
    );
    expect(clearAfterLoss.ok).toBe(true);
  });

  it("stacks loss indexes per CA-02 and charges one integrity per loss", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    let current = state;
    for (let index = 0; index < 2; index += 1) {
      const transition = runReducer(
        current,
        reportOutcomeCommand(current.livingRun!.revision, {
          outcomeId: outcomeIdFor(room.eventKey, "loss_of_ball", index),
          kind: "loss_of_ball",
        }),
        catalog,
      );
      expect(transition.ok).toBe(true);
      if (!transition.ok) return;
      current = transition.state;
    }
    const run = current.livingRun!;
    expect(run.integrityCurrent).toBe(state.livingRun!.integrityCurrent - 2);
    expect(run.roomState!.processedOutcomeIds).toEqual([
      outcomeIdFor(room.eventKey, "loss_of_ball", 0),
      outcomeIdFor(room.eventKey, "loss_of_ball", 1),
    ]);
    const restored = run.roomState!.combatCheckpoint!;
    expect(restored.kind).toBe("loss_of_ball");
    expectPersistableLivingRun(current);
  });

  it("rejects a loss at zero integrity (death boundary owned by CAP-12)", () => {
    const state = runInRoomPhase("battle", { integrityCurrent: 0 });
    const room = state.livingRun!.roomState!;
    const transition = runReducer(
      state,
      reportOutcomeCommand(3, {
        outcomeId: outcomeIdFor(room.eventKey, "loss_of_ball", 0),
        kind: "loss_of_ball",
      }),
      catalog,
    );
    expectRejection(transition, "invalid-state");
    expect(transition.state).toBe(state);
  });

  it("rejects outcome reports outside the room phase and on utility rooms", () => {
    const routeState = stateWith(makeLivingRun());
    expectRejection(
      runReducer(
        routeState,
        reportOutcomeCommand(0, {
          outcomeId: "route:content-1:run-1:1:outcome:loss_of_ball:0",
          kind: "loss_of_ball",
        }),
        catalog,
      ),
      "invalid-state",
    );
    const shopState = runInRoomPhase("shop");
    expectRejection(
      runReducer(
        shopState,
        reportOutcomeCommand(3, {
          outcomeId: "route:content-1:run-1:1:outcome:loss_of_ball:0",
          kind: "loss_of_ball",
        }),
        catalog,
      ),
      "combat-not-implemented",
    );
  });

  it("rejects malformed outcome metadata", () => {
    const state = runInRoomPhase("battle");
    expectInvalidMetadata(
      runReducer(
        state,
        reportOutcomeCommand(3, { outcomeId: "", kind: "loss_of_ball" }),
        catalog,
      ),
      "outcome",
    );
    expectInvalidMetadata(
      runReducer(
        state,
        reportOutcomeCommand(3, {
          outcomeId: "anything",
          kind: "not-a-kind" as "loss_of_ball",
        }),
        catalog,
      ),
      "outcome",
    );
  });
});

describe("CAP-04 — clear enables resolution", () => {
  it("resolves a battle room into the reward draft after its clear outcome", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const cleared = runReducer(
      state,
      reportOutcomeCommand(3, {
        outcomeId: outcomeIdFor(room.eventKey, "clear", 0),
        kind: "clear",
      }),
      catalog,
    );
    expect(cleared.ok).toBe(true);
    if (!cleared.ok) return;

    const resolved = runReducer(cleared.state, resolveCommand(4), catalog);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;

    const run = expectPersistableLivingRun(resolved.state);
    expect(run.phase).toBe("reward");
    expect(run.roomState).toBeNull();
    expect(run.rewardState!.cards).toHaveLength(3);
    expect(run.progress.roomsResolved).toBe(1);
    expect(run.updatedAt).toBe(1_700_000_000_600);
  });

  it("still rejects resolution without a recorded clear (combat-not-implemented)", () => {
    const state = runInRoomPhase("battle");
    const transition = runReducer(state, resolveCommand(3), catalog);
    expectRejection(transition, "combat-not-implemented");
    if (!transition.ok && transition.error.code === "combat-not-implemented") {
      expect(transition.error.roomType).toBe("battle");
    }
    expect(transition.state).toBe(state);
  });

  it("rejects resolution after only losses were recorded", () => {
    const state = runInRoomPhase("battle");
    const room = state.livingRun!.roomState!;
    const lost = runReducer(
      state,
      reportOutcomeCommand(3, {
        outcomeId: outcomeIdFor(room.eventKey, "loss_of_ball", 0),
        kind: "loss_of_ball",
      }),
      catalog,
    );
    expect(lost.ok).toBe(true);
    if (!lost.ok) return;
    expectRejection(runReducer(lost.state, resolveCommand(4), catalog), "combat-not-implemented");
  });
});
