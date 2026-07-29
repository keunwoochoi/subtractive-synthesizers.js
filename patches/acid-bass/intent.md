# Patch intent: acid-bass

Status: intent only — no implementation yet.
Written: 2026-07-28. Amended: never.

## For

Driving sixteenth-note basslines. The sound everyone recognises, without naming the
machine on the tin (see `agentic-docs/licensing.md` — trademarks are the live risk).

## In words

Squelchy and aggressive. **The filter is the instrument** — when resonance is up, the
resonant peak should be more prominent than the fundamental. Dies fast and dry: no tail,
no reverb. Sits low, and cuts through a mix without being turned up.

## The one committed target

The aggressive end. If forced to choose between "smooth and usable across many genres"
and "unmistakably acid", choose acid. **A version of this patch that offends nobody has
failed.**

## Measurable targets

| # | Target | From which phrase |
|---|---|---|
| 1 | Amplitude decays to −60 dB within 400 ms at the default envelope | "dies fast and dry" |
| 2 | At resonance ≥ 0.8, the spectral peak at f_c exceeds the f₀ partial by ≥ 6 dB | "the filter is the instrument" |
| 3 | Spectral centroid rises ≥ 1.5× from velocity 40 → 110 | accent behaviour |
| 4 | At MIDI 36, ≥ 70 % of energy sits between 40–120 Hz | "sits low" |
| 5 | Alias energy meets the Tier-1 gate with resonance **and** drive at maximum | the hardest alias case this patch can produce |

## Notes

Target 5 exists because writing this down forced the question *"what is this patch's
worst alias case?"* before any DSP was written, rather than after a listener noticed
something fizzing. That is the intent statement doing its job.
