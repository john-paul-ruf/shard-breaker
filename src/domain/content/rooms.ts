import type { ContentId } from "./catalog";

export type RoomType = "battle" | "elite" | "shop" | "recovery" | "boss";

export interface RoomDefinition {
  readonly id: ContentId;
  readonly roomType: RoomType;
  readonly displayName: string;
  readonly summary: string;
  readonly riskLabel: string;
  readonly rewardLabel: string;
  readonly counterplay: string;
  readonly baseRiskTier: number;
  readonly formationId: ContentId;
  readonly objectiveIds: readonly ContentId[];
  readonly hazardPoolIds: readonly ContentId[];
  readonly rewardPreviewId: ContentId | null;
}

export type RouteSupportKind =
  | "formation"
  | "objective"
  | "hazard"
  | "reward-preview";

export interface RouteSupportDefinition {
  readonly id: ContentId;
  readonly kind: RouteSupportKind;
  readonly displayName: string;
  readonly summary: string;
}

export type ShopServiceEffect = {
  readonly kind: "restore-integrity";
  readonly amount: 1 | 2;
};

export interface ShopServiceDefinition {
  readonly id: ContentId;
  readonly displayName: string;
  readonly description: string;
  readonly basePrice: number;
  readonly effect: ShopServiceEffect;
}

export const RECOVERY_RESTORE_AMOUNT = 1 as const;

const asContentId = (value: string): ContentId => value as ContentId;
const ids = (...values: string[]): readonly ContentId[] =>
  Object.freeze(values.map(asContentId));

export const ROUTE_SUPPORT_DEFINITIONS: readonly RouteSupportDefinition[] =
  Object.freeze([
    Object.freeze({
      id: asContentId("formation-glassway-columns"),
      kind: "formation",
      displayName: "Glassway Columns",
      summary: "Readable lanes reward deliberate bank shots.",
    }),
    Object.freeze({
      id: asContentId("formation-overclock-grid"),
      kind: "formation",
      displayName: "Overclock Grid",
      summary: "A dense grid compresses safe rebound angles.",
    }),
    Object.freeze({
      id: asContentId("formation-utility-clear"),
      kind: "formation",
      displayName: "Utility Bay",
      summary: "A non-combat bay reserved for a visible utility decision.",
    }),
    Object.freeze({
      id: asContentId("formation-boss-arena"),
      kind: "formation",
      displayName: "Boss Arena",
      summary: "The mandatory arena reserved for a routed boss identity.",
    }),
    Object.freeze({
      id: asContentId("objective-clear-glassway"),
      kind: "objective",
      displayName: "Clear the Glassway",
      summary: "Break the required formation targets.",
    }),
    Object.freeze({
      id: asContentId("objective-clear-overclock-pit"),
      kind: "objective",
      displayName: "Clear the Overclock Pit",
      summary: "Break the dense elite formation targets.",
    }),
    Object.freeze({
      id: asContentId("objective-visit-patchbay"),
      kind: "objective",
      displayName: "Visit the Patchbay",
      summary: "Inspect the finite inventory, then buy or leave.",
    }),
    Object.freeze({
      id: asContentId("objective-commit-soft-reset"),
      kind: "objective",
      displayName: "Commit the Soft Reset",
      summary: "Apply or decline the single bounded recovery.",
    }),
    Object.freeze({
      id: asContentId("objective-defeat-routed-boss"),
      kind: "objective",
      displayName: "Defeat the Routed Boss",
      summary: "Resolve the mandatory boss identity for this floor.",
    }),
    Object.freeze({
      id: asContentId("hazard-shift-lane"),
      kind: "hazard",
      displayName: "Shift Lane",
      summary: "A telegraphed lane changes the preferred rebound path.",
    }),
    Object.freeze({
      id: asContentId("hazard-overclock-pulse"),
      kind: "hazard",
      displayName: "Overclock Pulse",
      summary: "A timed pulse sharpens the elite room's positioning test.",
    }),
    Object.freeze({
      id: asContentId("reward-preview-standard-draft"),
      kind: "reward-preview",
      displayName: "Standard Draft",
      summary: "A visible seeded reward draft follows room completion.",
    }),
    Object.freeze({
      id: asContentId("reward-preview-elite-draft"),
      kind: "reward-preview",
      displayName: "Elite Draft",
      summary: "A higher-value visible draft follows the elite room.",
    }),
    Object.freeze({
      id: asContentId("reward-preview-repair-services"),
      kind: "reward-preview",
      displayName: "Repair Services",
      summary: "Finite run-currency repair services are shown before purchase.",
    }),
    Object.freeze({
      id: asContentId("reward-preview-soft-reset"),
      kind: "reward-preview",
      displayName: "One Integrity",
      summary: "Restore exactly one Integrity without exceeding the run maximum.",
    }),
    Object.freeze({
      id: asContentId("reward-preview-boss-draft"),
      kind: "reward-preview",
      displayName: "Boss Draft",
      summary: "A visible seeded boss reward draft follows victory.",
    }),
  ]);

export const SHOP_SERVICE_DEFINITIONS: readonly ShopServiceDefinition[] =
  Object.freeze([
    Object.freeze({
      id: asContentId("shop-service-integrity-patch"),
      displayName: "Integrity Patch",
      description: "Restore 1 Integrity, never above the run maximum.",
      basePrice: 20,
      effect: Object.freeze({ kind: "restore-integrity", amount: 1 }),
    }),
    Object.freeze({
      id: asContentId("shop-service-integrity-overhaul"),
      displayName: "Integrity Overhaul",
      description: "Restore 2 Integrity, never above the run maximum.",
      basePrice: 36,
      effect: Object.freeze({ kind: "restore-integrity", amount: 2 }),
    }),
  ]);

export const ROOM_DEFINITIONS: readonly RoomDefinition[] = Object.freeze([
  Object.freeze({
    id: asContentId("room-battle-glassway"),
    roomType: "battle",
    displayName: "Glassway",
    summary:
      "A readable formation with one hazard lane and room currency to bank.",
    riskLabel: "Low variance",
    rewardLabel: "Standard draft and run currency",
    counterplay: "Control angles before the hazard lane shifts.",
    baseRiskTier: 2,
    formationId: asContentId("formation-glassway-columns"),
    objectiveIds: ids("objective-clear-glassway"),
    hazardPoolIds: ids("hazard-shift-lane"),
    rewardPreviewId: asContentId("reward-preview-standard-draft"),
  }),
  Object.freeze({
    id: asContentId("room-elite-overclock-pit"),
    roomType: "elite",
    displayName: "Overclock Pit",
    summary:
      "A dense formation with sharper hazard timing and a stronger draft.",
    riskLabel: "High variance",
    rewardLabel: "Elite draft",
    counterplay: "Preserve skill charges for compressed hazard timing.",
    baseRiskTier: 4,
    formationId: asContentId("formation-overclock-grid"),
    objectiveIds: ids("objective-clear-overclock-pit"),
    hazardPoolIds: ids("hazard-overclock-pulse", "hazard-shift-lane"),
    rewardPreviewId: asContentId("reward-preview-elite-draft"),
  }),
  Object.freeze({
    id: asContentId("room-shop-patchbay"),
    roomType: "shop",
    displayName: "Patchbay",
    summary:
      "A finite run-only inventory whose stock and prices are fixed on entry.",
    riskLabel: "No combat threat",
    rewardLabel: "Bounded Integrity services",
    counterplay: "Spend run currency without sacrificing later route options.",
    baseRiskTier: 0,
    formationId: asContentId("formation-utility-clear"),
    objectiveIds: ids("objective-visit-patchbay"),
    hazardPoolIds: ids(),
    rewardPreviewId: asContentId("reward-preview-repair-services"),
  }),
  Object.freeze({
    id: asContentId("room-recovery-soft-reset"),
    roomType: "recovery",
    displayName: "Soft Reset",
    summary: "Restore 1 Integrity once, never above the run maximum.",
    riskLabel: "No combat threat",
    rewardLabel: "+1 Integrity once",
    counterplay: "Enter safely even when recovery would have no effect.",
    baseRiskTier: 0,
    formationId: asContentId("formation-utility-clear"),
    objectiveIds: ids("objective-commit-soft-reset"),
    hazardPoolIds: ids(),
    rewardPreviewId: asContentId("reward-preview-soft-reset"),
  }),
  Object.freeze({
    id: asContentId("room-boss-mandatory"),
    roomType: "boss",
    displayName: "Mandatory Boss",
    summary: "The required encounter at every positive multiple of three.",
    riskLabel: "Boss required",
    rewardLabel: "Boss draft",
    counterplay: "Read the routed boss identity before entering the arena.",
    baseRiskTier: 5,
    formationId: asContentId("formation-boss-arena"),
    objectiveIds: ids("objective-defeat-routed-boss"),
    hazardPoolIds: ids(),
    rewardPreviewId: asContentId("reward-preview-boss-draft"),
  }),
]);
