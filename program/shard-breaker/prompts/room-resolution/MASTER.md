# Build — Shard Breaker / room-resolution

## Agents
Planner planned this. Coder builds it (./CODER.md). Orchestrator schedules it (./ORCHESTRATOR.md).

**Solo run:** follow the protocol below. One agent works through sessions
serially.

**Parallel run:** hand this directory to Orchestrator. Orchestrator spawns Coder as
subagents using whatever subagent mechanism is provided by the agent/runtime
executing Orchestrator, awaits their results, and owns STATE.md / MASTER.md / arch
files. Coder commits its own lease at every checkpoint. See ./ORCHESTRATOR.md and
./CODER.md for the full contract.

## Protocol — Each iteration (solo mode):
1. Read PROGRAM-CONFIG.md (registry, stack, conventions, verification)
2. Read STATE.md (current sessions, capability readiness, agreements, blockers,
   Verification Baseline, last checkpoint; distinguish these from historical handoffs)
3. Pick next pending session whose dependencies are done and whose required
   Contract Agreements are agreed with ready producer inputs; use the same
   recheck as Orchestrator before starting, including capability input origins and
   proofs required from predecessors; do not require its own future proof yet
4. Read SESSION-NN.md fully + Module Context files
5. Read affected files before modifying
6. Execute checkpoint by checkpoint. Commit each with an explicit pathspec
   covering only the session's Owns. Stay inside Owns.
7. Verify session checks, PROGRAM-CONFIG compliance, and this checkpoint's Contract
   Agreement proofs using the Verification Baseline's replacements and execution
   constraints. Record actual results and invalidate affected agreements/evidence
   when a contract changes or counterevidence disproves a claim
8. Update STATE.md (status, checkpoint, date, notes, handoff)
9. Update architecture if new module or changed public API
10. Loop. All sessions done → Final Report; report any required capability still
    unverified as incomplete, with its owner and remaining proof.

## Crash Recovery
- Read STATE.md → any in-progress session, and its last committed checkpoint
- Read Handoff Notes + `git status` / `git log --oneline -- <lease paths>`
  (the log is authoritative — it shows which checkpoints actually landed)
- Resume from the checkpoint after the last committed one
- Verify the previous worker has ended before taking its lease. Inspect and
  preserve uncommitted work; validate and resume it where possible. Do not
  discard work merely because it lacks a checkpoint commit.
- Never `git reset --hard` — other sessions' commits live in the same history
- Update STATE.md before stopping (voluntary or forced)

## Stopping Conditions
- All sessions done → Final Report; product completion also requires every
  in-scope required capability verified against current sources
- Blocked → set blocked, skip to next eligible
- Context limit → commit the current checkpoint, update STATE.md, stop clean
- User input needed → only for product-design or destructive work. Otherwise
  record the conservative default, owner-correction, recovery, or final-report
  debt and continue.

## Final Report
Write it to `program/shard-breaker/prompts/room-resolution/FINAL-REPORT.md` — the run folder, beside
MASTER.md and STATE.md — and commit it with an explicit pathspec before returning. Never
`.program/`: that is gitignored scratch and publishes nothing. The committed file is what
ends the run; a final message alone does not.

Summary, sessions done/total, files created/modified, architecture impact,
verification, residual gap, follow-up.

Under Orchestrator, the Orchestration section is appended (concurrency,
wall clock, checkpoints committed by Coder, lease violations, checkpoint
shortfalls, granularity feedback for Planner). See ./ORCHESTRATOR.md.

## Continuation-run notes (2026-09-15)

- This run completes the room-resolution feature. SESSION-01 was completed in the
  prior run (commits `6b55327`, `ad5b08b`; arch M02/M03 fragments consumed at `1fcb139`)
  and is recorded as `done` in STATE.md — do not re-run it.
- SESSION-02 and SESSION-03 were replanned by Planner on 2026-09-15 after the prior
  run was blocked pre-dispatch by a runtime spawn-validator seam. The replanned
  SESSION-02 prompt **supersedes the prior SESSION-02 prompt**: the
  `invalid-empty-route-depth` persistence rule is KEPT (STATE.md CA-06), and no
  session leases persistence paths. A Coder reading both prompts must follow the
  current prompt and its "superseded instruction warning".
- Pre-dispatch environment note: stale prunable worktree registrations exist under
  `.git/worktrees/` (SESSION-01, SESSION-02, planner/root entries). The prior run's
  spawn validator refused dispatch while they persisted. Prune them (or confirm the
  validator no longer consults them) before dispatching SESSION-02.
- Baseline at plan HEAD `86e6ee8`, re-verified by Planner: `npm run typecheck`
  exit 0; `npm run test:unit` 260 passed / 13 files.