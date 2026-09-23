import type { ContentAvailability, ContentId } from "./catalog";

/**
 * How an authored enemy behaves inside the arena. `behaviorParam` is the
 * behavior's step constant, documented per behavior:
 *
 * - `static`: inert target; `behaviorParam` is 0.
 * - `regenerating`: heals one hit point every `behaviorParam` steps while
 *   damaged and not defeated.
 * - `phasing`: intangible to the ball for the first `behaviorParam` steps of
 *   every cycle of length `2 * behaviorParam`, tangible for the rest.
 * - `splintering`: on defeat splits into two 1-HP static children and never
 *   splinters again; `behaviorParam` is 0.
 */
export type EnemyBehavior = "static" | "regenerating" | "phasing" | "splintering";

/**
 * An authored arena enemy as immutable catalog data. `glyph` is a render key
 * only — combat never parses gameplay meaning from it.
 */
export interface EnemyDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly glyph: string;
  readonly baseHealth: 1 | 2 | 3;
  readonly behavior: EnemyBehavior;
  readonly behaviorParam: number;
  readonly availability: ContentAvailability;
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The six authored enemies. Behavior plus health tier create distinct
 * targeting priorities: the three-hit Prism is the marked priority target,
 * Drifters dodge while phased, Menders undo chip damage, and Mitosis punishes
 * careless finishing hits. All are initially available. Order is stable for
 * deterministic enumeration.
 */
export const ENEMY_DEFINITIONS: readonly EnemyDefinition[] = Object.freeze([
  Object.freeze({
    id: asContentId("enemy-sprite-basic"),
    displayName: "Sprite",
    glyph: "↯",
    baseHealth: 1,
    behavior: "static",
    behaviorParam: 0,
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("enemy-sprite-hardlined"),
    displayName: "Hardline",
    glyph: "△",
    baseHealth: 2,
    behavior: "static",
    behaviorParam: 0,
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("enemy-sprite-prism"),
    displayName: "Prism",
    glyph: "⊕",
    baseHealth: 3,
    behavior: "static",
    behaviorParam: 0,
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("enemy-sprite-drifter"),
    displayName: "Drifter",
    glyph: "◈",
    baseHealth: 1,
    behavior: "phasing",
    behaviorParam: 60,
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("enemy-sprite-regen"),
    displayName: "Mender",
    glyph: "↻",
    baseHealth: 2,
    behavior: "regenerating",
    behaviorParam: 240,
    availability: "initial",
  }),
  Object.freeze({
    id: asContentId("enemy-sprite-mitosis"),
    displayName: "Mitosis",
    glyph: "✳",
    baseHealth: 1,
    behavior: "splintering",
    behaviorParam: 0,
    availability: "initial",
  }),
]);