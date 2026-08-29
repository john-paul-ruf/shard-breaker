import type { ClassDefinition } from "./classes";
import { CLASS_DEFINITIONS } from "./classes";

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
}

/**
 * Build the catalog facade, validating that authored class IDs are unique at
 * construction. A duplicate ID is an authoring defect, not a recoverable
 * runtime condition, so it throws rather than returning a typed rejection.
 */
export function createContentCatalog(): ContentCatalog {
  const classesById = new Map<ContentId, ClassDefinition>();
  for (const definition of CLASS_DEFINITIONS) {
    if (classesById.has(definition.id)) {
      throw new Error(`duplicate class id in catalog: ${definition.id}`);
    }
    classesById.set(definition.id, definition);
  }

  const classes = Object.freeze([...CLASS_DEFINITIONS]);
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
  };
  return Object.freeze(catalog);
}
