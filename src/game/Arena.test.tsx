// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createContentCatalog } from "../domain/content/catalog";
import type { ContentId } from "../domain/content/catalog";
import { NEUTRAL_EFFECTS } from "../domain/combat/effects";
import { createCombatState } from "../domain/combat/layout";
import type { CombatInitContext, CombatState } from "../domain/combat/model";
import { outcomeIdFor } from "../domain/combat/results";
import { launchBall, movePaddle } from "../domain/combat/rules";
import { aimAngleForPointerX } from "./input";
import { Arena } from "./Arena";
import type { ArenaProps, ArenaViewModel } from "./Arena";
import type { Context2DLike } from "./renderer";
import type { FrameClock } from "./engine";

afterEach(cleanup);

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const BATTLE_ROOM = asContentId("room-battle-glassway");
const HAZARD_SHIFT = asContentId("hazard-shift-lane");
const EVENT_KEY = "route:content-1:run-1:1:room:room-battle-glassway";

// Canvas CSS geometry the prototype patches present to the component; the
// world mapping (160×100) then yields a uniform scale of 4.
const FIELD_CSS_WIDTH = 640;
const FIELD_CSS_HEIGHT = 400;
const POINTER_CANVAS_WIDTH = 800;

function initContext(
  overrides: Partial<CombatInitContext> = {},
): CombatInitContext {
  return {
    seed: "seed-arena",
    contentVersion: "content-1",
    roomId: "route:content-1:run-1:1:room:room-battle-glassway:candidate",
    eventKey: EVENT_KEY,
    formationId: BATTLE_ROOM,
    density: 1,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [HAZARD_SHIFT],
    ...overrides,
  };
}

function preLaunchState(): CombatState {
  return createCombatState(catalog, initContext());
}

/**
 * The deterministic loss volley recorded by S03's session tests: an
 * off-paddle aim (−0.6 from paddle 80) reaches the loss boundary within a
 * bounded step horizon, unlike a straight-up launch that can bounce forever.
 */
function lossVolley(): CombatState {
  return launchBall(
    movePaddle(createCombatState(catalog, initContext()), 80),
    -0.6,
  );
}

function restoredAfterLoss(): CombatState {
  return movePaddle(createCombatState(catalog, initContext({ lossCount: 1 })), 80);
}

function clearedState(): CombatState {
  const state = preLaunchState();
  return {
    ...state,
    phase: "resolved",
    outcome: { kind: "clear", outcomeId: outcomeIdFor(EVENT_KEY, "clear", 0) },
  };
}

/**
 * Deterministic rAF harness: `fire(elapsedMs)` advances time and pumps
 * frames; `clock` is the FrameClock the session consumes.
 */
function createClockHarness(): {
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

// --- Canvas fixtures -------------------------------------------------------
// jsdom renders no canvas backing store, so the prototype is patched once:
// the production draw path executes against a recording 2D context and the
// paddle's world-space fill becomes observable.

const recordedRects: Array<[number, number, number, number]> = [];

const recordingContext: Context2DLike = {
  // The context must report the mounted canvas's live dimensions: draw()
  // resizes the element before drawFrame computes the world transform.
  get canvas() {
    return document.querySelector("canvas") ?? { width: 0, height: 0 };
  },
  save: () => undefined,
  restore: () => undefined,
  clearRect: () => undefined,
  beginPath: () => undefined,
  moveTo: () => undefined,
  lineTo: () => undefined,
  closePath: () => undefined,
  arc: () => undefined,
  fill: () => undefined,
  stroke: () => undefined,
  fillRect: (x, y, w, h) => {
    recordedRects.push([x, y, w, h]);
  },
  strokeRect: () => undefined,
  fillText: () => undefined,
  setLineDash: () => undefined,
  fillStyle: "",
  strokeStyle: "",
  lineWidth: 1,
  globalAlpha: 1,
  font: "",
  textAlign: "center",
};

beforeAll(() => {
  for (const [property, value] of [
    ["clientWidth", FIELD_CSS_WIDTH],
    ["clientHeight", FIELD_CSS_HEIGHT],
  ] as const) {
    Object.defineProperty(HTMLCanvasElement.prototype, property, {
      get: () => value,
      configurable: true,
    });
  }
  HTMLCanvasElement.prototype.getBoundingClientRect = function getRect() {
    return {
      left: 0,
      width: POINTER_CANVAS_WIDTH,
      top: 0,
      height: FIELD_CSS_HEIGHT,
      right: POINTER_CANVAS_WIDTH,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
});

beforeEach(() => {
  recordedRects.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext as unknown as CanvasRenderingContext2D,
  );
});

/** The paddle is the arena's only 12px-high fill (world height 3 at scale 4). */
function lastPaddleRect(): [number, number, number, number] {
  const rects = recordedRects.filter((rect) => rect[3] === 12);
  expect(rects.length).toBeGreaterThan(0);
  return rects[rects.length - 1]!;
}

function pointerClientX(worldX: number): number {
  return (worldX / 160) * POINTER_CANVAS_WIDTH;
}

// --- Props -----------------------------------------------------------------

function baseModel(overrides: Partial<ArenaViewModel> = {}): ArenaViewModel {
  return {
    roomName: "Glassway",
    skillDisplay: [
      {
        skillId: asContentId("skill-phase-shunt"),
        name: "Phase Shunt",
        description: "Pass the ball through the first wall it touches.",
        charges: 2,
        maximum: 2,
      },
    ],
    isBusy: false,
    ...overrides,
  };
}

interface PropsOverrides {
  readonly dispatch?: ArenaProps["dispatch"];
  readonly createInitialState?: ArenaProps["createInitialState"];
  readonly clock?: FrameClock;
}

function arenaProps(overrides: PropsOverrides = {}): ArenaProps {
  return {
    model: baseModel(),
    dispatch: overrides.dispatch ?? vi.fn(),
    createInitialState: overrides.createInitialState ?? preLaunchState,
    resolveVolleyEffects: () => NEUTRAL_EFFECTS,
    sessionOptions: {
      engine: { stepSeconds: 1 / 60, maxCatchUpSteps: 17 },
      ...(overrides.clock !== undefined ? { clock: overrides.clock } : {}),
    },
  };
}

/** The arena's single state line: state token + text, never color-only. */
function statusLine(container: HTMLElement): HTMLElement {
  const status = container.querySelector<HTMLElement>(".arena-status");
  if (status === null) {
    throw new Error("arena did not render a status line");
  }
  return status;
}

function statusText(container: HTMLElement): string {
  return (
    statusLine(container).querySelector<HTMLElement>(".arena-status__text")
      ?.textContent ?? ""
  );
}

/** Pump the bridge's engine until the volley ends or the horizon caps out. */
function pumpUntilVolleyEnds(fire: (elapsedMs: number) => void): void {
  act(() => {
    fire(16);
  });
  for (let frame = 0; frame < 400; frame += 1) {
    act(() => {
      fire(160); // ≈9 simulation steps per frame
    });
    if (document.querySelector('[data-status="ball-live"]') === null) {
      return;
    }
  }
}

// --- Composition -----------------------------------------------------------

describe("Arena composition", () => {
  it("renders the canvas host, status line, field guidance, and launch control", () => {
    const { container } = render(<Arena {...arenaProps()} />);

    expect(screen.getByRole("img", { name: /Glassway arena/ })).toBeInTheDocument();
    expect(statusLine(container)).toHaveAttribute("data-status", "aim-ready");
    expect(statusText(container)).toBe("Aim ready");
    expect(
      screen.getByText("Aim with pointer — launch is explicit"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Move pointer to set angle/)).toBeInTheDocument();

    const launch = screen.getByRole("button", { name: /Launch ball/ });
    expect(launch).toBeEnabled();
    expect(launch).toHaveClass("action-button--primary");
  });

  it("renders the skill rail with room charges and disables depleted skills with a reason", () => {
    render(
      <Arena
        {...arenaProps()}
        model={baseModel({
          skillDisplay: [
            {
              skillId: asContentId("skill-phase-shunt"),
              name: "Phase Shunt",
              description: "Pass the ball through the first wall it touches.",
              charges: 2,
              maximum: 2,
            },
            {
              skillId: asContentId("skill-rebound-lens"),
              name: "Rebound Lens",
              description: "Widen the next paddle bounce.",
              charges: 0,
              maximum: 1,
            },
          ],
        })}
      />,
    );

    const rail = screen.getByRole("group", { name: "Active skills" });
    expect(rail).toHaveTextContent("Phase Shunt");
    expect(rail).toHaveTextContent("2 / 2");
    expect(rail).toHaveTextContent("Rebound Lens");
    expect(rail).toHaveTextContent("0 / 1");
    expect(screen.getByRole("button", { name: /Phase Shunt/ })).toBeEnabled();
    const depleted = screen.getByRole("button", { name: /Rebound Lens/ });
    expect(depleted).toBeDisabled();
    expect(
      screen.getByText("Depleted — no charges left this room"),
    ).toBeInTheDocument();
  });

  it("keeps the launch control reachable by keyboard focus", async () => {
    const user = userEvent.setup();
    render(<Arena {...arenaProps()} />);

    await user.tab();
    expect(screen.getByRole("button", { name: /Launch ball/ })).toHaveFocus();
  });

  it("passes the reduced-motion preference through as a data attribute", () => {
    const previous = Object.getOwnPropertyDescriptor(window, "matchMedia");
    Object.defineProperty(window, "matchMedia", {
      value: (query: string) =>
        ({
          matches: query === "(prefers-reduced-motion: reduce)",
          media: query,
        }) as MediaQueryList,
      configurable: true,
      writable: true,
    });
    try {
      const { container } = render(<Arena {...arenaProps()} />);
      const panel = container.querySelector(".arena-panel");
      expect(panel).toHaveAttribute("data-reduced-motion", "true");
    } finally {
      if (previous === undefined) {
        delete (window as { matchMedia?: unknown }).matchMedia;
      } else {
        Object.defineProperty(window, "matchMedia", previous);
      }
    }
  });
});

// --- CA-07: launch is explicit --------------------------------------------

describe("Arena explicit launch (CA-07)", () => {
  it("dispatches combat/launch only from the launch control, carrying the pointer-set aim", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<Arena {...arenaProps({ dispatch })} />);

    // Pointer movement aims and moves only — no launch dispatch.
    fireEvent.pointerMove(screen.getByRole("img", { name: /Glassway arena/ }), {
      clientX: pointerClientX(40),
    });
    expect(dispatch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Launch ball/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "combat/launch",
      aimAngle: aimAngleForPointerX(40),
    });
  });

  it("disables the launch control while busy", () => {
    render(<Arena {...arenaProps()} model={baseModel({ isBusy: true })} />);
    const launch = screen.getByRole("button", { name: /Launch ball/ });
    expect(launch).toBeDisabled();
    expect(launch).toHaveAttribute("aria-busy", "true");
  });

  it("disables the launch control while the ball is live", () => {
    const { container } = render(
      <Arena {...arenaProps({ createInitialState: lossVolley })} />,
    );
    expect(statusLine(container)).toHaveAttribute("data-status", "ball-live");
    expect(statusText(container)).toBe("Ball live");
    expect(screen.getByRole("button", { name: /Launch ball/ })).toBeDisabled();
    expect(screen.getByText("Ball live — track the paddle")).toBeInTheDocument();
  });

  it("disables the launch control and announces a clear as resolved", () => {
    const { container } = render(
      <Arena {...arenaProps({ createInitialState: clearedState })} />,
    );
    expect(statusLine(container)).toHaveAttribute("data-status", "clear");
    expect(statusText(container)).toBe("Room clear");
    expect(screen.getByRole("button", { name: /Launch ball/ })).toBeDisabled();
  });
});

// --- Session interaction ---------------------------------------------------

describe("Arena session interaction", () => {
  it("reflects pointer-driven paddle movement in the drawn frame", () => {
    render(<Arena {...arenaProps()} />);
    const canvas = screen.getByRole("img", { name: /Glassway arena/ });

    const initial = lastPaddleRect();
    // Paddle at world 80 on a 640×400 backing store (scale 4): x = (80−15)·4.
    expect(initial).toEqual([260, 376, 120, 12]);

    fireEvent.pointerMove(canvas, { clientX: pointerClientX(40) });
    expect(lastPaddleRect()).toEqual([100, 376, 120, 12]);
  });

  it("nudges the paddle with the arrow keys through the input layer", () => {
    render(<Arena {...arenaProps()} />);
    const canvas = screen.getByRole("img", { name: /Glassway arena/ });

    fireEvent.keyDown(canvas, { key: "ArrowLeft" });
    expect(lastPaddleRect()).toEqual([(80 - 4 - 15) * 4, 376, 120, 12]);
  });

  it("shows the pending hazard telegraph as DOM text", () => {
    render(<Arena {...arenaProps()} />);
    expect(screen.getByText(`${HAZARD_SHIFT} — telegraphed`)).toBeInTheDocument();
  });

  it("announces the loss status and reports the outcome to the store exactly once", () => {
    const dispatch = vi.fn();
    const harness = createClockHarness();
    const { container } = render(
      <Arena
        {...arenaProps({
          dispatch,
          createInitialState: lossVolley,
          clock: harness.clock,
        })}
      />,
    );

    pumpUntilVolleyEnds(harness.fire);

    const outcomeDispatches = dispatch.mock.calls.filter(
      (call) => (call[0] as { type: string }).type === "combat/report-outcome",
    );
    expect(outcomeDispatches).toHaveLength(1);
    expect(outcomeDispatches[0]![0]).toEqual({
      type: "combat/report-outcome",
      outcome: {
        outcomeId: outcomeIdFor(EVENT_KEY, "loss_of_ball", 0),
        kind: "loss_of_ball",
      },
    });
    expect(statusLine(container)).toHaveAttribute("data-status", "loss");
    expect(statusText(container)).toBe("Loss of ball — Integrity -1");
  });

  it("reconciles the durable restore publish and returns to aim-ready", () => {
    const harness = createClockHarness();
    const { container, rerender } = render(
      <Arena {...arenaProps({ createInitialState: lossVolley, clock: harness.clock })} />,
    );
    pumpUntilVolleyEnds(harness.fire);
    expect(statusLine(container)).toHaveAttribute("data-status", "loss");

    // The store publishes the restored pre-launch checkpoint (CA-04); the
    // reconcile feed swaps it into the awaiting session.
    rerender(
      <Arena
        {...arenaProps({ createInitialState: restoredAfterLoss, clock: harness.clock })}
      />,
    );
    expect(statusLine(container)).toHaveAttribute("data-status", "aim-ready");
    expect(statusText(container)).toBe("Aim ready");
    expect(screen.getByRole("button", { name: /Launch ball/ })).toBeEnabled();
  });

  it("requests a skill use through the session, which dispatches combat/use-skill", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <Arena
        {...arenaProps({ dispatch })}
        model={baseModel({
          skillDisplay: [
            {
              skillId: asContentId("skill-phase-shunt"),
              name: "Phase Shunt",
              description: "Pass the ball through the first wall it touches.",
              charges: 1,
              maximum: 2,
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Phase Shunt/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "combat/use-skill",
      skillId: asContentId("skill-phase-shunt"),
    });
  });
});