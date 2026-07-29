# Architecture: subtractive-synthesizers.js — a virtual-analog sibling

Date: 2026-07-28
Status: **accepted (owner, 2026-07-28)** — *"ok. agree with your judgment."* Authorizes the thesis,
architecture, roster, quality regime, and phasing below, and the name
**`subtractive-synthesizers.js`**.

Does NOT authorize: writing DSP code (M0 harness comes first — owner direction, same message), npm
publish, or **any change whatsoever to `physical-instruments.js`**, which the owner has frozen for
imminent release. Every proposal here that would touch the sibling repo is deferred behind that
release by construction.

The verification loop this document defers to is designed in
[`2026-07-28-verification-and-harness.md`](./2026-07-28-verification-and-harness.md), which is the
gating document for M0.

## Motivation

1. **physical-instruments.js deliberately does not cover the electronic repertoire.** It models
   strings, bars, bores, and membranes — acoustic instruments. A web developer scoring a game, a
   demo, a lo-fi loop, or a synthwave track needs analog bass, acid lines, supersaw leads, string
   machines, brass stabs, and 808/909 drums at least as often as a piano. Today that developer has
   the same bad options the physical library was built to replace: megabyte sample packs, or a
   toolchain.
2. **The plumbing is solved and proven — measured, not assumed.** A file-level inventory of the
   sibling repo (2026-07-28, recorded in Design/reuse below) finds **~1,900 LOC reusable as-is** and
   **~5,500 reusable with edits**, against ~10,000 LOC that is genuinely physical-modeling-specific.
   The single-worklet engine, the WASM handshake, the sample-accurate event queue, the shared
   reverb, the master limiter, offline render, SMF parsing, the audit scripts, the persona panel,
   and the CI shape are all instrument-agnostic. They were paid for once.
3. **The demand is already visible inside the sibling library, as a stub.** `Instrument::SynthPad`
   is 89 lines: two polyBLEP saws at a hardcoded 1.004 detune through **two cascaded one-pole
   lowpasses with no resonance at all**, with the filter envelope hardcoded to share the amp
   envelope. It has no sub-oscillator, no noise, no PWM, no sync, no LFO, no resonance, and no
   exposed parameters. And it is the busiest fallback in the whole GM map: `packages/midi` routes
   **GM programs 80–103 and 62–63** to it, and `packages/core` additionally aliases `strings` and
   `voice` onto it with `// (placeholder)` comments. Every synth lead, pad, and FX patch in every
   MIDI file a user drops on the playground is currently rendered by that stub. **This library is
   the real implementation of a surface the sibling already committed to and could not staff.**
4. **Subtractive is the easier product at a higher quality-per-byte ceiling — and this is the
   central bet, so it is stated plainly in the Thesis below.**
5. **The family framing is already implied by the directory.** The parent is
   `sets-of-instruments-js/`, not `physical-instruments.js/`. A sibling is the structure the owner
   already reached for.

## Thesis

**Physical modeling fights an uncanny valley. Subtractive synthesis has none — and that inverts
the entire difficulty curve.**

`physical-instruments.js`'s own constitution names the problem it lives with: *"the familiarity
ladder — piano, guitar, and drums carry the highest bar. These are the instruments everyone plays,
hears daily, and knows intimately; listeners grant exotic timbres the benefit of the doubt and
grant these none."* Every modeled piano is judged against the listener's intimate memory of a real
one, and loses until it doesn't.

A sawtooth through a resonant lowpass filter is not an imitation of anything. **It is the sound
itself.** No listener alive can hear that our ladder filter is not a Moog ladder the way they can
hear that a modeled piano is not a piano. There is no reference recording that the artifact is
failing to be.

The consequences run through every part of this plan:

- **The DSP is table stakes, not the bottleneck.** The entire subtractive vocabulary is roughly six
  primitives — antialiased oscillator, nonlinear resonant filter, envelope, LFO, per-voice drift,
  and a small effects rack. All are thoroughly documented in freely-licensed literature. Compare
  the physical library's 13.7k lines of Rust across waveguides, modal banks, WDF amp circuits, bowed
  friction, and brass bores.
- **Patch curation becomes the entire product.** With no ground truth to converge on, the design
  space is unbounded and taste is the only thing that closes it. This is a *harder* product problem
  and an *easier* engineering one, and the plan below is shaped around that asymmetry.
- **The reference-matching loop does not transfer.** See Evidence base — the licensed-corpus
  situation for analog synths is materially worse than it was for pianos and guitars, and there is
  no "right answer" to converge toward even when a corpus exists. The physical library's
  `match-reference` loop is its research engine; here it is at most a spot-check.
- **The library should be much smaller.** See Design/bundle.

The bet: **a curated, alias-free, characterful virtual-analog library can reach "beautiful by
default" faster than the physical library did, in less than half the bytes** — and can plausibly be
the first of the two to feel finished, even though it starts second.

## Evidence base

Primary sources, license-checked. Unverified items flagged as such.

- **Filter core — Zavalishin, *The Art of VA Filter Design* (rev. 2.1.2, 2020).** The canonical
  treatment of topology-preserving transform / zero-delay-feedback filter design: ladder, SVF,
  nonlinearities, and the trapezoidal-integration framing. **License verified:** the book grants the
  right *"to freely copy this revision of the book in software or hard-copy form, as long as the book
  is copied in its full entirety … and its contents are not modified."* It is a *book*, not source
  code — reimplementing from it is clean-room by the physical library's own papers-only standard,
  with no copyleft exposure. This is the single most load-bearing reference in the plan.
- **Oscillator antialiasing — PolyBLEP.** Välimäki & Huovilainen's BLEP/BLIT lineage; PolyBLEP is
  the cheap, table-free residual-correction variant. Table-free matters here: it costs bytes only
  in code, which is exactly the currency this project budgets in. Alternatives considered in
  Design/oscillators.
- **Moog ladder nonlinearity — Huovilainen (DAFx-04), "Non-linear digital implementation of the Moog
  ladder filter."** The tanh-per-stage model that produces self-oscillation and the characteristic
  bass loss at high resonance. Papers-only; no source needed.
- **Patent posture.** The original Moog ladder patent (filed 1966, granted 1969) expired in the
  1980s; the topology is long in the public domain. The live risk is **trademark, not patent**:
  "Moog", "Minimoog", "Juno", "TB-303", "TR-808", "Prophet", and "Oberheim" are active marks and
  may not name presets or appear in marketing copy. Descriptive naming only. This mirrors the
  existing caution in the sibling repo's issue #65 (piano coupling patent landmine).
- **Reference corpora — materially worse than for acoustic instruments.** A survey (2026-07-28)
  found abundant *"royalty-free"* 808/909 and analog packs but **no verified CC0 or CC-BY corpus of
  iconic analog synth multi-samples** comparable to the Salamander piano (CC-BY-3.0) or the Karoryfer
  basses (CC0) that anchored the physical library's loops. "Royalty-free" is a marketing term, not a
  license, and does not survive this project's license-hygiene bar. `modularsamples.com` surfaced as
  the one plausible CC0 lead and **could not be verified — the site did not resolve to readable
  content on 2026-07-28. Flagged unverified; a license check gates any use.**
- **Bundle-size existence proof — carried over.** The physical library's architecture doc cites
  cprimozic's Rust+WASM+SIMD synth at 27 KB compressed. That artifact is *subtractive*, which makes
  it a directly applicable datapoint here rather than an analogy.
- **Engine feasibility — already demonstrated, not assumed.** The sibling repo ships 29 instruments
  in 85.4 KB gz (74.4 KB WASM + 5.3 KB core JS + 2.6 KB worklet + 2.9 KB MIDI, measured 2026-07-28)
  inside one AudioWorklet within the 2.67 ms / 128-frame budget. Nothing in this plan requires a
  novel runtime claim.

## Design

### Layer 0 — `crates/dsp` (Rust → wasm32)

Owns the voice engine and the subtractive kernels. The signal path per voice:

```
OSC A ┐
OSC B ├─ MIX ─→ [drive] ─→ FILTER (nonlinear, ZDF) ─→ VCA ─→ track bus ─→ FX ─→ mix
SUB   │                         ↑          ↑            ↑
NOISE ┘                      ENV-F       LFO         ENV-A
                          (+ velocity, + keytrack, + per-voice drift)
```

**Oscillators.** PolyBLEP-corrected saw, pulse (with PWM), triangle, plus a square/octave-down sub
and a white/pink noise source. **Recommendation: PolyBLEP, not wavetables.** Wavetable+mipmap gives
better suppression but costs a table per waveform per octave band — bytes in the *data* budget,
which is precisely the axis this library is trying to win on. PolyBLEP is a handful of lines, needs
no tables, and its residual aliasing sits ~40 dB down, which the alias audit (below) will hold us
to honestly. DPW was considered and rejected: cheaper still, but its low-frequency behaviour is
poor and bass is a headline use case here.

**Filters — the personality, and the one place to spend.** A linear biquad sounds sterile and is
the single most common reason a software synth sounds cheap. Three ZDF/TPT structures, per
Zavalishin:
- **4-pole transistor ladder** with per-stage `tanh` and a nonlinear feedback path — self-oscillates,
  loses bass as resonance climbs. The classic mono-bass and lead voice.
- **2-pole state-variable** (LP/BP/HP/notch) — the brighter, more surgical personality; pads,
  stabs, sweeps.
- **Diode ladder** — the acid voice. The TB-303 sound is specifically diode-ladder squelch plus
  accent and slide, and it is not reproducible with the transistor ladder.

The nonlinearities alias, so the filter path needs **2× oversampling minimum, 4× when driven**.
This is the largest single CPU line item in the design and the main thing the first benchmark must
answer.

**And it has to be built — the inventory found no general-purpose oversampling in the sibling
repo.** What exists is three point solutions and a culture of Nyquist guards: first-order ADAA of
`tanh` on the guitar amp bus, the 11-line `poly_blep` inside the SynthPad stub, and one **private,
`f64`, 2× half-band** resampler (31-tap linear-phase FIR, Kaiser β=8, stopband ≥27 dB above 29 kHz)
buried in `wdf.rs` and used only by the 12AX7 triode on a code path that is **off by default**.
Nothing upsamples the voice bank or the master bus; there is no `Oversampler<N>` abstraction, no
polyphase resampler, no BLIT/BLAMP/minBLEP. That half-band is a tested starting point — it needs to
be made `pub` and f32-generic — but a general oversampling wrapper is **new work in M2, not a lift**,
and the plan budgets it as such.

**Analog character — the highest quality-per-byte investment in the project.** Per-voice oscillator
drift (slow bounded random walk in cents), envelope-time jitter, filter-cutoff spread, and VCA
offset. Without it, six voices in a chord phase-lock and the result sounds like a cheap plugin;
with it, the same patch breathes. It costs almost nothing in CPU and a trivial number of bytes.
This is deliberately scheduled *early* (M2, not polish) because it changes what every later patch
sounds like.

**Effects are part of the instrument, not a post-process.** This is a genuine architectural
departure from the physical library, where the body resonance lives *inside* the model. A Juno-style
pad without its BBD chorus is simply not that sound; a string-machine patch without ensemble is not
one either. So the per-track FX slot (chorus/ensemble, analog-voiced delay, drive, and a small
reverb) is **part of the patch definition**, not something the user is expected to add.

**Deferred at this layer:** SIMD (the sibling repo's #62 records that its "SoA voice bank" was
documented but never built — this plan does not repeat that claim; the bank is scalar until measured
need), per-instrument WASM splitting, threads/SharedArrayBuffer.

### Layer 1–2 — TS packages

`packages/core`, `packages/midi`, `packages/instruments` mirror the sibling repo's split and its
public API shape, so that `createEngine()` / `createTrack()` / `noteOn()` are *identical* across both
libraries. A developer who learns one has learned the other. Divergence in this API is a bug, not a
feature.

The one addition: subtractive instruments have **patch parameters worth exposing** in a way physical
models mostly do not. `PRINCIPLES` #3 ("trivial API, deep escape hatches") applies with unusual
force — cutoff, resonance, and envelope amount are the controls players actually reach for, and a
virtual-analog library that hides them has missed the point. Proposal: presets remain one-string
simple, with an optional second argument for the classic panel controls.

### Reuse — the measured inventory (2026-07-28)

| Bucket | Size | Contents |
|---|---|---|
| **Reusable as-is** | ~1,900 LOC | worklet processor (176) + `ij_*` C-ABI (147); `lib.rs` reverb, limiter, denormal flush (~470); 79 % of `core/src/index.ts` (~466); `parseMidi` (~200); generic DSP helpers in `kernels.rs` (~250); `harness_audit.py` (265); `bundle-size-audit.sh` (64) |
| **Reusable with edits** | ~5,500 LOC | engine skeleton, voice allocation, mix routing (~450); `TrackBus` *shape* (~90); WDF primitives + half-band (~470); Voice/Kernel dispatch (~85); `loop_metrics.py` + listening harness (~2,900); the blind ABX/MUSHRA web app (~620); `.github` + hooks (~292); 8 generic skills (~290) |
| **Physical-modeling-specific — do not port** | ~10,000 LOC | instrument kernels, per-family tables, `start_voice` (~7,000); Rust tests and gates (~2,800); instrument-specific render scripts (~1,000) |

The three highest-value lifts, in order:

1. **`instruments-processor.js` + the `ij_*` C-ABI pattern** (176 + 147 LOC). A complete, hardened,
   allocation-free, sample-accurate JS↔WASM audio bridge with real browser bugs already worked
   around — notably that posting a `WebAssembly.Module` is silently dropped into `messageerror` by
   Safari and headless Chromium, presenting as an engine that never becomes ready. That workaround
   alone is worth the copy.
2. **`Reverb` + `soft_clip` + `flush_denormal` + the `TrackBus` mix skeleton** (~450 LOC). A shared
   5-voicing FDN reverb that allocates once at max capacity and only rewrites lengths on
   reconfigure, plus a master limiter that is value- *and* slope-continuous at the knee.
3. **The agent-discipline harness** — `harness_audit.py`, the pre-commit hook, the issue/PR
   templates, and the 8 generic skills. Contains no audio at all.

Two corrections to the sibling's own repo map, so M0 is scoped against reality rather than the
documentation: **`packages/instruments` is an 11-line stub** (one placeholder export) and
`packages/react` is an empty README, so neither is a lift; and **Web MIDI does not exist anywhere in
the repo** — no `requestMIDIAccess` — while the note scheduler lives in `packages/core`, not
`packages/midi`. The repo map's claim that `packages/midi` owns "Note-list scheduler … and Web MIDI"
is aspirational.

### Three things not to copy

The inventory surfaced three structural mistakes worth inheriting *as constraints* rather than as
code. Each becomes a day-one rule here:

1. **The instrument id is duplicated in at least 9 places** — the Rust enum, `from_u32`, and seven
   separate JS/TS tables across `core`, `midi`, the playground, and five render scripts. Only one
   (`GROUP_TO_INSTRUMENT`) is type-enforced; the rest fail silently or fall back to marimba.
   **Rule: one source of truth, and the TS/JS tables are generated from it.** This is the single
   largest ongoing tax in the sibling repo and it is entirely avoidable.
2. **There is no `trait` for voices** — `Kernel` is a hand-dispatched enum whose variants have
   inconsistent method signatures (`damp()` vs `damp(sr)` vs `release()`; `render` takes `sr` for
   drums and not for anything else), matched at four sites in `lib.rs`, two of which have `_ => {}`
   wildcards where a missing arm is a **silent no-release bug**. **Rule: define
   `trait VoiceKernel { fn render(&mut self, out: &mut [f32], sr: f32) -> bool; fn release(&mut self, sr: f32); }`
   before the second kernel exists.**
3. **`Kernel` is `Copy` with delay lines inlined**, so `size_of::<Kernel>()` is the max over all
   variants — driven by the 2048-sample bore and pluck buffers — and 64 of those are allocated up
   front. Subtractive voices are naturally small (no per-voice delay lines; chorus and delay live in
   the track FX, not the voice), so **this library gets a much cheaper voice pool for free** — but
   only if the enum never acquires a variant with a big inline buffer. **Rule: delay memory lives on
   the track, never in the voice.**

### Bundle budget — propose **60 KB gz, not 150**

The sibling's budget is 150 KB gz for the whole library (owner amendment, 2026-07-13), and it sits
at 85.4 KB. Subtractive should not need anything like that: the primitive set is small and the
"data" is a preset table, not a bank of modal coefficients and impulse responses.

Rough projection, **explicitly an estimate to be replaced by a measurement**: the inventory puts
~10,000 of the sibling's 13.7k Rust lines in the do-not-port bucket, so the shared floor is roughly
2–3k lines, and the subtractive kernels plus oversampling should add 1–2k on top → on the order of
20–30 KB gz of WASM, plus ~11 KB gz of shared JS plumbing (measured: 5.3 core + 2.6 worklet + 2.9
MIDI), plus a preset table → **~35–45 KB gz all-in.** A 60 KB ceiling leaves real headroom and makes
a materially stronger product claim than 150.

Per `PRINCIPLES` #2, the number must be **owned by an audit script and never restated from memory**;
this paragraph is a proposal for what that script should be seeded with, not a source of truth.

### The shared-plumbing decision — the biggest call in this plan

The instrument-agnostic surface (worklet host, WASM handshake, voice/track management, event queue,
offline render, SMF/GM/Web-MIDI, audit scripts, persona panel, CI, issue templates, skills) is
genuinely common to both libraries. Three options:

| | Approach | Pro | Con |
|---|---|---|---|
| **(a)** | Copy the plumbing into the new repo | Fast; **zero risk to the imminent release** | Immediate drift; every bug fixed twice |
| **(b)** | Extract `@instrumentsjs/engine` now, both depend on it | Correct long-term | **Requires touching the frozen repo** |
| **(c)** | Merge into one monorepo | No duplication at all | Contradicts the sibling-directory structure; couples release trains |

**Recommendation: (a) now, with a committed path to (b).** The owner has frozen
`physical-instruments.js` for release, and that constraint is not negotiable against an
architectural preference. So: copy the plumbing **byte-identical wherever possible**, record its
provenance and source SHA in the licensing ledger, and **open the extraction as a tracked issue on
day one** so the eventual diff is clean and the drift is visible rather than silent. Revisit after
the sibling ships 0.1, when its API is stable enough to be depended on.

The cost of (a) that should be stated rather than glossed: a developer who installs *both* libraries
downloads two engines with duplicated mixing, limiting, and voice management. That is the price of
protecting the release, and it is the thing (b) later buys back.

### Quality regime — inherit five aspects, replace one, add one

The sibling's six-aspect matrix (`stability, headroom, tune, envelope, dynamics, voice`, run in that
dependency order) mostly transfers, but not unchanged:

| Aspect | Verdict for subtractive |
|---|---|
| **stability** | **Keep, and raise priority.** Self-oscillating nonlinear filters at high resonance genuinely blow up. This is a real failure mode here, not a hygiene check. |
| **headroom** | Keep unchanged. Resonant peaks at self-oscillation are enormous and invisible to RMS gates. |
| **tune** | Keep, narrowed — an oscillator plays the pitch you ask. But *add* checks for self-oscillation pitch, oscillator sync, and drift staying inside its bound. |
| **envelope** | Keep unchanged. Analog-exponential vs linear ADSR shape is audible and a common tell. |
| **dynamics** | **Keep, and it is more central here** — velocity→cutoff is *the* defining expressive gesture of subtractive synthesis. But reframe it: the sibling's version measures dynamics *against a reference recording*, and that framing does not survive (see Thesis). The aspect stays; its ground truth becomes the patch's own design intent. |
| **voice** | **Replace.** "Does it lead with the fundamental like the real thing" has no referent when there is no real thing. |

Replaced by two:

- **`audit-alias` (new, and the best tripwire in either library).** Sweep each oscillator and filter
  configuration across the full range and measure energy in non-harmonic bins. This is **objective,
  unambiguous, and fully automatable** — a property the physical library's quality aspects never had,
  because "does this sound like a cello" is irreducibly a judgment call. Alias suppression is a
  number. It belongs in CI as a hard gate.
- **`audit-character` (replaces `audit-voice`).** Inherits the rule that matters most from its
  predecessor — *pick one target tone and commit; never tune to the washed-out average* — and drops
  the fundamental-forward test. With curation as the product, this is the aspect that gates release.

The **dependency ordering itself is the most valuable thing being inherited**, and it transfers
unchanged: *a clipping or NaN-ing voice corrupts every timbre and dynamics number, so those come
first; tuning comes before character, because a mis-slotted note fabricates brightness.* The new
order is **stability → headroom → alias → tune → envelope → dynamics → character**, with `alias`
slotted early because inharmonic energy corrupts every spectral measurement downstream of it for
exactly the same reason clipping does.

One inherited principle deserves restating here because this library is more exposed to it than its
sibling. From `ab-compare.mjs`: *"PR #41 moved every metric it set out to move, and turned out to be
audibly nothing — 'they were very very very similar.' The difference measured 20 dB below the
signal. A metric delta is not a sound."* With curation as the product and no reference to converge
on, the temptation to let a moving number stand in for a better patch is stronger here, not weaker.

### Instrument roster

Chosen to cover what the sibling library structurally cannot, ordered by wow ÷ effort:

1. **Analog bass** — 2 osc + ladder LP + fast filter env. The workhorse; also the simplest full test of the signal path.
2. **Acid bass** — diode ladder, accent, slide. Iconic, instantly recognisable, and cheap once the diode ladder exists.
3. **Poly pad / string machine** — PWM + sub through SVF, **with chorus/ensemble in the patch**.
4. **Supersaw lead** — 7 detuned PolyBLEP saws. The single most-requested modern sound; also the main polyphony-budget stress case, at 7× oscillator cost per voice.
5. **Brass stab** — high resonance, sharp filter env, unison detune.
6. **Synth pluck / key** — short filter env; the "just give me something usable" default.
7. **Mono lead** — portamento, PWM, oscillator sync.
8. **Analog drum kit (808/909-style)** — pitched-sine kick with pitch env, noise+tone snare, bandpassed-noise hats.

**Roster note for the owner, requiring a decision and no action:** item 8 overlaps
`physical-instruments.js` draft PR **#30** ("reference-match an original-hardware 808 kit", draft
since 2026-07-12). An 808 is a *synthesis* instrument, not a physical model — its natural home is
this library. **No change to the frozen repo is proposed or implied here;** the question is simply
flagged so it is decided rather than duplicated.

### Naming — settled

**`subtractive-synthesizers.js`** (owner decision, 2026-07-28). Repo created and public at
`github.com/keunwoochoi/subtractive-synthesizers.js`; the npm name was unregistered at the time of
the decision.

The second noun changed from the sibling's, and that is load-bearing rather than cosmetic.
physical-instruments.js models **instruments** — objects that exist, which the model is trying to
be. This library ships **synthesizers** — machines whose output is not an imitation of anything.
The vocabulary should follow throughout: this repo talks about **synths, patches, and presets**, not
about instruments and families. That is not a style preference; it is the Thesis expressed in the
type names, and it keeps every future contributor from reaching for a reference recording out of
habit.

"Subtractive" is synthesist vocabulary and a web developer searching npm types "synth" — a real
discoverability cost, payable later with keywords or an alias package rather than a rename.

The `<technique>-<noun>.js` pattern also keeps future boundaries clean: **subtractive means
osc→filter→amp.** FM belongs in a third sibling, not smuggled in here. Scope protection, not a
roadmap promise.

## Phased plan

Each phase is PR-sized-or-close and gated on something measurable. Phases materialize as GitHub
issues once the repo exists; live status lives there, never in this doc.

- **M0 — Bootstrap.** Repo; Rust workspace with the toolchain pinned to an exact version (mirror
  `1.97.0` and the sibling's `lto`/`codegen-units=1`/`panic=abort`/`strip` release profile, and its
  reason: a moving `stable` channel produces different WASM bytes and breaks the byte-compare
  audit); TS workspaces on the same `tsconfig.base.json`; the three highest-value lifts copied
  byte-identical with provenance SHAs in the ledger; CI (four jobs, including the `ubuntu-22.04`
  pin — the sibling needs it for libsndfile 1.0.31, so inherit it only if the reference tooling is
  inherited too); `PRINCIPLES.md` adapted; harness skills copied and de-physical-ized.
  **Gate:** CI green on an empty build; `harness-audit` clean; **the instrument-id table is
  generated, and adding a fake instrument proves no hand-edited second copy exists.**
- **M1 — First sound.** One voice: PolyBLEP saw → ZDF ladder → ADSR, behind a real `VoiceKernel`
  trait, through the copied worklet host, playable in a minimal playground.
  **Gate:** a note sounds; `audit-alias` harness exists and reports a real number; `dsp-bench`
  reports per-voice cost against the 2.67 ms budget.
- **M2 — The primitive set + character + oversampling.** All oscillators, all three filters, 2 env +
  2 LFO, glide, unison, **per-voice drift** (deliberately here, not in polish — it changes every
  later patch), and the **general-purpose oversampling wrapper** that does not currently exist in
  either repo (seeded from `wdf.rs`'s half-band, made `pub` and f32).
  **Gate:** alias suppression ≥ target across the full range at every filter setting; no NaN or
  runaway at max resonance sustained 60 s; oversampling cost measured, not estimated.
- **M3 — The roster.** Patches 1–7. Curation-heavy; expect more iterations per patch than the DSP
  took.
  **Gate:** `audit-character` honest grade per patch; owner ear on bass, acid, and pad — the three
  with the least forgiving listeners.
- **M4 — The effects that make it.** BBD-style chorus/ensemble, analog-voiced delay, drive, small
  reverb, wired into patch definitions.
  **Gate:** the pad patch is judged by ear against the *idea* of a string machine; bundle audit still
  under budget with FX included.
- **M5 — Analog drums.** Pending the #30 owner decision above.
  **Gate:** kit sits at matched loudness with the melodic patches (BS.1770), per the sibling's
  LUFS-matching precedent.
- **M6 — Evals, playground, release candidate.** Multi-track arrangement benchmark, alias gate in
  CI, bundle audit owning the published number, playground deploy.
  **Gate:** 32 voices across ≥4 tracks ≤ 50 % of the 2.67 ms budget on M1 desktop — the sibling's
  desktop-first gate, inherited verbatim including its mobile-is-degradation-not-gate amendment.

## Deferred until demanded

FM and wavetable engines (separate siblings if ever — see Naming); MPE surface; modulation matrix
beyond the fixed routings; user-authored patch format / preset serialization; sequencer or arpeggiator
(this is an instrument library, not a groovebox — the sibling's "what we are not" list applies
unchanged); SIMD; threads/SharedArrayBuffer; per-instrument WASM splitting; the `@instrumentsjs/engine`
extraction (tracked from day one, executed after the sibling ships 0.1); React wrapper.

## Incidental finding in the frozen repo — report only, no action taken

The inventory pass turned up a defect in `physical-instruments.js` that is **not** acted on here,
since that repo is frozen. Recorded so the owner can decide before release rather than discover it
after:

`crates/dsp/src/lib.rs:769–784`, in `note_off`'s `damps` match, has **four match arms repeated
verbatim** — `Kernel::Bowed`, `Kernel::Brass`, `Kernel::Reed`, and `Kernel::Organ` each appear
twice, with visibly broken indentation across lines 775–783. It has the shape of a bad merge.

Assessment: **cosmetic, not behavioural.** The duplicates are unreachable, so release semantics are
unaffected; it compiles with `unreachable_patterns` warnings. But this is the exact match the repo
deliberately made exhaustive-with-no-wildcard so that "adding an instrument without deciding this is
a compile error" — the one place where a reviewer is meant to read the arms carefully — and it is
currently unreadable. A three-line cleanup, if the owner wants it in before the release tag.

## Open questions for the owner

1. **Shared-core timing** — accept (a)-then-(b), or is duplicated plumbing unacceptable enough to
   justify touching the frozen repo before release?
2. **The 808** — does draft PR #30 move here, stay there, or do both libraries ship a kit?
3. **Bundle ceiling** — is 60 KB gz the right ambition, or should it be tighter still?
4. **Roster order** — is supersaw (#4) actually higher priority than pad (#3)? It is the more
   requested sound and the harder budget case.
5. **Reference posture** — given no verified CC0 analog corpus exists, is "curation + owner ear +
   alias metrics" an acceptable quality regime, or is sourcing a licensed corpus worth doing first?
6. **The GM handoff** — once this library exists, should `physical-instruments.js` eventually route
   GM 80–103 and its `strings`/`voice` placeholders here instead of to the 89-line SynthPad stub?
   That is the strongest argument for the (b) shared-core extraction, since it would make the two
   libraries genuinely complementary rather than merely adjacent. **Post-release question; noted so
   it is not lost.**
