# SESSION-02 — Route UI, application wiring, and browser journey

> **Program:** Shard Breaker
> **Feature:** route-drafting
> **Slug:** session-02
> **Summary:** Build the route-map screen and RouteCard component, wire navigation and App routing, add route-map styles, and extend the browser e2e journey to prove the materialize/select/commit flow persists across reload.
> **Wave:** 2
> **Modules:** M07, M06, M10, M08 (M02 read)
> **Depends on:** 01
> **Concurrent with:** —
> **Owns:** `src/ui/screens/RouteMapScreen.tsx`, `src/ui/screens/RouteMapScreen.test.tsx`, `src/ui/components/RouteCard.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts`, `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`
> **Reads:** `src/app/appStore.ts`, `src/app/commands.ts`, `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/domain/random/generators.ts`, `src/styles/tokens.css`, `src/ui/components/AppStatusBar.tsx`, `src/ui/components/IntegrityMeter.tsx`, `src/ui/components/SaveSignal.tsx`, `src/ui/screens/HomeScreen.tsx`
> **Resources:** `PLAYWRIGHT_PORT` (assigned by Orchestrator)
> **Checkpoints:** 3

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M02 | Seeded generation | `src/domain/random/generators.ts` | `GeneratedRouteOffer` display fields (displayName, summary, riskLabel, rewardLabel, counterplay) resolved by catalog at render. |
| M01 | Authored content | `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts` | `getRoom`/`listRooms` resolve display strings by room type; `RoomDefinition` provides mock-matching labels. |
| M03 | Run domain | `src/domain/run/model.ts`, `routes.ts` | `RouteOfferSnapshot`/`LivingRun`/`RouteState` shapes; `isBossDepth`/`cycleForDepth`. |
| M06 | App orchestration | `src/app/appStore.ts`, `commands.ts` | `AppCommand`/`AppState`/`AppStore` from S01; `AppStore` now has route handlers. |
| M07 | UI | `src/ui/screens/HomeScreen.tsx`, `src/ui/components/*` | Existing component patterns (radio groups, accessible controls, save signal); `RouteCard` follows `RouteCardProps` contract from arch/M09. |
| M10 | Styles | `src/styles/tokens.css`, `global.css`, `responsive.css` | Design tokens and existing responsive patterns. |
| M08 | Browser | `tests/e2e/run-lifecycle.spec.ts`, `indexedDb.ts` | Existing e2e harness and IndexedDB reader to extend. |

## Context

S01 committed the pure domain transitions, persistence, and app-store handlers for `MaterializeRoute`, `SelectRouteOffer`, and `CommitRoute`. The store now accepts `route/materialize`, `route/select-offer`, and `route/commit` app commands and persists route/room state. This session builds the visible route-map screen, wires it into the application, adds navigation, styles it per the route-map mock, and extends the browser acceptance journey to prove the full narrow journey.

The route-map mock (`mocks/route-map.html`) shows four route cards in a radiogroup, a commit bar with a selection readout and enter button, and a side panel with boss-lock and route-reading information. The mock uses Tailwind CDN for layout, but production CSS is bundled — this session translates the mock's visual structure into semantic CSS using the existing design tokens.

## Capabilities

### CAP-01 — Browser: materialize and reload
**Integration owner:** S02-CP3. **Proof:** Start a run → the route map screen shows four route cards → reload → the same four cards reappear (offers persisted, not rerolled). IndexedDB `livingRun[current].routeState.offers` has 4 entries.

### CAP-02 — Browser: select and reload
**Integration owner:** S02-CP3. **Proof:** Click a route card → it becomes selected (aria-checked) → reload → the same card is still selected. IndexedDB `routeState.selectedOfferId` matches.

### CAP-03 — Browser: commit to room
**Integration owner:** S02-CP3. **Proof:** Click "Enter selected room" → the living run transitions to room phase → IndexedDB `livingRun[current]` has `phase: "room"`, `routeState: null`, `roomState` populated. The UI may show a brief confirmation or a placeholder (the room screen is the next feature); the proof is the IndexedDB state.

## Contract Agreements

### CA-01 — Route offer display mapping (agreed, producer ready)
**Required meaning:** The UI resolves display fields (displayName, summary, riskLabel, rewardLabel, counterplay) from the catalog by `roomType`, not from the durable record. The durable `RouteOfferSnapshot` carries `offerId`/`roomType`/`roomEventKey`/`riskTier`/`rewardPreviewId`/`visibleCost`/`availability`.

**Producer → consumer:** S01 `RouteOfferSnapshot` (durable) → S02 `RouteMapScreen` (resolves `catalog.listRooms().find(r => r.roomType === offer.roomType)` for display labels).

**Checkpoint-0 recheck:** Read `src/domain/content/rooms.ts` (`ROOM_DEFINITIONS`) and `src/domain/content/catalog.ts` (`listRooms`/`getRoom`). Confirm each `RoomType` maps to exactly one `RoomDefinition` with display fields matching the mock.

### CA-02 / CA-03 — Selection and commit UX
The mock's commit bar shows the selected room name and an "Enter selected room" button. Selecting a card sets `aria-checked`; the commit button is disabled until a selection exists. Committing transitions the run; the screen unmounts or shows a committed state.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/ui/components/RouteCard.tsx` | Create | Accessible route-offer card: radio button with room icon, name, summary, threat/reward/counterplay list, selected state, disabled-when-busy. Resolves display from catalog. |
| `src/ui/screens/RouteMapScreen.tsx` | Create | Route map screen: status bar, path/cycle indicator, radiogroup of `RouteCard`s, commit bar with selection readout + enter button, side panel (boss lock, route reading). Dispatches `route/select-offer` and `route/commit`. Auto-dispatches `route/materialize` on mount if offers empty. |
| `src/ui/screens/RouteMapScreen.test.tsx` | Create | Component tests: renders 4 cards, selection toggles aria-checked, commit disabled without selection, commit dispatches `route/commit`, busy disables actions, boss-depth shows 1 card. |
| `src/ui/components/lifecycleComponents.test.tsx` | Modify | Add `RouteCard` tests: selected/unselected states, accessible name, threat/reward labels, disabled state. |
| `src/app/App.tsx` | Modify | Derive `route-map` screen from `AppState` when `livingRun?.phase === "route"` and offers exist; render `RouteMapScreen`; pass catalog + dispatch. |
| `src/app/App.test.tsx` | Modify | Add integration test: start run → route map renders → materialize auto-dispatches → 4 cards → select → commit → room phase (or IndexedDB-confirmed). |
| `src/app/navigation.ts` | Modify | Add `{ id: "route-map" }` to `ScreenDescriptor`; extend `deriveScreen` to return it when `livingRun?.phase === "route"` and `routeState?.offers.length > 0` in checkpoint mode. |
| `src/styles/global.css` | Modify | Add `.route-map`, `.route-card`, `.route-card--selected`, `.route-card--battle/elite/shop/recovery/boss`, `.commit-bar`, `.path-panel`, `.path-step`, route-side-panel styles using tokens. |
| `src/styles/responsive.css` | Modify | Route-map responsive rules: 4-col → 2-col → 1-col, commit-bar stacking, path-panel collapse at phone widths. |
| `tests/e2e/run-lifecycle.spec.ts` | Modify | Add `test.describe("route drafting")` block: start run → route map visible → 4 cards → reload → same cards → select Battle → reload → same selection → enter room → IndexedDB `phase: "room"`, `routeState: null`, `roomState` populated. |
| `tests/e2e/indexedDb.ts` | Modify | Extend `StoredLivingRunRecord` type to include `roomState` fields needed for the commit proof (roomType, status, threatProfile presence). |

## Implementation

### Checkpoint 1 — RouteCard component

Read before create: `src/domain/content/rooms.ts`, `src/domain/content/catalog.ts`, `src/domain/run/model.ts`, `mocks/route-map.html`, `src/ui/components/IntegrityMeter.tsx` (accessible control pattern), `src/styles/tokens.css`.

1. **Create `RouteCard.tsx`**:
   ```typescript
   export interface RouteCardProps {
     readonly offer: RouteOfferSnapshot;
     readonly room: RoomDefinition;        // resolved from catalog by roomType
     readonly isSelected: boolean;
     readonly isBusy: boolean;
     readonly onSelect: () => void;
   }
   ```
   - Render a `<button type="button" role="radio" aria-checked={isSelected}>`.
   - Room icon: a letter glyph derived from `roomType` (B/!/$/+) per mock.
   - Room name: `room.displayName`; summary: `room.summary`.
   - Threat/reward/counterplay list: `room.riskLabel`, `room.rewardLabel`, `room.counterplay`, plus `offer.riskTier` (formatted "0X / 05"), `offer.visibleCost` for shop.
   - `className` includes `route-card route-card--{roomType}` and `route-card--selected` when selected.
   - Disabled when `isBusy`; `aria-disabled` set.
   - Minimum 44px target; visible focus ring (token `--focus-ring-color`).

2. **Add `RouteCard` tests** to `lifecycleComponents.test.tsx`: selected/unselected `aria-checked`, accessible name includes room name, threat/reward labels visible, disabled when busy, click invokes `onSelect`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/ui/components/lifecycleComponents.test.tsx` pass. `RouteCard` renders an accessible selected/unselected radio with catalog display fields.

### Checkpoint 2 — RouteMapScreen, App wiring, and navigation

Read before modify: `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts`, `src/app/appStore.ts`, `src/ui/screens/HomeScreen.tsx`, `mocks/route-map.html`.

1. **Extend `navigation.ts`**:
   ```typescript
   export type ScreenDescriptor =
     | { readonly id: "home"; readonly mode: "archive" }
     | { readonly id: "home"; readonly mode: "checkpoint" }
     | { readonly id: "route-map" };
   ```
   `deriveScreen`: if `loadStatus === "ready"`, `livingRun !== null`, `launchMode === "checkpoint"`, and `livingRun.phase === "route"` and `routeState?.offers.length > 0` → return `{ id: "route-map" }`. Otherwise fall through to existing logic. Also handle: if `phase === "route"` and offers are empty and launchMode is checkpoint → return `home/checkpoint` (the checkpoint view will auto-dispatch materialize; or the route-map screen handles it on mount). Choose: `RouteMapScreen` auto-dispatches `route/materialize` on mount when offers are empty, so `deriveScreen` returns `route-map` for `phase === "route"` in checkpoint mode regardless of offers.

2. **Create `RouteMapScreen.tsx`**:
   ```typescript
   export interface RouteMapScreenViewModel {
     readonly runId: string;
     readonly className: string;
     readonly depth: number;
     readonly cycle: number;
     readonly integrityCurrent: number;
     readonly integrityMaximum: number;
     readonly routeOffers: readonly RouteOfferSnapshot[];
     readonly selectedOfferId: string | null;
     readonly committed: boolean;
     readonly isBusy: boolean;
     readonly saveSignal: SaveSignalView;
     readonly rooms: ReadonlyMap<RoomType, RoomDefinition>; // resolved from catalog
   }
   export interface RouteMapScreenProps {
     readonly model: RouteMapScreenViewModel;
     readonly dispatch: (command: AppCommand) => void;
   }
   ```
   - `useEffect` on mount: if `routeOffers.length === 0` and `!isBusy` → `dispatch({ type: "route/materialize" })`.
   - Render `AppStatusBar` with shards (if available from model) and active run.
   - Path panel: cycle indicator + depth steps (per mock, simplified to current depth + boss-in count).
   - Radiogroup of `RouteCard`s (one per offer). `onSelect` → `dispatch({ type: "route/select-offer", offerId: offer.offerId })`.
   - Commit bar: selection readout (selected room name), "Enter selected room" button → `dispatch({ type: "route/commit" })`. Disabled if no selection or busy.
   - Side panel: boss lock info (if `depth % 3 === 0` show "Boss at this floor"; else "Boss in N floors"), route reading signals.

3. **Modify `App.tsx`**: Extend `createHomeModel` (or add a `createRouteMapModel`) to build the `RouteMapScreenViewModel` from `AppState` + catalog when `deriveScreen(state).id === "route-map"`. Render `<RouteMapScreen>` instead of `<HomeScreen>` for that screen.

4. **Create `RouteMapScreen.test.tsx`**: Component tests using a mock dispatch:
   - Renders 4 route cards for a depth-1 run with materialized offers.
   - Auto-dispatches `route/materialize` on mount when offers empty.
   - Clicking a card dispatches `route/select-offer`.
   - Commit button disabled without selection.
   - Commit button dispatches `route/commit` with selection.
   - Boss-depth run shows 1 card.
   - Busy disables all actions.

5. **Modify `App.test.tsx`**: Extend the memory repository harness with `saveCheckpoint` (mirror `startRun` mock). Add test: start run → wait for route map → 4 cards visible → select Battle → commit → store snapshot `phase === "room"`.

6. **Run**: `npm run typecheck && npm run test:unit -- src/app/App.test.tsx src/ui/screens/RouteMapScreen.test.tsx`.

**Commit when:** `npm run typecheck && npm run test:unit` passes (all 185+ tests). `RouteMapScreen` renders, auto-materializes, selects, and commits through the real store.

### Checkpoint 3 — Styles and browser journey

Read before modify: `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`, `mocks/route-map.html`.

1. **Add route-map styles to `global.css`**: `.route-map`, `.route-map__grid`, `.route-panel`, `.route-cards` (grid `repeat(4, 1fr)`), `.route-card` (flex column, border, radius `--radius-card`), `.route-card--selected` (cyan border + glow), `.route-card--battle/elite/shop/recovery/boss` (route-color via token), `.route-card__icon`, `.route-card__list`, `.commit-bar`, `.path-panel`, `.path-step`, `.path-node`, `.route-side-panel`. Use `--color-signal-*` tokens for room-type accents. Color is never the only state signal (selected also has border + `aria-checked`).

2. **Add responsive rules to `responsive.css`**:
   - `@media (max-width: 980px)`: route-cards → `repeat(2, 1fr)`, side-panel below.
   - `@media (max-width: 620px)`: route-cards → `1fr`, commit-bar stacks vertically, path-panel collapses.
   - `@media (prefers-reduced-motion: reduce)`: no card hover transforms.

3. **Extend `tests/e2e/indexedDb.ts`**: Add `roomState` to `StoredLivingRunRecord` (at least `roomType`, `status`, `threatProfile` presence check, `eventKey`).

4. **Extend `tests/e2e/run-lifecycle.spec.ts`**: Add a `test.describe("route drafting")` block:
   - Start a Circuit Rogue run → expect route-map heading visible.
   - Expect 4 route cards (radiogroup with 4 radios).
   - Reload → same 4 cards (IndexedDB offers match).
   - Click "Battle" card → `aria-checked="true"` → reload → same card selected.
   - Click "Enter selected room" → IndexedDB `livingRun[current].phase === "room"`, `routeState === null`, `roomState.roomType === "battle"`, `roomState.status === "ready"`.
   - Reload → still in room phase with same room.

5. **Run the full gate**: `npm run verify` (must pass).

6. **Run e2e**: `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium`.
   - If it passes → record as `verified` in STATE.md.
   - If localhost binding fails (`EPERM` or similar) → record as `unverified` with cause in STATE.md Verification Baseline; unit/build gate still passes.

**Commit when:** `npm run verify` passes. E2e executed and result recorded (verified or unverified-with-cause). Styles pass Stylelint.

## Verification

**PROGRAM-CONFIG commands (resolved against Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP2 and CP3.**
- `npm run test:unit -- src/ui/screens/RouteMapScreen.test.tsx` — screen tests. **Must pass at CP2.**
- `npm run test:unit -- src/ui/components/lifecycleComponents.test.tsx` — component tests. **Must pass at CP1.**
- `npm run test:unit -- src/app/App.test.tsx` — integration. **Must pass at CP2.**
- `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` — browser journey. **CP3.** Record actual result.

**Integration proofs (CAP/CA):**
- CAP-01 browser proof (S02-CP3): e2e asserts route-map shows 4 cards after start, and reload returns the same offers (IndexedDB `routeState.offers` length 4, same offerIds).
- CAP-02 browser proof (S02-CP3): e2e asserts selecting a card persists `selectedOfferId` across reload.
- CAP-03 browser proof (S02-CP3): e2e asserts commit transitions to `phase: "room"` with populated `roomState` and `routeState: null`, surviving reload.
- CA-01 display mapping proof (S02-CP1): `RouteMapScreen.test.tsx` asserts card names resolve from `catalog.listRooms()` by `roomType`, not from the durable snapshot.

**Build freshness:** The `webServer.command` (`npm run dev -- --host 127.0.0.1 --port <port> --strictPort`) builds the current source revision via Vite dev server. The e2e test loads `http://127.0.0.1:<port>/`.

**Environmental limitation:** If `PLAYWRIGHT_PORT` cannot bind in the sandbox, record the e2e result as `unverified` with the error cause. The unit/component/build gate must still pass. Do not skip `npm run verify`.

## State Update

After CP3, update STATE.md:
- Session 02 status → `done`, checkpoint → 3.
- CAP-01/02/03 → `verified` (if e2e passed) or `planned` with browser proof `unverified` (if e2e blocked by environment). Unit proofs remain `verified`.
- CA-01/02/03 proof → `verified` (unit) + e2e status.
- Record actual test counts, e2e result, any surprises.