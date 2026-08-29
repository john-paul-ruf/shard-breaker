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

