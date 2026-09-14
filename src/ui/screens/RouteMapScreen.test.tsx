// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createContentCatalog } from "../../domain/content/catalog";
import type { RoomDefinition, RoomType } from "../../domain/content/rooms";
import type { RouteOfferSnapshot } from "../../domain/run/model";
import { RouteMapScreen } from "./RouteMapScreen";
import type { RouteMapScreenViewModel } from "./RouteMapScreen";

afterEach(cleanup);

const catalog = createContentCatalog();

function roomByType(roomType: RoomType): RoomDefinition {
  const room = catalog.listRooms().find((r) => r.roomType === roomType);
  if (room === undefined) {
    throw new Error(`catalog has no ${roomType} room`);
  }
  return room;
}

function roomsMap(): ReadonlyMap<RoomType, RoomDefinition> {
  const map = new Map<RoomType, RoomDefinition>();
  for (const room of catalog.listRooms()) {
    map.set(room.roomType, room);
  }
  return map;
}

function offerForRoom(room: RoomDefinition): RouteOfferSnapshot {
  return Object.freeze({
    offerId: `route:content-1:run-1:offer:${room.id}`,
    roomType: room.roomType,
    roomEventKey: `route:content-1:run-1:1:room:${room.id}`,
    riskTier: room.baseRiskTier,
    rewardPreviewId: room.rewardPreviewId,
    visibleCost: room.roomType === "shop" ? 28 : 0,
    availability: "available",
  });
}

function nonBossOffers(): readonly RouteOfferSnapshot[] {
  return Object.freeze([
    offerForRoom(roomByType("battle")),
    offerForRoom(roomByType("elite")),
    offerForRoom(roomByType("shop")),
    offerForRoom(roomByType("recovery")),
  ]);
}

function bossOffers(): readonly RouteOfferSnapshot[] {
  return Object.freeze([offerForRoom(roomByType("boss"))]);
}

function createModel(
  overrides: Partial<RouteMapScreenViewModel> = {},
): RouteMapScreenViewModel {
  return {
    runId: "run-1",
    className: "Circuit Rogue",
    depth: 1,
    cycle: 1,
    integrityCurrent: 3,
    integrityMaximum: 3,
    routeOffers: nonBossOffers(),
    selectedOfferId: null,
    committed: false,
    isBusy: false,
    saveSignal: null,
    rooms: roomsMap(),
    ...overrides,
  };
}

function renderRouteMap(model = createModel()) {
  const dispatch = vi.fn();
  return {
    dispatch,
    ...render(<RouteMapScreen model={model} dispatch={dispatch} />),
  };
}

describe("RouteMapScreen", () => {
  it("renders four route cards for a depth-1 run with materialized offers", () => {
    renderRouteMap();
    const group = screen.getByRole("radiogroup", { name: "Room route choices" });
    expect(within(group).getAllByRole("radio")).toHaveLength(4);
    expect(
      screen.getByRole("radio", { name: "battle // Glassway" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "elite // Overclock Pit" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "shop // Patchbay" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "recovery // Soft Reset" }),
    ).toBeInTheDocument();
  });

  it("resolves card display names from the catalog by roomType, not from the durable snapshot", () => {
    renderRouteMap();
    const battleCard = screen.getByRole("radio", { name: "battle // Glassway" });
    expect(battleCard).toHaveTextContent("Glassway");
    expect(battleCard).toHaveTextContent(
      "A readable formation with one hazard lane and room currency to bank.",
    );
    expect(battleCard).toHaveTextContent("Control angles before the hazard lane shifts.");
    expect(battleCard).toHaveTextContent("Standard draft and run currency");
  });

  it("auto-dispatches route/materialize on mount when offers are empty", async () => {
    const dispatch = vi.fn();
    render(
      <RouteMapScreen
        model={createModel({ routeOffers: [] })}
        dispatch={dispatch}
      />,
    );
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "route/materialize" }),
    );
  });

  it("does not dispatch route/materialize when offers already exist", () => {
    const dispatch = vi.fn();
    render(
      <RouteMapScreen
        model={createModel({ routeOffers: nonBossOffers() })}
        dispatch={dispatch}
      />,
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "route/materialize" });
  });

  it("dispatches route/select-offer when a card is clicked", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderRouteMap();
    const battleCard = screen.getByRole("radio", { name: "battle // Glassway" });
    await user.click(battleCard);
    const battleOffer = nonBossOffers()[0]!;
    expect(dispatch).toHaveBeenCalledWith({
      type: "route/select-offer",
      offerId: battleOffer.offerId,
    });
  });

  it("disables the commit button without a selection", () => {
    renderRouteMap();
    expect(
      screen.getByRole("button", { name: "Enter selected room" }),
    ).toBeDisabled();
  });

  it("dispatches route/commit when the enter button is clicked with a selection", async () => {
    const user = userEvent.setup();
    const battleOffer = nonBossOffers()[0]!;
    const { dispatch } = renderRouteMap(
      createModel({ selectedOfferId: battleOffer.offerId }),
    );
    const enterButton = screen.getByRole("button", { name: "Enter selected room" });
    expect(enterButton).not.toBeDisabled();
    await user.click(enterButton);
    expect(dispatch).toHaveBeenCalledWith({ type: "route/commit" });
  });

  it("shows the selected room name in the commit bar readout", () => {
    const battleOffer = nonBossOffers()[0]!;
    renderRouteMap(createModel({ selectedOfferId: battleOffer.offerId }));
    expect(screen.getByText("battle // Glassway")).toBeInTheDocument();
  });

  it("renders one boss card for a boss-depth run", () => {
    renderRouteMap(
      createModel({ depth: 3, cycle: 1, routeOffers: bossOffers() }),
    );
    const group = screen.getByRole("radiogroup", { name: "Room route choices" });
    expect(within(group).getAllByRole("radio")).toHaveLength(1);
    expect(
      screen.getByRole("radio", { name: "boss // Mandatory Boss" }),
    ).toBeInTheDocument();
  });

  it("disables all actions when busy", async () => {
    const user = userEvent.setup();
    const battleOffer = nonBossOffers()[0]!;
    const { dispatch } = renderRouteMap(
      createModel({ isBusy: true, selectedOfferId: battleOffer.offerId }),
    );
    expect(screen.getByRole("radio", { name: "battle // Glassway" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Enter selected room" }),
    ).toBeDisabled();
    await user.click(screen.getByRole("radio", { name: "elite // Overclock Pit" }));
    await user.click(
      screen.getByRole("button", { name: "Enter selected room" }),
    );
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does not auto-dispatch materialize while busy", () => {
    const dispatch = vi.fn();
    render(
      <RouteMapScreen
        model={createModel({ routeOffers: [], isBusy: true })}
        dispatch={dispatch}
      />,
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "route/materialize" });
  });

  it("renders save signal feedback from the store", () => {
    renderRouteMap(
      createModel({
        saveSignal: { tone: "saved", message: "Route offers saved at Depth 1." },
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Saved: Route offers saved at Depth 1.",
    );
  });

  it("dispatches return-to-archive from the status bar", async () => {
    const user = userEvent.setup();
    const { dispatch } = renderRouteMap();
    await user.click(screen.getByRole("button", { name: "Return to archive" }));
    expect(dispatch).toHaveBeenCalledWith({ type: "run/return-to-archive" });
  });

  it("shows the boss-in floor count for a non-boss depth", () => {
    renderRouteMap(createModel({ depth: 1, cycle: 1 }));
    expect(screen.getByText("02 floors")).toBeInTheDocument();
  });

  it("shows this floor as boss when at a boss depth", () => {
    renderRouteMap(
      createModel({ depth: 3, cycle: 1, routeOffers: bossOffers() }),
    );
    expect(screen.getByText("This floor")).toBeInTheDocument();
  });
});

describe("RouteMapScreen auto-materialize effect timing", () => {
  it("dispatches materialize on mount when offers are empty", async () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <RouteMapScreen
        model={createModel({ routeOffers: [] })}
        dispatch={dispatch}
      />,
    );
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "route/materialize" }),
    );
    const countAfterMount = dispatch.mock.calls.filter(
      (call) => call[0]?.type === "route/materialize",
    ).length;
    rerender(
      <RouteMapScreen
        model={createModel({ routeOffers: [] })}
        dispatch={dispatch}
      />,
    );
    // Re-rendering with the same props does not reset the retry count; the
    // effect deps haven't changed so no new effect run occurs.
    const countAfterRerender = dispatch.mock.calls.filter(
      (call) => call[0]?.type === "route/materialize",
    ).length;
    expect(countAfterRerender).toBe(countAfterMount);
  });

  it("materializes after offers arrive empty on a re-render if not busy", async () => {
    const dispatch = vi.fn();
    const { rerender } = render(
      <RouteMapScreen
        model={createModel({ routeOffers: nonBossOffers() })}
        dispatch={dispatch}
      />,
    );
    expect(dispatch).not.toHaveBeenCalledWith({ type: "route/materialize" });
    rerender(
      <RouteMapScreen
        model={createModel({ routeOffers: [] })}
        dispatch={dispatch}
      />,
    );
    await waitFor(() =>
      expect(dispatch).toHaveBeenCalledWith({ type: "route/materialize" }),
    );
  });
});