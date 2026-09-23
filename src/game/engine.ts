import { SIMULATION_STEP_SECONDS } from "../domain/combat/model";

/**
 * The bridge's only clock abstraction. `requestFrame` schedules one callback
 * with a monotonic timestamp in milliseconds (the `requestAnimationFrame`
 * convention) and returns its cancellation; `now` reads the same time base.
 * The engine converts elapsed wall time into fixed simulation steps — the
 * browser supplies time and nothing else (arch M06).
 */
export interface FrameClock {
  requestFrame(cb: (timestamp: number) => void): () => void;
  now(): number;
}

export interface EngineOptions {
  /**
   * Fixed seconds consumed per executed step. Defaults to the combat
   * domain's `SIMULATION_STEP_SECONDS` so the bridge and the reducer can
   * never drift onto different step sizes.
   */
  readonly stepSeconds?: number;
  /**
   * Upper bound on steps executed in a single frame after a tab stall.
   * Wanted steps beyond the cap are dropped, not queued: a stalled session
   * catches up bounded work and continues from the present.
   */
  readonly maxCatchUpSteps?: number;
}

const DEFAULT_MAX_CATCH_UP_STEPS = 5;

/**
 * Drive `step` with fixed-size batches on every animation frame. Elapsed
 * frame time accumulates; each frame executes `floor(accumulated /
 * stepSeconds)` steps in one call, capped at `maxCatchUpSteps` with the
 * remainder dropped. Frame-by-frame work stays ephemeral and the caller owns
 * what a step means; the returned function cancels the pending frame and is
 * safe to call more than once. A `step` implementation may stop the engine
 * synchronously from inside the callback.
 */
export function startEngine(
  clock: FrameClock,
  step: (steps: number) => void,
  options?: EngineOptions,
): () => void {
  const stepSeconds = options?.stepSeconds ?? SIMULATION_STEP_SECONDS;
  const maxCatchUpSteps = options?.maxCatchUpSteps ?? DEFAULT_MAX_CATCH_UP_STEPS;
  if (!Number.isFinite(stepSeconds) || stepSeconds <= 0) {
    throw new RangeError("stepSeconds must be a finite positive number");
  }
  if (!Number.isSafeInteger(maxCatchUpSteps) || maxCatchUpSteps < 1) {
    throw new RangeError("maxCatchUpSteps must be a safe integer >= 1");
  }

  let lastTimestamp = clock.now();
  let accumulatedSeconds = 0;
  let running = true;
  let cancelPendingFrame = clock.requestFrame(onFrame);

  function onFrame(timestamp: number): void {
    if (!running) {
      return;
    }
    const elapsedSeconds = Math.max(0, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    accumulatedSeconds += elapsedSeconds;
    const wantedSteps = Math.floor(accumulatedSeconds / stepSeconds);
    if (wantedSteps >= 1) {
      const executedSteps = Math.min(wantedSteps, maxCatchUpSteps);
      accumulatedSeconds =
        executedSteps === wantedSteps
          ? accumulatedSeconds - executedSteps * stepSeconds
          : 0;
      step(executedSteps);
    }
    if (running) {
      cancelPendingFrame = clock.requestFrame(onFrame);
    }
  }

  return () => {
    if (!running) {
      return;
    }
    running = false;
    cancelPendingFrame();
  };
}

/** The production clock: `requestAnimationFrame` frames over `performance.now`. */
export function createFrameClock(): FrameClock {
  return {
    requestFrame: (cb) => {
      const handle = requestAnimationFrame(cb);
      return () => cancelAnimationFrame(handle);
    },
    now: () => performance.now(),
  };
}