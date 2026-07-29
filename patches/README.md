# Patches

One directory per patch. **`intent.md` is written before any parameter is tuned** — that
is `PRINCIPLES.md` #2, and `scripts/verify/check_intents.py` enforces it.

A patch directory may contain an intent with no implementation. That is the normal early
state, not an omission: the target is supposed to exist first. The reverse — an
implementation with no intent — is a hard audit failure.

## Why the intent comes first

With no reference recording to converge on, tuning drifts forever and every stopping
point is defensible after the fact. An intent written first is the only thing that lets
a result be **wrong**, which is the only thing that lets the work finish.

It also converts judgments into measurements. Every measurable target must name the
phrase of prose it derives from, so the chain from taste to number stays auditable and
nobody can quietly invent a target the description never implied.

## Amending

Amend openly, in the same file, with a reason. If the finished patch is better than its
intent, say so and change the intent. **Silent drift is the failure mode; amendment is
not.**
