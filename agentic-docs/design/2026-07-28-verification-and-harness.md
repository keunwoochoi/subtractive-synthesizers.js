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

### The caveat that nearly cost us the whole design

**An exact metric is not a safe metric, and believing otherwise is the specific mistake that broke
every comparable system.** Kernel timing was exact — an agent overwrote `time.perf_counter` so the
grader's timer read zero. An L1 norm was exact — an agent copied the reference model, perturbed a
few weights, and printed fake training logs. SSIM was exact, geometric overlap was exact; both were
gamed. Measured base rates: unprompted reward hacking in **30.4 % of METR's RE-Bench runs** and
**100 % on one task**; evaluator-tamper attempts in **~50 %** of natural episodes in a 2026 study.

None of those attacks touched the mathematics. **They went around it** — at the timer, at the
reference, at the comparison, at the aggregation. Analytic ground truth protects the *formula*; it
does nothing for the *pipeline*.

So the claim above survives, but narrowed: our ground truth needs no corpus and no license, which is
a real and permanent advantage — **and it buys us nothing at all unless the harness computing it is
protected, adversarially tested, and graded on worst case rather than average.** That work is
specified in Loop A below and evidenced in
[`2026-07-28-loop-evidence.md`](./2026-07-28-loop-evidence.md). It is not optional, and it is
budgeted before the search algorithm, not after.

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
change DSP  →  render the fixed probe set  →  harness computes every number
            →  cascade of gates, cheapest first  →  block merge on a Tier-1 regression
```

Fast, deterministic, no audio corpus, no human. Replaces the sibling's `match-reference` loop for
everything that has a right answer.

**Six rules, all imported from systems that were gamed without them.** Full evidence and the base
rates are in [`2026-07-28-loop-evidence.md`](./2026-07-28-loop-evidence.md); the short version is
that analytic ground truth protects the *formula*, never the *pipeline*, and the attacks always land
on the timer, the reference, the comparison, or the aggregation.

1. **The DSP returns a buffer; the harness computes every number.** DSP code returns `Float32Array`
   and nothing else. It never prints a score, never imports the analytic reference, and never reads
   the evaluator source.
2. **Grade the worst case, never the average.** Mean inharmonic energy across a sweep will hide a
   screaming alias tone at one pitch/cutoff/Q triple. The gate is the worst point on the grid; the
   mean is reported and never gates.
3. **The cheat suite ships before the DSP.** Silence, a pure sine, a brickwall lowpass at 8 kHz, a
   filter that never resonates, and a special-cased test grid each defeat at least one Tier-1 gate.
   Each must be **rejected**, and one honest optimization must be **accepted**. Re-run on every
   evaluator change.
4. **Visible grid for iteration, hidden grid for the gate.** Track the gap between them. A widening
   gap means the proxy is being optimized past the specification — stop.
5. **Differential-test against the prototype on randomized inputs, every iteration.** Randomization
   is what defeats special-casing.
6. **Immutable skeleton.** Note→frequency mapping, sample-rate handling, the buffer contract, and
   output normalization are not editable. Only coefficient and topology internals are.

The evaluator returns three things, not a number: the gate verdict, a metric dict, and diagnostic
prose (*"alias sidebands at 14.2 kHz for MIDI 96 at f_c = 8 kHz, −38 dB"*). The prose is what makes
the next change targeted instead of random. Held-out metrics stay private.

### The cascade — listening is the scarcest resource, so it comes last

| Stage | What | Cost | Verdict |
|---|---|---|---|
| 1 | NaN, denormal, DC offset, not-silent, clipping | ms | binary |
| 2 | Tuning cents; transfer-function match vs prototype | ms | binary |
| 3 | Alias and inharmonic energy, **worst case** | seconds | continuous — fitness lives here |
| 4 | CPU budget (interleaved, warmed, min-of-N) | seconds | binary |
| 5 | Loop B listening — stage-4 survivors only | human minutes | veto + next metric |

**Never spend a listening trial on a candidate that fails an analytic gate.** And keep *did it run*,
*did it score*, and *is it faithful* as three separate flags — collapsing a crash and a bad score
into one value is how a search comes to prefer the timid wrong answer over the correct one that
needed one more stabilization step. In DSP that is the likely failure, because the physically-right
filter is often the one that blows up at high Q first. **Rejected-for-instability is a queue to
revisit, not a verdict.**

### The gap the tiers leave open: correct, fast, and dead

A patch can pass every Tier-1 and Tier-2 gate and still sound like a toy, and an automated loop
optimizing only what it can see converges *toward* that region silently. Two mitigations:

- **Optimize several metrics even when one is the target** — programs excelling under different
  criteria have structurally different logic, which broadens what gets proposed.
- **Run Loop A as quality-diversity, not hill-climbing.** Keep a grid whose feature dimensions are
  perceptual proxies we deliberately *do not* optimize — spectral centroid at fixed cutoff, even/odd
  harmonic ratio, resonance decay time, drive nonlinearity index.

The second changes what Loop B is asked to do. Instead of one winner and *"is this better?"*, it
hands the owner **a grid of audibly distinct candidates that all pass spec** and asks *"which
character do you want?"* — which is what ears are good at, and what `PRINCIPLES` #1 says the product
is. It also stops the automated loop from silently deleting the candidate we would have chosen.

## Loop B — `curate-patch` (human, structured, for everything that doesn't)

```
write intent  →  propose variants along ONE named axis  →  blind, order-randomized, with anchors
              →  owner picks  →  record choice + confidence + rationale, separately
              →  convert the rationale into a Loop A metric
```

1. **One named axis per round.** Change resonance *or* envelope decay, never both, or the pick is
   uninterpretable.
2. **Blind, order-randomized, and anchored.** MUSHRA exists because unanchored listening tests do
   not measure what they claim: it mandates a hidden reference, a low anchor, and post-screening.
   Minimum viable here — **identical A/A pairs seeded into every session** (claiming to hear a
   difference voids it), **a known-bad anchor per axis** (if it does not lose, the session is void),
   and **trial count and win rate recorded**, so we know whether 7–3 is signal.
3. **Three columns, not one.** The **blind choice** is the only datum that is evidence. The
   **confidence** is separate. The **free-text rationale is tagged as a hypothesis** — METR's
   randomized trial found developers 19 % slower with AI who still believed afterwards they had been
   20 % faster. Self-report is not a fitness function.
4. **Record the rejected variant and why.** Unrecoverable from the diff.

### Taste never becomes fitness — it becomes the next metric

This is what ties the loops together. A verbal reason — *"papery high end," "the resonance sits on
top instead of inside"* — is a **specification request**. Its job is to become a Loop A metric: an
odd/even harmonic ratio, an envelope-of-resonance measure, a transient-slope check. Once that metric
exists it moves into the cascade and **stops costing listening trials forever.**

That is how a scarce human resource compounds instead of being spent — and it is the opposite of
promoting a human-approximating judge to fitness, which is the mistake that produced a documented
57 % rate of hallucinated numerical results in the best-known automated-science system.

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
The architecture doc described an SoA voice bank that was never built (issue #62 in that repo
records this).
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

## Resolved — owner decisions, 2026-07-28

All five open forks were closed in one exchange. Recorded here rather than in chat, per the decision
table above.

1. **Who is the ear — settled: owner-only for iteration, personas as a pre-filter.** Owner: *"ear -
   yes."* Per-patch decisions are the owner's alone; the persona panel runs ahead of the owner to
   catch the obvious and save their attention; the producer persona's ten-second dismissal test is
   the headline gate.
2. **Report cadence — settled: journey log per session, report per milestone.** Owner: *"report - ok
   good. we can also update the report later anyway."* Note the second clause is only safe because
   every number in the report is generated rather than typed — updating later is cheap precisely
   because nothing is remembered by hand. That is the lesson from the sibling's stale draft, and it
   is what makes this cadence affordable.
3. **Alias gate threshold — settled: M1 measures, then we set it.** Owner: *"ok cool."* Picking a
   number before measuring PolyBLEP's real behaviour on our oscillators would produce either theatre
   or a blocker.
4. **Intent statements — schema and one worked example land in M0; the all-at-once-vs-lazy question
   defers to M3.** Owner: *"idk wdym, sounds like we can decide it later."* The confusion was the
   author's fault: the fork was posed before an example existed. The worked example below is the
   answer, and the scheduling question genuinely is an M3 concern, not an M0 one.
5. **Bench gate — settled by delegation.** Owner: *"who is 'their'?? idk you can decide."* Decision
   in the next section. (The owner's first clause is a fair hit on the author's prose: this document
   had been saying "their" for `physical-instruments.js`, which reads as a third party when the owner
   owns both repos. Corrected throughout to "the sibling" or the repo name.)

### Decision: the bench gate's unit changes from voice count to a named arrangement

**A voice count is a meaningless unit for this library.** In `physical-instruments.js`, one voice is
approximately one voice's worth of work. Here, a supersaw voice is seven oscillators and a mono bass
voice is two — a 3.5× spread inside the same number. Gating on "32 voices" would let us pass with 32
cheap voices and ship something that stutters on the patch people actually want.

So the gate keeps the sibling's **budget** (≤ 50 % of 2.67 ms / 128 frames) and its **desktop-first
framing** (M1 desktop gates; mobile is a degradation target and estimated mobile numbers are never
presented as budget rows), and replaces the **unit** with a named reference arrangement that
contains the worst case by construction: a supersaw pad, a bass, a polyphonic pluck, and a drum kit,
playing simultaneously.

The exact voice counts in that arrangement are set at **M1, alongside the alias threshold**, for the
same reason — per-voice cost with oversampling is unmeasured today, and a number invented now would
be either trivially passable or impossible. What is decided now is the *form* of the gate; the
*number* follows the measurement.

## Worked example — what a patch intent statement actually is

Written **before** any DSP tuning for that patch. This is the artifact referred to throughout, and
it is the answer to a fork that was posed before an example existed.

> ### Patch intent: `acid-bass`
>
> **For:** driving sixteenth-note basslines. The sound everyone recognises from a 303, without
> saying so on the tin.
>
> **In words:** squelchy and aggressive. *The filter is the instrument* — when resonance is up, the
> resonant peak should be more prominent than the fundamental. Dies fast and dry: no tail, no
> reverb. Sits low, and cuts through a mix without being turned up.
>
> **The one committed target (not an average):** the aggressive end. If forced to choose between
> "smooth and usable across many genres" and "unmistakably acid," choose acid. A version of this
> patch that offends nobody has failed.
>
> | # | Measurable target | Which phrase above it comes from |
> |---|---|---|
> | 1 | Amplitude decays to −60 dB within 400 ms at the default envelope | "dies fast and dry" |
> | 2 | At resonance ≥ 0.8, the spectral peak at *f_c* exceeds the *f₀* partial by ≥ 6 dB | "the filter is the instrument" |
> | 3 | Spectral centroid rises ≥ 1.5× from velocity 40 → 110 | accent behaviour |
> | 4 | At MIDI 36, ≥ 70 % of energy sits between 40–120 Hz | "sits low" |
> | 5 | Alias energy meets the Tier-1 gate with resonance **and** drive both at maximum | the hardest alias case this patch can produce |

Three things this buys, which are the whole argument for the artifact:

- Targets 1–4 are **Tier-2 measurements that did not exist until the prose was written down.** They
  are derived from the sentences, not invented independently — each row names its source phrase, so
  the chain from taste to number is auditable.
- Target 5 exists because writing the intent forced the question *"what is this patch's worst alias
  case?"* before the DSP was written, rather than after a listener noticed something fizzing.
- The "one committed target" line is the falsifiable part. Six months later, "we made it smoother
  and more versatile" is visibly a **failure against the stated intent**, not a neutral change of
  direction — and if it is genuinely the right call, the intent gets amended in the open with a
  reason.

The schema and this example ship in M0. **Whether all eight roster patches get their intents written
up front or one at a time is an M3 question and is deferred** — it does not block anything earlier.
