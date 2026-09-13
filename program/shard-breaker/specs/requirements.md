# Requirements — SHARDBREAK

## Product Scope

SHARDBREAK is a single-player, responsive browser roguelite that combines one-pointer brick-breaker control with run-based drafting and progression. The initial build must prove a repeatable endless-run loop with a finite authored content catalog, deterministic visible randomness, and no server-side account or gameplay dependency.

The requirements below preserve the decisions in the approved idea. They define player-visible behavior and measurable product constraints without selecting an implementation stack, framework, rendering technology, or database engine.

## Functional Requirements

### FR-1: Start, resume, and end a run

- **User story:** As a player, I want to start a run, resume an interrupted run, and understand when the run has ended so that my progress is not lost accidentally and outcomes are meaningful.
- **Acceptance criteria:**
  - [ ] A player can start a new run by selecting an available class and any unlocked starting choices.
  - [ ] A run has one active player profile and one current depth; the initial depth is 1.
  - [ ] The game offers recovery of a living run after an accidental refresh or browser restart.
  - [ ] A run ends immediately when the player reaches 0 Integrity.
  - [ ] Death finalizes the run's earned Shards and record result, then irreversibly removes the living-run state.
  - [ ] Starting a new run cannot silently overwrite a living run; the player must explicitly resume, abandon, or finish the existing run.

### FR-2: One-pointer combat control

- **User story:** As a player, I want to aim, launch, and position the paddle with one pointing device so that the core action is immediately understandable.
- **Acceptance criteria:**
  - [ ] Mouse, trackpad, and touch input are supported through the same pointer-oriented interaction model.
  - [ ] Before launch, the player can select the ball's launch direction within the game's legal aiming bounds.
  - [ ] During a room, the paddle follows the active pointer within the playable field and cannot leave the field boundaries.
  - [ ] A distinct launch action starts ball movement; accidental pointer movement alone must not launch a new room.
  - [ ] The game gives clear feedback for the current aim, launch state, paddle position, and loss-of-ball state.
  - [ ] Multiple simultaneous pointers are not required for the initial build.

### FR-3: Brick-breaker room combat

- **User story:** As a player, I want each ricochet to affect enemies and the room state so that aiming choices have immediate combat consequences.
- **Acceptance criteria:**
  - [ ] Every room presents a bounded playable field containing a paddle, a ball, and an authored or generated enemy formation.
  - [ ] Bricks function as enemies with health, collision behavior, and a visible defeated state.
  - [ ] Ball collisions apply the appropriate damage or effect and resolve consistently at the game's supported frame rates.
  - [ ] Ordinary enemy behaviors and formations create different targeting priorities rather than differing only by hit-point totals.
  - [ ] A combat room is cleared only after all required objectives or enemies are defeated.
  - [ ] A dropped ball costs exactly 1 Integrity and returns the player to a valid pre-launch state when the run has Integrity remaining.
  - [ ] Hazards and special enemy effects are telegraphed before they materially affect the player.

### FR-4: Integrity and survivability

- **User story:** As a player, I want survivability to be simple and legible so that I can judge risk without tracking several overlapping health systems.
- **Acceptance criteria:**
  - [ ] Integrity is the only player survivability stat in the initial build.
  - [ ] Glitch Knight starts with 4 Integrity, Circuit Rogue starts with 3 Integrity, and Neon Mage starts with 2 Integrity.
  - [ ] Current and maximum Integrity are visible whenever a run is active.
  - [ ] Recovery rooms can restore a limited amount of Integrity according to authored rules, never exceeding the class maximum unless a documented run effect explicitly changes that maximum.
  - [ ] No damage, ball-speed, or other uncapped permanent combat stat is required to recover from a death.

### FR-5: Floor progression and room routes

- **User story:** As a player, I want to choose between meaningful room routes so that a run is shaped by risk and reward rather than a fixed sequence.
- **Acceptance criteria:**
  - [ ] A run advances through numbered floors, with one or more rooms resolved before the next floor is entered according to the route rules.
  - [ ] Route choices expose enough information for the player to compare room categories and known risk/reward trade-offs before committing.
  - [ ] The initial build includes battle, elite, shop, recovery, and boss room categories; the implementation may use fewer categories only where the approved scope explicitly omits that category from a given route.
  - [ ] Every third floor is a boss floor: depths 3, 6, 9, 12, and all later multiples of 3 must resolve to a boss encounter.
  - [ ] A route cannot bypass a required boss floor or create an invalid, unwinnable transition.
  - [ ] Completing a room applies its rewards and state changes exactly once before the next route decision.

### FR-6: Endless depth and threat scaling

- **User story:** As a high-depth player, I want later floors to remain challenging through composition and decisions, not only inflated numbers.
- **Acceptance criteria:**
  - [ ] The progression model accepts arbitrarily high floor numbers within the limits of the target browser's safe numeric representation; it must not depend on a fixed final floor.
  - [ ] Floors are grouped into three-floor cycles for scaling and boss scheduling.
  - [ ] Each floor receives a deterministic threat budget derived from depth, cycle, run seed, and content rules.
  - [ ] The threat budget can be distributed across enemy durability, field density, hazards, formations, and boss modifiers.
  - [ ] Numeric scaling is sublinear: depth must not cause every relevant enemy statistic to grow linearly without an authored cap, curve, or composition trade-off.
  - [ ] Later cycles can increase challenge by combining compatible content and modifiers while preserving readable counterplay and player agency.
  - [ ] Depth, cycle, and the active scaling factors are available for diagnostics or balancing without exposing implementation details to the player.

### FR-7: Boss encounters

- **User story:** As a player, I want boss floors to test a recognizable strategy so that reaching every third floor feels distinct from clearing a normal room.
- **Acceptance criteria:**
  - [ ] The initial catalog contains four boss archetypes: Warden, Broodmother, Null Architect, and Leech.
  - [ ] Each archetype has one primary identity, distinct counterplay, and documented phase or state transitions.
  - [ ] Boss state changes and high-impact attacks have clear, timely telegraphs and readable resolution feedback.
  - [ ] Later boss cycles can apply only modifiers declared compatible with the selected archetype.
  - [ ] Boss modifiers are capped or otherwise constrained so that they cannot remove all viable player responses.
  - [ ] Defeating a boss completes the required boss floor and awards the same kind of visible, seeded reward choice used by the run's reward system unless a boss-specific reward is explicitly documented.

### FR-8: Classes and run build

- **User story:** As a player, I want classes and temporary loadout choices to create different ways to play each run.
- **Acceptance criteria:**
  - [ ] The initial build includes Glitch Knight, Neon Mage, and Circuit Rogue.
  - [ ] Each class has an authored starting profile, including its specified starting Integrity and at least one meaningful combat or decision trade-off.
  - [ ] A run supports at most 3 equipped active skills and 4 equipped passive equipment items.
  - [ ] Active skills have room-scoped charges that refresh according to the room lifecycle; using a skill consumes the appropriate charge and cannot produce negative charges.
  - [ ] Passive equipment remains active for the rest of the current run after it is acquired or equipped, subject to its authored rules.
  - [ ] Build changes made during a run are reflected in subsequent room resolution and are not applied retroactively to already-resolved outcomes.
  - [ ] The initial content catalog contains 6–8 skills and 6–8 equipment items, with enough variation to demonstrate distinct build choices.

### FR-9: Seeded reward drafting

- **User story:** As a player, I want random rewards to be surprising but fully knowable before I choose so that drafting is strategic rather than a gamble against hidden values.
- **Acceptance criteria:**
  - [ ] Each eligible reward event presents exactly 3 selectable reward cards.
  - [ ] All three cards reveal their base reward, applicable enhancements, relevant effects, and any material costs or trade-offs before selection.
  - [ ] Each card combines an authored base reward with one or more depth-appropriate enhancement modifiers when the reward type supports enhancements.
  - [ ] Reward outcomes are generated from the run seed and current progression state, with no hidden reroll mechanic in the initial build.
  - [ ] The player can select one card; the other cards are discarded for that reward event.
  - [ ] A reward selection is applied at most once, survives a refresh after save, and cannot be duplicated by repeating a completion action.
  - [ ] The initial catalog contains 10–15 enhancement modifiers, and each modifier has explicit compatibility and depth-availability rules.

### FR-10: Shops and recovery rooms

- **User story:** As a player, I want optional utility rooms to let me exchange run resources or risk for a better chance of continuing.
- **Acceptance criteria:**
  - [ ] A shop room offers a finite, visible set of run-relevant purchases, substitutions, or removals, each with a clear cost and effect.
  - [ ] Shop inventory and prices are determined by the run seed and depth rules and do not change merely because the player refreshes the page.
  - [ ] A shop cannot grant an uncapped permanent combat advantage; permanent unlocks belong to meta-progression.
  - [ ] A recovery room clearly states the available recovery effect before the player commits to it.
  - [ ] Recovery is bounded by the class's authored maximum and cannot be repeated through refresh or route re-entry.

### FR-11: Meta-progression and carry-over relic

- **User story:** As a returning player, I want a small amount of lasting progress without grinding becoming the only path to high depth.
- **Acceptance criteria:**
  - [ ] A completed or dead run awards Shards according to visible, deterministic outcome rules.
  - [ ] Shards can unlock additional classes, starting choices, content, tightly capped utility improvements, and cosmetics.
  - [ ] Permanent upgrades cannot provide infinite damage, ball-speed, or equivalent combat-stat growth.
  - [ ] A run may award or allow the player to choose one carry-over relic for future attempts according to authored unlock rules; the relic system cannot stack into uncapped permanent power.
  - [ ] Locked content is clearly distinguished from content available in the current profile.
  - [ ] Meta-progression is shared across runs in the same local profile and is not lost when a run dies, except through an explicit profile reset.

### FR-12: Persistence and profile transfer

- **User story:** As a player without an account, I want local progress to survive normal browser interruptions and be transferable to another browser or device.
- **Acceptance criteria:**
  - [ ] Permanent progression and an active living run are saved locally without requiring a hosted gameplay backend or account.
  - [ ] The saved living run includes enough state to resume at a safe checkpoint, including seed, depth, room, Integrity, build, route state, reward state, and progression changes already committed.
  - [ ] Save writes are atomic from the player's perspective: a refresh must yield either the prior valid checkpoint or the new valid checkpoint, never a partially applied run.
  - [ ] The player can export permanent progression to a portable representation and import it later.
  - [ ] Export/import excludes active living-run state.
  - [ ] Imports are validated for schema version, legal ranges, known content identifiers, and tampering or malformed data; invalid input is rejected without corrupting the current profile.
  - [ ] Profile reset is an explicit, irreversible player action with a confirmation step.

### FR-13: Personal records and run summary

- **User story:** As a player, I want to see how far I reached and what my run produced so that endless play has a clear personal goal.
- **Acceptance criteria:**
  - [ ] The game records the highest completed or reached depth according to one documented rule and applies that rule consistently.
  - [ ] A run summary reports at least class, depth, boss progress, major build contents, Shards earned, and death or completion reason.
  - [ ] A new personal record replaces the prior local record only when the documented record condition is met.
  - [ ] Records are local-only and are not presented as globally verified leaderboard results.

### FR-14: Responsive presentation and feedback

- **User story:** As a player, I want the same game to remain readable and playable across desktop and portrait phone browsers.
- **Acceptance criteria:**
  - [ ] Desktop is the primary layout and input target, while portrait phone browsers remain playable without a separate ruleset or game mode.
  - [ ] The playable field, current Integrity, room/depth state, active skills, reward information, and important warnings remain understandable at supported viewport sizes.
  - [ ] Critical state changes have more than one signal where practical; color alone is not the only indicator of damage, availability, selection, or danger.
  - [ ] Motion-heavy effects have a reduced-motion presentation that preserves gameplay information and control.
  - [ ] A player can distinguish actionable, unavailable, selected, and resolved states without relying on animation timing alone.

### FR-15: Local-only delivery

- **User story:** As a player, I want to launch the game from a static public site without creating an account or depending on an online service during a run.
- **Acceptance criteria:**
  - [ ] The product can be deployed as static assets to GitHub Pages.
  - [ ] No server-side session, account, matchmaking, hosted save, or runtime gameplay API is required.
  - [ ] Once the game assets are loaded, starting or continuing a run does not require a request to a proprietary external service.
  - [ ] The game does not include ads, monetization, social feeds, or live-service operations in the initial build.

## Non-Functional Requirements

- **Performance:** Core play should target a stable 60 frames per second on a recent mid-range desktop browser at the primary desktop viewport and remain playable at no less than 30 frames per second on supported portrait mobile devices. Pointer input should feel immediate, and a room transition or reward choice should not visibly block on persistence.
- **Loading:** The initial experience should reach an interactive start state within 3 seconds on a typical broadband connection and should provide a clear loading state if assets take longer. No content required for a run may be fetched from a private or authenticated service.
- **Determinism:** Given the same run seed, content version, depth, and player choices, generated routes, rooms, reward cards, enhancements, and shop inventory must be reproducible. A refresh must not reroll a committed outcome.
- **Reliability:** A normal refresh, tab close, or browser restart must recover the most recent committed living-run checkpoint. A malformed save or import must fail closed and leave the last valid profile usable.
- **Security and privacy:** Do not require personal data, accounts, or secrets. Treat local saves and imports as untrusted input; validate all values and identifiers, avoid executing imported content, and do not use imported data to access external resources.
- **Accessibility:** Menus, route choices, rewards, settings, persistence actions, and other non-real-time controls should be keyboard reachable and expose meaningful names and state to assistive technologies. Text and controls should meet WCAG 2.2 AA contrast and focus expectations where applicable. Gameplay must provide readable non-color-only feedback and honor the user's reduced-motion preference.
- **Platform:** Support current desktop versions of Chrome/Chromium-based browsers, Firefox, and Safari, plus current mobile Safari and Chrome in portrait orientation, subject to the browser capabilities required for pointer input and local persistence. The layout must tolerate narrow phone viewports and desktop widths without changing game rules.
- **Data portability:** Exported permanent progression must include a format/version marker and be understandable to the same product across compatible releases. A future incompatible release must reject or migrate old data explicitly rather than silently applying it.
- **Maintainability:** Content definitions for classes, skills, equipment, enemies, rooms, bosses, and enhancements must be separable from the core run loop enough to expand the finite catalog without rewriting the progression model.

## Constraints

- The initial product is a static web experience hosted on GitHub Pages.
- The initial product is single-player and local-only; there is no backend, account system, multiplayer, matchmaking, cloud save, or global leaderboard.
- The core interaction remains one-pointer and the same ruleset must work on desktop and portrait mobile browsers.
- The first build is limited to 3 classes, 4 boss archetypes, 4–5 room archetypes, 6–8 skills, 6–8 equipment items, and 10–15 enhancement modifiers, while the depth model remains unbounded.
- Boss floors occur at every third floor and cannot be removed by route choices.
- Random reward outcomes are seeded and fully revealed; no initial reroll system is included.
- Integrity is the only survivability stat. A dropped ball costs 1 Integrity; class starting values are fixed by the approved idea.
- Active skills are capped at 3 equipped slots and passive equipment at 4 equipped slots.
- Meta-progression must remain light and capped; permanent infinite combat-stat growth is out of scope.
- No paid external service or runtime proprietary API is necessary for a complete run.
- Detailed balance constants, exact room-generation algorithms, boss mechanics, enhancement formulas, visual treatment, and implementation technology are intentionally left to later design and architecture work.

## Dependencies

- A static hosting and deployment target compatible with GitHub Pages.
- A modern browser with pointer input, graphics/rendering support appropriate for the playable field, and local persistence capabilities.
- Authored initial content: the three classes, ordinary enemy behaviors, room patterns, four boss archetypes, skills, equipment, enhancement modifiers, route rules, and reward tables.
- A versioned content and save schema so seeded outcomes and profile imports remain interpretable across compatible releases.
- A local clock may be used for presentation or diagnostics, but run outcomes must not depend on an unverifiable network service or wall-clock timing.

## Assumptions

- One local browser profile represents one player; multiple accounts and synchronized profiles are not required.
- Clearing browser site data can remove local progression. Exporting permanent progression is the player's recovery mechanism.
- There is at most one living run per local profile in the initial build.
- Shards are the permanent meta-progression currency. Any shop economy used during a run is separate, run-scoped, and cannot be confused with permanent Shards.
- A run's seed is generated at run start and remains fixed for the entire run.
- A reward event is committed when the player makes a selection or when an explicitly defined automatic resolution occurs; refreshes cannot create a second selection.
- A room is considered resolved only after its combat, choice, purchase, recovery, or boss objective has been committed.
- Personal depth records are motivational and local; they are not secure competitive scores because the product has no authoritative server.
- The exact skill, equipment, enemy, boss, and modifier numbers will be balanced after the interaction model and system architecture are established.

## Glossary

- **Archetype:** A reusable authored pattern that defines a room, enemy, or boss's behavior and counterplay identity.
- **Boss floor:** Every third floor in a run, where a boss encounter is mandatory.
- **Carry-over relic:** A limited lasting item or unlock that can influence a future run without creating uncapped permanent combat power.
- **Cycle:** A group of three consecutive floors used for boss scheduling and difficulty progression.
- **Depth:** The numbered floor reached in the current run; depth 1 is the starting floor.
- **Enhancement:** A seeded modifier attached to a base reward, with visible effects and compatibility rules.
- **Floor:** One numbered stage in the endless progression. A floor contains the route and room resolution required to advance.
- **Integrity:** The player's sole survivability resource. Reaching 0 ends the run.
- **Living run:** An active run that can still be resumed and has not reached a terminal death state.
- **Meta-progression:** Permanent local unlocks, capped utility improvements, cosmetics, and Shards shared between runs.
- **Room:** A single route-selected encounter or decision space, such as battle, elite, shop, recovery, or boss.
- **Run seed:** The fixed value that makes procedural routes, rooms, rewards, and shops reproducible for one run.
- **Shards:** The permanent currency earned from runs and used for approved meta-progression unlocks.
- **Threat budget:** The depth-derived difficulty allowance distributed among encounter composition, durability, hazards, formations, and compatible modifiers.
