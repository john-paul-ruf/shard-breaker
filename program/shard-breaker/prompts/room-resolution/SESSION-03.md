# SESSION-03 — Room screen, reward screen, and browser journey

> **Program:** Shard Breaker
> **Feature:** room-resolution
> **Slug:** session-03
> **Summary:** Build the RoomScreen (showing committed room state with shop/recovery interactions and combat placeholder), the RewardsScreen (3-card reward draft), and the RewardCard component, wire navigation and App routing for room/reward phases, add styles, and extend the browser e2e journey to prove the full room→reward→next-route flow persists across reload.
> **Wave:** 3
> **Modules:** M08, M09, M01, M10, M13
> **Depends on:** 02
> **Concurrent with:** —
> **Owns:** `src/ui/screens/RoomScreen.tsx`, `src/ui/screens/RoomScreen.test.tsx`, `src/ui/screens/RewardsScreen.tsx`, `src/ui/screens/RewardsScreen.test.tsx`, `src/ui/components/RewardCard.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/app/navigation.ts`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`
> **Reads:** `src/app/appStore.ts`, `src/app/commands.ts`, `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/rooms.ts`, `src/domain/random/generators.ts`, `src/styles/tokens.css`, `src/ui/components/AppStatusBar.tsx`, `src/ui/components/IntegrityMeter.tsx`, `src/ui/components/SaveSignal.tsx`, `src/ui/screens/RouteMapScreen.tsx`
> **Resources:** `PLAYWRIGHT_PORT` (assigned by Orchestrator)
> **Checkpoints:** 3

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M01 | App orchestration | `src/app/appStore.ts`, `commands.ts`, `navigation.ts` | `AppCommand`/`AppState`/`AppStore` from S02; store now has room/reward handlers. |
| M02 | Authored content | `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts` | S01's new content types; `RoomDefinition` display fields; skill/equipment/enhancement display names and descriptions for reward cards. |
| M05 | Run domain | `src/domain/run/model.ts`, `routes.ts` | `RoomState`, `RewardState`, `RewardCardSnapshot`, `BuildSnapshot`, `ShopState`, `RecoveryState` shapes; `isBossDepth`/`cycleForDepth`. |
| M08 | Screens | `src/ui/screens/RouteMapScreen.tsx`, `src/ui/screens/HomeScreen.tsx` | Existing screen patterns (view model, dispatch, AppStatusBar, radiogroup, auto-dispatch). |
| M09 | Components | `src/ui/components/RouteCard.tsx`, `src/ui/components/IntegrityMeter.tsx`, `src/ui/components/AppStatusBar.tsx` | Existing component patterns (accessible radio, meter, status bar). |
| M10 | Styles | `src/styles/tokens.css`, `global.css`, `responsive.css` | Design tokens and existing responsive patterns. |
| M13 | Browser | `tests/e2e/run-lifecycle.spec.ts`, `indexedDb.ts` | Existing e2e harness and IndexedDB reader to extend. |

## Context

S02 committed the pure domain transitions, persistence, and app-store handlers for `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, and `SelectReward`. The store now accepts `room/buy-shop-item`, `room/commit-recovery`, `room/resolve`, and `reward/select` app commands and persists room/reward state changes. Navigation currently returns `home/checkpoint` for room-phase runs — there is no room screen.

This session builds the visible room screen (showing the committed room with room-type-specific content), the reward screen (3-card draft), the `RewardCard` component, wires them into the application, adds navigation, styles them per the combat/rewards mocks, and extends the browser acceptance journey to prove the full room→reward→next-route journey.

The combat mock (`mocks/combat.html`) shows an arena with paddle, ball, enemies, skill rail, and a "SIMULATE ROOM CLEAR" prototype link. The rewards mock (`mocks/rewards.html`) shows 3 equal-weight cards with base reward, enhancement, effect, cost, trade-off, and a confirm button. Production CSS is bundled — this session translates the mocks' visual structure into semantic CSS using the existing design tokens.

For combat rooms (battle/elite/boss), the room screen shows a "combat engine coming soon" placeholder — the combat domain (M04) and game bridge (M06) do not exist. The "Advance" (resolve) action is disabled for combat rooms. Utility rooms (shop/recovery) are fully interactive and resolvable.

## Capabilities

### CAP-06 — Room screen
**Integration owner:** S03-CP1. **Proof:** Commit to a shop room → RoomScreen shows shop inventory with prices, a "Buy" button per item, a "Leave shop" (resolve) button. Commit to a recovery room → RoomScreen shows recovery offer with "Commit recovery" and "Skip" (resolve) buttons. Commit to a battle room → RoomScreen shows "combat engine coming soon" with resolve disabled.

### CAP-07 — Reward screen
**Integration owner:** S03-CP2. **Proof:** Resolve a room → RewardsScreen shows 3 RewardCards with base reward name, enhancement description, material cost, and trade-off. Select a card → dispatches `reward/select`. Confirm is disabled without selection.

### CAP-02/03/04/05 — Browser proofs
**Integration owner:** S03-CP3. **Proofs:**
- Shop: start → route map → select shop → commit → room screen → buy item → resolve → reward screen → select card → route map (depth 2) → reload preserves all state.
- Recovery: start → route map → select recovery → commit → room screen → commit recovery → resolve → reward screen → select card → route map (depth 2) → reload preserves all state.
- IndexedDB assertions: `phase`, `rewardState.cards` (3 cards), `depth` incremented, `routeState.offers` for new depth.

## Contract Agreements

### CA-01 — Reward card display mapping (agreed, producer ready)
The UI resolves display fields (displayName, description, effectKey) from the catalog by `baseRewardId` (skill or equipment) and `enhancementId`s, not from the durable `RewardCardSnapshot`. The durable snapshot carries `cardId`, `baseRewardId`, `rewardType`, `enhancementIds`, `rolledParams`, `materialCost`, `tradeoffId`.

**Producer → consumer:** S02 `RewardCardSnapshot` (durable) → S03 `RewardsScreen`/`RewardCard` (resolves `catalog.getSkill(baseRewardId)` or `catalog.getEquipment(baseRewardId)` and `catalog.getEnhancement(id)` for display labels).

**Checkpoint-0 recheck:** Read `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/catalog.ts`. Confirm each `baseRewardId` maps to a `SkillDefinition` or `EquipmentDefinition` with display fields, and each `enhancementId` maps to an `EnhancementDefinition` with display fields.

### CA-02/03/04/05 — Room interaction and resolution UX
The room screen shows room-type-specific content. For shop rooms: inventory list with prices, buy buttons, purchased state, and a resolve button. For recovery rooms: recovery offer, commit button, and a resolve button. For combat rooms: placeholder with disabled resolve. The reward screen shows 3 cards as a radiogroup with a confirm button. Selection dispatches `reward/select`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/ui/components/RewardCard.tsx` | Create | Accessible reward card: radio button with base reward name/icon, enhancement description, material cost, trade-off, selected state, disabled-when-busy. Resolves display from catalog. |
| `src/ui/screens/RoomScreen.tsx` | Create | Room screen: status bar, room header (name, type, objectives), room-type-specific content (shop inventory / recovery offer / combat placeholder), resolve button. Dispatches `room/buy-shop-item`, `room/commit-recovery`, `room/resolve`. |
| `src/ui/screens/RoomScreen.test.tsx` | Create | Component tests: shop room renders inventory + buy + resolve; recovery room renders offer + commit + resolve; combat room renders placeholder + disabled resolve; busy disables actions; dispatch commands. |
| `src/ui/screens/RewardsScreen.tsx` | Create | Reward screen: status bar, draft header, radiogroup of `RewardCard`s, confirm bar with selection readout + confirm button. Dispatches `reward/select`. |
| `src/ui/screens/RewardsScreen.test.tsx` | Create | Component tests: renders 3 cards, selection toggles aria-checked, confirm disabled without selection, confirm dispatches `reward/select`, busy disables actions. |
| `src/ui/components/lifecycleComponents.test.tsx` | Modify | Add `RewardCard` tests: selected/unselected states, accessible name, enhancement labels, cost display, disabled state. |
| `src/app/navigation.ts` | Modify | Add `{ id: "room" }` and `{ id: "reward" }` to `ScreenDescriptor`; extend `deriveScreen` to return them for `phase === "room"` and `phase === "reward"` in checkpoint mode. |
| `src/app/App.tsx` | Modify | Build `RoomScreenViewModel` and `RewardsScreenViewModel` from `AppState` + catalog; render `RoomScreen` and `RewardsScreen` for the new screen descriptors. |
| `src/app/App.test.tsx` | Modify | Add integration tests: start → route map → select shop → commit → room screen visible → buy item → resolve → reward screen → select card → route map (depth 2). Add `deriveScreen` tests for room/reward phases. |
| `src/styles/global.css` | Modify | Add `.room-screen`, `.room-shop`, `.shop-item`, `.room-recovery`, `.room-combat-placeholder`, `.reward-screen`, `.reward-cards`, `.reward-card`, `.reward-card--selected`, `.reward-confirm-bar` styles using tokens. |
| `src/styles/responsive.css` | Modify | Room/reward responsive rules: shop grid reflow, reward cards 3→1 column, confirm bar stacking. |
| `tests/e2e/run-lifecycle.spec.ts` | Modify | Add `test.describe("room resolution")` block: shop room full journey, recovery room full journey, IndexedDB assertions for reward state and depth advancement. |
| `tests/e2e/indexedDb.ts` | Modify | Extend `StoredLivingRunRecord` with `rewardState` fields (cards, selectedCardId, status) for the reward proof. |

## Implementation

### Checkpoint 1 — RewardCard component and RoomScreen

Read before create: `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/domain/run/model.ts`, `src/ui/components/RouteCard.tsx` (accessible radio pattern), `src/ui/components/IntegrityMeter.tsx`, `src/styles/tokens.css`, `mocks/combat.html`, `mocks/rewards.html`.

1. **Create `src/ui/components/RewardCard.tsx`**:
   ```typescript
   export interface RewardCardProps {
     readonly card: RewardCardSnapshot;
     readonly baseRewardName: string;      // resolved from catalog
     readonly baseRewardDescription: string;
     readonly enhancementNames: readonly string[];
     readonly enhancementDescriptions: readonly string[];
     readonly isSelected: boolean;
     readonly isBusy: boolean;
     readonly onSelect: () => void;
   }
   ```
   - Render a `<button type="button" role="radio" aria-checked={isSelected}>`.
   - Reward icon: a glyph derived from `rewardType` (◇ for skill, + for equipment).
   - Reward name: `baseRewardName`; description: `baseRewardDescription`.
   - Enhancement section: list `enhancementNames` and `enhancementDescriptions`.
   - Material cost: `card.materialCost` formatted as "N room shards".
   - Trade-off: `card.tradeoffId` (null for initial build — show "No trade-off" or omit).
   - `className` includes `reward-card reward-card--{rewardType}` and `reward-card--selected` when selected.
   - Disabled when `isBusy`; `aria-disabled` set. Minimum 44px target; visible focus ring.

2. **Create `src/ui/screens/RoomScreen.tsx`**:
   ```typescript
   export interface RoomScreenViewModel {
     readonly runId: string;
     readonly className: string;
     readonly depth: number;
     readonly cycle: number;
     readonly roomType: RoomType;
     readonly roomName: string;          // from catalog RoomDefinition
     readonly roomSummary: string;
     readonly objectiveIds: readonly ContentId[];
     readonly threatProfile: ThreatProfileSnapshot | null;
     readonly integrityCurrent: number;
     readonly integrityMaximum: number;
     readonly runCurrency: number;
     readonly shop: ShopState | null;
     readonly recovery: RecoveryState | null;
     readonly boss: BossState | null;
     readonly roomStatus: "ready" | "in_progress" | "resolved";
     readonly isBusy: boolean;
     readonly saveSignal: SaveSignalView;
   }
   export interface RoomScreenProps {
     readonly model: RoomScreenViewModel;
     readonly dispatch: (command: AppCommand) => void;
   }
   ```
   - Render `AppStatusBar` with active run context.
   - Room header: room name, type label, depth/cycle, objectives.
   - **Shop room content:** inventory list. Each item shows `ShopServiceDefinition` display name, price, purchased state. "Buy" button per item → `dispatch({ type: "room/buy-shop-item", itemId })`. Disabled if already purchased, insufficient currency, or busy.
   - **Recovery room content:** recovery offer. Show `restoreAmount`, current/max Integrity (using `IntegrityMeter`). "Commit recovery" button → `dispatch({ type: "room/commit-recovery" })`. Disabled if already committed or busy.
   - **Combat room content (battle/elite/boss):** "Combat engine coming soon" placeholder. No buy/commit/resolve actions enabled.
   - **Resolve button** ("Advance to reward draft"): `dispatch({ type: "room/resolve" })`. Disabled for combat rooms, disabled when busy, disabled when room is resolved.

3. **Create `RoomScreen.test.tsx`**: Component tests using mock dispatch:
   - Shop room: renders inventory items with prices, buy button dispatches `room/buy-shop-item`, purchased items show as purchased, resolve button dispatches `room/resolve`.
   - Recovery room: renders recovery offer, commit button dispatches `room/commit-recovery`, resolve button dispatches `room/resolve`.
   - Combat room: renders "combat engine coming soon", resolve button is disabled.
   - Busy disables all actions.
   - Room name resolves from catalog by `roomType`.

4. **Add `RewardCard` tests** to `lifecycleComponents.test.tsx`: selected/unselected `aria-checked`, accessible name includes reward name, enhancement labels visible, material cost visible, disabled when busy, click invokes `onSelect`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/ui/screens/RoomScreen.test.tsx src/ui/components/lifecycleComponents.test.tsx` pass. `RewardCard` and `RoomScreen` render accessible, catalog-resolved content with correct dispatch.

### Checkpoint 2 — RewardsScreen, App wiring, and navigation

Read before modify: `src/app/App.tsx`, `src/app/App.test.tsx`, `src/app/navigation.ts`, `src/app/appStore.ts`, `src/ui/screens/RouteMapScreen.tsx`, `mocks/rewards.html`.

1. **Extend `navigation.ts`**:
   ```typescript
   export type ScreenDescriptor =
     | { readonly id: "home"; readonly mode: "archive" }
     | { readonly id: "home"; readonly mode: "checkpoint" }
     | { readonly id: "route-map" }
     | { readonly id: "room" }
     | { readonly id: "reward" };
   ```
   `deriveScreen`: if `phase === "room"` in checkpoint mode → return `{ id: "room" }`. If `phase === "reward"` in checkpoint mode → return `{ id: "reward" }`. Otherwise fall through to existing logic.

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
     readonly catalog: ContentCatalog;  // for resolving display fields
   }
   export interface RewardsScreenProps {
     readonly model: RewardsScreenViewModel;
     readonly dispatch: (command: AppCommand) => void;
   }
   ```
   - Render `AppStatusBar` with active run context.
   - Draft header: "Draft the signal", depth/cycle, "Three outcomes. One pick." seed/determinism note.
   - Radiogroup of `RewardCard`s (3 cards). `onSelect` → `dispatch({ type: "reward/select", cardId: card.cardId })`.
   - Confirm bar: selection readout (selected card name), "Confirm draft" button → `dispatch({ type: "reward/select", cardId: selectedCardId })` (or a separate confirm action if the model requires two steps — check S02's `SelectReward`: it selects and applies in one command, so the confirm IS the select). Disabled if no selection or busy.
   - Resolve display fields from catalog: `catalog.getSkill(baseRewardId)` or `catalog.getEquipment(baseRewardId)` for name/description; `catalog.getEnhancement(id)` for each enhancement.

3. **Modify `App.tsx`**: Add `createRoomModel` and `createRewardsModel` functions. Build the view models from `AppState` + catalog. Render `<RoomScreen>` for `{ id: "room" }` and `<RewardsScreen>` for `{ id: "reward" }`.

4. **Create `RewardsScreen.test.tsx`**: Component tests:
   - Renders 3 reward cards.
   - Card names resolve from catalog (skill/equipment display names).
   - Selection toggles `aria-checked`.
   - Confirm dispatches `reward/select`.
   - Busy disables all actions.

5. **Modify `App.test.tsx`**: Add integration test: start → route map → select shop → commit → room screen → buy item → resolve → reward screen → 3 cards visible → select card → route map (depth 2) with new offers. Add `deriveScreen` tests for room and reward phases.

6. **Run**: `npm run typecheck && npm run test:unit` (all tests must pass).

**Commit when:** `npm run typecheck && npm run test:unit` passes (all 244+ tests). `RewardsScreen` renders, selects, and confirms through the real store. Navigation routes to room and reward screens.

### Checkpoint 3 — Styles and browser journey

Read before modify: `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts`, `mocks/combat.html`, `mocks/rewards.html`.

1. **Add room styles to `global.css`**: `.room-screen`, `.room-header`, `.room-objectives`, `.room-shop`, `.shop-item`, `.shop-item--purchased`, `.room-recovery`, `.room-combat-placeholder`, `.room-actions` using tokens. Shop items show price, purchased state (disabled, checkmark), buy button. Recovery shows offer text and commit button. Combat placeholder shows muted message.

2. **Add reward styles to `global.css`**: `.reward-screen`, `.reward-header`, `.reward-cards` (grid `repeat(3, 1fr)`), `.reward-card` (flex column, border, radius `--radius-card`), `.reward-card--selected` (cyan border + glow), `.reward-card--skill/equipment` (accent via token), `.reward-card__enhancement`, `.reward-confirm-bar`. Color is never the only state signal (selected also has border + `aria-checked`).

3. **Add responsive rules to `responsive.css`**:
   - `@media (max-width: 980px)`: reward cards → `repeat(3, minmax(220px, 1fr))` with horizontal scroll if needed; room shop grid → 2 columns.
   - `@media (max-width: 620px)`: reward cards → `1fr` stacked; room shop → `1fr`; confirm/resolve bars stack vertically.
   - `@media (prefers-reduced-motion: reduce)`: no card hover transforms.

4. **Extend `tests/e2e/indexedDb.ts`**: Add `rewardState` fields to `StoredLivingRunRecord`: `rewardState` (nullable, with `cards` length, `selectedCardId`, `status`).

5. **Extend `tests/e2e/run-lifecycle.spec.ts`**: Add a `test.describe("room resolution")` block:
   - **Shop journey:** Start a Circuit Rogue run → route map → select Shop card → commit → room screen visible → buy "Integrity Patch" → resolve room → reward screen visible → 3 cards → select first card → route map for depth 2 → reload → same depth, same offers, build has the selected reward.
   - **Recovery journey:** Start → route map → select Recovery → commit → room screen → commit recovery → resolve → reward screen → select card → route map (depth 2) → reload → integrity restored, depth advanced.
   - **IndexedDB assertions:** After resolve, `livingRun[current]` has `phase: "reward"`, `rewardState.cards` length 3, `roomState: null`. After select, `phase: "route"`, `rewardState: null`, `depth` incremented, `routeState.offers` for new depth.

6. **Run the full gate**: `npm run verify` (must pass).

7. **Run e2e**: `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium`.
   - If it passes → record as `verified` in STATE.md.
   - If localhost binding fails → record as `unverified` with cause; unit/build gate still passes.

**Commit when:** `npm run verify` passes. E2e executed and result recorded (verified or unverified-with-cause). Styles pass Stylelint.

## Verification

**PROGRAM-CONFIG commands (resolved against Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP2 and CP3.**
- `npm run test:unit -- src/ui/screens/RoomScreen.test.tsx` — room screen tests. **Must pass at CP1.**
- `npm run test:unit -- src/ui/screens/RewardsScreen.test.tsx` — reward screen tests. **Must pass at CP2.**
- `npm run test:unit -- src/ui/components/lifecycleComponents.test.tsx` — component tests. **Must pass at CP1.**
- `npm run test:unit -- src/app/App.test.tsx` — integration. **Must pass at CP2.**
- `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` — browser journey. **CP3.** Record actual result.

**Integration proofs (CAP/CA):**
- CAP-06 browser proof (S03-CP3): e2e asserts room screen shows shop inventory / recovery offer / combat placeholder.
- CAP-07 browser proof (S03-CP3): e2e asserts reward screen shows 3 cards, selection dispatches, confirm advances.
- CAP-02 browser proof (S03-CP3): e2e asserts shop purchase deducts currency (IndexedDB `runCurrency` decreased).
- CAP-03 browser proof (S03-CP3): e2e asserts recovery commit restores integrity (IndexedDB `integrityCurrent` increased).
- CAP-04 browser proof (S03-CP3): e2e asserts resolve transitions to reward phase (IndexedDB `phase: "reward"`, `rewardState.cards` length 3).
- CAP-05 browser proof (S03-CP3): e2e asserts reward selection advances depth (IndexedDB `depth` incremented, `phase: "route"`, `routeState.offers` for new depth), surviving reload.
- CA-01 display mapping proof (S03-CP1): `RewardsScreen.test.tsx` asserts card names resolve from catalog by `baseRewardId`.

**Build freshness:** The `webServer.command` (`npm run dev -- --host 127.0.0.1 --port <port> --strictPort`) builds the current source revision via Vite dev server. The e2e test loads `http://127.0.0.1:<port>/`.

## State Update

After CP3, update STATE.md:
- Session 03 status → `done`, checkpoint → 3.
- CAP-02/03/04/05/06/07 → `verified` (if e2e passed) or `planned` with browser proof `unverified` (if e2e blocked by environment). Unit proofs remain `verified`.
- CA-01/02/03/04/05 proof → `verified` (unit + e2e status).
- Record actual test counts, e2e result, any surprises.