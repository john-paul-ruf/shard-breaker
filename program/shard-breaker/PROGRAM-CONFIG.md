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

The application uses a functional core / imperative shell. Authored content and seeded generators feed immutable run-domain transitions. `AppStore` serializes UI commands, injects nondeterministic identity/time values, invokes the pure reducer, and delegates atomic writes to a narrow repository interface. React renders projections of validated store state. Dependencies flow content/random → run domain → persistence/app orchestration → UI → browser composition. Production composition begins in `src/main.tsx`.

No DI framework is used. Dependencies are constructor arguments. State is held by an external store consumed through `useSyncExternalStore`. Errors cross boundaries as discriminated result types and user-facing messages are bounded.

## Module Registry

| ID | Module | Path | Owns | Imports From | Key Files |
|---|---|---|---|---|---|
| M01 | Authored content | `src/domain/content/` | `src/domain/content/**` | — | `catalog.ts`, `classes.ts`, `rooms.ts`, `bosses.ts` |
| M02 | Seeded generation | `src/domain/random/` | `src/domain/random/**` | M01 | `seededRng.ts`, `generators.ts` |
| M03 | Run domain | `src/domain/run/` | `src/domain/run/**` | M01 | `model.ts`, `commands.ts`, `reducer.ts`, `validation.ts`, `routes.ts` |
| M04 | Persistence | `src/persistence/` | `src/persistence/**` | M01, M03, M05 | `database.ts`, `envelopes.ts`, `repositories.ts`, `validation.ts` |
| M05 | Immutable migration | `src/migrations/001_initial.ts` | `src/migrations/001_initial.ts` | — | `001_initial.ts` |
| M06 | Application orchestration | `src/app/` | `src/app/**` | M01, M03, M04, M07 | `appStore.ts`, `commands.ts`, `navigation.ts`, `App.tsx` |
| M07 | React UI and styles | `src/ui/`, `src/styles/` | `src/ui/**`, `src/styles/**` | M01, M06 | `HomeScreen.tsx`, components, global/responsive/tokens CSS |
| M08 | Browser composition and acceptance | `src/main.tsx`, `tests/e2e/`, root build/test config | exact file paths per session | M01, M04, M06, M07 | `main.tsx`, `tests/e2e/run-lifecycle.spec.ts`, `playwright.config.ts`, `vite.config.ts` |

M05 is immutable for ordinary feature work: do not revise migration 001. A schema change requires a new migration and explicit planning.

## Conventions

- File names are camelCase for TypeScript modules and PascalCase for React components.
- Export readonly interfaces and discriminated unions; keep reducer inputs serializable.
- Keep random, clock, IDs, and persistence out of pure domain transitions.
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
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)` |
| Production build | `npm run build` | Typecheck plus Vite output in `dist/` |
| Standard local gate | `npm run verify` | Lint, types, unit/component, build |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | Requires permission to bind localhost; Playwright starts Vite and writes `test-results/` / `playwright-report/` |

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
- No Author handoff artifacts (`specs/`, `mocks/`) exist in the inspected checkout.

## Author Sources

- Design source: none present.
- Data source: none present.
- Architecture source: this detected configuration and the implementation itself.
