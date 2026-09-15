import type { ContentId } from "./catalog";

/** Which reward card types an enhancement modifier may attach to. */
export type CompatibleRewardType = "skill" | "equipment" | "any";

/**
 * An enhancement modifier as authored, immutable catalog data. Enhancements
 * roll onto reward cards and apply to the granted skill or equipment;
 * `minDepth` gates how deep a run must be before the modifier can appear.
 */
export interface EnhancementDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly description: string;
  readonly compatibleRewardType: CompatibleRewardType;
  readonly minDepth: number;
  readonly effectKey: string;
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The fourteen authored enhancement modifiers. Effect keys are unique so each
 * rolled param can be keyed by its enhancement without ambiguity. Order is
 * stable for deterministic enumeration.
 */
export const ENHANCEMENT_DEFINITIONS: readonly EnhancementDefinition[] =
  Object.freeze([
    Object.freeze({
      id: asContentId("enhancement-overclocked"),
      displayName: "Overclocked",
      description: "Adds one extra activation to the granted skill.",
      compatibleRewardType: "skill",
      minDepth: 1,
      effectKey: "bonus-charges",
    }),
    Object.freeze({
      id: asContentId("enhancement-charged"),
      displayName: "Charged",
      description: "The granted item arrives already primed for the floor.",
      compatibleRewardType: "any",
      minDepth: 1,
      effectKey: "primed",
    }),
    Object.freeze({
      id: asContentId("enhancement-patient"),
      displayName: "Patient",
      description: "Banked charges persist across one additional room.",
      compatibleRewardType: "skill",
      minDepth: 2,
      effectKey: "charge-persistence",
    }),
    Object.freeze({
      id: asContentId("enhancement-sharp"),
      displayName: "Sharp",
      description: "Impacts from the granted item pierce one extra layer.",
      compatibleRewardType: "any",
      minDepth: 2,
      effectKey: "pierce",
    }),
    Object.freeze({
      id: asContentId("enhancement-reinforced"),
      displayName: "Reinforced",
      description: "The granted item cannot be degraded by hazards.",
      compatibleRewardType: "equipment",
      minDepth: 2,
      effectKey: "hazard-shield",
    }),
    Object.freeze({
      id: asContentId("enhancement-swift"),
      displayName: "Swift",
      description: "Cooldowns on the granted item tick one step faster.",
      compatibleRewardType: "any",
      minDepth: 2,
      effectKey: "haste",
    }),
    Object.freeze({
      id: asContentId("enhancement-echoing"),
      displayName: "Echoing",
      description: "The granted skill's final effect replays once.",
      compatibleRewardType: "skill",
      minDepth: 3,
      effectKey: "echo",
    }),
    Object.freeze({
      id: asContentId("enhancement-stable"),
      displayName: "Stable",
      description: "Rebound angles from the granted item stay predictable.",
      compatibleRewardType: "equipment",
      minDepth: 1,
      effectKey: "stability",
    }),
    Object.freeze({
      id: asContentId("enhancement-piercing"),
      displayName: "Piercing",
      description: "Impacts carry their force one rebound further.",
      compatibleRewardType: "any",
      minDepth: 3,
      effectKey: "momentum",
    }),
    Object.freeze({
      id: asContentId("enhancement-resilient"),
      displayName: "Resilient",
      description: "The granted item recovers its charge one step sooner.",
      compatibleRewardType: "any",
      minDepth: 3,
      effectKey: "quick-recharge",
    }),
    Object.freeze({
      id: asContentId("enhancement-amplified"),
      displayName: "Amplified",
      description: "Effect magnitudes from the granted item scale upward.",
      compatibleRewardType: "any",
      minDepth: 3,
      effectKey: "amplitude",
    }),
    Object.freeze({
      id: asContentId("enhancement-focused"),
      displayName: "Focused",
      description: "Narrows the granted skill's spread for tighter shots.",
      compatibleRewardType: "skill",
      minDepth: 2,
      effectKey: "focus",
    }),
    Object.freeze({
      id: asContentId("enhancement-thorough"),
      displayName: "Thorough",
      description: "Clears leave one fewer straggler brick behind.",
      compatibleRewardType: "any",
      minDepth: 2,
      effectKey: "cleanup",
    }),
    Object.freeze({
      id: asContentId("enhancement-anchored"),
      displayName: "Anchored",
      description: "The granted equipment's effect cannot be suppressed.",
      compatibleRewardType: "equipment",
      minDepth: 3,
      effectKey: "anchor",
    }),
  ]);