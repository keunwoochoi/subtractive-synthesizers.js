# subtractive-synthesizers.js — Agent Constitution & Router

> Read `PRINCIPLES.md` first. It is the constitutional law of this repo.
> This file owns: the operating constitution, how decisions are made and recorded, and routing.
> Details live in owned docs (see Routes). Never copy a fact here — link to its owner.

## Constitution

1. **Truth has owners, not echoes.** Code owns behavior; `scripts/audit/` owns enforceable checks;
   `agentic-docs/` owns durable policy and decisions; GitHub issues and pull requests own work state
   and evidence; `PRINCIPLES.md` owns the constitution; this file owns operating rules and routing.
   When a fact changes, update its owner first. Never copy a fact into a second surface — link to it.

2. **Verify against the specification, not against a recording.** Everything with a closed form —
   alias energy, filter response versus the analog prototype, cutoff tracking, self-oscillation
   threshold and purity, tuning, stability, headroom, determinism — is checked automatically on every
   commit against its analytic ground truth. This is the structural difference from
   `physical-instruments.js`, and it is why our CI can block on numbers that project could only
   review by ear. See `agentic-docs/design/2026-07-28-verification-and-harness.md`.

3. **Taste is the product, and it is never automated.** No change to how a patch sounds ships on
   measurements alone. Blind, order-randomized comparison decides, one named axis at a time, and the
   **verbal reason** is what gets recorded — the parameter value is recoverable from the diff, the
   reason is not. Rejected variants are recorded too.

4. **Write the target before you tune it.** Every patch has an intent statement — prose plus three
   to five measurable targets derived from that prose — committed before any parameter is touched.
   Amend it in the open with a reason; never drift silently.

5. **The audio thread is sacred.** No allocation, no locks, no JS, no denormals on the sample path.
   Every DSP change is measured against the 2.67 ms / 128-frame budget on the reference arrangement,
   never on a solo patch.

6. **License hygiene is absolute.** Port MIT/BSD freely with ledger entries; NEVER open GPL/LGPL/AGPL
   source — papers-only reimplementation. **Trademarks are the live risk in this domain:** the names
   of famous synthesizers may not appear in presets, code, or marketing. Describe the sound, never
   the machine. See `agentic-docs/licensing.md`.

## Authority gates (off by default — a human lifts one per task, explicitly)

- npm publish / GitHub release: **off**
- git push to `main`, force-push, `--no-verify`, self-merge: **never**
- paid or quota-consuming external resources: **off**
- public posts (Show HN, social, docs deploys): **off**

## Commit messages own the engineering record

**This is not style guidance. It is the primary research output of this project.**

The diff shows *what* changed. It can never show what was wrong, how we knew, what we measured, what
we tried that failed, or what caught the error — and that is the part that is unrecoverable once the
session ends. A commit message is the only artifact that carries that reasoning **permanently
attached to the code it explains**. Issues get closed, PRs get squashed out of memory, chat
transcripts vanish. `git log` does not.

This work will be written up. **Write every commit as if the report is being drafted from `git log`
alone, because it will be.**

Every non-trivial commit body records, in prose:

1. **The defect, and how it was actually found.** By ear? By a Tier-1 gate? By a persona review? By
   the owner? Say so, and quote the owner verbatim when that is what happened.
2. **The measurement, before and after, with units and a comparator.** A number with no comparator is
   not evidence.
3. **The root cause, named.** Not the symptom. Why the code did the wrong thing.
4. **What was tried and abandoned, and why.** Including — *especially* including — fixes that made
   things **worse**, diagnoses that turned out to be **wrong**, and measurements that were themselves
   **broken**. These are the most valuable lines in the repository and they exist nowhere else.
5. **The cost.** CPU, memory, bundle. A quality claim without a cost is half a claim.

**For any commit that changes how a patch sounds, add:** which listening decided it, and the verbal
reason. A patch commit whose body contains only numbers is not finished — see `PRINCIPLES.md`,
*a metric delta is not a sound*.

## How decisions are made and found again

One rule per kind, so nothing lands where nobody looks.

| Kind of decision | Lives in | Form |
|---|---|---|
| Owner judgment, taste, product direction | `PRINCIPLES.md`, dated amendment | Verbatim quote + date + what was wrong with the rule it replaces |
| Technical, larger than one PR | dated design doc in `agentic-docs/design/` | Motivation, thesis, evidence base, design in layers, phased gates, deferred list |
| Technical, one PR | the issue, then the PR body | Process trace incl. abandoned routes |
| A patch's target sound | its intent statement | Written **before** tuning; amended openly |
| Why a patch sounds as it does | the commit body | The verbal reason from the blind comparison, plus the rejected variant |
| Work state, status, completion | GitHub issues and PRs | **Never** a local TODO, backlog, plan-status, or decision-log file |

## GitHub workflow

- Search existing issues and pull requests before creating a new work item.
- Every implementation PR starts from or adopts an issue. Title `type(scope): imperative summary`.
  The issue owns motivation, evidence, desired outcome, scope, acceptance criteria.
- The issue is the live control plane: assignment records ownership, comments record material
  decisions and blockers, checkboxes record acceptance.
- Open implementation PRs as **drafts**. The body links the issue with `Closes #N`, states impact and
  validation, names review focus, and routes every separable follow-up to an issue.
- **Evidence is immutable-input-bound:** every current claim names the exact head SHA it validates.
  After any head change, rerun the evidence or label it historical before requesting review.
- Keep filling the PR body's **Agentic process trace**. The **abandoned/wasted routes** row is not a
  formality — it is the primary record of what did not work, and it is unrecoverable from the diff.
- **A PR that changes how a patch sounds must carry its blind-comparison result and the verbal
  reason**, not only its metrics. Green Tier-1 numbers with no Tier-3 evidence is not reviewable.
- **Append to the journey log at the end of any substantial session.** One comment, never an edit to
  the issue body, never a local journal file. Record what was abandoned, what caught the error,
  verbatim owner quotes (marked as such — the agent operates the owner's account, so authorship is
  not evidence of voice), decisive numbers, and any harness rule added because of a failure.

## Anti-entropy rules (each exists because of an observed failure in `physical-instruments.js`)

These are enforced by `scripts/audit/harness-audit.sh`, not by memory.

> **Status, stated honestly because rule 2 applies to this file too:** that script does not exist
> yet — it is M0 item 4, and `scripts/audit/bundle-size-audit.sh` is M0 item 5. Until they land,
> these five rules are enforced by review, which is exactly the weak enforcement they exist to
> replace. This note is removed by the commit that adds the scripts.

1. **Every number in a document names the script that owns it.** Unmarked numbers fail the audit.
   *(That repo's README claimed 13 instruments and ~31 KB when the measured reality was 29 and
   85.4 KB.)*
2. **Structural claims about the repo are checked against the tree.** *(Its repo map claimed
   `packages/midi` owned a scheduler and Web MIDI; the scheduler is elsewhere and Web MIDI does not
   exist anywhere in that repo.)*
3. **Generate, never hand-duplicate.** *(Its instrument id is hand-maintained in nine places, one of
   them type-enforced.)*
4. **A directory that exists is populated.** Intent goes in an issue, never in an empty folder.
   *(Its `evals/corpus/` and `evals/incumbents/` are empty `.gitkeep` dirs the README describes as
   holding a fixed corpus and committed renders.)*
5. **The report is scaffolded from day one and every number in it is generated.** *(Its report was
   started at the end, is untracked, reaches Act I only, and its headline number was already stale.)*

## Routes

| Task | Always load | Load if triggered |
|---|---|---|
| Anything at all, first time in a session | `PRINCIPLES.md` | — |
| Verification, evals, "is this right?" | `agentic-docs/design/2026-07-28-verification-and-harness.md` | — |
| Architecture, roster, phasing | `agentic-docs/design/2026-07-28-architecture.md` | — |
| Implementing DSP | the architecture doc | `agentic-docs/licensing.md` when porting |
| Tuning or creating a patch | the patch's intent statement | the verification doc, Loop B |
| Porting third-party code | `agentic-docs/licensing.md` | — |
| New feature > 1 PR | `agentic-docs/design/TEMPLATE.md` | — |
| Ending a session | the journey log tracker issue | — |

## Repo map

**This table is checked against the tree by `harness-audit`. It lists only what exists.**

| Path | Owns |
|---|---|
| `PRINCIPLES.md` | The constitution |
| `AGENTS.md` (= `CLAUDE.md`) | Operating rules, decision routing, repo map |
| `agentic-docs/design/` | Dated design docs + `TEMPLATE.md` |
| `agentic-docs/licensing.md` | Porting policy, trademark policy, surveyed-and-rejected list, port ledger |

Everything else in the M0 checklist — `scripts/audit/`, `skills/`, `.github/`, `crates/`,
`packages/`, `evals/`, the report scaffold — **does not exist yet, and is therefore not listed
here.** It is tracked in issues. See anti-entropy rule 4.
