# FORGE-CONFIG — SHARDBREAK

> **Status:** Pending user confirmation  
> **Generated:** 2026-08-29  
> **Authority:** Genesis architecture, design, requirements, and database handoff

## Program

| Field | Value |
|-------|-------|
| Display name | SHARDBREAK |
| Slug | `shardbreak` |
| Program root | `./program/shardbreak/` |
| Repository root | `./` |
| Product | Responsive, desktop-first, one-pointer browser roguelite combining brick-breaker combat with seeded run drafting |
| Delivery | Static GitHub Pages project site; no gameplay backend, accounts, or runtime API |
| Primary intent | Let players make skillful ricochet and build decisions through an endless, deterministic, locally persisted run loop with a mandatory boss every third floor. |

## Genesis Sources

- **Idea:** `./program/shardbreak/specs/idea.md`
- **Requirements:** `./program/shardbreak/specs/requirements.md`
- **Design source:** `./program/shardbreak/specs/design.md` and `./program/shardbreak/mocks/*.html`
- **Architecture source:** `./program/shardbreak/specs/architecture.md`
- **Data source:** `./program/shardbreak/specs/database.md`
- **Genesis migration:** `./src/migrations/001_initial.ts`

The Genesis sources are authoritative. Sessions that change presentation must
read the design source and relevant mock. Sessions that touch persistence or
serialized data must read the data source. The migration tree
`./src/migrations/` is permanently owned by DB: Mu may read it but no Forge
session may include it in `Owns` or modify it. Structural schema changes are a
request back to DB.

## Stack

| Concern | Decision |
|---------|----------|
| Language | TypeScript 5.x in strict mode; ES2022 target; DOM libraries enabled |
| Runtime | Browser runtime; Node.js 22.x for local tooling and CI (22.17.0 detected) |
| Framework | React 19, client-only |
| Real-time rendering | Canvas 2D for the arena with semantic DOM controls and status siblings |
| State management | Custom external store observed with `useSyncExternalStore`; pure domain reducers are authoritative |
| Persistence | Browser IndexedDB via `idb`; Zod runtime validation at every persistence/import boundary |
| Package manager | npm 10.x with committed `./package-lock.json` |
| Build | Vite 7 with the React plugin and a GitHub Pages repository base path |
| Unit/component tests | Vitest and React Testing Library |
| End-to-end tests | Playwright |
| Styling | Bundled CSS, CSS custom properties, semantic React DOM; no production CDN stylesheet |
| Deployment | GitHub Pages through GitHub Actions |

## Architecture

- **Pattern:** Client-only modular monolith with a pure domain core and browser,
  persistence, and presentation adapters.
- **Dependency direction:** UI and browser adapters point inward to domain
  contracts. `./src/domain/` never imports `./src/ui/`, `./src/game/`,
  `./src/persistence/`, or React.
- **Orchestration boundary:** `./src/app/appStore.ts` is the only boundary that
  joins pure transitions, durable persistence, and published presentation
  state.
- **Dependency injection:** Use explicit constructor/factory arguments from
  `./src/main.tsx`; do not add a service locator or container. Inject clocks,
  seed sources, repositories, and browser adapters where nondeterminism or I/O
  must be isolated.
- **State flow:** Dispatch typed command -> validate and calculate a pure
  transition -> commit its persistence instruction atomically -> publish the
  next snapshot and save signal. A failed write must not publish speculative
  durable state.
- **Combat flow:** Canvas frames are ephemeral. A fixed-timestep domain model
  emits typed outcomes; only validated, idempotent outcomes become durable run
  commands.
- **Persistence flow:** One permanent profile and zero or one living run use
  singleton key `"current"`. Durable commands carry `runId`,
  `expectedRevision`, and `commitId`/outcome identity as applicable.
- **Entry points:** `./index.html` -> `./src/main.tsx` ->
  `./src/app/App.tsx`; IndexedDB opens through
  `./src/persistence/database.ts`; the arena enters through
  `./src/game/Arena.tsx`.
- **Navigation:** Screen identity is derived from validated application/run
  state. There is no server router and no navigation path that bypasses a run
  transition.

### Dependency Constraints

1. `./src/domain/content/` depends only on TypeScript primitives.
2. `./src/domain/random/` depends on content and never reads time or
   `Math.random()`.
3. `./src/domain/combat/` depends on content/random initialization contracts,
   never browser APIs.
4. `./src/domain/run/` depends on content, random, and combat contracts, never
   React, Canvas, IndexedDB, or other adapters.
5. `./src/persistence/` may depend on content and run persistence types and may
   import the DB-owned migration, but domain code never imports persistence.
6. Screen and game modules may import the narrow command boundary in
   `./src/app/commands.ts`; keep those imports type-only where possible so the
   application composition root does not create a runtime cycle.
7. Shared components receive controlled, semantic props. They do not call
   reducers, IndexedDB, or browser storage.

## Module Registry

Genesis IDs `M01`–`M10` are authoritative and must never be renumbered.
Additional ownership boundaries begin at `M11`. Rows are shown dependency-first
where practical; IDs remain stable.

| ID | Module | Path | Owns | Imports From | Key Files |
|----|--------|------|------|--------------|-----------|
| M02 | Authored content catalog | `./src/domain/content/` | `./src/domain/content/**/*` | — | `./src/domain/content/catalog.ts`, `./src/domain/content/classes.ts`, `./src/domain/content/skills.ts`, `./src/domain/content/equipment.ts`, `./src/domain/content/enemies.ts`, `./src/domain/content/bosses.ts`, `./src/domain/content/rooms.ts`, `./src/domain/content/enhancements.ts`, `./src/domain/content/relics.ts` |
| M10 | Design system and responsive styles | `./src/styles/` | `./src/styles/**/*` | — | `./src/styles/tokens.css`, `./src/styles/global.css`, `./src/styles/responsive.css` |
| M11 | Genesis IndexedDB migrations | `./src/migrations/` | **DB-owned; never session-owned** | — | `./src/migrations/001_initial.ts` |
| M03 | Deterministic random generation | `./src/domain/random/` | `./src/domain/random/**/*` | M02 | `./src/domain/random/seededRng.ts`, `./src/domain/random/generators.ts` |
| M04 | Deterministic combat domain | `./src/domain/combat/` | `./src/domain/combat/**/*` | M02, M03 | `./src/domain/combat/model.ts`, `./src/domain/combat/rules.ts`, `./src/domain/combat/bossState.ts`, `./src/domain/combat/results.ts` |
| M05 | Run and profile state machine | `./src/domain/run/` | `./src/domain/run/**/*` | M02, M03, M04 | `./src/domain/run/model.ts`, `./src/domain/run/reducer.ts`, `./src/domain/run/commands.ts`, `./src/domain/run/routes.ts`, `./src/domain/run/rewards.ts`, `./src/domain/run/threat.ts`, `./src/domain/run/progression.ts`, `./src/domain/run/validation.ts` |
| M07 | Persistence and profile transfer | `./src/persistence/` | `./src/persistence/**/*` | M02, M05, M11 | `./src/persistence/database.ts`, `./src/persistence/repositories.ts`, `./src/persistence/envelopes.ts`, `./src/persistence/validation.ts`, `./src/persistence/transfer.ts` |
| M09 | Shared accessible UI components | `./src/ui/components/` | `./src/ui/components/**/*` | M01 type contracts, M10 | `./src/ui/components/AppStatusBar.tsx`, `./src/ui/components/RouteCard.tsx`, `./src/ui/components/RewardCard.tsx`, `./src/ui/components/IntegrityMeter.tsx`, `./src/ui/components/SkillRail.tsx`, `./src/ui/components/TelegraphBanner.tsx`, `./src/ui/components/ConfirmationDialog.tsx`, `./src/ui/components/SaveSignal.tsx`, `./src/ui/components/TransferPanel.tsx` |
| M06 | Browser game bridge | `./src/game/` | `./src/game/**/*` | M01 command boundary, M04, M10 | `./src/game/Arena.tsx`, `./src/game/engine.ts`, `./src/game/input.ts`, `./src/game/renderer.ts`, `./src/game/session.ts` |
| M08 | Screen compositions | `./src/ui/screens/` | `./src/ui/screens/**/*` | M01 command/view contracts, M06, M09 | `./src/ui/screens/HomeScreen.tsx`, `./src/ui/screens/RouteMapScreen.tsx`, `./src/ui/screens/CombatScreen.tsx`, `./src/ui/screens/BossScreen.tsx`, `./src/ui/screens/RewardsScreen.tsx`, `./src/ui/screens/RunSummaryScreen.tsx`, `./src/ui/screens/ProfileScreen.tsx` |
| M01 | Application shell and command store | `./src/main.tsx`, `./src/app/` | `./src/main.tsx`, `./src/app/**/*` | M05, M07, M08 | `./src/main.tsx`, `./src/app/App.tsx`, `./src/app/appStore.ts`, `./src/app/commands.ts`, `./src/app/navigation.ts` |
| M12 | Toolchain and static delivery | Explicit root/build paths | Per-session exact files only; never lease repository root | M01–M10 | `./package.json`, `./package-lock.json`, `./index.html`, `./tsconfig.json`, `./tsconfig.app.json`, `./tsconfig.node.json`, `./vite.config.ts`, `./vitest.config.ts`, `./playwright.config.ts`, `./eslint.config.js`, `./src/vite-env.d.ts`, `./src/test/setup.ts`, `./.github/workflows/deploy.yml` |
| M13 | Browser acceptance tests | `./tests/e2e/` | `./tests/e2e/**/*` | M01–M10 | Feature-scoped `*.spec.ts` files and helpers under `./tests/e2e/` |

### Module Detail Files

- `./program/shardbreak/arch/M01-application-shell.md`
- `./program/shardbreak/arch/M02-content-catalog.md`
- `./program/shardbreak/arch/M03-deterministic-random.md`
- `./program/shardbreak/arch/M04-combat-domain.md`
- `./program/shardbreak/arch/M05-run-state-machine.md`
- `./program/shardbreak/arch/M06-game-bridge.md`
- `./program/shardbreak/arch/M07-persistence.md`
- `./program/shardbreak/arch/M08-screens.md`
- `./program/shardbreak/arch/M09-components.md`
- `./program/shardbreak/arch/M10-styles.md`
- `./program/shardbreak/arch/M11-migrations.md`
- `./program/shardbreak/arch/M12-toolchain.md`
- `./program/shardbreak/arch/M13-e2e.md`

## Conventions

### TypeScript and File Naming

- Use strict TypeScript; do not introduce `any`. Prefer `unknown` plus explicit
  narrowing at I/O boundaries.
- React components and component files use `PascalCase`; domain, adapter, and
  utility files use `camelCase`; functions/variables use `camelCase`; types and
  discriminated-union members use `PascalCase`; constants use `UPPER_SNAKE_CASE`
  only when truly global and immutable.
- Unit/component tests are colocated as `*.test.ts` or `*.test.tsx`; Playwright
  acceptance tests use `./tests/e2e/*.spec.ts`.
- Use two-space indentation, double quotes, semicolons, trailing commas where
  TypeScript permits, and LF line endings.
- Use `import type` for type-only dependencies. Avoid broad barrel files that
  obscure dependency direction.
- `ContentId` values are opaque lowercase kebab-case strings, preferably with a
  category prefix for diagnostics. Never parse gameplay meaning from an ID.

### Domain and State

- Model expected command rejection as a typed discriminated result, not an
  exception. Domain transitions remain pure and side-effect-free.
- Every durable transition carries a persistence instruction and idempotency
  identity; never mutate a loaded run/profile object in place.
- Never use `Math.random()` or wall-clock time to decide a run outcome. Random
  streams derive from seed, content version, and stable event keys.
- All numeric inputs are finite and range-checked. Persist safe integers unless
  a documented bounded combat parameter explicitly needs a real value.
- Do not leave `TODO`, placeholder implementations, orphan modules, or dangling
  imports at a checkpoint.

### Errors and Logging

- Persistence, validation, import, and browser capability failures use typed
  errors with a stable machine code and a safe player-facing message.
- The app store catches adapter failures and publishes a `SaveSignal`; screens
  never swallow a failed durable action or present it as committed.
- Do not log imported payloads or entire save records. Development diagnostics
  may log bounded event IDs, revisions, depth/cycle, and threat factors through
  a typed dev-only logger. No unconditional production `console.*` calls.

### React, Canvas, and CSS

- Components are controlled function components. State ownership stays in the
  app store or an explicitly ephemeral game session.
- Do not drive the fixed-step game loop through React renders. React observes
  durable/screen state; Canvas renders simulation snapshots.
- Essential status, telegraphs, and launch/skill controls remain semantic DOM
  siblings of Canvas and remain understandable under reduced motion.
- Reuse custom properties from `./src/styles/tokens.css`; do not copy palette or
  spacing literals into screen-specific code without a documented Canvas need.
- Action targets are at least 44px where required. Color is never the only
  indication of selection, danger, damage, availability, or resolution.

### Documentation

- Add TSDoc to exported contracts when invariants or side effects are not
  obvious from the type.
- Explain non-trivial collision, RNG stream, idempotency, canonicalization, and
  transaction logic near the code; do not narrate obvious syntax.
- Architecture history is updated only by Jikijitsu during orchestrated runs.
  Mu reports public API/module changes in handoff JSON instead of editing
  `./program/shardbreak/arch/`, `STATE.md`, or `MASTER.md`.

## Verification Commands

The initial scaffolding feature must create npm scripts matching this table.
After `./package-lock.json` exists, install with `npm ci`; only the scaffolding
checkpoint may use `npm install` to establish the lockfile.

| Purpose | Command | Required When |
|---------|---------|---------------|
| Lint | `npm run lint` | Every checkpoint that changes TypeScript, JSX, CSS tooling, or config |
| Type safety | `npm run typecheck` | Every code checkpoint |
| Unit/component suite | `npm run test:unit` | Every code checkpoint; targeted tests may run first |
| Production bundle | `npm run build` | Every session end and any checkpoint changing wiring/build/config |
| Browser acceptance | `npm run test:e2e` | Any completed player-visible flow and final feature verification |
| Full local gate | `npm run verify` | Every session end; must aggregate lint, typecheck, unit tests, and build |

Playwright browsers and missing npm dependencies are installed automatically
through the project package manager when required. Tests must not rely on a
network gameplay service.

## Git Configuration

- **Repository:** Git repository on branch `main`, remote `origin`.
- **Checkpoint ownership:** Mu commits every checkpoint itself with
  `git add -- <exact session Owns pathspecs>`; it never stages the repository
  root or unrelated changes.
- **Commit style:** `feat(<feature>): <checkpoint outcome>`, with `test`, `fix`,
  or `chore` only when that checkpoint is genuinely of that type.
- **No push:** Sessions commit locally and never push unless the user explicitly
  requests it outside the Forge/Mu/Jikijitsu protocol.
- **Orchestrator ownership:** Jikijitsu owns each feature's `STATE.md`,
  `MASTER.md`, and all files under `./program/shardbreak/arch/` during execution.
- **DB ownership:** No Mu commit may stage `./src/migrations/`.
- **Planning files:** `./program/` is intentionally ignored by the repository's
  current `./.gitignore`; orchestration consumes these local artifacts directly.

## Session Defaults

- Target 3–8 sessions per feature, split by exact write set rather than effort.
- Declare 2–6 mechanically verifiable checkpoints per session.
- Include module-local tests in the same session lease as the implementation.
- Keep concurrent `Owns` literally disjoint. Shared types/config are either a
  hard dependency or part of the same session; do not manufacture a foundation
  session solely to avoid a shared-file conflict.
- Default app port is assigned by Jikijitsu's Orchestration Envelope; sessions
  must not hardcode a port.
- Read each target before modifying it. UI work reads the relevant mock; data
  work reads the database spec; all work reads the affected module detail.
- Every checkpoint must leave the tree buildable with relevant tests passing and
  must name the exact observable condition that permits Mu to commit.
- No session may own feature `STATE.md`, `MASTER.md`, or any architecture detail.

## Custom Rules and Product Invariants

1. A local profile has at most one living run. Starting another requires an
   explicit resume, abandon, or cancel path.
2. Depth starts at 1; cycle is `floor((depth - 1) / 3) + 1`; every positive
   multiple of 3 is a mandatory boss floor that routing cannot bypass.
3. Integrity is the only player survivability stat. Starting maximums are
   Glitch Knight 4, Circuit Rogue 3, and Neon Mage 2. One dropped ball costs
   exactly 1 Integrity.
4. A build has at most 3 active skills, 4 passive equipment items, and one
   bounded carry-over relic. Skill charges cannot become negative.
5. Every eligible reward draft contains exactly 3 fully revealed unique cards,
   accepts one selection, and applies it at most once. There is no initial
   reroll mechanic.
6. Route offers, materialized rooms, shop inventory, recovery effects, and
   reward drafts are persisted before they can be refreshed into a different
   result.
7. Difficulty accepts browser-safe arbitrarily high depth, uses a deterministic
   threat budget, and keeps direct numeric scaling sublinear. Composition,
   hazards, formations, and compatible capped modifiers carry late-depth load.
8. Combat uses a fixed timestep and bounded accumulator. `requestAnimationFrame`
   is only a clock. Refresh during an uncommitted volley returns to the last safe
   pre-launch/loss checkpoint.
9. Terminal finalization updates permanent rewards/records and deletes the
   living run in one transaction. Retrying cannot award twice.
10. Profile export contains permanent progression only. Import validates the
    canonical digest, versions, ranges, caps, and known IDs before writing and
    leaves the living run byte-for-byte untouched.
11. The production game has no runtime proprietary API, authentication, cloud
    save, global leaderboard, ads, monetization, or CDN stylesheet dependency.
12. Presentation follows the design spec and relevant standalone mock while
    replacing mock navigation/shortcuts and CDN Tailwind with real state,
    bundled CSS, and accessible controls.

## Current Codebase and Conflicts

- The repository is otherwise an empty implementation: no `./package.json`,
  application source tree, tests, or build configuration exists yet.
- `./src/migrations/001_initial.ts` already implements database version 1 and is
  the authoritative immutable Genesis migration. Persistence must wire it in;
  sessions must not recreate or edit it.
- `./.gitignore` already excludes build/test outputs and `./program/`; no source
  session should broaden it without a concrete need.
- Detailed balance constants, collision tolerances, exact threat coefficients,
  reward weights, and licensed production art remain non-blocking balance/content
  decisions. Centralize initial bounded values in the catalog/rules so later
  tuning does not change module contracts or save semantics.
- The browser TypeScript configuration must include DOM/IndexedDB types so the
  pre-existing migration type-checks from the first scaffold checkpoint.
- `contentVersion`, database version, and `saveSchemaVersion` must remain
  distinct and explicit; a deployment may not silently reinterpret committed
  IDs or outcomes.

## Recommended Feature Sequence

This sequence is a planning proposal until the user confirms it. Each feature
gets its own prompt directory and is forged only after prior feature assumptions
are reconciled with the then-current codebase.

1. **Run lifecycle foundation** — scaffold the toolchain and implement start,
   resume, explicit abandon, class Integrity, bootstrap persistence, the app
   store, and launch archive.
2. **Deterministic routes and utility rooms** — seeded route/threat generation,
   mandatory boss routing, shops, recovery, and route-map flow.
3. **Seeded rewards and run builds** — skills/equipment/enhancement catalog,
   exactly-three-card drafts, compatibility, capacity/replacement, and durable
   one-time selection.
4. **One-pointer combat loop** — fixed-step collisions, enemy formations,
   paddle/aim/launch input, safe checkpoints, loss/clear outcomes, and battle UI.
5. **Boss cycles and endless scaling** — four boss archetypes, phases,
   telegraphs, compatible modifiers, boss rewards, and high-depth scaling.
6. **Terminal progression and profile portability** — Shards, records, terminal
   summary, relic choice, unlocks, export/import, validation, and reset.
7. **Responsive release hardening** — cross-screen responsive/accessibility and
   reduced-motion closure, browser acceptance coverage, performance/loading
   checks, and GitHub Pages deployment.
