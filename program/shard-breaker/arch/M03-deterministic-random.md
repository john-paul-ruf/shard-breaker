# M03 — Deterministic Random Generation

> **Registry note:** This deep file's ID **M03** matches the PROGRAM-CONFIG
> Module Registry row M02 (Seeded generation, `src/domain/random/`). This file
> belongs to the archived per-module deep-file numbering (M01–M13); sessions
> and STATE.md use the registry IDs (M01–M08).

## Boundary

- **Path:** `./src/domain/random/`
- **Session-owned pathspec:** `./src/domain/random/**/*`
- **Purpose:** Provide reproducible seed-derived streams and deterministic route,
  room, shop, reward, and threat candidate generation.

## Public API

- `RunSeed`
- `EventKey`
- `RngCursor`
- `SeededRng`
- `deriveStream(seed, contentVersion, eventKey)`
- `generateRouteOptions()`
- `generateRoomCandidate()`
- `generateRewardDraft()`
- `generateShopInventory()`
- `generateThreatProfile()`
- `RouteOffer`, `RewardDraft`, `ShopInventory`, `ThreatProfile`

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/domain/random/seededRng.ts` | Stable seed hashing, named stream derivation, bounded unbiased draws |
| `./src/domain/random/generators.ts` | Catalog-aware deterministic candidate generation and diagnostics |

## Dependency and Implementation Rules

- Depends on the content catalog only (deep-file M02). Runtime imports are
  `RECOVERY_RESTORE_AMOUNT` from `../content/rooms` and `deriveStream` from
  `./seededRng` (verified at HEAD). One type-only import is authorized:
  `import type { EffectParam } from "../run/model"` — runtime-erased, so no
  runtime run-domain edge materializes; it supports the CA-01 durable-field
  mapping and `rolledParams` typing. Orchestrator authorization recorded
  2026-09-15 (`1fcb139`); no value import exists.
- Never call `Math.random()`, read wall-clock time, browser state, storage, or a
  mutable global cursor.
- Event keys include run seed context, content version, depth/cycle, room/event
  identity, and event type. Adding an unrelated draw must not perturb a named
  later event.
- Use deterministic ordering before weighted selection; never depend on object
  property iteration from unvalidated input.
- Generators return candidates. The run domain validates state-machine legality
  and persistence materializes/persists the result before a refresh can reroll
  it.
- Threat output exposes balancing diagnostics without coupling to UI text.

## Tests

- Golden-vector tests pin seed derivation and primitive draws.
- Property tests/assertions cover reproducibility, bounds, no invalid catalog
  references, mandatory boss offers, exactly three unique reward cards, and
  compatible modifiers across representative high depths.

## Implemented streams and compatibility contract (historical)

- `seededRng.ts` exports `EventKey`, `SeededRng`, and
  `deriveStream(seed, contentVersion, eventKey)`. `SeededRng` exposes
  `nextUint32`, `nextFloat`, rejection-sampled `nextInt`, `pick`, and immutable
  `shuffle` operations.
- Stream state uses the `shardbreak-rng-v1` marker and FNV-1a over four
  length-prefixed UTF-16 byte sequences (marker, seed, content version, event
  key), followed by Mulberry32 unsigned 32-bit transitions. `nextInt` accepts
  positive safe bounds through `2^32`; ASCII and Unicode golden vectors pin
  this behavior. Every derived stream owns its cursor in a closure.
- `generators.ts` exports `RouteGenerationContext`, `GeneratedRouteOffer`,
  `generateRouteOptions`, `ThreatGenerationContext`, `GeneratedThreatProfile`,
  `generateThreatProfile`, `ShopGenerationContext`, `GeneratedShopItem`,
  `generateShopInventory`, `RoomGenerationContext`, `GeneratedRoomCandidate`,
  `generateRoomCandidate`, plus `THREAT_LIMITS` and `SHOP_PRICE_CAP`.
- Non-boss routes contain exactly four offers in Battle, Elite, Shop, Recovery
  order. Every positive multiple of three contains one available Boss offer
  only. Room candidates carry inert `ready` projections; the Boss projection
  uses the stable `routing` arrival phase and no modifiers.
- Threat policy uses log2 depth/cycle factors capped at budget 72, durability
  factor 4, density 12, and two hazards. Utility threat is zero budget,
  durability factor 1, and zero density. Shop prices are materialized from base
  price plus bounded seeded depth/cycle variation and cap at 96.
- Every seeded selection starts from a stable authored-ID sort. Exported
  candidate arrays and nested mutable-looking projections are frozen or
  defensively copied. No run-state value import exists.

## Reward draft generator API (room-resolution SESSION-01)

- `generators.ts` adds public `RewardGenerationContext` (`seed`,
  `contentVersion`, `runId`, `depth`, `cycle`, `roomEventKey`, `roomType`,
  `activeSkillSlotsUsed` 0..3, `passiveEquipmentSlotsUsed` 0..4),
  `GeneratedRewardCard` (`cardId`, `baseRewardId`,
  `rewardType: "skill" | "equipment"`, `enhancementIds`, `rolledParams`,
  `materialCost` 0..9, `tradeoffId: null`), `GeneratedRewardDraft`
  (`eventKey`, `sourceRoomId`, 3-tuple `cards`), and
  `generateRewardDraft(catalog, context)`. Per-card streams derive from
  `(seed, contentVersion, "<roomEventKey>:reward:card:<index>")`; per-param
  sub-streams append `:param:<effectKey>`. Base-reward pools are ID-sorted
  before seeded selection; all outputs frozen; contexts outside bounds throw
  `TypeError`/`RangeError` like the existing generators.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported deep-file contract into the Forge registry. |
| 2026-08-30 | Added v1 named streams plus deterministic route, threat, Shop, Recovery, room, and boss-routing candidates. |
| 2026-09-15 | room-resolution SESSION-01: Added `generateRewardDraft` and the reward-draft public API; authorized type-only `EffectParam` import recorded. |
| 2026-09-22 | Archivist final reconciliation: folded the type-only-import authorization into the dependency rules (one rule, one home), removed the redundant SESSION-01 fragment, and added `generateRoomCandidate` to the Public API (it was exported and consumed but unlisted). |
