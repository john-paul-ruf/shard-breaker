// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createContentCatalog } from "../../domain/content/catalog";
import type { ContentId } from "../../domain/content/catalog";
import type {
  BuildSnapshot,
  RewardCardSnapshot,
} from "../../domain/run/model";
import { RewardsScreen } from "./RewardsScreen";
import type { RewardsScreenViewModel } from "./RewardsScreen";

afterEach(cleanup);

const catalog = createContentCatalog();

const REWARD_EVENT_KEY =
  "route:content-1:run-rewards:1:room:room-shop-patchbay:reward";

function cardSnapshot(
  rewardType: "skill" | "equipment",
  baseRewardId: string,
  index: number,
  enhancementIds: readonly string[] = [],
): RewardCardSnapshot {
  return {
    cardId: `${REWARD_EVENT_KEY}:card:${baseRewardId}:${String(index)}`,
    baseRewardId: baseRewardId as ContentId,
    rewardType,
    enhancementIds: enhancementIds.map((id) => id as ContentId),
    rolledParams: [],
    materialCost: 3 + index,
    tradeoffId: null,
  };
}

function emptyBuild(): BuildSnapshot {
  return {
    activeSkillIds: [],
    passiveEquipmentIds: [],
    carryOverRelicId: null,
  };
}

function baseModel(
  overrides: Partial<RewardsScreenViewModel> = {},
): RewardsScreenViewModel {
  return {
    runId: "run-rewards",
    className: "Circuit Rogue",
    depth: 1,
    cycle: 1,
    rewardCards: [
      cardSnapshot("skill", "skill-phase-shunt", 0),
      cardSnapshot("equipment", "equipment-fractal-core", 1),
      cardSnapshot("skill", "skill-prism-burst", 2, ["enhancement-charged"]),
    ],
    build: emptyBuild(),
    isBusy: false,
    saveSignal: null,
    catalog,
    ...overrides,
  };
}

describe("RewardsScreen", () => {
  it("renders exactly three reward cards in a radiogroup", () => {
    render(<RewardsScreen model={baseModel()} dispatch={vi.fn()} />);
    const group = screen.getByRole("radiogroup", {
      name: "Three reward cards",
    });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
  });

  it("resolves card names and descriptions from the catalog by baseRewardId", () => {
    render(<RewardsScreen model={baseModel()} dispatch={vi.fn()} />);
    expect(
      screen.getByRole("radio", { name: "skill // Phase Shunt" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "equipment // Fractal Core" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "skill // Prism Burst" }),
    ).toBeInTheDocument();
    const phaseCard = screen.getByRole("radio", {
      name: "skill // Phase Shunt",
    });
    expect(phaseCard).toHaveTextContent(
      "Pass the ball through the first wall it touches this volley.",
    );
    expect(screen.getByText(/Enhancement \/ Charged/)).toBeInTheDocument();
  });

  it("stages selection through aria-checked without dispatching", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<RewardsScreen model={baseModel()} dispatch={dispatch} />);
    await user.click(
      screen.getByRole("radio", { name: "skill // Phase Shunt" }),
    );
    expect(
      screen.getByRole("radio", { name: "skill // Phase Shunt" }),
    ).toHaveAttribute("aria-checked", "true");
    expect(
      screen.getByRole("radio", { name: "equipment // Fractal Core" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps Confirm disabled without a selection and dispatches reward/select on confirm", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    const firstCardId = baseModel().rewardCards[0]?.cardId ?? "";
    render(<RewardsScreen model={baseModel()} dispatch={dispatch} />);

    const confirm = screen.getByRole("button", { name: "Confirm draft" });
    expect(confirm).toBeDisabled();
    expect(screen.getByText(/No selection yet/)).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: "skill // Phase Shunt" }),
    );
    expect(confirm).not.toBeDisabled();

    await user.click(confirm);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: "reward/select",
      cardId: firstCardId,
    });
  });

  it("shows the replacement disclosure on a full build side and omits it on an open side", () => {
    const fullSkillBuild: BuildSnapshot = {
      activeSkillIds: [
        "skill-rebound-lens" as ContentId,
        "skill-null-thread" as ContentId,
        "skill-shield-bash" as ContentId,
      ],
      passiveEquipmentIds: [],
      carryOverRelicId: null,
    };
    render(
      <RewardsScreen
        model={baseModel({ build: fullSkillBuild })}
        dispatch={vi.fn()}
      />,
    );
    const skillCard = screen.getByRole("radio", {
      name: "skill // Phase Shunt",
    });
    expect(skillCard).toHaveTextContent("REPLACES");
    expect(skillCard).toHaveTextContent("Rebound Lens");
    expect(skillCard).toHaveTextContent("swap shown before commit");

    const equipmentCard = screen.getByRole("radio", {
      name: "equipment // Fractal Core",
    });
    expect(equipmentCard).not.toHaveTextContent("REPLACES");
  });

  it("announces the replacement in the confirm readout when the staged card displaces", async () => {
    const user = userEvent.setup();
    const fullSkillBuild: BuildSnapshot = {
      activeSkillIds: [
        "skill-rebound-lens" as ContentId,
        "skill-null-thread" as ContentId,
        "skill-shield-bash" as ContentId,
      ],
      passiveEquipmentIds: [],
      carryOverRelicId: null,
    };
    render(
      <RewardsScreen
        model={baseModel({ build: fullSkillBuild })}
        dispatch={vi.fn()}
      />,
    );
    await user.click(
      screen.getByRole("radio", { name: "skill // Phase Shunt" }),
    );
    const readout = screen
      .getByRole("button", { name: "Confirm draft" })
      .closest(".reward-confirm-bar");
    if (!(readout instanceof HTMLElement)) {
      throw new Error("expected confirm bar");
    }
    expect(within(readout).getByText(/replaces/)).toBeInTheDocument();
    expect(within(readout).getByText("Rebound Lens")).toBeInTheDocument();
  });

  it("disables all actions while busy", () => {
    render(
      <RewardsScreen
        model={baseModel({
          isBusy: true,
          saveSignal: { tone: "saved", message: "Room resolved." },
        })}
        dispatch={vi.fn()}
      />,
    );
    const group = screen.getByRole("radiogroup", {
      name: "Three reward cards",
    });
    for (const radio of within(group).getAllByRole("radio")) {
      expect(radio).toBeDisabled();
    }
    expect(
      screen.getByRole("button", { name: "Confirm draft" }),
    ).toBeDisabled();
  });

  it("renders the draft header with depth, capacity, and the no-reroll note", () => {
    render(<RewardsScreen model={baseModel()} dispatch={vi.fn()} />);
    expect(screen.getByText("Reward locked")).toBeInTheDocument();
    expect(screen.getByText(/seeded draft \/ no reroll/)).toBeInTheDocument();
    const draftBar = document.querySelector(".reward-draft-bar");
    expect(draftBar).not.toBeNull();
    expect(draftBar).toHaveTextContent("Build capacity");
    expect(draftBar).toHaveTextContent("0 / 3 active");
    expect(draftBar).toHaveTextContent("0 / 4 passive");
  });
});