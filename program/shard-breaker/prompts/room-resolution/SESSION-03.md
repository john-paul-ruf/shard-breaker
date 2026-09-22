# SESSION-03 — Room screen, reward screen, and browser journey

> **Program:** Shard Breaker
> **Feature:** room-resolution (completion run)
> **Slug:** session-03
> **Summary:** Build the RoomScreen (committed room state with shop/recovery interactions and a combat placeholder), the RewardsScreen (3-card reward draft) and RewardCard component, wire navigation and App routing for room/reward phases, add styles per the combat/rewards mocks, and extend the browser e2e journey to prove room resolution → reward draft → depth advancement durable across reload.
> **Wave:** 2
> **Modules:** M08 (screens), M09 (components), M10 (styles), M13 (e2e), M01 (navigation/App wiring)
> **Depends on:** 02
> **Concurrent with:** —
> **Owns:** `src/ui/screens/RoomScreen.tsx`, `src/ui/screens/RoomScreen.test.tsx`, `src/ui/screens/RewardsScreen.tsx`, `src/ui/screens/RewardsScreen.test.tsx`, `src/ui/components/RewardCard.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/app/navigation.ts`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`
> **Reads:** `src/app/appStore.ts`, `src/app/commands.ts`, `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/rooms.ts`, `src/domain/random/generators.ts`, `src/styles/tokens.css`, `src/ui/components/AppStatusBar.tsx`, `src/ui/components/IntegrityMeter.tsx`, `src/ui/components/SaveSignal.tsx`, `src/ui/screens/RouteMapScreen.tsx`, `src/ui/screens/RouteMapScreen.test.tsx`, `program/shard-breaker/mocks/combat.html`, `program/shard-breaker/mocks/boss.html`, `program/shard-breaker/mocks/rewards.html`
> **Resources:** `PLAYWRIGHT_PORT` (assigned by Orchestrator)
> **Checkpoints:** 3

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | App orchestration | `src/app/appStore.ts`, `commands.ts`, `navigation.ts` | S02's committed `room/buy-shop-item`, `room/commit-recovery`, `room/resolve`, `reward/select` commands and store handlers. |
| M02 | Authored content | `src/domain/content/catalog.ts`, `rooms.ts`, `skills.ts`, `equipment.ts`, `enhancements.ts` | `RoomDefinition`/`ShopServiceDefinition` display fields; skill/equipment/enhancement display names/descriptions for reward cards; `BossRoutingIdentity` display fields for the boss placeholder. |
| M05 | Run domain | `src/domain/run/model.ts`, `routes.ts` | `RoomState`, `RewardState`, `RewardCardSnapshot`, `BuildSnapshot`, `ShopState`, `RecoveryState`, `BossState` shapes; `isBossDepth`. |
| M08/M09 | Screens/components | `src/ui/screens/RouteMapScreen.tsx`, `HomeScreen.tsx`, `src/ui/components/RouteCard.tsx`, `IntegrityMeter.tsx`, `AppStatusBar.tsx`, `SaveSignal.tsx` | Existing screen/component patterns: view model + dispatch props, roving radiogroup, status bar, save signal. |
| M10 | Styles | `src/styles/tokens.css`, `global.css`, `responsive.css` | Design tokens; existing route-card/route-map CSS patterns to extend. |
| M13 | Browser | `tests/e2e/run-lifecycle.spec.ts`, `indexedDb.ts` | Existing e2e harness (`appPage` fixture, `readShardbreakState`, `deleteShardbreakDatabase`) to extend. |

## Context

S02 committed the domain transitions, persistence wiring, and store handlers for `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, and `SelectReward`. The store accepts the four new app commands and persists room/reward state changes atomically. Navigation currently returns `home/checkpoint` for room-phase and reward-phase runs — there is no room or reward screen (verified: `deriveScreen` in `src/app/navigation.ts` returns `CHECKPOINT_SCREEN` for any non-route phase).

Design sources (Author handoff, read-only): `mocks/combat.html` (battle/boss room hierarchy: arena placeholder area, objective panel, Integrity, skill rail, telegraph), `mocks/boss.html` (boss identity card, phase state, counterplay, modifier chips), `mocks/rewards.html` (exactly three equal-weight cards with base reward, enhancement, effect, cost, trade-off, single-choice radiogroup, confirm bar, save note). Production CSS is bundled — translate the mocks' visual structure into semantic CSS using the existing tokens; do not import Tailwind.

Combat rooms (battle/elite/boss) show a "combat engine coming soon" placeholder — the combat domain (M04) and game bridge (M06) do not exist. The resolve action is disabled for combat rooms. Utility rooms (shop/recovery) are fully interactive and resolvable, proving the complete room → reward → next-route journey.

**Fixture precondition for the shop browser journey (planning-authorized):** runs start with `runCurrency: 0` and no committed mechanic grants currency (combat rooms are deferred). The shop journey therefore seeds currency by rewriting the stored living-run record between app loads: write a modified record with `runCurrency: 60` into IndexedDB while the app is not connected, then load/reload the app so it parses and validates the seeded record through the production `parseRunStateRecords` path. The fixture may only change scalar fields (`runCurrency`, `integrityCurrent`) on an otherwise committed, structurally valid record; it must never invent room/reward state. Reload after seeding must render the app normally (validation accepts the record) — that acceptance is itself part of the fixture proof. This is the bounded e2e fixture authority the prior run's final report recorded as an interim disposition; it is restated here as standing authorization.

## Capabilities

### CAP-06 — Room screen
**Approved behavior:** committing a route opens the room screen for the committed room. Shop rooms show the stored inventory with prices, per-item buy buttons, purchased state, currency readout, and a resolve action. Recovery rooms show the recovery offer with current/max Integrity, a commit-recovery action, and a resolve action. Combat rooms (battle/elite/boss) show the room identity, objectives, threat readout, and a non-interactive combat placeholder; resolve is disabled with a stated reason.
**Entry point:** `deriveScreen` returns `{ id: "room" }` for `phase === "room"` in checkpoint mode.
**Rejection/no-change paths:** no interaction can dispatch a command the domain would reject (buy button disabled when already purchased/insufficient currency/busy; recovery commit disabled when already committed/busy; resolve disabled for combat rooms and while busy).
**Integration owner:** CP1 (component), CP2 (App wiring), CP3 (browser).

### CAP-07 — Reward screen
**Approved behavior:** after resolve, the reward screen shows exactly three `RewardCard`s with fully revealed base reward (catalog-resolved name/description), enhancement names/descriptions (catalog-resolved), material cost, and capacity guidance; cards are a single-choice radiogroup; the confirm action dispatches `reward/select` with the selected `cardId` and is disabled without a selection or while busy.
**Entry point:** `deriveScreen` returns `{ id: "reward" }` for `phase === "reward"` in checkpoint mode.
**Integration owner:** CP2 (component + wiring), CP3 (browser).

### CAP-02..05 — Browser proofs (durability + never-reroll)
**Integration owner:** CP3. Proofs (Chromium project, real app, IndexedDB inspected via the committed reader):
- **Shop journey:** start run → route map → select shop → commit → room screen shows inventory → buy item → currency readout decreases → resolve → reward screen shows 3 cards → select card → confirm → route map at depth 2 with materialized offers → reload → same depth, same offers, build contains the reward, purchase still present.
- **Recovery journey:** start run → select recovery → commit → commit recovery → integrity readout increases (or stays at max — use a run at full Integrity to prove the clamp shows "no further restore" plus the committed state) → resolve → select card → depth 2 → reload preserves state.
- **IndexedDB assertions:** after resolve `phase === "reward"`, `rewardState.cards.length === 3`, `roomState === null`; after select `phase === "route"`, `rewardState === null`, `depth` incremented, `routeState.offers` populated for the new depth, `routeState.eventKey === route:content-1:<runId>:<newDepth>`.
- **Reload determinism:** the reward draft is identical before and after reload (same `cardId`s — never-reroll proof for CA-01).

## Contract Agreements

### CA-01 — Reward card display mapping (agreed, producer ready; display proof here)
The durable `RewardCardSnapshot` carries `cardId`, `baseRewardId`, `rewardType`, `enhancementIds`, `rolledParams`, `materialCost`, `tradeoffId` — no display strings. The UI resolves display fields from the catalog: `catalog.getSkill(baseRewardId)` or `catalog.getEquipment(baseRewardId)` (by `rewardType`) for name/description, `catalog.getEnhancement(id)` for each enhancement's name/description, and never parses meaning from ID strings. Unknown IDs must not render fabricated text — a failed lookup renders the bounded "unknown content" treatment (and would be a defect to report, since CA-01 guarantees catalog-valid IDs).
**Producer → consumer:** S02 reducer `RewardState.cards` (durable) → this session's `RewardsScreen`/`RewardCard` (catalog-resolved display).
**Checkpoint-0 recheck:** read `src/domain/content/skills.ts`, `equipment.ts`, `enhancements.ts`, `catalog.ts` (`getSkill`, `getEquipment`, `getEnhancement` return `ContentLookupResult<T>`); confirm every field the cards render exists on the resolved definitions (`displayName`, `description`; enhancements also `minDepth`/`compatibleRewardType` if displayed).

### CA-02/03/04/05 — Room interaction and resolution UX (agreed; producers = S02, committed)
Room screen dispatches exactly S02's commands: `room/buy-shop-item` (itemId from the stored inventory), `room/commit-recovery`, `room/resolve`, `reward/select` (cardId from the persisted draft). The screen renders from the durable snapshot only (`roomState.shop`, `roomState.recovery`, `rewardState.cards`) — it never regenerates or displays computed-but-unstored values (no recomputed prices, no rerolled drafts). Disabled states and reasons come from the same facts the reducer guards (CA-02: purchased/insufficient; CA-03: already committed; CA-04: combat-not-implemented; CA-05: no selection/busy). **Checkpoint-0 recheck:** read `src/app/commands.ts` for the exact command shapes S02 committed and `src/domain/run/model.ts` for `ShopState`/`RecoveryState`/`RewardState` — do not guess field names.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/ui/components/RewardCard.tsx` | Create | Accessible reward card: `<button role="radio" aria-checked>` with base reward glyph/name/description (resolved by caller from catalog), enhancement list, material cost, capacity note, selected state, disabled-when-busy, 44px target, visible focus. |
| `src/ui/screens/RoomScreen.tsx` | Create | Room screen: status bar, room header (name/type/depth/objectives/threat), shop inventory list with buy buttons, recovery offer with commit button, combat placeholder, resolve ("Advance to reward draft") action. |
| `src/ui/screens/RoomScreen.test.tsx` | Create | Component tests for the three room kinds, busy disabling, dispatch correctness. |
| `src/ui/screens/RewardsScreen.tsx` | Create | Reward screen: status bar, draft header with capacity and determinism note, radiogroup of 3 `RewardCard`s, confirm bar with selection readout + confirm button. |
| `src/ui/screens/RewardsScreen.test.tsx` | Create | Component tests: 3 cards, catalog-resolved names, selection state, confirm dispatch, busy disabling. |
| `src/ui/components/lifecycleComponents.test.tsx` | Modify | Add `RewardCard` tests (selected/unselected, accessible name, enhancement labels, cost, disabled). |
| `src/app/navigation.ts` | Modify | Extend `ScreenDescriptor` with `{ id: "room" }` and `{ id: "reward" }`; `deriveScreen` returns them for the room/reward phases in checkpoint mode. |
| `src/app/App.tsx` | Modify | Add `createRoomModel` / `createRewardsModel` (state + catalog → view models); render `RoomScreen` / `RewardsScreen` for the new descriptors with the existing `ErrorShell` fallback pattern. |
| `src/app/App.test.tsx` | Modify | Extend `deriveScreen` tests for room/reward; add full integration journeys via the memory repository (shop and recovery room → reward → depth 2 route map). |
| `src/styles/global.css` | Modify | Room screen styles (`.room-screen`, `.room-header`, `.room-objectives`, `.room-shop`, `.shop-item`, `.shop-item--purchased`, `.room-recovery`, `.room-combat-placeholder`, `.room-actions`) and reward styles (`.reward-screen`, `.reward-header`, `.reward-cards`, `.reward-card` + modifiers, `.reward-confirm-bar`) using existing tokens; non-color state signals. |
| `src/styles/responsive.css` | Modify | Room/reward responsive rules: cards 3→1 column, shop grid reflow, bars stack, reduced-motion (no hover transforms). |
| `tests/e2e/indexedDb.ts` | Modify | Extend `StoredLivingRunRecord` with `rewardState` (cards length, selectedCardId, status, cardIds) and `build` fields; add a bounded `seedCurrency` helper that rewrites the stored record's scalar `runCurrency` between app loads (structural validation still runs on reload). |
| `tests/e2e/run-lifecycle.spec.ts` | Modify | Add `test.describe("room resolution")` block: shop journey, recovery journey, IndexedDB assertions, reload determinism. |

## Implementation

### Checkpoint 1 — RewardCard component and RoomScreen

Read before create: `src/domain/content/skills.ts`, `equipment.ts`, `enhancements.ts`, `rooms.ts`, `catalog.ts`, `src/domain/run/model.ts` (`RewardCardSnapshot`, `ShopState`, `RecoveryState`, `RoomState`, `BossState`), `src/ui/components/RouteCard.tsx` (accessible radio + keyboard roving pattern), `IntegrityMeter.tsx`, `SaveSignal.tsx`, `src/styles/tokens.css`, `mocks/combat.html`, `mocks/rewards.html`, `mocks/boss.html`.

1. **Create `src/ui/components/RewardCard.tsx`** — display strings are resolved by the caller (the screen), not inside the component; the component takes resolved props:
   ```typescript
   export interface RewardCardProps {
     readonly card: RewardCardSnapshot;
     readonly baseRewardName: string;
     readonly baseRewardDescription: string;
     readonly enhancements: readonly { readonly name: string; readonly description: string }[];
     readonly capacityNote: string;        // e.g. "Fits active slot 2 / 3"
     readonly isSelected: boolean;
     readonly isBusy: boolean;
     readonly onSelect: () => void;
   }
   ```
   - `<button type="button" role="radio" aria-checked={isSelected}>`; accessible name built from base reward name + enhancement names (e.g. `"Reward card 01 // Prism Burst"` — keep names in the accessible name, not only visually).
   - Material cost: `card.materialCost` formatted as a bounded "N room shards" readout; `tradeoffId === null` renders "No trade-off" (truthful for the initial build).
   - `className` includes `reward-card reward-card--{rewardType}` plus `reward-card--selected`; selected state is border + check mark + text, never color alone.
   - Disabled when `isBusy`; keyboard roving pattern as in `RouteCard`.

2. **Create `src/ui/screens/RoomScreen.tsx`**:
   ```typescript
   export interface RoomScreenViewModel {
     readonly runId: string;
     readonly className: string;
     readonly depth: number;
     readonly cycle: number;
     readonly roomType: RoomType;
     readonly roomName: string;             // from catalog RoomDefinition by roomType
     readonly roomSummary: string;
     readonly roomCounterplay: string;
     readonly objectiveIds: readonly ContentId[];
     readonly threatProfile: ThreatProfileSnapshot | null;
     readonly integrityCurrent: number;
     readonly integrityMaximum: number;
     readonly runCurrency: number;
     readonly shop: ShopState | null;
     readonly shopServices: ReadonlyMap<ContentId, ShopServiceDefinition>;
     readonly recovery: RecoveryState | null;
     readonly boss: BossState | null;
     readonly bossIdentityName: string | null;   // catalog.getBoss(archetypeId).displayName
     readonly bossIdentityLabel: string | null;
     readonly roomStatus: "ready" | "in_progress" | "resolved";
     readonly isBusy: boolean;
     readonly saveSignal: SaveSignalView;
   }
   export interface RoomScreenProps {
     readonly model: RoomScreenViewModel;
     readonly dispatch: (command: AppCommand) => void;
   }
   ```
   - `AppStatusBar` with active-run context; room header with `roomName`, type label, depth/cycle; objectives rendered from catalog (`objectiveIds` → `catalog.getRoom`-resolved definitions passed in the view model as a resolved list if needed — resolve display names in `App.tsx`, not in the screen).
   - **Shop content:** one row per `shop.inventory` item: service display name + description from `shopServices`, price, `purchasedItemIds` state ("PURCHASED"), buy button `dispatch({ type: "room/buy-shop-item", itemId })` disabled when purchased, `price > runCurrency`, or busy. Currency readout `runCurrency`.
   - **Recovery content:** offer text (`restoreAmount`), `IntegrityMeter`, commit button `dispatch({ type: "room/commit-recovery" })` disabled when `recovery.committed` or busy (label switches to "Recovery committed" when true — truthful, non-color-only).
   - **Combat content (battle/elite/boss):** room identity + objectives + threat readout (from `threatProfile`) + `boss` identity for boss rooms + a clearly-labeled "Combat engine coming soon" placeholder; resolve disabled with an `aria-describedby` reason; buy/commit controls absent.
   - **Resolve action** ("Advance to reward draft"): `dispatch({ type: "room/resolve" })`; disabled for combat rooms and when busy.

3. **Create `src/ui/screens/RoomScreen.test.tsx`** (`// @vitest-environment jsdom`, pattern of `RouteMapScreen.test.tsx`; construct models from the real `createContentCatalog()` + hand-built `RoomState` fixtures):
   - Shop room renders inventory items with names/prices from the catalog services; buy button dispatches `room/buy-shop-item` with the itemId; purchased items show as purchased and disabled; currency readout rendered; resolve dispatches `room/resolve`.
   - Recovery room renders the offer; commit dispatches `room/commit-recovery`; committed state disables the commit and labels it truthfully; resolve dispatches `room/resolve`.
   - Combat room (battle and boss fixtures): placeholder text visible, no buy/commit controls, resolve disabled with the reason.
   - Busy disables all actions and no dispatch occurs on click.
   - Boss room renders the boss identity name/label from catalog.

4. **Add `RewardCard` tests** to `lifecycleComponents.test.tsx`: selected/unselected `aria-checked`, accessible name includes the reward name, enhancement names/descriptions visible, material cost visible, disabled when busy, click invokes `onSelect`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/ui/screens/RoomScreen.test.tsx src/ui/components/lifecycleComponents.test.tsx` passes. `RewardCard` and `RoomScreen` render accessible, catalog-resolved content with correct dispatch.

### Checkpoint 2 — RewardsScreen, navigation, App wiring, integration

Read before modify: `src/app/App.tsx`, `App.test.tsx`, `src/app/navigation.ts`, `src/app/appStore.ts` (command shapes), `src/ui/screens/RouteMapScreen.tsx` (composition pattern), `mocks/rewards.html`.

1. **Extend `navigation.ts`**:
   ```typescript
   export type ScreenDescriptor =
     | { readonly id: "home"; readonly mode: "archive" }
     | { readonly id: "home"; readonly mode: "checkpoint" }
     | { readonly id: "route-map" }
     | { readonly id: "room" }
     | { readonly id: "reward" };
   ```
   `deriveScreen`: in checkpoint mode with a living run — `phase === "route"` → existing logic (route-map when offers exist, else home/checkpoint); `phase === "room"` → `{ id: "room" }`; `phase === "reward"` → `{ id: "reward" }`. Order the phase checks before the existing route-phase branch and keep the archive fallbacks unchanged. Note: `home/checkpoint` remains reachable only when the route phase has no offers yet — the room and reward phases now have their own screens.

2. **Create `src/ui/screens/RewardsScreen.tsx`**:
   ```typescript
   export interface RewardsScreenViewModel {
     readonly runId: string;
     readonly className: string;
     readonly depth: number;
     readonly cycle: number;
     readonly rewardCards: readonly RewardCardSnapshot[];
     readonly selectedCardId: string | null;
     readonly isBusy: boolean;
     readonly saveSignal: SaveSignalView;
     readonly resolvedCards: ReadonlyMap<string, {
       readonly name: string;
       readonly description: string;
       readonly enhancements: readonly { readonly name: string; readonly description: string }[];
       readonly capacityNote: string;
     }>;
   }
   export interface RewardsScreenProps {
     readonly model: RewardsScreenViewModel;
     readonly dispatch: (command: AppCommand) => void;
   }
   ```
   - Draft header per the mock: heading ("Draft the signal."), capacity readout (`N / 3 active · N / 4 passive` from the living run's build), and the determinism note ("Three outcomes. One pick." + "seeded · no reroll on refresh").
   - Radiogroup of exactly three `RewardCard`s (`reward/select` dispatch carries the `cardId`).
   - Confirm bar: selected card name readout; "Confirm draft" button dispatches `{ type: "reward/select", cardId: selectedCardId }` (S02's `SelectReward` selects and applies in one command — confirm IS select); disabled without selection or when busy; `aria-describedby` with the disabled reason.
   - `SaveSignal` for committed/rejected feedback.

3. **Modify `App.tsx`**: add `createRoomModel(state, catalog)` and `createRewardsModel(state, catalog)` following `createRouteMapModel` (fail with a bounded message when the living run/room/reward state is missing rather than rendering a blank screen); resolve catalog display data (`roomName` via `catalog.listRooms().find(roomType)`, shop services map, boss identity, reward card names/enhancements, capacity notes from build lengths) and render `<RoomScreen>` / `<RewardsScreen>` for the new descriptors with the existing `ErrorShell` fallback.

4. **Create `src/ui/screens/RewardsScreen.test.tsx`**: renders 3 cards; card names resolve from the catalog fixtures (assert a known skill name and a known equipment name from `SKILL_DEFINITIONS`/`EQUIPMENT_DEFINITIONS` — e.g. "Prism Burst", "Fractal Core"); selection toggles `aria-checked`; confirm disabled without selection; confirm dispatches `reward/select` with the selected `cardId`; busy disables all actions; capacity note reflects the passed build counts.

5. **Extend `src/app/App.test.tsx`**: extend the `deriveScreen` describe block with room-phase (`{ id: "room" }`) and reward-phase (`{ id: "reward" }`) assertions (reuse the existing `state()`/`makeLivingRun` helpers with hand-built phase state). Add integration tests through the real store + memory repository: start → route map → select shop → commit → room screen visible (shop inventory rendered) → buy → resolve → reward screen visible (3 cards) → select + confirm → route map at depth 2 with new offers. Repeat an abbreviated recovery journey. Note the memory repository in this file already implements all five lifecycle methods including `saveCheckpoint`.

6. **Run**: `npm run typecheck && npm run test:unit` (full suite must pass).

**Commit when:** `npm run typecheck && npm run test:unit` passes (all tests, 260+ existing plus new). Navigation routes room/reward phases to the new screens; the store-driven integration journeys pass.

### Checkpoint 3 — Styles and browser journey

Read before modify: `src/styles/global.css` (route-map/route-card sections as the pattern), `responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`, `mocks/combat.html`, `mocks/rewards.html`, `mocks/boss.html`.

1. **Room styles in `global.css`**: `.room-screen`, `.room-header`, `.room-objectives`, `.room-shop`, `.shop-item` (grid: name/description/price/action), `.shop-item--purchased` (disabled + check), `.room-recovery`, `.room-combat-placeholder` (muted, dashed border), `.room-actions`. Use `--color-*`, `--space-*`, `--radius-*`, `--font-mono` tokens; state via border/attribute/text, never color alone.

2. **Reward styles in `global.css`**: `.reward-screen`, `.reward-header`, `.reward-cards` (grid `repeat(3, 1fr)`), `.reward-card` (flex column, 1px border, radius `--radius-card`), `.reward-card--selected` (cyan border + `--glow-cyan` + check mark), `.reward-card--skill` / `.reward-card--equipment` (accent via signal tokens), `.reward-card__enhancement` (left magenta rule per mock), `.reward-confirm-bar`.

3. **Responsive rules in `responsive.css`**: `@media (max-width: 980px)` — reward cards `repeat(3, minmax(220px, 1fr))` with horizontal scroll allowance; shop grid 2 columns. `@media (max-width: 620px)` — reward cards and shop items stack to `1fr`; confirm/resolve bars stack vertically; 44px targets preserved. `@media (prefers-reduced-motion: reduce)` — no card hover transforms; static borders/labels persist.

4. **Extend `tests/e2e/indexedDb.ts`**: add `rewardState` (nullable: `cards` array of `{ cardId, baseRewardId, rewardType }`, `selectedCardId`, `status`) and `build` (`activeSkillIds`, `passiveEquipmentIds`) to `StoredLivingRunRecord`; add `seedLivingRunCurrency(page, amount)` — a bounded helper that opens the DB outside the app's connection, reads `livingRun[current]`, rewrites **only** `runCurrency` (and optionally `integrityCurrent`) on the parsed record, writes it back, and closes; document that the helper runs between app loads only and that reload validation through the production parser is part of the fixture contract.

5. **Extend `tests/e2e/run-lifecycle.spec.ts`** with a `test.describe("room resolution")` block using the existing `appPage` fixture and helpers (`startCircuitRogue`):
   - **Shop journey:** start → wait for route cards → select the shop card → commit → room screen (heading + inventory + "Integrity Patch" row) → reseed currency via the reload fixture if needed → buy "Integrity Patch" → currency readout reflects the deduction → resolve → reward screen with 3 cards → select the first card → confirm → route map heading at depth 2 → IndexedDB: `phase: "route"`, `depth: 2`, `routeState.eventKey` matches `route:content-1:<runId>:2`, offers length 4, build contains the selected `baseRewardId`, `runCurrency` decreased, purchase in `roomState`... (note: roomState is nulled after resolve — assert the purchase's durable trace via the pre-resolve read instead) → reload → resume → same depth/offers/build.
   - **Recovery journey:** start → select recovery → commit → commit recovery → integrity readout unchanged at max (clamp proof: full-integrity run stays at max, "Recovery committed" state persists) → resolve → reward screen → select + confirm → depth 2 → reload preserves.
   - **Reload determinism:** after resolve, read `rewardState.cards` cardIds → reload → resume → the reward screen shows the same cardIds (never-reroll proof for CA-01) — fold into the shop journey or a dedicated test.
   - **Combat placeholder:** select battle → commit → room screen shows the placeholder and a disabled resolve (assert `aria-disabled`/`disabled` + the reason text).
   - Keep every assertion on roles/names and committed IndexedDB state per the M13 rules; each test gets its own isolated `appPage` context (the fixture deletes the DB per test).

6. **Run the full gate**: `npm run verify` (must pass).

7. **Run e2e**: `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium`. If localhost binding fails environmentally, record `unverified` with the exact error and keep the unit/build gate as the landed proof — but try the assigned port first; the route-drafting run bound localhost successfully.

**Commit when:** `npm run verify` passes; e2e executed and its result recorded (verified or unverified-with-cause); styles pass Stylelint.

## Verification

**PROGRAM-CONFIG commands (resolved against STATE.md Verification Baseline):**
- `npm run verify` — **must pass at CP2 and CP3.**
- `npm run typecheck && npm run test:unit -- src/ui/screens/RoomScreen.test.tsx src/ui/components/lifecycleComponents.test.tsx` — **CP1.**
- `npm run test:unit -- src/ui/screens/RewardsScreen.test.tsx` and `-- src/app/App.test.tsx` — **CP2.**
- `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` — **CP3.** Playwright 1.62 starts Vite (`npm run dev`) on the assigned port with `--strictPort`; this is a dev-server build of the current source revision (freshness note for the evidence record).

**Integration proofs (CAP/CA):**
- CAP-06 (CP1 component / CP2 wiring / CP3 browser): shop inventory + buy, recovery offer + commit, combat placeholder + disabled resolve all render from durable state and dispatch S02's commands; e2e asserts the real screens.
- CAP-07 (CP2 / CP3): exactly 3 catalog-resolved cards, radiogroup selection, confirm dispatch; e2e asserts the reward screen on the real journey.
- CAP-02 browser proof (CP3): purchase decreases `runCurrency` in IndexedDB and survives reload.
- CAP-03 browser proof (CP3): recovery commit persists `recovery.committed`/`commitId` and the clamp behavior (integrity stays ≤ max).
- CAP-04 browser proof (CP3): resolve → `phase: "reward"`, `rewardState.cards` length 3, `roomState: null`; reload returns the same draft (CA-01 never-reroll).
- CAP-05 browser proof (CP3): select → `phase: "route"`, `depth` incremented, `routeState.offers` for the new depth, build contains the reward; all surviving reload.
- CA-01 display proof (CP1/CP2): component tests assert catalog-resolved names (`getSkill`/`getEquipment`/`getEnhancement`), not snapshot copies; the CP3 reload determinism test is the durability proof.
- CA-02..05 UI-contract proof (CP1/CP2): disabled states and dispatch payloads match the reducer guards and command shapes from S02.

**Build freshness:** e2e serves `npm run dev -- --host 127.0.0.1 --port <port> --strictPort` from the current working tree — record the served revision identity (commit + test count) with the evidence. No preview server is involved.

## State Update

After CP3, report through the Handoff section (Orchestrator updates STATE.md): session 03 `done` at checkpoint 3; CAP-02..05 browser proofs `verified` (or `unverified` with cause if localhost binding fails); CAP-06/07 `verified`; CA-01 durability proof `verified` if the reload determinism test landed; record test counts, e2e result, port, and any surprises.