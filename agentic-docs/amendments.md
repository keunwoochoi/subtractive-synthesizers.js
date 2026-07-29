# Constitutional amendments

Full record of every change to `PRINCIPLES.md`, newest first. The constitution itself carries only
the current rules and a one-line index — amendment *reasoning* is durable but is not needed in
context on every task, and the constitution has a hard line budget for exactly that reason.

Every amendment states what the old rule got wrong, quotes the owner verbatim where a decision was
theirs, and carries a **Sync Impact Report** naming the artifacts it must propagate to.

### 1.2.0 — 2026-07-28 — Evaluator integrity is constitutional, not a design detail

**What the old rule got wrong.** Version 1.1.0's *"fidelity to specification, not to a recording"*
treated analytic ground truth as if it settled verification. A survey of automated-research systems
(AlphaEvolve, FunSearch, ShinkaEvolve, AI Scientist, OpenEvolve, METR RE-Bench, MLE-bench) found the
opposite: **exactness of the underlying metric never once prevented the evaluator being gamed**,
because the attacks land on the harness rather than the formula. The old wording would have let a
future session treat "the metric is analytic" as a reason to skip harness hardening — which is the
precise error that produced a claimed 100–150× speedup that was really 3× slower.

Adds two engineering principles: **An exact metric is not a safe metric**, and **Taste never becomes
fitness — it becomes the next metric.** Evidence:
`agentic-docs/design/2026-07-28-loop-evidence.md`.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `agentic-docs/design/2026-07-28-verification-and-harness.md` — **required and done**: Loop A
  rewritten with the protected-harness rules and the cascade; Loop B given anchors and a
  three-column record; the analytic-ground-truth section carries the caveat.
- `agentic-docs/design/2026-07-28-loop-evidence.md` — **created** by this amendment.
- `AGENTS.md` § Constitution item 1 — **required**, must not imply automation is safe by itself.
- `scripts/audit/` — not yet affected; the cheat suite lands with the first DSP, not before.

### 1.1.0 — 2026-07-28 — Authority gate lifted: direct-to-main is permitted

**Owner, verbatim:** *"also feel free to make worktrees or not, make PRs or directly merge to main,
it's fine, commit messaages would have important logs and details anyway."* And: *"if you're ready,
go go! go autonomously!"*

**What the old rule got wrong.** The gate was inherited from the sibling project, where it protects
a repo with a live release train, published artifacts, and a public demo. This repo has none of
those yet: the rule came over as a habit rather than a decision, and in bootstrap it buys nothing
while costing a PR round-trip per commit. The owner's reasoning identifies what the gate was
actually protecting — **the durable record, not the branch.** Commit messages carry the full
reasoning by constitutional requirement, so the review artifact survives whichever branch it lands
on.

**New rule.** Direct commits and pushes to `main` are permitted during bootstrap. Worktrees and PRs
are at the agent's discretion. **Every other authority gate is unchanged and remains off** — npm
publish, GitHub release, paid resources, and public posts still require an explicit per-task lift.
This amendment is scoped to branch mechanics only.

**This gate returns** when the first release is tagged, and that reinstatement is a `2.0.0`-level
amendment requiring its own owner decision.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `AGENTS.md` § Authority gates — **required**, the "never" line must change.
- `.githooks/pre-commit` — **required**, must not block commits on `main`.
- `scripts/audit/harness-audit.sh` — **required**, must assert the two documents agree on this gate.
- `agentic-docs/design/2026-07-28-harness-evidence.md` — not affected.

### 1.0.0 — 2026-07-28 — Ratified

Initial constitution. Owner: *"ok. agree with your judgment."*
