# Idea — SHARDBREAK

## One-Sentence Summary

SHARDBREAK is a responsive, desktop-first browser roguelite that turns brick-breaker ricochets into combat decisions, asking players to draft rolled enhancements and survive an endless sequence of escalating floors with an archetype boss every third floor.

## Problem

Traditional brick-breakers deliver satisfying moment-to-moment control, but their progression often reduces to clearing repetitive patterns. Roguelites offer build variety and meaningful choices, but many require complicated controls, long sessions, or menus that interrupt the action.

SHARDBREAK combines both pleasures for players who want a game they can understand immediately but continue mastering over many runs. The player should feel responsible for every successful ricochet, while also making strategic decisions about classes, skills, equipment, and randomly enhanced rewards.

The game must support an endless chase without requiring an endless amount of hand-authored content. Its depth comes from reusable room patterns, boss archetypes, enhancement combinations, and predictable difficulty scaling rather than from a finite campaign that simply stops after a few floors.

## Vision

SHARDBREAK presents every brick as an enemy and every ricochet as an attack. The player positions a paddle, chooses an angle, and manages the consequences of that choice as the ball moves through the field. Enemy types change how the player prioritizes targets, while skills and equipment create different ways to control risk. The action is immediate and readable; the build decisions give each run a distinct identity.

A run proceeds through an unbounded sequence of floors. The player chooses routes, clears rooms, and selects one reward from a small set of visible options. Every third floor culminates in a boss encounter. Bosses are built from recognizable archetypes—such as a defensive warden, splitting brood, reflective architect, or healing leech—and can receive modifiers that make later encounters more demanding without requiring a wholly new boss for every depth.

Rewards combine authored base items with rolled enhancements. Randomness creates surprising builds, but each result is previewed clearly before selection so the player is making an informed decision. Difficulty scales with depth through enemy durability, field composition, hazards, and boss modifiers. A run ends when the player loses all lives; temporary build progress is lost, while earned Shards and one chosen carry-over relic support future attempts.

The game is delivered as a responsive static web experience hosted on GitHub Pages. Desktop is the primary presentation and input target, but the same pointer-based interaction remains playable in portrait phone browsers. The visual identity is cyberpunk neon glitch: intense effects and readable game states coexist, with reduced-motion alternatives for players who need them.

## Target User

- **Primary:** Players who enjoy arcade games and want a skill-based run they can start quickly in a desktop or mobile browser.
- **Secondary:** Roguelite players who enjoy drafting synergies, comparing item rolls, and pushing a personal high-depth record.
- **Tertiary:** Players attracted by cyberpunk visual style, responsive effects, and the novelty of combining brick-breaker control with RPG build decisions.

## Key Features (high-level)

1. **One-pointer brick-breaker combat:** Aim, launch, and steer the paddle with mouse, trackpad, or touch input.
2. **Endless depth:** Floors continue indefinitely until the run ends, with escalating but readable difficulty.
3. **Boss every third floor:** Boss floors occur at depths 3, 6, 9, 12, and so on.
4. **Boss archetypes and modifiers:** A finite catalog of mechanically distinct bosses combines with depth-appropriate modifiers.
5. **Branching run routes:** Players choose between room types such as battles, elites, shops, recovery rooms, and boss floors.
6. **Run builds:** Classes, manually activated skills, passive equipment, and a limited number of active slots create different strategies.
7. **Rolled enhancements:** Rewards combine a base skill or item with seeded, visible modifiers that alter its value.
8. **Light meta-progression:** Earned Shards unlock durable options, and one selected relic can carry into the next run.
9. **Responsive presentation:** Desktop-first panels collapse into a phone-friendly layout without creating a separate game mode.
10. **Local, serverless play:** No account, multiplayer service, or hosted game backend is required for the core experience.

## Initial Content Boundary

The first build should prove the endless system with a finite authored catalog:

- Three playable classes.
- Four to five room archetypes.
- Three boss archetypes.
- Six to eight skills.
- Six to eight equipment items.
- Ten to fifteen enhancement modifiers.
- A depth model that accepts arbitrarily high floor numbers.

The catalog can expand later without changing the core run structure.

## Non-Goals

- Native Android packaging or an app-store release in the initial build.
- Online multiplayer, matchmaking, accounts, or a game backend.
- A finite five-floor campaign with a final ending.
- Infinite hand-authored rooms, bosses, or unique art assets.
- Unreadable random outcomes, hidden reward statistics, or pay-to-win progression.
- A large permanent power ladder that makes high depth depend only on grinding.
- Ads, monetization, social feeds, or live-service operations.

## Open Questions

- What exact scaling curve keeps high-depth runs challenging without reducing combat to oversized health bars?
- Which boss archetypes and modifiers are most distinct while remaining fair to the ball-and-paddle rules?
- Are enhancement rolls selected as-is, rerolled with a limited resource, or compared through three alternative rolls?
- How many lives, skills, and equipment slots produce meaningful choices without overwhelming the compact interface?
- Which meta-progression options should be capped so infinite depth remains primarily a test of play and build decisions?
- How should local progression be exported or recovered if the player clears browser storage?
