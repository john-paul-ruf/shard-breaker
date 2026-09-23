// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createContentCatalog } from "../domain/content/catalog";
import type { ContentId } from "../domain/content/catalog";
import {
  createCombatState,
  fromCombatCheckpoint,
  toCombatCheckpoint,
} from "../domain/combat/layout";
import type { CombatInitContext, CombatState } from "../domain/combat/model";
import { launchBall, movePaddle, stepCombat } from "../domain/combat/rules";
import { outcomeIdFor } from "../domain/combat/results";
import { NEUTRAL_EFFECTS } from "../domain/combat/effects";
import { createGameSession } from "./session";
import type { GameSession } from "./session";
import type { FrameClock } from "./engine";

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const BATTLE_ROOM = asContentId("room-battle-glassway");
const HAZARD_SHIFT = asContentId("hazard-shift-lane");

function initContext(overrides: Partial<CombatInitContext> = {}): CombatInitContext {
  return {
    seed: "seed-1",
    contentVersion: "content-1",
    roomId: "route:content-1:run-1:1:room:room-battle-glassway:candidate",
    eventKey: "route:content-1:run-1:1:room:room-battle-glassway",
    formationId: BATTLE_ROOM,
    density: 1,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [HAZARD_SHIFT],
    ...overrides,
  };
}

/**
 * A loss-prone live volley: launched hard left from the paddle center with a
 * static enemy out of the path, so the ball crosses the loss boundary
 * deterministically within a bounded step horizon.
 */
function lossVolley(lossCount = 0): CombatState {
  const launched = launchBall(
    movePaddle(createCombatState(catalog, initContext({ lossCount })), 80),
    -0.6,
  );
  return launched;
}

/** Deterministic rAF fake: fire(elapsedMs) advances time and pumps frames. */
function createFakeClock(): {
  clock: FrameClock;
  fire(elapsedMs: number): void;
} {
  let currentTime = 0;
  let pending: Array<{ cb: (timestamp: number) => void }> = [];
  const clock: FrameClock = {
    requestFrame(cb) {
      const entry = { cb };
      pending.push(entry);
      return () => {
        pending = pending.filter((candidate) => candidate !== entry);
      };
    },
    now: () => currentTime,
  };
  return {
    clock,
    fire(elapsedMs: number): void {
      currentTime += elapsedMs;
      const scheduled = pending;
      pending = [];
      for (const entry of scheduled) {
        entry.cb(currentTime);
      }
    },
  };
}

interface Harness {
  readonly onOutcome: ReturnType<typeof vi.fn>;
  readonly onRender: ReturnType<typeof vi.fn>;
  readonly onSkillRequested: ReturnType<typeof vi.fn>;
  readonly onVolleyStart: ReturnType<typeof vi.fn>;
  readonly clock: ReturnType<typeof createFakeClock>;
  createSession(state: CombatState): GameSession;
}

function createHarness(resolverEffects = NEUTRAL_EFFECTS): Harness {
  const clock = createFakeClock();
  const onOutcome = vi.fn();
  const onRender = vi.fn();
  const onSkillRequested = vi.fn();
  const onVolleyStart = vi.fn(() => resolverEffects);
  const createSession = (state: GameSession extends never ? never : CombatState): GameSession =>
    createGameSession(state, {
      onOutcome,
      onRender,
      onSkillRequested,
      resolveVolleyEffects: onVolleyStart,
    }, { engine: { stepSeconds: 1 / 60, maxCatchUpSteps: 17 }, clock: clock.clock });
  return { onOutcome, onRender, onSkillRequested, onVolleyStart, clock, createSession };
}

describe("session outcome bridge (CA-05)", () => {
  it("dispatches the loss outcome exactly once across the volley end", () => {
    const harness = createHarness();
    const session = harness.createSession(lossVolley());
    expect(session.state().phase).toBe("live");

    harness.clock.fire(116); // ≈6 steps at the 1/60s engine step
    expect(session.state().step).toBe(6);
    for (
      let frame = 0;
      frame < 400 && session.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160); // ≈9 steps per frame
    }
    expect(session.state().phase).toBe("pre_launch");
    expect(session.state().outcome?.kind).toBe("loss_of_ball");
    expect(harness.onOutcome).toHaveBeenCalledTimes(1);
    expect(harness.onOutcome).toHaveBeenCalledWith({
      outcomeId: `${initContext().eventKey}:outcome:loss_of_ball:0`,
      kind: "loss_of_ball",
    });
    // Post-outcome frames are no-ops: the engine is stopped, no duplicates.
    harness.clock.fire(16 * 10);
    expect(harness.onOutcome).toHaveBeenCalledTimes(1);
    session.stop();
  });

  it("dispatches exactly once across re-entry with the same checkpoint", () => {
    const harness = createHarness();
    const firstSession = harness.createSession(lossVolley());
    harness.clock.fire(16); // the first frame carries 0 steps
    for (
      let frame = 0;
      frame < 400 && firstSession.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160); // ≈9 steps per frame
    }
    const ended = firstSession.state();
    expect(ended.outcome?.kind).toBe("loss_of_ball");
    firstSession.stop();

    // The user leaves and re-enters: a fresh session constructed from the
    // same (already-ended) state must not re-dispatch the same outcome.
    const reentered = harness.createSession(ended);
    expect(harness.onOutcome).toHaveBeenCalledTimes(1);
    reentered.stop();

    // Replaying the volley from the restored pre-launch checkpoint and
    // reaching the *next* loss dispatches the next identity.
    const nextVolley = launchBall(ended, -0.6);
    const nextSession = harness.createSession(nextVolley);
    harness.clock.fire(16);
    for (
      let frame = 0;
      frame < 400 && nextSession.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160);
    }
    const nextOutcome = nextSession.state().outcome;
    expect(nextOutcome?.outcomeId).toBe(`${initContext().eventKey}:outcome:loss_of_ball:1`);
    expect(harness.onOutcome).toHaveBeenCalledTimes(2);
    expect(harness.onOutcome).toHaveBeenLastCalledWith({
      outcomeId: nextOutcome!.outcomeId,
      kind: "loss_of_ball",
    });
    nextSession.stop();
  });

  it("stops stepping after the outcome and resumes only via replaceState", () => {
    const harness = createHarness();
    const session = harness.createSession(lossVolley());
    harness.clock.fire(16);
    for (
      let frame = 0;
      frame < 400 && session.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160); // ≈9 steps per frame
    }
    const outcomeState = session.state();
    expect(outcomeCount(harness)).toBe(1);
    const rendersBefore = harness.onRender.mock.calls.length;
    void rendersBefore;

    harness.clock.fire(16 * 10);
    expect(session.state()).toBe(outcomeState);
    expect(outcomeCount(harness)).toBe(1);

    // The store publishes the fresh durable checkpoint; the session resumes.
    const fresh = createCombatState(catalog, initContext({ lossCount: 1 }));
    session.replaceState(fresh);
    expect(session.state()).toBe(fresh);
    expect(session.state().phase).toBe("pre_launch");
    harness.clock.fire(16 * 5);
    expect(session.state().step).toBe(0); // pre-launch never steps
    session.stop();
  });

  it("does not dispatch a clear outcome from a resolved state re-entry", () => {
    const harness = createHarness();
    const lossOne = stepCombat(
      launchBall(movePaddle(createCombatState(catalog, initContext()), 80), -0.6),
      600,
    );
    expect(lossOne.phase).toBe("pre_launch");
    expect(lossOne.outcome?.outcomeId).toBe(
      outcomeIdFor(initContext().eventKey, "loss_of_ball", 0),
    );
    const restored = fromCombatCheckpoint(
      toCombatCheckpoint(lossOne),
      initContext({ lossCount: 1 }),
      catalog,
    );
    const session = harness.createSession(restored);
    session.launch(-0.6); // the previous loss stays a room-level fact
    expect(session.state().phase).toBe("live");
    harness.clock.fire(16);
    for (
      let frame = 0;
      frame < 400 && session.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160); // ≈9 steps per frame
    }
    expect(outcomeCount(harness)).toBe(1);
    expect(session.state().outcome?.outcomeId).toBe(
      outcomeIdFor(initContext().eventKey, "loss_of_ball", 1),
    );
    session.stop();
  });
});

function outcomeCount(harness: Harness): number {
  return harness.onOutcome.mock.calls.length;
}

describe("deterministic rebuild (CA-06)", () => {
  it("a checkpoint-built session traces identically to a state-built one", () => {
    const context = initContext({ lossCount: 1 });
    const original = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(movePaddle(original, 70));
    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
    expect(rebuilt).toEqual(movePaddle(original, 70));

    const harness = createHarness();
    const fromCheckpoint = harness.createSession(rebuilt);
    const fromState = harness.createSession(movePaddle(original, 70));

    const angle = 0.25;
    fromCheckpoint.launch(angle);
    fromState.launch(angle);

    // Advance both through identical frame chunks to the same step horizon.
    for (let frame = 0; frame < 8; frame += 1) {
      harness.clock.fire(16);
      expect(fromCheckpoint.state()).toEqual(fromState.state());
    }
    expect(fromCheckpoint.state().step).toBe(fromState.state().step);
    fromCheckpoint.stop();
    fromState.stop();
  });

  it("round-trips the room checkpoint through the loss boundary", () => {
    const context = initContext({ lossCount: 0 });
    const original = createCombatState(catalog, context);
    const checkpoint = toCombatCheckpoint(movePaddle(original, 80));
    const rebuilt = fromCombatCheckpoint(checkpoint, context, catalog);
    const harness = createHarness();
    const session = harness.createSession(rebuilt);
    session.launch(-0.6);
    harness.clock.fire(16);
    for (
      let frame = 0;
      frame < 400 && session.state().phase === "live";
      frame += 1
    ) {
      harness.clock.fire(160); // ≈9 steps per frame
    }
    expect(session.state().outcome?.kind).toBe("loss_of_ball");
    expect(session.state().losses).toBe(context.lossCount + 1);
    session.stop();
  });
});

describe("session controls", () => {
  it("launch is explicit: movePaddle alone never starts the engine", () => {
    const harness = createHarness();
    const session = harness.createSession(createCombatState(catalog, initContext()));
    session.movePaddle(40);
    session.movePaddleBy(1);
    session.movePaddleBy(-1);
    expect(session.state().phase).toBe("pre_launch");
    harness.clock.fire(16 * 5);
    expect(session.state().step).toBe(0);
    session.stop();
  });

  it("rejects launch outside pre-launch and stays inert after stop", () => {
    const harness = createHarness();
    const session = harness.createSession(createCombatState(catalog, initContext()));
    session.launch(0.1);
    expect(session.state().phase).toBe("live");
    session.launch(0.2); // live arena cannot launch
    expect(session.state().phase).toBe("live");
    session.stop();
    const frozenStep = session.state().step;
    session.movePaddle(30);
    expect(session.state().step).toBe(frozenStep);
    session.replaceState(createCombatState(catalog, initContext()));
    expect(session.state().step).toBe(frozenStep);
  });

  it("routes skill requests through onSkillRequested with the build's skill", () => {
    const harness = createHarness();
    const session = harness.createSession(createCombatState(catalog, initContext()));
    session.useSkill(asContentId("skill-overclock"));
    expect(harness.onSkillRequested).toHaveBeenCalledWith(asContentId("skill-overclock"));
    session.stop();
  });

  it("threads the resolver's effect snapshot into the volley", () => {
    const boosted = { ...NEUTRAL_EFFECTS, ballSpeedFactor: 1.25 } as const;
    const harness = createHarness(boosted);
    const session = harness.createSession(createCombatState(catalog, initContext()));
    session.launch(0);
    expect(harness.onVolleyStart).toHaveBeenCalledTimes(1);
    expect(session.state().balls[0]!.vy).toBeCloseTo(-48 * 1.25, 9);
    session.stop();
  });
});