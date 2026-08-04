<!--
Draft by default. Link the issue.
-->

Closes #

## What this changes

## Release impact

<!-- Does this change what a user installs? The published surface is `packages/core/`, `crates/`,
     and the root README and licences; everything else ships with nothing.
       none   nothing a user could observe — harness, CI, docs, playground, internal refactor
       patch  a fix, or behaviour a user notices, with no API change
       minor  new API, new patch, new capability (below 1.0 this is also where breaking goes)
       major  breaking, once 1.0 has shipped
     Anything but `none` writes its entry under `## [Unreleased]` in CHANGELOG.md in THIS PR.
     This is a proposal about the next release; publishing stays behind the authority gate.
     Checked by `npm run check:release-impact`. -->

Release-Impact: <none|patch|minor|major> — <one line: what a user would notice>

## Validation

<!-- Every number names the SHA it was measured at. Evidence from a dirty tree is not evidence. -->

| Gate | Result | Measured at SHA |
|---|---|---|
| `npm run audit:harness` | | |
| `npm run audit:bundle` | | |

## Did this change how anything sounds?

<!-- If yes, metrics alone do not finish it (PRINCIPLES: a metric delta is not a sound).
     Give the blind-comparison result and the VERBAL reason, plus the variant you rejected. -->

- [ ] No — nothing audible changed.
- [ ] Yes — blind comparison result, verbal reason, and rejected variant below.

## Agentic process trace

| | |
|---|---|
| What was specified vs delegated | |
| What caught the error | |
| **Abandoned / wasted routes** | <!-- the row that is unrecoverable from the diff. Do not leave blank. --> |
| Cost (CPU / memory / bundle) | |
