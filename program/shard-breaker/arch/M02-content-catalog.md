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
| `./src/domain/content/bosses.ts` | Four stable routing identities; combat phases, telegraphs, and modifiers remain deferred |
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
| 2026-09-24 | combat-engine SESSION-05: Added boss combat content (4 archetypes: phases/telegraphs/counterplay/capped modifiers) and full BossDefinition catalog lookups — see the fragment below. |
| 2026-08-29 | Imported Genesis M02 contract into the Forge registry. |
| 2026-08-30 | Added `content-1` route rooms, support IDs, bounded Integrity services, boss routing identities, and total catalog lookups. |
| 2026-09-15 | room-resolution SESSION-01: Added reward content (8 skills, 8 equipment items, 14 enhancements) and total catalog lookups for all three types. |

<!-- SESSION-02 -->
## M02 — Authored content catalog (`./src/domain/content/`)

- `classes.ts` — `ClassDefinition` (`id`, `displayName`, `startingIntegrity: 2|3|4`,
  `tradeoff`, `availability`); `CLASS_DEFINITIONS` frozen readonly array of the three
  authored classes.
- `catalog.ts` — branded `ContentId` and `ContentVersion`; `ContentAvailability =
  "initial" | "locked"`; `ContentLookupResult<T>` (typed success/`unknown-content-id`
  failure); `CONTENT_VERSION = "content-1"`; `ContentCatalog` facade
  (`contentVersion`, `listClasses()`, `getClass(id)`, `hasClass(id)`,
  `initialClassUnlockIds()`); `createContentCatalog()` (throws on duplicate authored
  IDs at construction — no runtime content service).
- Class availability: Circuit Rogue (3) and Glitch Knight (4) are `initial`; Neon Mage
  (2) is `locked` (defined and visible, but not in the initial unlock projection).

<!-- deterministic-routes-and-utility-rooms SESSION-01 -->
## Route and Utility Catalog API

- `rooms.ts` exports `RoomType`, `RoomDefinition`, `RouteSupportKind`,
  `RouteSupportDefinition`, `ShopServiceEffect`, `ShopServiceDefinition`,
  `RECOVERY_RESTORE_AMOUNT`, and frozen `ROOM_DEFINITIONS`,
  `ROUTE_SUPPORT_DEFINITIONS`, and `SHOP_SERVICE_DEFINITIONS` arrays.
- The five room IDs are `room-battle-glassway`,
  `room-elite-overclock-pit`, `room-shop-patchbay`,
  `room-recovery-soft-reset`, and `room-boss-mandatory`, in stable Battle,
  Elite, Shop, Recovery, Boss order.
- Shop service IDs are `shop-service-integrity-patch` (base price 20,
  restore 1) and `shop-service-integrity-overhaul` (base price 36, restore 2).
  Recovery restores exactly 1.
- `bosses.ts` exports `BossRoutingIdentity` and frozen
  `BOSS_ROUTING_IDENTITIES` for `boss-warden`, `boss-broodmother`,
  `boss-null-architect`, and `boss-leech`. These are identity/counterplay data
  only; no boss combat rules are present.
- `ContentCatalog` adds `listRooms()`/`getRoom(id)`,
  `listShopServices()`/`getShopService(id)`, `listBosses()`/`getBoss(id)`, and
  `hasContent(id)`. Construction rejects invalid/duplicate global IDs and
  missing or wrong-kind room cross-references; total lookups retain
  `ContentLookupResult<T>`.

<!-- room-resolution SESSION-01 -->
## Reward content API (room-resolution SESSION-01)

- New modules `skills.ts` (`SkillDefinition` with `maxCharges` 1-2, all
  `availability: "initial"`, frozen `SKILL_DEFINITIONS` — 8 skills),
  `equipment.ts` (`EquipmentDefinition`, frozen `EQUIPMENT_DEFINITIONS` — 8
  items), and `enhancements.ts` (`CompatibleRewardType =
  "skill" | "equipment" | "any"`, `EnhancementDefinition` with `minDepth` 1-3,
  frozen `ENHANCEMENT_DEFINITIONS` — 14 enhancements with unique `effectKey`s).
- `catalog.ts` extends `ContentCatalog` with `listSkills()/getSkill(id)`,
  `listEquipment()/getEquipment(id)`, and
  `listEnhancements()/getEnhancement(id)` — frozen enumerations and total
  `ContentLookupResult<T>` lookups. `createContentCatalog()` registers every
  new ID in the global known-ID set (format/duplicate checked) and rejects at
  construction: skill `maxCharges < 1`, non-integer/negative enhancement
  `minDepth`, and duplicate enhancement `effectKey`s. No existing API changed.


<!-- combat-engine SESSION-05 -->
## Boss content and catalog facade (combat-engine SESSION-05)

- `bosses.ts` — `BossPhaseDefinition { id, displayName, transitionCondition,
  hpThreshold }` (fraction of max health where the phase begins; ordered strictly
  descending across the three phases); `BossTelegraphDefinition { id,
  displayName, counterplay, windowSeconds }`; `BossModifierDefinition { id,
  displayName, compatibleArchetypeIds: readonly ContentId[] | "any",
  cappedDescription }`; `BossDefinition extends BossRoutingIdentity` adding
  `identitySummary`, `counterplay`, `phases` (exactly 3, strictly descending),
  `telegraphs`, `shieldNodeCount: 1|2|3`, `compatibleModifiers`.
- `BOSS_DEFINITIONS` — the four archetypes (warden, broodmother, null
  architect, leech), each with 3 phases, ≥2 telegraphs, 1–3 shield nodes, 2–3
  capped modifiers (2 shared "any" + 1 archetype-specific, carried by identity).
  `SHARED_BOSS_MODIFIERS` — the two "any"-compatible definitions.
  `BOSS_ROUTING_IDENTITIES` unchanged (exactly three fields — CA-09; the
  committed `rooms.test.ts` keys assertion pins this).
- `catalog.ts` — `ContentCatalog.listBosses()` / `getBoss(id)` now resolve the
  full `BossDefinition` (a subtype of `BossRoutingIdentity`, so every routing
  consumer keeps its shape); catalog registers from `BOSS_DEFINITIONS`. CA-09
  proof: `generators.test.ts` 21/21 unchanged at CP1.
