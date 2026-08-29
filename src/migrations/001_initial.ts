/**
 * Initial IndexedDB structure for SHARDBREAK.
 *
 * The application layer owns record validation and transaction semantics.
 * This migration only creates the two singleton object stores; catalog data
 * is bundled with the application and is never seeded into IndexedDB.
 */

export const DATABASE_NAME = "shardbreak";
export const DATABASE_VERSION = 1;
export const CURRENT_RECORD_KEY = "current" as const;

export const PROFILE_STORE_NAME = "profile" as const;
export const LIVING_RUN_STORE_NAME = "livingRun" as const;

/**
 * Apply the version-one schema during an IndexedDB `onupgradeneeded` callback.
 * Object-store checks make the migration safe to invoke more than once while
 * a database is being created or upgraded.
 */
export function applyInitialSchema(database: IDBDatabase): void {
  if (!database.objectStoreNames.contains(PROFILE_STORE_NAME)) {
    database.createObjectStore(PROFILE_STORE_NAME, {
      keyPath: "recordKey",
    });
  }

  if (!database.objectStoreNames.contains(LIVING_RUN_STORE_NAME)) {
    database.createObjectStore(LIVING_RUN_STORE_NAME, {
      keyPath: "recordKey",
    });
  }
}
