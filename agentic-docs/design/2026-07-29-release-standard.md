# Release standard for 0.1.0, and the measured gaps

Date: 2026-07-29
Status: **draft — owner review required.** Owner: *"what do you say the standard should be
for the first release? Define areas, identify those gaps, and I want you to work on that
immediately."*

Owns: what "shippable" means for 0.1.0, and the honest state of each area today. Every
status below is measured, not estimated; where something is untested it says untested
rather than guessing.

## The bar, in one sentence

**A web developer runs `npm install`, writes three lines, and hears a synthesizer — in a
project we did not configure for them.** Everything below exists to make that sentence
true or to prove it is.

## Areas

### A. Install and first sound — **THE release gate**

`npm install` → import → `noteOn()`. No bundler config, no copying files, no telling the
library where its own WASM lives.

**Status: the promise is currently FALSE.** Measured today:

| | |
|---|---|
| `packages/core/package.json` | **missing** — there is no publishable package |
| `dist/` | **missing** |
| TypeScript declarations | **0 files** |
| `createEngine()` signature | requires the caller to pass `wasmUrl` **and** `workletUrl` |

The README's headline is a claim about software that does not exist yet. This is the
single largest gap and everything else is secondary to it.

**Design, chosen by measurement rather than preference:**

| option | raw | gzipped |
|---|---:|---:|
| WASM as a separate file (today) | 72,042 | 28,317 |
| WASM inlined as base64 | 96,056 | 39,060 |
| **penalty for inlining the WASM** | **+24,014** | **+10,743** |
| worklet as a separate file (today) | 4,616 | 1,873 |
| **penalty for inlining the worklet** | **+40** | **+40** |

So: **inline the worklet, do not inline the WASM.**

The worklet is the harder zero-config problem — `audioWorklet.addModule()` needs a real
URL, and bundlers transform or rename a worklet file that is imported like a module.
Inlining it as a string and constructing a Blob URL sidesteps every bundler for 40 bytes.

The WASM resolves through `new URL("./x.wasm", import.meta.url)`, which Vite, webpack 5
and Rollup all understand natively, with an override for anyone who serves it elsewhere.
Inlining it would cost 38 % of the whole budget to serve a case the override already
covers — but a secondary `/inline` entry point is worth offering to anyone who wants zero
HTTP requests, since that is a real deployment constraint and not a hypothetical one.

### B. Bundler compatibility

Vite, webpack, and Next must work with **no configuration**. `PRINCIPLES` #6: "zero-config
or it doesn't ship."

**Status: untested. Zero bundler fixtures exist.** An assertion in a README is not a
result; this needs a fixture per bundler that actually builds and runs.

### C. Browser coverage

**Status: Chromium only.** Nine references in CI and the dev scripts, all Chromium; no
WebKit, no Firefox.

That is a real hole against a stated principle — iOS Safari is named in `PRINCIPLES` #6,
and Safari is where audio APIs most often differ (the context starts suspended, the sample
rate is frequently locked to 44.1 kHz, and `WebAssembly.Module` cloning misbehaves, which
is why the worklet already compiles from bytes). WebKit must be green before release.
Firefox is desirable, not blocking.

### D. Public API and types

**Status: no declarations, and the API is not frozen.**

For 0.1.0 the surface should be small enough to keep: `createEngine`, the engine handle,
`PARAM`, `PRESETS`/`applyPreset`. Hand-written `.d.ts` is appropriate — the source is
plain JS and a build step that exists only to emit types is a build step that can break.

### E. Quality gates

**Status: green, and the strongest area.** Alias against the analytic prototype, filter
response shapes, engine stability and headroom, the patch bank (stability, loudness match
within 6.7 dB, mutual distinctness), the audio-thread budget, and the bundle ceiling all
run in CI, and every one of them has been observed failing on the defect it exists for.

No new work required for release. Its job now is to not regress.

### F. Documentation

**Status: partial.** The README exists and its numbers are generated. Missing: an API
reference, and a quickstart that is **executed** rather than written — a copy-pasteable
snippet nobody has run is a bug report waiting.

### G. Legal

**Status: mostly done, one sweep outstanding.** Dual MIT/Apache-2.0 files present, the
licensing ledger records porting and trademark policy, and the patch-design position was
recorded before the bank was written. Outstanding: an automated sweep proving no protected
name appears in any of the 36 patch names, labels, or blurbs. The rule exists; nothing
enforces it.

### H. Release mechanics

**Status: absent.** No version, no changelog, no tag. `npm publish` stays behind its
authority gate and is not lifted by this document.

## Order of work

Strictly by "does it block the sentence at the top":

1. **A** — make the package real. Nothing else matters if `npm install` does not work.
2. **G** — the trademark sweep, because it is cheap and it gates publishing.
3. **D** — types and a frozen surface, which B and F both build on.
4. **B** — bundler fixtures that build for real.
5. **C** — WebKit in CI.
6. **F** — an executed quickstart.
7. **H** — version, changelog, tag.

## Explicitly NOT in 0.1.0

Named so the scope cannot creep during the work: MIDI file playback, Web MIDI input, a
React wrapper, presets serialisation or a user patch format, offline bounce as a public
API, the SVF's band/high outputs as separate patch-level routings, mobile performance
tiers, and the `@instrumentsjs/engine` extraction shared with the sibling project.

## The honest limit on any release claim

Every gate in area E measures whether the engine does what it was told. **None of them
measures whether the 36 patches sound good**, and no automated check ever will. A release
is the owner's call on that, and this document does not pretend otherwise.
