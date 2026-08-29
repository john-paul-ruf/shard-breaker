import { openDB, unwrap, wrap } from "idb";

import {
  applyInitialSchema,
  DATABASE_NAME,
  DATABASE_VERSION,
} from "../migrations/001_initial";
import type {
  PersistenceResult,
  ShardbreakDatabase,
  ShardbreakDatabaseSchema,
} from "./envelopes";

export interface DatabaseOpenOptions {
  /** Unique names isolate tests; production omits this and opens `shardbreak`. */
  readonly name?: string;
  /** Optional factory permits deterministic browser-compatible test databases. */
  readonly indexedDB?: IDBFactory;
}

function openWithFactory(name: string, factory: IDBFactory): Promise<ShardbreakDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(name, DATABASE_VERSION);
    } catch (cause) {
      reject(cause);
      return;
    }

    request.addEventListener("upgradeneeded", () => {
      try {
        applyInitialSchema(request.result);
      } catch (cause) {
        request.transaction?.abort();
        reject(cause);
      }
    });
    request.addEventListener("error", () => {
      reject(request.error ?? new DOMException("Database open failed", "UnknownError"));
    });
    request.addEventListener("blocked", () => {
      reject(new DOMException("Database open was blocked", "VersionError"));
    });
    request.addEventListener("success", () => {
      resolve(wrap(request.result) as ShardbreakDatabase);
    });
  });
}

function databaseDiagnostic(cause: unknown): Readonly<Record<string, string>> {
  const errorName =
    cause instanceof DOMException || cause instanceof Error ? cause.name : "UnknownError";
  return { operation: "open", errorName: errorName.slice(0, 80) };
}

/**
 * Open database version 1 and delegate all structural work to migration 001.
 * Failures are returned as stable adapter errors rather than raw DOM errors.
 */
export async function openDatabase(
  options: DatabaseOpenOptions = {},
): Promise<PersistenceResult<ShardbreakDatabase>> {
  const name = options.name ?? DATABASE_NAME;
  try {
    const database =
      options.indexedDB === undefined
        ? await openDB<ShardbreakDatabaseSchema>(name, DATABASE_VERSION, {
            upgrade: (wrappedDatabase) => {
              applyInitialSchema(unwrap(wrappedDatabase));
            },
          })
        : await openWithFactory(name, options.indexedDB);
    return { ok: true, value: database };
  } catch (cause) {
    return {
      ok: false,
      error: {
        code: "database-unavailable",
        message: "Local saves are unavailable in this browser.",
        cause: databaseDiagnostic(cause),
      },
    };
  }
}
