import type { KeyboardEvent } from "react";
import type { RouteOfferSnapshot, RoomType } from "../../domain/run/model";
import type { RoomDefinition } from "../../domain/content/rooms";

export interface RouteCardProps {
  readonly offer: RouteOfferSnapshot;
  readonly room: RoomDefinition;
  readonly isSelected: boolean;
  readonly isBusy: boolean;
  readonly onSelect: () => void;
}

/** Room-type icon glyphs per the route-map mock. */
const ROOM_TYPE_GLYPHS: Readonly<Record<RoomType, string>> = Object.freeze({
  battle: "B",
  elite: "!",
  shop: "$",
  recovery: "+",
  boss: "★",
});

function formatRiskTier(tier: number): string {
  const safe = Number.isSafeInteger(tier) ? Math.min(5, Math.max(0, tier)) : 0;
  return `${String(safe).padStart(2, "0")} / 05`;
}

function threatLabel(room: RoomDefinition): string {
  if (room.roomType === "shop" || room.roomType === "recovery") {
    return "None";
  }
  return room.riskLabel;
}

function rewardText(room: RoomDefinition, offer: RouteOfferSnapshot): string {
  if (room.roomType === "shop") {
    return `3 items // ${String(offer.visibleCost).padStart(3, "0")} min`;
  }
  return room.rewardLabel;
}

function footerLabel(room: RoomDefinition): string {
  switch (room.roomType) {
    case "battle":
      return "recommended";
    case "elite":
      return "high risk";
    case "shop":
      return "utility";
    case "recovery":
      return "stabilize";
    case "boss":
      return "boss required";
  }
}

function moveRadioFocus(event: KeyboardEvent<HTMLButtonElement>): void {
  const direction =
    event.key === "ArrowDown" || event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowUp" || event.key === "ArrowLeft"
        ? -1
        : 0;
  const isBoundaryKey = event.key === "Home" || event.key === "End";
  if (direction === 0 && !isBoundaryKey) {
    return;
  }

  const group = event.currentTarget.closest('[role="radiogroup"]');
  const availableRadios = Array.from(
    group?.querySelectorAll<HTMLButtonElement>(
      'button[role="radio"]:not([aria-disabled="true"]):not(:disabled)',
    ) ?? [],
  );
  const currentIndex = availableRadios.indexOf(event.currentTarget);
  if (currentIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? availableRadios.length - 1
        : (currentIndex + direction + availableRadios.length) %
          availableRadios.length;
  const nextRadio = availableRadios[nextIndex];
  nextRadio?.focus();
  if (nextRadio !== event.currentTarget) {
    nextRadio?.click();
  }
}

/** Accessible single-choice route-offer card resolving display from the catalog. */
export function RouteCard({
  offer,
  room,
  isSelected,
  isBusy,
  onSelect,
}: RouteCardProps) {
  const accessibleName = `${room.roomType} // ${room.displayName}`;
  return (
    <button
      type="button"
      className={`route-card route-card--${room.roomType}${
        isSelected ? " route-card--selected" : ""
      }`}
      role="radio"
      aria-checked={isSelected}
      aria-disabled={isBusy ? "true" : undefined}
      aria-busy={isBusy}
      aria-label={accessibleName}
      disabled={isBusy}
      onClick={onSelect}
      onKeyDown={moveRadioFocus}
    >
      <div className="route-card__top">
        <span className="route-card__icon" aria-hidden="true">
          {ROOM_TYPE_GLYPHS[room.roomType]}
        </span>
        <span className="route-card__type">
          {room.roomType} // {threatLabel(room)}
        </span>
      </div>
      <h3 className="route-card__name">{room.displayName}</h3>
      <p className="route-card__summary">{room.summary}</p>
      <ul className="route-card__list">
        <li>
          <span>Threat</span>
          <b>
            {room.roomType === "shop" || room.roomType === "recovery"
              ? threatLabel(room)
              : formatRiskTier(offer.riskTier)}
          </b>
        </li>
        <li>
          <span>{room.roomType === "shop" ? "Offer" : "Reward"}</span>
          <b>{rewardText(room, offer)}</b>
        </li>
        <li>
          <span>Counterplay</span>
          <b>{room.counterplay}</b>
        </li>
      </ul>
      <div className="route-card__footer">
        <span>{footerLabel(room)}</span>
        <span className="route-card__mark" aria-hidden="true">
          ✓
        </span>
      </div>
    </button>
  );
}