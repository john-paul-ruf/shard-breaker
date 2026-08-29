import type { ContentAvailability, ContentId } from "./catalog";

/**
 * A playable class as authored, immutable catalog data. `startingIntegrity` is
 * the only survivability value a run copies at creation; `availability` gates
 * whether a fresh profile may start with the class.
 */
export interface ClassDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly startingIntegrity: 2 | 3 | 4;
  readonly tradeoff: string;
  readonly availability: ContentAvailability;
}

/**
 * The three authored classes. Circuit Rogue and Glitch Knight are initially
 * available; Neon Mage is defined and visible to presentation but locked, so
 * only the two available IDs may seed a fresh profile's unlocks. Order is
 * stable for deterministic enumeration.
 */
export const CLASS_DEFINITIONS: readonly ClassDefinition[] = Object.freeze([
  {
    id: "class-circuit-rogue" as ContentId,
    displayName: "Circuit Rogue",
    startingIntegrity: 3,
    tradeoff: "Fast charge; fragile routing margin",
    availability: "initial",
  },
  {
    id: "class-glitch-knight" as ContentId,
    displayName: "Glitch Knight",
    startingIntegrity: 4,
    tradeoff: "Stable rebounds; slower pivot",
    availability: "initial",
  },
  {
    id: "class-neon-mage" as ContentId,
    displayName: "Neon Mage",
    startingIntegrity: 2,
    tradeoff: "Greater skill reach; lowest margin",
    availability: "locked",
  },
]);
