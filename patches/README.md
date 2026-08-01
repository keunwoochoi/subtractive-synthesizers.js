# Patches

One directory per implemented preset, with the directory name, `# Patch intent:` heading, and `Preset:` field all equal to the exported preset id. `scripts/verify/check_intents.py` evaluates the actual `PRESETS` export and rejects missing, orphaned, duplicate, or mismatched mappings.

## Historical provenance

`Provenance: prior` means Git history proves the intent artifact was committed before the preset first appeared. `Provenance: retrospective` means the target was reconstructed from an already tuned patch and must contain the explicit statement that it did not guide the original tuning. Retrospective provenance is restricted to presets that existed at the immutable migration cutoff in the checker; a future preset cannot opt into that exception.

The `acid` intent is the only current artifact that predates its implementation. It began under the working id `acid-bass`, while the implementation exported `acid`; its `Prior path:` field preserves that history while the current directory and mapping use the real exported id. The other current artifacts are honest retrospective migration baselines, not retroactive claims of a prior process.

## Future patch workflow

1. Add `patches/<id>/intent.md` with `Status: proposed` and `Provenance: prior`, then commit it without preset parameters.
2. Tune the patch in a later commit, export the same id from `PRESETS`, and change the artifact to `Status: implemented`.
3. The checker proves that the first intent commit is a strict ancestor of the first preset commit. An intent and implementation introduced together fail, as does a new `Provenance: retrospective` claim.

A well-formed proposed artifact is a deliberate pre-implementation state, not an orphan. An implemented artifact with no matching export is an orphan and fails.

## Why the intent comes first

With no reference recording to converge on, tuning drifts forever and every stopping point is defensible after the fact. A prior intent is the only thing that lets a result be wrong, which is the only thing that lets the work finish.

It also converts judgments into measurements. Every measurable target must name the phrase of prose it derives from, so the chain from taste to number stays auditable and nobody can quietly invent a target the description never implied.

## Amending

Amend openly, in the same file, with a reason. If the finished patch is better than its intent, say so and change the intent. Silent drift is the failure mode; amendment is not.
