import type { ContentAvailability, ContentId } from "./catalog";

/**
 * An active skill as authored, immutable catalog data. `maxCharges` bounds the
 * room-scoped uses refreshed each depth; `effectKey` is the closed identifier
 * the future combat engine resolves — consumers never parse meaning from IDs.
 */
export interface SkillDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly description: string;
  readonly maxCharges: number;
  readonly effectKey: string;
  readonly availability: ContentAvailability;
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The eight authored skills. All are initially available; charges are spent
 * inside a room and never carry over. Order is stable for deterministic
 * enumeration.
 */
export const SKILL_DEFINITIONS: readonly SkillDefinition[] = Object.freeze([
  Object.freeze({
    id: asContentId("skill-phase-shunt"),
    displayName: "Phase Shunt",
    description: "Pass the ball through the first wall it touches this volley.",
    maxCharges: 2,
    effectKey: "phase-shunt",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-prism-burst"),
    displayName: "Prism Burst",
    description: "Split the ball into three short-lived refracted copies.",
    maxCharges: 2,
    effectKey: "prism-burst",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-rebound-lens"),
    displayName: "Rebound Lens",
    description: "Widen the next paddle bounce into a sharper return angle.",
    maxCharges: 2,
    effectKey: "rebound-lens",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-null-thread"),
    displayName: "Null Thread",
    description: "Sew a safe lane that hazards cannot shift this room.",
    maxCharges: 1,
    effectKey: "null-thread",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-shield-bash"),
    displayName: "Shield Bash",
    description: "Strike the next blocked brick with doubled impact force.",
    maxCharges: 2,
    effectKey: "shield-bash",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-overclock"),
    displayName: "Overclock",
    description: "Speed the ball up for one volley at the cost of control.",
    maxCharges: 1,
    effectKey: "overclock",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-specter-step"),
    displayName: "Specter Step",
    description: "Phase the paddle through one incoming hazard telegraph.",
    maxCharges: 1,
    effectKey: "specter-step",
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("skill-cascade"),
    displayName: "Cascade",
    description: "Chain one extra rebound before the volley resolves.",
    maxCharges: 2,
    effectKey: "cascade",
    availability: "initial",
  }),
]);