// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppStatusBar } from "./AppStatusBar";
import { IntegrityMeter } from "./IntegrityMeter";

// Testing Library does not auto-clean without global test hooks (globals are
// off in this project), so unmount between cases explicitly.
afterEach(cleanup);

describe("AppStatusBar", () => {
  it("names the local Shards readout with grouped, bounded formatting", () => {
    render(<AppStatusBar shards={1248} activeRun={null} isBusy={false} />);
    expect(screen.getByLabelText("1,248 Shards")).toHaveTextContent("1,248 Shards");
  });

  it("shows a placeholder rather than a number when Shards are unavailable", () => {
    render(<AppStatusBar shards={null} activeRun={null} isBusy={false} />);
    expect(screen.getByLabelText("Shards unavailable")).toHaveTextContent("— Shards");
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
