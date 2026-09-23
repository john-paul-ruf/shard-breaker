import type { KeyboardEvent } from "react";
import type { RewardCardSnapshot } from "../../domain/run/model";

export interface RewardCardProps {
  readonly card: RewardCardSnapshot;
  readonly baseRewardName: string;
  readonly baseRewardDescription: string;
  readonly enhancementNames: readonly string[];
  readonly enhancementDescriptions: readonly string[];
  readonly displacedRewardName: string | null;
  readonly isSelected: boolean;
  readonly isBusy: boolean;
  readonly onSelect: () => void;
}

const REWARD_TYPE_GLYPHS: Readonly<
  Record<RewardCardSnapshot["rewardType"], string>
> = Object.freeze({
  skill: "◇",
  equipment: "+",
  upgrade: "↯",
  currency: "⌁",
  relic: "★",
});

function baseRewardLabel(rewardType: RewardCardSnapshot["rewardType"]): string {
  switch (rewardType) {
    case "skill":
      return "Base reward // active skill";
    case "equipment":
      return "Base reward // passive equipment";
    default:
      return `Base reward // ${rewardType}`;
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

/** Accessible single-choice reward card rendering caller-resolved display fields. */
export function RewardCard({
  card,
  baseRewardName,
  baseRewardDescription,
  enhancementNames,
  enhancementDescriptions,
  displacedRewardName,
  isSelected,
  isBusy,
  onSelect,
}: RewardCardProps) {
  const accessibleName = `${card.rewardType} // ${baseRewardName}`;
  const enhancementCount = Math.min(
    enhancementNames.length,
    enhancementDescriptions.length,
  );

  return (
    <button
      type="button"
      className={`reward-card reward-card--${card.rewardType}${
        isSelected ? " reward-card--selected" : ""
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
      <div className="reward-card__top">
        <span className="reward-card__type">{card.rewardType} reward</span>
        <span className="reward-card__glyph" aria-hidden="true">
          {REWARD_TYPE_GLYPHS[card.rewardType]}
        </span>
      </div>
      <h3 className="reward-card__name">{baseRewardName}</h3>
      <p className="reward-card__base">{baseRewardLabel(card.rewardType)}</p>
      <p className="reward-card__effect">
        <b>Effect:</b> {baseRewardDescription}
      </p>
      {enhancementNames.slice(0, enhancementCount).map((name, index) => (
        <div
          key={`${card.cardId}:enhancement:${name}`}
          className="reward-card__enhancement"
        >
          <span>Enhancement / {name}</span>
          <strong>{enhancementDescriptions[index]}</strong>
        </div>
      ))}
      <p className="reward-card__cost">
        Run cost <b>{card.materialCost} room shards</b>
      </p>
      {displacedRewardName !== null ? (
        <p className="reward-card__replacement">
          REPLACES <b>{displacedRewardName}</b> · swap shown before commit
        </p>
      ) : null}
      <p className="reward-card__tradeoff">
        Trade-off{" "}
        <b>{card.tradeoffId === null ? "No trade-off" : card.tradeoffId}</b>
      </p>
      <div className="reward-card__select">
        <span>{isSelected ? "Selected" : "Choose card"}</span>
        <span className="reward-card__check" aria-hidden="true">
          ✓
        </span>
      </div>
    </button>
  );
}