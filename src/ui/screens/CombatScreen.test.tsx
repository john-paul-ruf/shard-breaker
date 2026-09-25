// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createContentCatalog } from "../../domain/content/catalog";
import type { ContentId } from "../../domain/content/catalog";
import { NEUTRAL_EFFECTS } from "../../domain/combat/effects";
import { createCombatState } from "../../domain/combat/layout";
import type { CombatInitContext } from "../../domain/combat/model";
import { CombatScreen } from "./CombatScreen";
import type { CombatScreenViewModel } from "./CombatScreen";
import type { Context2DLike } from "../../game/renderer";
import type { SaveSignalView } from "../components/SaveSignal";

afterEach(cleanup);

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const PHASE_SHUNT = asContentId("skill-phase-shunt");
const REBOUND_LENS = asContentId("skill-rebound-lens");
const HAZARD_SHIFT = asContentId("hazard-shift-lane");
const EVENT_KEY = "route:content-1:run-1:1:room:room-battle-glassway";

// Arena canvas fixture: the prototype is patched so the production draw path
// runs against a recording context and the canvas geometry is presentable.
const recordingContext: Context2DLike = {
  canvas: { width: 640, height: 400 },
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
  fillRect: () => undefined,
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
  Object.defineProperty(HTMLCanvasElement.prototype, "clientWidth", {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
    value: 400,
    configurable: true,
  });
  HTMLCanvasElement.prototype.getBoundingClientRect = function getRect() {
    return {
      left: 0,
      width: 800,
      top: 0,
      height: 400,
      right: 800,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
  };
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => recordingContext as unknown as CanvasRenderingContext2D,
  );
});

function initContext(
  overrides: Partial<CombatInitContext> = {},
): CombatInitContext {
  return {
    seed: "seed-combat-screen",
    contentVersion: "content-1",
    roomId: "route:content-1:run-1:1:room:room-battle-glassway:candidate",
    eventKey: EVENT_KEY,
    formationId: asContentId("room-battle-glassway"),
    density: 1,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [HAZARD_SHIFT],
    ...overrides,
  };
}

function baseModel(
  overrides: Partial<CombatScreenViewModel> = {},
): CombatScreenViewModel {
  return {
    runId: "run-combat-1",
    className: "Circuit Rogue",
    depth: 2,
    cycle: 1,
    roomType: "battle",
    roomName: "Glassway",
    roomSummary: "A readable formation with one hazard lane.",
    objectiveNames: ["Clear the Glassway"],
    integrityCurrent: 3,
    integrityMaximum: 3,
    runCurrency: 74,
    skillDisplay: [
      {
        skillId: PHASE_SHUNT,
        name: "Phase Shunt",
        description: "Pass the ball through the first wall it touches.",
        charges: 2,
        maximum: 2,
      },
    ],
    passiveCount: 1,
    passiveSummary: "Arc Coil",
    hasClearOutcome: false,
    isBusy: false,
    saveSignal: null,
    telegraph: {
      title: "Telegraph // hazard lane",
      detail: "Hatch marks show danger before impact. Color and text remain when motion is reduced.",
      tone: "incoming",
    },
    createInitialState: () => createCombatState(catalog, initContext()),
    resolveVolleyEffects: () => NEUTRAL_EFFECTS,
    ...overrides,
  };
}

describe("CombatScreen composition", () => {
  it("renders the room header, stats row, arena panel, and decision rail", () => {
    render(<CombatScreen model={baseModel()} dispatch={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /Glassway \/\/ Battle/ }),
    ).toBeInTheDocument();
    const stats = within(screen.getByLabelText("Run status"));
    expect(stats.getByText("Depth")).toBeInTheDocument();
    expect(stats.getByText("Cycle")).toBeInTheDocument();
    expect(stats.getByText("Integrity")).toBeInTheDocument();
    expect(stats.getByText("Room shards")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Glassway arena/ })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Combat arena" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: /Combat controls/ }))
      .toBeInTheDocument();
    expect(screen.getByText("Clear the Glassway")).toBeInTheDocument();
  });

  it("shows catalog-resolved skill charges with the passive summary", () => {
    render(
      <CombatScreen
        model={baseModel({
          skillDisplay: [
            {
              skillId: PHASE_SHUNT,
              name: "Phase Shunt",
              description: "Pass the ball through the first wall it touches.",
              charges: 1,
              maximum: 2,
            },
            {
              skillId: REBOUND_LENS,
              name: "Rebound Lens",
              description: "Widen the next paddle bounce.",
              charges: 0,
              maximum: 1,
            },
          ],
        })}
        dispatch={vi.fn()}
      />,
    );
    const rail = screen.getByRole("complementary", {
      name: /Combat controls/,
    });
    expect(rail).toHaveTextContent("Active skills // room charges");
    expect(rail).toHaveTextContent("Passive equipment 1 held");
    expect(rail).toHaveTextContent("Arc Coil");
  });

  it("keeps the integrity meter in both the stats row and the objective panel", () => {
    render(<CombatScreen model={baseModel()} dispatch={vi.fn()} />);
    expect(screen.getByRole("img", { name: "3 of 3 Integrity" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "3 of 3 Run Integrity" })).toBeInTheDocument();
  });

  it("renders the durable checkpoint telegraph as DOM text with its tone attribute (CA-08)", () => {
    const { container } = render(
      <CombatScreen model={baseModel()} dispatch={vi.fn()} />,
    );
    const banner = container.querySelector(".telegraph-banner");
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute("data-tone", "incoming");
    expect(banner).toHaveTextContent("Telegraph // hazard lane");
    expect(banner).toHaveTextContent(
      "Hatch marks show danger before impact. Color and text remain when motion is reduced.",
    );
  });

  it("omits the telegraph banner when no hazard is pending", () => {
    const { container } = render(
      <CombatScreen model={baseModel({ telegraph: null })} dispatch={vi.fn()} />,
    );
    expect(container.querySelector(".telegraph-banner")).toBeNull();
  });
});

describe("CombatScreen advance gating", () => {
  it("disables Advance to reward draft before the clear outcome is recorded, with a reason", () => {
    render(
      <CombatScreen
        model={baseModel({ hasClearOutcome: false })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Clear the room's combat encounter before it can be resolved.",
      ),
    ).toBeInTheDocument();
  });

  it("dispatches room/resolve once the clear outcome is recorded", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <CombatScreen
        model={baseModel({ hasClearOutcome: true })}
        dispatch={dispatch}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Advance to reward draft" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "room/resolve" });
  });

  it("disables advance while busy even with a recorded clear", () => {
    render(
      <CombatScreen
        model={baseModel({ hasClearOutcome: true, isBusy: true })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
  });

  it("surfaces the save signal through the rail", () => {
    render(
      <CombatScreen
        model={baseModel({
          saveSignal: {
            tone: "rejected",
            message: "The combat outcome was not saved.",
          } as SaveSignalView,
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Save rejected: The combat outcome was not saved.",
    );
  });

  it("dispatches run/return-to-archive from the status bar control", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<CombatScreen model={baseModel()} dispatch={dispatch} />);
    await user.click(screen.getByRole("button", { name: "Return to archive" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "run/return-to-archive" });
  });
});
