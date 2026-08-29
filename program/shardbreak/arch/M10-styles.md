# M10 — Design System and Responsive Styles

## Boundary

- **Path:** `./src/styles/`
- **Session-owned pathspec:** `./src/styles/**/*`
- **Purpose:** Own visual tokens, base semantic controls/surfaces, responsive
  layout, focus treatment, and reduced-motion presentation.

## Public API

CSS custom properties and documented semantic class names imported from
`./src/main.tsx`. Canvas may read a narrow stable subset of resolved color
tokens, but CSS does not import application modules.

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/styles/tokens.css` | Palette, typography, 4px spacing scale, radii, borders, glows, layout dimensions |
| `./src/styles/global.css` | Reset/base surfaces, semantic buttons/inputs/cards, focus, status patterns |
| `./src/styles/responsive.css` | Desktop/tablet/phone composition and `prefers-reduced-motion` overrides |

## Dependency and Implementation Rules

- No application imports and no runtime CSS-in-JS dependency.
- Preserve the design palette and restrained neon-glitch hierarchy from
  `./program/shardbreak/specs/design.md`. Bright colors communicate action,
  danger, selection, and meta state; quiet surfaces carry density.
- Desktop uses the 12-column relationship; combat prioritizes an 8/4 arena and
  rail. Tablet can move the rail under the arena. At <=720px, use urgent-first
  single-column order and keep the arena stable and playable.
- Action targets are at least 44px where required. Focus is a visible 2px cyan
  outline with offset. Color is never the only state signal.
- Under reduced motion, remove trails, shake, pulse, and automatic glitch
  movement while preserving static guides, warnings, and transitions.
- Production CSS is bundled. The mocks' Tailwind CDN is not a dependency.

## Tests and Verification

- Component tests assert semantic state, not pixels. Playwright verifies target
  desktop/tablet/phone viewports, no critical overflow, focus visibility,
  reduced-motion behavior, choice legibility, and arena/rail order.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M10 and design-token contracts into the Forge registry. |

<!-- SESSION-03 -->
## M10 — Design System and Responsive Styles (SESSION-03 delta)

Public M10 surface added by the launch-archive design system. All three
stylesheets are bundled (no CDN/`@import`); the consuming markup is supplied by
SESSION-05. State is expressed through modifiers and `data-`/`aria-` attributes,
never color alone.

### Design tokens (`tokens.css`, `:root` custom properties)

- **Surfaces/text:** `--color-ink`, `--color-panel`, `--color-raised`,
  `--color-active`, `--color-text-primary`, `--color-text-secondary`,
  `--color-text-tertiary`.
- **Signals (reserved meaning):** `--color-signal-cyan`, `--color-signal-magenta`,
  `--color-signal-amber`, `--color-signal-danger`, `--color-signal-violet`.
- **Structure:** `--line-translucent`; radii `--radius-control` (6px),
  `--radius-card` (10px), `--radius-shell` (14px); `--size-action-target` (44px);
  `--size-status-bar-desktop` (64px), `--size-status-bar-phone` (56px);
  `--space-gutter-phone` (16px), `--space-gutter-desktop` (24px);
  `--layout-max-width` (1440px).
- **Spacing scale (4px base):** `--space-4/8/12/16/24/32/48`.
- **Effects:** `--glow-cyan`, `--glow-magenta`, `--glow-danger`;
  `--focus-ring-width`, `--focus-ring-offset`, `--focus-ring-color`.
- **Type stacks:** `--font-display`, `--font-mono`.

### Semantic classes and state attributes (`global.css`)

- Base primitives: `.app-shell`, `.app-status-bar`, `.brand-lockup`,
  `.resource-counter`, `.surface-panel`, `.signal-eyebrow`
  (`[data-tone="warning|danger|success"]`).
- Buttons: `.action-button` + modifiers `--primary`, `--quiet`, `--danger`;
  states `:disabled` / `[aria-disabled="true"]` and `[aria-busy="true"]`
  (static, non-opacity-only).
- Integrity: `.integrity-meter` (`[data-critical="true"]`),
  `.integrity-meter__pip` (`[data-filled="true"]` fills a hollow pip — shape,
  not only color).
- Save signal: `.save-signal` with `[data-tone="saved|warning|rejected"]`.
- Launch archive: `.launch-archive`, `.launch-archive__grid`, `.launch-hero`,
  `.run-loop-steps`, `.launch-panel`, `.living-run-strip`, `.class-selector`,
  `.class-card` (`[aria-checked="true"]` selected, `[aria-disabled="true"]`
  locked), `.launch-actions`, `.confirmation-backdrop`, `.confirmation-dialog`,
  `.confirmation-dialog__actions`, `.checkpoint-open`.

### Responsive contract (`responsive.css`)

- Desktop (≥1024px) is the `global.css` base: two-region grid, 64px status bar.
- `@media (width <= 1023px)`: single column; the actionable `.launch-panel`
  orders ahead of `.launch-hero` (urgency order).
- `@media (width <= 720px)`: 56px bar, 16px gutters, single-column actions and
  dialog; no horizontal scroll at 320px.
- `@media (prefers-reduced-motion: reduce)`: removes decorative transitions,
  glows, and the scanline overlay; selection borders, labels, static offsets,
  and focus rings persist.

### Consumer notes for SESSION-05

- Render `.confirmation-backdrop` only while the overwrite guard is active
  (mount-when-open); it is styled as a visible fixed overlay with no built-in
  open/closed toggle class.
- Place `.living-run-strip` before `.class-selector` inside `.launch-panel` so
  the phone/tablet urgency order (resume before new-run selection) holds.
- Supply the visible `SELECTED` and `LOCKED` text labels on `.class-card`; the
  CSS reinforces state with border/shape/attribute but does not inject label
  text.
- `.class-card` expects three grid columns (icon / name+note / integrity);
  `.run-loop-steps` styles its direct children as cells.
