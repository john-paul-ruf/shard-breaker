# Cleanup Ledger — Shard Breaker

Archivist-owned: candidate findings with evidence, confidence, blast radius, and a proposed
check. Nothing here is deleted or edited by Archivist; cleanup work belongs to a planned
Planner program and a Coder lease. Statuses: `tracking` (evidence exists, below threshold) →
`briefed` (threshold crossed, Planner brief emitted) → `accepted` (Planner program approved) →
`retired` (evidence false, obsolete, or intentionally retained).

Findings below carry forward from the room-resolution final pass (2026-09-22, recorded in
ARCHIVIST-LOG.md before this ledger existed) and this pass (combat-engine final,
2026-09-24, HEAD `97553fd`).

## Candidates

| # | Candidate | Evidence | Confidence | Blast radius | Proposed check | Status |
|---|-----------|----------|------------|--------------|----------------|--------|
| 1 | Deep-file public-API ghosts (planned-vs-implemented APIs never reconciled) | grep 0 hits in `src/**`/`tests/**` at `97553fd`: deep M05 `validateRunCommand`/`calculateShards`/`calculateRecordUpdate`/`rewards.ts`/`threat.ts`/`progression.ts` (Genesis-contract ghosts); deep M07 `transfer.ts`/`exportProfile`/`importProfileAtomically`/`resetProfileAtomically`/`finalizeRunAtomically`/`abandonRunAtomically`/`loadProfile`; deep M04 `advanceCombat`/`CombatEvent`; deep M09 `SkillRail`/`TransferPanel`; deep M08 `RunSummaryScreen`/`ProfileScreen` (screens unimplemented by design — next feature's entry points). Not code debt; docs-only. | medium | docs-only | Reconcile each deep file's Public API against grep at the next arch reconciliation, marking planned-vs-implemented per entry | tracking |
| 2 | Deep-file M11/M12 describe unregistered modules | Deep-file M11 (migrations) = registry M05, M12 (toolchain) = registry M08; no registry row cites them; Change History ends 2026-08-29 | medium | docs-only | Fold their content into registry-row-linked deep files at the next arch reconciliation (docs-only) | tracking |
| 3 | `catalog.hasContent` production consumers | grep at `97553fd`: only `src/domain/content/catalog.ts` (definition) + test files; no production consumer. False-positive risk recorded: designated existence check for future consumers (transfer/reset profile surfaces). | low | one facade method | Re-grep at next feature planning; retire if still consumerless and the planned consumer is dropped | tracking |
| 4 | `generateThreatProfile`/`THREAT_LIMITS`/`SHOP_PRICE_CAP` unused outside M02 | Consumed only inside `generators.ts` + tests. Designed producer/consumer split (combat consumes the composed candidate via CA-03). | low | one module | Retire as intentionally-retained unless the split changes | retired (intentionally retained) |
| 5 | `.DS_Store` tracked at repo root | Was tracked at the 2026-09-22 pass. **Evidence false at `97553fd`:** not in `git ls-files`; `.gitignore:1` lists it. | high | repo hygiene | `git ls-files .DS_Store` empty | retired |
| 6 | Stale top-level `program/shard-breaker/STATE.md` beside the canonical feature STATE.md | Was untracked-suspect at the 2026-09-22 pass. **Evidence false at `97553fd`:** `git ls-files STATE.md` empty; no such file exists. | high | repo hygiene | none | retired |
| 7 | Canvas glyph threading gap — `glyphFor` accepted by `createRenderSnapshot` but never threaded by any caller | grep at `97553fd`: `glyphFor` appears only in `src/game/renderer.ts` (definition + doc fallback) and dist bundle; no production or test caller threads it. Canvas enemies draw with health ticks only; enemy identity reaches the canvas only via DOM status/telegraph. Recorded debt: S04 surprise 2, Final Report, STATE.md. Not dead code — it is a real, designed-but-unwired option. | medium | one optional renderer parameter + catalog display fidelity | `grep -rn glyphFor src --include=*.ts --include=*.tsx` returns hits outside renderer.ts when the bridge/screen owner threads it; retire otherwise | tracking (assigned debt: bridge/screen owner + post-B-3 journey session) |
| 8 | Durable carrier swap points never consumed by production input — `ROLLED_PARAMS_CARRIER_LANDING = []` and `WALL_HITS_CARRIER_LANDING = 0` | grep at `97553fd`: each constant appears exactly once in `src/domain/run/reducer.ts` (definition + single use); no other production/test reader. Enhancement rolled params and Fractal Core's `wallHitCurrencyRate` contribute zero to the simulation/grant by design until a durable carrier lands. Recorded debt: room-resolution decision 10, S02 surprise 7, S07 notes (a)/(c), arch M04/M05 fragments, STATE.md. | high (evidence); not dead code — deliberate deferrals with named swap points | two module-private constants + the capability paths they gate | Retire when a durable carrier lands and the constants receive real producers; otherwise carry as recorded debt until the feature owning them plans the carrier | tracking (assigned debt) |

## Campaign assessment (this pass)

- No campaign crossed a briefing threshold: no three related high-confidence findings; the
  findings that are medium-confidence (1, 2, 7) are heterogeneous (four different target
  areas, docs-only for 1–2). Finding 8 is high-confidence *evidence* but is deliberately
  retained debt with a named owner seam, not a destructive cleanup — no brief.
- The B-3 follow-up (journey re-spec session) and the next feature (run summary screen +
  Shards economy + relic choice — which retires the deep-M08 `RunSummaryScreen`/`ProfileScreen`
  ghosts and may consume `hasContent`) are the natural re-check points for candidates 1, 3,
  and 7.
