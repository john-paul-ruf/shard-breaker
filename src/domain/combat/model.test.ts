import { describe, expect, it } from "vitest";

import { CONTENT_VERSION, createContentCatalog } from "../content/catalog";
import { generateRoomCandidate, generateRouteOptions } from "../random/generators";
import { resolveEffects } from "./effects";
import { createCombatState } from "./layout";
import type { CombatInitContext, CombatState } from "./model";
import { launchBall, movePaddle, stepCombat } from "./rules";

/**
 * The deterministic depth-1 clearability sweep (CA-20). This committed file
 * re-establishes the measurement machinery the combat-engine probe used
 * (7,625 launches / 0 clears against the pre-rebalance numbers) as permanent
 * test code: every row drives the same composition the game bridge drives —
 * the real `generateRoomCandidate` threat numbers materialized through
 * `createCombatState`, an explicit `launchBall`, and repeated fixed-step
 * `stepCombat` chunks — with the real first-room effect conditions (empty
 * build, empty rolled params — the committed `ROLLED_PARAMS_CARRIER_LANDING`).
 *
 * CA-04 makes clearability a per-volley property (a loss restores the
 * room-entry formation snapshot, so volley damage never accumulates): every
 * row below therefore proves a clear inside ONE volley, never across losses.
 * All inputs are seeded and deterministic — no Math.random, no clock.
 */

const catalog = createContentCatalog();
const RUN_ID = "run-clearability-sweep";
const CONTENT = CONTENT_VERSION;

const SWEEP_SEEDS = Array.from(
  { length: 24 },
  (_, index) => `sweep-seed-${String(index + 1).padStart(2, "0")}`,
);

/** Step horizon per scripted volley (6,000 steps ≈ 50 simulated seconds). */
const VOLLEY_HORIZON = 6_000;
/** Fixed-step chunk the harness advances between outcome checks. */
const STEP_CHUNK = 60;

/** The legal aim cone's grid: 21 aims spanning −π/3 … +π/3 inclusive. */
const AIM_GRID: readonly number[] = Array.from(
  { length: 21 },
  (_, index) => -Math.PI / 3 + (index * (2 * Math.PI / 3)) / 20,
);
/** Paddle-center grid spanning the legal band's interior. */
const PADDLE_GRID: readonly number[] = [30, 50, 65, 80, 95, 110, 130];

/** The real first-room volley conditions: an empty build resolves to neutral. */
const EMPTY_BUILD = {
  activeSkillIds: [],
  passiveEquipmentIds: [],
  carryOverRelicId: null,
} as const;
const FIRST_ROOM_EFFECTS = resolveEffects(catalog, EMPTY_BUILD, []);

function routeContextFor(seed: string, depth: number) {
  return {
    seed,
    contentVersion: CONTENT,
    runId: RUN_ID,
    depth,
    cycle: Math.floor((depth - 1) / 3) + 1,
    integrityCurrent: 3,
    integrityMax: 3,
    runCurrency: 0,
    routeEventKey: `route:${CONTENT}:${RUN_ID}:${String(depth)}`,
  };
}

/** The real depth-1 battle-room candidate the run domain would materialize. */
function battleCandidateFor(seed: string): ReturnType<typeof generateRoomCandidate> {
  const context = routeContextFor(seed, 1);
  const offers = generateRouteOptions(catalog, context);
  const battle = offers.find((offer) => offer.roomType === "battle");
  if (battle === undefined) {
    throw new Error("the catalog exposes no depth-1 battle offer");
  }
  return generateRoomCandidate(catalog, { ...context, selectedOfferId: battle.offerId });
}

function combatContextFor(
  candidate: ReturnType<typeof generateRoomCandidate>,
  seed: string,
  overrides: Partial<CombatInitContext> = {},
): CombatInitContext {
  const profile = candidate.threatProfile;
  return {
    seed,
    contentVersion: CONTENT,
    roomId: candidate.roomId,
    eventKey: candidate.eventKey,
    formationId: profile.formationId,
    density: profile.density,
    durabilityFactor: profile.durabilityFactor,
    lossCount: 0,
    hazardIds: profile.hazardIds,
    ...overrides,
  };
}

export interface VolleyResult {
  readonly outcome: "clear" | "loss_of_ball" | "timeout";
  readonly steps: number;
  readonly defeated: number;
  readonly enemies: number;
}

/**
 * Replay one deterministic script: move the paddle, launch at the aim, and
 * advance the simulation in fixed chunks until an outcome or the horizon.
 */
function runScript(
  context: CombatInitContext,
  aim: number,
  paddleX: number,
  horizon = VOLLEY_HORIZON,
): VolleyResult {
  let state: CombatState = movePaddle(createCombatState(catalog, context), paddleX);
  state = launchBall(state, aim, FIRST_ROOM_EFFECTS);
  const enemies = state.enemies.length;
  while (state.step < horizon && state.outcome === null) {
    state = stepCombat(state, STEP_CHUNK, FIRST_ROOM_EFFECTS);
  }
  return {
    outcome:
      state.outcome?.kind === "clear"
        ? "clear"
        : state.outcome?.kind === "loss_of_ball"
          ? "loss_of_ball"
          : "timeout",
    steps: state.step,
    defeated: state.enemies.filter((enemy) => enemy.defeated).length,
    enemies,
  };
}

/** Run every (aim, paddle) script and report clears plus the best attempt. */
function sweepGrid(
  context: CombatInitContext,
  horizon = VOLLEY_HORIZON,
): { clears: number; bestDefeated: number; total: number } {
  let clears = 0;
  let bestDefeated = 0;
  let total = 0;
  for (const aim of AIM_GRID) {
    for (const paddleX of PADDLE_GRID) {
      const result = runScript(context, aim, paddleX, horizon);
      total += 1;
      if (result.outcome === "clear") {
        clears += 1;
      }
      if (result.defeated > bestDefeated) {
        bestDefeated = result.defeated;
      }
    }
  }
  return { clears, bestDefeated, total };
}

/**
 * The committed depth-1 battle-room shape before the rebalance, hand-pinned
 * so the baseline row survives the CP2 constant change as a permanent
 * machinery control: this shape must stay unclearable (the probe's B-3
 * record), which proves the sweep distinguishes unclearable from clearable.
 */
function preRebalanceDepthOneContext(seed: string): CombatInitContext {
  const candidate = battleCandidateFor(seed);
  return combatContextFor(candidate, seed, { density: 6, durabilityFactor: 1.15 });
}

describe("depth-1 clearability sweep machinery (CA-20)", () => {
  it("reproduces the zero-clear baseline on the committed (pre-rebalance) room shape", () => {
    for (const seed of SWEEP_SEEDS.slice(0, 6)) {
      const context = preRebalanceDepthOneContext(seed);
      const sweep = sweepGrid(context);
      expect(sweep.total).toBe(AIM_GRID.length * PADDLE_GRID.length);
      expect(sweep.clears).toBe(0);
      // No scripted attempt even defeats the whole formation: the loss
      // restore (CA-04) makes damage non-accumulating, so a clear must be a
      // single-volley property — exactly what this negative control denies.
      expect(sweep.bestDefeated).toBeLessThan(
        createCombatState(catalog, context).enemies.length,
      );
    }
  }, 240_000);

  it("can report a clear: a single-enemy control room is clearable by scripted play", () => {
    // The baseline control inverted: the easiest possible room (one static
    // 1-HP enemy, durability 1) must produce at least one clear on the grid,
    // so a future regression that breaks outcome detection (always loss,
    // always timeout) fails here instead of passing silently.
    const seed = SWEEP_SEEDS[0]!;
    const context = combatContextFor(battleCandidateFor(seed), seed, {
      density: 1,
      durabilityFactor: 1,
    });
    const sweep = sweepGrid(context);
    expect(sweep.clears).toBeGreaterThan(0);
  }, 120_000);

  it("is deterministic: the same script replays to the identical outcome", () => {
    const seed = SWEEP_SEEDS[1]!;
    const context = combatContextFor(battleCandidateFor(seed), seed);
    const first = runScript(context, -0.6, 80);
    const second = runScript(context, -0.6, 80);
    expect(second).toEqual(first);
    expect(first.outcome).toBe("loss_of_ball");
  });

  it("keeps the recorded losing fixture losing on the pre-rebalance shape", () => {
    // The −0.6 rad / paddle-80 volley (the S03/Arena loss fixture, pinned at
    // CP0 from the committed tests) must lose inside the horizon — never
    // clear — on the room shape the loss/death journeys were recorded on.
    for (const seed of SWEEP_SEEDS.slice(0, 6)) {
      const context = preRebalanceDepthOneContext(seed);
      const result = runScript(context, -0.6, 80, 2_600);
      expect(result.outcome).toBe("loss_of_ball");
      expect(result.steps).toBeLessThanOrEqual(2_600);
    }
  });
});