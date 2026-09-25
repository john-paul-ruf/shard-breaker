import type { ContentId } from "../content/catalog";
import type { RunState, RunSummarySnapshot } from "./model";

/** Serializable loss/clear report the bridge sends; no frame data crosses. */
export interface CombatOutcomeMessage {
  readonly outcomeId: string;
  readonly kind: "loss_of_ball" | "clear";
}

/**
 * Serializable lifecycle command. Callers supply every nondeterministic input
 * (run ID, seed, clock, commit ID, expected revisions) so the reducer stays
 * pure and deterministic.
 */
export type RunCommand =
  | {
      readonly type: "StartRun";
      readonly classId: ContentId;
      readonly runId: string;
      readonly seed: string;
      readonly now: number;
      readonly commitId: string;
      readonly expectedProfileRevision: number;
    }
  | {
      readonly type: "AbandonRun";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly commitId: string;
    }
  | {
      readonly type: "MaterializeRoute";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "SelectRouteOffer";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly offerId: string;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "CommitRoute";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "BuyShopItem";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly itemId: string;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "CommitRecovery";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "LaunchBall";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly aimAngle: number;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "UseSkill";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly skillId: ContentId;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "ReportCombatOutcome";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly outcome: CombatOutcomeMessage;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "ResolveRoom";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly commitId: string;
      readonly now: number;
    }
  | {
      readonly type: "SelectReward";
      readonly runId: string;
      readonly expectedRevision: number;
      readonly cardId: string;
      readonly commitId: string;
      readonly now: number;
    };

/** Room types a room-scoped rejection can name. */
export type RoomTypeForRejection = "battle" | "elite" | "shop" | "recovery" | "boss";

/** Typed, discriminated reasons a lifecycle command is rejected. */
export type RunRejection =
  | { readonly code: "living-run-exists"; readonly runId: string }
  | { readonly code: "no-living-run" }
  | { readonly code: "unknown-class"; readonly classId: ContentId }
  | { readonly code: "class-locked"; readonly classId: ContentId }
  | { readonly code: "stale-profile-revision"; readonly expected: number; readonly actual: number }
  | { readonly code: "stale-run"; readonly expected: string; readonly actual: string }
  | { readonly code: "stale-run-revision"; readonly expected: number; readonly actual: number }
  | { readonly code: "invalid-metadata"; readonly field: string }
  | { readonly code: "invalid-state"; readonly issues: readonly string[] }
  | { readonly code: "route-already-materialized"; readonly runId: string }
  | { readonly code: "route-not-materialized"; readonly runId: string }
  | { readonly code: "route-already-committed"; readonly runId: string }
  | { readonly code: "unknown-route-offer"; readonly offerId: string }
  | { readonly code: "route-selection-missing"; readonly runId: string }
  | { readonly code: "shop-item-already-purchased"; readonly itemId: ContentId }
  | { readonly code: "insufficient-currency"; readonly required: number; readonly available: number }
  | { readonly code: "unknown-shop-item"; readonly itemId: ContentId }
  | { readonly code: "room-not-shop-type"; readonly roomType: RoomTypeForRejection }
  | { readonly code: "room-not-recovery-type"; readonly roomType: RoomTypeForRejection }
  | { readonly code: "room-already-resolved"; readonly roomId: string }
  | { readonly code: "recovery-already-committed"; readonly roomId: string }
  | { readonly code: "combat-not-implemented"; readonly roomType: RoomTypeForRejection }
  | { readonly code: "unknown-skill"; readonly skillId: ContentId }
  | { readonly code: "skill-not-in-build"; readonly skillId: ContentId }
  | { readonly code: "skill-no-charges"; readonly skillId: ContentId }
  | { readonly code: "combat-checkpoint-missing"; readonly roomId: string }
  | { readonly code: "invalid-aim-angle" }
  | { readonly code: "unknown-outcome-id"; readonly outcomeId: string }
  | { readonly code: "duplicate-outcome-id"; readonly outcomeId: string }
  | { readonly code: "reward-already-selected"; readonly status: "selected" | "applied" }
  | { readonly code: "unknown-reward-card"; readonly cardId: string };

/**
 * Durable write intent emitted alongside a successful transition so adapters
 * never infer what to persist. Each instruction carries the idempotency
 * identity the persistence layer checks before committing.
 */
export type RunPersistenceInstruction =
  | {
      readonly kind: "start-run";
      readonly runId: string;
      readonly commitId: string;
      readonly expectedProfileRevision: number;
    }
  | {
      readonly kind: "abandon-run";
      readonly runId: string;
      readonly commitId: string;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: "save-checkpoint";
      readonly runId: string;
      readonly commitId: string;
      readonly expectedRevision: number;
    }
  | {
      readonly kind: "finalize-death";
      readonly runId: string;
      readonly commitId: string;
      readonly expectedRevision: number;
      /** The terminal summary the repository records in one transaction. */
      readonly summary: RunSummarySnapshot;
    };

export type RunTransition =
  | {
      readonly ok: true;
      readonly state: RunState;
      readonly persistence: RunPersistenceInstruction;
    }
  | {
      readonly ok: false;
      readonly state: RunState;
      readonly error: RunRejection;
    };