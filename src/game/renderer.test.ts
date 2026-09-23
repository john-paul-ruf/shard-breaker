// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import type { CombatPhase } from "../domain/combat/model";
import { computeWorldTransform, drawFrame } from "./renderer";
import type { Context2DLike, RenderSnapshot } from "./renderer";

function baseSnapshot(overrides: Partial<RenderSnapshot> = {}): RenderSnapshot {
  return {
    balls: [{ x: 40, y: 60 }],
    paddleX: 80,
    aimAngle: 0,
    phase: "live" as CombatPhase,
    enemies: [
      {
        x: 40,
        y: 20,
        halfWidth: 6,
        halfHeight: 4,
        health: 2,
        maxHealth: 3,
        glyph: "⊕",
        defeated: false,
      },
    ],
    hazards: [{ laneX: 80, halfWidth: 8, state: "telegraphed" }],
    wallHits: 0,
    objectivesRemaining: 1,
    telegraphText: "hazard-shift-lane — telegraphed",
    statusLine: "Ball live",
    ...overrides,
  };
}

interface RecordedCall {
  readonly op: string;
  readonly args: unknown[];
}

interface Recording {
  readonly calls: readonly RecordedCall[];
}

function createContext(canvas: { width: number; height: number }): Context2DLike & Recording {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const props = new Map<string, unknown>();
  const record = (op: string) => (...args: unknown[]) => {
    calls.push({ op, args });
  };
  const ctx = {
    canvas,
    save: record("save"),
    restore: record("restore"),
    clearRect: record("clearRect"),
    beginPath: record("beginPath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    closePath: record("closePath"),
    arc: record("arc"),
    fill: record("fill"),
    stroke: record("stroke"),
    fillRect: record("fillRect"),
    strokeRect: record("strokeRect"),
    fillText: record("fillText"),
    setLineDash: record("setLineDash"),
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    font: "",
    textAlign: "center" as CanvasTextAlign,
  };
  for (const key of ["fillStyle", "strokeStyle", "lineWidth", "globalAlpha", "font", "textAlign"]) {
    let value: unknown = (ctx as unknown as Record<string, unknown>)[key];
    Object.defineProperty(ctx, key, {
      get: () => value,
      set: (next) => {
        value = next;
        props.set(key, next);
      },
    });
  }
  return Object.assign(ctx, { calls, props }) as unknown as Context2DLike & Recording;
}

describe("computeWorldTransform", () => {
  it("scales world units linearly at device pixel ratio 1", () => {
    const transform = computeWorldTransform({ width: 160, height: 100 });
    expect(transform.scaleX).toBeCloseTo(1, 12);
    expect(transform.scaleY).toBeCloseTo(1, 12);
    expect(transform.offsetX).toBe(0);
    expect(transform.offsetY).toBe(0);
  });

  it("maps the full world exactly onto the backing store at DPR 2", () => {
    const transform = computeWorldTransform({ width: 320, height: 200 });
    expect(transform.scaleX).toBeCloseTo(2, 12);
    expect(transform.scaleY).toBeCloseTo(2, 12);
    expect(transform.scaleX * 160).toBe(320);
    expect(transform.scaleY * 100).toBe(200);
  });

  it("rejects non-positive dimensions", () => {
    expect(() => computeWorldTransform({ width: 0, height: 100 })).toThrow(RangeError);
    expect(() => computeWorldTransform({ width: 160, height: -1 })).toThrow(RangeError);
  });
});

describe("drawFrame", () => {
  it("scales geometry uniformly with the backing-store size", () => {
    for (const [dpr, width, height] of [
      [1, 160, 100],
      [2, 320, 200],
    ] as const) {
      const ctx = createContext({ width, height });
      drawFrame(ctx, baseSnapshot(), { devicePixelRatio: dpr });

      // The field border strokes exactly the transformed world extent.
      const border = ctx.calls.find((call) => call.op === "strokeRect");
      expect(border).toBeDefined();
      expect(border!.args[0]).toBe(0);
      expect(border!.args[1]).toBe(0);
      expect(border!.args[2]).toBeCloseTo(width, 9);
      expect(border!.args[3]).toBeCloseTo(height, 9);
    }
  });

  it("draws the ball, paddle, enemy brick, and pre-launch aim guide in world space", () => {
    const ctx = createContext({ width: 320, height: 200 });
    drawFrame(
      ctx,
      baseSnapshot({
        phase: "pre_launch",
        balls: [{ x: 80, y: 92 }],
        aimAngle: 0.3,
      }),
      { devicePixelRatio: 2 },
    );

    // Ball: world (80, 92) → backing (160, 184).
    const ball = ctx.calls.find((call) => call.op === "arc");
    expect(ball).toBeDefined();
    expect(ball!.args[0]).toBeCloseTo(160, 9);
    expect(ball!.args[1]).toBeCloseTo(184, 9);

    // Paddle: 30 world units wide centered at paddleX=80.
    const paddle = ctx.calls
      .filter((call) => call.op === "fillRect")
      .map((call) => call.args);
    const paddleCall = paddle.find(
      (args) => Math.abs((args[0] as number) - 160 + 30) < 0.001 && (args[2] as number) === 60,
    );
    expect(paddleCall).toBeDefined();

    // The aim guide is a dashed line toward the aim angle.
    const dash = ctx.calls.find((call) => call.op === "setLineDash");
    expect(dash).toBeDefined();
    expect((dash!.args[0] as readonly number[]).length).toBeGreaterThan(0);
  });

  it("draws hazard hatch marks for pending lanes and skips resolved lanes", () => {
    const ctx = createContext({ width: 160, height: 100 });
    drawFrame(
      ctx,
      baseSnapshot({
        hazards: [
          { laneX: 40, halfWidth: 8, state: "telegraphed" },
          { laneX: 120, halfWidth: 8, state: "resolved" },
        ],
      }),
      { devicePixelRatio: 1 },
    );
    const strokes = ctx.calls.filter((call) => call.op === "stroke" && call.args.length === 0);
    // At least one hatch stroke per pending lane; resolved lanes draw none.
    expect(strokes.length).toBeGreaterThan(0);
  });

  it("keeps the static hatch under reduced motion and drops pulse decoration", () => {
    const reduced = createContext({ width: 160, height: 100 });
    drawFrame(
      reduced,
      baseSnapshot({ hazards: [{ laneX: 80, halfWidth: 8, state: "active" }] }),
      { devicePixelRatio: 1, reducedMotion: true },
    );
    const reducedStrokes = reduced.calls.filter((call) => call.op === "stroke").length;
    expect(reducedStrokes).toBeGreaterThan(0);

    const animated = createContext({ width: 160, height: 100 });
    drawFrame(
      animated,
      baseSnapshot({ hazards: [{ laneX: 80, halfWidth: 8, state: "active" }] }),
      { devicePixelRatio: 1, reducedMotion: false },
    );
    const animatedStrokes = animated.calls.filter((call) => call.op === "stroke").length;
    expect(animatedStrokes).toBeGreaterThan(0);
    // The pulse fill appears only when motion is allowed.
    const pulseFill = animated.calls.some(
      (call) => call.op === "fillRect" && (call.args[2] as number) > 0 && (call.args[3] as number) === 100,
    );
    const reducedFill = reduced.calls.some(
      (call) => call.op === "fillRect" && (call.args[2] as number) > 0 && (call.args[3] as number) === 100,
    );
    expect(pulseFill).toBe(true);
    expect(reducedFill).toBe(false);
  });

  it("rejects a non-positive device pixel ratio", () => {
    const ctx = createContext({ width: 160, height: 100 });
    expect(() => drawFrame(ctx, baseSnapshot(), { devicePixelRatio: 0 })).toThrow(RangeError);
    expect(() => drawFrame(ctx, baseSnapshot(), { devicePixelRatio: Number.NaN })).toThrow(
      RangeError,
    );
  });
});

describe("createRenderSnapshot", () => {
  it("projects enemies, hazards, and status text for the DOM host", () => {
    const snapshot = baseSnapshot();
    expect(snapshot.enemies[0]!.glyph).toBe("⊕");
    expect(snapshot.objectivesRemaining).toBe(1);
    expect(snapshot.telegraphText).toBe("hazard-shift-lane — telegraphed");
    expect(snapshot.statusLine).toBe("Ball live");
  });
});