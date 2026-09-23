// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { AIM_MAX_DEVIATION, WORLD_WIDTH } from "../domain/combat/model";
import {
  PADDLE_MAX_X,
  PADDLE_MIN_X,
  aimAngleForPointerX,
  attachInput,
  canvasToWorld,
  clampPaddleX,
} from "./input";
import type { InputTarget } from "./input";

const CSS_WIDTH = 800;
const CSS_LEFT = 100;

interface CanvasStub extends InputTarget {
  readonly pointerListeners: Map<string, (event: PointerEvent) => void>;
  readonly keyListeners: Map<string, (event: KeyboardEvent) => void>;
}

function createCanvasStub(overrides: { readonly clientWidth?: number } = {}): CanvasStub {
  const pointerListeners = new Map<string, (event: PointerEvent) => void>();
  const keyListeners = new Map<string, (event: KeyboardEvent) => void>();
  type EventType = Parameters<InputTarget["addEventListener"]>[0];
  const addEventListener = (type: EventType, listener: (event: unknown) => void): void => {
    if (type === "keydown") {
      keyListeners.set(type, listener as (event: KeyboardEvent) => void);
    } else {
      pointerListeners.set(type, listener as (event: PointerEvent) => void);
    }
  };
  const removeEventListener = (type: EventType, listener: (event: unknown) => void): void => {
    if (type === "keydown") {
      if (keyListeners.get(type) === (listener as (event: KeyboardEvent) => void)) {
        keyListeners.delete(type);
      }
    } else if (pointerListeners.get(type) === (listener as (event: PointerEvent) => void)) {
      pointerListeners.delete(type);
    }
  };
  const stub = {
    clientWidth: overrides.clientWidth ?? CSS_WIDTH,
    clientHeight: 500,
    getBoundingClientRect: () => ({ left: CSS_LEFT, width: CSS_WIDTH }),
    addEventListener,
    removeEventListener,
    pointerListeners,
    keyListeners,
  };
  return stub as unknown as CanvasStub;
}

function pointerEvent(clientX: number): PointerEvent {
  return { clientX } as PointerEvent;
}

describe("canvasToWorld mapping", () => {
  it("maps canvas-space x to world x linearly", () => {
    expect(canvasToWorld(CSS_LEFT, { left: CSS_LEFT, width: CSS_WIDTH })).toBe(0);
    expect(canvasToWorld(CSS_LEFT + CSS_WIDTH / 2, { left: CSS_LEFT, width: CSS_WIDTH })).toBe(
      WORLD_WIDTH / 2,
    );
    expect(canvasToWorld(CSS_LEFT + CSS_WIDTH, { left: CSS_LEFT, width: CSS_WIDTH })).toBe(
      WORLD_WIDTH,
    );
    expect(canvasToWorld(CSS_LEFT + 200, { left: CSS_LEFT, width: CSS_WIDTH })).toBeCloseTo(
      (200 / CSS_WIDTH) * WORLD_WIDTH,
      9,
    );
  });

  it("reads from the CSS size, so the backing-store scale cancels", () => {
    // The renderer may present a DPR-2 backing store (1600 device px) at the
    // same 800 CSS px; the mapping consumes only the CSS size, so identical
    // CSS-space input yields the identical world coordinate either way.
    expect(CSS_WIDTH * 2).toBe(1600);
    const worldAtQuarter = canvasToWorld(CSS_LEFT + CSS_WIDTH / 4, {
      left: CSS_LEFT,
      width: CSS_WIDTH,
    });
    expect(worldAtQuarter).toBe(40);
    expect(worldAtQuarter).toBe((CSS_WIDTH / 4 / CSS_WIDTH) * WORLD_WIDTH);
  });

  it("rejects a non-positive or non-finite CSS width", () => {
    expect(() => canvasToWorld(10, { left: 0, width: 0 })).toThrow(RangeError);
    expect(() => canvasToWorld(10, { left: 0, width: -5 })).toThrow(RangeError);
    expect(() => canvasToWorld(10, { left: 0, width: Number.NaN })).toThrow(RangeError);
  });
});

describe("paddle clamping and aim mapping", () => {
  it("clamps paddle x to the legal band at both ends", () => {
    expect(clampPaddleX(-50)).toBe(PADDLE_MIN_X);
    expect(clampPaddleX(0)).toBe(PADDLE_MIN_X);
    expect(clampPaddleX(WORLD_WIDTH / 2)).toBe(WORLD_WIDTH / 2);
    expect(clampPaddleX(WORLD_WIDTH)).toBe(PADDLE_MAX_X);
    expect(clampPaddleX(WORLD_WIDTH + 50)).toBe(PADDLE_MAX_X);
  });

  it("fails closed on non-finite paddle input", () => {
    expect(clampPaddleX(Number.NaN)).toBe(PADDLE_MIN_X);
    expect(clampPaddleX(Number.POSITIVE_INFINITY)).toBe(PADDLE_MAX_X);
    expect(clampPaddleX(Number.NEGATIVE_INFINITY)).toBe(PADDLE_MIN_X);
  });

  it("maps the canvas center to straight up and the edges to the full cone", () => {
    expect(aimAngleForPointerX(WORLD_WIDTH / 2)).toBeCloseTo(0, 12);
    expect(aimAngleForPointerX(0)).toBeCloseTo(-AIM_MAX_DEVIATION, 12);
    expect(aimAngleForPointerX(WORLD_WIDTH)).toBeCloseTo(AIM_MAX_DEVIATION, 12);
    // Off-field input clamps into the legal cone; it never aims outside it.
    expect(aimAngleForPointerX(-1000)).toBeCloseTo(-AIM_MAX_DEVIATION, 12);
    expect(aimAngleForPointerX(WORLD_WIDTH + 1000)).toBeCloseTo(AIM_MAX_DEVIATION, 12);
    // The cone is symmetric and monotone across the legal band.
    expect(aimAngleForPointerX(PADDLE_MIN_X)).toBeCloseTo(
      -AIM_MAX_DEVIATION * (1 - PADDLE_MIN_X / (WORLD_WIDTH / 2)),
      12,
    );
  });
});

describe("attachInput", () => {
  it("routes pointer movement to onAim with clamped, world-space intent", () => {
    const canvas = createCanvasStub();
    const onAim = vi.fn();
    const onLaunch = vi.fn();
    const onKeyboardPaddle = vi.fn();
    const detach = attachInput(canvas, { onAim, onLaunch, onKeyboardPaddle });

    canvas.pointerListeners.get("pointermove")!(
      pointerEvent(CSS_LEFT + CSS_WIDTH / 2),
    );
    expect(onAim).toHaveBeenCalledWith({ paddleX: WORLD_WIDTH / 2, aimAngle: 0 });

    // Off-field input clamps: paddle into its band, aim into its cone.
    canvas.pointerListeners.get("pointermove")!(pointerEvent(CSS_LEFT - 100));
    expect(onAim).toHaveBeenLastCalledWith({
      paddleX: PADDLE_MIN_X,
      aimAngle: -AIM_MAX_DEVIATION,
    });
    canvas.pointerListeners.get("pointerdown")!(
      pointerEvent(CSS_LEFT + CSS_WIDTH + 40),
    );
    expect(onAim).toHaveBeenLastCalledWith({
      paddleX: PADDLE_MAX_X,
      aimAngle: AIM_MAX_DEVIATION,
    });

    expect(onLaunch).not.toHaveBeenCalled();
    detach();
  });

  it("never launches from pointer events, even on pointerdown", () => {
    const canvas = createCanvasStub();
    const onAim = vi.fn();
    const onLaunch = vi.fn();
    const onKeyboardPaddle = vi.fn();
    const detach = attachInput(canvas, { onAim, onLaunch, onKeyboardPaddle });

    for (const clientX of [CSS_LEFT, CSS_LEFT + CSS_WIDTH / 2, CSS_LEFT + CSS_WIDTH]) {
      canvas.pointerListeners.get("pointermove")!(pointerEvent(clientX));
      canvas.pointerListeners.get("pointerdown")!(pointerEvent(clientX));
    }
    expect(onAim).toHaveBeenCalledTimes(6);
    expect(onLaunch).not.toHaveBeenCalled();
    detach();
  });

  it("exposes the launch only through the explicit onLaunch control", () => {
    const canvas = createCanvasStub();
    const onLaunch = vi.fn();
    const detach = attachInput(canvas, {
      onAim: vi.fn(),
      onLaunch,
      onKeyboardPaddle: vi.fn(),
    });

    onLaunch();
    expect(onLaunch).toHaveBeenCalledTimes(1);
    detach();
  });

  it("maps arrow keys to paddle direction and ignores other keys", () => {
    const canvas = createCanvasStub();
    const onAim = vi.fn();
    const onLaunch = vi.fn();
    const onKeyboardPaddle = vi.fn();
    const detach = attachInput(canvas, { onAim, onLaunch, onKeyboardPaddle });

    const keyDown = canvas.keyListeners.get("keydown")!;
    keyDown({ key: "ArrowLeft" } as KeyboardEvent);
    keyDown({ key: "ArrowRight" } as KeyboardEvent);
    expect(onKeyboardPaddle).toHaveBeenCalledTimes(2);
    expect(onKeyboardPaddle).toHaveBeenNthCalledWith(1, -1);
    expect(onKeyboardPaddle).toHaveBeenNthCalledWith(2, 1);

    // Space and Enter belong to the dedicated launch control, not keydown-anywhere.
    keyDown({ key: " " } as KeyboardEvent);
    keyDown({ key: "Enter" } as KeyboardEvent);
    keyDown({ key: "a" } as KeyboardEvent);
    expect(onKeyboardPaddle).toHaveBeenCalledTimes(2);
    expect(onLaunch).not.toHaveBeenCalled();
    detach();
  });

  it("detach removes every listener so nothing fires afterwards", () => {
    const canvas = createCanvasStub();
    const onAim = vi.fn();
    const onLaunch = vi.fn();
    const onKeyboardPaddle = vi.fn();
    const detach = attachInput(canvas, { onAim, onLaunch, onKeyboardPaddle });

    detach();
    detach(); // inert repeat

    expect(canvas.pointerListeners.size).toBe(0);
    expect(canvas.keyListeners.size).toBe(0);
    canvas.pointerListeners.get("pointermove")?.(pointerEvent(CSS_LEFT));
    canvas.keyListeners.get("keydown")?.({ key: "ArrowLeft" } as KeyboardEvent);
    expect(onAim).not.toHaveBeenCalled();
    expect(onKeyboardPaddle).not.toHaveBeenCalled();
    expect(onLaunch).not.toHaveBeenCalled();
  });
});