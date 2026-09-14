// @vitest-environment jsdom
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStatusBar } from "./AppStatusBar";
import { ConfirmationDialog } from "./ConfirmationDialog";
import { IntegrityMeter } from "./IntegrityMeter";
import { RouteCard } from "./RouteCard";
import { SaveSignal } from "./SaveSignal";
import type { RoomDefinition } from "../../domain/content/rooms";
import type { RouteOfferSnapshot } from "../../domain/run/model";
import { createContentCatalog } from "../../domain/content/catalog";

// Testing Library does not auto-clean without global test hooks (globals are
// off in this project), so unmount between cases explicitly.
afterEach(cleanup);

describe("AppStatusBar", () => {
  it("names the local Shards readout with grouped, bounded formatting", () => {
    render(<AppStatusBar shards={12048} activeRun={null} isBusy={false} />);
    expect(screen.getByLabelText("12,048 Shards")).toHaveTextContent(
      "Local only · 12,048 Shards",
    );
  });

  it("shows a placeholder rather than a number when Shards are unavailable", () => {
    render(<AppStatusBar shards={null} activeRun={null} isBusy={false} />);
    expect(screen.getByLabelText("Shards unavailable")).toHaveTextContent(
      "Local only · — Shards",
    );
  });

  it("renders active-run context only when a run is live", () => {
    const { rerender } = render(
      <AppStatusBar shards={0} activeRun={null} isBusy={false} />,
    );
    expect(screen.queryByText(/Circuit Rogue/)).not.toBeInTheDocument();

    rerender(
      <AppStatusBar
        shards={0}
        activeRun={{ depth: 2, className: "Circuit Rogue" }}
        isBusy={false}
      />,
    );
    expect(screen.getByText(/Depth 02 · Circuit Rogue/)).toBeInTheDocument();
  });

  it("renders no archive control when no callback is supplied", () => {
    render(<AppStatusBar shards={0} activeRun={null} isBusy={false} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("invokes the archive callback and disables it while busy", async () => {
    const user = userEvent.setup();
    const onReturnToArchive = vi.fn();
    const { rerender } = render(
      <AppStatusBar
        shards={0}
        activeRun={null}
        isBusy={false}
        onReturnToArchive={onReturnToArchive}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Return to archive" }));
    expect(onReturnToArchive).toHaveBeenCalledTimes(1);

    rerender(
      <AppStatusBar
        shards={0}
        activeRun={null}
        isBusy={true}
        onReturnToArchive={onReturnToArchive}
      />,
    );
    expect(screen.getByRole("banner")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "Return to archive" })).toBeDisabled();
  });
});

describe("IntegrityMeter", () => {
  it("renders a full meter with exact text and all pips filled", () => {
    render(<IntegrityMeter current={4} maximum={4} />);
    const meter = screen.getByRole("img", { name: "4 of 4 Integrity" });
    expect(meter).toHaveTextContent("4 / 4");
    expect(meter).toHaveAttribute("data-critical", "false");
    const filled = meter.querySelectorAll('[data-filled="true"]');
    const hollow = meter.querySelectorAll('[data-filled="false"]');
    expect(filled).toHaveLength(4);
    expect(hollow).toHaveLength(0);
  });

  it("renders a partial meter with the right split of filled and hollow pips", () => {
    render(<IntegrityMeter current={2} maximum={4} />);
    const meter = screen.getByRole("img", { name: "2 of 4 Integrity" });
    expect(meter).toHaveTextContent("2 / 4");
    expect(meter).toHaveAttribute("data-critical", "false");
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(2);
    expect(meter.querySelectorAll('[data-filled="false"]')).toHaveLength(2);
  });

  it("marks a single remaining point as critical", () => {
    render(<IntegrityMeter current={1} maximum={4} />);
    const meter = screen.getByRole("img", { name: "1 of 4 Integrity" });
    expect(meter).toHaveAttribute("data-critical", "true");
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(1);
  });

  it("renders an empty meter with no filled pips and is not marked critical", () => {
    render(<IntegrityMeter current={0} maximum={3} />);
    const meter = screen.getByRole("img", { name: "0 of 3 Integrity" });
    expect(meter).toHaveTextContent("0 / 3");
    expect(meter).toHaveAttribute("data-critical", "false");
    expect(meter.querySelectorAll('[data-filled="true"]')).toHaveLength(0);
  });

  it("honors a custom label in the accessible name", () => {
    render(<IntegrityMeter current={3} maximum={3} label="Living run Integrity" />);
    expect(
      screen.getByRole("img", { name: "3 of 3 Living run Integrity" }),
    ).toBeInTheDocument();
  });

  it("clamps malformed input rather than rendering unbounded or out-of-range pips", () => {
    render(<IntegrityMeter current={9999} maximum={Number.POSITIVE_INFINITY} />);
    const meter = screen.getByRole("img", { name: "1 of 1 Integrity" });
    expect(within(meter).getByText("1 / 1")).toBeInTheDocument();
    expect(meter.querySelectorAll(".integrity-meter__pip")).toHaveLength(1);
  });
});

describe("ConfirmationDialog", () => {
  function renderDialog(
    overrides: Partial<React.ComponentProps<typeof ConfirmationDialog>> = {},
  ) {
    const returnFocusRef = { current: document.createElement("button") };
    const props: React.ComponentProps<typeof ConfirmationDialog> = {
      isOpen: true,
      title: "Living run detected",
      description: "Circuit Rogue at Depth 02 is already saved.",
      isBusy: false,
      returnFocusRef,
      onResume: vi.fn(),
      onConfirmAbandon: vi.fn(),
      onCancel: vi.fn(),
      ...overrides,
    };
    return { ...render(<ConfirmationDialog {...props} />), props };
  }

  it("renders nothing while closed", () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens as a labelled modal and initially focuses the reversible action", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Living run detected" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAccessibleDescription(
      "Circuit Rogue at Depth 02 is already saved.",
    );
    expect(
      within(dialog).getByRole("button", { name: "Resume living run" }),
    ).toHaveFocus();
  });

  it("contains forward and reverse tab order inside the dialog", async () => {
    const user = userEvent.setup();
    renderDialog();
    const resume = screen.getByRole("button", { name: "Resume living run" });
    const abandon = screen.getByRole("button", { name: "Abandon & start" });
    const cancel = screen.getByRole("button", { name: "Cancel" });

    await user.tab();
    expect(abandon).toHaveFocus();
    await user.tab();
    expect(cancel).toHaveFocus();
    await user.tab();
    expect(resume).toHaveFocus();
    await user.tab({ shift: true });
    expect(cancel).toHaveFocus();
  });

  it("dispatches all three decisions and supports Escape cancellation", async () => {
    const user = userEvent.setup();
    const onResume = vi.fn();
    const onConfirmAbandon = vi.fn();
    const onCancel = vi.fn();
    renderDialog({ onResume, onConfirmAbandon, onCancel });

    await user.click(screen.getByRole("button", { name: "Resume living run" }));
    await user.click(screen.getByRole("button", { name: "Abandon & start" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onConfirmAbandon).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("cancels from the backdrop but not from dialog content", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const { container } = renderDialog({ onCancel });
    const backdrop = container.querySelector(".confirmation-backdrop");
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error("expected confirmation backdrop");
    }

    await user.click(screen.getByRole("dialog"));
    expect(onCancel).not.toHaveBeenCalled();
    await user.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("blocks repeat decisions and cancellation while busy", async () => {
    const user = userEvent.setup();
    const onConfirmAbandon = vi.fn();
    const onCancel = vi.fn();
    const { container } = renderDialog({
      isBusy: true,
      onConfirmAbandon,
      onCancel,
    });
    const dialog = screen.getByRole("dialog");
    const abandon = screen.getByRole("button", { name: "Abandon & start" });

    expect(dialog).toHaveAttribute("aria-busy", "true");
    expect(dialog).toHaveFocus();
    expect(abandon).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("Action in progress");
    await user.click(abandon);
    fireEvent.keyDown(dialog, { key: "Escape" });
    const backdrop = container.querySelector(".confirmation-backdrop");
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error("expected confirmation backdrop");
    }
    await user.click(backdrop);
    fireEvent.keyDown(dialog, { key: "Tab" });

    expect(onConfirmAbandon).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog).toHaveFocus();
  });

  it("returns focus to the opening trigger after cancellation", async () => {
    function DialogHarness() {
      const [isOpen, setIsOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);

      return (
        <>
          <button ref={triggerRef} type="button" onClick={() => setIsOpen(true)}>
            Start new run
          </button>
          <ConfirmationDialog
            isOpen={isOpen}
            title="Living run detected"
            description="A living run is saved."
            isBusy={false}
            returnFocusRef={triggerRef}
            onResume={() => setIsOpen(false)}
            onConfirmAbandon={() => setIsOpen(false)}
            onCancel={() => setIsOpen(false)}
          />
        </>
      );
    }

    const user = userEvent.setup();
    render(<DialogHarness />);
    const trigger = screen.getByRole("button", { name: "Start new run" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "Resume living run" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(trigger).toHaveFocus();
  });
});

describe("SaveSignal", () => {
  it("renders no live region without a signal", () => {
    render(<SaveSignal signal={null} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["saved", "Checkpoint committed", "Saved: Checkpoint committed"],
    ["warning", "Running from the last valid save", "Warning: Running from the last valid save"],
  ] as const)("announces %s feedback politely", (tone, message, visibleText) => {
    render(<SaveSignal signal={{ tone, message }} />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(visibleText);
    expect(status).toHaveAttribute("data-tone", tone);
  });

  it("announces a rejected durable action urgently with visible failure text", () => {
    render(
      <SaveSignal
        signal={{ tone: "rejected", message: "The living run was not replaced." }}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent(
      "Save rejected: The living run was not replaced.",
    );
    expect(alert).toHaveAttribute("data-tone", "rejected");
  });
});

const componentCatalog = createContentCatalog();

function roomByType(roomType: RoomDefinition["roomType"]): RoomDefinition {
  const room = componentCatalog
    .listRooms()
    .find((definition) => definition.roomType === roomType);
  if (room === undefined) {
    throw new Error(`catalog has no ${roomType} room`);
  }
  return room;
}

function battleRoom(): RoomDefinition {
  return roomByType("battle");
}

function shopRoom(): RoomDefinition {
  return roomByType("shop");
}

function offerForRoom(
  room: RoomDefinition,
  overrides: Partial<RouteOfferSnapshot> = {},
): RouteOfferSnapshot {
  return Object.freeze({
    offerId: `route:content-1:run-1:offer:${room.id}`,
    roomType: room.roomType,
    roomEventKey: `route:content-1:run-1:1:room:${room.id}`,
    riskTier: room.baseRiskTier,
    rewardPreviewId: room.rewardPreviewId,
    visibleCost: room.roomType === "shop" ? 28 : 0,
    availability: "available",
    ...overrides,
  });
}

function battleOffer(): RouteOfferSnapshot {
  return offerForRoom(battleRoom());
}

function shopOffer(): RouteOfferSnapshot {
  return offerForRoom(shopRoom());
}

describe("RouteCard", () => {
  it("renders a radio button with an accessible name resolving the room display name", () => {
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={false}
        isBusy={false}
        onSelect={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio", { name: "battle // Glassway" });
    expect(radio).toHaveAttribute("aria-checked", "false");
    expect(radio).not.toHaveClass("route-card--selected");
    expect(radio).toHaveClass("route-card--battle");
  });

  it("reflects the selected state via aria-checked, a class, and a visible mark", () => {
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={true}
        isBusy={false}
        onSelect={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio", { name: "battle // Glassway" });
    expect(radio).toHaveAttribute("aria-checked", "true");
    expect(radio).toHaveClass("route-card--selected");
  });

  it("disables the radio and sets aria-disabled when busy", () => {
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={false}
        isBusy={true}
        onSelect={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio", { name: "battle // Glassway" });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute("aria-disabled", "true");
  });

  it("invokes onSelect when clicked while not busy", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={false}
        isBusy={false}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole("radio", { name: "battle // Glassway" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("exposes threat, reward, and counterplay display labels from the catalog room", () => {
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={false}
        isBusy={false}
        onSelect={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio", { name: "battle // Glassway" });
    expect(radio).toHaveTextContent("Glassway");
    expect(radio).toHaveTextContent("Control angles before the hazard lane shifts.");
    expect(radio).toHaveTextContent("Standard draft and run currency");
    expect(radio).toHaveTextContent("Low variance");
  });

  it("formats the offer risk tier as a 0X / 05 token for combat rooms", () => {
    render(
      <RouteCard
        offer={battleOffer()}
        room={battleRoom()}
        isSelected={false}
        isBusy={false}
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "battle // Glassway" }),
    ).toHaveTextContent("02 / 05");
  });

  it("shows no threat token and an offer readout for shop rooms", () => {
    render(
      <RouteCard
        offer={shopOffer()}
        room={shopRoom()}
        isSelected={false}
        isBusy={false}
        onSelect={vi.fn()}
      />,
    );
    const radio = screen.getByRole("radio", { name: "shop // Patchbay" });
    expect(radio).toHaveTextContent("None");
    expect(radio).toHaveTextContent("3 items // 028 min");
  });
});
