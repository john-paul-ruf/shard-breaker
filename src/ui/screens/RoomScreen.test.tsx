// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createContentCatalog } from "../../domain/content/catalog";
import type { ContentId } from "../../domain/content/catalog";
import {
  generateRoomCandidate,
  generateRouteOptions,
} from "../../domain/random/generators";
import type { RecoveryState, RoomState, ShopState } from "../../domain/run/model";
import { RoomScreen } from "./RoomScreen";
import type { RoomScreenViewModel } from "./RoomScreen";

afterEach(cleanup);

const catalog = createContentCatalog();

const RUN_ID = "run-room-1";
const ROUTE_EVENT_KEY = `route:content-1:${RUN_ID}:1`;

function routeOfferFor(roomType: "shop" | "recovery" | "battle"): string {
  const offers = generateRouteOptions(catalog, {
    seed: "seed-room",
    contentVersion: catalog.contentVersion,
    runId: RUN_ID,
    depth: 1,
    cycle: 1,
    integrityCurrent: 3,
    integrityMax: 3,
    runCurrency: 0,
    routeEventKey: ROUTE_EVENT_KEY,
  });
  const selected = offers.find((offer) => offer.roomType === roomType);
  if (selected === undefined) {
    throw new Error(`no route offer for ${roomType}`);
  }
  return selected.offerId;
}

function roomCandidateFor(roomType: "shop" | "recovery" | "battle"): RoomState {
  const candidate = generateRoomCandidate(catalog, {
    seed: "seed-room",
    contentVersion: catalog.contentVersion,
    runId: RUN_ID,
    depth: 1,
    cycle: 1,
    integrityCurrent: 3,
    integrityMax: 3,
    runCurrency: 0,
    routeEventKey: ROUTE_EVENT_KEY,
    selectedOfferId: routeOfferFor(roomType),
  });
  return candidate as unknown as RoomState;
}

function baseModel(
  overrides: Partial<RoomScreenViewModel> = {},
): RoomScreenViewModel {
  return {
    runId: RUN_ID,
    className: "Circuit Rogue",
    depth: 1,
    cycle: 1,
    roomType: "shop",
    roomName: "Patchbay",
    roomSummary: "A finite run-only inventory.",
    objectiveNames: ["Visit the Patchbay"],
    integrityCurrent: 3,
    integrityMaximum: 3,
    runCurrency: 0,
    shop: null,
    recovery: null,
    isBossRoom: false,
    roomStatus: "ready",
    isBusy: false,
    saveSignal: null,
    ...overrides,
  };
}

describe("RoomScreen", () => {
  it("renders the room header with catalog-resolved name, type label, depth, cycle, and objectives", () => {
    render(<RoomScreen model={baseModel()} dispatch={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: /Patchbay \/\/ Shop/ }),
    ).toBeInTheDocument();
    const stats = within(screen.getByLabelText("Run status"));
    expect(stats.getAllByText("01")).toHaveLength(2);
    expect(stats.getByText("Depth")).toBeInTheDocument();
    expect(stats.getByText("Cycle")).toBeInTheDocument();
    expect(screen.getByText("Visit the Patchbay")).toBeInTheDocument();
  });

  it("renders the shop inventory with prices and dispatches room/buy-shop-item", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <RoomScreen
        model={baseModel({
          runCurrency: 40,
          shop: {
            items: [
              {
                itemId: "shop-service-integrity-patch" as ContentId,
                displayName: "Integrity Patch",
                price: 20,
                isPurchased: false,
                isAffordable: true,
              },
            ],
            hasItems: true,
          },
        })}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText("Integrity Patch")).toBeInTheDocument();
    expect(screen.getByText("20 room shards")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Buy" }));
    expect(dispatch).toHaveBeenCalledWith({
      type: "room/buy-shop-item",
      itemId: "shop-service-integrity-patch",
    });
  });

  it("disables unaffordable buy controls with a visible reason", () => {
    render(
      <RoomScreen
        model={baseModel({
          runCurrency: 0,
          shop: {
            items: [
              {
                itemId: "shop-service-integrity-patch" as ContentId,
                displayName: "Integrity Patch",
                price: 20,
                isPurchased: false,
                isAffordable: false,
              },
            ],
            hasItems: true,
          },
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(screen.getByText("Not enough room shards")).toBeInTheDocument();
  });

  it("shows purchased items as purchased with a disabled control", () => {
    render(
      <RoomScreen
        model={baseModel({
          shop: {
            items: [
              {
                itemId: "shop-service-integrity-patch" as ContentId,
                displayName: "Integrity Patch",
                price: 20,
                isPurchased: true,
                isAffordable: false,
              },
            ],
            hasItems: true,
          },
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Purchased ✓" })).toBeDisabled();
    expect(screen.getByText("Purchased — stocked for this room")).toBeInTheDocument();
  });

  it("renders the recovery offer and dispatches room/commit-recovery", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(
      <RoomScreen
        model={baseModel({
          roomType: "recovery",
          roomName: "Soft Reset",
          recovery: { restoreAmount: 1, isCommitted: false },
        })}
        dispatch={dispatch}
      />,
    );
    expect(screen.getByText(/Restore 1 Integrity/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Commit recovery" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "room/commit-recovery" });
  });

  it("disables the recovery commit after it has been committed", () => {
    render(
      <RoomScreen
        model={baseModel({
          roomType: "recovery",
          roomName: "Soft Reset",
          recovery: { restoreAmount: 1, isCommitted: true },
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Recovery committed ✓" }),
    ).toBeDisabled();
  });

  it("renders the combat placeholder for battle rooms with resolve disabled", () => {
    render(
      <RoomScreen
        model={baseModel({
          roomType: "battle",
          roomName: "Glassway",
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByText(/The combat engine is coming soon\./)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Buy" })).not.toBeInTheDocument();
  });

  it("renders the boss placeholder for boss rooms with resolve disabled", () => {
    render(
      <RoomScreen
        model={baseModel({
          roomType: "boss",
          roomName: "Mandatory Boss",
          isBossRoom: true,
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/The boss arena is not implemented yet\./),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
  });

  it("dispatches room/resolve from the advance control in an open utility room", async () => {
    const user = userEvent.setup();
    const dispatch = vi.fn();
    render(<RoomScreen model={baseModel()} dispatch={dispatch} />);
    await user.click(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    );
    expect(dispatch).toHaveBeenCalledWith({ type: "room/resolve" });
  });

  it("disables all actions while busy", () => {
    render(
      <RoomScreen
        model={baseModel({
          isBusy: true,
          shop: {
            items: [
              {
                itemId: "shop-service-integrity-patch" as ContentId,
                displayName: "Integrity Patch",
                price: 20,
                isPurchased: false,
                isAffordable: true,
              },
            ],
            hasItems: true,
          },
          recovery: { restoreAmount: 1, isCommitted: false },
        })}
        dispatch={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Buy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Commit recovery" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
  });

  it("disables the advance action once the room is resolved", () => {
    render(
      <RoomScreen
        model={baseModel({ roomStatus: "resolved" })}
        dispatch={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Advance to reward draft" }),
    ).toBeDisabled();
  });

  it("integrates with the committed room producer shapes end to end", () => {
    const shopRoom = roomCandidateFor("shop");
    expect(shopRoom.shop).not.toBeNull();
    const shopInventory = (shopRoom.shop as ShopState).inventory;
    expect(shopInventory.length).toBeGreaterThan(0);
    expect(shopInventory.every((item) => item.price > 0)).toBe(true);

    const recoveryRoom = roomCandidateFor("recovery");
    const recovery = recoveryRoom.recovery as RecoveryState;
    expect(recovery.restoreAmount).toBe(1);
    expect(recovery.committed).toBe(false);

    // Combat rooms present no shop or recovery interactions and carry the
    // objectives the header renders.
    const battleRoom = roomCandidateFor("battle");
    expect(battleRoom.shop).toBeNull();
    expect(battleRoom.recovery).toBeNull();
    expect(battleRoom.objectiveIds.length).toBeGreaterThan(0);
  });
});