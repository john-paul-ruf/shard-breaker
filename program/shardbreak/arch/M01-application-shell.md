# M01 — Application Shell and Command Store

## Boundary

- **Paths:** `./src/main.tsx`, `./src/app/`
- **Session-owned pathspecs:** `./src/main.tsx`, `./src/app/**/*`
- **Purpose:** Bootstrap dependencies, load validated local state, expose one
  command dispatch boundary, derive the active screen, and publish committed
  application snapshots.

## Public API

- `App`
- `AppStore`
- `AppState`
- `AppCommand`
- `ScreenId`
- `SaveSignal`
- `LoadStatus`
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
| `./src/app/navigation.ts` | Pure derivation of `ScreenId` from validated state |

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

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M01 contract into the Forge registry. |

