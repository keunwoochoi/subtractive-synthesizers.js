<p align="center">
  <img src="assets/logo/logo-256.png" width="140" alt="subtractive-synthesizers.js — [-] tile-mosaic logo">
</p>

# subtractive-synthesizers.js

A subtractive synthesizer for the browser. All sound is computed at runtime in an
AudioWorklet; the package contains no audio samples and makes no network requests.

> **Status: pre-alpha**, not yet published to npm. Currently implemented: an
> antialiased oscillator, a zero-delay-feedback ladder filter with per-voice
> analog drift, and 16-voice polyphony, in one AudioWorklet.

## Demo

- **<https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/showcase.html>** — showcase: plays the patch bank
- **<https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/index.html>** — playground: parameter panel and keyboard

Served by GitHub Pages from `main`. To run locally instead:

```sh
cargo build -p subtractive-dsp --target wasm32-unknown-unknown --release
scripts/dev/serve.sh start   # same pages at http://127.0.0.1:8291/, stop with serve.sh stop
```

<!-- generated:quickstart -->
```js
import { createEngine } from "subtractive-synthesizers.js";
import { applyPreset } from "subtractive-synthesizers.js/presets";

const engine = await createEngine();   // resolves its own WASM and worklet
applyPreset(engine, "supersaw");
engine.noteOn(60, 0.9);
```
<!-- /generated:quickstart -->

The worklet is inlined and served from a Blob URL, and the WASM resolves through
`new URL(..., import.meta.url)`, so Vite, webpack 5 and Rollup handle the package
without configuration. Three checks back this up: `scripts/dev/install-check.mjs`
packs the package, installs it into a clean project and renders sound from it
(every other check runs against the source tree, where paths line up regardless);
the snippet above is generated from `examples/quickstart.js`, which
`scripts/verify/check_quickstart.mjs` runs against the installed package on every
CI build; and `scripts/dev/bundler-check.mjs` builds the library inside Vite,
webpack and Next apps.

Second library in the `sets-of-instruments-js` family.
[`physical-instruments.js`](https://github.com/keunwoochoi/physical-instruments.js) models
acoustic instruments and is evaluated against recordings of them. A subtractive
synthesizer has no acoustic reference, so this repository verifies against
closed-form specifications instead — see [Verification](#verification).

## API

<!-- generated:api -->
**`createEngine(options?)` → `Promise<Engine>`**

| option | meaning |
|---|---|
| `wasmUrl?: string \| URL` | Override where the WASM is fetched from. Defaults to the packaged asset. |
| `workletUrl?: string \| URL` | Override the worklet module URL. Defaults to inlined source via a Blob URL. |
| `context?: BaseAudioContext` | Supply your own context — required for an OfflineAudioContext render. |
| `initialEvents?: ScheduledEvent[]` | Events applied at node construction. Required for offline rendering: an OfflineAudioContext can finish rendering without ever servicing the message port. |

**`Engine`**

| member | meaning |
|---|---|
| `readonly context: BaseAudioContext` | The context the engine was created on — yours, or one it made. |
| `readonly node: AudioWorkletNode` | The engine's output node, already connected to the destination. Tap it for meters or your own effects chain. |
| `readonly voices: number` | Voices currently sounding. Updated ~10 times a second. |
| `onStats?: (stats: { voices: number }) => void` | Called with engine stats as they arrive. |
| `resume(): Promise<void>` | Resume a context the browser suspended. Safe to call from any user gesture. |
| `noteOn(note: number, vel?: number): void` | Start a note now. `note` is MIDI (60 = middle C), `vel` is 0..1. |
| `noteOff(note: number): void` | Release a note now; its amp release still rings out. |
| `allOff(): void` | Release every sounding note, tails intact. |
| `schedule(events: ScheduledEvent[]): void` | Queue events at absolute context times; applied on the exact frame. |
| `clear(): void` | Drop everything pending and silence. |
| `setParam(name: ParamName, value: number): void` | Set one patch parameter, effective on the next block. |

`PARAM` names 47 patch parameters, `SHAPE` the 3 waveforms and `FILTER` the 6 filter types. The authoritative list is [`index.d.ts`](packages/core/src/index.d.ts), which this table is generated from.
<!-- /generated:api -->

## Size

<!-- generated:bundle -->
| artifact | raw | gzipped |
|---|---:|---:|
| `packages/core/wasm/subtractive_dsp.wasm` | 76,064 B | 30,122 B |
| `packages/core/src/index.js` | 5,178 B | 2,474 B |
| `packages/core/worklet/processor.js` | 4,977 B | 1,991 B |
| **total** | | **34,587 B (33.8 KB)** |

Budget is 60 KB gzipped for the whole library — currently **56%**.
<!-- /generated:bundle -->

## Cost

<!-- generated:bench -->
| | |
|---|---|
| voices in the reference arrangement | 16 (pad + bass + lead, chorus on) |
| audio-thread budget used | **13.3 %** of the 2.667 ms / 128-frame budget |
| real-time factor | 7.5x |
<!-- /generated:bench -->

Measured on the machine that regenerated this table, with the voice pool saturated and
the chorus on — the worst case this build can produce. Figures for other devices,
including mobile, are not claimed.

## Verification

An ideal sawtooth has harmonics at *k·f₀* with amplitude ∝ 1/*k*; a ladder filter is a
discretization of a known transfer function. Both have closed-form specifications, so
oscillators are graded analytically rather than against reference recordings.

Every oscillator is graded against that prototype, worst-case across a grid, on a
hidden set of frequencies and sample rates it was never tuned against:

<!-- generated:verdicts -->
| candidate | alias dB | harmonic err | verdict |
|---|---:|---:|---|
| `wasm_saw` | -31.4 | 2.7 | **PASS** |
| `wasm_saw_1x` | -27.0 | 3.8 | **PASS** |
| `polyblep_saw` | -27.0 | 3.8 | **PASS** |
| `naive_saw` | -11.5 | 0.8 | REJECT |
| `cheat_silence` | inf | inf | REJECT |
| `cheat_pure_sine` | -57.9 | 62.6 | REJECT |
| `cheat_brickwall` | -17.8 | 62.6 | REJECT |
| `cheat_special_cased` | -11.5 | 0.8 | REJECT (passed visible) |
<!-- /generated:verdicts -->

`wasm_saw` is the shipped artifact. The rest is scaffolding, including four cheats
written before any DSP existed: every gate has a degenerate optimum, and asserting that
the gate rejects a candidate built to game it is the check that the gate measures what
was intended.

Two of them justify the design. `cheat_pure_sine` has the best alias suppression of any
candidate — a gate on alias energy alone would rank it first; it is caught only by
harmonic structure, which is why the two metrics are paired. `cheat_special_cased` is
correct on the published grid and naive everywhere else; it passes the visible grid
outright and is caught only by the hidden one.

### Measured alias suppression

<!-- generated:alias-table -->
| f0 (Hz) | naive ramp | PolyBLEP | gain |
|---:|---:|---:|---:|
| 55 | -28.9 dB | -44.5 dB | +15.7 dB |
| 110 | -25.7 dB | -41.7 dB | +16.0 dB |
| 220 | -22.6 dB | -38.7 dB | +16.1 dB |
| 440 | -19.6 dB | -35.5 dB | +15.9 dB |
| 880 | -16.6 dB | -32.7 dB | +16.1 dB |
| 1760 | -13.5 dB | -28.9 dB | +15.4 dB |
| 2200 | -12.4 dB | -27.0 dB | +14.7 dB |
<!-- /generated:alias-table -->

PolyBLEP gives a consistent ~16 dB over a raw phase ramp and degrades with pitch. This
is a known limit: the upper register needs oversampling before the gate can be
tightened.

## Patches

Every exported preset is bound to exactly one checked intent artifact. Historical provenance is explicit: `prior` means Git history proves the intent predates implementation, while `retrospective` means the artifact was reconstructed from an already tuned patch and did not guide its original tuning. New presets cannot use the frozen retrospective migration exception.

<!-- generated:intent-coverage -->
| intent coverage | count |
|---|---:|
| exported presets | 41 |
| exactly mapped implemented intents | 41 |
| written before implementation | 1 |
| reconstructed after implementation | 40 |
| proposed before implementation | 0 |
<!-- /generated:intent-coverage -->

<!-- generated:roster -->
| group | patches |
|---|---:|
| pad | 12 |
| lead | 10 |
| pluck | 8 |
| bass | 7 |
| brass | 4 |
| **total** | **41** |
<!-- /generated:roster -->

## Harness

<!-- generated:harness-stats -->
| | |
|---|---|
| harness audit assertions | 25 |
| fail-correctly tests | 21 |
| deliberately-broken fixtures | 8 |
<!-- /generated:harness-stats -->

Rules here are enforced as hooks, generated artifacts, or failing tests rather than
prose. That includes the requirement that the harness itself be shown to fail:
deliberately broken fixtures that every gate is asserted to reject. This caught one
dead check when it was first introduced.

- `PRINCIPLES.md` — the constitution
- `AGENTS.md` — operating rules and routing
- `agentic-docs/design/` — architecture, verification, and the evidence behind both

## Development

```sh
rustup target add wasm32-unknown-unknown
npm install
git config core.hooksPath .githooks

cargo build -p subtractive-dsp --target wasm32-unknown-unknown --release
npm run audit:harness      # docs, gates, fixtures, intents
npm run verify:spec        # grade oscillators against the analytic prototype
npm run audit:bundle       # the size number above
node scripts/dev/e2e-check.mjs   # prove it makes sound in a real browser
```

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option.
Porting and trademark policy: `agentic-docs/licensing.md`.
