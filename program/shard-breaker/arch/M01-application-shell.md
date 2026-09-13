# M01 — Application Shell and Command Store

## Boundary

- **Paths:** `./src/main.tsx`, `./src/app/`
- **Session-owned pathspecs:** `./src/main.tsx`, `./src/app/**/*`
- **Purpose:** Bootstrap dependencies, load validated local state, expose one
  command dispatch boundary, derive the active screen, and publish committed
  application snapshots.

## Public API

- `App`
- `AppProps`
- `createAppStore()`
- `AppStore`
- `AppStoreDependencies`
- `AppState`
- `AppCommand`
- `ScreenDescriptor`
- `SaveSignalView`
- `LoadStatus`
- `LaunchMode`
- `deriveScreen()`
- `dispatch(command)`
- `subscribe(listener)`
- `getSnapshot()`

UI and game code may dispatch typed commands and observe snapshots. They may
not mutate domain state or call IndexedDB directly.

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/main.tsx` | Browser entry, dependency construction, CSS imports, and React mount |
| `./src/app/App.tsx` | Top-level loading/error state and screen composition |
| `./src/app/appStore.ts` | Serialized command execution, reducer call, durable commit, subscription publication |
| `./src/app/commands.ts` | Narrow serializable UI/game command boundary and adapter messages |
| `./src/app/navigation.ts` | Pure derivation of `ScreenDescriptor` from validated state |

## Dependency and Implementation Rules

- Depends on M05, M07, and M08. It is the only module that joins those layers.
- Construct dependencies explicitly in `./src/main.tsx`; inject repositories,
  seed source, and clock metadata rather than hiding them in globals.
- Apply a pure transition before persistence, but do not publish the next
  durable snapshot until the repository commit succeeds.
- Serialize durable command handling so revisions cannot race within one tab.
- Keep `./src/app/commands.ts` free of screen/component imports. M06/M08 may
  import this narrow boundary without creating a runtime composition cycle.
- Derive navigation; do not let a screen force a phase that the run state does
  not permit.

## Tests

- Colocate store/navigation tests under `./src/app/`.
- Cover successful publication, rejected transitions, failed saves, stale
  revisions, loading invalid data, and screen derivation for every run phase.

<!-- SESSION-06 -->
## Durable launch application contract

- `createAppStore(dependencies)` receives the immutable `ContentCatalog`, the
  narrow `RunLifecycleRepository`, and injected clock, identity, and opaque-seed
  sources. It exposes one referentially stable frozen `AppState` snapshot until
  a real publication and an idempotent subscription-removal function.
- Initialization and every `AppCommand` share one serialized executor.
  Initialization loads first, bootstraps only `profile-missing`, reloads the
  validated state, selects the first unlocked class when needed, and always
  returns a recovered living run to launch archive mode.
- Start and confirmed replacement invoke the pure M05 reducer, pass its explicit
  instruction to M07, and publish durable next state only after repository
  success. Confirmed replacement is intentionally two commits: committed
  abandonment is published before replacement creation, and a failed second
  commit remains a truthful no-run archive warning. Resume, Cancel, class
  selection, and Return-to-archive do not write persistence.
- `deriveScreen(state)` returns only `{ id: "home", mode: "archive" }` or
  `{ id: "home", mode: "checkpoint" }`; checkpoint requires ready state plus a
  living run. `App` observes with `useSyncExternalStore`, initializes once under
  React Strict Mode, resolves content labels through the catalog, and renders
  bounded loading/fatal states or the controlled `HomeScreen`.
- `./src/main.tsx` checks the mount point, IndexedDB, UUID generation, and secure
  random bytes before composition. It opens M07 once, injects metadata sources,
  mounts React 19 under Strict Mode, and renders an actionable unsupported state
  instead of allowing a blank-page startup failure.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Added the serialized durable application store, launch navigation, React binding, and browser composition root. |
| 2026-08-29 | Imported Genesis M01 contract into the Forge registry. |

<!-- SESSION-02 -->
## M01 — Application shell and command store (`./src/app/`)

- `commands.ts` — `AppCommand` union: `home/select-class` (carries `classId`),
  `run/request-start`, `run/resume`, `run/cancel-replacement`,
  `run/confirm-abandon-and-start`, `run/return-to-archive`. Controlled intent only;
  no metadata from the DOM, no React/screen imports, no mutable re-exports.
