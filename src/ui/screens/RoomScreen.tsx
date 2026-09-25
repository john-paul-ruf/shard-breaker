import type { AppCommand } from "../../app/commands";
import type { ContentId } from "../../domain/content/catalog";
import type { RoomType } from "../../domain/run/model";
import { AppStatusBar } from "../components/AppStatusBar";
import { IntegrityMeter } from "../components/IntegrityMeter";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";

export interface RoomScreenViewModel {
  readonly runId: string;
  readonly className: string;
  readonly depth: number;
  readonly cycle: number;
  readonly roomType: RoomType;
  readonly roomName: string;
  readonly roomSummary: string;
  readonly objectiveNames: readonly string[];
  readonly integrityCurrent: number;
  readonly integrityMaximum: number;
  readonly runCurrency: number;
  readonly shop: {
    readonly items: readonly {
      readonly itemId: ContentId;
      readonly displayName: string;
      readonly price: number;
      readonly isPurchased: boolean;
      readonly isAffordable: boolean;
    }[];
    readonly hasItems: boolean;
  } | null;
  readonly recovery: {
    readonly restoreAmount: number;
    readonly isCommitted: boolean;
  } | null;
  readonly roomStatus: "ready" | "in_progress" | "resolved";
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
}

export interface RoomScreenProps {
  readonly model: RoomScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

const ROOM_TYPE_LABELS: Readonly<Record<RoomType, string>> = Object.freeze({
  battle: "Battle",
  elite: "Elite",
  shop: "Shop",
  recovery: "Recovery",
  boss: "Boss",
});

function formatDepth(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return String(safe).padStart(2, "0");
}

/** Room screen: the committed room's state, utility interactions, and advance action. */
export function RoomScreen({ model, dispatch }: RoomScreenProps) {
  const isRoomResolved = model.roomStatus === "resolved";
  const isMutationDisabled = model.isBusy || isRoomResolved;
  const canResolve = !isMutationDisabled;
  const canBuy =
    !isMutationDisabled && model.shop !== null && model.shop.hasItems;
  const canCommitRecovery =
    !isMutationDisabled &&
    model.recovery !== null &&
    !model.recovery.isCommitted;

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={null}
        activeRun={{ depth: model.depth, className: model.className }}
        isBusy={model.isBusy}
        onReturnToArchive={() => dispatch({ type: "run/return-to-archive" })}
      />

      <main className="room-screen" aria-busy={model.isBusy}>
        <header className="room-header">
          <p className="signal-eyebrow" data-tone="success">
            Live run · room
          </p>
          <h1 className="room-header__title">
            {model.roomName} <span className="room-header__divider">//</span>{" "}
            {ROOM_TYPE_LABELS[model.roomType]}
          </h1>
          <p className="room-header__summary">{model.roomSummary}</p>
          <div className="room-header__stats" aria-label="Run status">
            <div className="room-header__stat">
              <span>Depth</span>
              <strong>{formatDepth(model.depth)}</strong>
            </div>
            <div className="room-header__stat">
              <span>Cycle</span>
              <strong>{formatDepth(model.cycle)}</strong>
            </div>
            <div className="room-header__stat">
              <span>Integrity</span>
              <strong>
                <IntegrityMeter
                  current={model.integrityCurrent}
                  maximum={model.integrityMaximum}
                />
              </strong>
            </div>
            <div className="room-header__stat">
              <span>Room shards</span>
              <strong>{formatDepth(model.runCurrency)}</strong>
            </div>
          </div>
        </header>

        <section className="surface-panel room-body">
          <div className="room-objectives">
            <p className="signal-eyebrow">Room objective</p>
            <ul>
              {model.objectiveNames.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>

          {model.shop !== null ? (
            <div className="room-shop">
              <p className="signal-eyebrow">Finite inventory</p>
              {model.shop.items.map((item) => {
                const buyDisabled = !canBuy || !item.isAffordable;
                return (
                  <div
                    key={item.itemId}
                    className={`shop-item${
                      item.isPurchased ? " shop-item--purchased" : ""
                    }`}
                    data-purchased={item.isPurchased ? "true" : "false"}
                  >
                    <div>
                      <b>{item.displayName}</b>
                      <span>
                        {item.isPurchased
                          ? "Purchased — stocked for this room"
                          : `${item.price} room shards`}
                      </span>
                      {!item.isPurchased && !item.isAffordable ? (
                        <span className="shop-item__reason">
                          Not enough room shards
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className="action-button action-button--quiet"
                      onClick={() =>
                        dispatch({ type: "room/buy-shop-item", itemId: item.itemId })
                      }
                      disabled={buyDisabled}
                      aria-busy={model.isBusy}
                    >
                      {item.isPurchased ? "Purchased ✓" : "Buy"}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : null}

          {model.recovery !== null ? (
            <div className="room-recovery">
              <p className="signal-eyebrow">Recovery offer</p>
              <p>
                Restore {model.recovery.restoreAmount} Integrity, never above the
                run maximum.
              </p>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => dispatch({ type: "room/commit-recovery" })}
                disabled={!canCommitRecovery}
                aria-busy={model.isBusy}
              >
                {model.recovery.isCommitted ? "Recovery committed ✓" : "Commit recovery"}
              </button>
            </div>
          ) : null}

          <SaveSignal signal={model.saveSignal} />

          <div className="room-actions">
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() => dispatch({ type: "room/resolve" })}
              disabled={!canResolve}
              aria-busy={model.isBusy}
            >
              Advance to reward draft
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}