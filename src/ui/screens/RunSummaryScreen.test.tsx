// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { ContentId } from "../../domain/content/catalog";
import { RunSummaryScreen } from "./RunSummaryScreen";
import type { RunSummaryScreenViewModel } from "./RunSummaryScreen";

afterEach(cleanup);

const BACKFEED_CELL = "relic-backfeed-cell" as ContentId;
const QUIET_PRISM = "relic-quiet-prism" as ContentId;
const SPARE_VECTOR = "relic-spare-vector" as ContentId;

const PENDING_OPTIONS: RunSummaryScreenViewModel["pendingRelicChoice"] = {
  options: [
    {
      id: BACKFEED_CELL,
      name: "Backfeed Cell",
      cappedDescription: "First room starts with +1 charge.",
    },
    {
      id: QUIET_PRISM,
      name: "Quiet Prism",
      cappedDescription: "One telegraph arrives earlier.",
    },
    {
      id: SPARE_VECTOR,
      name: "Spare Vector",
      cappedDescription: "One route preview reveals risk.",
    },
  ],
};

function createModel(
  overrides: Partial<RunSummaryScreenViewModel> = {},
): RunSummaryScreenViewModel {
  return {
    summary: {
      runId: "run-cr-042",
      className: "Circuit Rogue",
      reachedDepth: 8,
      bossesReached: 3,
      bossesDefeated: 2,
      activeSkillNames: ["Phase Shunt", "Null Thread"],
      passiveEquipmentNames: ["Fractal Core", "Arc Coil"],
      shardsEarned: 260,
      terminalReason: "death",
    },
    record: { isRecord: true, priorRecordDepth: 6 },
    pendingRelicChoice: PENDING_OPTIONS,
    isBusy: false,
    saveSignal: null,
    ...overrides,
  };
}

function renderSummary(model = createModel()) {
  const dispatch = vi.fn();
  return {
    dispatch,
    ...render(<RunSummaryScreen model={model} dispatch={dispatch} />),
  };
}

describe("RunSummaryScreen terminal treatment", () => {
  it("renders the terminal head, stamp, and crumb for a death terminal", () => {
    const { container } = renderSummary();

    expect(screen.getByRole("banner")).toHaveTextContent("SHARDBREAK");
    expect(
      screen.getByRole("heading", { name: "Run terminated." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Integrity collapsed")).toBeInTheDocument();
    expect(
      screen.getByText("shards finalized // checkpoint closed"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Integrity reached zero. Your living-run state is finalized and cleared; the result below is now part of the local archive.",
      ),
    ).toBeInTheDocument();
    const stamp = container.querySelector(".run-summary__stamp");
    expect(stamp).toHaveAttribute("data-reason", "death");
  });

  it("keeps the reason copy map total for the completion and abandoned reasons", () => {
    for (const terminalReason of ["completion", "abandoned"] as const) {
      renderSummary(
        createModel({
          summary: {
            ...createModel().summary,
            terminalReason,
          },
        }),
      );
      const expectedWord =
        terminalReason === "completion" ? "Run complete." : "Run abandoned.";
      expect(
        screen.getByRole("heading", { name: expectedWord }),
      ).toBeInTheDocument();
      cleanup();
    }
  });

  it("marks the active crumb entry beyond the separators", () => {
    const { container } = renderSummary();
    const crumb = container.querySelector(".run-summary__crumb");
    expect(crumb).not.toBeNull();
    const active = crumb?.querySelector('[data-active="true"]');
    expect(active).not.toBeNull();
    expect(active).toHaveTextContent("Terminal summary");
  });
});

describe("RunSummaryScreen summary panel", () => {
  it("renders the metric grid: depth, shards, bosses, record result", () => {
    renderSummary();

    const metrics = screen.getByLabelText("Run summary metrics");
    const metricTiles = within(metrics).getAllByText(
      /Reached depth|Shards earned|Bosses cleared|Record result/,
    );
    expect(metricTiles).toHaveLength(4);
    expect(metrics).toHaveTextContent("08");
    expect(metrics).toHaveTextContent("+260");
    expect(metrics).toHaveTextContent("Bosses cleared");
    expect(metrics).toHaveTextContent("Record result");
  });

  it("pairs the record metric state with text and a data attribute, not color alone (CA-08)", () => {
    const { container, rerender } = renderSummary();

    const recordMetric = container.querySelectorAll(".run-summary__metric")[3];
    expect(recordMetric).toHaveAttribute("data-record", "new");
    expect(recordMetric).toHaveTextContent("NEW");

    rerender(
      <RunSummaryScreen
        model={createModel({
          record: { isRecord: false, priorRecordDepth: 6 },
        })}
        dispatch={vi.fn()}
      />,
    );
    const currentMetric = container.querySelectorAll(
      ".run-summary__metric",
    )[3];
    expect(currentMetric).toHaveAttribute("data-record", "current");
    expect(currentMetric).toHaveTextContent("06");
  });

  it("renders catalog-resolved build tags with typed data attributes", () => {
    const { container } = renderSummary();

    expect(screen.getByText("2 active // 2 passive")).toBeInTheDocument();
    const tags = Array.from(
      container.querySelectorAll(".run-summary__tag"),
    ).map((tag) => ({
      name: tag.textContent,
      type: tag.getAttribute("data-tag-type"),
    }));
    expect(tags).toEqual([
      { name: "Phase Shunt", type: "skill" },
      { name: "Null Thread", type: "skill" },
      { name: "Fractal Core", type: "equipment" },
      { name: "Arc Coil", type: "equipment" },
    ]);
  });

  it("renders an explicit empty note when the build was empty", () => {
    const { container } = renderSummary(
      createModel({
        summary: {
          ...createModel().summary,
          activeSkillNames: [],
          passiveEquipmentNames: [],
        },
      }),
    );

    expect(screen.getByText("0 active // 0 passive")).toBeInTheDocument();
    expect(
      container.querySelector(".run-summary__tags-empty"),
    ).toHaveTextContent("No build contents were recorded.");
  });

  it("renders the terminal rule note", () => {
    renderSummary();
    expect(screen.getByText(/Terminal rule:/)).toHaveTextContent(
      "Terminal rule:",
    );
    expect(
      screen.getByText(/refresh cannot resurrect or duplicate/),
    ).toBeInTheDocument();
  });

  it("shows the save signal with its tone and message", () => {
    renderSummary(
      createModel({
        saveSignal: {
          tone: "saved",
          message: "Run lost. +260 shards banked to the archive.",
        },
      }),
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved: Run lost. +260 shards banked to the archive.",
    );
  });
});

describe("RunSummaryScreen record callout", () => {
  it("renders the NEW callout with the replaced depth", () => {
    renderSummary();

    const callout = screen.getByText("Personal record // new").closest(
      ".run-summary__record",
    );
    expect(callout).toHaveAttribute("data-record", "new");
    expect(callout).toHaveTextContent("Depth 08");
    expect(callout).toHaveTextContent(
      "Replaces Depth 06 in this local profile.",
    );
  });

  it("renders the standing record without the NEW marker after a reload", () => {
    renderSummary(
      createModel({
        record: { isRecord: false, priorRecordDepth: 8 },
      }),
    );

    const callout = screen
      .getByText("Personal record // current")
      .closest(".run-summary__record");
    expect(callout).toHaveAttribute("data-record", "current");
    expect(callout).toHaveTextContent("Depth 08");
    expect(callout).toHaveTextContent(
      "Standing record in this local profile.",
    );
  });
});

describe("RunSummaryScreen relic radiogroup", () => {
  it("renders the three authored options with names and capped copy", () => {
    renderSummary();

    const group = screen.getByRole("radiogroup", {
      name: "Carry-over relic choice",
    });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios[0]).toHaveTextContent("Backfeed Cell");
    expect(radios[0]).toHaveTextContent("First room starts with +1 charge.");
    expect(radios[1]).toHaveTextContent("Quiet Prism");
    expect(radios[0]).toHaveAttribute("data-relic-id", BACKFEED_CELL);
    expect(radios[2]).toHaveAttribute("data-relic-id", SPARE_VECTOR);
    expect(radios[0]).toHaveAttribute("aria-checked", "false");
    expect(radios[0]).toBeEnabled();
    expect(radios[0]).toHaveAttribute("tabindex", "0");
    expect(radios[1]).toHaveAttribute("tabindex", "-1");
  });

  it("dispatches terminal/resolve-relic immediately on selection (CA-18 immediate-on-select)", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary();

    await user.click(screen.getByRole("radio", { name: /Backfeed Cell/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "terminal/resolve-relic",
      relicId: BACKFEED_CELL,
    });
  });

  it("moves focus and commits with arrow keys inside the group", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary();
    const quietPrism = screen.getByRole("radio", { name: /Quiet Prism/ });

    quietPrism.focus();
    await user.keyboard("{ArrowUp}");
    expect(screen.getByRole("radio", { name: /Backfeed Cell/ })).toHaveFocus();
    expect(dispatch).toHaveBeenCalledWith({
      type: "terminal/resolve-relic",
      relicId: BACKFEED_CELL,
    });

    dispatch.mockClear();
    await user.keyboard("{ArrowDown}");
    expect(quietPrism).toHaveFocus();
    expect(dispatch).toHaveBeenCalledWith({
      type: "terminal/resolve-relic",
      relicId: QUIET_PRISM,
    });
  });

  it("keeps roving focus inside the group on Home and End", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary();
    const spareVector = screen.getByRole("radio", { name: /Spare Vector/ });

    spareVector.focus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("radio", { name: /Backfeed Cell/ })).toHaveFocus();
    // Home landed on a different radio, so the move commits (the
    // selection-is-the-commit pattern, identical for arrow keys).
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "terminal/resolve-relic",
      relicId: BACKFEED_CELL,
    });

    dispatch.mockClear();
    spareVector.focus();
    await user.keyboard("{End}");
    expect(spareVector).toHaveFocus();
    // End moved focus back to the already-focused radio: no second dispatch.
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("disables the radiogroup and the dispatch while a durable save is in flight", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary(createModel({ isBusy: true }));

    for (const radio of screen.getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    await user.click(screen.getByRole("radio", { name: /Backfeed Cell/ }));
    expect(dispatch).not.toHaveBeenCalled();
    const statuses = screen.getAllByRole("status");
    expect(statuses.length).toBeGreaterThan(0);
    for (const status of statuses) {
      expect(status).toHaveTextContent("Durable action in progress");
    }
    expect(
      screen.getByRole("button", { name: /Try again/ }),
    ).toBeDisabled();
  });

  it("renders the capped-utility note beside the choice", () => {
    renderSummary();

    expect(
      screen.getByText(
        "One bounded relic can carry forward. It adds utility, not infinite damage or ball-speed growth.",
      ),
    ).toBeInTheDocument();
  });
});

describe("RunSummaryScreen resolved / absent pending choice (fail closed)", () => {
  it("renders no radiogroup and no relic dispatch surface once the choice is past", () => {
    const { container } = renderSummary(
      createModel({
        pendingRelicChoice: null,
        saveSignal: {
          tone: "saved",
          message: "Backfeed Cell equipped for the next run.",
        },
      }),
    );

    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(container.querySelector(".relic-option")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved: Backfeed Cell equipped for the next run.",
    );
  });

  it("dispatches the decline (relicId null) from Try again while unresolved", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary();

    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "terminal/resolve-relic",
      relicId: null,
    });
  });

  it("dispatches run/return-to-archive from Try again once past the choice", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderSummary(
      createModel({
        pendingRelicChoice: null,
        saveSignal: { tone: "saved", message: "Relic choice declined." },
      }),
    );

    await user.click(screen.getByRole("button", { name: /Try again/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: "run/return-to-archive" });
  });
});

describe("RunSummaryScreen reduced motion", () => {
  it("keeps static state text that survives reduced motion", () => {
    renderSummary(
      createModel({
        saveSignal: {
          tone: "saved",
          message: "Run lost. +260 shards banked to the archive.",
        },
      }),
    );

    // The reduced-motion block only strips transitions and glows; the
    // stamp, metric labels, record callout text, and save signal are static
    // DOM and survive.
    expect(screen.getByText("Integrity collapsed")).toBeInTheDocument();
    expect(screen.getByText("Shards earned")).toBeInTheDocument();
    expect(screen.getByText("Personal record // new")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Run lost. +260");
  });
});