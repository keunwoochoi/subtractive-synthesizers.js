# Verification and harness: how this project decides it is right

Date: 2026-07-28
Status: **draft — owner review required.** This is the gating document for M0. Owner direction,
2026-07-28: *"this time I want to clarify from the beginning that we need to first set up the
harness … we need sort of loop, we need the way to verify the result. I don't know why it has to be
exactly the way to verify the result for the subtractive synthesizer."*

Authorizes nothing until reviewed. Companion to
[`2026-07-28-architecture.md`](./2026-07-28-architecture.md), which owns what we build; this doc owns
**how we know it worked** and **how the process is recorded so it can be written up.**

## The problem, stated exactly

`physical-instruments.js` had one answer to "is this right?": **render our model and a real
recording of the same note, and measure the distance between them.** Multi-resolution log-mel
distance, attack time-to-peak, early/late t60, partial cents deviation, spectral-centroid
trajectory, BS.1770 delta. That loop is its research engine, and it works because a cello exists and
our cello either matches it or doesn't.

**None of that transfers, and the reason is not logistical.** It is that a subtractive synthesizer
is not an imitation of anything. There is no recording of "the correct sawtooth through the correct
filter" that we are failing to match. Two things follow, and they pull in opposite directions:

1. The convergence target is gone. Nothing tells us when a patch is done.
2. Every result is defensible after the fact. With no target written down, any tuning outcome can be
   rationalized, forever, and the loop never terminates.

There is also a hard logistical finding on top: **no verified CC0 or CC-BY corpus of analog synth
multi-samples exists** (survey, 2026-07-28). The pianos and basses that anchored the sibling's loops
had clean licenses; the analog world offers "royalty-free," which is marketing, not a license. So
even a weakened reference-matching loop has no legal corpus to run against.

This document proposes the replacement. It has to exist before any DSP is written, because **the
verification loop is what defines "done," and a project that writes DSP first will discover its
definition of done by accident.**

## The core move: our ground truth is analytic, not acoustic

Here is the thing that makes this tractable, and it is better than what the sibling had.

**A subtractive synthesizer is built from components that have exact mathematical specifications.**
A 4-pole ladder filter is a discretization of a known continuous-time transfer function. An ideal
sawtooth has harmonic amplitudes that fall as 1/k with known signs. An ADSR envelope has declared
times. None of these are matters of opinion, and none of them require a recording to check against.

So: **we do not need a reference recording, because we have a reference *equation*.** And the
equation is a strictly better ground truth than a recording — it has no room, no microphone, no
performer, no license, and no sampling error. What the sibling had to source, canonicalize,
checksum, and legally clear, we can simply evaluate.

Concretely, these all have exact answers:

| Component | Analytic ground truth | What we measure |
|---|---|---|
| Oscillator | Ideal saw: harmonics at *k·f₀*, amplitude ∝ 1/*k*. Pulse/tri similarly closed-form | Energy at non-harmonic bins = **alias**. Report worst case and mean across the range |
| Ladder filter | *H(s)* = 1/(1+s/ω_c)⁴ with feedback *k*; 24 dB/oct asymptote | Measured cutoff vs requested (especially near Nyquist, where naive bilinear warps and TPT is supposed not to); slope; resonance peak height; self-oscillation threshold |
| SVF | Standard 2-pole LP/BP/HP/notch responses | Same, plus mode-to-mode consistency |
| Self-oscillation | A clean sinusoid at *f_c* | Purity (THD of the oscillation) and pitch accuracy vs cutoff |
| Envelope | The patch's own declared A/D/S/R | Measured time-to-peak, decay t60, sustain level, release t60 |
| Tuning | Requested MIDI pitch → f₀ | Cents deviation across the full range and every velocity |

**This is the single most important structural difference from the sibling project, and it should be
stated in `PRINCIPLES.md`:** where physical-instruments.js measures *fidelity to a recording*, this
project measures *fidelity to a specification*. That is cheaper, exact, fully automatable, and
carries zero licensing exposure.

It also means our CI can be genuinely stronger. "Does this sound like a cello" is irreducibly a
judgment call and can never be a hard gate. "Is the inharmonic energy below −60 dBFS across the
range" is a number, and it can block a merge.

## Three tiers of verification

Everything we care about sorts into exactly three tiers, and each tier gets a different mechanism.
Confusing them is the main failure mode this design exists to prevent.

### Tier 1 — analytic. Hard CI gate. No human in the loop.

Ground truth is a closed-form expression. A regression here is a bug, full stop.

- **Alias suppression** — the crown jewel, and the best tripwire in either repo. Sweep every
  oscillator across the full pitch range and every filter configuration across cutoff × resonance ×
  drive; measure energy outside the expected harmonic series. This is where the oversampling
  decision proves or refutes itself.
- **Filter response vs analog prototype** — cutoff tracking, slope, resonance peak, self-oscillation
  threshold and purity.
- **Tuning** — cents deviation, including self-oscillation pitch and oscillator sync.
- **Stability** — no NaN, no inf, no denormals, no runaway, at maximum resonance and drive, sustained
  for minutes. Self-oscillating nonlinear feedback is genuinely dangerous and this is not a hygiene
  check here, it is a real failure mode.
- **Headroom** — no clipping at any velocity on any patch; BS.1770 matched across the roster.
- **Determinism** — a frozen render contract: fixed patches, fixed notes, hashed output. Any DSP
  change that moves the hash must say why in the commit. (The sibling's `transport-baseline.mjs`
  pattern, reusable with edits.)
- **Budget** — CPU against 2.67 ms / 128 frames on a full multi-track arrangement; bundle size
  against the ceiling, owned by the audit script.

### Tier 2 — spec-relative. Measured against the patch's own declared intent.

Ground truth is **a document we wrote before we started tuning** (see next section). Not a hard
gate, but a reviewable number: the PR must show the measurement and either meet the intent or
explicitly amend it.

- Envelope shape vs declared ADSR.
- **Dynamics** — velocity 20 vs 100 must move *both* loudness and spectral centroid. Both deltas
  measurable, thresholds declared per patch.
- **Analog character** — render the same note twice and a six-note chord; verify voices are **not**
  bit-identical and that drift stays inside its declared bound. "Is there controlled imperfection,
  and is it controlled" is objectively checkable even though "does it sound alive" is not.
- Patch-specific targets from the intent statement (decay under 400 ms, resonance dominant over
  fundamental above *Q*, and so on).

### Tier 3 — taste. Structured human loop. Never automated, never faked.

Does the bass patch sound good. There is no metric and there will never be one. The mechanism is
Loop B below. **The discipline is not to pretend this tier is smaller than it is** — with curation as
the product, Tier 3 *is* the product, and Tiers 1–2 exist to keep it honest, not to replace it.

## The patch intent statement — the move that makes Tier 3 tractable

**Every patch gets a short written intent before any DSP parameter is tuned.** This is the key
methodological proposal in this document.

It contains: what the patch is for, what it should sound like *in words*, one named reference point
in prose (not a file — "squelchy and aggressive, resonance louder than the fundamental, dies fast"),
and three to five **measurable targets derived from that prose**.

Why this and not just "tune until it sounds good":

- With no convergence target, tuning drifts forever and every stopping point is defensible after the
  fact. An intent written **first** gives us something we can be **wrong** about. That is the whole
  value: it converts an unfalsifiable process into a falsifiable one.
- It promotes several Tier-3 judgments into Tier-2 measurements, which is the only honest way to
  shrink the subjective surface.
- It is the artifact the write-up needs. "Here is what we said we wanted, here is what we got, here
  is where we were wrong" is a report. "We tuned it until we liked it" is not.

This is the direct descendant of the sibling's best quality rule — `audit-voice`'s *"pick one target
tone and commit — never tune to the washed-out average"* — promoted from an admonition in a skill
file to a required artifact with a schema. The sibling stated the principle; here it becomes
enforceable.

If the finished patch is better than its intent, we amend the intent and **say so in the commit**.
Amending is fine. Silently drifting is not.

## Loop A — `verify-spec` (automated, every commit)

```
change DSP  →  render the fixed probe set  →  compare against analytic prototypes
            →  Tier-1 pass/fail + Tier-2 numbers  →  block merge on Tier-1 regression
```

Runs in CI and locally. Fast, deterministic, no audio corpus, no human. This replaces the sibling's
`match-reference` loop for everything that has a right answer.

## Loop B — `curate-patch` (human, structured, for everything that doesn't)

```
write intent  →  propose N variants along ONE named axis  →  blind A/B, randomized order
              →  owner picks  →  record the VERBAL REASON  →  commit with the reason in the body
```

Four rules, each of which exists because of a specific way this loop fails:

1. **One named axis per round.** Change filter resonance *or* envelope decay, never both. Otherwise
   the pick is uninterpretable and teaches us nothing.
2. **Blind and order-randomized, always.** Cheap to do and it removes expectation and order bias.
   The sibling's blind ABX/MUSHRA web app is self-contained and reusable as-is; we do not build this.
3. **The verbal reason is the output, not the parameter value.** *"the second one has more bite in
   the low mids and the first one sounds like a plugin"* is worth more than `resonance: 0.72`. The
   parameter is recoverable from the diff. The reason is not, and it is what accumulates into a
   documented taste model — which is itself a deliverable of the write-up.
4. **Record rejected variants.** The one we did not pick, and why, is the most informative line in
   the commit and it exists nowhere else.

**Full ABX with sealed answer keys is reserved for release gates.** For per-patch iteration, N is one
listener and ABX is too heavy; blind randomized A/B is the right instrument.

## The inherited warning, which binds harder here

From the sibling's `ab-compare.mjs`, on PR #41: *"moved every metric it set out to move, and turned
out to be audibly nothing — 'they were very very very similar.' The difference measured 20 dB below
the signal. **A metric delta is not a sound.**"*

That warning was written for a project that had a reference recording to anchor it. We have less
anchoring, not more, so the temptation to let a moving number stand in for a better patch is
stronger here.

**Rule: no patch change ships on Tier-1 or Tier-2 numbers alone.** Those tiers are necessary and not
sufficient. Anything that changes how a patch *sounds* requires a Tier-3 sign-off, and the commit
says which one it was.

## What role reference recordings still play

Not none — but a demoted one, and the demotion is deliberate.

Hardware synth recordings are **calibration spot-checks, never convergence targets.** Useful for
sanity: does our ladder self-oscillate at a comparable resonance setting, does a 303-style patch
decay in the same ballpark. Not useful as a distance to minimize, because we are not trying to *be*
a Juno — and the trademark position in the architecture doc means we could not say so even if we
were.

Policy, inherited from the sibling and tightened: **scratchpad only, never committed, license
verified before use.** The negative survey result (no verified CC0/CC-BY analog corpus, 2026-07-28)
is recorded so it is not re-litigated every few months.

**Proposed `PRINCIPLES.md` non-goal:** *reference-corpus convergence is not this project's quality
mechanism.* Stating it prevents a future session from rebuilding the sibling's loop out of habit.

## The harness

### Carried forward — what demonstrably worked

These are the sibling's genuine wins and they transfer with only vocabulary changes:

- **Commit messages as the primary research output**, with the five required elements: the defect and
  *how it was actually found*; before/after measurements with units and a comparator; the root cause
  named; **what was tried and abandoned, especially fixes that made things worse**; and the cost.
  This is the sibling's crown jewel and the single biggest reason its process is writable-up at all.
- **The journey log** — one tracker issue, append-only comments, never edited. Failures are the
  contribution.
- **The PR template's "Agentic process trace"**, including the abandoned-routes row.
- **Owner decisions quoted verbatim and dated**, marked as owner voice — since the agent operates the
  owner's GitHub account, authorship is not evidence of voice.
- **`PRINCIPLES.md` as constitution with dated amendments.** The sibling's 150 KB budget amendment is
  a model of the form: it states what was wrong with the old rule, quotes the owner, and gives the
  new number with its reasoning.
- **Truth has owners, not echoes.** Never copy a fact into a second surface; link to it.
- **A self-enforcing harness** — `harness_audit.py` plus a pre-commit hook, so the rules are checked
  by a script rather than by memory.
- **Authority gates off by default** — publish, push to main, force-push, paid resources, public
  posts. A human lifts one per task, explicitly.
- **Evidence bound to an exact head SHA**, restated or marked historical after any head change.

### Changed — the five lessons, each from an observed failure

**1. The report was started at the end, and it was already stale when it started.**
`agentic-docs/tech-report/` in the sibling is untracked, reaches Act I only, and its headline number
(82 KB, 66.7 KB WASM) was already wrong against the measured 85.4 KB / 74.4 KB when I read it. A
report written from memory at the end of a project is a report full of remembered numbers.
→ **The report scaffold exists from M0**, and **every number in it is generated, never typed.**
Refreshed at each milestone rather than each session — the journey log carries the per-session raw
material, so the report does not need to.

**2. Docs drifted from code, silently, in three separate places.** The README claimed 13 instruments
and ~31 KB when reality was 29 and 85.4 KB. `AGENTS.md`'s repo map claimed `packages/midi` owns a
scheduler and Web MIDI — the scheduler is in `packages/core` and Web MIDI does not exist anywhere.
The architecture doc described an SoA voice bank that was never built (their own #62 records this).
→ **`harness-audit` gains a doc-vs-code check.** Any number in a doc must carry a marker naming the
script that owns it; unmarked numbers fail the audit. Structural claims about the repo layout are
checked against the tree.

**3. The instrument id was hand-duplicated in nine places, one of them type-enforced.**
→ **Generate.** M0's gate is that adding a fake synth proves no hand-edited second copy exists.

**4. Aspirational scaffolding read as real.** `evals/corpus/` and `evals/incumbents/` are empty
`.gitkeep` directories that the README describes as owning a fixed MIDI corpus and committed
incumbent renders.
→ **A directory that exists implies it is populated.** The audit checks it. Intent goes in an issue,
not in an empty directory.

**5. The quality skills were framed around acoustic realism**, so four of six needed rewording and
one needed replacing before they could be used here at all.
→ Frame the aspects around **specification and intent** from the start, in the order
**stability → headroom → alias → tune → envelope → dynamics → character** (alias sits early for the
same reason clipping does: inharmonic energy corrupts every spectral measurement downstream).

### How decisions get made and found again

One rule per kind, so nothing lands in a place nobody looks:

| Kind of decision | Where it lives | Form |
|---|---|---|
| Owner judgment / taste / product | `PRINCIPLES.md`, dated amendment | Verbatim quote + date + what changed and why the old rule was wrong |
| Technical, larger than one PR | dated design doc in `agentic-docs/design/` | The sibling's template: motivation, thesis, evidence, design in layers, phased gates, deferred |
| Technical, one PR | the issue, then the PR body | Process trace table incl. abandoned routes |
| A patch's target sound | the patch intent statement | Written **before** tuning; amended openly, never silently |
| Why a patch sounds the way it does | the commit body | The verbal reason from the blind A/B, plus the rejected variant |
| Work state, status, completion | GitHub issues and PRs | Never a local TODO, backlog, or status file |

### The PR process

Inherited from the sibling, plus one addition specific to this project: **a PR that changes how a
patch sounds must carry its blind A/B result and the verbal reason — not only its metrics.** A PR
with green Tier-1 numbers and no Tier-3 evidence is not reviewable here, because the numbers were
never the product.

## What M0 must contain

Harness before DSP, per owner direction. M0 is done when all of this is true and CI is green on an
empty build:

1. `PRINCIPLES.md` — constitution, including the specification-not-recording principle, the
   reference-corpus non-goal, and the bundle ceiling owned by a script.
2. `AGENTS.md` — constitution + routing only, with a repo map that is **checked** against the tree.
3. This doc and the architecture doc, accepted.
4. `scripts/audit/harness-audit.sh` + the doc-vs-code checker + the pre-commit hook.
5. `scripts/audit/bundle-size-audit.sh`, owning the ceiling, with the byte-compare of committed WASM.
6. The Tier-1 harness skeleton — `verify-spec` runnable and reporting real numbers on a stub
   oscillator, so the loop exists before the DSP it will judge.
7. The patch intent schema + one worked example.
8. Skills, reframed: `audit-{stability,headroom,alias,tune,envelope,dynamics,character}`,
   `verify-spec`, `curate-patch`, plus the generic ones lifted from the sibling
   (`finalize-pr`, `harness-audit`, `new-design-doc`, `wrap-session`, `panel-review`, `review-as`,
   `port-audit`, `dsp-bench`).
9. `.github/` issue forms, PR template, CI (four jobs), and the journey-log tracker issue opened.
10. `agentic-docs/licensing.md` seeded with the copied-plumbing provenance and source SHAs.
11. The report scaffold, with generated-number discipline wired in.
12. Single-source id generation, proven by the fake-synth test.

## Open forks — the ones I cannot decide for you

1. **Who is the ear?** Owner-only, or a small listener panel for release gates? The sibling used owner
   ear plus seven personas; five of those port nearly verbatim. My recommendation: **owner-only for
   per-patch iteration** (fast, and taste is the product), **personas as a pre-owner filter** to catch
   the obvious, and the producer persona's ten-second dismissal test kept as the headline gate — it
   is arguably more apt for a synth library than it was for acoustic instruments.
2. **Report cadence.** Living document updated every session is real overhead. My recommendation:
   **journey log every session** (cheap, append-only, raw) and **report refreshed at each milestone**
   from that log with generated numbers. You get the write-up without paying a documentation tax on
   every commit.
3. **How hard is the alias gate?** A number has to go in CI. I would rather propose it after M1
   measures what PolyBLEP actually delivers on our oscillators than pick a threshold now and have it
   be either theatre or a blocker. **Proposal: M1 measures, then we set it.**
4. **Does the roster get intent statements up front, or one at a time?** Writing all eight before any
   tuning is more honest and catches overlap early; writing them lazily is faster. I lean **all eight
   up front, briefly** — they are a paragraph each and they define the product.
5. **Does `dsp-bench`'s multi-track arrangement gate carry over unchanged?** The sibling's desktop-first
   M1 gate (32 voices, ≥4 tracks, ≤50 % of 2.67 ms) is inherited in the architecture doc. Supersaw at
   seven oscillators per voice is a materially heavier case than anything the sibling benchmarks.
   Worth deciding whether 32 voices is still the right number, or whether the unit should be
   "eight-voice supersaw plus a rhythm section."
