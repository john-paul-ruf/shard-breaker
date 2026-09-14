# SESSION-02 — Room resolution domain transitions and store wiring

> **Program:** Shard Breaker
> **Feature:** room-resolution
> **Slug:** session-02
> **Summary:** Add BuyShopItem, CommitRecovery, ResolveRoom, and SelectReward commands to the pure run reducer with generator-to-snapshot mapping, relax the empty-route-depth validation rule, wire app-store handlers with saveCheckpoint persistence, and prove the full room→reward→next-route journey with unit and store integration tests.
> **Wave:** 2
> **Modules:** M05, M01, M07
> **Depends on:** 01
> **Concurrent with:** —
> **Owns:** `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/validation.ts`, `src/domain/run/room.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`
> **Reads:** `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/run/lifecycle.test.ts`, `src/domain/run/route.test.ts`, `src/domain/random/generators.ts`, `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/validation.ts`, `src/app/navigation.ts`
> **Resources:** —
> **Checkpoints:** 2

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M02 | Authored content | `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts` | S01's new content types and catalog lookups — consumed by the reducer for reward mapping and by `generateRewardDraft`. |
| M03 | Seeded generation | `src/domain/random/generators.ts` | S01's `generateRewardDraft` — consumed by `ResolveRoom`. Existing `generateRouteOptions` — consumed by `SelectReward` for next-route materialization. |
| M05 | Run domain | `src/domain/run/model.ts`, `routes.ts`, `validation.ts`, `lifecycle.test.ts`, `route.test.ts` | `LivingRun`, `RoomState`, `RewardState`, `BuildSnapshot` shapes; `cycleForDepth`, `routeEventKey` helpers; existing test patterns; validation rules to extend/relax. |
| M07 | Persistence | `src/persistence/envelopes.ts`, `repositories.ts`, `validation.ts` | `saveCheckpoint` repository method (reuse, no modification needed); zod schema shapes for `RewardState` and `RoomState.status` (already accept the new states). |
| M01 | App orchestration | `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/navigation.ts` | `AppCommand` union to extend; store handler patterns from route-drafting; `isDurableCommand` and `runRejectionMessage` to extend. |

## Context

S01 committed the reward content (skills, equipment, enhancements) and the `generateRewardDraft` generator. The catalog now exposes `listSkills`/`getSkill`, `listEquipment`/`getEquipment`, `listEnhancements`/`getEnhancement`. The generator produces 3 seeded `GeneratedRewardCard` objects.

The run lifecycle handles `StartRun`, `AbandonRun`, `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute`. After `CommitRoute`, the living run is in `phase: "room"` with a populated `roomState` (status: "ready"). There are no commands to interact with the room, resolve it, generate a reward draft, or advance to the next floor.

The `RoomState` model already has `status: "ready" | "in_progress" | "resolved"`, `shop.purchasedItemIds`, `recovery.committed/commitId`, `resolutionCommitId`. The `RewardState` model already has `cards`, `selectedCardId`, `selectionCommitId`, `status: "offered" | "selected" | "applied"`. The zod schemas in `persistence/validation.ts` already validate all these fields. No schema or migration change is needed.

This session adds four new run commands — `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, `SelectReward` — to the pure reducer, relaxes the empty-route-depth validation rule, wires the app-store handlers, and proves the full journey with unit and store integration tests.

## Capabilities

### CAP-02 — Shop purchase
**Approved behavior:** `BuyShopItem` deducts `runCurrency` by the item's price, adds `itemId` to `purchasedItemIds`, sets room status to "in_progress", bumps revision, and persists. Re-purchase rejected. Insufficient currency rejected.

**Entry point:** `room/buy-shop-item` app command → `BuyShopItem` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `roomState.shop.purchasedItemIds` contains the item; `runCurrency` decreased by the price; `roomState.status === "in_progress"`; revision incremented; reload preserves the purchase.

**Rejection paths:** `shop-item-already-purchased`, `insufficient-currency`, `unknown-shop-item` (itemId not in inventory), `room-not-shop-type`, `room-already-resolved`, `no-living-run`, `stale-run-revision`.

### CAP-03 — Recovery commit
**Approved behavior:** `CommitRecovery` applies `restoreAmount` to `integrityCurrent` (clamped to `integrityMax`), sets `recovery.committed = true` and `recovery.commitId`, sets room status to "in_progress", bumps revision, and persists. Re-commit rejected.

**Entry point:** `room/commit-recovery` app command → `CommitRecovery` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `integrityCurrent` increased (clamped); `recovery.committed === true`; `recovery.commitId` set; `roomState.status === "in_progress"`; revision incremented; reload preserves the commit.

**Rejection paths:** `recovery-already-committed`, `room-not-recovery-type`, `room-already-resolved`, `no-living-run`, `stale-run-revision`.

### CAP-04 — Room resolution
**Approved behavior:** `ResolveRoom` marks room as resolved (status → "resolved", `resolutionCommitId` set), generates the reward draft from `generateRewardDraft`, transitions `phase: "room" → "reward"`, populates `rewardState`, nulls `roomState`, increments `progress.roomsResolved`, bumps revision, and persists. Reload returns the same draft.

**Entry point:** `room/resolve` app command → `ResolveRoom` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `phase === "reward"`, `roomState === null`, `rewardState !== null` with 3 cards; `progress.roomsResolved` incremented; revision incremented; reload returns the same reward state.

**Rejection paths:** `room-already-resolved` (status is "resolved"), `combat-not-implemented` (roomType is battle/elite/boss), `no-living-run`, `stale-run-revision`.

### CAP-05 — Reward selection and depth advancement
**Approved behavior:** `SelectReward` applies the selected card's base reward to the build, increments depth, materializes the next route (calls `generateRouteOptions` and maps to `RouteOfferSnapshot[]`), transitions `phase: "reward" → "route"`, nulls `rewardState`, populates `routeState` with the new depth's offers, bumps revision, and persists. Reload returns the same advanced state.

**Entry point:** `reward/select` app command → `SelectReward` run command → `runReducer` → `saveCheckpoint`.

**Observable success:** `phase === "route"`, `rewardState === null`, `routeState !== null` with offers for the new depth; `depth` incremented; `cycle` updated; build contains the selected reward; revision incremented; reload returns the same state.

**Rejection paths:** `reward-already-selected` (status is "selected" or "applied"), `unknown-reward-card` (cardId not in draft), `active-skills-full` (skill reward and 3 active skills), `passive-equipment-full` (equipment reward and 4 passive items), `no-living-run`, `stale-run-revision`.

## Contract Agreements

### CA-01 — Reward draft generation (agreed, producer ready)
S01 committed `generateRewardDraft`. This session's `ResolveRoom` transition calls it and maps `GeneratedRewardDraft` → `RewardState`. The mapping drops no fields (the `GeneratedRewardCard` shape matches `RewardCardSnapshot` exactly). The `rewardState.eventKey` is set to the reward event key; `rewardState.sourceRoomId` is the current `roomState.roomId`; `rewardState.selectedCardId = null`; `rewardState.selectionCommitId = null`; `rewardState.status = "offered"`.

**Checkpoint-0 recheck:** Read `src/domain/random/generators.ts` (`generateRewardDraft`, `GeneratedRewardCard`, `GeneratedRewardDraft`), `src/domain/run/model.ts` (`RewardState`, `RewardCardSnapshot`), `src/persistence/validation.ts` (`rewardStateSchema`, `rewardCardSchema`). Confirm the mapping preserves all fields and the zod schema accepts the result.

### CA-02 — Shop purchase (agreed, producer planned)
See STATE.md CA-02. The `BuyShopItem` transition validates: room is shop type, room not resolved, item in inventory, not already purchased, sufficient currency. It updates `shop.purchasedItemIds` and `runCurrency`.

### CA-03 — Recovery commit (agreed, producer planned)
See STATE.md CA-03. The `CommitRecovery` transition validates: room is recovery type, room not resolved, recovery not committed. It applies `restoreAmount` clamped to `integrityMax`.

### CA-04 — Room resolution (agreed, producer planned)
See STATE.md CA-04. The `ResolveRoom` transition validates: room not resolved, room is utility type (shop/recovery — combat rejected). It calls `generateRewardDraft` and maps to `RewardState`.

### CA-05 — Reward selection and depth advancement (agreed, producer planned)
See STATE.md CA-05. The `SelectReward` transition validates: reward status is "offered", cardId is in draft, build has room for the reward type. It applies the reward, increments depth, materializes the next route via `generateRouteOptions`.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/run/commands.ts` | Modify | Add `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, `SelectReward` to `RunCommand` union; add rejection codes (`shop-item-already-purchased`, `insufficient-currency`, `unknown-shop-item`, `room-not-shop-type`, `room-not-recovery-type`, `room-already-resolved`, `recovery-already-committed`, `combat-not-implemented`, `reward-already-selected`, `unknown-reward-card`, `active-skills-full`, `passive-equipment-full`); `save-checkpoint` persistence instruction is reused (no new instruction needed). |
| `src/domain/run/reducer.ts` | Modify | Add `buyShopItem`, `commitRecovery`, `resolveRoom`, `selectReward` transitions; extend `runReducer` switch; map `GeneratedRewardDraft` → `RewardState`; map `GeneratedRouteOffer` → `RouteOfferSnapshot[]` (reuse `mapRouteOffer`); relax empty-route-depth validation. |
| `src/domain/run/validation.ts` | Modify | Relax `livingRunSemanticDiagnostics`: remove the `invalid-empty-route-depth` rule that rejects empty route state at depth > 1. Keep the `invalid-route-event-key` check. Add validation for `rewardState` phase-state coherence (already partially present). |
| `src/domain/run/room.test.ts` | Create | Unit tests for the four new commands: shop purchase (success, re-purchase, insufficient currency, unknown item, non-shop room, resolved room), recovery commit (success, re-commit, non-recovery room, resolved room), room resolution (utility success with reward draft, combat rejected, already resolved, phase transition, reload preservation via validation), reward selection (success with depth advance, already selected, unknown card, skill slot full, equipment slot full, route materialization for new depth). |
| `src/app/commands.ts` | Modify | Add `room/buy-shop-item` (carries `itemId`), `room/commit-recovery`, `room/resolve`, `reward/select` (carries `cardId`) to `AppCommand`. |
| `src/app/appStore.ts` | Modify | Add handlers: `handleBuyShopItem`, `handleCommitRecovery`, `handleResolveRoom`, `handleSelectReward`; extend `isDurableCommand` and `runRejectionMessage` with new rejection codes. |
| `src/app/appStore.test.ts` | Modify | Add store integration tests: buy shop item → currency deducted; commit recovery → integrity restored; resolve room → reward phase with 3 cards; select reward → route phase with new depth offers; rejections for each. |

## Implementation

### Checkpoint 1 — Domain transitions and validation

Read before modify: `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/run/validation.ts`, `src/domain/run/route.test.ts`, `src/domain/random/generators.ts`, `src/domain/content/catalog.ts`, `src/persistence/validation.ts`.

1. **Extend `RunCommand`** in `commands.ts`:
   ```typescript
   | {
       readonly type: "BuyShopItem";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly itemId: string;
       readonly commitId: string;
       readonly now: number;
     }
   | {
       readonly type: "CommitRecovery";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly commitId: string;
       readonly now: number;
     }
   | {
       readonly type: "ResolveRoom";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly commitId: string;
       readonly now: number;
     }
   | {
       readonly type: "SelectReward";
       readonly runId: string;
       readonly expectedRevision: number;
       readonly cardId: string;
       readonly commitId: string;
       readonly now: number;
     }
   ```
   Add rejection codes listed in the Files table above.

2. **Implement `buyShopItem`** in `reducer.ts`:
   - Validate metadata (reuse `routeCommandMetadataField` pattern, add `itemId` check).
   - Require living run, runId match, revision match (reuse `requireLivingRun`).
   - Require `phase === "room"` and `roomState !== null` else `invalid-state`.
   - Require `roomState.roomType === "shop"` else `room-not-shop-type`.
   - Require `roomState.status !== "resolved"` else `room-already-resolved`.
   - Require `roomState.shop !== null` (it should be non-null for shop rooms).
   - Find item in `roomState.shop.inventory` by `itemId`; if not found → `unknown-shop-item`.
   - Require `!roomState.shop.purchasedItemIds.includes(itemId)` else `shop-item-already-purchased`.
   - Require `run.runCurrency >= item.price` else `insufficient-currency`.
   - Update: `shop.purchasedItemIds = [...purchasedItemIds, itemId]`, `runCurrency = runCurrency - item.price`, `roomState.status = "in_progress"`, revision + 1, `updatedAt = now`, `lastCommitId = commitId`.
   - Persistence: `save-checkpoint`.
   - Validate result with `invalidStateRejection`.

3. **Implement `commitRecovery`**:
   - Validate metadata.
   - Require living run, runId, revision.
   - Require `phase === "room"` and `roomState !== null`.
   - Require `roomState.roomType === "recovery"` else `room-not-recovery-type`.
   - Require `roomState.status !== "resolved"` else `room-already-resolved`.
   - Require `roomState.recovery !== null`.
   - Require `!roomState.recovery.committed` else `recovery-already-committed`.
   - Update: `integrityCurrent = min(integrityCurrent + recovery.restoreAmount, integrityMax)`, `recovery.committed = true`, `recovery.commitId = commitId`, `roomState.status = "in_progress"`, revision + 1, `updatedAt = now`, `lastCommitId = commitId`.
   - Persistence: `save-checkpoint`.

4. **Implement `resolveRoom`**:
   - Validate metadata.
   - Require living run, runId, revision.
   - Require `phase === "room"` and `roomState !== null`.
   - Require `roomState.status !== "resolved"` else `room-already-resolved`.
   - If `roomState.roomType` is "battle", "elite", or "boss" → reject with `combat-not-implemented`.
   - Build `RewardGenerationContext` from the living run: `{ seed, contentVersion, runId, depth, cycle, roomEventKey: roomState.eventKey, roomType: roomState.roomType, activeSkillSlotsUsed: build.activeSkillIds.length, passiveEquipmentSlotsUsed: build.passiveEquipmentIds.length }`.
   - Call `generateRewardDraft(catalog, context)`.
   - Map `GeneratedRewardDraft` → `RewardState`:
     - `eventKey = draft.eventKey`
     - `sourceRoomId = draft.sourceRoomId`
     - `cards = draft.cards.map(mapRewardCard)` (keep all fields; freeze arrays)
     - `selectedCardId = null`, `selectionCommitId = null`, `status = "offered"`.
   - Update: `roomState.status = "resolved"`, `roomState.resolutionCommitId = commitId`, `phase = "reward"`, `roomState = null`, `rewardState = mappedRewardState`, `progress.roomsResolved += 1`, revision + 1, `updatedAt = now`, `lastCommitId = commitId`.
   - Persistence: `save-checkpoint`.

5. **Implement `selectReward`**:
   - Validate metadata (add `cardId` check).
   - Require living run, runId, revision.
   - Require `phase === "reward"` and `rewardState !== null` else `invalid-state`.
   - Require `rewardState.status === "offered"` else `reward-already-selected`.
   - Find card in `rewardState.cards` by `cardId`; if not found → `unknown-reward-card`.
   - If `card.rewardType === "skill"`:
     - Require `build.activeSkillIds.length < 3` else `active-skills-full`.
     - New `activeSkillIds = [...build.activeSkillIds, card.baseRewardId]`.
   - If `card.rewardType === "equipment"`:
     - Require `build.passiveEquipmentIds.length < 4` else `passive-equipment-full`.
     - New `passiveEquipmentIds = [...build.passiveEquipmentIds, card.baseRewardId]`.
   - Compute new depth: `depth + 1`, new cycle: `cycleForDepth(newDepth)`.
   - Build `RouteGenerationContext` for the new depth: `{ seed, contentVersion, runId, depth: newDepth, cycle: newCycle, integrityCurrent, integrityMax, runCurrency, routeEventKey: routeEventKey(runId, contentVersion, newDepth) }`.
   - Call `generateRouteOptions(catalog, context)` and map to `RouteOfferSnapshot[]` (reuse `mapRouteOffer`).
   - Create new `RouteState`: `{ eventKey: routeEventKey(runId, contentVersion, newDepth), offers, selectedOfferId: null, committed: false }`.
   - Update: `rewardState.status = "applied"`, `rewardState.selectionCommitId = commitId`, `phase = "route"`, `rewardState = null`, `routeState = newRouteState`, `depth = newDepth`, `cycle = newCycle`, `build = { ...build, activeSkillIds or passiveEquipmentIds updated }`, revision + 1, `updatedAt = now`, `lastCommitId = commitId`.
   - Persistence: `save-checkpoint`.
   - Validate result with `invalidStateRejection`.

6. **Relax validation in `validation.ts`**:
   - In `livingRunSemanticDiagnostics` (in `persistence/validation.ts`): remove the `invalid-empty-route-depth` issue that rejects empty route state at depth > 1. Keep the `invalid-route-event-key` check (empty route state must still have the correct event key for its depth). The event key for depth > 1 will be set by `selectReward` when it materializes the route, so the key check remains valid.
   - In `src/domain/run/validation.ts`: if there is a similar empty-route-depth check in `collectRouteIssues` or `collectLivingRunIssues`, relax it similarly. (Check: the existing validation in `validation.ts` only checks `route-committed-without-selection` and `unknown-route-selection` — no depth check. The depth check is only in `persistence/validation.ts`'s `livingRunSemanticDiagnostics`.)

   **Important:** The `invalid-route-event-key` check in `livingRunSemanticDiagnostics` computes `routeEventKey(runId, contentVersion, depth)` and compares it to `routeState.eventKey`. After `SelectReward`, the new `routeState.eventKey` is set to `routeEventKey(runId, contentVersion, newDepth)`, which matches. So this check remains valid. The `invalid-empty-route-depth` check is the only one to remove.

7. **Add `mapRewardCard` helper** in `reducer.ts`:
   ```typescript
   function mapRewardCard(card: GeneratedRewardCard): RewardCardSnapshot {
     return Object.freeze({
       cardId: card.cardId,
       baseRewardId: card.baseRewardId,
       rewardType: card.rewardType,
       enhancementIds: Object.freeze([...card.enhancementIds]),
       rolledParams: Object.freeze([...card.rolledParams]),
       materialCost: card.materialCost,
       tradeoffId: card.tradeoffId,
     });
   }
   ```

8. **Extend `runReducer` switch** with the four new cases.

9. **Create `room.test.ts`**: Follow the patterns in `route.test.ts` (deepFreeze, helper to create a run at room phase, catalog). Test:
   - **BuyShopItem:** success (currency deducted, purchasedItemIds updated, status "in_progress", revision bumped); re-purchase rejected; insufficient currency rejected; unknown item rejected; non-shop room rejected; resolved room rejected.
   - **CommitRecovery:** success (integrity restored, committed true, status "in_progress"); re-commit rejected; non-recovery room rejected; resolved room rejected.
   - **ResolveRoom:** utility room (shop/recovery) success (phase → "reward", roomState null, rewardState with 3 cards, roomsResolved incremented, revision bumped); combat room (battle) rejected with `combat-not-implemented`; already resolved rejected.
   - **SelectReward:** success (phase → "route", rewardState null, routeState with offers for new depth, depth incremented, build updated, revision bumped); already selected rejected; unknown card rejected; skill slot full rejected (3 active skills); equipment slot full rejected (4 passive items). All resulting living runs pass `validateLivingRun`.

**Commit when:** `npm run typecheck && npm run test:unit -- src/domain/run/room.test.ts src/domain/run/route.test.ts src/domain/run/lifecycle.test.ts src/persistence/validation.test.ts` pass. The four new commands work in the pure reducer with generator output mapped to durable snapshots.

### Checkpoint 2 — Store wiring and full gate

Read before modify: `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/app/navigation.ts`.

1. **Extend `AppCommand`** in `commands.ts`:
   ```typescript
   | { readonly type: "room/buy-shop-item"; readonly itemId: string }
   | { readonly type: "room/commit-recovery" }
   | { readonly type: "room/resolve" }
   | { readonly type: "reward/select"; readonly cardId: string }
   ```

2. **Add store handlers** in `appStore.ts`:
   - `handleBuyShopItem(itemId)`: build `BuyShopItem` run command with `runId`, `expectedRevision`, `itemId`, `commitId: createId()`, `now: clock()`. Call `runReducer`. On success, call `repository.saveCheckpoint`. Publish new `livingRun` + save signal. Handle rejections with bounded messages.
   - `handleCommitRecovery`: similar pattern. Save signal "Recovery committed."
   - `handleResolveRoom`: similar. Save signal "Room resolved. Reward draft saved."
   - `handleSelectReward(cardId)`: similar. Save signal "Reward selected. Advancing to Depth N."
   - Extend `isDurableCommand` with the four new commands.
   - Extend `runRejectionMessage` with all new rejection codes.

3. **Extend `appStore.test.ts`**: Add integration tests using the existing `createMemoryRepository` harness (it already has `saveCheckpoint`):
   - Start a run → materialize route → select shop offer → commit → buy shop item → currency deducted.
   - Commit recovery → integrity restored.
   - Resolve room → phase "reward" with 3 cards in rewardState.
   - Select reward → phase "route" with new depth offers.
   - Rejections: combat room resolve rejected, already-selected reward rejected, full slots rejected.

4. **Run the full gate**: `npm run verify`.

**Commit when:** `npm run verify` passes (lint + typecheck + all unit/component tests + build). The four room/reward commands are wired through the store to persistence.

## Verification

**PROGRAM-CONFIG commands (resolved against Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP2.**
- `npm run test:unit -- src/domain/run/room.test.ts` — new domain tests. **Must pass at CP1.**
- `npm run test:unit -- src/app/appStore.test.ts` — store integration. **Must pass at CP2.**
- `npm run test:unit -- src/persistence/validation.test.ts` — validation (relaxed rule). **Must pass at CP1.**

**Integration proofs (CAP/CA):**
- CA-02 proof (S02-CP1): `room.test.ts` asserts `BuyShopItem` deducts currency, adds to purchasedItemIds, rejects re-purchase and insufficient currency.
- CA-03 proof (S02-CP1): `room.test.ts` asserts `CommitRecovery` restores integrity (clamped), marks committed, rejects re-commit.
- CA-04 proof (S02-CP1): `room.test.ts` asserts `ResolveRoom` transitions to reward phase with 3 cards, rejects combat rooms, rejects already-resolved.
- CA-05 proof (S02-CP1): `room.test.ts` asserts `SelectReward` applies reward, increments depth, materializes next route, rejects full slots and already-selected.
- CA-01 mapping proof (S02-CP1): `room.test.ts` asserts the `GeneratedRewardDraft` → `RewardState` mapping preserves all card fields and the result passes `validateLivingRun`.

**No e2e in this session.** Browser proof is owned by S03-CP3.

## State Update

After CP2, update STATE.md:
- Session 02 status → `done`, checkpoint → 2.
- CAP-02/03/04/05 producer → `ready` (reducer + store committed).
- CA-01/02/03/04/05 producer → `ready`; proof → `verified` for unit. Browser proof → `planned` (S03-CP3).
- Record actual test counts and any surprises in Handoff Notes.