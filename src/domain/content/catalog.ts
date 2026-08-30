import type { BossRoutingIdentity } from "./bosses";
import { BOSS_ROUTING_IDENTITIES } from "./bosses";
import type { ClassDefinition } from "./classes";
import { CLASS_DEFINITIONS } from "./classes";
import type {
  RoomDefinition,
  RouteSupportDefinition,
  RouteSupportKind,
  ShopServiceDefinition,
} from "./rooms";
import {
  RECOVERY_RESTORE_AMOUNT,
  ROOM_DEFINITIONS,
  ROUTE_SUPPORT_DEFINITIONS,
  SHOP_SERVICE_DEFINITIONS,
} from "./rooms";

declare const contentBrand: unique symbol;

/**
 * Opaque, category-prefixed catalog identifier. Consumers compare and look IDs
 * up; they never parse gameplay meaning from the string contents.
 */
export type ContentId = string & { readonly [contentBrand]: "ContentId" };

/**
 * Bundled catalog version. Distinct in type and value from the IndexedDB
 * version and the save schema version so a deployment cannot silently
 * reinterpret committed IDs.
 */
export type ContentVersion = string & { readonly [contentBrand]: "ContentVersion" };

/** Whether authored content is available on a fresh profile or starts locked. */
export type ContentAvailability = "initial" | "locked";

/** The single, stable version string for the bundled content in this release. */
export const CONTENT_VERSION = "content-1" as ContentVersion;

/**
 * Total lookup outcome: an explicit success value or a typed failure carrying
 * the offending ID, never `undefined` or a thrown error for an unknown ID.
 */
export type ContentLookupResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly code: "unknown-content-id";
      readonly contentId: ContentId;
    };

/**
 * Immutable facade over the authored catalog. It exposes stable enumeration,
 * total lookup, known-ID checks, and the initial unlock projection without
 * standing up a runtime content service.
 */
export interface ContentCatalog {
  readonly contentVersion: ContentVersion;
  listClasses(): readonly ClassDefinition[];
  getClass(id: ContentId): ContentLookupResult<ClassDefinition>;
  hasClass(id: ContentId): boolean;
  initialClassUnlockIds(): readonly ContentId[];
  listRooms(): readonly RoomDefinition[];
  getRoom(id: ContentId): ContentLookupResult<RoomDefinition>;
  listShopServices(): readonly ShopServiceDefinition[];
  getShopService(id: ContentId): ContentLookupResult<ShopServiceDefinition>;
  listBosses(): readonly BossRoutingIdentity[];
  getBoss(id: ContentId): ContentLookupResult<BossRoutingIdentity>;
  hasContent(id: ContentId): boolean;
}

function lookup<T>(
  definitionsById: ReadonlyMap<ContentId, T>,
  id: ContentId,
): ContentLookupResult<T> {
  const value = definitionsById.get(id);
  return value === undefined
    ? { ok: false, code: "unknown-content-id", contentId: id }
    : { ok: true, value };
}

function registerKnownId(
  knownContentIds: Set<ContentId>,
  id: ContentId,
  source: string,
): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    throw new Error(`invalid content id in ${source}: ${id}`);
  }
  if (knownContentIds.has(id)) {
    throw new Error(`duplicate content id in catalog: ${id}`);
  }
  knownContentIds.add(id);
}

function requireRouteSupport(
  supportById: ReadonlyMap<ContentId, RouteSupportDefinition>,
  id: ContentId,
  expectedKind: RouteSupportKind,
  roomId: ContentId,
): void {
  const support = supportById.get(id);
  if (support === undefined) {
    throw new Error(`unknown ${expectedKind} id ${id} referenced by room ${roomId}`);
  }
  if (support.kind !== expectedKind) {
    throw new Error(
      `content id ${id} referenced by room ${roomId} is ${support.kind}, expected ${expectedKind}`,
    );
  }
}

/**
 * Build the catalog facade, validating that authored class IDs are unique at
 * construction. A duplicate ID is an authoring defect, not a recoverable
 * runtime condition, so it throws rather than returning a typed rejection.
 */
export function createContentCatalog(): ContentCatalog {
  const knownContentIds = new Set<ContentId>();
  const classesById = new Map<ContentId, ClassDefinition>();
  for (const definition of CLASS_DEFINITIONS) {
    registerKnownId(knownContentIds, definition.id, "classes");
    classesById.set(definition.id, definition);
  }

  const supportById = new Map<ContentId, RouteSupportDefinition>();
  for (const definition of ROUTE_SUPPORT_DEFINITIONS) {
    registerKnownId(knownContentIds, definition.id, "route support");
    supportById.set(definition.id, definition);
  }

  const roomsById = new Map<ContentId, RoomDefinition>();
  const roomTypes = new Set<string>();
  for (const definition of ROOM_DEFINITIONS) {
    registerKnownId(knownContentIds, definition.id, "rooms");
    if (roomTypes.has(definition.roomType)) {
      throw new Error(`duplicate room type in catalog: ${definition.roomType}`);
    }
    roomTypes.add(definition.roomType);
    requireRouteSupport(
      supportById,
      definition.formationId,
      "formation",
      definition.id,
    );
    for (const objectiveId of definition.objectiveIds) {
      requireRouteSupport(supportById, objectiveId, "objective", definition.id);
    }
    for (const hazardId of definition.hazardPoolIds) {
      requireRouteSupport(supportById, hazardId, "hazard", definition.id);
    }
    if (definition.rewardPreviewId !== null) {
      requireRouteSupport(
        supportById,
        definition.rewardPreviewId,
        "reward-preview",
        definition.id,
      );
    }
    roomsById.set(definition.id, definition);
  }

  const shopServicesById = new Map<ContentId, ShopServiceDefinition>();
  for (const definition of SHOP_SERVICE_DEFINITIONS) {
    registerKnownId(knownContentIds, definition.id, "shop services");
    if (!Number.isSafeInteger(definition.basePrice) || definition.basePrice <= 0) {
      throw new Error(`invalid shop service price: ${definition.id}`);
    }
    shopServicesById.set(definition.id, definition);
  }

  const bossesById = new Map<ContentId, BossRoutingIdentity>();
  for (const definition of BOSS_ROUTING_IDENTITIES) {
    registerKnownId(knownContentIds, definition.id, "bosses");
    bossesById.set(definition.id, definition);
  }

  if (RECOVERY_RESTORE_AMOUNT !== 1) {
    throw new Error("recovery must restore exactly 1 Integrity");
  }

  const classes = Object.freeze([...CLASS_DEFINITIONS]);
  const rooms = Object.freeze([...ROOM_DEFINITIONS]);
  const shopServices = Object.freeze([...SHOP_SERVICE_DEFINITIONS]);
  const bosses = Object.freeze([...BOSS_ROUTING_IDENTITIES]);
  const initialClassUnlockIds = Object.freeze(
    classes
      .filter((definition) => definition.availability === "initial")
      .map((definition) => definition.id),
  );

  const catalog: ContentCatalog = {
    contentVersion: CONTENT_VERSION,
    listClasses: () => classes,
    getClass: (id) => {
      const value = classesById.get(id);
      return value === undefined
        ? { ok: false, code: "unknown-content-id", contentId: id }
        : { ok: true, value };
    },
    hasClass: (id) => classesById.has(id),
    initialClassUnlockIds: () => initialClassUnlockIds,
    listRooms: () => rooms,
    getRoom: (id) => lookup(roomsById, id),
    listShopServices: () => shopServices,
    getShopService: (id) => lookup(shopServicesById, id),
    listBosses: () => bosses,
    getBoss: (id) => lookup(bossesById, id),
    hasContent: (id) => knownContentIds.has(id),
  };
  return Object.freeze(catalog);
}
