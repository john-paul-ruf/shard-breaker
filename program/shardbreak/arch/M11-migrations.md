# M11 — Genesis IndexedDB Migrations

## Boundary

- **Path:** `./src/migrations/`
- **Ownership:** DB only. No Forge session may include this path in `Owns`.
- **Current artifact:** `./src/migrations/001_initial.ts`
- **Purpose:** Define forward-only IndexedDB structural upgrades. Content and
  profile bootstrap data are deliberately not seeded here.

## Public API

The current DB-owned migration exports:

- `DATABASE_NAME`
- `DATABASE_VERSION`
- `CURRENT_RECORD_KEY`
- `PROFILE_STORE_NAME`
- `LIVING_RUN_STORE_NAME`
- `applyInitialSchema(database)`

It creates `profile` and `livingRun` object stores with key path `recordKey` and
is idempotent when those stores already exist.

## Dependency and Implementation Rules

- M07 may read/import this API from `./src/persistence/database.ts`.
- Do not edit a released migration to change stored meaning. A future structural
  change requires a new numbered DB-owned migration and an explicit serialized
  save-schema migration or rejection policy.
- Initial profile creation remains a validated repository transaction, not a
  migration side effect.
- No secondary indexes, history store, catalog rows, or event log are currently
  justified by the singleton query model.

## Change Procedure

If implementation discovers a structural schema need, Mu must stop that part,
report the exact required store/index/version change in handoff, and request DB.
It may continue work that does not require modifying this module.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Registered the pre-existing DB-owned `001_initial` migration without modifying it. |

