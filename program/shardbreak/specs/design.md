# Design Spec — SHARDBREAK

## Design Intent

SHARDBREAK should feel like an arcade cabinet rebuilt as a tactical instrument
panel. The player needs to understand the immediate action in one glance:
**where the paddle is, what the ball can hit, how much Integrity remains, and
what choice is available next**. The surrounding roguelite information should
be dense but staged so that it never competes with the playable field.

The visual direction is **neon glitch / tactical arcade** rather than generic
cyberpunk. It uses a restrained near-black field, thin technical rules,
angular cards, and two offset accent colors that suggest a misregistered
arcade display. Bright color is reserved for action, danger, and selection;
most surfaces remain quiet.

## Design Language

- **Color palette:**
  - Canvas: `#070A12` (ink), with a faint cyan grid and scanline texture.
  - Surfaces: `#0E1523` (panel), `#141E30` (raised panel), `#1B2940`
    (active surface).
  - Text: `#F4F7FF` (primary), `#A8B6CC` (secondary), `#6F809B`
    (tertiary).
  - Signal colors: `#54F6D1` (cyan/mint action), `#FB3FB6` (magenta
    glitch/enemy), `#FFC857` (amber decision/warning), `#FF5E71` (damage or
    terminal state), `#8D7CFF` (relic/meta progression).
  - Color is never the only state signal. Signals also use labels, icons,
    borders, patterns, or a changed control state.
- **Typography:** Use a condensed, heavy system sans stack for display
  headings (`Arial Narrow`, `Inter`, `Helvetica Neue`, sans-serif) and a
  system monospace stack for telemetry, counters, labels, and keys
  (`ui-monospace`, `SFMono-Regular`, `Menlo`, monospace). Display headings are
  uppercase with slightly negative tracking; body copy is sentence case and
  compact.
- **Spacing system:** A 4px base unit. Primary steps are 4, 8, 12, 16, 24,
  32, and 48px. Desktop content uses 24px gutters; phone content uses 16px
  gutters.
- **Corner radius:** 6px for controls and chips, 10px for cards, 14px for
  major shells. Avoid fully pill-shaped containers except for compact status
  badges and resource counters.
- **Shadow system:** Prefer 1px borders and restrained colored glow over
  diffuse shadows. `--glow-cyan` is a short cyan halo for actionable or
  selected controls; `--glow-magenta` is reserved for enemies and glitch
  echoes; `--glow-danger` is reserved for damage and terminal states.
- **Surface treatment:** Major panels have a 1px translucent border, a
  diagonal corner notch, and a subtle grid. Accent rules can be offset by
  2px in cyan and magenta to create the SHARDBREAK misregistration motif.
- **Iconography:** Use compact line or geometric icons with adjacent text.
  Mocks use CSS shapes and text glyphs as placeholders; production art can
  replace them without changing layout or semantics.

## Layout and Responsive Rules

- **Desktop (`>= 1024px`):** A 64px top status bar, then a 12-column content
  grid with a maximum width of 1440px. Combat uses an 8-column playfield and
  a 4-column decision rail. Route, reward, profile, and summary screens use a
  3-column primary region with a narrow telemetry rail where useful.
- **Tablet (`721px–1023px`):** Keep the two-column combat relationship when
  there is room; reduce the rail to a compact strip below the arena when the
  usable width is below 900px. Route and reward cards remain readable at a
  minimum width of 220px.
- **Portrait phone (`<= 720px`):** A 56px top bar is followed by a single
  column. Content is ordered by urgency: current state, primary action,
  playable field or choice, then supporting information. Route and reward
  cards stack; the combat field keeps a stable aspect ratio and the skill rail
  becomes a three-cell row below it. No rules or content are removed.
- **Safe interaction size:** Primary controls target at least 44px in both
  dimensions. Dense telemetry can be smaller only when it is not the sole
  route to an action.
- **Focus and motion:** Every interactive control has a visible focus ring.
  Decorative scanlines, ball trails, and glitch offsets stop under
  `prefers-reduced-motion: reduce`; the state remains communicated through
  static position, border, text, and icon changes.

## Component Inventory

| Component | Description | States |
|-----------|-------------|--------|
| App status bar | Product mark, run/depth context, profile and archive actions | idle, active run, terminal, compact phone |
| Signal eyebrow | Monospace label above a heading | default, warning, danger, success |
| Primary button | High-contrast action with a short verb | default, hover, focus, pressed, disabled, loading |
| Quiet button | Secondary or reversible action | default, hover, focus, disabled |
| Status chip | Small labeled state or category marker | available, locked, selected, resolved, warning |
| Resource counter | Shards, room currency, seed, or depth readout | normal, changed, capped |
| Integrity meter | Pips plus `current / maximum` text | full, partial, critical, empty |
| Class card | Starting profile and trade-off selector | available, selected, locked, hover |
| Route card | Room category, preview, risk, reward, and commitment action | available, selected, unavailable, boss-required |
| Arena shell | Framed playable field with explicit orientation and state overlay | pre-launch, live, telegraph, loss-of-ball, cleared |
| Enemy brick | Target with identity, health, and readable hit state | intact, damaged, marked, defeated, telegraphing |
| Paddle and aim guide | Pointer target and launch direction preview | idle, aiming, launched, loss-of-ball |
| Skill control | Active skill, key hint, description, and room charges | ready, selected, cooling, empty, disabled |
| Telegraph banner | High-impact warning with time and counterplay | incoming, active, resolved |
| Reward card | Fully revealed base reward plus enhancement and trade-off | available, selected, discarded, unavailable |
| Modal / bottom sheet | Confirmation for destructive or irreversible decisions | open, closed, validation error |
| Toast / save signal | Short non-blocking persistence feedback | saved, rejected, warning |
| Record panel | Local depth record and run summary metrics | new record, current record, no record |
| Import/export panel | Local profile transfer controls and validation feedback | ready, copied, invalid, confirmed reset |

## Screen Inventory

| Screen | Mock file | Purpose |
|--------|-----------|---------|
| Launch archive | `mocks/home.html` | Start or resume a run, select a class, and expose the no-overwrite guard |
| Route map | `mocks/route-map.html` | Compare the next room choices and commit a route before entering it |
| Battle room | `mocks/combat.html` | Demonstrate one-pointer aim, launch, paddle movement, Integrity, skills, and telegraphs |
| Boss room | `mocks/boss.html` | Show mandatory every-third-floor escalation, boss identity, phase state, and counterplay |
| Reward draft | `mocks/rewards.html` | Present exactly three seeded, fully revealed cards and commit one selection |
| Run terminal | `mocks/run-summary.html` | Explain death/completion, award Shards, show the local record, and offer a relic choice |
| Local profile | `mocks/profile.html` | Show meta-progression, content locks, carry-over relic, and profile transfer actions |

## Screen Specifications

### Launch archive — `mocks/home.html`

- **Job:** Give a returning player an immediate resume action while making a
  new-run action safe and explicit.
- **Primary composition:** Brand lockup and short premise on the left; class
  selection and run entry on the right at desktop. On mobile, the active run
  strip comes first, followed by class selection and actions.
- **Visible sample state:** One living run at `DEPTH 02`, `CIRCUIT ROGUE`,
  `3 / 3` Integrity, and `1,248` Shards in the profile. This demonstrates
  both resume and the class selector without pretending the profile is a
  global account.
- **Safe overwrite behavior:** `START NEW RUN` opens a confirmation panel
  stating that a living run exists. The panel offers `RESUME LIVING RUN`,
  `ABANDON & START`, and `CANCEL`; no new run begins from the first click.
- **Supporting content:** Local record (`DEPTH 08` in the mock), a compact
  three-line explanation of the pointer loop, and links to the local profile
  and accessibility settings.

### Route map — `mocks/route-map.html`

- **Job:** Turn the next floor into an informed risk/reward decision.
- **Header state:** `FLOOR 02`, cycle `01`, `BOSS IN 01 FLOOR`, current
  Integrity, room currency, and the fixed seed label. The seed is presented
  as a diagnostic token, not as a player-facing mystery.
- **Route cards:** Show Battle, Elite, Shop, and Recovery in parallel on
  desktop and stacked on mobile. Each card must expose category, expected
  risk, visible reward, and a short reason to choose it. Shop and Recovery
  state their authored limitation before commitment.
- **Route rail:** A thin path shows the current room, selected next room, and
  mandatory boss node. The boss node cannot be deselected or bypassed.
- **Commitment:** Selection changes border, marker, and text state. The
  `ENTER SELECTED ROOM` action is disabled until exactly one route is
  selected. A small `WHY THIS ROUTE?` disclosure exposes trade-offs without
  hiding the card values.

### Battle room — `mocks/combat.html`

- **Job:** Make the one-pointer loop legible before the player launches the
  ball, then keep combat state and survival visible while attention is on the
  field.
- **Desktop composition:** Arena at left; objective, threat composition,
  Integrity, and skill rail at right. The top bar always keeps depth and room
  category visible. The arena is the largest, highest-contrast surface.
- **Arena content:** A bordered field contains a paddle, a ball parked above
  it, a dotted legal aim cone, an aim line, and a formation of distinct
  enemies. Bricks display a name or glyph and a compact health measure.
  Hazard lanes use diagonal hatching and an adjacent warning label.
- **Pre-launch state:** The field says `AIM WITH POINTER`, the launch button
  is the only control that starts motion, and pointer movement alone does not
  launch. A helper line explains mouse, trackpad, and touch equivalence.
- **Live states:** A top arena banner can show `BALL LIVE`, `LOSS OF BALL —
  INTEGRITY -1`, or `ROOM CLEAR`. The same event changes text, border, and
  icon/pattern; it is not color-only.
- **Skills:** Exactly three equipped active slots are shown in the mock. Each
  has a visible room charge and cannot be activated when the count is zero.
  Passive equipment is summarized separately so it does not compete with
  the live controls.
- **Prototype bridge:** A low-emphasis `SIMULATE ROOM CLEAR` link exists in
  the mock only to make the draft flow testable; it is not part of the final
  game UI.

### Boss room — `mocks/boss.html`

- **Job:** Make the mandatory third-floor encounter feel like a readable
  strategy test rather than a normal room with more hit points.
- **Boss presentation:** Warden is shown with an identity card, current phase,
  phase transition condition, and a one-sentence counterplay instruction.
  The arena includes shield nodes and an attack lane that visually explains
  what the ricochet must accomplish.
- **Telegraph:** A high-contrast banner states `PRISM SWEEP IN 2.4s` and
  `COUNTER: BREAK THE OUTER NODE`. The timer is paired with a static phase
  marker so reduced motion does not remove meaning.
- **Modifier disclosure:** Later-cycle modifiers appear as labeled chips with
  compatibility text. In the sample, `SPLIT LANE` is marked compatible and
  `+1 HAZARD` is visible as a composition change rather than a hidden stat
  increase.
- **Transition:** The mock includes a `BREACH WARDEN` action and a
  low-emphasis clear shortcut to the reward screen. Victory uses the same
  three-card draft contract as ordinary reward events.

### Reward draft — `mocks/rewards.html`

- **Job:** Let the player compare three known outcomes and make one strategic
  choice without an opaque reroll.
- **Header state:** `REWARD LOCKED`, depth/cycle, current build capacity, and
  a short statement that the three cards are seeded and will not reroll on
  refresh.
- **Cards:** Exactly three equal-weight cards are visible. Each reveals base
  item, enhancement, rarity marker, all material costs, direct effect,
  compatibility, and the meaningful trade-off before selection. No card is
  visually hidden or truncated into a hover-only tooltip.
- **Selection:** Cards behave as a single-choice group. Selection changes
  border, check marker, and a `SELECTED` label. `CONFIRM DRAFT` is disabled
  until one card is selected. On confirmation, the other two show
  `DISCARDED` and the committed state is described in the save signal.
- **Capacity:** The header and cards show whether the chosen item fits the
  `3 active / 4 passive` limits. If a replacement is required, the card
  says what will be displaced before confirmation.

### Run terminal — `mocks/run-summary.html`

- **Job:** Make death final, the earned outcome clear, and the next attempt
  inviting without implying a server-backed leaderboard.
- **Terminal treatment:** Use `RUN TERMINATED`, an explicit reason
  (`INTEGRITY COLLAPSED`), and a static red edge treatment. The living-run
  state is described as cleared after finalization.
- **Summary:** Class, reached depth, bosses cleared, major build contents,
  Shards earned, and the local-record result are all visible in one scan.
- **Relic choice:** A bounded three-option relic strip shows one carry-over
  choice with a plain-language cap. The UI states that relic power is future
  run utility, not infinite damage or ball-speed growth.
- **Actions:** `TRY AGAIN` returns to the launch archive. `VIEW LOCAL PROFILE`
  opens the profile. Neither action implies a global score submission.

### Local profile — `mocks/profile.html`

- **Job:** Make local continuity, unlocks, and portability understandable.
- **Primary panels:** Shards and local depth record; class/content grid with
  clear `UNLOCKED`/`LOCKED` states and unlock costs; current carry-over relic;
  and a profile transfer panel.
- **Transfer panel:** Export is described as permanent progression only;
  active living-run state is explicitly excluded. Import has a visible
  validation result area. Reset is separated from routine actions and opens a
  confirmation step naming its irreversible effect.
- **No account cues:** Use `LOCAL ARCHIVE`, not avatar, username, cloud sync,
  or leaderboard language.

## User Flows

1. **Primary run loop:** Launch archive → choose class → confirm a new run or
   resume the existing one → route map → commit Battle/Elite/Recovery/Shop →
   battle room → aim and launch → clear room → reward draft → select exactly
   one visible card → route map → mandatory boss at every third floor → boss
   room → reward draft → continue until death or another floor.
2. **Safe resume:** Launch archive → living-run strip → resume → last valid
   checkpoint. A refresh never regenerates a route, shop, or reward event.
3. **Death and record:** Active room → Integrity reaches zero → terminal
   summary → finalize Shards and local record → optionally choose one bounded
   carry-over relic → try again or open local profile.
4. **Portable profile:** Local profile → export permanent progression → move
   the versioned payload → import and validate → accept or reject without
   changing the current valid profile. Active living-run state is excluded.

## Accessibility and Feedback Contract

- Keyboard users can reach class selection, route cards, reward cards,
  persistence controls, and confirmation actions in logical order. The live
  arena has a clearly named launch control even though pointer input is the
  primary play interaction.
- Focus uses a 2px cyan outline plus a 2px offset; selected cards add a
  checkmark and `SELECTED` text. Disabled controls use reduced contrast but
  remain legible and expose a reason where the action is important.
- Integrity uses both pips and `current / maximum` text. Damage uses a label,
  icon, and border change. Telegraphs include event name, countdown text, and
  counterplay, not only a flashing color.
- Text, controls, and important borders are designed for WCAG 2.2 AA
  contrast. No essential text is embedded only in decorative effects.
- `prefers-reduced-motion` removes ball trails, screen shake, pulsing glows,
  and automatic glitch movement while preserving static aim guides,
  telegraph text, and state transitions.

## Mock Contract

The HTML files in `mocks/` are standalone visual contracts, not production
application code. They use Tailwind via CDN plus local CSS and optional small
vanilla-JS interactions for selection, confirmation, and mock navigation.
They do not choose the eventual rendering technology, persistence library,
framework, or database. CSS geometry stands in for final art and gameplay
rendering while preserving hierarchy, sizing, labels, states, and responsive
behavior for implementation.
