import { useId, useState } from "react";
import type { AppCommand } from "../../app/commands";
import type { ContentCatalog } from "../../domain/content/catalog";
import type {
  BuildSnapshot,
  RewardCardSnapshot,
} from "../../domain/run/model";
import { AppStatusBar } from "../components/AppStatusBar";
import { RewardCard } from "../components/RewardCard";
import { SaveSignal } from "../components/SaveSignal";
import type { SaveSignalView } from "../components/SaveSignal";

export interface RewardsScreenViewModel {
  readonly runId: string;
  readonly className: string;
  readonly depth: number;
  readonly cycle: number;
  readonly rewardCards: readonly RewardCardSnapshot[];
  readonly build: BuildSnapshot;
  readonly isBusy: boolean;
  readonly saveSignal: SaveSignalView;
  readonly catalog: ContentCatalog;
}

export interface RewardsScreenProps {
  readonly model: RewardsScreenViewModel;
  readonly dispatch: (command: AppCommand) => void;
}

const MAX_ACTIVE_SKILL_SLOTS = 3;
const MAX_PASSIVE_EQUIPMENT_SLOTS = 4;

function formatDepth(value: number): string {
  const safe = Number.isSafeInteger(value) ? Math.max(0, value) : 0;
  return String(safe).padStart(2, "0");
}

/**
 * Resolve the display name of the item a full build side would displace,
 * mirroring the reducer's replace-earliest rule (`ids[0]`). The applied
 * reward record is never durable, so this preview is computed from the
 * offered draft plus the current build before confirmation.
 */
function displacedRewardName(
  card: RewardCardSnapshot,
  build: BuildSnapshot,
  catalog: ContentCatalog,
): string | null {
  if (card.rewardType === "skill") {
    if (build.activeSkillIds.length < MAX_ACTIVE_SKILL_SLOTS) {
      return null;
    }
    const earliestId = build.activeSkillIds[0];
    if (earliestId === undefined) {
      return null;
    }
    const skillResult = catalog.getSkill(earliestId);
    if (skillResult.ok) {
      return skillResult.value.displayName;
    }
    const equipmentResult = catalog.getEquipment(earliestId);
    return equipmentResult.ok ? equipmentResult.value.displayName : null;
  }

  if (card.rewardType === "equipment") {
    if (build.passiveEquipmentIds.length < MAX_PASSIVE_EQUIPMENT_SLOTS) {
      return null;
    }
    const earliestId = build.passiveEquipmentIds[0];
    if (earliestId === undefined) {
      return null;
    }
    const equipmentResult = catalog.getEquipment(earliestId);
    if (equipmentResult.ok) {
      return equipmentResult.value.displayName;
    }
    const skillResult = catalog.getSkill(earliestId);
    return skillResult.ok ? skillResult.value.displayName : null;
  }

  return null;
}

function resolveBaseReward(
  card: RewardCardSnapshot,
  catalog: ContentCatalog,
): { readonly name: string; readonly description: string } {
  const skillResult = catalog.getSkill(card.baseRewardId);
  if (skillResult.ok) {
    return {
      name: skillResult.value.displayName,
      description: skillResult.value.description,
    };
  }
  const equipmentResult = catalog.getEquipment(card.baseRewardId);
  if (equipmentResult.ok) {
    return {
      name: equipmentResult.value.displayName,
      description: equipmentResult.value.description,
    };
  }
  return { name: card.baseRewardId, description: "Unknown reward." };
}

/**
 * Reward screen: compare three seeded cards and commit exactly one selection.
 * Card clicks only stage the choice locally; `reward/select` applies the
 * reward durably in one command, so it is dispatched by Confirm alone.
 */
export function RewardsScreen({ model, dispatch }: RewardsScreenProps) {
  const idPrefix = useId();
  const [stagedCardId, setStagedCardId] = useState<string | null>(null);
  const draftTitleId = `${idPrefix}-draft-title`;
  const selectorTitleId = `${idPrefix}-selector-title`;
  const confirmNoteId = `${idPrefix}-confirm-note`;
  const noticeId = `${idPrefix}-notice`;

  const stagedCard =
    model.rewardCards.find((card) => card.cardId === stagedCardId) ?? null;
  const stagedBaseName =
    stagedCard === null
      ? null
      : resolveBaseReward(stagedCard, model.catalog).name;
  const stagedDisplacedName =
    stagedCard === null
      ? null
      : displacedRewardName(stagedCard, model.build, model.catalog);

  const capacityActive = Math.min(
    model.build.activeSkillIds.length,
    MAX_ACTIVE_SKILL_SLOTS,
  );
  const capacityPassive = Math.min(
    model.build.passiveEquipmentIds.length,
    MAX_PASSIVE_EQUIPMENT_SLOTS,
  );

  return (
    <div className="app-shell">
      <AppStatusBar
        shards={null}
        activeRun={{ depth: model.depth, className: model.className }}
        isBusy={model.isBusy}
        onReturnToArchive={() => dispatch({ type: "run/return-to-archive" })}
      />

      <main className="reward-screen" aria-busy={model.isBusy}>
        <header className="reward-header">
          <div>
            <p className="signal-eyebrow" data-tone="success">
              Live run · reward draft
            </p>
            <h1 className="reward-header__title">
              Draft the <span className="reward-header__accent">signal.</span>
            </h1>
            <p className="reward-header__lede">
              Three outcomes. One pick. Every effect, enhancement, cost, and
              trade-off is visible before you commit.
            </p>
          </div>
          <div className="reward-lock" data-locked="true">
            Reward locked
            <small>seeded draft / no reroll</small>
          </div>
        </header>

        <section
          className="surface-panel reward-body"
          aria-labelledby={draftTitleId}
        >
          <div className="reward-draft-bar">
            <span id={draftTitleId}>
              Depth {formatDepth(model.depth)} // resolved room{" "}
              <strong>→ choose one</strong>
            </span>
            <span>
              Build capacity{" "}
              <strong className="reward-draft-bar__active">
                {capacityActive} / {MAX_ACTIVE_SKILL_SLOTS} active
              </strong>{" "}
              ·{" "}
              <strong>
                {capacityPassive} / {MAX_PASSIVE_EQUIPMENT_SLOTS} passive
              </strong>
            </span>
            <span className="reward-draft-bar__seed">seeded / no reroll</span>
          </div>

          {model.isBusy ? (
            <p id={noticeId} role="status" aria-live="polite">
              Durable action in progress. Actions are disabled until the save
              finishes.
            </p>
          ) : null}
          <SaveSignal signal={model.saveSignal} />

          <div
            className="reward-cards"
            role="radiogroup"
            aria-labelledby={selectorTitleId}
            aria-busy={model.isBusy}
          >
            <h3 id={selectorTitleId} className="visually-hidden">
              Three reward cards
            </h3>
            {model.rewardCards.map((card) => {
              const base = resolveBaseReward(card, model.catalog);
              const enhancementNames = card.enhancementIds.map(
                (enhancementId) => {
                  const enhancementResult =
                    model.catalog.getEnhancement(enhancementId);
                  return enhancementResult.ok
                    ? enhancementResult.value.displayName
                    : enhancementId;
                },
              );
              const enhancementDescriptions = card.enhancementIds.map(
                (enhancementId) => {
                  const enhancementResult =
                    model.catalog.getEnhancement(enhancementId);
                  return enhancementResult.ok
                    ? enhancementResult.value.description
                    : "Unknown enhancement.";
                },
              );
              return (
                <RewardCard
                  key={card.cardId}
                  card={card}
                  baseRewardName={base.name}
                  baseRewardDescription={base.description}
                  enhancementNames={enhancementNames}
                  enhancementDescriptions={enhancementDescriptions}
                  displacedRewardName={displacedRewardName(
                    card,
                    model.build,
                    model.catalog,
                  )}
                  isSelected={card.cardId === stagedCardId}
                  isBusy={model.isBusy}
                  onSelect={() => setStagedCardId(card.cardId)}
                />
              );
            })}
          </div>

          <div className="reward-confirm-bar">
            <div className="reward-confirm-bar__readout">
              {stagedBaseName === null ? (
                <>No selection yet · the draft remains open</>
              ) : (
                <>
                  Selected: <b>{stagedBaseName}</b>
                  {stagedDisplacedName !== null ? (
                    <>
                      {" "}
                      · replaces <b>{stagedDisplacedName}</b>
                    </>
                  ) : null}
                  <br />
                  <span id={confirmNoteId}>
                    Confirming selects and applies this reward once, then opens
                    the next route.
                  </span>
                </>
              )}
            </div>
            <button
              type="button"
              className="action-button action-button--primary"
              onClick={() =>
                stagedCard !== null
                  ? dispatch({
                      type: "reward/select",
                      cardId: stagedCard.cardId,
                    })
                  : undefined
              }
              disabled={model.isBusy || stagedCard === null}
              aria-busy={model.isBusy}
              aria-describedby={
                model.isBusy || stagedCard === null
                  ? `${confirmNoteId} ${noticeId}`
                  : confirmNoteId
              }
            >
              Confirm draft
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}