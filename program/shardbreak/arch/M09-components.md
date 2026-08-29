# M09 — Shared Accessible UI Components

## Boundary

- **Path:** `./src/ui/components/`
- **Session-owned pathspec:** `./src/ui/components/**/*`
- **Purpose:** Provide controlled, reusable controls and status indicators shared
  across screens without owning state transitions.

## Public API

- `AppStatusBar`
- `RouteCard`
- `RewardCard`
- `IntegrityMeter`
- `SkillRail`
- `TelegraphBanner`
- `ConfirmationDialog`
- `SaveSignal`
- `TransferPanel`
- Semantic controlled prop types for each component

## Internal Structure

| File | Responsibility |
|------|----------------|
| `./src/ui/components/AppStatusBar.tsx` | Product, depth/profile context, save state, archive action |
| `./src/ui/components/RouteCard.tsx` | Visible route category/risk/reward and single-choice state |
| `./src/ui/components/RewardCard.tsx` | Fully revealed reward/enhancement/cost/trade-off state |
| `./src/ui/components/IntegrityMeter.tsx` | Pip pattern plus current/maximum text |
| `./src/ui/components/SkillRail.tsx` | Three controlled active slots and room charges |
| `./src/ui/components/TelegraphBanner.tsx` | Named warning, countdown/state, and counterplay |
| `./src/ui/components/ConfirmationDialog.tsx` | Focus-managed destructive confirmation |
| `./src/ui/components/SaveSignal.tsx` | Polite saved/rejected/warning feedback |
| `./src/ui/components/TransferPanel.tsx` | Export, import validation, confirmation, and reset controls |

## Dependency and Implementation Rules

- Depends on M10 and narrow M01 view types through type-only imports where
  needed. It does not import repositories, reducers, or live game sessions.
- Prefer native semantics (`button`, `dialog` behavior, `meter`/text as
  appropriate, radiogroup patterns) before ARIA reconstruction.
- All actionable targets meet the design interaction size. Every control has a
  meaningful name and visible focus. Disabled important actions expose a reason.
- Communicate critical state with text/icon/pattern/border in addition to color.
- Reduced motion removes decoration only; warnings and state changes remain.
- Components are controlled and deterministic from props; transient focus
  management is the only acceptable local behavior where required.

## Tests

- Test public behavior by role/name/state, keyboard and focus behavior, dialog
  return focus, live-region feedback, charge/integrity edge states, and non-color
  labels. Avoid assertions coupled only to implementation classes.

<!-- SESSION-05 -->
## Launch Lifecycle Component Contracts

- `AppStatusBarProps` controls local Shards, optional active class/depth context,
  busy state, and an optional archive callback. No callback means no inert or
  fabricated control.
- `IntegrityMeterProps` controls current/maximum Integrity and an optional label.
  The meter bounds malformed input, exposes one accessible value, and keeps its
  decorative pips out of repeated announcements.
- `ConfirmationDialogProps` controls open/busy state, title/description, the
  return-focus ref, and Resume/Abandon/Cancel callbacks. The modal starts on the
  reversible action, contains forward/reverse tab order, blocks Escape/backdrop
  cancellation while busy, and returns focus when it closes.
- `SaveSignalView` is `saved`, `warning`, `rejected`, or `null` with visible
  message text. Saved/warning feedback is polite; rejected durable actions are
  urgent. `SaveSignal` owns no timeout.

## Change History

| Date | Change |
|------|--------|
| 2026-08-29 | Added controlled status, Integrity, overwrite-confirmation, and save-feedback primitives. |
| 2026-08-29 | Imported Genesis M09 contract into the Forge registry. |
