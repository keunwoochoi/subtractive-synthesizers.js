# Constitutional amendments

Full record of every change to `PRINCIPLES.md`, newest first. The constitution itself carries only
the current rules and a one-line index — amendment *reasoning* is durable but is not needed in
context on every task, and the constitution has a hard line budget for exactly that reason.

Every amendment states what the old rule got wrong, quotes the owner verbatim where a decision was
theirs, and carries a **Sync Impact Report** naming the artifacts it must propagate to.

### 2.1.0 — 2026-08-03 — The HUMAN-block gate is removed

**Owner, verbatim:** *"That CI with the human block is f——ed up. Remove it. Let's first remove it in another PR and then rebase these two open PRs. So I don't f——ing need the human block at all. F—— that completely."* (Expletives elided; the emphasis is the owner's and is preserved.)

**What the old rule got wrong.** The gate required every PR body to carry a non-empty `## HUMAN:` section, and instructed agents never to write it. Its purpose was to guarantee that a human voice survived in the record of each change. It contradicts the premise of the amendment that shipped alongside it. Amendment 2.0.0 quotes the owner as *"I will not actively working on this repository anymore"* and redesigned CI around a dormant repository — manual dispatch instead of an unattended schedule, precisely because alerts with no response owner are waste. A required check that only the owner can satisfy converts every completed agent change into a manual chore on that same dormant repository, and blocks it indefinitely until the owner returns. The two rules cannot both hold: CI was made change-driven so the repo could sleep, and this gate made every change wait for a person.

The gate also mistook the location of the record. The durable human decision in this project is the constitution and its amendments, where owner reasoning is quoted verbatim and dated. That is where a human voice belongs and where it is actually preserved; a per-PR prose box duplicates it into a second, weaker surface, which "Generate, never duplicate" already rejects.

**New rule.** There is no `HUMAN:` block. PR bodies keep the sections that carry engineering content — what changed, validation bound to an exact SHA, the process trace, and the abandoned-routes row. The required `ci.yml` contexts are `build-and-audit`, `e2e`, and `bundlers`. Owner decisions continue to be recorded here as amendments, quoted verbatim.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `.github/workflows/ci.yml` — **required and done**: the `human-block` job is deleted.
- `.github/pull_request_template.md` — **required and done**: the `## HUMAN:` section and the header instruction to keep it are removed.
- `AGENTS.md` and `CLAUDE.md` § GitHub workflow — **required and done**: the bullet forbidding agents from filling the block is removed.
- GitHub `main` branch protection — **required**: `human-block` is dropped from the required contexts, leaving three. Enforcement for administrators is unchanged.
- `PRINCIPLES.md` amendment index and version header — **required and done**.
- Open PRs #22 and #24 — **required**: both were blocked solely by this check and are rebased onto the amended `main`.

### 2.0.0 — 2026-08-03 — Bootstrap ends: PR CI is required, weekly monitoring is retired

**Owner, verbatim:** *“Why do you make it a weekly job? Why not just make it mandatory for every PR? Especially because I will not actively working on this repository anymore. So a weekly job sounds like a waste.”*

**What the old rule got wrong.** Amendment 1.1.0 correctly removed PR round-trips during active bootstrap and explicitly said the gate would return at release, but the repository settings never performed that return. Separately, the harness design copied a weekly rot cron from a continuously maintained project. Those choices no longer fit a shipped, dormant repository: direct pushes can evade the only useful enforcement point, while unattended monitoring produces alerts with no response owner. The first cron run proved the duplication cost directly—the scheduled workflow lacked the dependencies and Git history already configured correctly in `ci.yml`.

**New rule.** Every change lands through a PR and passes the required `ci.yml` checks. `ci.yml` remains manually dispatchable and is run once when work resumes on a dormant checkout. There is no weekly workflow. The one transition commit that installs this rule lands under the previously lifted bootstrap gate; the server-side rule is enabled immediately after its CI succeeds. This is the major-version gate return anticipated by amendment 1.1.0.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `PRINCIPLES.md` current rule and amendment index — **required and done**.
- `AGENTS.md` authority gate — **required and done**.
- `.githooks/pre-commit` — **required and done**: local audit remains, while the server-side rule owns branch enforcement.
- `.github/workflows/ci.yml` and `.github/workflows/harness-rot.yml` — **required and done**: change-driven/manual CI remains and the scheduled duplicate is deleted.
- `agentic-docs/design/2026-07-28-harness-evidence.md` — **required and done**: the initially adopted weekly mechanic is explicitly superseded.
- GitHub `main` branch protection — **required after the transition commit is green**: require the four `ci` job contexts and enforce them for administrators.
- Issue #21 and journey-log tracker #2 — **required**: exact-SHA CI and server-setting evidence are recorded there.

### 1.5.0 — 2026-08-02 — Packages are self-contained by design: no shared engine

**Owner, verbatim:** *"I've never wanted to do this. My 100% conviction intention is to keep every
package separate. It's okay to have a hard copy, cloned and duplicate code across different packages.
Completely fine."*

**What the old rule got wrong.** The architecture doc's shared-plumbing decision recommended "copy
now, with a committed path to (b) extract later" — it treated cross-package duplication as a
temporary release hedge whose cost the extraction would eventually buy back. That framing implied a
durable intent to converge on a shared engine. The owner rejects convergence outright: duplication
is not a cost to be repaid but the design itself, and no extraction should ever be scheduled.

**New rule.** Each sibling ships its own copy of the instrument-agnostic plumbing. Cross-package
duplication is deliberate and permanent — not drift to be reconciled. No `@instrumentsjs/engine` (or
equivalent) is planned. Provenance in licensing ledgers is still recorded (license hygiene is
absolute); its "clean diff for a later extraction" purpose is moot.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `PRINCIPLES.md` engineering-principles section and amendment index — **required and done**.
- `agentic-docs/design/` — **required**: a dated decision doc records this outcome for tracker issue
  #20, referencing the sibling's tracking issue `keunwoochoi/physical-instruments.js#103`.
- `agentic-docs/licensing.md` port ledger — **required**: provenance + source SHA of the copied
  plumbing recorded; notes that the clean-diff purpose is moot.
- `agentic-docs/design/2026-07-28-architecture.md` — **recommended**: the shared-plumbing
  recommendation's "path to (b)" is superseded by this amendment; the doc is not edited, the
  decision doc supersedes it.
- `_knowledge-base/08-owner-taste.md` — **required and done**: family-wide owner-taste record.
- Journey log (tracker #2) — record this decision.

### 1.4.0 — 2026-08-01 — Factual instrument history is not product branding

**Owner, verbatim:** *“Add multiple synthesizer names of the same kind, not only Moog, but just in general. Like there should be quite a lot of them. Just pick the popular ones.”* And: *“If there's a very like seminal one in the music history ... some sort of historical snippet like that, information like that, like a fun fact.”*

**What the old rule got wrong.** The blanket ban treated a protected mark used to name a preset or imply emulation as equivalent to a factual, sourced historical reference. Those are not the same use. The former can confuse product origin; the latter tells readers where subtractive synthesis sits in musical history, which the owner explicitly requested for both technical and musical audiences.

**New rule.** Protected names remain prohibited in presets, public API, demo labels, product claims, and copy that implies emulation, compatibility, endorsement, or origin. The README's clearly identified historical/educational section may use factual nominative references to identify instruments and sourced recording facts. Those references may not name this product, a preset, or a feature, and the library remains explicitly not an emulation of any specific hardware.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `PRINCIPLES.md` license-hygiene rule and amendment index — **required and done**.
- `agentic-docs/licensing.md` trademark policy — **required and done**.
- `scripts/audit/harness_audit.py` — **required and done**: continue rejecting marks across product surfaces while allowing only the named README history section.
- `scripts/audit/fixtures/good/README.md` and the existing trademark-leak fixture — **required and done**: prove factual history passes while a protected name in package source still fails.
- `README.md` short build log — **required and done**: keep names inside the historical section and link the recording facts to sources.

### 1.3.0 — 2026-07-28 — Publishing identity is constitutional

**Owner, verbatim:** *"you made a terrible mistake. always use `<owner>` github account. always
always."* And: *"i deleted the current issue you put using `<other account>`. `<other account>` is
my stealthy company account and this should never be exposed in this repo."*
(Account names redacted here deliberately — see the propagation note below.)

**What happened.** The journey-log issue and both of its comments were created through `gh` while a
different account was globally active. The owner had to delete published content. Git history and
push events were never affected: commits carry the owner's personal name and email, and pushes are
authenticated by an SSH key registered to the owning account, so all five push events are correctly
attributed. **That is exactly what made this dangerous** — every in-repo signal looked right.

**What the old rules got wrong.** Nothing in the constitution addressed publishing identity at all.
Worse, the hazard had been *observed and reported* earlier in the same session — the agent noted the
two-account split when a `gh repo edit` call returned 404, switched accounts for that one command,
switched back, and then continued creating issues under the wrong account. Noticing a hazard and
filing it as an observation is not the same as fixing it, and the harness had no mechanism to turn
the observation into a gate.

**Root cause.** `gh` keeps a single global active account shared across every repository on the
machine, while `git push` authenticates separately. The two can disagree silently and indefinitely,
and no in-repo artifact reflects the disagreement.

**Why this is a distinct severity class.** Every other harness failure so far was recoverable by
editing a file. This one published content under an identity that must not be associated with this
repository, and only the owner could undo it. The identity check therefore runs **first** in
`harness-audit.sh`, before the checks that prove the audit can fail.

**Why the expected account is derived and never hardcoded.** The account that must not be used is
confidential, and this repository is public. Writing it into a committed file — even inside a
"never use this" rule — would publish precisely what the rule protects. `check-identity.sh` derives
the expected login from the `origin` remote's owner and names no other account. This is also more
robust: it cannot go stale, and it works for any owner.

**Verification performed after the fact.** With the correct account active: 0 issues, 0 issue
comments, 0 occurrences of the other account across the repository event feed, sole collaborator is
the owner, no subscribers. All 5 events (1 create, 4 push) attributed to the owning account.

**The setting is contended, not merely wrong — discovered while fixing it.** The check blocked the
very commit that introduced it, and then blocked the recreation of the deleted issue: the active
account had reverted to the other one *twice*, minutes apart. No environment override explains it
(`GH_TOKEN`, `GITHUB_TOKEN`, `GH_CONFIG_DIR` all unset; no `gh auth` line in any shell profile,
launch agent, or crontab). `~/.config/gh/hosts.yml` was being rewritten at the start of nearly every
shell. **12 agent processes were running on the machine at the time**, and the most probable cause is
a concurrent session working in an unrelated repository switching the machine-global account.

This changes the fix. A one-time switch cannot work against a contended global setting, so
`scripts/gh-owner.sh` switches and acts **inside a single process** and refuses to run if it cannot
acquire the owning identity. The race window shrinks from "until someone notices" to milliseconds.
It is not zero, and that is stated rather than hidden.

**Sync Impact Report** — artifacts this amendment must propagate to:
- `scripts/gh-owner.sh` — **created**; mandatory for every `gh` invocation.
- `scripts/audit/check-identity.sh` — **created**, and run first by `harness-audit.sh`.
- `scripts/audit/test_harness_audit.py` — **required and done**: three tests prove the check rejects
  a mismatch and names the fix, matching the fail-correctly discipline of the file fixtures.
- `AGENTS.md` § GitHub workflow and § enforced rules — **required and done**.
- `PRINCIPLES.md` engineering principles — **required and done**.
- Journey log — the deleted entries must be reposted under the owning account.

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
