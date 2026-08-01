# Release standard for 0.1.0

Date: 2026-07-29
Status: **active release criteria; publication approval remains separate.**

Owns: the durable meaning of "shippable" for the first public package. This document deliberately does not contain a point-in-time checklist: live status belongs to GitHub issues, generated documentation, CI, and `scripts/release/check-release-ready.sh`.

## The bar, in one sentence

**A web developer runs `npm install`, writes the documented quickstart, and hears a synthesizer in a project we did not configure for them.** Every criterion below either makes that sentence true or proves it remains true.

## A. Install and first sound

The packed tarball must install into an empty consumer project, resolve its own worklet and WASM, and produce finite, non-silent, non-clipping audio without copied assets or package-specific configuration.

The publishable package must contain its declarations, README, both license texts, JavaScript entry points, and WASM while excluding the repository source tree and harness. `scripts/dev/install-check.mjs` exercises the installed tarball rather than source-relative paths, and `scripts/release/check-release-ready.sh` inspects the dry-pack manifest.

The worklet remains inlined because an AudioWorklet needs a runtime URL that bundlers commonly transform. The WASM remains a separate emitted asset because `new URL(..., import.meta.url)` is supported by the target bundlers and avoids the measured cost of base64 inlining. Both URLs remain overridable for non-standard hosting.

## B. Bundler compatibility

Vite, webpack, and Next must build the installed package with no library-specific configuration, serve the built output, and make audio from that output. An SSR build must be able to import the package without evaluating browser globals.

`scripts/dev/bundler-check.mjs` is the blocking proof. One representative bundler is insufficient because its first multi-bundler run found a dead source-tree URL that Vite ignored and webpack resolved eagerly.

## C. Browser coverage

The source demo, installed tarball, and README quickstart must run in Chromium and Playwright WebKit. WebKit is blocking because Safari audio lifecycle behavior differs materially, including suspended and `interrupted` context states. Firefox is desirable but is not a first-release blocker until it becomes an explicit target in the release script.

The package checks must select browser-specific launch options rather than assuming a Chromium flag is accepted by WebKit. The exact browser matrix lives in CI and `scripts/release/check-release-ready.sh --full`, not in a manually maintained status table.

## D. Public API, metadata, and types

The first-release surface is `createEngine`, `Engine`, scheduled events, `PARAMETERS`/`PARAM`/`SHAPE`/`FILTER`, and `PRESETS`/`DEFAULTS`/`applyPreset`. Additions require a compatibility decision because consumers may retain any exported name after the first release.

Every public parameter id, preset-reset default, supported range, increment, unit, and enum value must have one editable source. Runtime constants, preset defaults, TypeScript declarations, playground controls, and README tables derive from that source and fail CI when they drift.

Declarations must compile under a strict TypeScript consumer after the tarball is installed. Preset parameter names must use `ParamName`, and `applyPreset` must accept the public `Engine` type rather than widening those contracts to `string` or `unknown`.

## E. Quality gates

The shipped DSP must continue to pass analytic oscillator and filter checks, engine stability and headroom checks, patch-bank stability, loudness and distinctness checks, the audio-thread budget, and the bundle ceiling. The harness must grade buffers returned by the DSP, use worst-case sweeps where specified, and reject its deliberate cheats and broken fixtures.

No automated result is a taste decision. A sound-changing change still requires the blind listening evidence and verbal reason defined by the constitution.

## F. Documentation

The npm README must begin with honest release status, an install command, and an executed quickstart, then cover the live demo, current features and patch bank, compatibility, lifecycle, public API, parameter metadata, and known limits.

The quickstart source is executed against the packed and installed package and generated into the README. Derived counts, measurements, API tables, parameter tables, and release status are generated from their owners. Package-page links and assets must use absolute URLs or refer only to files included in the tarball.

A final-version manifest must fail the release check if the staged README still contains pre-alpha, draft-only, or stale registry-unavailability language. Version changes are not allowed to depend on someone remembering to rewrite prose.

## G. Legal and naming

Both license texts must ship in the tarball. Public API, presets, demos, package metadata, and marketing documentation must pass the protected-name sweep. Design documents may discuss prior art where the licensing ledger permits it; shipped surfaces describe the sound rather than the machine.

## H. Release mechanics and authority

A release candidate must have a clean tree, a release-version/changelog match, no conflicting tag, repository-owner GitHub identity, exact-SHA green `ci.yml`, an inspected dry-pack manifest, and every fast and full release gate green. `scripts/release/check-release-ready.sh --full` prints the remaining human steps but never tags, publishes, or creates a GitHub release.

The npm publish and GitHub release authority gates remain off until the owner explicitly lifts them. A passing readiness check proves that the artifact could ship; it is not permission to ship and does not assert that a registry upload happened.

## Explicitly outside the first release

- MIDI file playback and Web MIDI input.
- A React wrapper.
- Preset serialization or a user patch-file format.
- A high-level offline bounce API beyond the documented `OfflineAudioContext` path.
- Separate patch-level routing for individual state-variable-filter outputs.
- Mobile performance tiers.
- A shared engine extraction with the sibling project.

## Taste sign-off

Owner, 2026-07-29, having played the bank: *"i checked out the patches. actually they sound good."*

That judgment is the release's taste evidence. The numeric gates prove that the implementation does what it was told; they do not replace the owner's decision that the result is worth publishing.
