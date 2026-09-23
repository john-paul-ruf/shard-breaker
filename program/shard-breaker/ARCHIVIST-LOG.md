# Archivist Log — Shard Breaker

## 2026-09-14 — route-drafting (final pass)

**Run:** route-drafting, sha256:d1b77784478c6535ea9de8ecc61fb490b00374e8041defdf9cb315c547a9e410
**Sessions:** 2 (S01 domain/persistence/store, S02 UI/navigation/e2e)
**Mode:** final (Orchestrator performed Archivist reconciliation — runtime did not support spawning a separate Archivist session)

### Reconciled

- `arch/M01-application-shell.md` — Reconciled `deriveScreen` description: updated "returns only home/archive or home/checkpoint" to include `route-map` screen. Added S01 route app commands delta and S02 route-map navigation delta. Change History updated.
- `arch/M05-run-state-machine.md` — Added S01 route transitions delta (MaterializeRoute/SelectRouteOffer/CommitRoute, save-checkpoint instruction, generator-to-snapshot mapping). Change History updated.
- `arch/M07-persistence.md` — Added S01 saveCheckpoint delta. Reconciled "checkpoint remains deferred" to "checkpoint implemented; transfer, reset, and terminal-finalization remain deferred." Change History updated.
- `arch/M08-screens.md` — Added S02 RouteMapScreen delta. Change History updated.
- `arch/M09-components.md` — Added S02 RouteCard component delta. Change History updated.
- `arch/M10-styles.md` — Added S02 route-map styles delta. Change History updated.
- `arch/M13-e2e.md` — Added S02 route drafting e2e delta. Change History updated.

### Contradictions resolved

1. M01 `deriveScreen` said "returns only" two screen descriptors — contradicted by S02 adding `route-map`. Resolved to list all three.
2. M07 said "checkpoint ... remain deferred" — contradicted by S01 implementing `saveCheckpoint`. Resolved to remove checkpoint from the deferred list.

### Conventions added

None. No PROGRAM-CONFIG.md conventions crossed the three-cycle threshold (first cycle for this program).

### Proposed for framework

- **Runtime does not support spawning Archivist as a non-declared session.** The `spawn_subagent` facility requires a declared session ID matching role, lease, and slug. Archivist (not a Planner session, no session number in STATE.md) cannot be spawned. Orchestrator performed the reconciliation itself per ORCHESTRATOR.md's "If Archivist is unavailable, record the failed attempt and perform the same bounded completeness check yourself." (1 cycle, 1 instance — this run.)

### Standing recommendations

| pattern | cycles | in-cycle instances | first seen | status |
|---------|-------:|-------------------:|------------|--------|
| Runtime cannot spawn Archivist as non-declared session | 1 | 1 | route-drafting | open |

### Cleanup briefs

None. No cleanup candidates crossed the threshold (first cycle, 2 sessions, small surface area).

---

## 2026-09-22 — room-resolution (final pass)

**Run:** room-resolution, second execution of the plan (first execution
`f79cd79`–`1fcb139`, run sha256:4079d811…, completed S01 and was blocked at the
S02 dispatch by a runtime-infrastructure seam — the spawn validator; not a
product or planning failure). This pass is the first spawned-Archivist pass in
the program's history.
**Sessions:** 3 — S01 reward content + generator (done 2026-09-15, `6b55327`,
`ad5b08b`, carried from the executed first run and re-verified at HEAD); S02
room-resolution domain + store wiring, revision 2 (`ea37720`, `2e8632f`);
S03 room/reward screens + browser journeys, revision 2 (`ca856c1`, `7a5545a`,
`ee63581`). Orchestrator commits `99d7699`, `dc6d7d2`, `4103c7d`, `4c7129b`.
**Mode:** final (spawned by Orchestrator after the wave loop exited;
FINAL-REPORT.md was still being assembled — reconciliation worked from
MASTER.md, STATE.md (all sessions done, handoffs verbatim), PROGRAM-CONFIG.md,
`arch/**`, session prompts, and `git log`/source at `4c7129b`).

### Reconciled

- `arch/M01-application-shell.md` — Merged the dual Change History tables (the
  2026-09-22 SESSION-03 row sat orphaned outside the real table and contradicted
  nothing but the table's shape). Repaired the durable launch contract's
  `deriveScreen` enumeration: "returns only home/archive, home/checkpoint, or
  route-map" was stale twice over — `src/app/navigation.ts` at HEAD maps all
  five descriptors (`route-map`, `room`, `reward` by phase). Corrected the S03
  content-edge record to the mechanically-derived fact: `App.tsx` value-imports
  `ROUTE_SUPPORT_DEFINITIONS` from `src/domain/content/rooms.ts` (line 15) — a
  realized content→orchestration edge, previously mislabeled "M06 → M01" under
  the deep-file numbering. Declared the dual numbering at the top of the file.
- `arch/M03-deterministic-random.md` — Folded the type-only `EffectParam`
  authorization from the appended SESSION-01 fragment into "Dependency and
  Implementation Rules" (one rule, one home — the fragment had restated the
  entire "Depends on M02 only" rule with an amendment bolted on, so the file
  carried the dependency rule twice with different text). Removed the redundant
  fragment. Added `generateRoomCandidate` to Public API — exported by
  `generators.ts` and value-imported by `run/reducer.ts` since the
  deterministic-routes feature, but unlisted. Verified the runtime import
  surface at HEAD: `RECOVERY_RESTORE_AMOUNT` from `../content/rooms` +
  `./seededRng` only; `EffectParam` is `import type` and erases.
- `PROGRAM-CONFIG.md` Module Registry — rewritten from committed imports at
  `4c7129b` (every non-test file under `src/**`, `import type` and fully-type
  named clauses stripped; `export … from` would resolve as a runtime import —
  none exist): realized/declared `[R]`/`[D]` edge marking per PLANNER.md's
  contract; M01 Key Files updated for S01's `skills.ts`/`equipment.ts`/
  `enhancements.ts`; M03 Key Files corrected (`validation.ts` and `routes.ts`
  exist; `threat.ts`/`rewards.ts`/`progression.ts` do not — they live only in
  the Genesis contract); M06 Path completed with `src/main.tsx` (the
  composition root was in the deep-file M01 boundary but absent from the
  registry row); M07/M08 Key Files updated for the S03 screens/components and
  e2e helpers. Added a numbering declaration header plus a per-row deep-file
  mapping column (see Contradictions).
- Not reconciled (outside this pass's committed surface; reported for the next
  owner): the dual-table/orphan-row shape of `M07`, `M08`, `M09`, `M10`, `M13`
  (all created by `4103c7d`'s appends) and the M12 verification-scope
  overstatement (see below). Their per-module bodies are accurate at HEAD; the
  defect is structural, and it is now a named convention so the next pass
  repairs it wholesale.

### Contradictions resolved

1. **Dual module numbering (registry vs deep files).** `PROGRAM-CONFIG.md`'s
   Module Registry has 8 rows (M01–M08); `arch/` holds 13 per-module deep files
   (M01–M13) inherited from a prior archive import. Under the registry's
   numbering, every deep file's heading ID pointed at the wrong module (deep
   M01 "Application Shell" = registry M06; deep M05 = registry M03; deep M07 =
   registry M04; deep M08/M09/M10 = registry M07; deep M11/M12/M13 = registry
   M05/M08/unlisted). Session prompts and STATE.md consistently use the
   registry IDs, so no leased work was misled — but every cross-reference
   between the two doc sets resolved to the wrong module. Resolved by
   declaring the numbering split in both PROGRAM-CONFIG (header + mapping
   column) and the two rewritten deep files, rather than by renaming 13 files
   and every historical reference to them (a destructive, human-owned decision).
2. **Orphan Change History rows.** Orchestrator arch commits (`4103c7d`,
   `dc6d7d2`, `1fcb139`) prepend a new `## Change History` table above the old
   one per fragment. Resolved where rewritten (M01, M03); flagged for M07–M13.
3. **Stale `deriveScreen` contract** (see Reconciled — M01). Resolved to the
   five-descriptor mapping verified at `src/app/navigation.ts`.
4. **Verification-scope overstatement (arch M12/M13).** Deep M13 claims "The
   complete matrix contains 36 cases: nine flows across four configured
   projects"; `playwright.config.ts` configures four projects but this run's
   recorded acceptance is Chromium-only (15/15 at `ee63581`, re-run by
   Orchestrator on port 8082), and no record of a 36-case execution exists in
   STATE.md or git. Reported, not rewritten (M12/M13 not in this pass's
   pathspec).

### Corrections verified, no action needed

- **Phase-state coherence (S02 correction).** The revision-2 prompt's
  implementation section contained two contradictions (keep the resolved
  `roomState` alongside `phase: "reward"`; keep the applied `RewardState` as a
  "terminal record" while also nulling it). SESSION-02 resolved both against
  `src/domain/run/validation.ts` phase-coherence rules — verified at HEAD:
  lines 340–356 reject a `routeState`/`roomState`/`rewardState` that outlives
  its phase (`unexpected-room-state`, `unexpected-reward-state`). The committed
  reducer nulls both states in their transitions; `displacedRewardId`/
  `displacedSlot` are schema-valid but always null on produced durable states;
  the S03 disclosure computes the pre-confirm preview from the offered draft +
  build. Arch M05's SESSION-02 fragment, CA-04/CA-05, and the recorded
  agreement-of-record all match the source. No drift.
- **`ROUTE_SUPPORT_DEFINITIONS` read + `listRouteSupport()` follow-up.** The
  read exists exactly as recorded (`src/app/App.tsx:15`, value import; used by
  `objectiveNamesFor`); `listRouteSupport()` does not exist anywhere (`grep`:
  0 hits), so recording it as a *proposed* facade lookup — not an existing API
  — is correct. Carried as a Planner follow-up in arch M01 and STATE.md.

### Conventions added

None crossed the three-cycle threshold on the convention channel. The
dual-numbering and orphan-table patterns are recorded as conventions *inside*
the arch docs and registry this pass (documentation repair, not a Coder-facing
rule); minting a Coder/Planner-facing PROGRAM-CONFIG convention from them would
require recurrence in a future cycle, which the standing table now tracks.

### Proposed for framework

- **Dual module-ID numbering between the PROGRAM-CONFIG registry and archived
  per-module arch files.** The registry is the lease-derivation surface; the
  deep files are the reading surface; their IDs disagree (deep M01 = registry
  M06, etc.). Recommend: a one-time human-approved mapping (or file renames)
  plus a convention that per-module deep files cite their registry row. (1
  cycle, room-resolution; instances: 13 deep files vs 8 registry rows, every
  cross-reference affected. Not adopted — first emission.)
- **Session arch fragments are appended as parallel sections with their own
  Change History tables, leaving orphan rows that contradict the main body.**
  Observed both cycles, across 6+ files this pass alone (M01, M03, M05, M07,
  M08, M09, M10, M13 all carry double tables; 2026-09-14's route-drafting pass
  hit the same shape and repaired two instances by hand). Recommend: ORCHESTRATOR
  guidance that arch appends either edit the existing Change History table or
  flag the file for Archivist reconciliation at the next boundary. (2 cycles,
  6 in-cycle instances. Not adopted — first emission of the generalized form.)
- **Session prompts prescribe implementation details that contradict their own
  capability specs, resolved at checkpoint-0 under the deviation protocol.**
  S02: step 5 kept `roomState` past the phase transition and step 6 kept the
  applied `RewardState` as a "terminal record" (both disproved by
  `validation.ts` phase coherence); S03: `onSelect`-dispatch + durable
  `selectedCardId` in the view model (disproved by the committed producer's
  apply-on-dispatch semantics) and view-model shapes lacking data their own
  specs require (`objectiveNames`, `build` arrays, `catalog`). Each was caught
  and correctly resolved — the cost is a deviation per instance rather than a
  defect. Recommend: Planner verify prescribed view-model/transition shapes
  against the validation rules and committed producer semantics before
  publishing prompts. (1 cycle, 4 instances in one session pair. Not adopted —
  first emission.)
- **Arch/verification claims drift from the executed verification surface**
  (M12's "36 cases, nine flows across four projects" vs the recorded 15-case
  Chromium gate). Recommend: arch fragments cite the executed run's recorded
  counts from STATE.md, not the configured matrix. (1 cycle, 1 instance. Not
  adopted — first emission.)
- **Runtime cannot spawn Archivist as a non-declared session** — carried from
  route-drafting; **adopted this run**: the 2026-09-22 final pass ran as a
  spawned subagent (this pass), so the spawn facility now supports it. (2
  cycles, closed.)

### Cleanup findings (tracking; no brief)

Thresholds not crossed (no campaign reached 3 high- or 5 medium-confidence
related findings), so no Planner brief is emitted. Recorded here because the
default ledger path `program/shard-breaker/CLEANUP-LEDGER.md` does not exist
and this pass's commit surface is `arch/**` + `ARCHIVIST-LOG.md` only; the
findings carry into that ledger at its creation:

- **Deep-file public-API ghosts (low-medium, blast radius: docs-only).** The
  unimplemented modules' contracts list APIs that no tree will ever satisfy
  verbatim (deep M05 `validateRunCommand`/`calculateShards`/
  `calculateRecordUpdate`/`ProfileState`/`BuildState`/`RewardDraft`: 0 grep
  hits; deep M07 `transfer.ts`, `exportProfile`, `importProfileAtomically`,
  `resetProfileAtomically`, `finalizeRunAtomically`, `abandonRunAtomically`:
  0 hits — transfer/reset/finalization remain unimplemented). Not code debt;
  proposed check: reconcile each deep file's Public API against grep at the
  next arch reconciliation, marking planned-vs-implemented per entry.
- **`catalog.hasContent` production consumers (low, blast radius: one facade
  method).** All call sites outside definition/tests are test files; no
  production consumer today. False-positive risk: it is the designated
  existence check for future consumers (M06/M07 planned). Proposed check:
  re-grep at the combat feature's planning; retire if still consumerless.
- **`generateThreatProfile`/`THREAT_LIMITS`/`SHOP_PRICE_CAP` unused outside
  M02 (low, blast radius: one module).** `generateThreatProfile` is consumed
  only inside `generators.ts` (by `generateRoomCandidate`) and its tests; the
  constants likewise. This is the designed producer/consumer split (the run
  domain consumes the composed candidate, not the raw profile) — recorded as
  intentionally retained unless the combat feature changes the split. Proposed
  check: none until the combat feature plans threat consumption.
- **Stale tracked artifacts (medium, blast radius: repo hygiene).**
  `.DS_Store` is tracked at the repo root despite `.gitignore` listing it
  (macOS metadata, zero build value); `program/shard-breaker/STATE.md` (top
  level, 182 bytes, untracked) sits beside the program's canonical
  `prompts/room-resolution/STATE.md` and `runs/` is untracked. Proposed
  check: `git rm --cached .DS_Store`; confirm the top-level STATE.md/runs/
  with Orchestrator (not Archivist's surface to decide — they may be
  deliberate program-level records).
- **Deep-file M11/M12 describe unregistered modules.** M11 (migrations) maps
  to registry M05 and M12 (toolchain) to registry M08, but no registry row
  cites them and no session has ever leased them; their Change History ends
  2026-08-29. Now visible via the registry mapping column; proposed check:
  fold their content into registry-row-linked deep files at the next arch
  reconciliation (docs-only, destructive to nothing).

### Standing recommendations

| id | pattern | cycles | in-cycle instances | first seen | status |
|----|---------|-------:|-------------------:|------------|--------|
| bac1b1d12fd4fe3c | Runtime cannot spawn Archivist as non-declared session | 2 | 2 | route-drafting | adopted (spawned Archivist ran this pass) |
| a317d95d1b90f717 | Orchestrator manually edits arch files instead of spawning an Archivist worker | 1 | 1 | route-drafting | retired (superseded — spawning now works; see bac1b1d12fd4fe3c) |
| 241b5763f1e80933 | Session arch fragments are stapled as appended sections, leaving per-module Change History tables with orphan rows | 2 | 6 | route-drafting | open |
| 661756194ad4315c | Module numbering in session prompts and arch files (M01..M13) diverges from the PROGRAM-CONFIG registry (M01..M08), so every registry row refers to the wrong modules | 1 | 13 | room-resolution | open (deep-file↔registry mapping now declared in both) |
| f002384c0ba9a6a8 | Session prompts prescribe view-model shapes that lack data their own specs require, forcing checkpoint-0 deviations | 1 | 4 | room-resolution | open |
| d24fd0a6a1cb33c7 | Arch docs overstate verification scope (claiming cross-browser 36-case e2e coverage that does not exist) | 1 | 1 | room-resolution | open |
| 12ba44a3a0805234 | Per-feature arch fragments accumulate without periodic reconciliation into single-module coherence | 1 | 8 | room-resolution | open (this pass reconciled M01/M03 + registry; M07–M13 remain) |
| 1b8e9965663c56d1 | Archived module files outside the registry (M09..M13) are never reconciled when their modules change; registry Key Files lists are stale at every feature boundary | 1 | 2 | room-resolution | open (registry Key Files repaired this pass; M09–M13 deep files still unreconciled) |

### Verification

- `PLANNER.md`, `CODER.md`, `UI-CODER.md`, `ORCHESTRATOR.md` are byte-identical
  to how this pass found them (not written by Archivist).
- Every claim above cites committed sources: `src/**` at `4c7129b`, git log
  (`6b55327`…`4c7129b`), STATE.md, the session prompts, and the run report
  inputs. `.program/` is gitignored private scratch; nothing in it was used as
  evidence (the run record itself notes the executed run's `.program/` no
  longer exists).
- Re-committed surfaces: `program/shard-breaker/arch/M01-application-shell.md`,
  `program/shard-breaker/arch/M03-deterministic-random.md`,
  `program/shard-breaker/PROGRAM-CONFIG.md` (Module Registry section only —
  Verification Commands, Git Configuration, Session Defaults, and Custom Rules
  are byte-identical to how this pass found them), and this log.