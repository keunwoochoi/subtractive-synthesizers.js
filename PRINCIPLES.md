# PRINCIPLES

> Nothing here changes casually. This is the constitution; `AGENTS.md` routes, this file governs.
> Amendments are dated, quote the owner verbatim, and say what was wrong with the rule they replace.

## Mission

subtractive-synthesizers.js gives every web developer a real analog synthesizer that runs in the
browser, computed on the fly, in tens of kilobytes. `npm install` → an analog bass, an acid line, a
supersaw, a string-machine pad. No samples, no CDN, works offline, one `noteOn()` call.

It is the second library in the `sets-of-instruments-js` family. `physical-instruments.js` models
instruments that exist. **This one ships synthesizers, whose output imitates nothing.** That
distinction is not branding; it determines how we verify our work, and it is the reason
`agentic-docs/design/2026-07-28-verification-and-harness.md` exists.

## Product principles (ordered)

1. **Curation is the product.** A sawtooth through a resonant lowpass is not an imitation of
   anything — it is the sound itself. There is no reference recording we are failing to match, and
   therefore no correctness result that will ever make a patch *good*. What makes this library worth
   installing is that someone with taste chose these eight patches and committed to them. The DSP is
   table stakes; the choosing is the work.

   Consequence, inherited from the sibling's `audit-voice` and promoted here to product law:
   **pick one target tone and commit — never tune to the washed-out average.** A patch that offends
   nobody has failed.

2. **Write the target down before you tune it.** Every patch gets an intent statement — prose plus
   three to five measurable targets derived from that prose — **before** any parameter is touched.
   Without a target written first, tuning drifts forever and every stopping point is defensible in
   hindsight. The intent is what lets us be *wrong*, which is the only thing that lets us finish.
   Amend an intent in the open, with a reason. Never drift silently.

3. **Tiny and self-contained.** No sample downloads, no CDN dependencies, no network at play time.
   Bundle size is a product feature with a budget, owned by `scripts/audit/bundle-size-audit.sh`,
   which fails CI on breach. **Never restate the number from memory** — cite the script.

   The ceiling is deliberately far tighter than the sibling's 150 KB, because the subtractive
   primitive set is small and the "data" is a preset table rather than banks of modal coefficients.
   Generosity we do not need is headroom we will spend badly.

4. **Trivial API, deep escape hatches — and here the escape hatches matter more.** A web developer
   plays a note in three lines. But cutoff, resonance, and envelope amount are the controls players
   actually reach for, and a virtual-analog library that hides them behind presets has missed the
   point of virtual analog. Presets stay one string simple; the panel is one argument away.

5. **Arrangements, not solo demos.** Multiple tracks with different patches play simultaneously and
   smoothly through one shared engine. The performance budget, the API, and the evals are defined on
   a full multi-track arrangement — one that contains the expensive patch by construction, not an
   average of cheap ones.

6. **Works where web devs work.** Vite, Next, Webpack, iOS Safari — zero-config or it doesn't ship.
   Single-threaded by design: no COOP/COEP demands on anyone's deployment.

## Engineering principles

- **Fidelity to specification, not to a recording.** This is the structural difference from
  `physical-instruments.js` and the reason our CI can be stronger than its. A ladder filter is a
  discretization of a known transfer function; an ideal saw has harmonics at *k·f₀* with amplitude
  ∝ 1/*k*; an envelope has declared times. We do not need a reference recording because we have a
  reference **equation** — which has no room, no microphone, no performer, no license, and no
  sampling error. Everything with a closed form is verified against it, automatically, on every
  commit.

- **Reference-corpus convergence is a non-goal.** Not deferred — rejected, on two independent
  grounds. Structurally, we are not trying to *be* a Juno, and the trademark position means we could
  not say so if we were. Logistically, a survey (2026-07-28) found no verified CC0 or CC-BY corpus
  of analog synth multi-samples; "royalty-free" is marketing, not a license. Hardware recordings
  remain useful as **calibration spot-checks, never convergence targets** — scratchpad only, never
  committed, license verified before use. This principle exists so no future session rebuilds the
  sibling's reference loop out of habit.

- **A metric delta is not a sound.** Inherited verbatim from the sibling's hardest-won lesson: a PR
  there moved every metric it set out to move and turned out to be audibly nothing, with the
  difference sitting 20 dB below the signal. That warning binds harder here, because we have less
  anchoring, not more. **No change that affects how a patch sounds ships on measurements alone** —
  the analytic and spec-relative tiers are necessary and never sufficient, and the commit says which
  listening decided it.

- **Eval before trust.** Blind and order-randomized, always — it is cheap and it removes expectation
  bias. The verbal reason for a pick is the recorded output, not the parameter value: the parameter
  is recoverable from the diff, the reason is not. Rejected variants are recorded too.

- **Every patch is held to the quality matrix**, run in dependency order:
  **stability → headroom → alias → tune → envelope → dynamics → character.** A NaN-ing or clipping
  voice corrupts every downstream number; inharmonic energy corrupts every spectral measurement for
  the same reason; a mis-slotted note fabricates brightness. Alias sits early because it is the one
  aspect with a fully objective answer, and because it is the aspect a subtractive synth most
  commonly fails.

- **The audio thread is sacred.** Allocation-free, lock-free, GC-free, denormal-flushed. Violations
  are bugs even when inaudible today.

- **Degradation is acceptable; corruption is not.** Under load we shed voices gracefully. We never
  glitch, crackle, or go silent without a diagnostic.

- **No silent errors, no silent fallbacks.** Loud on failure, silent on success. A lookup that
  quietly falls back to a default is a bug we inherited the taste to hate.

- **Generate, never duplicate.** A fact that appears in two hand-maintained places will disagree.
  The sibling hand-maintains its instrument id in nine places, one of them type-enforced; that is
  the single largest ongoing tax in that repo and it is entirely avoidable. One source, generated
  outward, proven by a test.

- **Docs are checked, not trusted.** Every number in a document names the script that owns it;
  unmarked numbers fail the harness audit. Structural claims about the repo are verified against the
  tree. Directories that exist are populated — intent goes in an issue, never in an empty folder.

- **Simplicity first, surgical changes.** The smallest implementation that meets the bar. Fight
  entropy in docs and code alike.

- **License hygiene is absolute.** Permissive license is part of the product. Port MIT/BSD freely
  with ledger entries; never open GPL/LGPL/AGPL source — papers-only reimplementation. Trademarks
  are the live risk in this domain: the marks of famous synthesizers may not name presets or appear
  in marketing copy. Describe the sound, never the machine.

## What we are not

- Not a DAW, not a sequencer, not an arpeggiator, not a groovebox.
- Not a sampler, soundfont player, or sample-based anything.
- Not an emulation of any specific hardware synthesizer, and not marketed as one.
- Not a VST/plugin host or exporter (browser only).
- Not a modular environment or a patching language — the signal path is fixed and curated.
- Not an FM or wavetable engine. **Subtractive means osc→filter→amp.** Other techniques are other
  siblings.

## Amendments

_(none yet — the first amendment records an owner decision that changes a rule above, with the
verbatim quote, the date, and what was wrong with the rule it replaces.)_
