import { useEffect, useId } from "react";
import type { AppCommand } from "../../app/commands";
import type { ContentCatalog } from "../../domain/content/catalog";
import type { RoomDefinition, RoomType } from "../../domain/content/rooms";
import type {
  LivingRun,
  RouteOfferSnapshot,
} from "../../domain/run/model";
import { isBossDepth } from "../../domain/run/routes";
import { AppStatusBar } from "../components/AppStatusBar";
import { IntegrityMeter } from "../components/IntegrityMeter";
import { RouteCard } from "../components/RouteCard";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";

export interface RouteMapScreenViewModel {
  readonly runId: string;
  readonly className: string;
  readonly depth: number;
  readonly cycle: number;
  readonly integrityCurrent: number;
  readonly integrityMaximum: number;
  readonly routeOffers: readonly RouteOfferSnapshot[];
  readonly selectedOfferId: string | null;
  readonly committed: boolean;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
  readonly rooms: ReadonlyMap<RoomType, RoomDefinition>;
}

export interface RouteMapScreenProps {
  readonly model: RouteMapScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

function formatDepth(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return String(safe).padStart(2, "0");
}

function roomsByType(catalog: ContentCatalog): ReadonlyMap<RoomType, RoomDefinition> {
  const map = new Map<RoomType, RoomDefinition>();
  for (const room of catalog.listRooms()) {
    map.set(room.roomType, room);
  }
  return map;
}

function bossesInFloors(depth: number): number {
  const cycleBoundary = Math.ceil(depth / 3) * 3;
  return cycleBoundary - depth;
}

/** Build a route-map view model from validated application state. */
export function createRouteMapScreenModel(
  livingRun: LivingRun,
  className: string,
  catalog: ContentCatalog,
  isBusy: boolean,
  saveSignal: SaveSignalView,
): RouteMapScreenViewModel {
  const routeState = livingRun.routeState;
  return {
    runId: livingRun.runId,
    className,
    depth: livingRun.depth,
    cycle: livingRun.cycle,
    integrityCurrent: livingRun.integrityCurrent,
    integrityMaximum: livingRun.integrityMax,
    routeOffers: routeState?.offers ?? [],
    selectedOfferId: routeState?.selectedOfferId ?? null,
    committed: routeState?.committed ?? false,
    isBusy,
    saveSignal,
    rooms: roomsByType(catalog),
  };
}

/** Route map: compare and commit a route/utility choice from deterministic offers. */
export function RouteMapScreen({ model, dispatch }: RouteMapScreenProps) {
  const idPrefix = useId();
  const routeTitleId = `${idPrefix}-route-title`;
  const selectorTitleId = `${idPrefix}-selector-title`;
  const commitNoteId = `${idPrefix}-commit-note`;
  const noticeId = `${idPrefix}-notice`;

  const offers = model.routeOffers;
  const hasOffers = offers.length > 0;
  const selectedOffer = offers.find(
    (offer) => offer.offerId === model.selectedOfferId,
  );
  const selectedRoom =
    selectedOffer === undefined
      ? null
      : model.rooms.get(selectedOffer.roomType) ?? null;
  const selectedName =
    selectedOffer !== null && selectedOffer !== undefined && selectedRoom !== null
      ? `${selectedRoom.roomType} // ${selectedRoom.displayName}`
      : null;
  const isMutationDisabled = model.isBusy || model.committed;

  // Auto-materialize route offers when none exist yet. The store serializes
  // durable commands; if the preceding start write still holds the durable
  // lock when this effect first runs, the dispatch is silently dropped. The
  // effect retries on a short interval until offers appear, the component
  // becomes busy/committed, or it unmounts.
  useEffect(() => {
    if (hasOffers || model.isBusy || model.committed) {
      return;
    }
    let cancelled = false;
    const attempt = () => {
      if (cancelled) {
        return;
      }
      dispatch({ type: "route/materialize" });
      timer = setTimeout(attempt, 50);
    };
    let timer = setTimeout(attempt, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasOffers, model.isBusy, model.committed, dispatch]);

  const bossIn = bossesInFloors(model.depth);
  const isBossFloor = isBossDepth(model.depth);

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={null}
        activeRun={{ depth: model.depth, className: model.className }}
        isBusy={model.isBusy}
        onReturnToArchive={() => dispatch({ type: "run/return-to-archive" })}
      />

      <main className="route-map" aria-busy={model.isBusy}>
        <header className="route-map__head">
          <p className="signal-eyebrow" data-tone="success">
            Live run · route map
          </p>
          <h1 className="route-map__title">Pick the next pressure point.</h1>
          <p className="route-map__lede">
            Every route spends a different kind of risk. The third-floor boss is
            fixed; the room before it is yours.
          </p>
          <div className="route-map__stats" aria-label="Run status">
            <div className="route-map__stat">
              <span>Integrity</span>
              <strong>
                <IntegrityMeter
                  current={model.integrityCurrent}
                  maximum={model.integrityMaximum}
                />
              </strong>
            </div>
            <div className="route-map__stat">
              <span>Boss in</span>
              <strong>
                {isBossFloor ? "This floor" : `${formatDepth(bossIn)} floor${bossIn === 1 ? "" : "s"}`}
              </strong>
            </div>
            <div className="route-map__stat">
              <span>Cycle</span>
              <strong>{formatDepth(model.cycle)}</strong>
            </div>
          </div>
        </header>

        <section className="path-panel" aria-label="Floor route progress">
          <div className="path-panel__label">
            <span>
              Cycle {formatDepth(model.cycle)} // route state
            </span>
            <strong>Depth {formatDepth(model.depth)} of ∞</strong>
          </div>
          <div className="path-panel__steps">
            <div className="path-step path-step--done">
              <span className="path-node" aria-hidden="true">✓</span>
              <span>Depth {formatDepth(Math.max(1, model.depth - 1))}<br />cleared</span>
            </div>
            <div className="path-step path-step--current">
              <span className="path-node" aria-hidden="true">
                {formatDepth(model.depth)}
              </span>
              <span>Choose<br />room</span>
            </div>
            <div
              className={`path-step${isBossFloor ? " path-step--current" : " path-step--boss"}`}
            >
              <span className="path-node" aria-hidden="true">
                {formatDepth(isBossFloor ? model.depth : model.depth + bossIn)}
              </span>
              <span>{isBossFloor ? "Warden<br />boss" : "Boss<br />floor"}</span>
            </div>
          </div>
        </section>

        <div className="route-map__grid">
          <section
            className="route-panel surface-panel"
            aria-labelledby={routeTitleId}
          >
            <div className="route-panel__head">
              <div>
                <p className="signal-eyebrow">
                  {isBossFloor ? "Boss required" : "Four viable signals"}
                </p>
                <h2 id={routeTitleId}>Choose one room.</h2>
                <p>
                  Values are locked to this run seed. Selecting a card does not
                  enter it.
                </p>
              </div>
              <p className="route-panel__hint">
                seed / locked<br />route lock / open
              </p>
            </div>

            {model.isBusy ? (
              <p id={noticeId} role="status" aria-live="polite">
                Durable action in progress. Actions are disabled until the save
                finishes.
              </p>
            ) : null}
            <SaveSignal signal={model.saveSignal} />

            <div
              className="route-cards"
              role="radiogroup"
              aria-labelledby={selectorTitleId}
              aria-busy={model.isBusy}
            >
              <h3 id={selectorTitleId} className="visually-hidden">
                Room route choices
              </h3>
              {offers.map((offer) => {
                const room = model.rooms.get(offer.roomType);
                if (room === undefined) {
                  return null;
                }
                return (
                  <RouteCard
                    key={offer.offerId}
                    offer={offer}
                    room={room}
                    isSelected={offer.offerId === model.selectedOfferId}
                    isBusy={isMutationDisabled}
                    onSelect={() =>
                      dispatch({
                        type: "route/select-offer",
                        offerId: offer.offerId,
                      })
                    }
                  />
                );
              })}
            </div>

            <div className="commit-bar">
              <div className="commit-bar__readout">
                Selected room:{" "}
                <b>{selectedName ?? "None"}</b>
                <br />
                <span id={commitNoteId}>
                  Committed route is saved before room load.
                </span>
              </div>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => dispatch({ type: "route/commit" })}
                disabled={isMutationDisabled || model.selectedOfferId === null}
                aria-busy={model.isBusy}
                aria-describedby={
                  isMutationDisabled || model.selectedOfferId === null
                    ? `${commitNoteId} ${noticeId}`
                    : commitNoteId
                }
              >
                Enter selected room
              </button>
            </div>
          </section>

          <aside className="route-side-panel" aria-label="Route information">
            <section className="surface-panel route-side-panel__section">
              <p className="signal-eyebrow">Boss lock</p>
              <h2>
                {isBossFloor
                  ? "Warden waits here."
                  : `Warden waits at ${formatDepth(model.depth + bossIn)}.`}
              </h2>
              <p>
                The next boss floor cannot be bypassed. Your current route only
                changes the shape of the build you bring to it.
              </p>
              <p className="route-side-panel__callout">
                <strong>Visible rule:</strong> every third floor resolves to a
                boss encounter. No hidden route tax.
              </p>
            </section>
            <section className="surface-panel route-side-panel__section">
              <p className="signal-eyebrow" data-tone="warning">
                Read the route
              </p>
              <ul className="route-side-panel__signals">
                <li>
                  <span className="route-side-panel__icon" aria-hidden="true">↗</span>
                  <div>
                    <b>Threat</b>
                    <span>Composition and hazards, not just inflated HP.</span>
                  </div>
                </li>
                <li>
                  <span className="route-side-panel__icon" aria-hidden="true">◇</span>
                  <div>
                    <b>Reward</b>
                    <span>Base outcome and trade-off are visible before entry.</span>
                  </div>
                </li>
                <li>
                  <span className="route-side-panel__icon" aria-hidden="true">▣</span>
                  <div>
                    <b>Seed lock</b>
                    <span>Refreshes preserve this exact choice set.</span>
                  </div>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}