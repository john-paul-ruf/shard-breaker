# SESSION-02 — Room resolution domain transitions and store wiring

> **Program:** Shard Breaker
> **Feature:** room-resolution (completion run — replanned after the prior run was blocked pre-dispatch)
> **Slug:** session-02
> **Summary:** Add `BuyShopItem`, `CommitRecovery`, `ResolveRoom`, and `SelectReward` commands to the pure run reducer with generator-to-snapshot mapping, wire app-store handlers with `saveCheckpoint` persistence, and prove the full room→reward→next-route journey with unit and store integration tests. The `invalid-empty-route-depth` persistence rule is KEPT (see Contract Agreements — do not relax it).
> **Wave:** 1
> **Modules:** M05 (run state machine), M01 (application shell), M02/M03 (read-only consumers)
> **Depends on:** — (S01's reward content + `generateRewardDraft` are committed and producer-verified)
> **Concurrent with:** —
> **Owns:** `src/domain/run/commands.ts`, `src/domain/run/reducer.ts`, `src/domain/run/room.test.ts`, `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`
> **Reads:** `src/domain/run/model.ts`, `src/domain/run/routes.ts`, `src/domain/run/validation.ts`, `src/domain/run/lifecycle.test.ts`, `src/domain/run/route.test.ts`, `src/domain/random/generators.ts`, `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/rooms.ts`, `src/persistence/envelopes.ts`, `src/persistence/repositories.ts`, `src/persistence/validation.ts`, `src/persistence/validation.test.ts`, `src/app/navigation.ts`
> **Resources:** —
> **Checkpoints:** 2

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M02 | Authored content | `src/domain/content/catalog.ts`, `skills.ts`, `equipment.ts`, `enhancements.ts`, `rooms.ts` | S01's committed reward content and lookups (`listSkills/getSkill`, `listEquipment/getEquipment`, `listEnhancements/getEnhancement`); shop service IDs/prices for tests. |
| M03 | Seeded generation | `src/domain/random/generators.ts` | S01's `generateRewardDraft` + `RewardGenerationContext` — consumed by `ResolveRoom`. Existing `generateRouteOptions` + `RouteGenerationContext` — consumed by `SelectReward`. |
| M05 | Run domain | `src/domain/run/model.ts`, `routes.ts`, `validation.ts`, `lifecycle.test.ts`, `route.test.ts` | `LivingRun`, `RoomState`, `RewardState`, `BuildSnapshot` shapes; `cycleForDepth`, `routeEventKey`, `isBossDepth`; existing reducer/test patterns to follow. |
| M07 | Persistence | `src/persistence/envelopes.ts`, `repositories.ts`, `validation.ts`, `validation.test.ts` | `saveCheckpoint` repository method (reuse unchanged); zod schemas that already accept the new states; the `invalid-empty-route-depth` rule you must NOT change. |
| M01 | App orchestration | `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/navigation.ts` | `AppCommand` union to extend; store handler patterns from route-drafting; `isDurableCommand` and `runRejectionMessage` to extend. |

## Context

S01 committed the reward content (8 skills, 8 equipment items, 14 enhancements) and `generateRewardDraft(catalog, context)` in `src/domain/random/generators.ts`. The catalog exposes `listSkills`/`getSkill`, `listEquipment`/`getEquipment`, `listEnhancements`/`getEnhancement`.

The run lifecycle handles `StartRun`, `AbandonRun`, `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute`. After `CommitRoute` the living run is in `phase: "room"` with a populated `roomState` (`status: "ready"`). There are no commands to interact with the room, resolve it, generate the reward draft, apply a reward, or advance depth.

`RoomState` already models `status: "ready" | "in_progress" | "resolved"`, `shop.purchasedItemIds`, `recovery.committed/commitId`, `resolutionCommitId`. `RewardState` already models `cards` (3-tuple), `selectedCardId`, `selectionCommitId`, `status: "offered" | "selected" | "applied"`. The zod schemas in `src/persistence/validation.ts` (`roomStateSchema`, `rewardStateSchema`, `rewardCardSchema`) already accept all of these. **No persistence file is modified in this session.**

**Superseded instruction warning:** the previous (never-dispatched) SESSION-02 prompt ordered a relaxation of the `invalid-empty-route-depth` rule in `src/persistence/validation.ts` and carried a lease revision adding persistence files. That instruction is **superseded by this prompt** (see CA-06 rationale): `SelectReward` materializes the next route inside the same transition, so an empty route at depth > 1 is unreachable through any legal transition and the rule remains a valuable fail-closed guard. Do not edit `src/persistence/validation.ts` or `src/persistence/validation.test.ts`. If you believe a relaxation is required, return `blocked` with the exact transition that produces an empty route at depth > 1 — do not widen the lease.

## Capabilities

### CAP-02 — Shop purchase (producer)
**Approved behavior:** `BuyShopItem` deducts `runCurrency` by the item's price, adds `itemId` to `purchasedItemIds`, sets room status to `"in_progress"`, bumps revision, and persists. Re-purchase rejected. Insufficient currency rejected.
**Entry point:** `room/buy-shop-item` app command → `BuyShopItem` run command → `runReducer` → `saveCheckpoint`.
**Observable success:** `roomState.shop.purchasedItemIds` contains the item; `runCurrency` decreased by exactly the stored price; `roomState.status === "in_progress"`; revision incremented; `validateLivingRun` passes; store publishes only after `saveCheckpoint` succeeds.
**Rejection paths:** `shop-item-already-purchased`, `insufficient-currency`, `unknown-shop-item`, `room-not-shop-type`, `no-living-run`, `stale-run`, `stale-run-revision`, `invalid-metadata`, wrong-phase `invalid-state`.
**Integration proof owner:** this session CP1 (domain) + CP2 (store). Browser proof owned by SESSION-03 CP3.

### CAP-03 — Recovery commit (producer)
**Approved behavior:** `CommitRecovery` applies `restoreAmount` to `integrityCurrent` clamped to `integrityMax`, sets `recovery.committed = true` and `recovery.commitId = commitId`, sets room status to `"in_progress"`, bumps revision, and persists. Re-commit rejected.
**Entry point:** `room/commit-recovery` app command → `CommitRecovery` run command → `runReducer` → `saveCheckpoint`.
**Observable success:** `integrityCurrent === min(before + restoreAmount, integrityMax)`; `recovery.committed === true`; `recovery.commitId` set; room `"in_progress"`; revision incremented; reload-valid state.
**Rejection paths:** `recovery-already-committed`, `room-not-recovery-type`, `no-living-run`, `stale-run`, `stale-run-revision`, `invalid-metadata`, wrong-phase `invalid-state`.

### CAP-04 — Room resolution → reward draft (producer)
**Approved behavior:** `ResolveRoom` marks the room resolved, generates the reward draft via `generateRewardDraft`, transitions `phase: "room" → "reward"`, populates `rewardState`, nulls `roomState`, increments `progress.roomsResolved`, bumps revision, and persists. Reload returns the same draft (draft is persisted before display — CA-01 durability).
**Entry point:** `room/resolve` app command → `ResolveRoom` run command → `runReducer` → `saveCheckpoint`.
**Observable success:** `phase === "reward"`; `roomState === null`; `rewardState` with exactly 3 cards; `rewardState.sourceRoomId === roomId-of-resolved-room`; `rewardState.status === "offered"`; `progress.roomsResolved` incremented; revision incremented.
**Rejection paths:** `combat-not-implemented` (roomType battle/elite/boss), `no-living-run`, `stale-run`, `stale-run-revision`, `invalid-metadata`, wrong-phase `invalid-state` (covers double-resolve: after a successful resolve the phase is `reward`, so a repeat dispatch rejects with `invalid-state`).

### CAP-05 — Reward selection and depth advancement (producer)
**Approved behavior:** `SelectReward` applies the selected card's base reward to the build, increments depth, recomputes cycle, materializes the next route (`generateRouteOptions` mapped to `RouteOfferSnapshot[]`), transitions `phase: "reward" → "route"`, nulls `rewardState`, populates `routeState` with the new depth's offers, bumps revision, and persists. Reload returns the same advanced state.
**Entry point:** `reward/select` app command → `SelectReward` run command → `runReducer` → `saveCheckpoint`.
**Observable success:** `phase === "route"`; `rewardState === null`; `routeState.offers.length === 4` (non-boss depth) or `1` (boss depth); `depth` incremented; `cycle === cycleForDepth(depth)`; `routeState.eventKey === routeEventKey(runId, contentVersion, newDepth)`; build contains the selected `baseRewardId`; revision incremented.
**Rejection paths:** `reward-already-selected` (status not `"offered"`), `unknown-reward-card`, `active-skills-full` (skill card + 3 active skills), `passive-equipment-full` (equipment card + 4 passive items), `no-living-run`, `stale-run`, `stale-run-revision`, `invalid-metadata`, depth-overflow `invalid-state`.

## Contract Agreements

### CA-01 — Reward draft mapping (agreed, producer ready)
S01's `generateRewardDraft` is committed and verified. `ResolveRoom` maps `GeneratedRewardDraft` → `RewardState` preserving every field: `GeneratedRewardCard` has exactly `cardId`, `baseRewardId`, `rewardType: "skill" | "equipment"`, `enhancementIds`, `rolledParams`, `materialCost`, `tradeoffId`; `RewardCardSnapshot` declares the same seven fields with `rewardType` widened to `"skill" | "equipment" | "upgrade" | "currency" | "relic"`. The mapping keeps all seven fields, freezes the arrays, and never narrows or invents values. `rewardState.eventKey = draft.eventKey` (= `` `${roomState.eventKey}:reward` ``), `rewardState.sourceRoomId = draft.sourceRoomId` (= the resolved room's `roomId`), `selectedCardId = null`, `selectionCommitId = null`, `status = "offered"`.
**Note on status values:** because selection+application is one atomic transition (CA-05) and resolution nulls `roomState`, the durable record never stores `status: "selected"` or `"applied"` — those enum values remain for schema compatibility only. Set-then-discard inside one immutable transition is correct; do not persist an intermediate.
**Checkpoint-0 recheck:** read `src/domain/random/generators.ts` (`generateRewardDraft`, `GeneratedRewardCard`, `GeneratedRewardDraft`, `RewardGenerationContext`), `src/domain/run/model.ts` (`RewardState`, `RewardCardSnapshot`), `src/persistence/validation.ts` (`rewardCardSchema`, `rewardStateSchema`). Confirm the mapping preserves all fields and the zod schema accepts the result.

### CA-02 — Shop purchase mapping (agreed, producer = this session)
`itemId` must be in `roomState.shop.inventory`; price read from the stored inventory entry (never recomputed); `runCurrency` stays ≥ 0; `purchasedItemIds` must not already contain `itemId`; room status → `"in_progress"`; revision bumps. Proof: room.test.ts + appStore.test.ts this session; browser proof S03-CP3.

### CA-03 — Recovery commit mapping (agreed, producer = this session)
`restoreAmount` from `roomState.recovery.restoreAmount` (authored as 1 via `RECOVERY_RESTORE_AMOUNT`); `integrityCurrent = min(integrityCurrent + restoreAmount, integrityMax)`; `recovery.committed` must be false before commit; `recovery.commitId = commitId`; room status → `"in_progress"`; revision bumps. Proof: this session CP1/CP2; browser proof S03-CP3.

### CA-04 — Room resolution mapping (agreed, producer = this session)
Room must be shop or recovery (combat types rejected with `combat-not-implemented`); room status must not be `"resolved"` (unreachable durably — see CA-01 note); `resolutionCommitId = commitId` set immediately before the room state is discarded in the same transition (the zod `resolved ⇔ resolutionCommitId` coherence rule stays satisfied by construction and by the kept discard); `progress.roomsResolved += 1`; phase → `"reward"`, `roomState → null`, `rewardState → mapped draft`; revision bumps. Proof: this session CP1/CP2; browser proof S03-CP3.

### CA-05 — Reward selection mapping (agreed, producer = this session)
`selectedCardId` must be one of `rewardState.cards` cardIds; `rewardState.status` must be `"offered"`; skill card requires `build.activeSkillIds.length < 3` (else `active-skills-full`) and appends `baseRewardId`; equipment card requires `build.passiveEquipmentIds.length < 4` (else `passive-equipment-full`) and appends `baseRewardId`; `depth + 1` must be a safe integer (else `invalid-state` — guards the reducer against `cycleForDepth`/`generateRouteOptions` throwing at `Number.MAX_SAFE_INTEGER`); `cycle = cycleForDepth(newDepth)`; route context mirrors `materializeRoute` (`seed`, `contentVersion`, `runId`, `depth`, `cycle`, `integrityCurrent`, `integrityMax`, `runCurrency`, `routeEventKey(runId, contentVersion, newDepth)`); `routeState = { eventKey, offers: mapped, selectedOfferId: null, committed: false }`; `phase → "route"`, `rewardState → null`; revision bumps. Proof: this session CP1/CP2; browser proof S03-CP3.

### CA-06 — Kept `invalid-empty-route-depth` rule (agreed; supersedes the prior run's lost lease revision)
The rule at `src/persistence/validation.ts` `livingRunSemanticDiagnostics` (rejecting empty route state at depth ≠ 1, test row "empty route after depth one" in `validation.test.ts`) is **retained**. Rationale from source: the only writer of empty route state is `createInitialRouteState` (depth 1); `SelectReward` populates `routeState.offers` atomically with the depth advance (CA-05), so no legal transition ever produces an empty route at depth > 1; interrupted saves are atomic IndexedDB transactions yielding either the prior or the new valid checkpoint. The rule therefore remains a pure malformed-save guard. Consequence: **no persistence file is in any lease of this feature**. The `invalid-route-event-key` check also stays valid because `selectReward` writes `routeEventKey(runId, contentVersion, newDepth)` exactly as the check computes it.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/run/commands.ts` | Modify | Add `BuyShopItem` (carries `itemId`), `CommitRecovery`, `ResolveRoom`, `SelectReward` (carries `cardId`) to `RunCommand`; all carry `runId`, `expectedRevision`, `commitId`, `now`. Add rejection codes: `room-not-shop-type`, `room-not-recovery-type`, `shop-item-already-purchased`, `insufficient-currency`, `unknown-shop-item`, `recovery-already-committed`, `combat-not-implemented`, `reward-already-selected`, `unknown-reward-card`, `active-skills-full`, `passive-equipment-full`. Reuse `save-checkpoint` persistence instruction (no new kind). |
| `src/domain/run/reducer.ts` | Modify | Add `buyShopItem`, `commitRecovery`, `resolveRoom`, `selectReward` transitions; extend the `runReducer` switch; add `mapRewardCard` helper; reuse `mapRouteOffer`, `requireLivingRun`, `routeCommandMetadataField`, `invalidStateRejection`. |
| `src/domain/run/room.test.ts` | Create | Unit tests for the four commands (see CP1 test list). |
| `src/app/commands.ts` | Modify | Add `room/buy-shop-item` (carries `itemId`), `room/commit-recovery`, `room/resolve`, `reward/select` (carries `cardId`). |
| `src/app/appStore.ts` | Modify | Add `handleBuyShopItem`, `handleCommitRecovery`, `handleResolveRoom`, `handleSelectReward`; extend `isDurableCommand` and `runRejectionMessage`. |
| `src/app/appStore.test.ts` | Modify | Extend `makeLivingRun` with an optional overrides parameter; add store integration tests for the four commands and their rejections. |

**Explicitly NOT in this lease:** `src/persistence/validation.ts`, `src/persistence/validation.test.ts`, `src/domain/run/validation.ts` (no rule changes required — CA-06), `src/domain/run/model.ts` (shapes already sufficient), `src/ui/**`, `src/styles/**`, `tests/e2e/**` (SESSION-03's).

## Implementation

### Checkpoint 1 — Domain transitions and reducer proofs

Read before modify: `src/domain/run/commands.ts`, `reducer.ts`, `model.ts`, `routes.ts`, `validation.ts`, `src/domain/run/route.test.ts` (helper patterns: `makeLivingRun` overrides, `deepFreeze`, `stateWith`, command factories, `assertSaveCheckpoint`), `src/domain/random/generators.ts` (`RewardGenerationContext`, `GeneratedRewardDraft`, `generateRouteOptions` context validation), `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts` (`SHOP_SERVICE_DEFINITIONS`, `RECOVERY_RESTORE_AMOUNT`), `src/persistence/validation.ts` (read-only — confirm schemas accept the new states).

1. **Extend `RunCommand`** in `commands.ts` — every new variant carries `runId`, `expectedRevision`, `commitId`, `now` (the reducer is pure and cannot inject time; this matches the route-drafting correction precedent):
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
   Extend `RunRejection` with the codes in the Files table. `unknown-shop-item`, `unknown-reward-card`, `active-skills-full`, `passive-equipment-full`, `shop-item-already-purchased` carry the offending id/field for bounded messages.

2. **Add `mapRewardCard`** in `reducer.ts` (keep all seven fields; freeze arrays):
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

3. **Implement `buyShopItem`** in `reducer.ts`:
   - Metadata: reuse `routeCommandMetadataField`; additionally require `isNonEmptyString(command.itemId)` else `invalid-metadata` field `"itemId"`.
   - `requireLivingRun` (runId + revision). Require `phase === "room"` and `roomState !== null` else `invalid-state` (issues: `["room phase required"]`).
   - Require `roomState.roomType === "shop"` else `room-not-shop-type`; require `roomState.shop !== null` else `invalid-state`.
   - Require `roomState.status !== "resolved"` else `invalid-state` (unreachable durably; belt-and-braces).
   - Find the item in `shop.inventory` by `itemId`; miss → `unknown-shop-item`.
   - Require `!shop.purchasedItemIds.includes(itemId)` else `shop-item-already-purchased`.
   - Require `run.runCurrency >= item.price` else `insufficient-currency` (carry `itemId` and price in the rejection for the bounded message).
   - Update: `purchasedItemIds = [...purchasedItemIds, itemId]`, `runCurrency -= item.price`, `roomState.status = "in_progress"`, `revision + 1`, `updatedAt = now`, `lastCommitId = commitId`. Persistence `save-checkpoint`. Validate the result with `invalidStateRejection` before returning (same pattern as `materializeRoute`).

4. **Implement `commitRecovery`**:
   - Metadata + living-run + phase guards as above.
   - Require `roomState.roomType === "recovery"` else `room-not-recovery-type`; require `roomState.recovery !== null` else `invalid-state`.
   - Require `!roomState.recovery.committed` else `recovery-already-committed`.
   - Update: `integrityCurrent = Math.min(integrityCurrent + recovery.restoreAmount, integrityMax)`, `recovery = { ...recovery, committed: true, commitId }`, room status `"in_progress"`, revision/updatedAt/lastCommitId. Persistence `save-checkpoint`; `invalidStateRejection`.

5. **Implement `resolveRoom`**:
   - Metadata + living-run + phase guards (`phase === "room"`, `roomState !== null`).
   - If `roomState.roomType` is `"battle"`, `"elite"`, or `"boss"` → reject `combat-not-implemented` (carry the roomType).
   - Build the reward context from the living run:
     ```typescript
     const context: RewardGenerationContext = {
       seed: run.seed,
       contentVersion: run.contentVersion,
       runId: run.runId,
       depth: run.depth,
       cycle: run.cycle,
       roomEventKey: roomState.eventKey,
       roomType: roomState.roomType,
       activeSkillSlotsUsed: run.build.activeSkillIds.length,
       passiveEquipmentSlotsUsed: run.build.passiveEquipmentIds.length,
     };
     ```
   - `const draft = generateRewardDraft(catalog, context);` then map:
     ```typescript
     const rewardState: RewardState = Object.freeze({
       eventKey: draft.eventKey,
       sourceRoomId: draft.sourceRoomId,
       cards: Object.freeze([
         mapRewardCard(draft.cards[0]),
         mapRewardCard(draft.cards[1]),
         mapRewardCard(draft.cards[2]),
       ]) as RewardState["cards"],
       selectedCardId: null,
       selectionCommitId: null,
       status: "offered",
     });
     ```
   - Update: resolved room (status `"resolved"`, `resolutionCommitId = commitId`) is composed and then discarded in the same immutable transition: `phase: "reward"`, `roomState: null`, `rewardState`, `progress: { ...run.progress, roomsResolved: run.progress.roomsResolved + 1 }`, revision/updatedAt/lastCommitId. Persistence `save-checkpoint`; `invalidStateRejection`.

6. **Implement `selectReward`**:
   - Metadata: reuse `routeCommandMetadataField`; additionally require `isNonEmptyString(command.cardId)` else `invalid-metadata` `"cardId"`.
   - `requireLivingRun`; require `phase === "reward"` and `rewardState !== null` else `invalid-state` (`["reward phase required"]`).
   - Require `rewardState.status === "offered"` else `reward-already-selected`.
   - Find the card by `cardId`; miss → `unknown-reward-card`.
   - Guard depth overflow **before** any arithmetic that could throw: `Number.isSafeInteger(run.depth + 1)` else `invalid-state` (issues: `["depth advancement exceeds the safe integer range"]`). Then `newDepth = run.depth + 1`, `newCycle = cycleForDepth(newDepth)`.
   - Apply the reward: skill → require `build.activeSkillIds.length < 3` else `active-skills-full`, `activeSkillIds = [...build.activeSkillIds, card.baseRewardId]`; equipment → require `build.passiveEquipmentIds.length < 4` else `passive-equipment-full`, `passiveEquipmentIds = [...build.passiveEquipmentIds, card.baseRewardId]`.
   - Materialize the next route exactly as `materializeRoute` does: `eventKey = routeEventKey(run.runId, run.contentVersion, newDepth)`; `offers = generateRouteOptions(catalog, { seed, contentVersion, runId, depth: newDepth, cycle: newCycle, integrityCurrent, integrityMax, runCurrency, routeEventKey: eventKey }).map(mapRouteOffer)`; `routeState = Object.freeze({ eventKey, offers, selectedOfferId: null, committed: false })`.
   - Update: `phase: "route"`, `rewardState: null`, `routeState`, `depth: newDepth`, `cycle: newCycle`, `build`, revision/updatedAt/lastCommitId. Persistence `save-checkpoint`; `invalidStateRejection`.

7. **Extend the `runReducer` switch** with the four cases.

8. **Create `src/domain/run/room.test.ts`** following `route.test.ts` patterns (`deepFreeze`, `stateWith`, command factories with overrides, `assertSaveCheckpoint`). Build room-phase runs through the real transition chain (`materialize → select <roomType> offer → commit`) rather than hand-built rooms where practical; seed currency via `makeLivingRun({ runCurrency: 40 })`-style overrides (verified legal: `validateLivingRun` only requires a non-negative safe integer). Test:
   - **BuyShopItem:** success (currency deducted by exactly the stored price, `purchasedItemIds` updated, status `"in_progress"`, revision bumped, `validateLivingRun` ok, `save-checkpoint` instruction); re-purchase rejected (`shop-item-already-purchased`); insufficient currency rejected; unknown item rejected (`unknown-shop-item`); non-shop room rejected (`room-not-shop-type`); wrong-phase (route) rejected (`invalid-state`); stale revision rejected; invalid metadata (blank itemId, NaN now, negative revision) rejected with `invalid-metadata`.
   - **CommitRecovery:** success at partial integrity (construct run with `integrityCurrent` below max via overrides) — restored by exactly `restoreAmount`, clamped at max when already near-full; `committed: true`; `commitId` set; re-commit rejected (`recovery-already-committed`); non-recovery room rejected (`room-not-recovery-type`); stale revision rejected.
   - **ResolveRoom:** shop success (phase `"reward"`, `roomState null`, `rewardState` 3 cards, `sourceRoomId` equals the resolved room's `roomId`, `status "offered"`, `progress.roomsResolved` incremented, revision bumped, `validateLivingRun` ok, `save-checkpoint`); recovery success; reproducibility — mapping equals a direct `generateRewardDraft` call with the same context (CA-01 field-for-field); battle/elite/boss rejected `combat-not-implemented`; stale revision rejected; double-resolve rejected `invalid-state`.
   - **SelectReward:** success after resolving a shop room (build gains the selected card's `baseRewardId` in the correct list, `depth + 1`, `cycle` recomputed, `routeState.eventKey === routeEventKey(..., newDepth)`, offers non-empty, phase `"route"`, `rewardState null`, revision bumped, `validateRunState` ok, `save-checkpoint`); boss-depth advance (resolve at depth 2 → select → new depth 3 → exactly one boss offer); already-selected rejected (hand-built rewardState with `status: "selected"`); unknown card rejected; skill-slot-full rejected (hand-built rewardState containing a skill card + `activeSkillIds` length 3); equipment-slot-full rejected (analogous with 4 passives); depth-overflow rejected `invalid-state` (hand-built reward run at `Number.MAX_SAFE_INTEGER` depth); stale revision rejected.

**Commit when:** `npm run typecheck && npm run test:unit -- src/domain/run/room.test.ts src/domain/run/route.test.ts src/domain/run/lifecycle.test.ts src/persistence/validation.test.ts` passes. The four commands work in the pure reducer with generator output mapped to durable snapshots, the kept validation rule still passes, and every resulting living run passes `validateLivingRun`.

### Checkpoint 2 — Store wiring and full gate

Read before modify: `src/app/commands.ts`, `src/app/appStore.ts`, `src/app/appStore.test.ts`, `src/app/navigation.ts`.

1. **Extend `AppCommand`**:
   ```typescript
   | { readonly type: "room/buy-shop-item"; readonly itemId: string }
   | { readonly type: "room/commit-recovery" }
   | { readonly type: "room/resolve" }
   | { readonly type: "reward/select"; readonly cardId: string }
   ```

2. **Add store handlers** in `appStore.ts`, each following the existing durable-command pattern (`publish({ isBusy: true, saveSignal: null })` → `runReducer` with `runId`/`expectedRevision` from the living run, `commitId: dependencies.createId()`, `now: dependencies.clock()` → reject with `runRejectionMessage` on typed rejection → require `persistence.kind === "save-checkpoint"` → `repository.saveCheckpoint({ ...persistence, proposedRun })` → publish the committed livingRun + saved signal; catch → bounded rejected signal, prior state preserved):
   - `handleBuyShopItem(itemId)` — saved signal `"Purchase saved."` (append item price if desired, bounded).
   - `handleCommitRecovery` — saved signal `"Recovery committed."`.
   - `handleResolveRoom` — saved signal `"Room resolved. Reward draft saved."`.
   - `handleSelectReward(cardId)` — saved signal `` `Reward selected. Advancing to Depth ${newDepth}.` `` (read depth from the committed run).
   - Extend `isDurableCommand` with the four new command types.
   - Extend `runRejectionMessage` with every new rejection code (bounded, user-facing, no exception text).

3. **Extend `appStore.test.ts`** (add an optional overrides parameter to `makeLivingRun` so tests can seed `runCurrency`; reuse `createRouteMemoryRepository`):
   - Full shop journey: start-state living run → materialize → select shop offer → commit → `room/buy-shop-item` → currency deducted, `purchasedItemIds` updated, revision bumped, `saveCheckpoint` called with `proposedRun`.
   - Recovery journey: select recovery offer → commit → `room/commit-recovery` → integrity restored/clamped.
   - Resolve: `room/resolve` → phase `"reward"`, 3 cards in `rewardState.cards`.
   - Select: `reward/select` with a cardId from the persisted draft → phase `"route"`, depth advanced, offers materialized.
   - Rejections: combat room resolve → rejected signal (message from `runRejectionMessage`), durable state unchanged; purchase without sufficient currency → rejected signal; second `reward/select` after success → rejected (phase moved on); busy suppression: a second durable dispatch while the first is pending resolves without a second repository call.

4. **Run the full gate**: `npm run verify`.

**Commit when:** `npm run verify` passes (lint + typecheck + all unit/component tests + build). The four room/reward commands are wired through the store to atomic persistence.

## Verification

**PROGRAM-CONFIG commands (resolved against STATE.md Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP2.**
- `npm run typecheck && npm run test:unit -- src/domain/run/room.test.ts src/domain/run/route.test.ts src/domain/run/lifecycle.test.ts src/persistence/validation.test.ts` — **must pass at CP1.**
- `npm run test:unit -- src/app/appStore.test.ts` — store integration. **Must pass at CP2.**

**Integration proofs (CAP/CA):**
- CA-02/CAP-02 (CP1): room.test.ts asserts deduction by stored price, `purchasedItemIds` growth, re-purchase and insufficient-currency rejections; CP2 asserts the store publishes only after `saveCheckpoint` succeeds.
- CA-03/CAP-03 (CP1): clamp-at-max + partial-restore assertions, `recovery-already-committed` rejection.
- CA-04/CAP-04 (CP1): phase transition, 3-card draft, `combat-not-implemented`, `sourceRoomId` identity; CP2 store proof.
- CA-05/CAP-05 (CP1): build application, depth/cycle advancement, next-route materialization, slot-full and already-selected rejections, depth-overflow guard.
- CA-01 mapping proof (CP1): resolved draft equals a direct `generateRewardDraft` call with the same context; result passes `validateLivingRun` (and therefore the zod round-trip shape).
- CA-06 (CP1): `src/persistence/validation.test.ts` passes **unchanged** — the kept rule's regression proof.
- Browser proofs for CAP-02..05 are owned by SESSION-03 CP3; do not add e2e in this session.

**Architecture compliance:** no new runtime import edges (M05 → M03/M02 only, both pre-existing); the reducer stays pure; the store remains the only domain↔persistence join.

## State Update

After CP2, report through the Handoff section (Orchestrator updates STATE.md): session 02 `done` at checkpoint 2; CAP-02..05 producer `ready` with unit proofs `verified`; CA-01 mapping proof `verified` (durability + browser proofs remain S03-CP3); CA-02..05 producer `ready`, unit proof `verified`, browser proof `planned`; record actual test counts, the kept-rule confirmation, and any surprises.