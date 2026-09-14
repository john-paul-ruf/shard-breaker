# SESSION-01 — Reward content and reward draft generator

> **Program:** Shard Breaker
> **Feature:** room-resolution
> **Slug:** session-01
> **Summary:** Create 6-8 skill definitions, 6-8 equipment definitions, and 10-15 enhancement modifiers as authored catalog content, extend the ContentCatalog with lookups for the new content types, and implement the deterministic `generateRewardDraft` generator that produces exactly three seeded, fully revealed reward cards.
> **Wave:** 1
> **Modules:** M02, M03
> **Depends on:** —
> **Concurrent with:** —
> **Owns:** `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`, `src/domain/content/catalog.ts`, `src/domain/content/catalog.test.ts`, `src/domain/random/generators.ts`, `src/domain/random/generators.test.ts`
> **Reads:** `src/domain/content/rooms.ts`, `src/domain/content/bosses.ts`, `src/domain/content/classes.ts`, `src/domain/run/model.ts`, `src/domain/random/seededRng.ts`, `src/persistence/validation.ts`
> **Resources:** —
> **Checkpoints:** 2

## Module Context

| ID | Module | Read | Why |
|----|--------|------|-----|
| M02 | Authored content | `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/domain/content/classes.ts`, `src/domain/content/bosses.ts` | Existing catalog patterns (lookup, registration, cross-reference validation); `ContentId`, `ContentVersion`, `ContentLookupResult` types; existing content definition shapes. |
| M03 | Seeded generation | `src/domain/random/generators.ts`, `src/domain/random/seededRng.ts` | Existing generator patterns (`generateRouteOptions`, `generateShopInventory`); `deriveStream`, `SeededRng` API; `RouteGenerationContext` shape; freezing and validation patterns. |
| M05 | Run domain | `src/domain/run/model.ts` | `RewardCardSnapshot`, `RewardState`, `EffectParam` shapes — the durable types the generator output must map to. `BuildSnapshot` — for build-slot-aware generation. |

## Context

The route-drafting run is complete: the player can start a run, materialize route offers, select one, and commit it into a room (`phase: "room"` with populated `roomState`). The run lifecycle handles `StartRun`, `AbandonRun`, `MaterializeRoute`, `SelectRouteOffer`, `CommitRoute`. `npm run verify` passes with 244 tests across 13 files.

The content catalog has classes, rooms, shop services, and boss routing identities. It does NOT have skill definitions, equipment definitions, or enhancement modifiers — `skills.ts`, `equipment.ts`, and `enhancements.ts` do not exist. The seeded generators produce routes, rooms, shop inventory, and threat profiles, but there is no `generateRewardDraft` function.

The `RewardCardSnapshot` and `RewardState` types already exist in `model.ts` and are validated by zod schemas in `persistence/validation.ts`. The reward state schema accepts `rewardType: "skill" | "equipment" | "upgrade" | "currency" | "relic"`, `enhancementIds`, `rolledParams`, `materialCost`, and `tradeoffId`. This session creates the content and generator that produce these snapshots.

## Capabilities

### CAP-01 — Reward content and draft generator
**Approved behavior:** `generateRewardDraft(catalog, context)` produces exactly 3 unique seeded reward cards. Each card has a base reward (skill or equipment), 0-2 compatible enhancement modifiers, rolled effect params, a material cost, and an optional trade-off. The draft is deterministic for `(seed, contentVersion, depth, roomEventKey)` and never rerolls on reload (the reducer persists it before display, owned by S02).

**Entry point:** `generateRewardDraft(catalog, context)` in `generators.ts`.

**Observable success:** 3 `GeneratedRewardCard` objects with unique `cardId`s, known `baseRewardId`s, valid `enhancementId`s, `rewardType ∈ {"skill", "equipment"}`, bounded `materialCost >= 0`, and `tradeoffId` (null or known). The draft is reproducible for the same context and varies with seed/depth/eventKey.

**Rejection paths:** Invalid context (seed, contentVersion, depth, cycle, roomEventKey) throws `TypeError`/`RangeError` (same pattern as existing generators).

**Required facts + producers:**
- `SkillDefinition` (6-8) — produced by this session in `skills.ts`.
- `EquipmentDefinition` (6-8) — produced by this session in `equipment.ts`.
- `EnhancementDefinition` (10-15) — produced by this session in `enhancements.ts`.
- `ContentCatalog` lookups (`listSkills`, `getSkill`, `listEquipment`, `getEquipment`, `listEnhancements`, `getEnhancement`) — extended by this session in `catalog.ts`.
- `SeededRng` / `deriveStream` — M03, committed, pure, tested.

**Integration owner/checkpoint:** S01-CP1 (content + catalog), S01-CP2 (generator). S02-CP1 (reducer consumes generator). S03-CP2 (UI consumes catalog display fields).

## Contract Agreements

### CA-01 — Reward draft generation (agreed, producer planned)
**Required meaning:** A reward draft produces exactly 3 unique seeded cards for `(runSeed, contentVersion, depth, roomEventKey)`. Each card has a known base reward ID, reward type, enhancement IDs, rolled params, and material cost.

**Producer → boundary → consumer:** S01 `generateRewardDraft` → `GeneratedRewardCard[]` (3 items) → S02 `runReducer` (`ResolveRoom`) maps to `RewardState.cards` → S03 `RewardsScreen`.

**Mapping:** `GeneratedRewardCard` → `RewardCardSnapshot`:
| GeneratedRewardCard field | RewardCardSnapshot field | Keep? |
|---------------------------|------------------------|-------|
| `cardId` | `cardId` | yes |
| `baseRewardId` | `baseRewardId` | yes |
| `rewardType` | `rewardType` | yes |
| `enhancementIds` | `enhancementIds` | yes |
| `rolledParams` | `rolledParams` | yes |
| `materialCost` | `materialCost` | yes |
| `tradeoffId` | `tradeoffId` | yes |

**Constraints:** `rewardType ∈ {"skill", "equipment"}` for initial build. `baseRewardId` must exist in catalog as a skill (if `rewardType === "skill"`) or equipment (if `rewardType === "equipment"`). Each `enhancementId` must exist and be compatible with the reward type. Exactly 3 unique `cardId`s. `materialCost >= 0`. Draft is persisted before display (S02 responsibility).

**Checkpoint-0 recheck:** Read `src/domain/run/model.ts` (`RewardCardSnapshot`, `RewardState`, `EffectParam`), `src/persistence/validation.ts` (`rewardStateSchema`, `rewardCardSchema`), `src/domain/random/generators.ts` (existing generator patterns). Confirm the mapping preserves all durable fields.

**Boundary assertions (S01-CP2):** Generator test: `generateRewardDraft` produces exactly 3 cards with unique `cardId`s. Generator test: all `baseRewardId`s exist in catalog. Generator test: all `enhancementId`s exist and are compatible. Generator test: draft is reproducible for the same context. Generator test: draft varies with seed/depth/eventKey.

## Files to Create/Modify

| File | Action | What Changes |
|------|--------|--------------|
| `src/domain/content/skills.ts` | Create | 6-8 `SkillDefinition` objects with `id`, `displayName`, `description`, `maxCharges`, `effectKey`, `availability`. Frozen `SKILL_DEFINITIONS` array. `SkillDefinition` interface. |
| `src/domain/content/equipment.ts` | Create | 6-8 `EquipmentDefinition` objects with `id`, `displayName`, `description`, `effectKey`, `availability`. Frozen `EQUIPMENT_DEFINITIONS` array. `EquipmentDefinition` interface. |
| `src/domain/content/enhancements.ts` | Create | 10-15 `EnhancementDefinition` objects with `id`, `displayName`, `description`, `compatibleRewardType`, `minDepth`, `effectKey`. Frozen `ENHANCEMENT_DEFINITIONS` array. `EnhancementDefinition` interface. |
| `src/domain/content/catalog.ts` | Modify | Add `SkillDefinition`, `EquipmentDefinition`, `EnhancementDefinition` imports; register new IDs in `knownContentIds`; add `listSkills`/`getSkill`, `listEquipment`/`getEquipment`, `listEnhancements`/`getEnhancement` to `ContentCatalog` interface and implementation. |
| `src/domain/content/catalog.test.ts` | Modify | Add tests: enumerate exact skill/equipment/enhancement counts; all IDs globally unique; all enhancements have valid `compatibleRewardType`; all content lookups return typed results. |
| `src/domain/random/generators.ts` | Modify | Add `RewardGenerationContext`, `GeneratedRewardCard`, `GeneratedRewardDraft` interfaces; implement `generateRewardDraft(catalog, context)` — seeded selection of 3 base rewards (skills/equipment), enhancement attachment, param rolling, cost calculation. |
| `src/domain/random/generators.test.ts` | Modify | Add reward draft tests: exactly 3 unique cards, reproducible, varies with seed/depth/eventKey, all content IDs valid, enhancements compatible, build-slot-aware generation. |

## Implementation

### Checkpoint 1 — Content definitions and catalog extension

Read before create/modify: `src/domain/content/catalog.ts`, `src/domain/content/rooms.ts`, `src/domain/content/classes.ts`, `src/domain/content/bosses.ts`, `src/domain/content/catalog.test.ts`, `src/domain/run/model.ts`.

1. **Create `src/domain/content/skills.ts`**:
   ```typescript
   import type { ContentAvailability, ContentId } from "./catalog";

   export interface SkillDefinition {
     readonly id: ContentId;
     readonly displayName: string;
     readonly description: string;
     readonly maxCharges: number;   // 1-3 room-scoped charges
     readonly effectKey: string;    // closed effect identifier
     readonly availability: ContentAvailability;
   }

   const asContentId = (value: string): ContentId => value as ContentId;

   export const SKILL_DEFINITIONS: readonly SkillDefinition[] = Object.freeze([
     // 6-8 skills: Phase Shunt, Prism Burst, Rebound Lens, Null Thread,
     // Shield Bash, Overclock, (optional: Specter Step, Cascade)
     // All with unique IDs, display names, descriptions, maxCharges 1-2,
     // effectKey strings, availability "initial".
   ]);
   ```
   Author 6-8 skills. Each `id` follows the `skill-{name}` pattern. All are `availability: "initial"` (no locked skills in the first build). `maxCharges` is 1 or 2. `effectKey` is a short string like `"phase-shunt"`, `"prism-burst"`, etc.

2. **Create `src/domain/content/equipment.ts`**:
   ```typescript
   import type { ContentAvailability, ContentId } from "./catalog";

   export interface EquipmentDefinition {
     readonly id: ContentId;
     readonly displayName: string;
     readonly description: string;
     readonly effectKey: string;
     readonly availability: ContentAvailability;
   }

   export const EQUIPMENT_DEFINITIONS: readonly EquipmentDefinition[] = Object.freeze([
     // 6-8 equipment items: Fractal Core, Arc Coil, Soft Patch, Static Ward,
     // Mirror Plating, Power Cell, (optional: Echo Chip, Hard Light)
   ]);
   ```
   Author 6-8 equipment items. Each `id` follows the `equipment-{name}` pattern. All are `availability: "initial"`. `effectKey` is a short string.

3. **Create `src/domain/content/enhancements.ts`**:
   ```typescript
   import type { ContentId } from "./catalog";

   export type CompatibleRewardType = "skill" | "equipment" | "any";

   export interface EnhancementDefinition {
     readonly id: ContentId;
     readonly displayName: string;
     readonly description: string;
     readonly compatibleRewardType: CompatibleRewardType;
     readonly minDepth: number;    // minimum depth for this enhancement to appear
     readonly effectKey: string;
   }

   export const ENHANCEMENT_DEFINITIONS: readonly EnhancementDefinition[] = Object.freeze([
     // 10-15 enhancements: Overclocked, Charged, Patient, Sharp, Reinforced,
     // Swift, Echoing, Stable, Piercing, Resilient, (optional: Amplified, Focused,
     // Thorough, Volatile, Anchored)
   ]);
   ```
   Author 10-15 enhancements. Each `id` follows the `enhancement-{name}` pattern. `compatibleRewardType` is `"skill"`, `"equipment"`, or `"any"`. `minDepth` is 1-3 (some enhancements only appear at higher depths). `effectKey` is a short string.

4. **Modify `src/domain/content/catalog.ts`**:
   - Import `SkillDefinition`, `SKILL_DEFINITIONS` from `./skills`.
   - Import `EquipmentDefinition`, `EQUIPMENT_DEFINITIONS` from `./equipment`.
   - Import `EnhancementDefinition`, `ENHANCEMENT_DEFINITIONS` from `./enhancements`.
   - Register all new IDs in `knownContentIds` during construction (reuse `registerKnownId`).
   - Build `skillsById`, `equipmentById`, `enhancementsById` maps.
   - Add to `ContentCatalog` interface:
     ```typescript
     listSkills(): readonly SkillDefinition[];
     getSkill(id: ContentId): ContentLookupResult<SkillDefinition>;
     listEquipment(): readonly EquipmentDefinition[];
     getEquipment(id: ContentId): ContentLookupResult<EquipmentDefinition>;
     listEnhancements(): readonly EnhancementDefinition[];
     getEnhancement(id: ContentId): ContentLookupResult<EnhancementDefinition>;
     ```
   - Implement in `createContentCatalog` using the same `lookup` helper and frozen array pattern as existing content.

5. **Modify `src/domain/content/catalog.test.ts`**:
   - Add test: enumerates exactly the authored skill count (6-8), equipment count (6-8), and enhancement count (10-15).
   - Add test: every skill/equipment/enhancement ID is globally unique and known.
   - Add test: every enhancement has a valid `compatibleRewardType`.
   - Add test: `getSkill`/`getEquipment`/`getEnhancement` return typed success/failure.
   - Add test: all new content arrays are frozen.

**Commit when:** `npm run typecheck && npm run test:unit -- src/domain/content/catalog.test.ts src/domain/content/rooms.test.ts` pass. The catalog validates and exposes the new content types with total lookups.

### Checkpoint 2 — Reward draft generator

Read before modify: `src/domain/random/generators.ts`, `src/domain/random/seededRng.ts`, `src/domain/random/generators.test.ts`, `src/domain/run/model.ts`, `src/domain/content/catalog.ts`, `src/domain/content/skills.ts`, `src/domain/content/equipment.ts`, `src/domain/content/enhancements.ts`.

1. **Add types to `generators.ts`**:
   ```typescript
   export interface RewardGenerationContext {
     readonly seed: string;
     readonly contentVersion: ContentVersion;
     readonly runId: string;
     readonly depth: number;
     readonly cycle: number;
     readonly roomEventKey: EventKey;
     readonly roomType: RoomType;
     readonly activeSkillSlotsUsed: number;
     readonly passiveEquipmentSlotsUsed: number;
   }

   export interface GeneratedRewardCard {
     readonly cardId: string;
     readonly baseRewardId: ContentId;
     readonly rewardType: "skill" | "equipment";
     readonly enhancementIds: readonly ContentId[];
     readonly rolledParams: readonly EffectParam[];
     readonly materialCost: number;
     readonly tradeoffId: ContentId | null;
   }

   export interface GeneratedRewardDraft {
     readonly eventKey: EventKey;
     readonly sourceRoomId: string;
     readonly cards: readonly [GeneratedRewardCard, GeneratedRewardCard, GeneratedRewardCard];
   }
   ```
   Note: Import `EffectParam` from `../../domain/run/model` (type-only import — the generator produces serializable data, not domain state). Import `RoomType` from `../../domain/content/rooms`.

2. **Implement `generateRewardDraft`**:
   - Validate the context (reuse the `validateBaseContext` + `requireNonBlank` pattern; add `requireNonBlank(context.roomEventKey, "roomEventKey")` and `requireNonBlank(context.runId, "runId")`).
   - Compute the reward event key: `${context.roomEventKey}:reward`.
   - Derive a stream: `deriveStream(context.seed, context.contentVersion, rewardEventKey)`.
   - For each of 3 cards:
     - Use a sub-stream: `deriveStream(seed, contentVersion, `${rewardEventKey}:card:${i}`)` where `i` is 0, 1, 2.
     - Select a reward type: if `activeSkillSlotsUsed < 3` and `passiveEquipmentSlotsUsed < 4`, randomly pick "skill" or "equipment". If only skill slots are available, pick "skill". If only equipment slots, pick "equipment". If both full, pick "equipment" (rare edge case — the generator avoids this by checking before generating, but the authoritative guard is in the reducer).
     - Select a base reward from the catalog: `rng.pick(catalog.listSkills())` or `rng.pick(catalog.listEquipment())`.
     - Select 0-2 enhancements: filter enhancements by `compatibleRewardType` (or "any") and `minDepth <= context.depth`. Shuffle and pick 0-2. Each enhancement ID is unique within the card.
     - Roll params: for each enhancement, produce an `EffectParam` with `key: enhancement.effectKey` and a bounded value (e.g., `rng.nextInt(3) + 1` for charge bonuses, or a boolean). Keep params simple and serializable.
     - Compute `materialCost`: `rng.nextInt(10)` (0-9 run shards).
     - Set `tradeoffId`: `null` for initial build (no replacement needed when slots are open).
     - `cardId`: `${rewardEventKey}:card:${baseRewardId}:${i}`.
   - Return `GeneratedRewardDraft` with the 3 cards, event key, and source room ID (`${context.roomEventKey}:candidate`).

3. **Add reward draft tests to `generators.test.ts`**:
   - Produces exactly 3 cards with unique `cardId`s.
   - All `baseRewardId`s exist in catalog (skill IDs for skill cards, equipment IDs for equipment cards).
   - All `enhancementId`s exist and are compatible with their card's reward type.
   - `materialCost >= 0`.
   - Reproducible for the same context (same seed, depth, eventKey → same cards).
   - Varies with seed, depth, and eventKey.
   - Build-slot-aware: when `activeSkillSlotsUsed >= 3`, no skill cards are generated. When `passiveEquipmentSlotsUsed >= 4`, no equipment cards are generated.
   - Enhancement `minDepth` respected: enhancements with `minDepth > context.depth` never appear.
   - Frozen outputs (cards array and nested arrays are frozen).

**Commit when:** `npm run typecheck && npm run test:unit -- src/domain/random/generators.test.ts` pass. `generateRewardDraft` produces exactly 3 seeded, valid, reproducible reward cards with catalog-validated content IDs.

## Verification

**PROGRAM-CONFIG commands (resolved against Verification Baseline):**
- `npm run verify` — lint + typecheck + unit/component + build. **Must pass at CP2.**
- `npm run test:unit -- src/domain/content/catalog.test.ts` — catalog tests. **Must pass at CP1.**
- `npm run test:unit -- src/domain/random/generators.test.ts` — generator tests. **Must pass at CP2.**

**Integration proofs (CAP/CA):**
- CA-01 proof (S01-CP2): `generators.test.ts` asserts `generateRewardDraft` produces exactly 3 unique cards with valid content IDs, compatible enhancements, and reproducible seeded output.

**No e2e in this session.** Browser proof is owned by S03-CP3.

## State Update

After CP2, update STATE.md:
- Session 01 status → `done`, checkpoint → 2.
- CAP-01 producer → `ready` (content + generator committed).
- CA-01 producer → `ready`; proof → `verified` for unit (generator tests). Browser proof → `planned` (S03-CP3).
- Record actual test counts and any surprises in Handoff Notes.