# State Tracker — Shard Breaker / room-resolution

## Program / Feature / Intent / Sessions

- **Program:** Shard Breaker (`shard-breaker`)
- **Feature:** room-resolution
- **Intent:** Build the room screen, utility room resolution (shop/recovery), reward draft generation and selection, and depth advancement so a player can commit to a room, complete it, draft a reward, and advance to the next floor — all durable across reload.
- **Sessions:** 3

## Session Status

| # | Session | Modules | Owns | Status | Checkpoint | Completed | Notes |
|---|---------|---------|------|--------|------------|-----------|-------|
| 01 | Reward content and reward draft generator | M02, M03 | `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/random/generators.ts`, `src/domain/random/generators.test.ts` | pending | — | — | Creates 6-8 skills, 6-8 equipment items, 10-15 enhancement modifiers; adds `generateRewardDraft` to the seeded generators; extends catalog lookups. |
| 02 | Room resolution domain transitions and store wiring | M05, M01, M07 | `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/validation.ts`, `src/domain/run/room.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts` | pending | — | — | Depends on S01. Adds `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, `SelectReward` reducer transitions + store handlers. Relaxes empty-route-depth validation. Reuses `saveCheckpoint` persistence. |
| 03 | Room screen, reward screen, and browser journey | M08, M09, M01, M10, M13 | `src/ui/screens/RoomScreen.tsx`, `src/ui/screens/RoomScreen.test.tsx`, `src/ui/screens/RewardsScreen.tsx`, `src/ui/screens/RewardsScreen.test.tsx`, `src/ui/components/RewardCard.tsx`, `src/ui/components/lifecycleComponents.test.tsx`, `src/app/navigation.ts`, `src/app/App.tsx`, `src/app/App.test.tsx`, `src/styles/global.css`, `src/styles/responsive.css`, `tests/e2e/run-lifecycle.spec.ts`, `tests/e2e/indexedDb.ts` | pending | — | — | Depends on S02. Builds RoomScreen, RewardsScreen, RewardCard; wires navigation for room/reward phases; adds styles; extends e2e. |

## Wave Plan

| Wave | Sessions | Why concurrent |
|------|----------|----------------|
| 1 | 01 | S02 depends on S01's `generateRewardDraft` and new content types. |
| 2 | 02 | S02 consumes S01's committed generator + content. |
| 3 | 03 | S03 consumes S02's committed reducer/store contracts. |

## Dependency Graph

```
S01 ──► S02 ──► S03
```

## Architecture Reference (feature-specific only; full config in PROGRAM-CONFIG)

The functional core / imperative shell is built. `AppStore` serializes commands, injects `commitId`/`now`, invokes the pure `runReducer`, and delegates atomic writes to `RunLifecycleRepository.saveCheckpoint`. The pure generators (`generateRouteOptions`, `generateRoomCandidate`, `generateShopInventory`, `generateThreatProfile`) in M03 are committed, tested, and read-only. The run lifecycle handles `StartRun`, `AbandonRun`, `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute`. After `CommitRoute`, the living run is in `phase: "room"` with a populated `roomState` (status: "ready", combatCheckpoint: null). Navigation returns `home/checkpoint` for room-phase runs — there is no room screen.

This feature adds: reward content (skills, equipment, enhancements), a `generateRewardDraft` generator, room resolution commands (`BuyShopItem`, `CommitRecovery`, `ResolveRoom`, `SelectReward`), store handlers, a `RoomScreen` (showing room state and room-type-specific interactions), a `RewardsScreen` (3-card draft), a `RewardCard` component, navigation for room/reward phases, styles, and browser e2e proofs. Combat rooms (battle/elite/boss) show a "combat engine coming soon" placeholder and cannot be resolved — the combat engine (M04/M06) is the next feature.

## Scope Summary (modules affected, indexed by ID)

| ID | Module | Affected | Reason |
|----|--------|----------|--------|
| M02 | Authored content catalog | Modified (S01) | New `skills.ts`, `equipment.ts`, `enhancements.ts`; catalog lookups for skills/equipment/enhancements. |
| M03 | Seeded generation | Modified (S01) | New `generateRewardDraft` in `generators.ts`. |
| M05 | Run state machine | Modified (S02) | `BuyShopItem`/`CommitRecovery`/`ResolveRoom`/`SelectReward` commands + reducer transitions; relaxation of empty-route-depth validation. |
| M01 | Application shell | Modified (S02+S03) | New app commands + store handlers (S02); navigation + App routing for room/reward (S03). |
| M08 | Screens | Modified (S03) | New `RoomScreen`, `RewardsScreen`. |
| M09 | Components | Modified (S03) | New `RewardCard`. |
| M10 | Styles | Modified (S03) | Room and reward screen CSS. |
| M13 | E2e | Modified (S03) | Room resolution + reward draft browser journey. |

No Author artifact (`specs/`, `mocks/`, `arch/`, migrations) is modified.

## Design Decisions (choice + rationale)

1. **Reward content is created in S01, not by a separate Author session.** The skills, equipment, and enhancements are authored data definitions (immutable catalog content in M02). No Author handoff exists for them — the arch files describe the shapes but no session created the files. Creating them in a Coder session is the conservative path since they are data, not design decisions. The content counts (6-8 skills, 6-8 equipment, 10-15 enhancements) match the requirements constraints.

2. **Combat rooms cannot be resolved in this feature.** The combat domain (M04) and game bridge (M06) do not exist — `src/domain/combat/` and `src/game/` are absent. Building the full fixed-step physics simulation, Canvas renderer, pointer input, collision detection, and boss phases is a separate feature. The RoomScreen shows a "combat engine coming soon" state for battle/elite/boss rooms, and the resolve action is disabled. Utility rooms (shop/recovery) ARE fully resolvable, proving the complete room → reward → next-route journey.

3. **`ResolveRoom` generates the reward draft and transitions to the reward phase.** The room is marked resolved (status: "resolved", resolutionCommitId set), the reward draft is generated from `(seed, contentVersion, depth, roomEventKey)`, and the phase transitions to "reward". The draft is persisted in `rewardState` before the reward screen displays, so a reload returns the same draft.

4. **`SelectReward` applies the reward, advances depth, and materializes the next route in one transition.** This avoids an invalid intermediate state (empty route at depth > 1, which the current validation rejects). The next floor's route offers are generated and persisted atomically with the reward application, so the route map screen shows the new offers immediately on the next render. The existing `MaterializeRoute` command remains for the initial depth-1 auto-materialize and is not called by `SelectReward` — `SelectReward` calls `generateRouteOptions` directly and maps the results, mirroring the existing `materializeRoute` transition.

5. **Empty-route-depth validation is relaxed.** The current `livingRunSemanticDiagnostics` rejects empty route state at any depth other than 1. This was added to catch a specific edge case but is too strict for the natural advance-then-materialize flow. S02 relaxes this rule to allow empty route state at any depth (the route-map screen's auto-materialize handles populating offers). This is a mechanical correction, not a product-design decision.

6. **Reward application respects build slot limits.** `SelectReward` adds the base reward to `build.activeSkillIds` (max 3) or `build.passiveEquipmentIds` (max 4). If the slot is full, the selection is rejected with a `build-full` rejection code. The generator is context-aware (receives current build slot counts) and avoids generating rewards that don't fit when possible, but the rejection is the authoritative guard.

7. **Recovery is a separate commit from room resolution.** `CommitRecovery` applies the restore amount (clamped to `integrityMax`) and marks `recovery.committed = true`. `ResolveRoom` advances to the reward phase regardless of whether recovery was committed — the player can decline recovery and still advance.

8. **Shop purchases are individual durable actions.** `BuyShopItem` deducts `runCurrency` by the item's price and adds the itemId to `purchasedItemIds`. Repeated purchases of the same item are rejected (`shop-item-already-purchased`). Insufficient currency is rejected (`insufficient-currency`). The room is resolved separately by `ResolveRoom`.

9. **Room status transitions: "ready" → "in_progress" → "resolved".** `BuyShopItem` and `CommitRecovery` set status to "in_progress" (the player has interacted). `ResolveRoom` sets status to "resolved". This matches the model's status enum and the validation rule that resolved status requires a resolutionCommitId.

10. **Enhancement effects are tracked but not applied in gameplay.** The enhancement IDs are stored in `RewardCardSnapshot.enhancementIds` and `rolledParams`, but their gameplay effects (damage modifiers, charge bonuses, etc.) are deferred to the combat engine feature. The reward application only adds the base skill/equipment to the build.

## Verification Baseline

| Gate | Command | Scope | Evidence | Status |
|------|---------|-------|----------|--------|
| Lint | `npm run lint` | ESLint + Stylelint | Inherited from route-drafting: pass (1 pre-existing react-refresh warning for RouteMapScreen.tsx). | verified |
| Types | `npm run typecheck` | `tsc -b --pretty false` | Inherited from route-drafting: pass. | verified |
| Unit/component | `npm run test:unit` | Discovers `src/**/*.test.ts(x)` | Inherited from route-drafting: 244 passed across 13 files. Executed this turn: 244 passed. | verified |
| Production build | `npm run build` | Typecheck + Vite output in `dist/` | Inherited from route-drafting: pass (149 modules, 18.74 kB CSS, 369.95 kB JS). | verified |
| Standard local gate | `npm run verify` | Lint + types + unit + build | Inherited from route-drafting: pass. Executed this turn: pass. | verified |
| Chromium journey | `PLAYWRIGHT_PORT=<assigned> npm run test:e2e -- --project=chromium` | `tests/e2e/run-lifecycle.spec.ts` | Inherited from route-drafting: 12 passed. Localhost binding succeeded in prior run. | verified |

**Known hazards:** None. E2e localhost binding succeeded in the route-drafting run (no EPERM). The `webServer` config starts Vite on the assigned port with `--strictPort`.

**Build freshness:** `npm run build` executed this turn produces `dist/assets/index-LrFxfbH8.js` (369.95 kB) and `dist/assets/index-DRRq2BV-.css` (18.74 kB). E2e builds via `npm run dev` on the assigned port.

## Capability Readiness

| ID | Approved behavior / entry point | Required facts + producer owners | CA IDs / prerequisites | Integration owner / checkpoint | Status | Proof / checked sources | Open gaps + correction owners |
|----|--------------------------------|---------------------------------|------------------------|--------------------------------|--------|-------------------------|-------------------------------|
| CAP-01 | Reward content and draft generator: `generateRewardDraft(catalog, context)` produces exactly 3 unique seeded cards with known content IDs (skills/equipment), enhancement IDs, and material costs. Entry: `generateRewardDraft` in `generators.ts`. | `SkillDefinition` (6-8), `EquipmentDefinition` (6-8), `EnhancementDefinition` (10-15) — produced by S01. `ContentCatalog` lookups — extended by S01. `RewardGenerationContext` (seed, contentVersion, depth, cycle, roomEventKey, roomType, buildSlotCounts) — built from living run. | CA-01 | S01-CP1 (content + catalog), S01-CP2 (generator). | planned | Sources: `generators.ts` (existing generator patterns), `catalog.ts` (existing lookup patterns). | None. |
| CAP-02 | Shop purchase: `BuyShopItem` deducts `runCurrency`, adds itemId to `purchasedItemIds`, persists. Reload preserves purchase. Entry: `room/buy-shop-item` app command → `BuyShopItem` run command → `runReducer` → `saveCheckpoint`. | `RoomState.shop` (inventory, purchasedItemIds) — produced by `CommitRoute` (committed, route-drafting). `runCurrency` — from living run. `itemId` — from shop inventory. | CA-02 | S02-CP1 (domain), S02-CP2 (store). S03-CP3 (browser). | planned | Sources: `model.ts` (`ShopState`), `generators.ts` (`generateShopInventory`). | None. |
| CAP-03 | Recovery commit: `CommitRecovery` applies `restoreAmount` to `integrityCurrent` (clamped to `integrityMax`), marks `recovery.committed`, persists. Entry: `room/commit-recovery` app command → `CommitRecovery` run command → `runReducer` → `saveCheckpoint`. | `RoomState.recovery` (restoreAmount, committed, commitId) — produced by `CommitRoute` (committed, route-drafting). `integrityCurrent`/`integrityMax` — from living run. | CA-03 | S02-CP1 (domain), S02-CP2 (store). S03-CP3 (browser). | planned | Sources: `model.ts` (`RecoveryState`), `content/rooms.ts` (`RECOVERY_RESTORE_AMOUNT = 1`). | None. |
| CAP-04 | Room resolution: `ResolveRoom` marks room resolved, generates reward draft, transitions phase → "reward", persists. Reload returns the same draft. Entry: `room/resolve` app command → `ResolveRoom` run command → `runReducer` → `saveCheckpoint`. | `RoomState` (status, eventKey, roomType) — produced by `CommitRoute` (committed). `generateRewardDraft` — produced by S01 (CAP-01). | CA-01, CA-04 | S02-CP1 (domain), S02-CP2 (store). S03-CP3 (browser). | planned | Sources: `model.ts` (`RoomState.status`, `RewardState`), `generators.ts` (`generateRewardDraft` — S01). | Combat rooms (battle/elite/boss) are blocked — no combat engine. |
| CAP-05 | Reward selection and depth advancement: `SelectReward` applies the selected card to the build, increments depth, materializes the next route, transitions phase → "route", persists. Reload returns the same advanced state. Entry: `reward/select` app command → `SelectReward` run command → `runReducer` → `saveCheckpoint`. | `RewardState` (cards, selectedCardId) — produced by `ResolveRoom` (CAP-04). `generateRouteOptions` — M03, committed. Build slot limits — validated by `validation.ts`. | CA-01, CA-04, CA-05 | S02-CP1 (domain), S02-CP2 (store). S03-CP3 (browser). | planned | Sources: `model.ts` (`BuildSnapshot`, `RewardState`), `reducer.ts` (`materializeRoute` pattern), `validation.ts` (build caps). | None. |
| CAP-06 | Room screen: `RoomScreen` displays the committed room state (objectives, threat, shop/recovery/boss content) with room-type-specific interactions and an "advance" action. Combat rooms show a "coming soon" placeholder. Entry: `deriveScreen` returns `room` for `phase === "room"`. | `RoomState` — from living run. `RoomDefinition` display fields — from catalog. Shop inventory — from `roomState.shop`. Recovery offer — from `roomState.recovery`. | CA-02, CA-03, CA-04 | S03-CP1 (RoomScreen), S03-CP2 (RewardsScreen + wiring). | planned | Sources: `mocks/combat.html`, `mocks/boss.html` (design reference), `RouteMapScreen.tsx` (screen pattern). | Combat rooms show placeholder. |
| CAP-07 | Reward screen: `RewardsScreen` displays exactly 3 `RewardCard`s with fully revealed base reward, enhancement, cost, and trade-off. Selection dispatches `reward/select`. Entry: `deriveScreen` returns `reward` for `phase === "reward"`. | `RewardState.cards` — produced by `ResolveRoom` (CAP-04). `SkillDefinition`/`EquipmentDefinition`/`EnhancementDefinition` display fields — from catalog (S01). | CA-01, CA-05 | S03-CP2 (RewardsScreen + wiring). S03-CP3 (browser). | planned | Sources: `mocks/rewards.html` (design reference), `RouteMapScreen.tsx` (radiogroup pattern). | None. |

**First narrow journey:** Start → route map → select Shop → commit → room screen shows shop inventory → buy an item → resolve room → reward screen shows 3 cards → select a card → route map for depth 2 with materialized offers → reload returns the same advanced state.

## Contract Agreements

| ID | Required meaning / authority | Producer → boundary → consumer | Mapping / constraints | Correction + proof owners / checkpoints | Agreement | Producer | Proof / evidence / checked sources |
|----|------------------------------|--------------------------------|-----------------------|----------------------------------------|-----------|----------|------------------------------------|
| CA-01 | A reward draft persists exactly 3 unique seeded cards for `(runSeed, contentVersion, depth, roomEventKey)`. Cards never reroll on reload. Each card has a known base reward ID, reward type, enhancement IDs, rolled params, and material cost. | S01 `generateRewardDraft` → `RewardState.cards: [RewardCardSnapshot, RewardCardSnapshot, RewardCardSnapshot]` → S02 `runReducer` (`ResolveRoom`) → S03 `RewardsScreen`. | `GeneratedRewardCard` → `RewardCardSnapshot`: keep `cardId`, `baseRewardId`, `rewardType`, `enhancementIds`, `rolledParams`, `materialCost`, `tradeoffId`. `rewardType ∈ {"skill", "equipment"}` for initial build. Each `baseRewardId` must exist in catalog. Each `enhancementId` must exist and be compatible with the reward type. Exactly 3 unique `cardId`s. Draft is persisted before display. | S01-CP2 (generator), S02-CP1 (reducer mapping + persistence), S03-CP3 (browser reload proof). | agreed | planned | planned. Sources: `generators.ts`, `model.ts` (`RewardCardSnapshot`, `RewardState`), `persistence/validation.ts` (`rewardStateSchema`). |
| CA-02 | A shop purchase deducts `runCurrency` by the item's price and adds `itemId` to `purchasedItemIds`. The purchase is durable. Re-purchase rejected. Insufficient currency rejected. | S02 `runReducer` (`BuyShopItem`) → `RoomState.shop.purchasedItemIds` + `LivingRun.runCurrency` → S02 `saveCheckpoint` → S03 `RoomScreen`. | `itemId` must be in `shop.inventory`. `price` from `shop.inventory.find(i => i.itemId === itemId).price`. `runCurrency -= price` (must stay >= 0). `purchasedItemIds` must not already contain `itemId`. Room status → "in_progress". Revision bumps. | S02-CP1 (domain), S02-CP2 (store), S03-CP3 (browser). | agreed | planned | planned. Sources: `model.ts` (`ShopState`), `generators.ts` (`generateShopInventory`). |
| CA-03 | A recovery commit applies `restoreAmount` to `integrityCurrent` (clamped to `integrityMax`), marks `recovery.committed = true` with `commitId`. Durable. Re-commit rejected. | S02 `runReducer` (`CommitRecovery`) → `RoomState.recovery.committed/commitId` + `LivingRun.integrityCurrent` → S02 `saveCheckpoint` → S03 `RoomScreen`. | `restoreAmount` from `roomState.recovery.restoreAmount` (authored as 1). `integrityCurrent = min(integrityCurrent + restoreAmount, integrityMax)`. `recovery.committed` must be false. `recovery.commitId` set to `commitId`. Room status → "in_progress". Revision bumps. | S02-CP1 (domain), S02-CP2 (store), S03-CP3 (browser). | agreed | planned | planned. Sources: `model.ts` (`RecoveryState`), `content/rooms.ts` (`RECOVERY_RESTORE_AMOUNT`). |
| CA-04 | Room resolution marks `roomState.status = "resolved"`, sets `resolutionCommitId`, generates the reward draft, transitions `phase: "room" → "reward"`, populates `rewardState`, nulls `roomState`. Durable. Re-resolve rejected. | S02 `runReducer` (`ResolveRoom`) → `RoomState.status/resolutionCommitId` + `RewardState` + `LivingRun.phase` → S02 `saveCheckpoint` → S03 `RoomScreen`/`RewardsScreen`. | Room must be in "ready" or "in_progress" status. Combat rooms (battle/elite/boss) rejected with `combat-not-implemented`. `resolutionCommitId = commitId`. `rewardState` from `generateRewardDraft(catalog, context)`. `phase: "reward"`, `roomState: null`. `progress.roomsResolved += 1`. Revision bumps. | S02-CP1 (domain), S02-CP2 (store), S03-CP3 (browser). | agreed | planned | planned. Sources: `model.ts` (`RoomState.status`, `RewardState`, `RunPhase`), `generators.ts` (`generateRewardDraft` — S01). |
| CA-05 | Reward selection applies the selected card's base reward to the build, increments depth, materializes the next route, transitions `phase: "reward" → "route"`, nulls `rewardState`, populates `routeState`. Durable. Re-select rejected. | S02 `runReducer` (`SelectReward`) → `BuildSnapshot` + `LivingRun.depth/cycle/routeState` → S02 `saveCheckpoint` → S03 `RewardsScreen`/`RouteMapScreen`. | `selectedCardId` must be in `rewardState.cards`. `rewardState.status` must be "offered" (not already selected/applied). If skill: add to `build.activeSkillIds` (reject if length 3 → `active-skills-full`). If equipment: add to `build.passiveEquipmentIds` (reject if length 4 → `passive-equipment-full`). `depth += 1`, `cycle = cycleForDepth(depth)`. `routeState` from `generateRouteOptions(catalog, context)` mapped to `RouteOfferSnapshot[]`. `phase: "route"`, `rewardState: null`. `rewardState.status = "applied"`, `selectionCommitId = commitId`. Revision bumps. | S02-CP1 (domain), S02-CP2 (store), S03-CP3 (browser). | agreed | planned | planned. Sources: `model.ts` (`BuildSnapshot`, `RewardState`, `RouteState`), `reducer.ts` (`materializeRoute` mapping pattern), `routes.ts` (`cycleForDepth`, `routeEventKey`). |

## Current Blockers

None. All required M03 generators are committed and ready. The reward content (skills/equipment/enhancements) is produced by S01. No unresolved product decisions. No schema/migration change needed — the zod schemas in `persistence/validation.ts` already validate `RewardState` and `RoomState.status`. The `roomStateSchema` already validates `status: "ready" | "in_progress" | "resolved"` and the `resolutionCommitId` coherence rule.

## Handoff Notes (Orchestrator writes here after each session — from Coder's Handoff section, verbatim)