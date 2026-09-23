# Program Configuration — Shard Breaker

## Program

- **Name:** Shard Breaker
- **Slug:** `shard-breaker`
- **Root:** repository root
- **Product:** responsive, desktop-first, one-pointer browser roguelite combining brick-breaker combat with seeded run drafting

## Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.9, strict project references |
| Runtime | Browser; Node.js 22.17 for tooling |
| Framework | React 19 + Vite 7 |
| Package manager | npm with committed `package-lock.json` |
| Persistence | IndexedDB through `idb`; Zod validates records at the adapter boundary |
| Unit/component tests | Vitest 4, Testing Library, jsdom, fake-indexeddb |
| Browser acceptance | Playwright 1.62 |
| Build/deploy | `tsc -b` + Vite; GitHub Pages workflow |

## Architecture

The application uses a functional core / imperative shell. Authored content and seeded generators feed immutable run-domain transitions. `AppStore` serializes UI commands, injects nondeterministic identity/time values, invokes the pure reducer, and delegates atomic writes to a narrow repository interface. React renders projections of validated store state. Dependencies flow content/random → combat → run domain → persistence/app orchestration → UI/game bridge → browser composition. Production composition begins in `src/main.tsx`.

No DI framework is used. Dependencies are constructor arguments. State is held by an external store consumed through `useSyncExternalStore`. Errors cross boundaries as discriminated result types and user-facing messages are bounded. The real-time arena is a fixed-step simulation (`src/domain/combat/`, pure) driven by a browser bridge (`src/game/`, imperative); frames are never persisted — durable checkpoints live in the run domain.

## Module Registry

> **ID numbering.** Program sessions, STATE.md, and this table use registry IDs
> **M01–M10**. The per-module deep files under `arch/` use an archived
> deep-file numbering **M01–M13**; their IDs do not match the rows below one
> for one (mapping noted per row). Deep-file names are historical labels only;
> module leases, sessions, and capabilities always use these registry IDs.
> M09/M10 are new as of the combat-engine feature (2026-09-23).

| ID | Module | Path | Owns | Imports From | Key Files | Deep file |
|----|--------|------|------|-------------|-----------|-----------|
| M01 | Authored content | `src/domain/content/` | `src/domain/content/**` | — | `catalog.ts`, `classes.ts`, `rooms.ts`, `bosses.ts`, `skills.ts`, `equipment.ts`, `enhancements.ts`, `enemies.ts` (combat-engine) | M02 |
| M02 | Seeded generation | `src/domain/random/` | `src/domain/random/**` | M01 [R] | `seededRng.ts`, `generators.ts` | M03 |
| M03 | Run domain | `src/domain/run/` | `src/domain/run/**` | M01 [R], M02 [R], M09 [D→R] | `model.ts`, `commands.ts`, `reducer.ts`, `routes.ts`, `validation.ts` | M05 |
| M04 | Persistence | `src/persistence/` | `src/persistence/**` | M01, M03, M05 | `database.ts`, `envelopes.ts`, `repositories.ts`, `validation.ts` | M07 |
| M05 | Immutable migration | `src/migrations/001_initial.ts` | `src/migrations/001_initial.ts` | — | `001_initial.ts` | M11 |
| M06 | Application orchestration | `src/app/`, `src/main.tsx` | `src/app/**`, `src/main.tsx` | M01 [R], M02 [R], M03 [R], M04 [R], M07 [R] | `appStore.ts`, `commands.ts`, `navigation.ts`, `App.tsx` | M01 |
| M07 | React UI and styles | `src/ui/`, `src/styles/` | `src/ui/**`, `src/styles/**` | M01 [R], M06 [R] | `HomeScreen.tsx`, `RouteMapScreen.tsx`, `RoomScreen.tsx`, `RewardsScreen.tsx`, `CombatScreen.tsx` (combat-engine), `BossScreen.tsx` (combat-engine), `RewardCard.tsx`, `RouteCard.tsx`, `TelegraphBanner.tsx` (combat-engine), `AppStatusBar.tsx`, components, global/responsive/tokens CSS | M08/M09/M10 |
| M08 | Browser composition and acceptance | `src/main.tsx`, `tests/e2e/`, root build/test config | exact file paths per session | M01 [R], M04 [R], M06 [R], M07 [R], M10 [D] | `main.tsx`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`, `playwright.config.ts`, `vite.config.ts` | M12/M13 |
| M09 | Combat domain | `src/domain/combat/` (created by combat-engine) | `src/domain/combat/**` | M01 [D→R], M02 [D→R] | `model.ts`, `layout.ts`, `rules.ts`, `results.ts`, `effects.ts`, `bossState.ts` | M04 (deep) |
| M10 | Game bridge (incl. Arena host) | `src/game/` (created by combat-engine) | `src/game/**` | M09 [D→R], M06 [D→R type-only: `AppCommand`] | `engine.ts`, `input.ts`, `session.ts`, `renderer.ts`, `Arena.tsx` | M06 (deep) |

Notes (checked against `src/**` imports at `230cf20`, excluding test files and
stripping `import type` / fully-type named clauses; `export … from` would
resolve as a runtime import — none exist):

- **M02→M01 [R]:** `random/generators.ts` value-imports `RECOVERY_RESTORE_AMOUNT`
  from `content/rooms`; `import type { EffectParam }` from `run/model` is
  type-only and erases at runtime (no M02→M03 edge).
- **M03→M02 [R]:** `run/reducer.ts` value-imports `generateRewardDraft`,
  `generateRouteOptions`, `generateRoomCandidate` from `random/generators`.
- **M03→M01 [R]:** `run/model.ts` and `run/commands.ts` type-import
  `ContentCatalog`/`ContentId`/`ContentVersion` from `content/catalog`
  (type-only; the realized M03→M01 surface is the validated catalog passed into
  `runReducer`/validation).
- **M06→M01 [R]:** `app/commands.ts`, `app/appStore.ts`, `app/App.tsx`
  import the content module (including `App.tsx` value-importing
  `ROUTE_SUPPORT_DEFINITIONS` from `content/rooms` for objective names — a
  recorded `listRouteSupport()` facade follow-up).
- **M06→M03 [R]:** `app/appStore.ts` value-imports `runReducer` from
  `run/reducer`.
- **M06→M07 [R]:** `App.tsx` value-imports the four screens;
  `App.tsx`/`navigation.ts` type-import store state.
- **M07→M06 [R] (type-only, no runtime inversion):** screens/components
  `import type` the `AppCommand`/view-model types from `src/app/`; no runtime
  UI→app edge exists.
- **M07→M03 [R] (type-only):** `RouteCard.tsx`/`RewardCard.tsx`/screens
  `import type` `RouteOfferSnapshot`/`RewardCardSnapshot`/`RoomType` from
  `run/model`; `RouteMapScreen.tsx` value-imports `isBossDepth` from
  `run/routes` (the one realized UI→run-domain edge, for boss-depth copy).
- **M07→M01 [R]:** screens/components resolve display fields through
  `catalog.getSkill`/`getEquipment`/`getEnhancement`/`listRooms` passed as
  props (no direct content-array reads outside the catalog facade except the
  recorded M06 `ROUTE_SUPPORT_DEFINITIONS` follow-up above).
- **M04→M03 [R] (type-only) / M04→M01 [R]:** `persistence/validation.ts`
  value-imports `CURRENT_RECORD_KEY`/`SAVE_SCHEMA_VERSION` from `run/model` and
  `isBossDepth`/`routeEventKey` from `run/routes`, and
  `validateLivingRun`/`validateProfile`/`validateRunState` from
  `run/validation`; type-imports catalog types.
- **M04→M05 [R]:** `database.ts` imports the migration's schema constants and
  `applyInitialSchema`; `repositories.ts` imports the store-name constants.
  The `src/domain/run/room.test.ts → persistence/validation.ts` test-only
  import proves the schema contract; it is not a runtime edge.
- **M08→M01 [R]:** `main.tsx` value-imports `createContentCatalog`;
  `main.tsx` imports all three stylesheets.
- **combat-engine planned/declared edges (owners named in
  `prompts/combat-engine/STATE.md`):** M09→M01 [D→R, S01: combat consumes enemy/boss
  lookups], M09→M02 [D→R, S01: `deriveStream` for layout]; M03→M09 [D→R, S02:
  reducer imports combat outcomes/state]; M02→M09 [D→R, S02: generator emits combat
  checkpoints]; M10→M09 [D→R, S03]; M10→M06 [D→R type-only, S03/S04: `AppCommand`];
  M06→M10 [D→R, S04: `App.tsx` composes `Arena`]; M07→M10 [D→R, S04: screens import
  Arena]; M08→M10 [D→R, S07: e2e journeys through the arena]. The previously deferred
  M07→M06 runtime `Arena` edge is superseded by these owned entries.
- **Author Re-entry sources present:** `specs/` (idea, requirements, design,
  architecture, database) and `mocks/` exist and are Author-owned. No session's
  `Owns` may include `specs/**` or `mocks/**`; every lease reads them.

M05 is immutable for ordinary feature work: do not revise migration 001. A schema change requires a new migration and explicit planning.

## Conventions

- File names are camelCase for TypeScript modules and PascalCase for React components.
- Export readonly interfaces and discriminated unions; keep reducer inputs serializable.
- Keep random, clock, IDs, and persistence out of pure domain transitions.
- The combat domain and game bridge follow the same purity rules: simulation is deterministic
  and DOM-free; the bridge uses `requestAnimationFrame` as a clock only and persists nothing.
- Fail closed on invalid, stale, unknown, or unavailable data; never overwrite newer state.
- Validate both data loaded from storage and proposed records before committing.
- Use bounded diagnostic/user messages and avoid persisting exception objects.
- Tests live beside source; browser journeys live under `tests/e2e/`.
- Read a target before modifying it. Do not add TODOs or orphan modules.

## Verification Commands

| Gate | Command | Notes |
|---|---|---|
| Lint | `npm run lint` | ESLint plus Stylelint |
| Types | `npm run typecheck` | `tsc -b --pretty false` |
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)`; NOTE: `npm run test:unit -- <patterns>` does not filter — use `npx vitest run <paths>` for targeted runs |
| Production build | `npm run build` | Typecheck plus Vite output in `dist/` |
| Standard local gate | `npm run verify` | Lint, types, unit/component, build |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | Requires permission to bind localhost; Playwright starts Vite and writes `test-results/` / `playwright-report/`. Use a fresh port per invocation (recorded port-reuse flake class). |

## Git Configuration

- Default branch: `main` (per deployment workflow).
- Coder commits at every checkpoint with `git add -- <exact session Owns>`.
- Never stage planner files in a Coder checkpoint.

## Session Defaults

- 2–6 independently green checkpoints.
- Use the Orchestrator-assigned port for Playwright.
- Preserve the existing database name and singleton record keys unless an approved migration changes them.
- Run targeted tests at intermediate checkpoints and `npm run verify` at the final checkpoint.

## Custom Rules

- Seeded outputs are a public gameplay contract: event keys, content version, run identity, depth, and cycle must all participate as designed.
- A route choice is durable only after the repository transaction succeeds; rejected/stale/unavailable choices leave storage and visible committed state unchanged.
- Browser acceptance must inspect IndexedDB, reload, and prove reconstruction rather than relying only on rendered copy.
- Combat frames are ephemeral: durable writes happen only at committed checkpoints (room entry, loss-of-ball, clear, terminal); a refresh resumes from the last valid checkpoint and never fabricates a live-volley result.
- Launch is explicit: pointer movement alone never launches a ball (FR-2).
- Reward replacement on a full build side replaces the earliest item, duplicates included, per the approved design (FR-9) — the all-duplicate-draft concern is resolved by replacement semantics, not by a rejection path.
- Author handoff artifacts (`specs/`, `mocks/`) exist and are immutable to sessions; changes route through Author re-entry.

## Author Sources

- Design source: `specs/design.md` + `mocks/*.html` (combat.html, boss.html authoritative for the combat-engine feature).
- Data source: `specs/database.md` (livingRun `CombatCheckpoint` shapes are authoritative).
- Architecture source: `specs/architecture.md` + deep arch files under `arch/`.