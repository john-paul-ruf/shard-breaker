# FINAL REPORT — combat-engine (Shard Breaker)

## Summary

The combat-engine feature built the deterministic combat domain (`src/domain/combat/`,
registry M09), the real-time browser bridge (`src/game/`, registry M10), the combat and
boss room UI, seeded boss content with capped modifier generation, and the run-domain
economy/terminal, replacing the "combat engine coming soon" placeholder. Six of seven
Planner sessions completed fully and were accepted with independently re-executed green
gates; SESSION-07 landed 4/4 checkpoints of substantial verified work and was then
**declared blocked at CP4** on one structural planning defect (below). The whole-repo
gate is green at close: **607 unit tests / 30 files, typecheck 0, lint 0 errors (+1
pre-existing RouteMapScreen warning), production build 170 modules (466.62 kB), chromium
e2e 17/17** (15 inherited + loss-checkpoint + death journeys; re-executed by Orchestrator
on a fresh port).

**Sessions done/total:** 6 fully done + 1 blocked-at-CP4 with delivered work accepted
(7 planned). 3 owner corrections landed (B-1 fixture repair, B-2 boss CSS, B-4
finalizeDeath tightening).

**Run interruption:** the run was interrupted on 2026-09-23 after SESSION-04 attempt 1
crashed on a provider transport error (no writes, tree clean); it was resumed
2026-09-24 20:35 from the crash record, re-dispatched under the unchanged lease, and
completed without further interruption.

## The open blocker (B-3) — human decision required

**Finding:** clearing a battle room by pure pointer play is **structurally unreachable**.
The plan's journey fallback ("assert the state machine through repeated launches … until
ROOM CLEAR") was written against a premise the committed domain contradicts: per committed
CA-04 semantics (S02), a loss restores the room-entry formation snapshot, so volley damage
is discarded on every loss and can never accumulate. SESSION-07 proved this with an
exhaustive deterministic probe — **7,625 launches (25 seeds × 61 angles × 5 paddle
positions) plus multi-strategy sweeps: zero clears** — and preserved the correct behavior
rather than weakening journeys or inventing a bypass.

**What this blocks:** the battle-clear browser journey (clear → currency in IndexedDB →
affordable shop buy → reload survival), the boss journey (depth 3 identity/phase/telegraph →
defeat → depth-4 draft), CAP-11's browser half, and the browser-level closure of the
recorded room-resolution CAP-02 boundary. What still stands: unit-level CA-13 evidence
(grant rule proven, once-only via the outcome ledger), the full death terminal
(CAP-12, browser-proven), and both non-clear journeys (loss-checkpoint, death).

**The decision (product design — not agent-owned):** choose one, then Planner re-specs the
journeys and a follow-up session lands them:
1. **Rebalance threat numbers** so a seeded opening strategy can clear the first battle
   room (changes user-visible gameplay difficulty; recommended if playability of the first
   room is itself considered a product defect — the probe suggests it is).
2. **Sanction a test-only clear affordance** (e.g. a dev/test hook that resolves a seeded
   room) — changes what browser acceptance proves; needs explicit sign-off.
3. **Re-scope the browser proof** to the store-level boundary CA-13's unit tests already
   cross — weakest option; weakens the approved acceptance text, which planned journeys
   crossing the real transport to an affordable buy.

## Files created/modified

- **New modules:** `src/domain/combat/` (M09: model, layout, rules, results, effects,
  bossState + tests), `src/game/` (M10: engine, input, session, renderer, Arena.tsx + tests).
- **New content/UI:** `src/domain/content/enemies.ts`, `bosses.ts` (full definitions) +
  catalog lookups; `src/ui/screens/CombatScreen.tsx`, `BossScreen.tsx`;
  `src/ui/components/TelegraphBanner.tsx`.
- **Modified:** `src/domain/run/` (combat commands/transitions, currency grant, death
  terminal), `src/domain/random/generators.ts` (combat checkpoints, boss modifiers, strict
  shape), `src/app/` (command surface, navigation branches, model builders), persistence
  (sanctioned scoped `finalizeDeath` seam), styles, e2e suite (17 journeys).
- **No Author artifacts touched** (`specs/`, `mocks/`); migration 001 untouched.

## Architecture impact

- Registry rows M09/M10 formalized; deep arch files M02/M03/M04/M05/M06/M07/M08/M09/M10
  received feature-qualified fragments (integrated per receive; Change History rows added;
  final Archivist pass reconciles the registry).
- Realized edges: M09→M01/M02 [D→R]; M03→M09 (reducer consumes outcomes);
  M02→M09 (generator emits checkpoints + boss modifiers); M10→M09; M10→M06 type-only;
  M06→M10 (App composes Arena); M07→M10 (screens import Arena); M06→M09 [D→R] App-side
  (`fromCombatCheckpoint`, `resolveVolleyEffects`, `createBossModel`).
- **Sanctioned lease additions recorded:** S07's persistence seam (`envelopes.ts`,
  `repositories.ts` — finalizeDeath extension only; tightened to a REQUIRED repository
  capability by OWNER-FINALIZE-REPO at `97553fd`).

## Verification

| Gate | Final evidence (Orchestrator re-executed where marked) |
|---|---|
| Unit/component | **607 passed / 30 files** (exit 0) — grew 329/16 → 607/30 across the run; every session's delta matched its declared additions exactly |
| Types | `npm run typecheck` exit 0 |
| Lint | exit 0 (0 errors + 1 pre-existing RouteMapScreen react-refresh warning, preserved by instruction) |
| Production build | exit 0, 170 modules, `index-CH8gmHQO.js` 466.62 kB |
| Chromium e2e | **17/17 passed** — Coder on fresh port 8083, Orchestrator re-execution on fresh port 8084 (23.4s); fresh-port flake class honored throughout |
| CA proofs | CA-01…CA-10, CA-11, CA-12 unit/producer/component proofs landed and consumed; CA-13 unit-proven (browser half blocked); CA-14 fully proven incl. browser; CA-15 loss+death shares browser-proven |

**Residual gap:** the battle-clear and boss browser journeys (see B-3 above). Known
recorded debt (non-blocking): rolled-params durable carrier kept empty (S07 decision;
Author/persistence-schema territory); wall-hit currency carrier (`WALL_HITS_CARRIER_LANDING
= 0`); canvas glyph threading; lost-outcome-when-busy bridge/store seam (S07 surprise 4).

## Follow-up

1. **Human:** pick the B-3 resolution (the three options above).
2. **Planner:** re-spec the battle-clear and boss journeys per the chosen option; a
   follow-up session lands them and closes CAP-11's browser half + CAP-13.
3. **Next feature (per STATE.md):** run summary screen + Shards economy + relic choice —
   `lastRunSummary` / `lastFinalizedRunId` / records are populated and displayed through
   the existing archive screen.
4. **Bridge/store owners:** wall-hit carrier; lost-outcome-when-busy seam.
5. **Planner notes carried from handoffs:** skill-rail placement (sketch vs mock); Breach
   dual-control `combat/launch` sanction; runtime `phaseId` vocabulary vs "routing";
   generator-vs-strict-schema check at planning time; treat app-owned inputs as
   caller-closed-over state in bridge sketches.

## Orchestration

**Concurrency:** 3 (cap; executed as a linear plan — waves of 1, plus one wave of 2
disjoint-lease workers)   **Wall clock:** 2026-09-23 07:26 → 09:44 (interrupted), resumed
2026-09-24 20:35 → 23:58   **Sessions run:** 7 Planner sessions + 3 owner corrections + 1
archivist-planning pass   **Checkpoints committed by Coder:** 25 (S01 3, S02 5, S03 4,
S04 5, S05 4, S06 2, S07 4; owner corrections 3 — S06's CP3 was verification-only by
design and four checkpoint boundaries elsewhere were gate-only with no lease delta)

### Wave plan as executed
| Wave | Sessions | Notes |
|---|---|---|
| 1 | 01 | sole eligible (linear plan) |
| 2 | 02 + OWNER-TESTFIX-CA03 (serial) | B-1 stale fixtures repaired before S03 |
| 3 | 03 | bridge module |
| 4 | 04 (attempt 1 crashed pre-write; attempt 2 landed) | resumed after interruption |
| 5 | 05 | boss content/machine/screen |
| 6 | 06 + OWNER-BOSSCSS-CSS (parallel, disjoint leases) | B-2 CSS seam cleared concurrently |
| 7 | 07 + OWNER-FINALIZE-REPO (follow-up) | S07 blocked-at-CP4; B-4 tightening landed |

### Blocked
| S | Reason | Last checkpoint | Dependents stalled |
|---|---|---|---|
| 07 | declared-blocked at CP4 — battle-clear/boss browser journeys structurally unreachable (CA-04 loss semantics restore the entry formation; 7,625-launch probe / 0 clears); product-design/planning defect (B-3) | 4/4, all committed and accepted | CAP-11 browser half, CAP-13 battle/boss journeys, recorded room-resolution CAP-02 boundary's browser proof; nothing else — all other work done |

### Blocker escalations
| S | Class | Action / human ask | Disposition |
|---|---|---|---|
| — | owner-seam (uncommitted plan of record) | committed Planner's on-disk PROGRAM-CONFIG revision (`abca569`) before first dispatch | auto-cleared |
| B-1 | owner-seam (2 stale fixture assertions outside S02's lease) | OWNER-TESTFIX-CA03 dispatched | auto-cleared `bd3b10d` |
| B-2 | owner-seam (boss CSS unstyled; mock prescribes treatment) | OWNER-BOSSCSS-CSS dispatched concurrently with S06 | auto-cleared `5747b6c` |
| B-3 | declared-blocked (product-design / planning defect) | **escalated to human** with three options (rebalance / test-only affordance / re-scoped proof) | **open — human decision pending** |
| B-4 | owner-seam (finalizeDeath optional; fixture outside S07's lease) | OWNER-FINALIZE-REPO dispatched post-S07 | auto-cleared `97553fd` |

### Interim Archivist checks
| After wave | Sessions received | Result | Drift found | Actions |
|---|---|---|---|---|
| planning completeness (pre-wave 1, 2026-09-23) | 0 | completed (recorded in archivist notes) | integration-discipline note recorded; fragment-attachment procedure adopted | fragments integrated with Change History rows + registry-note headers |
| final (2026-09-24) | 7 sessions + 3 owner corrections | see Archivist's Note below | see below | appended verbatim below |

### Lease violations
none — every Coder commit verified inside `Owns` via per-commit `git show --name-only`;
`filesTouched` matched the lease on every receive (S07's list was a subset: production
screens unchanged because S04/S05 had already bound the values).

### Checkpoint shortfalls
none — S06's CP3 was a verification-only boundary (declared by the worker; `npm run verify`
exit 0; no lease delta existed after CP2). All other claimed checkpoints matched git log.

### Wave plan corrections
none — Planner's linear plan was verified path-by-path; the only file-sharing pairs
(S01/S05, S02/S06, S02/S07, S04/S05, S04/S07) are all serialized by dependency order.

### Granularity feedback for Planner
- No session ever committed zero checkpoints; no session exhausted context mid-checkpoint.
- S06 declared CP3 a verification-only checkpoint (nothing to commit) — legitimate, but a
  2-checkpoint plan would have been more honest to its own shape.
- **Axis feedback:** SESSION-07's journey premise ("repeated launches until ROOM CLEAR")
  was cut along the wrong grain — it assumed accumulation semantics the committed CA-04
  checkpoint design does not have. Future journey specs should be derived from the
  committed loss/restore semantics (or the semantics should be changed deliberately, as a
  product decision), not from an assumed strategy space.
- Recurrence evidence for Archivist: generator-side emitted shapes vs persistence strict
  schemas (S06 surprise 1) — the mismatch was invisible to the whole suite until a boss
  room crossed the real parse boundary; plan-time check recommended.

### Process effectiveness
- First-dispatch completion: 7/7 sessions dispatched exactly once after eligibility
  (S04's second dispatch was the authorized recovery of a provider-transport crash, not a
  rework of returned work). Sessions accepted without unplanned correction: 4/7 (S01, S03,
  S05 accepted-with-filed-seams, S06 accepted with one in-lease conformance correction
  recorded); 3/7 produced unplanned corrections (S02 → B-1; S05 → B-2; S07 → B-4), all
  resolved by separate narrow owner workers with the worker's own machine-actionable
  suggestedChange; zero same-context lease revisions were needed.
- Integration rework: one in-lease correction commit per session was common (S02 lint
  rename, S03 arch-contract fix, S04 telegraph projection, S05 rail restructure) — all
  self-caught by worker negative controls before acceptance; no corrective commit was
  needed after any acceptance. CAP IDs affected by unplanned corrections: CA-03 (B-1
  fixtures), CAP-09 (B-2 styling), CAP-12 (B-4 envelope tightening).
- Environment failures: 1 provider transport crash (S04 attempt 1, 0 writes, recovered on
  attempt 2); 1 run interruption (between the crash receive and re-dispatch; resumed clean).
  Product decisions: 1 open (B-3, human). Planning defects: 1 (the B-3 journey premise).
- Durations from recorded launch/receive times: S01 ~21 min, S02 ~58 min, S03 ~34 min,
  S04 attempt 2 ~53 min, S05 ~30 min, S06 ~25 min, S07 ~60 min (incl. two full e2e runs);
  owner workers 2–5 min each.

### Capability completion
| CAP | Status |
|---|---|
| CAP-01 (enemies + lookups) | verified through S03 rebuild consumption |
| CAP-02 (deterministic simulation) | producer + reducer + bridge + Arena landed; the clear→currency half's browser journey blocked by B-3 |
| CAP-03 (build-driven effects) | producer + consumption landed; `rolledParams` carrier recorded as deliberate deferral (resolver consumes empty, never invents); display homes landed S04 |
| CAP-04 (combat room lifecycle) | full behavior landed (S02); browser loss/death journeys green; clear-path journey blocked by B-3 |
| CAP-05 (real-time bridge) | producer complete (S03); Arena integration landed (S04); browser share green in loss/death journeys |
| CAP-06 (combat room screen) | component-level landed (S04-CP3); browser journeys green for loss/death; clear-path blocked by B-3 |
| CAP-07 (Arena component) | producer complete (S04) |
| CAP-08 (boss combat rules) | producer landed (S05); application wiring landed (S06); browser defeat journey blocked by B-3 |
| CAP-09 (boss room screen) | component-level landed (S05-CP3); browser journey blocked by B-3 |
| CAP-10 (seeded modifier selection) | **producer complete + proven** (S06; depth 3 = cycle 1 asserts empty in the boss journey when it lands) |
| CAP-11 (currency grant) | producer complete, unit-proven (S07-CP1); browser half blocked by B-3 |
| CAP-12 (death terminal) | **verified** — reducer/store/repo/browser (S07) |
| CAP-13 (browser journeys) | **partially verified** — 17/17 e2e incl. loss-checkpoint + death; battle-clear + boss journeys blocked by B-3 |

The product is **not** declared complete: CAP-13's approved battle-clear and boss journeys
(and CAP-11's browser half) remain blocked on the human's B-3 decision, with owners and
acceptance conditions recorded in STATE.md's CAP/CA tables.

### Follow-up closure ledger
| Session | followUp / surprises entry | Disposition |
|---|---|---|
| S01 | S02/S03/S05 consumption notes (hook points, catalog arg, mirrored caps) | **closed** — consumed by S02/S03; S05 honored `bossState: null` |
| S01 | M09 registry file-set note to Archivist | **closed** — fragments integrated; final pass reconciles |
| S02 | B-1 stale fixture repair (needsOwnerCorrection) | **closed** — OWNER-TESTFIX-CA03 `bd3b10d` |
| S02 | S03 bridge contracts; S04 display homes; S07 currency/death/rolled-params | **closed** — S03/S04 consumed; S07 recorded the carrier decision and grant |
| S02 | Orchestrator CA-03 recheck before S03/S04 | **closed** — executed at S02 receive |
| OWNER-TESTFIX-CA03 | dispatch unblocked | **closed** — S03 dispatched |
| S03 | S04 Arena contracts (zero-arg resolver, closure pattern); S07 journey fixture (−0.6/paddle-80) | **closed** — S04/S07 consumed both |
| S03 | Planner note: bridge sketches should treat app-owned inputs as caller-closed-over state | **carried** — recorded in this report's Planner notes (future prompts) |
| S04 | S05 BossScreen composition + TelegraphBanner countdown; S07 journeys; glyph threading | S05 composition **closed**; journeys **carried** to the post-B-3 follow-up session; glyph threading **carried** (bridge owner) |
| S04 | Planner note: skill-rail placement contradiction | **carried** — recorded in Planner notes |
| S04 | surprise: `glyphFor` never threaded (renderer outside lease) | **carried** — bridge owner; journey follow-up |
| S05 | S06 modifier selection + boss-density reconciliation | **closed** — S06 selected modifiers AND capped boss-room density (`BOSS_ROOM_MAX_DENSITY = 10`) |
| S05 | S07 depth-3 journey; glyph consideration | **carried** — post-B-3 follow-up session |
| S05 | B-2 boss CSS owner correction | **closed** — OWNER-BOSSCSS-CSS `5747b6c` |
| S05 | Planner note: Breach dual-control sanction; phaseId vocabulary | **carried** — recorded in Planner notes |
| S06 | S07 journey facts (strict 4-field boss object; depth 3 = cycle 1 empty modifiers) | **carried** into the post-B-3 journey spec (recorded in STATE.md CA-11 row) |
| S06 | Planner note: generator-vs-strict-schema check at planning time | **carried** — recorded in Planner notes |
| S07 | (a) journey re-spec after the human's B-3 decision + follow-up session | **carried** — the run's one open obligation; owner = Planner + human |
| S07 | (b) finalizeDeath required-member owner correction | **closed** — OWNER-FINALIZE-REPO `97553fd` |
| S07 | (c) wall-hit carrier; lost-outcome-when-busy seam (bridge/store owners) | **carried** — bridge/store owner; recorded in STATE.md + arch M05 fragment |
| S07 | (d) next feature entry point (summary screen/Shards/relics) | **carried** — next feature's plan |
| S07 | (e) Archivist reconcile M04/M05 fragments + optional-capability decision | **closed** — fragments integrated (`31ad07a`); capability made required (`97553fd`) |

### Archivist's Note

- **role:** archivist
- **mode:** final (combat-engine; HEAD at pass start `97553fd`; commit `25c2ff2`)
- **registryUpdated:** true — Module Registry re-derived from committed imports at `97553fd` (rows: M02/M03 now carry `M09 [R]`; M09 = `M01 [D→R], M02 [R], M03 [D→R type-only]`; M10 = `M09 [R], M06 [D→R type-only]`; M06 gains `M09 [R]`; M07 gains `M09 [R], M10 [R]`; M08→M10 stays declared `[D]` with the post-B-3 journey owner). Conventions/Verification/Git/Session/Custom Rules and Author Sources are byte-identical to how this pass found them.
- **reconciled:**
  - `program/shard-breaker/arch/M07-persistence.md` — `finalizeDeath` reconciled from "optional capability pending the fixture member" to its actual state: required capability at `97553fd` (OWNER-FINALIZE-REPO; fixture member landed; store's fail-closed path unchanged); orphan Change History table merged.
  - `program/shard-breaker/arch/M13-e2e.md` — the "36 cases across four projects" verification-scope overstatement corrected to the recorded executed surface (12→15→17 Chromium; four projects configured, none executed beyond Chromium); combat journeys fragment added with the battle-clear/boss journeys kept **blocked-by-B-3, not verified**; orphan Change History table merged.
  - `program/shard-breaker/arch/M04-combat-domain.md` — S06's `BOSS_ROOM_MAX_DENSITY` resolution and `layout.test.ts` delta recorded in the S05 fragment (the S06 note is now marked resolved with the commit evidence).
  - `program/shard-breaker/arch/M01-application-shell.md` — combat-era navigation delta (seven descriptors verified at HEAD) and the CA-13 banked-currency save-signal behavior added to the store contract.
  - `program/shard-breaker/arch/M05-run-state-machine.md` — registry-note header added (deep M05 = registry M03); body verified against source, no other drift.
  - `program/shard-breaker/PROGRAM-CONFIG.md` — registry notes rewritten from mechanically-derived imports at `97553fd` (the `230cf20`-anchored notes lagged the table: M03→M09 and M02→M09 realized edges absent from the bullets, M04→M03 mislabeled "[type-only]", M08's M04/M06 imports omitted from the bullets).
  - `arch/M02/M03/M06/M08/M09/M10/M11/M12` — fragment integration verified, no drift requiring edit; M02's dated pre-feature boundary line (boss combat "deferred") left as the historical record rather than rewritten.
  - `.program/archivist-notes.md` interim findings folded in: the integration-discipline procedure is verified working (no parallel Change History tables this cycle — pattern `241b5763f1e80933` did not recur); the M01-anchor observation is cosmetic; the pending-fragment inventory is complete (`44f475c`, `3acc195`, `31ad07a`).
- **conventionsAdded:** — (nothing crossed the three-cycle bar; the B-3 premise pattern has 1 cycle behind it and is recorded on the framework channel below)
- **proposedForFramework:**
  - Journey specs must be derived from committed domain semantics, not assumed strategy spaces (B-3: "repeated launches until ROOM CLEAR" vs CA-04 restore-on-loss; 7,625-launch probe) — 1 cycle, 1 instance (S07-CP4; promotes to a PROGRAM-CONFIG convention on recurrence).
  - Derive module registry facts mechanically from the committed tree at reconciliation, not from the revision Planner wrote them at — 1 cycle, 4 instances (the four registry-notes drifts).
  - A "reducer maps X verbatim" claim needs a strict-schema round-trip proof before a feature declares X persistable (S06 strict-4-field boss emission) — 1 cycle, 1 instance.
  - Standing-table row IDs must be reproducible from the documented formula; `661756194ad4315c` does not derive from its cells (recomputed all eight; six reproduce) — 1 cycle, 1 instance; the row is carried verbatim per the ID contract.
  - Adoption note: the spawn-capability recommendation (`bac1b1d12fd4fe3c`) remains adopted — this pass ran as a spawned subagent.
- **cleanupBriefs:** none — no campaign crossed a threshold (no 3 related high-confidence, no 5 related medium-confidence findings; no high-confidence destructive cleanup). `CLEANUP-LEDGER.md` created with 8 carried/new findings (4 tracking, 3 retired as evidence-false-or-intentionally-retained, 1 retired); findings 7–8 (`glyphFor` threading, the two carrier swap points) are deliberately retained debt with named owners, not cleanup targets.
- **logEntry:** dated 2026-09-24 entry appended to `program/shard-breaker/ARCHIVIST-LOG.md`; historical entries byte-identical to how this pass found them; standing recommendations carried forward as the full backlog (8 prior rows with verbatim IDs — `241b5763f1e80933` and `f002384c0ba9a6a8` had no recurrence this cycle, `d24fd0a6a1cb33c7`'s named instance repaired in M13 — plus 4 new rows minted from the documented formula).
- **constraints honored:** STATE.md, MASTER.md, session prompts, and FINAL-REPORT.md untouched; `src/**` and `tests/**` untouched; `PLANNER.md`/`CODER.md`/`UI-CODER.md`/`ORCHESTRATOR.md` byte-identical (no `program-agents/` commits touch them); CA-13's browser half and CAP-13's battle/boss journeys remain blocked-by-B-3 and were not upgraded anywhere; commit used an explicit pathspec only.