# M02 — Authored Content Catalog

## Boundary

- **Path:** `./src/domain/content/`
- **Session-owned pathspec:** `./src/domain/content/**/*`
- **Purpose:** Hold the immutable, versioned catalog and compatibility metadata
  for every class, skill, equipment item, enemy, boss, room, enhancement, and
  relic bundled with the application.

## Public API

- `ContentCatalog`
- `ContentVersion`
- `ContentId`
- `ContentAvailability`
- `CompatibilityRule`
- `EffectDefinition`
- `TelegraphDefinition`
- `ClassDefinition`, `SkillDefinition`, `EquipmentDefinition`
- `EnemyDefinition`, `BossDefinition`, `RoomDefinition`
- `EnhancementDefinition`, `RelicDefinition`
- Total lookup helpers that return typed success/failure rather than silently
  accepting an unknown ID

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/domain/content/catalog.ts` | Versioned facade, cross-reference validation, typed lookup |
| `./src/domain/content/classes.ts` | Three class definitions and starting profiles |
| `./src/domain/content/skills.ts` | Six to eight active skills and room charges |
| `./src/domain/content/equipment.ts` | Six to eight passive run items |
| `./src/domain/content/enemies.ts` | Ordinary enemy behaviors and formations |
| `./src/domain/content/bosses.ts` | Four archetypes, phases, telegraphs, compatible modifiers |
| `./src/domain/content/rooms.ts` | Battle, elite, shop, recovery, and boss metadata |
| `./src/domain/content/enhancements.ts` | Ten to fifteen modifiers, depth gates, compatibility |
| `./src/domain/content/relics.ts` | Bounded carry-over relic definitions |

## Dependency and Implementation Rules

- Depends only on TypeScript primitives. It never imports mutable run state,
  random generation, UI, persistence, or browser APIs.
- Definitions are data, not executable components. Effects use closed tagged
  unions and allowlisted parameters.
- All referenced IDs must exist at catalog construction time. Compatibility,
  availability, visible effects, costs, trade-offs, telegraphs, and rendering
  keys must be explicit.
- IDs are opaque; consumers use lookup functions and never infer behavior from
  string contents.
- Changing the meaning of an existing persisted ID requires a content-version
  compatibility decision, not an in-place silent edit.

## Tests

- Validate catalog uniqueness, cross-references, exact initial content counts,
  class Integrity, compatibility symmetry/policy, caps, and rendering labels.
- Snapshot only stable authored data where a semantic assertion would be less
  clear; do not use snapshots as the sole validation of invariants.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M02 contract into the Forge registry. |

