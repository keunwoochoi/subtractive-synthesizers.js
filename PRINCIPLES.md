# PRINCIPLES

**Version 1.1.0** · Ratified 2026-07-28 · Last amended 2026-07-28

> This is the constitution. `AGENTS.md` routes; this file governs and supersedes other practice.
> Amendments are dated, quote the owner verbatim, say what the old rule got wrong, and carry a
> **Sync Impact Report** naming every artifact the change must propagate to.
>
> **This file contains no number derived from code.** Numbers live in the scripts that measure them.

## Mission

Every web developer should be able to `npm install` a real analog synthesizer — analog bass, acid
line, supersaw, string-machine pad — computed on the fly in tens of kilobytes. No samples, no CDN,
works offline, one `noteOn()` call.

Second in the `sets-of-instruments-js` family. `physical-instruments.js` models instruments that
exist; **this one ships synthesizers, whose output imitates nothing.** That is not branding — it
determines how we verify our work.

## Product principles (ordered)

### 1. Curation is the product
A sawtooth through a resonant lowpass imitates nothing — it is the sound itself. There is no
reference recording we are failing to match, so **no correctness result will ever make a patch
good.** What makes this library worth installing is that someone with taste chose these patches and
committed to them. Corollary, and it is product law: **pick one target tone and commit — never tune
to the washed-out average. A patch that offends nobody has failed.**

### 2. Write the target down before you tune it
Every patch gets an intent statement — prose plus measurable targets *derived from* that prose —
before any parameter is touched. Without one, tuning drifts forever and every stopping point is
defensible in hindsight. The intent is what lets us be **wrong**, which is the only thing that lets
us finish. Amend openly, with a reason; never drift silently.

### 3. Tiny and self-contained
No sample downloads, no CDN dependencies, no network at play time. The ceiling is owned by
`scripts/audit/bundle-size-audit.sh` and fails CI on breach. **Never restate it from memory.**

### 4. Trivial API, deep escape hatches — and here the hatches matter more
A web developer plays a note in three lines. But cutoff, resonance, and envelope amount are what
players actually reach for, and a virtual-analog library that buries them behind presets has missed
the point. Presets stay one string simple; the panel is one argument away.

### 5. Arrangements, not solo demos
Budget, API, and evals are defined on a reference arrangement containing the **expensive** patch by
construction — never an average of cheap ones.

### 6. Works where web devs work
Vite, Next, Webpack, iOS Safari — zero-config or it doesn't ship. Single-threaded: no COOP/COEP
demands on anyone's deployment.

## Engineering principles

### Fidelity to specification, not to a recording
A ladder filter is a discretization of a known transfer function; an ideal saw has harmonics at
*k·f₀* with amplitude ∝ 1/*k*. **We do not need a reference recording because we have a reference
equation** — no room, no microphone, no performer, no license, no sampling error. This is the
structural difference from the sibling project, and why our CI can block on numbers it could only
review by ear.

### Reference-corpus convergence is a non-goal
Rejected, not deferred, on two grounds: we are not trying to *be* any particular synthesizer, and no
verified CC0/CC-BY corpus of analog multi-samples exists ("royalty-free" is marketing, not a
license). Hardware recordings are **calibration spot-checks, never convergence targets** —
scratchpad only, never committed, license verified first. Stated so no future session rebuilds the
sibling's loop out of habit.

### A metric delta is not a sound
Inherited from the sibling's hardest-won lesson: a PR there moved every metric it set out to move
and was audibly nothing. That binds **harder** here — we have less anchoring, not more. **No change
affecting how a patch sounds ships on measurements alone.**

### Eval before trust
Blind and order-randomized, always — cheap, and it removes expectation bias. The **verbal reason**
for a pick is the recorded output, not the parameter: the parameter is recoverable from the diff,
the reason is not. Rejected variants are recorded too.

### Every patch is held to the quality matrix, in dependency order
**stability → headroom → alias → tune → envelope → dynamics → character.** A NaN-ing or clipping
voice corrupts every downstream number; inharmonic energy corrupts every spectral measurement for
the same reason. Alias sits early because it has a fully objective answer and is what a subtractive
synth most commonly fails.

### The audio thread is sacred
Allocation-free, lock-free, GC-free, denormal-flushed. Violations are bugs even when inaudible today.

### Degradation is acceptable; corruption is not
Under load we shed voices gracefully — never glitch, crackle, or go silent without a diagnostic.

### No silent errors, no silent fallbacks
Loud on failure, silent on success. A lookup that quietly falls back to a default is a bug.

### Generate, never duplicate
A fact in two hand-maintained places will disagree. One source, generated outward, proven by a test.

### Rules are enforced or they are deleted
Instruction files are context, not configuration — under pressure prose gets ignored. Anything that
must always happen is a hook, a generated artifact, or a failing test. **And the enforcement must
itself be shown to fail correctly**, against deliberately broken fixtures. An audit never observed
to fail is not evidence of anything.

### License hygiene is absolute
Port MIT/BSD freely with ledger entries; never open GPL/LGPL/AGPL source — papers-only
reimplementation. **Trademarks are the live risk in this domain:** the names of famous synthesizers
may not appear in presets, public API, docs, or marketing. **Describe the sound, never the machine.**

## What we are not

- Not a DAW, sequencer, arpeggiator, or groovebox.
- Not a sampler, soundfont player, or sample-based anything.
- Not an emulation of any specific hardware synthesizer, and not marketed as one.
- Not a VST/plugin host or exporter — browser only.
- Not a modular environment or patching language; the signal path is fixed and curated.
- Not an FM or wavetable engine. **Subtractive means osc→filter→amp**; other techniques are other
  siblings.

## Amendments

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
