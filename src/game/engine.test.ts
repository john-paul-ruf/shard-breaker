// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { createContentCatalog } from "../domain/content/catalog";
import type { ContentId } from "../domain/content/catalog";
import { createCombatState } from "../domain/combat/layout";
import { launchBall, movePaddle, stepCombat } from "../domain/combat/rules";
import type { CombatInitContext, CombatState } from "../domain/combat/model";
import { SIMULATION_STEP_SECONDS } from "../domain/combat/model";
import { createFrameClock, startEngine } from "./engine";
import type { FrameClock } from "./engine";

const SIMULATION_STEP_SECONDS_MS = SIMULATION_STEP_SECONDS * 1000;

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
    density: 12,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [HAZARD_SHIFT],
    ...overrides,
  };
}

function liveVolley(): CombatState {
  return launchBall(movePaddle(createCombatState(catalog, initContext()), 80), 0.2);
}

function createFakeClock(): {
  clock: FrameClock;
  fire(deltaMs: number): void;
  pendingCount(): number;
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
    fire(deltaMs: number): void {
      currentTime += deltaMs;
      const scheduled = pending;
      pending = [];
      for (const entry of scheduled) {
        entry.cb(currentTime);
      }
    },
    pendingCount: () => pending.length,
  };
}

describe("engine fixed-step scheduling", () => {
  it("executes accumulated whole steps in frame order and carries the remainder", () => {
    const fake = createFakeClock();
    const batches: number[] = [];
    const stop = startEngine(fake.clock, (steps) => batches.push(steps), {
      stepSeconds: 1 / 64,
      maxCatchUpSteps: 10,
    });

    // Step = 15.625ms; every frame below it, so steps only exist through the
    // accumulated remainder crossing whole-step boundaries.
    fake.fire(10); // acc 10ms → floor 0 steps
    fake.fire(10); // acc 20ms → 1 step, remainder 4.375ms carried
    fake.fire(10); // acc 14.375ms → 0 steps
    fake.fire(10); // acc 24.375ms → 1 step, 8.75ms carried
    fake.fire(10); // acc 18.75ms → 1 step
    expect(batches).toEqual([1, 1, 1]);

    fake.fire(100); // acc 103.125ms → 6 steps at once
    expect(batches).toEqual([1, 1, 1, 6]);
    stop();
  });

  it("uses the combat domain's step seconds by default", () => {
    const fake = createFakeClock();
    const batches: number[] = [];
    const stop = startEngine(fake.clock, (steps) => batches.push(steps));

    // Enough elapsed time for exactly three default steps plus rounding slack.
    fake.fire(SIMULATION_STEP_SECONDS_MS * 3 + 1);
    expect(batches).toEqual([3]);
    stop();
  });

  it("caps catch-up work at maxCatchUpSteps and drops the stalled remainder", () => {
    const fake = createFakeClock();
    const batches: number[] = [];
    const stop = startEngine(fake.clock, (steps) => batches.push(steps), {
      stepSeconds: 1 / 60,
      maxCatchUpSteps: 5,
    });

    fake.fire(3000); // 180 wanted steps after the stall
    expect(batches).toEqual([5]);
    // The remainder was dropped, not queued: a normal frame runs no backlog.
    fake.fire(16);
    expect(batches).toEqual([5]);
    stop();
  });

  it("stops cleanly: no further frames fire and repeat calls are inert", () => {
    const fake = createFakeClock();
    const step = vi.fn();
    const stop = startEngine(fake.clock, step, { stepSeconds: 1 / 60 });

    fake.fire(20);
    expect(step).toHaveBeenCalledTimes(1);
    stop();
    stop();
    fake.fire(1000);
    fake.fire(1000);
    expect(step).toHaveBeenCalledTimes(1);
    expect(fake.pendingCount()).toBe(0);
  });

  it("lets a step handler stop the engine synchronously from inside a frame", () => {
    const fake = createFakeClock();
    let frames = 0;
    let stop: () => void = () => undefined;
    stop = startEngine(
      fake.clock,
      () => {
        frames += 1;
        stop();
      },
      { stepSeconds: 1 / 60 },
    );

    fake.fire(16);
    fake.fire(16);
    expect(frames).toBe(1);
    expect(fake.pendingCount()).toBe(0);
  });

  it("rejects non-positive step sizes and non-positive catch-up caps", () => {
    const fake = createFakeClock();
    expect(() => startEngine(fake.clock, () => undefined, { stepSeconds: 0 })).toThrow(
      RangeError,
    );
    expect(() =>
      startEngine(fake.clock, () => undefined, { stepSeconds: -1 / 60 }),
    ).toThrow(RangeError);
    expect(() =>
      startEngine(fake.clock, () => undefined, { stepSeconds: 1 / 60, maxCatchUpSteps: 0 }),
    ).toThrow(RangeError);
  });
});

describe("chunked-step equivalence with the combat domain", () => {
  it("reaching a fixed 60-step horizon through engine chunks equals one 60-step call", () => {
    const start = liveVolley();
    const oneShot = stepCombat(start, 60);

    const runChunked = (chunk: number, frames: number): CombatState => {
      const fake = createFakeClock();
      let current: CombatState = start;
      const stop = startEngine(
        fake.clock,
        (steps) => {
          current = stepCombat(current, steps);
        },
        { stepSeconds: 1 / 60, maxCatchUpSteps: chunk },
      );
      for (let frame = 0; frame < frames && current.step < 60; frame += 1) {
        fake.fire(125);
      }
      stop();
      return current;
    };

    // 2×62-step frames cover the horizon exactly; a 17-step cap chunks it.
    expect(runChunked(17, 8)).toEqual(oneShot);
    // A 5-step cap exercises repeated small chunks across many frames.
    expect(runChunked(5, 20)).toEqual(oneShot);
  });
});

describe("createFrameClock", () => {
  it("schedules through requestAnimationFrame and reads performance.now", () => {
    const requestSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockReturnValue(1 as unknown as number);
    const cancelSpy = vi
      .spyOn(window, "cancelAnimationFrame")
      .mockReturnValue(undefined as unknown as void);
    vi.spyOn(window.performance, "now").mockReturnValue(1234.5);

    const clock = createFrameClock();
    const cb = vi.fn();
    const cancel = clock.requestFrame(cb);
    expect(requestSpy).toHaveBeenCalledWith(cb);
    expect(clock.now()).toBe(1234.5);

    cancel();
    expect(cancelSpy).toHaveBeenCalledWith(1);
    vi.restoreAllMocks();
  });
});