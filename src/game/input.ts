import { AIM_MAX_DEVIATION, WORLD_WIDTH } from "../domain/combat/model";

/**
 * Normalized world-space intent for one pointer event. `paddleX` is the legal
 * paddle center in world units; `aimAngle` is the launch angle in radians from
 * straight up (negative = leftward), already inside the legal cone. The
 * session applies them with `movePaddle`/`launchBall` — this module only maps
 * and clamps; it never launches.
 */
export interface PointerIntent {
  readonly paddleX: number;
  readonly aimAngle: number;
}

export interface InputHandlers {
  /**
   * Pointer movement over the arena: aims (pre-launch) and moves the paddle
   * (any phase). Never launches — FR-2's launch rule is enforced by only
   * routing launch to an explicit control elsewhere.
   */
  readonly onAim: (intent: PointerIntent) => void;
  /**
   * The explicit launch request from the dedicated control. Pointer movement
   * never reaches this handler.
   */
  readonly onLaunch: () => void;
  /** Keyboard fallback: ArrowLeft/ArrowRight nudge the paddle. */
  readonly onKeyboardPaddle: (direction: -1 | 1) => void;
}

/** The slice of HTMLCanvasElement the input mapping needs, faked in tests. */
export interface InputTarget {
  readonly clientWidth: number;
  readonly clientHeight: number;
  getBoundingClientRect(): { readonly left: number; readonly width: number };
  addEventListener(
    type: "pointermove" | "pointerdown",
    listener: (event: PointerEvent) => void,
  ): void;
  addEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
  removeEventListener(
    type: "pointermove" | "pointerdown",
    listener: (event: PointerEvent) => void,
  ): void;
  removeEventListener(type: "keydown", listener: (event: KeyboardEvent) => void): void;
}

/** Legal paddle centers in world units (mirrors the domain's paddle band). */
export const PADDLE_MIN_X = 15;
export const PADDLE_MAX_X = WORLD_WIDTH - 15;

/**
 * Convert a canvas-space pointer position into the arena's world space. The
 * canvas may be scaled by CSS on top of its backing store, and the backing
 * store itself is scaled by the device pixel ratio, so the world coordinate
 * is recovered from the element's CSS size (not the buffer's) — the device
 * pixel ratio and backing-store scale cancel out of the mapping. A drag may
 * leave the element; the returned x is the unclamped world coordinate and
 * callers clamp for their own rule.
 */
export function canvasToWorld(
  clientX: number,
  rect: { readonly left: number; readonly width: number },
): number {
  const width = rect.width;
  if (!Number.isFinite(width) || width <= 0) {
    throw new RangeError("canvas width must be a finite positive number");
  }
  return ((clientX - rect.left) / width) * WORLD_WIDTH;
}

/**
 * Clamp a world-space x into the paddle's legal band. Non-finite input fails
 * closed to the nearest legal end rather than poisoning the simulation.
 */
export function clampPaddleX(x: number): number {
  if (!Number.isFinite(x)) {
    return x > 0 ? PADDLE_MAX_X : PADDLE_MIN_X;
  }
  return Math.min(PADDLE_MAX_X, Math.max(PADDLE_MIN_X, x));
}

/**
 * Map a pointer's world-space x onto the pre-launch aim angle: straight up at
 * the canvas center, the full legal deviation at the canvas edges. The angle
 * clamps into the legal cone so off-field input can never aim outside it.
 */
export function aimAngleForPointerX(x: number): number {
  const ratio = (x - WORLD_WIDTH / 2) / (WORLD_WIDTH / 2);
  return Math.min(AIM_MAX_DEVIATION, Math.max(-AIM_MAX_DEVIATION, ratio * AIM_MAX_DEVIATION));
}

/**
 * Attach pointer and keyboard normalization to a canvas. Mouse, trackpad, and
 * touch all arrive through Pointer Events and share one handler. Pointer
 * movement never launches; the launch control elsewhere routes to
 * `onLaunch`. The returned detach removes every listener exactly as added.
 */
export function attachInput(canvas: InputTarget, handlers: InputHandlers): () => void {
  const listeners: Array<{
    readonly type: "pointermove" | "pointerdown" | "keydown";
    readonly fn: (event: PointerEvent) => void;
  }> = [];

  function intentFrom(clientX: number): { paddleX: number; aimAngle: number } {
    const rect = canvas.getBoundingClientRect();
    const worldX = canvasToWorld(clientX, rect);
    return {
      paddleX: clampPaddleX(worldX),
      aimAngle: aimAngleForPointerX(worldX),
    };
  }

  function onPointerMove(event: PointerEvent): void {
    handlers.onAim(intentFrom(event.clientX));
  }

  function onPointerDown(event: PointerEvent): void {
    handlers.onAim(intentFrom(event.clientX));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowLeft") {
      handlers.onKeyboardPaddle(-1);
    } else if (event.key === "ArrowRight") {
      handlers.onKeyboardPaddle(1);
    }
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("keydown", onKeyDown);
  listeners.push(
    { type: "pointermove", fn: onPointerMove },
    { type: "pointerdown", fn: onPointerDown },
    { type: "keydown", fn: onKeyDown as unknown as (event: PointerEvent) => void },
  );

  return () => {
    for (const listener of listeners) {
      if (listener.type === "keydown") {
        canvas.removeEventListener(
          "keydown",
          listener.fn as unknown as (event: KeyboardEvent) => void,
        );
      } else {
        canvas.removeEventListener(listener.type, listener.fn);
      }
    }
    listeners.length = 0;
  };
}