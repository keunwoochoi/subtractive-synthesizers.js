# Shared-engine decision: packages stay separate, duplication is permanent

Date: 2026-08-02
Status: accepted — records the owner's call on the shared-engine extraction, fulfilling the day-one
tracking promise of `agentic-docs/design/2026-07-28-architecture.md` (§ "The shared-plumbing
decision"). **Authorizes nothing.** No code change follows; the decision is that no extraction
happens. Supersedes the "committed path to (b)" wording in the architecture doc. The sibling's
tracking vehicle is `keunwoochoi/physical-instruments.js#103`, whose staged-(b) draft this decision
also rejects.

## Decision

Owner, verbatim, 2026-08-02:

> I've never wanted to do this. My 100% conviction intention is to keep every package separate. It's
> okay to have a hard copy, cloned and duplicate code across different packages. Completely fine.

This is option **(a) from the architecture doc, chosen permanently** — not "now, with a path to
(b)". The shared engine will not be extracted into a common package. Cross-package duplication is
the design, not drift to be reconciled.

## Motivation

- The architecture doc committed to "copy the plumbing byte-identical wherever possible, record its
  provenance and source SHA in the licensing ledger, and open the extraction as a tracked issue on
  day one," with a revisit conditioned on the sibling shipping 0.1. That condition is met; the
  revisit has happened.
- The sibling's staged-(b) draft (via `physical-instruments.js#103`) presented extraction as the
  recommended long-term state. The owner's call rejects the premise that duplication is a cost to be
  repaid.

## What this means

- No `@instrumentsjs/engine` (or any shared package) is planned. **Do not propose extraction again.**
- New siblings copy the plumbing (per `_knowledge-base/02-common-architecture.md`) and ship it as
  their own package. Divergence between copies is expected and acceptable.
- The architecture doc's stated cost — a developer installing both libraries downloads two engines —
  is accepted explicitly and consciously.
- Provenance in licensing ledgers is still recorded (license hygiene is absolute); its "clean diff
  for a later extraction" purpose is moot.

## Recording

- `PRINCIPLES.md` amendment 1.5.0 and `agentic-docs/amendments.md` — constitutional home.
- `agentic-docs/licensing.md` port ledger — provenance + source SHA of the copied plumbing.
- `_knowledge-base/08-owner-taste.md` — family-wide owner-taste record.

## Open questions

None. This closes the shared-engine question for this repo.
