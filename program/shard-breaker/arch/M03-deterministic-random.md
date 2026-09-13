# M03 — Deterministic Random Generation

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

- Depends on M02 only.
- Never call `Math.random()`, read wall-clock time, browser state, storage, or a
  mutable global cursor.
- Event keys include run seed context, content version, depth/cycle, room/event
  identity, and event type. Adding an unrelated draw must not perturb a named
  later event.
- Use deterministic ordering before weighted selection; never depend on object
  property iteration from unvalidated input.
- Generators return candidates. M05 validates state-machine legality and M07
  persists the materialized result before a refresh can reroll it.
- Threat output exposes balancing diagnostics without coupling to UI text.

## Tests

- Golden-vector tests pin seed derivation and primitive draws.
- Property tests/assertions cover reproducibility, bounds, no invalid catalog
  references, mandatory boss offers, exactly three unique reward cards, and
  compatible modifiers across representative high depths.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M03 contract into the Forge registry. |
| 2026-08-30 | Added v1 named streams plus deterministic route, threat, Shop, Recovery, room, and boss-routing candidates. |

<!-- deterministic-routes-and-utility-rooms SESSION-01 -->
## Implemented Public API and Compatibility Contract

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
  `generateRouteOptions`, `ThreatGenerationContext`,
  `GeneratedThreatProfile`, `generateThreatProfile`,
  `ShopGenerationContext`, `GeneratedShopItem`, `generateShopInventory`,
  `RoomGenerationContext`, `GeneratedRoomCandidate`, and
  `generateRoomCandidate`, plus `THREAT_LIMITS` and `SHOP_PRICE_CAP`.
- Non-boss routes contain exactly four offers in Battle, Elite, Shop,
  Recovery order. Every positive multiple of three contains one available
  Boss offer only. Room candidates carry inert `ready` projections; the Boss
  projection uses the stable `routing` arrival phase and no modifiers.
- Threat policy uses log2 depth/cycle factors capped at budget 72, durability
  factor 4, density 12, and two hazards. Utility threat is zero budget,
  durability factor 1, and zero density. Shop prices are materialized from
  base price plus bounded seeded depth/cycle variation and cap at 96.
- Every seeded selection starts from a stable authored-ID sort. Exported
  candidate arrays and nested mutable-looking projections are frozen or
  defensively copied. M03 imports M02 only and never imports run state.
