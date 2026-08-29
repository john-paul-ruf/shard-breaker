# M12 — Toolchain and Static Delivery

## Boundary

- **Paths:** Explicit project/build configuration files only; there is no valid
  catch-all repository-root lease.
- **Purpose:** Define npm dependencies/scripts, TypeScript/Vite/Vitest/Playwright
  configuration, browser entry HTML, test setup, and GitHub Pages delivery.

## Managed Files

- `./package.json`
- `./package-lock.json`
- `./index.html`
- `./tsconfig.json`
- `./tsconfig.app.json`
- `./tsconfig.node.json`
- `./vite.config.ts`
- `./vitest.config.ts`
- `./playwright.config.ts`
- `./eslint.config.js`
- `./src/vite-env.d.ts`
- `./src/test/setup.ts`
- `./.github/workflows/deploy.yml`

A session owns only the exact subset it creates or modifies. Never emit
`Owns: ./` or another repository-wide glob.

## Public Contract

`./package.json` exposes stable scripts:

- `npm run dev`
- `npm run lint`
- `npm run typecheck`
- `npm run test:unit`
- `npm run test:e2e`
- `npm run build`
- `npm run verify`

## Dependency and Implementation Rules

- Use npm and commit `./package-lock.json`. The first scaffold may run
  `npm install`; subsequent clean installs use `npm ci`.
- TypeScript is strict, targets ES2022, and includes DOM/IndexedDB libraries so
  the DB-owned migration type-checks immediately.
- Configure Vite's base for both local root serving and the GitHub Pages project
  prefix without hardcoded absolute asset URLs.
- Vitest uses a browser-like DOM only for component tests; pure domain tests stay
  environment-independent where possible.
- Playwright starts the app on the port supplied by orchestration/config rather
  than a hardcoded globally shared port.
- Deployment runs `npm ci`, the full verification gate, and a production build
  before uploading `./dist/` as static Pages assets.
- Runtime gameplay cannot depend on a dev server, private service, CDN
  stylesheet, or secret.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Added a precise non-Genesis ownership boundary for the empty repository's required toolchain and delivery files. |

