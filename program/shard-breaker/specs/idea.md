# Idea — SHARDBREAK

## One-Sentence Summary

SHARDBREAK is a responsive, desktop-first browser roguelite that turns brick-breaker ricochets into combat decisions, asking players to draft rolled enhancements and survive an endless sequence of escalating floors with an archetype boss every third floor.

## Problem

Traditional brick-breakers deliver satisfying moment-to-moment control, but their progression often reduces to clearing repetitive patterns. Roguelites offer build variety and meaningful choices, but many require complicated controls, long sessions, or menus that interrupt the action.

SHARDBREAK combines both pleasures for players who want a game they can understand immediately but continue mastering over many runs. The player should feel responsible for every successful ricochet, while also making strategic decisions about classes, skills, equipment, and randomly enhanced rewards.

The game must support an endless chase without requiring an endless amount of hand-authored content. Its depth comes from reusable room patterns, boss archetypes, enhancement combinations, and predictable difficulty scaling rather than from a finite campaign that simply stops after a few floors.

## Vision

SHARDBREAK presents every brick as an enemy and every ricochet as an attack. The player positions a paddle, chooses an angle, and manages the consequences of that choice as the ball moves through the field. Enemy types change how the player prioritizes targets, while skills and equipment create different ways to control risk. The action is immediate and readable; the build decisions give each run a distinct identity.

A run proceeds through an unbounded sequence of floors grouped into three-floor cycles. The player chooses routes, clears rooms, and selects one reward from a small set of visible options. Every third floor culminates in a boss encounter at depths 3, 6, 9, 12, and beyond. Bosses are recognizable archetypes with their own counterplay, and later depths add compatible modifiers rather than requiring a wholly new boss for every floor.

Rewards combine authored base items with seeded, visible enhancement rolls. Randomness creates surprising builds, but each result is previewed clearly before selection. A growing threat budget distributes depth difficulty across enemy durability, field density, hazards, formations, and boss modifiers. Numeric scaling is sublinear, so deeper rooms ask harder strategic questions instead of merely giving every brick an oversized health bar.

A run ends when the player loses all Integrity. Temporary build progress is lost, while earned Shards and one chosen carry-over relic support future attempts. Shards unlock new content and tightly capped utility options, but there are no infinite permanent combat upgrades; high-depth records remain primarily tests of aim, routing, and adaptation.

The game is delivered as a responsive static web experience hosted on GitHub Pages. Desktop is the primary presentation and input target, but the same pointer-based interaction remains playable in portrait phone browsers. The visual identity is cyberpunk neon glitch: intense effects and readable game states coexist, with reduced-motion alternatives for players who need them.

## Target User

- **Primary:** Players who enjoy arcade games and want a skill-based run they can start quickly in a desktop or mobile browser.
- **Secondary:** Roguelite players who enjoy drafting synergies, comparing item rolls, and pushing a personal high-depth record.
- **Tertiary:** Players attracted by cyberpunk visual style, responsive effects, and the novelty of combining brick-breaker control with RPG build decisions.

## Key Features (high-level)

1. **One-pointer brick-breaker combat:** Aim, launch, and steer the paddle with mouse, trackpad, or touch input.
2. **Endless depth:** Floors continue indefinitely until the run ends, with a growing threat budget and readable sublinear scaling.
3. **Boss every third floor:** Boss floors occur at depths 3, 6, 9, 12, and so on.
4. **Four boss archetypes:** Warden, Broodmother, Null Architect, and Leech each provide distinct counterplay.
5. **Boss modifiers:** Later cycles combine archetype mechanics with compatible, telegraphed modifiers.
6. **Branching run routes:** Players choose between room types such as battles, elites, shops, recovery rooms, and boss floors.
7. **Run builds:** Three classes, three active skill slots, four passive equipment slots, and a limited carry-over relic create different strategies.
8. **Rolled enhancements:** Each reward combines an authored base item with one or more seeded, visible modifiers.
9. **Integrity and room recovery:** Class-specific Integrity determines survivability; recovery rooms can restore limited Integrity.
10. **Light meta-progression:** Earned Shards unlock classes, starting choices, content, capped utility improvements, and cosmetics without creating infinite power creep.
11. **Responsive presentation:** Desktop-first panels collapse into a phone-friendly layout without creating a separate game mode.
12. **Local, serverless play:** Progression and active runs are saved locally; permanent progression can be exported and imported without an account or hosted backend.

## Initial Content Boundary

The first build should prove the endless system with a finite authored catalog:

- Three playable classes.
- Four to five room archetypes.
- Four boss archetypes.
- Six to eight skills.
- Six to eight equipment items.
- Ten to fifteen enhancement modifiers.
- A depth model that accepts arbitrarily high floor numbers.
- Boss floors at every third floor, with later cycles adding validated modifier combinations.

The catalog can expand later without changing the core run structure.

## Resolved Product Decisions

- **Depth scaling:** Three-floor cycles use a growing threat budget. Enemy stats scale sublinearly; late-depth challenge comes primarily from composition, hazards, formations, and modifiers.
- **Boss design:** Each boss has one core identity, predictable phases, clear counterplay, and visible telegraphs. Boss modifiers are compatible and capped to avoid removing player agency.
- **Enhancement rolls:** Each reward screen presents three fully revealed, seeded cards. Each card combines a base reward with depth-appropriate enhancements. There is no reroll mechanic in the initial build.
- **Survivability:** Integrity is the only player survivability stat. Glitch Knight begins with 4 Integrity, Neon Mage with 2, and Circuit Rogue with 3. A dropped ball costs 1 Integrity.
- **Skills and equipment:** Players can equip up to 3 active skills and 4 passive equipment items. Skills refresh charges per room; equipment remains active for the run.
- **Meta-progression:** Shards unlock content and tightly capped utility improvements. Permanent damage, ball-speed, and infinite stat upgrades are excluded.
- **Persistence:** Local progression and an active living run are saved for recovery from accidental refreshes. Death finalizes rewards and irreversibly clears the run. Export/import contains permanent progression, not active runs.
- **Platform:** The product is a responsive static web game hosted on GitHub Pages, desktop-first but playable in portrait mobile browsers.

## Non-Goals

- Native Android packaging or an app-store release in the initial build.
- Online multiplayer, matchmaking, accounts, or a game backend.
- A finite five-floor campaign with a final ending.
- Infinite hand-authored rooms, bosses, or unique art assets.
- Unreadable random outcomes, hidden reward statistics, or pay-to-win progression.
- A large permanent power ladder that makes high depth depend only on grinding.
- Ads, monetization, social feeds, or live-service operations.

## Open Questions

No blocking product questions remain. Detailed balance values, exact room generation rules, boss catalogs, enhancement pools, and persistence validation rules belong in the requirements and later design phases.
