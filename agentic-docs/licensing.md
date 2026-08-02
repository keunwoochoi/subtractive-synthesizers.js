# Licensing ledger & clean-room policy

subtractive-synthesizers.js is dual-licensed **MIT OR Apache-2.0** (user's choice, Rust-ecosystem
convention). The permissive license is part of the product. This file is the single owner of porting
policy, trademark policy, and provenance.

## Clean-room policy (papers-only for copyleft)

- **Permissive sources (MIT/BSD/similar): port freely.** Every ported file gets a ledger entry below
  and a header comment naming origin + license.
- **Copyleft sources (GPL/LGPL/AGPL): NEVER open the source.** Not "read for understanding" — never
  open. Algorithms from copyleft projects are reimplemented from published papers only. If you catch
  yourself with copyleft source in context, stop, note it in the incident log, and hand the
  implementation to a fresh context that has not seen it.

## Trademark policy — the live risk in this domain

Unlike the sibling project, our porting exposure is low (the algorithms are textbook) and our
**trademark** exposure is high, because every classic subtractive sound is associated with a
protected name.

**The marks of famous synthesizers and drum machines may not be used in preset names, public API surface, demo labels, product claims, or marketing copy that implies emulation, compatibility, endorsement, or origin.** This includes but is not limited to Moog, Minimoog, Juno, Jupiter, TB-303, TR-808, TR-909, Prophet, Oberheim, OB-Xa, Solina, and JP-8000.

Factual nominative references are permitted in the README's clearly identified historical/educational section when they explain synthesis history or identify a sourced recording fact. They must not name this product, a preset, or a feature; suggest that a manufacturer is connected to the project; or claim that this engine reproduces a specific circuit. Internal design documents may continue to name hardware when discussing prior art.

**Describe our sound, never brand it.** `acid-bass`, not `303-bass`. “Ladder filter” is a technical term for a topology and is fine; a protected mark remains out of shipped sound names and product claims.

The underlying patents are not a concern: the original transistor-ladder patent (filed 1966, granted
1969) expired in the 1980s and the topology is long in the public domain.

## Approved reference sources (papers and books — reimplementation, not porting)

| Source | License / status | What we may take |
|---|---|---|
| Zavalishin, *The Art of VA Filter Design* (rev. 2.1.2, 2020) | Freely copyable in full, unmodified — verified 2026-07-28. A **book**, not source code | Topology-preserving transform / zero-delay-feedback filter design: ladder, SVF, nonlinearities, trapezoidal integration. The primary filter reference |
| Huovilainen, "Non-linear digital implementation of the Moog ladder filter" (DAFx-04) | Published paper | The tanh-per-stage nonlinear ladder model |
| Välimäki & Huovilainen, BLIT/BLEP oscillator literature | Published papers | PolyBLEP and related band-limited step corrections |
| Smith, *Physical Audio Signal Processing* (CCRMA, online) | Published | General DSP background |

## Patch design — what may be learned from, and what may not

Owner, 2026-07-29: *"I'm sure there are a lot of patches existing out there you can learn
from and take it for."* The line this project draws:

**Learned from, freely — the taxonomy.** What categories of sound a subtractive synth is
expected to cover is public knowledge and, in the case of General MIDI, a *published open
specification*: Synth Bass 1–2, Lead 1–8 (square, sawtooth, calliope, chiff, charang,
voice, fifths, bass+lead), Pad 1–8 (new age, warm, polysynth, choir, bowed, metallic,
halo, sweep), FX 1–8. Naming a patch "warm pad" or "square lead" describes a category, not
a product. The structural conventions behind those categories — a pad has a slow attack, a
pluck has none, an acid line wants a resonant lowpass and a slide — are textbook synthesis,
documented in every book on the subject.

**Not copied — parameter values from anyone's factory bank.** A specific manufacturer's
patch is a designed artifact and its parameter set is theirs. Every value in
`packages/core/src/presets.js` was chosen against this engine's own controls, which do not
map one-to-one onto any hardware anyway. If a patch here ever sounds like a famous one,
that is the taxonomy converging, not a transcription.

**Not used at all — the names of machines or their factory patches.** See the trademark
section above. Describe the sound, never the machine.

## Surveyed and NOT adopted

Recorded so these are not re-surveyed every few months.

| Thing | Verdict | Why |
|---|---|---|
| Reference corpora of analog synth multi-samples | **None usable found** (survey 2026-07-28) | No verified CC0 or CC-BY corpus exists. The analog world offers "royalty-free", which is marketing, not a license. `modularsamples.com` was the one plausible CC0 lead and **could not be verified — the site did not resolve to readable content.** Any future use requires a license check first |
| SpiegeLib (`github.com/spiegelib/spiegelib`) | **Surveyed, not adopted** | MIT-licensed Python library for *automatic synthesizer programming*; implements MFCC-based objective evaluation alongside a MUSHRA subjective class. Not adopted: it is VST/RenderMan-oriented, TensorFlow-heavy, and its purpose is **matching a target sound**, which `PRINCIPLES.md` rejects as our quality mechanism. Noted as prior art — its side-by-side objective/subjective split is mild independent support for our two-loop design |

Reference audio, if ever used for calibration spot-checks, is **scratchpad only, never committed**,
and its license is verified before use.

## Port ledger

Every ported file: `| path | origin file | origin license | date | PR | notes |`

| path | origin | license | date | PR | notes |
|---|---|---|---|---|---|
| `packages/core/worklet/processor.js` | `physical-instruments.js` `packages/core/worklet/instruments-processor.js` @ `ce671d7` | MIT OR Apache-2.0 (same owner) | 2026-07-28 | landed in `33a25e1` | Plumbing host (worklet → WASM handshake). Copied then adapted: class renamed `SubtractiveProcessor`, comments trimmed; read-path logic follows the origin. Owner decision 2026-08-02: shared-engine extraction will not happen — this copy is permanent. |
| `packages/core/src/index.js` (createEngine surface) | `physical-instruments.js` `packages/core/src/index.ts` @ `ce671d7` | MIT OR Apache-2.0 (same owner) | 2026-07-28 | landed in `33a25e1` | TS→JS rewrite of the control plane (lazy/SSR-safe `createEngine`, `wasmUrl`/`workletUrl`/`initialEvents`/offline-render contract) with the shared public API kept identical by design. Same permanent-copy decision as above. |

Plumbing lifted from `physical-instruments.js` (same owner, MIT OR Apache-2.0) is recorded here with
its exact source SHA so provenance is visible; with the owner's 2026-08-02 decision that no shared
engine will ever be extracted, the "clean diff for a later extraction" purpose of these rows is moot.

## Incident log

_(none)_
