# subtractive-synthesizers.js — Agent Router

> `PRINCIPLES.md` is the constitution and governs. This file routes and states operating rules.
> **Everything here is non-inferable by design.** Anything you could learn by reading the code has
> been deliberately removed — see `agentic-docs/design/2026-07-28-harness-evidence.md` for why.

## Constitution (the five that change behavior)

### 1. Verify against the specification — but never trust the harness
Alias energy, filter response vs the analog prototype, tuning, stability, headroom and determinism
all have closed-form ground truth, so CI can block on numbers the sibling project could only review
by ear. **An exact metric is not a safe metric:** the DSP returns a buffer and the harness computes
every number, the harness is not editable by what it grades, gates use the **worst case** over the
sweep rather than the average, and the cheats are written first and proven to lose.

### 2. Taste is the product, and it is never automated
No change to how a patch sounds ships on measurements alone. Blind, order-randomized comparison
decides, one named axis at a time. **The verbal reason is the recorded output** — the parameter is
recoverable from the diff, the reason is not.

### 3. Write the target before you tune it
Every patch has an intent statement — prose plus measurable targets derived from that prose —
committed before any parameter is touched. Amend openly; never drift silently.

### 4. The audio thread is sacred
No allocation, no locks, no JS, no denormals on the sample path. Measured on the reference
arrangement, never a solo patch. The reference arrangement and its budget are defined in the
verification design doc; the bundle ceiling is owned by `scripts/audit/bundle-size-audit.sh`.

### 5. Truth has owners, not echoes
Never copy a fact into a second surface — link to it. Numbers live in the script that measures them.

## Authority gates

Off by default. A human lifts one per task, explicitly.

- npm publish / GitHub release: **off**
- paid or quota-consuming external resources: **off**
- public posts, docs deploys: **off**
- force-push, `--no-verify`: **never**
- push / merge to `main`: **LIFTED for bootstrap** — owner, 2026-07-28. Worktrees and PRs are at the
  agent's discretion; the durable record lives in commit messages either way. See `PRINCIPLES.md`
  amendment 1.1.0. Reinstated at first release tag.

## Commit messages own the engineering record

The diff shows *what* changed. It can never show what was wrong, how we knew, what we tried that
failed, or what caught the error — and that is unrecoverable once the session ends. **Write every
commit as if the report is drafted from `git log` alone, because it will be.**

### Required sections, validated by `.githooks/commit-msg`

1. **The defect, and how it was actually found** — by ear, by a gate, by a review, by the owner.
   Quote the owner verbatim when that is what happened.
2. **Before/after with units and a comparator.** A number with no comparator is not evidence.
3. **The root cause, named.** Not the symptom.
4. **What was tried and abandoned** — especially fixes that made things worse, diagnoses that were
   wrong, and measurements that were themselves broken. These exist nowhere else.
5. **The cost.** CPU, memory, bundle.

### Additional, for any commit that changes how a patch sounds
Which listening decided it, and the verbal reason. Numbers alone do not finish a patch commit.

### Numbers in commit messages are point-in-time
Suffix every measurement with the SHA it was taken at. The write-up must never re-read an old commit
message as current.

## How decisions are made and found again

One rule per kind, so nothing lands where nobody looks.

| Kind | Lives in | Form |
|---|---|---|
| Owner judgment, taste, direction | `PRINCIPLES.md` amendment | Verbatim quote + date + what the old rule got wrong |
| Technical, > 1 PR | dated design doc | See `agentic-docs/design/TEMPLATE.md` |
| Technical, 1 PR | the issue, then the PR | Process trace incl. abandoned routes |
| A patch's target sound | its intent statement | Written **before** tuning |
| Why a patch sounds as it does | the commit body | Verbal reason + rejected variant |
| Work state, status, completion | issues and PRs | **Never** a local TODO or status file |

### Unknowns are marked, never assumed
Write `[NEEDS CLARIFICATION: question]` inline rather than picking a plausible default silently. The
harness audit counts them; they may not survive into an accepted design doc.

## GitHub workflow

### Identity before anything else
**Never call `gh` directly. Use `scripts/gh-owner.sh` for every GitHub command.**

`gh`'s active account is a single machine-global setting, contended by any other process on the
machine — a concurrent agent session in another repo will change it, with no signal here. Observed:
it reverted twice within minutes. Pushes authenticate separately, so `git log` stays correct while
issues and comments get posted by the wrong person. **Switching accounts once does not hold.** The
wrapper switches and acts in one process, and refuses to run if it cannot acquire the owning
identity.

- Search existing issues and PRs before creating a work item.
- Every implementation PR adopts an issue. Title `type(scope): imperative summary`.
- Open PRs as **drafts**. Body links `Closes #N`, states impact and validation, names review focus.
- **Evidence is bound to an exact SHA and a clean tree.** Evidence produced on a dirty working tree
  is not evidence. After any head change, rerun it or label it historical.
- The **abandoned/wasted routes** row is the primary record of what did not work.
- **A PR that changes how a patch sounds carries its blind-comparison result and the verbal reason**,
  not only metrics.
- The PR body's `HUMAN:` block is written by the owner and **must not be edited by an agent**. CI
  fails if it is missing. If it needs updating, stop and ask.
- Append to the journey log at the end of any substantial session — one comment, never an edit.
  Owner quotes marked as such: the agent operates the owner's account, so authorship is not evidence
  of voice.

## Rules that are enforced, not remembered

Prose in this file is **context, not configuration** — under pressure it gets ignored. Anything that
must always happen is a hook, a generated artifact, or a failing test. These are theirs:

| Rule | Enforced by |
|---|---|
| Every referenced path, script, and cross-link exists | `scripts/audit/harness-audit.sh` |
| Every directory named in prose is non-empty | same |
| No number is hand-typed into a doc | generated between markers; `npm run docs:check` diffs |
| Instrument/patch ids have exactly one definition | guard test greps for the literal elsewhere |
| Always-on context stays inside budget | line/char assertion in the audit |
| Commit messages carry all five sections | `.githooks/commit-msg` |
| GitHub actions come from the owning account | `scripts/gh-owner.sh` (use always); `scripts/audit/check-identity.sh` runs first in the audit |
| Evidence matches head SHA and a clean tree | required PR check |
| **The audit itself fails when it should** | `scripts/audit/fixtures/` — deliberately broken inputs the audit must reject |

That last row is the one the sibling project never had. **An audit never observed to fail is not
evidence of anything.**

## Routes

| Task | Load |
|---|---|
| First action in any session | `PRINCIPLES.md` |
| "Is this right?", evals, gates | `agentic-docs/design/2026-07-28-verification-and-harness.md` |
| Architecture, roster, phasing | `agentic-docs/design/2026-07-28-architecture.md` |
| Why the harness is shaped this way | `agentic-docs/design/2026-07-28-harness-evidence.md` |
| Tuning or creating a patch | that patch's intent statement, then Loop B in the verification doc |
| Porting, or naming anything publicly | `agentic-docs/licensing.md` (trademark rules are strict) |
| A feature bigger than one PR | `agentic-docs/design/TEMPLATE.md` |
| Ending a session | the journey log tracker issue |

> **No repo map here, deliberately.** Directory layouts are the highest-drift and lowest-value
> content an instruction file can carry, and this one would rot within a week. Read the tree.
