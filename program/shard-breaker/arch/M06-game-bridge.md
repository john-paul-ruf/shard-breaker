# M06 — Browser Game Bridge

> **Registry note:** This file is a per-module deep record for the game
> bridge. In PROGRAM-CONFIG.md's Module Registry this module is row **M10**
> (Game bridge incl. Arena host, `src/game/`); the ID in this heading follows
> the archived per-module deep-file numbering (M01–M13). Program sessions and
> STATE.md use the registry IDs — see the PROGRAM-CONFIG registry for the
> authoritative list.

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
| 2026-09-24 | combat-engine SESSION-04: created Arena.tsx (canvas host, DOM status/telegraph, CA-07 launch control, skill rail) — see the fragment below. |
| 2026-08-29 | Imported Genesis M06 contract into the Forge registry. |
| 2026-09-23 | combat-engine SESSION-03: created `src/game/` (engine/input/session/renderer) — see the fragment below. `Arena.tsx` remains for SESSION-04. |

<!-- combat-engine SESSION-03 -->
## Bridge core (combat-engine SESSION-03)

Pure-command bridge between the deterministic combat domain (M09) and the
browser. Realized declared edges: **M10→M09 [D→R]** (model/rules/effects
consumed by engine/input/session/renderer) and **M10→M06 [D→R, type-only]**
(`AppCommand` `Extract`ed for `GameOutcomeMessage`/`SkillId`). No persistence,
run-domain, React, or DOM-typed imports anywhere in the bridge; rAF is used
only as a clock; zero `Math.random`/`Date.now`; frames are never persisted.

### `engine.ts`
- `FrameClock { requestFrame(cb: (timestamp: number) => void): () => void; now(): number }`
  — the bridge's only clock abstraction; `createFrameClock()` is the
  production rAF-over-`performance.now` implementation.
- `EngineOptions { stepSeconds?: number; maxCatchUpSteps?: number }` — defaults
  `SIMULATION_STEP_SECONDS` (from `src/domain/combat/model.ts`) and 5.
- `startEngine(clock, step, options?) → stop()` — elapsed frame time
  accumulates; each frame executes `floor(accumulated / stepSeconds)` steps in
  ONE batch, capped at `maxCatchUpSteps` with the stalled remainder dropped
  (not queued). Stop is idempotent and safe to call from inside the step
  callback (pending frame cancelled first).

### `input.ts`
- `PointerIntent { paddleX: number; aimAngle: number }`;
  `InputHandlers { onAim, onLaunch, onKeyboardPaddle(-1|1) }`;
  `InputTarget` (the slice of HTMLCanvasElement consumed, faked in tests);
  `attachInput(canvas, handlers) → detach`.
- `canvasToWorld(clientX, {left, width})` — CSS-size based (DPR and backing
  store cancel out); throws on non-positive width.
- `clampPaddleX(x)` → [15, 145] (fails closed on non-finite to the nearest
  legal end); `aimAngleForPointerX(x)` — full canvas maps to the full legal
  aim cone (center = straight up), clamped inside ±AIM_MAX_DEVIATION.
- Mouse/trackpad/touch share one Pointer Events handler; `pointermove`/`pointerdown`
  → `onAim` only — pointer movement never launches; ArrowLeft/ArrowRight →
  `onKeyboardPaddle` (other keys, incl. space/enter, ignored at this layer —
  launch is the explicit control only, FR-2).

### `session.ts`
- `GameOutcomeMessage`/`SkillId` derived from `AppCommand` by `Extract` (no
  run-domain import; drift-proof against the reducer's serializable contract).
- `VolleyEffectsResolver = () => EffectSnapshot` — zero-arg on purpose: the
  caller closes over the app-owned catalog, build, rolled params, and the
  room's durable skill charges (S02's `resolveVolleyEffects` is the production
  implementation), keeping `src/game/` imports inside the arch contract.
- `GameSessionCallbacks { onOutcome, onRender, onSkillRequested, resolveVolleyEffects }`;
  `GameSessionOptions { engine?, clock? }`.
- `createGameSession(initial: CombatState, callbacks, options?) → GameSession`
  with `launch(angle)`, `movePaddle(x)`, `movePaddleBy(-1|1)` (keyboard, 4
  world units), `useSkill(skillId)` (requests only; charges stay the caller's),
  `replaceState(state)` (checkpoint publish; re-arms the engine when live),
  `snapshot()`, `state()`, `stop()`. A live initial state starts the engine
  immediately; pre-launch waits for the explicit launch.
- CA-05 (exactly-once outcome bridge): a session-level `Set<string>` keyed by
  outcome ID dedupes `combat/report-outcome` dispatches across re-entries and
  checkpoint restores; the store's ledger (CA-02) remains the second guard.
  On volley end: dispatch once → stop the engine → await `replaceState`.
- CA-06 (deterministic rebuild): constructing a session from a
  `pre_launch`/`loss_of_ball` checkpoint rebuild produces the same subsequent
  trace as one from the equivalent `CombatState` (proven in `session.test.ts`).

### `renderer.ts`
- `RenderSnapshot` — world-space projection incl. `telegraphText` (DOM-host
  display) and `statusLine` ("Aim ready" | "Ball live" | "Loss of ball —
  Integrity -1" | "Room clear"); `createRenderSnapshot(state, {glyphFor?})`
  freezes every field; no essential text lives only in the canvas.
- `computeWorldTransform({width, height})` — full-bleed world→backing-store
  scale (160×100 world; input mapping assumes the same span).
- `drawFrame(ctx, snapshot, { devicePixelRatio, reducedMotion? })` — border,
  hazard lanes (static hatch + state label; pulse fill only when motion is
  allowed), enemies (brick + health ticks + glyph), ball, paddle, dashed aim
  cone pre-launch. Accepts a `Context2DLike` (structurally typed context
  slice) so tests stub the 2D context.

### Tests
`engine.test.ts` (8), `input.test.ts` (11), `session.test.ts` (10),
`renderer.test.ts` (9) — 38 tests in jsdom via per-file `@vitest-environment`
annotations (config default stays node). Consumers: S04 `Arena.tsx`
(CAP-05/CAP-07 integration checkpoints remain future owners), S07 browser
journeys.


<!-- combat-engine SESSION-04 -->
## Arena host (combat-engine SESSION-04)

New public API in `src/game/Arena.tsx` (this file's registry row is M10):

- `ArenaSkillDisplay { skillId: SkillId; name; description; charges; maximum }`.
- `ArenaViewModel { roomName; skillDisplay: readonly ArenaSkillDisplay[]; isBusy }` —
  deliberately narrow: run/room context stays with the composing screen, and the
  durable `CombatCheckpoint` never crosses into `src/game/` as data.
- `ArenaProps { model: ArenaViewModel; dispatch(command: AppCommand);
  createInitialState: () => CombatState; resolveVolleyEffects: VolleyEffectsResolver;
  sessionOptions?: { engine?: EngineOptions; clock?: FrameClock } }` — the
  checkpoint→state reconstruction (CA-03) and the per-volley effect resolver are
  injected closures from App.tsx; `sessionOptions` exists for deterministic tests.
- `Arena` composes `createGameSession`: mounts the session from
  `createInitialState()`, feeds `onRender` into DPR-scaled `drawFrame` (with the
  pre-launch aim-indicator override), and renders the essential state as DOM
  siblings of the canvas — status line (`role="status"` + `data-status` + glyph),
  live hazard telegraph, launch control ("Launch ball", 44px, disabled while busy
  or not pre-launch, sole dispatcher of `combat/launch` — CA-07), and the skill
  rail (charges + disabled-at-zero + `combat/use-skill` via `session.useSkill`).
  Pointer/keyboard input routes through `attachInput` (pointer never launches).
  After a loss outcome the reconcile effect swaps in the durable restore publish
  (`replaceState(createInitialState())`); a live volley and a clear are never
  swapped. Realizes M07→M10 [D→R] (CombatScreen imports Arena) and M06→M10
  [D→R] (App composes Arena via the screen). `App.tsx` realizes the M06→M09
  [D→R] edge App-side via the `createInitialState` closure (`fromCombatCheckpoint`).
- 14 component tests incl. the deterministic loss volley (−0.6 aim from paddle 80)
  recorded by SESSION-03; jsdom canvas `getContext` stderr is expected noise.
