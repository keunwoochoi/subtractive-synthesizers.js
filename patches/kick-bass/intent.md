# Patch intent: kick-bass

Preset: `kick-bass`
Status: implemented
Provenance: retrospective
Reconstructed: 2026-08-01.

## Historical provenance

This record was reconstructed after implementation and did not guide the original tuning. It describes the already tuned preset as an explicit migration baseline; it must not be cited as evidence that the target preceded the parameters.

## For

Bass lines that need a deliberate low-register identity rather than a neutral utility voice.

## In words

Pitch drops into the note. Percussive enough to be a drum. This wording is reconstructed from the shipped patch metadata. The current implementation is the retrospective baseline: it must remain stable, audible, and distinguishable from every other exported preset.

## The one committed target

Preserve the specific “Pitch drops into the note. Percussive enough to be a drum.” character rather than smoothing it into a general-purpose bass sound; a broader but less recognizable version loses.

## Measurable targets

| # | Target | From which phrase |
|---|---|---|
| 1 | The fixed bank render passes the finite-sample and headroom gates owned by `scripts/verify/check_patches.mjs` | “stable” |
| 2 | The fixed bank render remains above the audibility floor owned by `scripts/verify/check_patches.mjs` | “audible” |
| 3 | The render fingerprint remains beyond the bank distinctness floor owned by `scripts/verify/check_patches.mjs` | “distinguishable from every other exported preset” |
