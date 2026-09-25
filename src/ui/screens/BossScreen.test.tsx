// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createContentCatalog } from "../../domain/content/catalog";
import type { ContentId } from "../../domain/content/catalog";
import { createBossCombatState } from "../../domain/combat/bossState";
import { NEUTRAL_EFFECTS } from "../../domain/combat/effects";
import { createCombatState } from "../../domain/combat/layout";
import type { CombatInitContext } from "../../domain/combat/model";
import { BossScreen } from "./BossScreen";
import type { BossScreenViewModel } from "./BossScreen";
import type { Context2DLike } from "../../game/renderer";
import type { SaveSignalView } from "../components/SaveSignal";

afterEach(cleanup);

const catalog = createContentCatalog();
const asContentId = (value: string): ContentId => value as ContentId;
const WARDEN = asContentId("boss-warden");
const EVENT_KEY = "route:content-1:run-1:3:room:room-boss-mandatory";

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
    seed: "seed-boss-screen",
    contentVersion: "content-1",
    roomId: `${EVENT_KEY}:candidate`,
    eventKey: EVENT_KEY,
    formationId: asContentId("room-boss-mandatory"),
    density: 6,
    durabilityFactor: 1,
    lossCount: 0,
    hazardIds: [],
    ...overrides,
  };
}

function bossRuntime() {
  return createBossCombatState(catalog, {
    ...initContext(),
    archetypeId: WARDEN,
    modifierIds: [],
  });
}

function baseModel(
  overrides: Partial<BossScreenViewModel> = {},
): BossScreenViewModel {
  const runtime = bossRuntime();
  return {
    runId: "run-boss-1",
    className: "Circuit Rogue",
    depth: 3,
    cycle: 1,
    roomType: "boss",
    roomName: "Mandatory Boss",
    roomSummary: "The required encounter at every positive multiple of three.",
    objectiveNames: ["Defeat the Routed Boss"],
    integrityCurrent: 3,
    integrityMaximum: 3,
    runCurrency: 40,
    skillDisplay: [],
    passiveCount: 0,
    passiveSummary: "none equipped yet",
    hasClearOutcome: false,
    isBusy: false,
    saveSignal: null,
    boss: runtime,
    modifierChips: runtime.definition.compatibleModifiers.map((entry) => ({
      modifierId: entry.id,
      displayName: entry.displayName,
      isApplied: false,
      cappedDescription: entry.cappedDescription,
    })),
    breachAim: 0,
    canBreach: true,
    createInitialState: () => createCombatState(catalog, initContext()),
    resolveVolleyEffects: () => NEUTRAL_EFFECTS,
    ...overrides,
  };
}

describe("BossScreen composition", () => {
  it("renders the boss identity card with name, summary, and run stats", () => {
    render(<BossScreen model={baseModel()} dispatch={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /Warden \/\/ Boss/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Warden rotates a predictable prism sweep/)).toBeInTheDocument();
    const stats = within(screen.getByLabelText("Run status"));
    expect(stats.getByText("Depth")).toBeInTheDocument();
    expect(stats.getByText("Cycle")).toBeInTheDocument();
    expect(stats.getByText("Integrity")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Combat arena" })).toBeInTheDocument();
  });

  it("renders the boss state rows: phase counter, transition condition, high-impact attack", () => {
    const { container } = render(
      <BossScreen model={baseModel()} dispatch={vi.fn()} />,
    );
    const rows = container.querySelector('[aria-label="Boss state"]');
    expect(rows).not.toBeNull();
    const state = within(rows as HTMLElement);
    expect(state.getByText("Phase")).toBeInTheDocument();
    expect(state.getByText("01 / 03 — Lock")).toBeInTheDocument();
    expect(state.getByText("Transition")).toBeInTheDocument();
    expect(state.getByText("Outer node breaks")).toBeInTheDocument();
    expect(state.getByText("High-impact attack")).toBeInTheDocument();
    expect(state.getByText("Prism sweep")).toBeInTheDocument();
  });

  it("renders phase steps with text labels, not color-only (CA-08 boss share)", () => {
    const { container } = render(
      <BossScreen model={baseModel()} dispatch={vi.fn()} />,
    );
    const steps = container.querySelector('[aria-label="Boss phases"]');
    expect(steps).not.toBeNull();
    const stepItems = within(steps as HTMLElement).getAllByRole("listitem");
    expect(stepItems).toHaveLength(3);
    expect(stepItems.map((item) => item.textContent)).toEqual([
      "01 Lock",
      "02 Split",
      "03 Breach",
    ]);
    expect(stepItems[0]).toHaveAttribute("data-state", "current");
    expect(stepItems[1]).toHaveAttribute("data-state", "upcoming");
    expect(stepItems[2]).toHaveAttribute("data-state", "upcoming");
    expect(steps).toHaveAttribute("data-current-phase", "lock");
  });

  it("renders modifier chips with compatibility text and application state", () => {
    render(
      <BossScreen
        model={baseModel({
          modifierChips: [
            {
              modifierId: asContentId("boss-modifier-split-lane"),
              displayName: "Split lane",
              isApplied: true,
              cappedDescription:
                "Split lane · compatible — the arena gains a second hazard lane; it never removes the open rebound route.",
            },
            {
              modifierId: asContentId("boss-modifier-arc-saturation"),
              displayName: "Arc saturation",
              isApplied: false,
              cappedDescription:
                "Arc saturation · capped — telegraph windows shorten to a bounded step floor; timing stays readable.",
            },
          ],
        })}
        dispatch={vi.fn()}
      />,
    );
    const chips = screen.getByLabelText("Cycle modifiers");
    const rows = within(chips).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Split lane · applied");
    expect(rows[0]).toHaveTextContent("never removes the open rebound route");
    expect(rows[0]).toHaveAttribute("data-applied", "true");
    expect(rows[1]).toHaveTextContent("Arc saturation · compatible");
    expect(rows[1]).toHaveAttribute("data-applied", "false");
    expect(
      screen.getByText("They cannot remove every viable response."),
    ).toBeInTheDocument();
  });

  it("renders the telegraph banner with name, countdown text, and counterplay (CA-10)", () => {
    const { container } = render(
      <BossScreen model={baseModel()} dispatch={vi.fn()} />,
    );
    const banner = container.querySelector(".telegraph-banner");
    expect(banner).not.toBeNull();
    expect(banner).toHaveAttribute("data-tone", "incoming");
    const title = (banner as HTMLElement).querySelector(
      ".telegraph-banner__title",
    );
    expect(title).toHaveTextContent("TELEGRAPH // PRISM SWEEP IN");
    expect(title?.textContent).toMatch(/IN \d+\.\ds$/);
    const detail = (banner as HTMLElement).querySelector(
      ".telegraph-banner__detail",
    );
    expect(detail?.textContent).toContain("Counter: Break the outer node");
    expect(detail?.textContent).toContain("Static text persists when motion is reduced.");
  });

  it("omits the telegraph banner when no sweep lane is pending", () => {
    const runtime = bossRuntime();
    const cleared = {
      ...runtime,
      arena: {
        ...runtime.arena,
        hazards: runtime.arena.hazards.map((hazard) => ({
          ...hazard,
          state: "resolved" as const,
          remainingSteps: 0,
        })),
      },
      projection: {
        ...runtime.projection,
        telegraph: null,
      },
    };
    const { container } = render(
      <BossScreen
        model={baseModel({ boss: cleared })}
        dispatch={vi.fn()}
      />,
    );
    expect(container.querySelector(".telegraph-banner")).toBeNull();
  });

  it("keeps the boss integrity meter bound to the projection's health", () => {
    render(<BossScreen model={baseModel()} dispatch={vi.fn()} />);
    expect(
      screen.getByRole("img", { name: "6 of 6 Boss integrity" }),
    ).toBeInTheDocument();
  });
});

describe("BossScreen actions", () => {
  it("gates Advance to reward draft on the clear outcome, with the defeat reason", () => {
    render(<BossScreen model={baseModel()} dispatch={vi.fn()} />);
    const advance = screen.getByRole("button", { name: "Advance to reward draft" });
    expect(advance).toBeDisabled();
    expect(
      screen.getByText("Defeat the boss to open the reward draft."),
    ).toBeInTheDocument();
  });

  it("dispatches room/resolve once the boss is defeated", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <BossScreen
        model={baseModel({ hasClearOutcome: true })}
        dispatch={dispatch}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Advance to reward draft" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "room/resolve" });
  });

  it("keeps advance disabled while busy even with a recorded clear", () => {
    render(
      <BossScreen
        model={baseModel({ hasClearOutcome: true, isBusy: true })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
  });

  it("dispatches combat/launch with the committed aim from the Breach control", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <BossScreen model={baseModel({ breachAim: 0.1 })} dispatch={dispatch} />,
    );
    await user.click(screen.getByRole("button", { name: /Breach Warden/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "combat/launch",
      aimAngle: 0.1,
    });
  });

  it("disables Breach without a committed aim", () => {
    render(<BossScreen model={baseModel({ breachAim: null })} dispatch={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Breach Warden/ })).toBeDisabled();
  });

  it("surfaces the save signal through the rail", () => {
    render(
      <BossScreen
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
    render(<BossScreen model={baseModel()} dispatch={dispatch} />);
    await user.click(screen.getByRole("button", { name: "Return to archive" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "run/return-to-archive" });
  });
});