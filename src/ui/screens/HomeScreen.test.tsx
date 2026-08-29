// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ContentId } from "../../domain/content/catalog";
import { HomeScreen } from "./HomeScreen";
import type { HomeScreenViewModel } from "./HomeScreen";

afterEach(cleanup);

const CIRCUIT_ROGUE_ID = "class-circuit-rogue" as ContentId;
const GLITCH_KNIGHT_ID = "class-glitch-knight" as ContentId;
const NEON_MAGE_ID = "class-neon-mage" as ContentId;

const CLASSES: HomeScreenViewModel["classes"] = [
  {
    id: CIRCUIT_ROGUE_ID,
    name: "Circuit Rogue",
    startingIntegrity: 3,
    tradeoff: "Fast charge; fragile routing margin",
    isUnlocked: true,
  },
  {
    id: GLITCH_KNIGHT_ID,
    name: "Glitch Knight",
    startingIntegrity: 4,
    tradeoff: "Stable rebounds; slower pivot",
    isUnlocked: true,
  },
  {
    id: NEON_MAGE_ID,
    name: "Neon Mage",
    startingIntegrity: 2,
    tradeoff: "Greater skill reach; lowest margin",
    isUnlocked: false,
  },
];

const LIVING_RUN: NonNullable<HomeScreenViewModel["livingRun"]> = {
  runId: "run-durable-7",
  classId: CIRCUIT_ROGUE_ID,
  className: "Circuit Rogue",
  depth: 7,
  integrityCurrent: 2,
  integrityMaximum: 3,
  bossesDefeated: 2,
};

function createModel(
  overrides: Partial<HomeScreenViewModel> = {},
): HomeScreenViewModel {
  return {
    mode: "archive",
    loadState: "ready",
    shards: 0,
    highestReachedDepth: 0,
    classes: CLASSES,
    selectedClassId: CIRCUIT_ROGUE_ID,
    livingRun: null,
    isReplacementGuardOpen: false,
    isBusy: false,
    saveSignal: null,
    ...overrides,
  };
}

function renderHome(model = createModel()) {
  const dispatch = vi.fn();
  return {
    dispatch,
    ...render(<HomeScreen model={model} dispatch={dispatch} />),
  };
}

describe("HomeScreen launch archive", () => {
  it("renders a fresh local archive with real class values and one available selection", () => {
    const { container } = renderHome(
      createModel({ shards: 73, highestReachedDepth: 12 }),
    );

    expect(screen.getByRole("banner")).toHaveTextContent("SHARDBREAK");
    expect(screen.getByLabelText("73 Shards")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Break the loop. Keep the Shards." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("The three-step run loop")).toHaveTextContent(
      "Aim & launch",
    );
    expect(screen.getByText(/Depth 12 · local only/)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Choose your signal." }),
    ).toBeInTheDocument();

    const classGroup = screen.getByRole("radiogroup", { name: "Starting class" });
    const radios = within(classGroup).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.filter((radio) => radio.getAttribute("aria-checked") === "true"))
      .toHaveLength(1);

    const circuitRogue = within(classGroup).getByRole("radio", {
      name: /Circuit Rogue/,
    });
    expect(circuitRogue).toHaveAttribute("aria-checked", "true");
    expect(circuitRogue).toHaveTextContent("Fast charge; fragile routing margin");
    expect(circuitRogue).toHaveTextContent("03 INT");
    expect(circuitRogue).toHaveTextContent("SELECTED");

    const glitchKnight = within(classGroup).getByRole("radio", {
      name: /Glitch Knight/,
    });
    expect(glitchKnight).toHaveTextContent("Stable rebounds; slower pivot");
    expect(glitchKnight).toHaveTextContent("04 INT");

    const neonMage = within(classGroup).getByRole("radio", { name: /Neon Mage/ });
    expect(neonMage).toHaveAttribute("aria-disabled", "true");
    expect(neonMage).toHaveAttribute("aria-checked", "false");
    expect(neonMage).toHaveTextContent("Greater skill reach; lowest margin");
    expect(neonMage).toHaveTextContent("02 INT");
    expect(neonMage).toHaveTextContent("LOCKED");
    expect(neonMage).toHaveTextContent("Unlock this class in the local archive");

    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("dispatches class selection by click and arrow key while ignoring the locked class", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderHome();
    const circuitRogue = screen.getByRole("radio", { name: /Circuit Rogue/ });
    const glitchKnight = screen.getByRole("radio", { name: /Glitch Knight/ });
    const neonMage = screen.getByRole("radio", { name: /Neon Mage/ });

    await user.click(glitchKnight);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "home/select-class",
      classId: GLITCH_KNIGHT_ID,
    });

    dispatch.mockClear();
    circuitRogue.focus();
    await user.keyboard("{ArrowDown}");
    expect(glitchKnight).toHaveFocus();
    expect(dispatch).toHaveBeenCalledWith({
      type: "home/select-class",
      classId: GLITCH_KNIGHT_ID,
    });

    dispatch.mockClear();
    await user.click(neonMage);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("requests a new run directly only when no living run exists", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderHome();

    await user.click(screen.getByRole("button", { name: "Start new run" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "run/request-start" });
  });

  it("routes the first new-run click through the controlled guard when a run lives", async () => {
    const user = userEvent.setup();
    const initialModel = createModel({ livingRun: LIVING_RUN });
    const { dispatch, rerender } = renderHome(initialModel);
    const startButton = screen.getByRole("button", { name: "Start new run" });

    await user.click(startButton);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "run/request-start" });
    expect(dispatch).not.toHaveBeenCalledWith({
      type: "run/confirm-abandon-and-start",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    rerender(
      <HomeScreen
        model={createModel({
          livingRun: LIVING_RUN,
          isReplacementGuardOpen: true,
        })}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByRole("dialog", { name: "Living run detected" }))
      .toHaveAccessibleDescription(
        "Starting a new run cannot silently replace Circuit Rogue at Depth 07. Resume it, abandon it permanently, or cancel.",
      );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(dispatch).toHaveBeenLastCalledWith({ type: "run/cancel-replacement" });

    rerender(
      <HomeScreen
        model={createModel({ livingRun: LIVING_RUN })}
        dispatch={dispatch}
      />,
    );
    expect(startButton).toHaveFocus();
  });

  it("dispatches resume and explicit abandonment as separate intents", async () => {
    const user = userEvent.setup();
    const { dispatch, rerender } = renderHome(createModel({ livingRun: LIVING_RUN }));

    await user.click(
      screen.getByRole("button", { name: "Resume living run" }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "run/resume" });

    rerender(
      <HomeScreen
        model={createModel({
          livingRun: LIVING_RUN,
          isReplacementGuardOpen: true,
        })}
        dispatch={dispatch}
      />,
    );
    const dialog = screen.getByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Resume living run" }),
    );
    expect(dispatch).toHaveBeenLastCalledWith({ type: "run/resume" });

    await user.click(screen.getByRole("button", { name: "Abandon & start" }));
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "run/confirm-abandon-and-start",
    });
  });

  it("renders the real living-run depth, Integrity, and boss progress", () => {
    renderHome(createModel({ livingRun: LIVING_RUN }));
    const runStrip = screen.getByRole("heading", {
      name: "Living run detected",
    }).parentElement?.parentElement;
    if (!(runStrip instanceof HTMLElement)) {
      throw new Error("expected living run strip");
    }

    expect(runStrip).toHaveTextContent("Circuit Rogue · Depth 07");
    expect(
      within(runStrip).getByRole("img", { name: "2 of 3 Living run Integrity" }),
    ).toHaveTextContent("2 / 3");
    expect(runStrip).toHaveTextContent("2 bosses defeated");
  });

  it("blocks duplicate mutations while busy and explains the disabled state", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderHome(
      createModel({
        livingRun: LIVING_RUN,
        isReplacementGuardOpen: true,
        isBusy: true,
      }),
    );

    expect(screen.getByText(/Durable action in progress/)).toHaveTextContent(
      "Durable action in progress",
    );
    const startButton = screen.getByRole("button", { name: "Start new run" });
    const resumeButtons = screen.getAllByRole("button", {
      name: "Resume living run",
    });
    const abandonButton = screen.getByRole("button", { name: "Abandon & start" });
    const availableClass = screen.getByRole("radio", { name: /Glitch Knight/ });

    expect(startButton).toBeDisabled();
    expect(resumeButtons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(abandonButton).toBeDisabled();
    expect(availableClass).toBeDisabled();
    expect(availableClass).toHaveAttribute("aria-disabled", "true");
    await user.click(abandonButton);
    await user.click(startButton);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps committed data visible when loading fails and announces save rejection", () => {
    renderHome(
      createModel({
        loadState: "error",
        shards: 91,
        highestReachedDepth: 15,
        livingRun: LIVING_RUN,
        saveSignal: {
          tone: "rejected",
          message: "The living run was not replaced.",
        },
      }),
    );

    const rejectedMessage = screen.getByText("The living run was not replaced.");
    expect(rejectedMessage.closest('[role="alert"]')).toHaveTextContent(
      "Save rejected: The living run was not replaced.",
    );
    expect(screen.getByLabelText("91 Shards")).toBeInTheDocument();
    expect(screen.getByText(/Depth 15 · local only/)).toBeInTheDocument();
    expect(screen.getByText(/Circuit Rogue · Depth 07/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start new run" })).toBeDisabled();
  });

  it("disables bootstrap mutations until the local archive is ready", () => {
    renderHome(createModel({ loadState: "busy" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading the local archive",
    );
    expect(screen.getByRole("button", { name: "Start new run" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: /Circuit Rogue/ })).toBeDisabled();
  });
});

describe("HomeScreen restored checkpoint", () => {
  it("shows durable identity and returns to the launch archive without inventing a route", async () => {
    const user = userEvent.setup();
    const { container, dispatch } = renderHome(
      createModel({
        mode: "checkpoint",
        shards: 144,
        highestReachedDepth: 7,
        livingRun: LIVING_RUN,
        saveSignal: { tone: "saved", message: "Checkpoint committed." },
      }),
    );

    expect(
      screen.getByRole("heading", { name: "Checkpoint restored" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Circuit Rogue/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Depth 07/).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", { name: "2 of 3 Integrity" }),
    ).toHaveTextContent("2 / 3");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved: Checkpoint committed.",
    );
    expect(screen.getByText(/Checkpoint saved · local only/)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByText(/route|room|reward|coming soon/i)).not.toBeInTheDocument();
    expect(container.querySelector("a")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Return to Launch Archive" }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "run/return-to-archive" });
  });
});
