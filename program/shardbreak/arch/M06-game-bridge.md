# M06 — Browser Game Bridge

## Boundary

- **Path:** `./src/game/`
- **Session-owned pathspec:** `./src/game/**/*`
- **Purpose:** Connect deterministic combat to the browser: Canvas sizing and
  drawing, pointer normalization, fixed-step scheduling, ephemeral sessions,
  accessible arena controls, and typed outcome dispatch.

## Public API

- `Arena`
- `GameSession`
- `createGameSession()`
- `PointerInput`
- `RenderSnapshot`
- `CanvasViewport`, `PointerIntent`, `FrameClock`, `GameOutcomeMessage`

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/game/Arena.tsx` | Canvas host, lifecycle bridge, and semantic DOM controls/status |
| `./src/game/engine.ts` | `requestAnimationFrame` clock, bounded accumulator, fixed-step scheduling |
| `./src/game/input.ts` | Pointer capture/normalization, legal aim, paddle movement, keyboard launch fallback |
| `./src/game/renderer.ts` | Device-pixel-ratio Canvas drawing and reduced-motion decoration policy |
| `./src/game/session.ts` | Ephemeral room session and exactly-once outcome message bridge |

## Dependency and Implementation Rules

- Depends on M04 and the narrow M01 command boundary; it may consume M10 tokens.
- `requestAnimationFrame` supplies elapsed time only. Advance M04 with fixed
  steps and cap accumulated catch-up work after tab stalls.
- Map mouse, trackpad, and touch through Pointer Events into stable world space;
  clamp the paddle and aim to legal bounds.
- Pointer movement never launches. Expose an explicit semantic launch control.
- Scale backing pixels for device pixel ratio without changing world-space rules.
- Keep frame-by-frame state ephemeral. On refresh, M01/M07 restore the latest
  safe pre-launch/loss checkpoint, never a fabricated live-volley result.
- Essential objectives, Integrity, charges, telegraphs, and counterplay are DOM
  accessible and cannot exist only as Canvas text/color.

## Tests

- Unit-test input mapping, accumulator bounds, session/outcome bridging, and
  renderer coordinate transforms. Use Playwright for pointer/touch launch,
  resize, reduced-motion, and refresh behavior.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Imported Genesis M06 contract into the Forge registry. |

