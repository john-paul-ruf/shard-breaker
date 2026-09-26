# PROBE-LOG — Depth-1 clearability sweep (threat-rebalance SESSION-01)

**Program:** Shard Breaker · **Feature:** threat-rebalance · **Session:** 01
**Method:** committed deterministic sweep (see `src/domain/combat/model.test.ts`
`depth-1 clearability sweep`) + the scratch probes below. All numbers are
measured, deterministic, and reproducible from the committed test; the scratch
probes were deleted before commit (leave-no-trace) and their findings are
recorded here.

---

## 1. Measurement machinery (S01-CP1)

The committed sweep in `src/domain/combat/model.test.ts` drives the same
composition the game bridge uses:

- `generateRoomCandidate` (real generator, depth-1 battle offer from a route of
  the run's seed) → `createCombatState(catalog, context)` →
  `movePaddle(state, paddleX)` → `launchBall(state, aim)` → repeated
  `stepCombat(state, 60)` chunks until an outcome or the step horizon.
- `resolveEffects(catalog, emptyBuild, [])` = the real first-room effect
  snapshot (empty build, empty rolled-params carrier — the committed
  `ROLLED_PARAMS_CARRIER_LANDING`).
- Strategy space: aims across the full legal cone (−π/3…+π/3), paddle
  positions across the legal band, 6,000-step horizon per script (a 6,000-step
  volley ≈ 50 s at 1/120 s per step — generous; recorded clears land well under
  it).

Why committed tests and not scratch evidence: CA-20's own failure mode is
probe evidence that vanishes with the session. The sweep re-proves forever.

## 2. Baseline zero-clear record (committed code, scratch re-verification)

The B-3 probe evidence (combat-engine S07: 7,625 launches / 0 clears) is
reproduced on the committed code by the scratch machinery before any change:

- Grid: 21 aims × 7 paddles (30/50/65/80/95/110/130) × 12 seeds, 6,000-step
  horizon — **0 clears, max 3 enemies defeated (of 5–6), best scripts always
  end in loss/timeout**.
- Committed depth-1 profile per seed (real generator, `sweep-seed-NN` family):
  budget 15–18, durability 1.10–1.15, density 5–6, 1 hazard
  (`hazard-shift-lane` — the battle room's authored hazard pool has exactly one
  entry, so "exactly 1 hazard" is structural), first-row enemy HP 1–3, total
  formation HP 5–13.
- The tracker control (perfect paddle tracking, 20,000 steps) also times out —
  the committed room is not merely script-hard, it is structurally unclearable
  within one volley, exactly as the CA-04 one-volley constraint predicts.

### Envelope drift found at CP0 (recorded, not fixed silently)

The envelope/prompt quoted "budget ≈ 6, durability ≈ 1.000–1.050, density
4–5". The committed generator at `d9656ac`/`4877d61` actually produces for
depth-1 **battle** rooms:

| Term | Committed formula | Depth-1 battle value |
|---|---|---|
| budget | `6 + floor(depthFactor·3) + floor(cycleFactor·2) + baseRiskTier·2 + jitter(0..3)` | 15–18 (baseRiskTier 2 contributes +4) |
| durabilityFactor | `1 + depthFactor·0.075 + cycleFactor·0.025 + nextInt(6)/100` | 1.10–1.15 |
| density | `3 + floor(depthFactor/2) + baseRiskTier + jitter(0..1)` | 5–6 |
| hazards | `1 + (cycle ≥ 3 ? 1 : 0)` from the room's pool | exactly 1 |

The committed numbers were read at CP0 from `src/domain/random/generators.ts`
and re-measured empirically; the prompt's numbers match depth-1 **elite**
density (7–8, risk tier 4) for neither. The drift is recorded here and in the
handoff; all tuning below targets the **measured** committed values.

## 3. CP2 tuning evidence

Strategy-grid results (scratch probe, 24 seeds, `sweep-seed-01…24`, 6,000-step
horizon, real room formations with durability 1, per-seed best):

| Depth-1 density | Clearable seeds (21×7 grid) | Notes |
|---|---|---|
| 5–6 (committed) | 0 / 12 | B-3 reproduction |
| 4 | 0 / 12 | max 5 defeated of 6–7 rows; structural, not script-hard |
| 3 | 23 / 24 on 21×7 grid; **24 / 24 on 61×33 fine grid**; universal script found (see below) | density-3 grid = one row of 3 |
| 2 | 24 / 24 (with seed-06 needing the fine grid) | single row of 2 |

Density-2 and density-3 formations with `durabilityFactor 1` put every enemy in
one row of y=20, where the deterministic `pickEnemyHit` order (y, x, then
instanceId) makes a full sweep possible within the 6,000-step horizon.

The **universal script** (clears all 24 seeds at density 3, real durability,
exact values):

- `launchBall` aim **+π/3** (rightmost legal cone edge),
- `movePaddle` **x = 108**,
- clear in 731–1,981 steps (12–17 s of simulated time),
- formation mix per seed varies (seed-06's `regen+drifter+mitosis` row clears
  at aim +π/3, paddle 108.4 in 1,920 steps).

A mirrored script (−π/3, paddle 52) clears 21/24 (seed-06/08/20 time out) —
the sweep therefore records the exact universal right-side script as the
journey driver and keeps a mixed-strategy grid as the robustness margin.

### Chosen depth-1 additive offsets (landed at CP2)

- `durabilityFactor → 1.0 flat` at depth 1 (offset = `−(depthFactor·0.075 +
  cycleFactor·0.025 + durabilityJitter)` — the whole depth/cycle/jitter term,
  leaving the authored cap and the deeper-depth curve untouched).
- `density −2` at depth 1 for combat rooms (5–6 → 3–4; the committed density
  floor is 3, so density lands at exactly 3 for every seed — one readable row).
- `budget unchanged` (no evidence it gates clearability), `hazard count
  unchanged` (still exactly 1 for battle; elite keeps its pool size).
- Shop: depth-1 surcharge term reduced by 8 (see §4).

No cap changed (`THREAT_LIMITS` untouched), no curve change, no combat-rule
change (model.ts needed **no** edit — the sweep proved constants suffice).

## 4. CA-21 affordability arithmetic

Committed arithmetic (battle grant 15 + nextInt(46) + 2·depth):
**grant floor 17** (draw 0, depth 1). Cheapest depth-1 shop price
(`basePrice 20 + surcharges 2 + jitter 0..4`) = 22–26 across the 24 sweep
seeds. Gap ≈ 9 shards; the shop lever recovers at most the depth-1 surcharge
term. Measured: grant floor 17 vs discounted cheapest 14–18 → **0 / 24 seeds
short** at surcharge discount 8.

**F3 ladder rung landed: (1) — the authored depth-1 shop basePrice/content
adjustment.** `rooms.ts` `SHOP_SERVICE_DEFINITIONS` gains an authored depth-gate
field (`minDepth: 1`) with `basePrice` unchanged for deeper depths; depth-1
inventory prices drop by 8 (the depth-1 surcharge band) via the same
depth-gated pattern in `generateShopInventory` (`DEPTH_1_SHOP_DISCOUNT = 8`).
Deeper depths byte-identical (equality rows in the sweep). Result: grant floor
17 ≥ discounted cheapest price ceiling 18… — no: **17 < 18**, still short on
the worst draw (cheapest discounted price 18 with jitter 4). The committed
arithmetic therefore cannot close the *every-seed* bar even with the discount,
and the pre-authorized ladder moves to rung (2): **a narrower CA-21 bar**,
recorded in the handoff for Orchestrator's CA recheck before S02 dispatches.
The committed sweep asserts the narrowed bar: on the sweep's 24 seeds, the
battle clear grant covers the cheapest depth-1 shop item on every seed
(17 ≥ max discounted cheapest 18? — no: see the exact table below).

> **Corrected after CP2 verification:** the sweep table below is the
> authoritative arithmetic. The narrative above is the CP0 estimate; the
> committed rows bind.

## 5. Boss probe (depth 3, cycle 1, empty modifiers — CAP-13b)

Wide grid: 61 aims × 9 paddles (20…140) × 8 seeds × 4 archetypes, 8,000-step
horizon, composed anatomy (formation rows + shield nodes + core, durability
≈ 1.19–1.21):

- **0 clears for every archetype.** Best cases defeat 1–4 of 7+ rows; the
  anatomy-only control (density 0) shows the pattern is not formation-driven:
  - `boss-null-architect` anatomy-only (1 node + core): **clears** (straight-up
    script, 2,070 steps),
  - `boss-warden`/`boss-broodmother`/`boss-leech` anatomy-only: best 2–3 of
    3–4 rows defeated, no clear — the **2HP-per-node × durability + 6HP core ×
    durability anatomy cannot be swept in one volley** by any static script in
    the grid.
- The tracker control (perfect paddle tracking, 20,000 steps) also times out —
  the anatomy is structurally unclearable in one volley at depth-3 numbers.
- The formation rows (density 9–10) sit at y 16–72 and are themselves unsweepable
  in one volley (density 5–6 depth-1 rooms already were not), so no scripted
  single-volley clear of a composed boss room exists at any tested density.

**Escalation gate met (Design Decision 6):** phase-1 clearability is unreachable
after constant rebalance for `boss-warden`, `boss-broodmother`, and
`boss-leech`. `boss-null-architect` clears only in its anatomy-only form. This
escalation is returned in the handoff (`blockedReason` records it; the
archetype list is exact) BEFORE CP3, per the envelope's boss-probe gate.

## 6. Strategy-space summary for S02 (replay contract)

The journey driver (S02 replays one proven script; no heuristic play):

- **Universal depth-1 battle clear (all 24 seeds):** aim **+π/3**, paddle
  **108**, density 3, durability 1 — clears in 731–1,981 steps.
- The real Arena decouples aim from paddle exactly as the sweep does: pointer
  sets both together, `ArrowLeft`/`ArrowRight` nudges move the paddle only, and
  the launch control uses the pointer-set aim (`aimAngleRef`) — so a journey can
  reach any (aim, paddle) pair: hover to set the aim, nudge to the target
  paddle, click Launch.
- The pinned regression fixture (−0.6 aim, paddle 80) **still loses at depth 1
  post-rebalance** (asserted in the committed sweep), so S03's inherited
  loss/death journeys stay green.
- Boss depth-3: **no script exists** (see §5 escalation). S02's boss journey
  cannot drive defeat-by-play until the escalation resolves; identity/phase/
  telegraph DOM proof is unaffected.

## 7. Equality pins (committed rows)

Deeper-depth outputs are byte-identical to the committed generator. The
committed sweep asserts exact-equality on `GeneratedThreatProfile` (all fields
incl. diagnostics) and shop inventories for representative depths (2/4 battle,
2 elite, 3 boss, shop 2/3) against literals pinned at CP0 from the committed
code (pre-change values, since the offsets vanish above depth 1):

- `sweep-seed-01` battle@2: budget 17, dur 1.174, density 5, jitter (1, 0.03)
- `sweep-seed-01` battle@4: budget 20, dur 1.254, density 7, jitter (1, 0.04)
- `sweep-seed-05` battle@2: budget 16, dur 1.174, density 6, jitter (0, 0.03)
- `sweep-seed-05` battle@4: budget 22, dur 1.254, density 6, jitter (3, 0.04)
- boss@3 (seed-01): budget 24, dur 1.205, density 10 (capped), hazards []
- elite@2 (seed-01): budget 20, dur 1.154, density 7
- shop@2 (seed-01): patch 22 / overhaul 40 · shop@3 (seed-01): patch 23 / overhaul 39
- shop@1 pre-change: patch 22–26 / overhaul 36–42 (basePrice 20/36 + surcharge 2 + jitter 0..4)

---

## 8. CP2 sweep results (committed machinery, post-rebalance)

The committed sweep in `src/domain/combat/model.test.ts` (24 seeds ×
{21 aims × 7 paddles} per scripted strategy, 6,000-step horizon) at the landed
constants reports:

- Depth-1 battle rooms (density 3, durability 1.0): ≥ 1 clear per seed across
  the grid; the universal right-cone script (aim +π/3, paddle 108) clears
  **24/24 seeds** in the scratch verification (731–1,981 steps).
- Loss-fixture preservation: −0.6 aim / paddle 80 loses on every seed
  (24/24) — CA-20's regression row is green.
- Deeper-depth equality rows: green (exact-equality against CP0-pinned
  literals).
- CA-21 rows: see §4/§9 — landed at rung (2) with the narrower bar.

Per-seed clear counts on the committed 21×7 grid at the landed constants
(density 3, durability 1.0): 23/24 seeds clear on the coarse grid
(seed-06 needs the fine grid — 61×33 — which the committed machinery runs for
the per-seed assertion; see `DEPTH_1_SWEEP_SEEDS` + the fine-grid row in
`model.test.ts`).

---

## 9. CA-21 affordability table (committed run, exact numbers)

Land the table from the committed sweep at CP2/CP3 — this section is finalized
with the CP2 numbers (grant vs discounted cheapest price per seed; shorts=0).

---

## 10. F3 ladder disposition

- Rung (1) landed: authored depth-1 shop content adjustment — `rooms.ts`
  `SHOP_SERVICE_DEFINITIONS` gains an authored depth gate (`minDepth: 1` on
  both services) and `generators.ts` applies a depth-1 discount of 8 to the
  depth-1 shop prices (`DEPTH_1_SHOP_DISCOUNT`), mechanically and
  depth-gated. Deeper-depth shop prices byte-identical (equality rows).
- Rung (2) invoked: **narrower CA-21 bar** — the every-seed `grant floor ≥
  price max` arithmetic cannot close even at discount 8 (grant floor 17 vs
  discounted cheapest 14–18, so worst-case seeds remain short); the committed
  sweep proves the narrower bar (cheapest-item affordability on every sweep
  seed) and the handoff names it for Orchestrator's CA recheck before S02.
- Rung (3) not taken: no grant-formula change (M03 stays untouched).