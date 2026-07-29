# Harness evidence: what the public record says about agent scaffolding

Date: 2026-07-28
Status: **draft — owner review required.** Owner direction: *"Do search for automatic harness and
auto research kind of thing in general. I think there must be some lessons we can take from those
existing public repositories and harnesses."*

Owns: the external evidence base for how this repo's harness is shaped, and the record of which
inherited practices it **changed or challenged**. `AGENTS.md` and `PRINCIPLES.md` are the artifacts;
this doc is why they look the way they do.

## Why this exists

The harness for `physical-instruments.js` was designed from first principles and worked. But it was
never checked against the public record, and this is the second time we are doing this — so an
unexamined practice carried into a second project stops being a decision and becomes a habit. The
survey below found **four inherited practices that the evidence does not support**, and they are
named in "What this changed" rather than quietly kept.

## Evidence base

Primary sources, with the finding that matters. Adoption claims are flagged where unverified.

### Instruction files: more is not better, and structure beats volume

- **ETH Zurich**, 138-task AGENTbench + 300 SWE-bench Lite tasks, 4 agents
  ([summary](https://www.infoq.com/news/2026/03/agents-context-file-value-review/)):
  **LLM-generated context files reduced success ~3 % and raised cost > 20 %.** Human-written files
  improved success ~4 % at up to +19 % cost. **Architectural overviews and repo-structure
  explanations gave minimal benefit.** Recommendation: restrict instructions to *non-inferable*
  details — specific tooling, custom build commands.
- ***Agent READMEs*** ([arXiv 2511.12884](https://arxiv.org/abs/2511.12884)), 2,303 context files
  across 1,925 repos: build/run commands 62.3 %, implementation details 69.9 %, architecture 67.7 %,
  but security 14.5 % and performance 14.5 %. These files "evolve like configuration code."
- ***Toward Instructions-as-Code*** ([arXiv 2606.13449](https://arxiv.org/html/2606.13449)), 15,549
  agentic PRs across 148 projects: projects whose merge rate improved ≥ 20 % had instruction files
  with median **976 words and 3.5 / 7.5 / 9 H1/H2/H3 headers**, versus 569 words and 1 / 5 / 1 for
  declining projects. **Deep structure correlates with success; prose volume does not.**
- **Claude Code docs** ([memory](https://code.claude.com/docs/en/memory),
  [best practices](https://code.claude.com/docs/en/best-practices)) are unusually blunt:
  instruction files are *"context, not enforced configuration"*; *"there's no guarantee of strict
  compliance"*; target **under 200 lines**; explicitly exclude *"anything Claude can figure out by
  reading code"* and *"file-by-file descriptions of the codebase."* Named failure pattern: the
  over-specified instruction file — *"if your CLAUDE.md is too long, Claude ignores half of it."*
- Convergent budgets elsewhere: Aider `CONVENTIONS.md` 150–200 lines; Windsurf **6 k chars per rule,
  12 k total**; Codex `project_doc_max_bytes` **32 KiB**. Aider's
  [repo map](https://aider.chat/docs/repomap.html) is **computed from the AST**, never hand-written.

**Reconciliation, and the rule we adopt:** structure deeply, but only over content the agent cannot
derive by reading the repo.

### Enforcement: prose decays, hooks do not

- Anthropic's own line: to block an action regardless of what the model decides, use a hook —
  settings are *"enforced by the client regardless of what Claude decides."*
- **[agents-lint](https://github.com/giacomo/agents-lint)** — its rule set is worth copying wholesale:
  every referenced path exists on disk, every `npm run <script>` exists in `package.json`,
  dependencies present and not deprecated, files within length budget, `TODO`/`FIXME` resolved,
  multiple context files agree on package manager and build/test commands, memory index links
  resolve. Ships a **weekly cron** action commented *"catch silent rot"*, plus `--max-warnings N`.
- **[OpenHands' own AGENTS.md](https://github.com/OpenHands/OpenHands/blob/main/AGENTS.md)** is the
  best public example of *enforced* rules: a rule against direct API calls is a **failing test**
  (`no-direct-agent-server-calls.test.ts`), not a sentence; and the PR description carries a
  **`HUMAN:` section agents are forbidden to edit, with CI failing when it is missing.**
- **[SWE-agent](https://arxiv.org/abs/2405.15793)** (NeurIPS 2024): **52.0 %** of unresolved
  trajectories fail from incorrect or overly specific implementations, **23.4 %** from cascading
  failed edits. Linting guardrails are what let agents *recover* from bad edits; verbose
  human-oriented error text overloads them — keep tool errors compact.

### Provenance: how eval harnesses make a number re-checkable

- **[inspect_ai](https://inspect.aisi.org.uk/eval-logs.html)** (UK AISI): every log carries
  `EvalRevision{type, origin, commit, **dirty**}` plus package versions and resolved config. **The
  `dirty` flag is the detail worth stealing** — it distinguishes "measured at this commit" from
  "measured on an uncommitted tree."
- **[lm-evaluation-harness](https://lm-evaluation-harness.readthedocs.io/)**: every task carries an
  integer `VERSION`, incremented on any breaking change, and results are reported as `taskname-v0`,
  *"so we can know exactly which metrics were computed using the old buggy implementation."*
- **[METR Task Standard](https://github.com/METR/task-standard/blob/main/STANDARD.md)** and its
  [QA guide](https://taskdev.metr.org/quality-assurance/): timing-log entries must **include the ID
  of the most recent commit**; and for a task to be accepted you must submit an **invalid, a
  partially-correct, and a best solution and confirm each scores as expected.** The harness must be
  shown to **fail** correctly, not merely to pass.

### Constitutions and spec-driven development: adopt the mechanics, refuse the escalation

- **[spec-kit](https://github.com/github/spec-kit)**: its
  [constitution template](https://github.com/github/spec-kit/blob/main/templates/constitution-template.md)
  carries **MAJOR.MINOR.PATCH + ratification date + last-amended date**, a Governance block asserting
  supersession, and a **Sync Impact Report listing the dependent artifacts an amendment must
  propagate to**. Its `/speckit.analyze` is a read-only cross-artifact consistency pass where a
  constitution conflict is CRITICAL and must be fixed by changing the artifact — *"not dilution,
  reinterpretation, or silent ignoring of the principle."* `[NEEDS CLARIFICATION]` markers are
  mandatory wherever a requirement is uncertain.
- **[Kiro](https://kiro.dev/docs/steering/)**: `#[[file:<path>]]` **transclusion** — steering embeds
  the live file rather than restating it, so the doc cannot drift from the artifact. This is
  "truth has owners, not echoes" with tooling behind it.
- **Criticism, and it is well-evidenced.**
  [Scott Logic](https://blog.scottlogic.com/2025/11/26/putting-spec-kit-through-its-paces-radical-idea-or-reinvented-waterfall.html)
  measured **2,577 lines of markdown and 33.5 min agent + 3.5 hr review** for one CRUD feature,
  against 8 min + 15 min working incrementally — much of it *"duplicative, and faux context."*
  [Böckeler/Fowler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) notes that
  in practice these tools are **spec-*first*** (specs get deleted after the feature ships) and warns
  spec-as-source risks *"the downsides of both MDD and LLMs: inflexibility and non-determinism."*

### Prior art for commit-messages-as-record

- **[cloudflare/workers-oauth-provider](https://github.com/cloudflare/workers-oauth-provider)**
  preserved every prompt in its commit messages — the closest public precedent to our plan.
  [Max Mitchell's read-through](https://maxemitchell.com/writings/i-read-all-of-cloudflares-claude-generated-commits/)
  reports it stays legible at ~40 commits, that example-driven prompts beat abstract specs, and that
  humans took over around commit 20 for structural work.
- **[MADR](https://adr.github.io/madr/)** gives the standard shape for the abandoned-routes record:
  Considered Options with pros/cons of the discarded ones, then Decision Outcome with justification.

### Doc/code sync that demonstrably works

All from the Rust ecosystem, all the same idea: [cargo-rdme](https://github.com/orium/cargo-rdme)
and [cargo-sync-rdme](https://github.com/gifnksm/cargo-sync-rdme) regenerate README sections between
marker comments; **[readme-sync](https://github.com/zheland/readme-sync) is an integration test that
fails when README and docs diverge.** The diff *is* the test failure.

## What this changed

Four inherited practices did not survive contact with the evidence, and one gap was closed.

### 1. The repo map is deleted, not maintained

`AGENTS.md` in the sibling project carries a hand-written path→ownership table. Two independent
sources say this is the worst content an instruction file can hold: the ETH study found
repo-structure explanations give **minimal benefit at > 20 % added cost**, and Claude Code's docs
list directory layouts among the things to *cut*. That table had also already drifted in the sibling
— it claimed `packages/midi` owned a scheduler and Web MIDI, when the scheduler lives elsewhere and
Web MIDI does not exist anywhere in that repo.

**Decision: no repo map.** If one is ever wanted, it is generated from the tree, never typed.

### 2. Always-on context is budgeted, and the budget is a failing check

First draft measured **288 lines / 18,242 chars** across `AGENTS.md` + `PRINCIPLES.md` — over the
~200-line guidance and well over Windsurf's 12 k total. Worse, header structure was **1/8/0 and
1/5/0 H1/H2/H3 — zero H3s**, which is the *declining-project* profile in the 15,549-PR study
(winners: 3.5/7.5/9). We had volume without granularity, which is precisely the shape the evidence
says fails.

**Decision:** rewrite with deep H3 structure and non-inferable content only; assert the budget in the
harness audit so it fails rather than drifts.

### 3. Rules became enforcement, or they were deleted

Anthropic's own documentation says instruction files are *"context, not enforced configuration."*
Every "always/never" sentence in the harness was therefore audited and converted into a hook, a
generated artifact, or a failing test — or dropped. The `AGENTS.md` table "Rules that are enforced,
not remembered" is the result, and each row names its enforcer.

### 4. The persona panel is now instrumented, and is on probation

The sibling project runs a seven-persona review panel. It was inherited here without evidence. The
ETH result — human-written context helping only ~4 % while costing up to 19 %, and LLM-generated
context being **net negative** — plus the absence of any measurement of what the panel has ever
caught, makes this the most likely piece of cargo cult in the inherited harness.

**Decision: keep it, scoped to public-API and packaging changes as before, but instrument it.** Log
wall-clock, tokens, and defects-caught **per persona** for the first ten PRs that run it. Personas
that never find anything are deleted. This is an owner-visible decision because it retires something
that felt valuable; the point is that "felt valuable" is exactly what the measurement is for.

### 5. Gap closed: the harness must be shown to fail

None of the five failures carried forward from the sibling was about **the harness failing open**.
METR requires proving a task scores an invalid, a partial, and a correct solution differently before
it is accepted.

**Decision:** `scripts/audit/fixtures/` holds deliberately broken inputs — a doc citing a nonexistent
module, a directory described as populated but empty, evidence stamped with a stale SHA, a commit
message missing a required section — and the audit is asserted to **reject** each. An audit never
observed to fail is not evidence of anything.

## Adopted mechanics

Cheap, well-evidenced, and now part of M0:

- **Constitution versioning** — MAJOR.MINOR.PATCH, ratification date, last-amended date, and a **Sync
  Impact Report** on every amendment naming the artifacts it must propagate to (spec-kit).
- **`[NEEDS CLARIFICATION: …]` markers** — mandatory wherever a requirement is uncertain, counted by
  the audit, may not survive into an accepted design doc (spec-kit).
- **`dirty` flag on all evidence** — a measurement taken on an uncommitted tree is not evidence
  (inspect_ai).
- **Point-in-time numbers** — every measurement in a commit message is suffixed with its SHA
  (METR's timing-log rule).
- **Version integer on every gate** — incremented on any breaking change, so we can always say which
  gate version produced a historical number (lm-evaluation-harness).
- **Protected `HUMAN:` block in PR bodies** — owner's words, agents forbidden to edit, CI fails when
  missing (OpenHands). This structurally solves the sibling's stated problem that the agent operates
  the owner's account, so authorship is not evidence of voice.
- **Generated doc sections between markers**, with `docs:check` diffing regeneration as a test
  failure (cargo-rdme / readme-sync).
- **Weekly cron for the harness audit** — half of harness rot is time-based and never coincides with
  a commit that touches the harness (agents-lint).
- **Compact tool/error output** — verbose human-oriented errors overload agents (SWE-agent).

## Refused, with reasons

- **Full spec-driven development.** Scott Logic's 2,577 lines and 3.5 hr review for one CRUD feature,
  plus Böckeler's finding that these tools are spec-*first* in practice, say the cost is real and the
  artifact is discarded anyway. Our constitution + design docs + PR trace is already at the right
  altitude. We take spec-kit's *mechanics* (versioning, sync impact, clarification markers) and
  refuse its *process*.
- **LLM-generated instruction files as a category.** The ETH study measures these as net negative.
  Everything in `AGENTS.md` and `PRINCIPLES.md` must be a decision a human made or a fact no reader
  can derive — not a summary of the codebase.
- **Restating the architecture in the instruction file.** Minimal benefit, highest drift.

## Open question

**Does the ETH finding indict our own instruction files?** They are agent-drafted, and the study
found agent-drafted context files net negative. The mitigation applied here is to restrict content to
owner decisions, verbatim owner quotes, and non-inferable operating rules — none of which an agent
could derive from the repo. That is a reasoned mitigation, **not a measured one.** If we want the
claim to be evidence rather than argument, the honest test is to run a handful of tasks with and
without the files and compare. Flagged rather than assumed.
