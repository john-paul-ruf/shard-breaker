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

