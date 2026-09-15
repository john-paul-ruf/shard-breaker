import type { ContentAvailability, ContentId } from "./catalog";

/**
 * A passive equipment item as authored, immutable catalog data. Equipment
 * occupies the run's passive slots for its whole duration; `effectKey` is the
 * closed identifier the future combat engine resolves.
 */
export interface EquipmentDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly description: string;
  readonly effectKey: string;
  readonly availability: ContentAvailability;
}

const asContentId = (value: string): ContentId => value as ContentId;

/**
 * The eight authored equipment items. All are initially available passive
 * run-carry items. Order is stable for deterministic enumeration.
 */
export const EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] =
  Object.freeze([
    Object.freeze({
      id: asContentId("equipment-fractal-core"),
      displayName: "Fractal Core",
      description: "Each wall hit banks a small shard of bonus currency.",
      effectKey: "fractal-core",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-arc-coil"),
      displayName: "Arc Coil",
      description: "Arcs a chain spark between two adjacent bricks per volley.",
      effectKey: "arc-coil",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-soft-patch"),
      description: "Softens one hazard step of movement each room.",
      displayName: "Soft Patch",
      effectKey: "soft-patch",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-static-ward"),
      displayName: "Static Ward",
      description: "Absorbs the first telegraph hit taken each room.",
      effectKey: "static-ward",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-mirror-plating"),
      displayName: "Mirror Plating",
      description: "Returns one hazard pulse to its source lane per room.",
      effectKey: "mirror-plating",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-power-cell"),
      displayName: "Power Cell",
      description: "Grants one extra skill charge slot every other depth.",
      effectKey: "power-cell",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-echo-chip"),
      displayName: "Echo Chip",
      description: "Replays the final brick impact of each volley once.",
      effectKey: "echo-chip",
      availability: "initial",
    }),
    Object.freeze({
      id: asContentId("equipment-hard-light"),
      displayName: "Hard Light",
      description: "Extends the paddle edge by one lane while charged.",
      effectKey: "hard-light",
      availability: "initial",
    }),
  ]);