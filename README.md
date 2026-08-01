<p align="center">
  <img src="https://raw.githubusercontent.com/keunwoochoi/subtractive-synthesizers.js/main/assets/logo/logo-256.png" width="140" alt="subtractive-synthesizers.js — [-] tile-mosaic logo">
</p>

# subtractive-synthesizers.js

<!-- generated:product-summary -->
A browser subtractive synthesizer with 41 curated patches and 47 documented controls. Audio is synthesized at runtime in a WebAssembly AudioWorklet; the package contains no samples and needs no network access while playing.
<!-- /generated:product-summary -->

<!-- generated:package-status -->
> **Release status:** This checkout carries final manifest version `0.1.0`. Registry publication is a separate human-authorized operation; confirm the available version on the [npm package page](https://www.npmjs.com/package/subtractive-synthesizers.js).
<!-- /generated:package-status -->

## Install

```sh
npm install subtractive-synthesizers.js
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

Call `createEngine()` from a user gesture because browsers control when audio may start. The engine resolves its packaged WASM and inlined worklet itself, and `applyPreset()` sends a complete patch so no state carries over from the previous sound.

## Demo

- **[Patch showcase](https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/showcase.html)** — hear the curated patch bank.
- **[Playground](https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/index.html)** — play a keyboard and edit every public parameter.
- **[Changelog](https://github.com/keunwoochoi/subtractive-synthesizers.js/blob/main/CHANGELOG.md)** — user-visible changes toward the first release.

## What is included

- PolyBLEP saw, pulse/PWM, and triangle oscillators; a sub oscillator; hard sync; white-to-pink noise; stereo unison; drift; portamento; a pitch envelope; and oversampling.
- Two nonlinear lowpass characters plus state-variable lowpass, bandpass, highpass, and notch filters.
- Separate amplitude and filter ADSR envelopes, velocity and keyboard tracking, one shared LFO, and one per-voice retriggered LFO.
- Ensemble chorus, ping-pong delay with tone control, and stereo feedback-delay-network reverb.
- A curated, measured patch bank with explicit intent provenance rather than a sample download or external asset service.

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

## Compatibility and lifecycle

The ESM imports are SSR-safe: importing the package does not touch `window` or construct an `AudioContext`. Packed-package checks install the tarball into clean projects and render audio in Chromium and Playwright WebKit; separate fixtures build it without library-specific configuration in Vite, webpack 5, and Next.

`createEngine({ context })` shares a caller-owned `BaseAudioContext`, while `createEngine({ connect: false })` leaves `engine.output` unconnected for caller-controlled routing. `engine.resume()` recovers any non-running, non-closed context state, including WebKit's `interrupted` state. `engine.dispose()` is idempotent, frees the worklet's WASM engine, disconnects output, and closes only a context created by the library. Construction failures reject `createEngine()`; later worklet, processor, and message errors reach `engine.onError` and the console.

No CDN, sample, or network request is made while playing. The only runtime fetch is the WASM file installed with the package unless the caller supplies `wasmUrl`; the worklet is inlined into the JavaScript build.

## API

<!-- generated:api -->
**`createEngine(options?)` → `Promise<Engine>`**

| option | meaning |
|---|---|
| `wasmUrl?: string \| URL` | Override where the WASM is fetched from. Defaults to the packaged asset. |
| `workletUrl?: string \| URL` | Override the worklet module URL. Defaults to inlined source via a Blob URL. |
| `context?: BaseAudioContext` | Supply your own context — required for an OfflineAudioContext render. |
| `connect?: boolean` | Connect the output to `context.destination`. Defaults to true; pass false for caller-controlled routing. |
| `initialEvents?: ScheduledEvent[]` | Events applied at node construction. Required for offline rendering: an OfflineAudioContext can finish rendering without ever servicing the message port. |

**`Engine`**

| member | meaning |
|---|---|
| `readonly context: BaseAudioContext` | The context the engine was created on — yours, or one it made. |
| `readonly node: AudioWorkletNode` | The engine's output node. Connected to the destination unless `connect: false` was requested. |
| `readonly output: AudioWorkletNode` | Unambiguous output handle. This is the same AudioWorkletNode as `node`. |
| `readonly voices: number` | Voices currently sounding. Updated ~10 times a second. |
| `onStats?: (stats: { voices: number }) => void` | Called with engine stats as they arrive. |
| `onError?: (error: Error) => void` | Called when the worklet reports a runtime, message-deserialization, or processor error. |
| `resume(): Promise<void>` | Resume any non-running, non-closed context state, including WebKit's `interrupted`. Safe to call from a user gesture. |
| `noteOn(note: number, vel?: number): void` | Start a note now. `note` is MIDI (60 = middle C), `vel` is 0..1. |
| `noteOff(note: number): void` | Release a note now; its amp release still rings out. |
| `allOff(): void` | Release every sounding note, tails intact. |
| `schedule(events: ScheduledEvent[]): void` | Queue events at absolute context times; applied on the exact frame. |
| `clear(): void` | Drop everything pending and silence. |
| `setParam(name: ParamName, value: number): void` | Set one patch parameter, effective on the next block. |
| `dispose(): Promise<void>` | Free the WASM engine and disconnect its output. Idempotent; closes only a context the library created. |

`PARAMETERS` is the authoritative metadata for all 47 controls; `PARAM`, `SHAPE`, `FILTER`, preset defaults, declarations, the playground, and the parameter table below derive from it.
<!-- /generated:api -->

For deterministic offline rendering, pass an `OfflineAudioContext` and `initialEvents` to `createEngine()`, then call `context.startRendering()`. A live engine instead accepts `noteOn()`, `noteOff()`, `schedule()`, and `setParam()` messages after construction.

## Parameters

`PARAMETERS` is exported from the main entry point and is the source of every parameter id, preset-reset default, supported range, increment, unit, and enum value. `DEFAULTS` from `subtractive-synthesizers.js/presets` is generated from the same definitions. Presets merge their partial overrides over those defaults before applying all controls. Values outside the supported range are not part of the public contract. An optional `editorMax` is a preferred slider ceiling for fine control; the playground expands it when a loaded preset uses a larger supported value.

<!-- generated:parameters -->
| parameter | id | preset default | supported range | step | unit / values |
|---|---:|---:|---:|---:|---|
| `shape` | 0 | 0 | 0 … 2 | 1 | `saw` = 0, `pulse` = 1, `triangle` = 2 |
| `filterKind` | 37 | 0 | 0 … 5 | 1 | `ladderLp` = 0, `diodeLp` = 1, `svfLp` = 2, `svfBp` = 3, `svfHp` = 4, `svfNotch` = 5 |
| `unison` | 31 | 2 | 1 … 7 | 1 | voices |
| `detuneCents` | 2 | 8 | 0 … 1400 | 0.5 | cents |
| `pulseWidth` | 1 | 0.5 | 0.05 … 0.95 | 0.01 | ratio |
| `subLevel` | 3 | 0.25 | 0 … 1 | 0.01 | linear gain |
| `noiseLevel` | 4 | 0 | 0 … 1 | 0.01 | linear gain |
| `glide` | 32 | 0 | 0 … 0.4 | 0.005 | seconds |
| `cutoffHz` | 5 | 1200 | 60 … 8000 | 10 | Hz |
| `resonance` | 6 | 0.3 | 0 … 1 | 0.01 | ratio |
| `drive` | 7 | 1.2 | 0.5 … 4 | 0.05 | times |
| `envAmount` | 8 | 2400 | 0 … 8000 | 50 | Hz |
| `keyTrack` | 9 | 0.35 | 0 … 1 | 0.01 | ratio |
| `velToCutoff` | 18 | 2000 | 0 … 6000 | 50 | Hz |
| `ampAttack` | 10 | 0.005 | 0.001 … 2 | 0.001 | seconds |
| `ampDecay` | 11 | 0.25 | 0.005 … 2 | 0.005 | seconds |
| `ampSustain` | 12 | 0.7 | 0 … 1 | 0.01 | ratio |
| `ampRelease` | 13 | 0.25 | 0.005 … 3 | 0.005 | seconds |
| `fltAttack` | 14 | 0.002 | 0.001 … 2 | 0.001 | seconds |
| `fltDecay` | 15 | 0.3 | 0.005 … 2 | 0.005 | seconds |
| `fltSustain` | 16 | 0.3 | 0 … 1 | 0.01 | ratio |
| `fltRelease` | 17 | 0.25 | 0.005 … 3 | 0.005 | seconds |
| `lfoRate` | 33 | 5 | 0.05 … 16 | 0.05 | Hz |
| `lfoToPitch` | 34 | 0 | 0 … 60 | 1 | cents |
| `lfoToCutoff` | 35 | 0 | 0 … 3000 | 25 | Hz |
| `lfoToPwm` | 36 | 0 | 0 … 0.45 | 0.01 | ratio |
| `chorusMix` | 22 | 0 | 0 … 1 | 0.01 | ratio |
| `chorusRate` | 20 | 0.6 | 0.05 … 6 | 0.01 | Hz |
| `chorusDepth` | 21 | 3 | 0 … 12 | 0.1 | milliseconds |
| `delayMix` | 23 | 0 | 0 … 1 | 0.01 | ratio |
| `delayTime` | 24 | 0.25 | 0.02 … 1 | 0.005 | seconds |
| `delayFeedback` | 25 | 0.35 | 0 … 0.92 | 0.01 | ratio |
| `delayTone` | 26 | 3200 | 400 … 16000 | 100 | Hz |
| `reverbMix` | 27 | 0 | 0 … 1 | 0.01 | ratio |
| `reverbSize` | 28 | 0.6 | 0 … 1 | 0.01 | ratio |
| `reverbDamp` | 29 | 4200 | 800 … 14000 | 100 | Hz |
| `reverbPredelay` | 30 | 18 | 0 … 100 | 1 | milliseconds |
| `stereoWidth` | 38 | 0.7 | 0 … 1 | 0.01 | ratio |
| `syncRatio` | 39 | 1 | 1 … 8 | 0.05 | ratio |
| `pitchEnvAmount` | 40 | 0 | -36 … 36 | 1 | semitones |
| `pitchEnvDecay` | 41 | 0.08 | 0.005 … 1 | 0.005 | seconds |
| `lfo2Rate` | 42 | 3 | 0.05 … 16 | 0.05 | Hz |
| `lfo2ToCutoff` | 43 | 0 | 0 … 4000 | 25 | Hz |
| `lfo2ToPitch` | 44 | 0 | 0 … 12 | 0.1 | semitones |
| `noiseColor` | 45 | 0 | 0 … 1 | 0.01 | ratio (white to pink) |
| `oscLevel` | 46 | 1 | 0 … 1 | 0.01 | linear gain |
| `gain` | 19 | 0.32 | 0 … 0.85 | 0.01 | linear gain |
<!-- /generated:parameters -->

## Known limits

- This is a browser AudioWorklet library, not a Node audio renderer, DAW, sequencer, arpeggiator, sampler, Web MIDI adapter, or plugin format.
- Chromium and Playwright WebKit are blocking release targets. Firefox and direct mobile-device performance tiers are not currently release gates.
- PolyBLEP alias rejection degrades in the upper register, and non-integer hard-sync ratios retain some inharmonic energy; both behaviors are measured rather than hidden.
- The voice pool steals the oldest voice when exhausted. Under load the engine degrades by shedding a voice rather than increasing its fixed allocation.
- `setParam()` rejects unknown names, but callers are responsible for keeping values inside the exported `PARAMETERS` ranges.

## Size

<!-- generated:bundle -->
| artifact | raw | gzipped |
|---|---:|---:|
| `packages/core/wasm/subtractive_dsp.wasm` | 76,064 B | 30,122 B |
| `packages/core/src/index.js` | 7,956 B | 2,822 B |
| `packages/core/src/parameters.js` | 4,179 B | 1,533 B |
| `packages/core/src/presets.js` | 20,792 B | 4,825 B |
| `packages/core/worklet/processor.js` | 5,793 B | 2,176 B |
| **total** | | **41,478 B (40.5 KB)** |

Budget is 60 KB gzipped for the whole library — currently **67%**.
<!-- /generated:bundle -->

## Runtime cost

<!-- generated:bench -->
| | |
|---|---|
| voices in the reference arrangement | 16 (pad + bass + lead, chorus on) |
| audio-thread budget used | **14.9 %** of the 2.667 ms / 128-frame budget |
| real-time factor | 6.7x |
<!-- /generated:bench -->

The benchmark saturates the voice pool with the reference arrangement and enables chorus, which is the worst case this build can produce. The measurement describes the machine that regenerated the table; performance on other devices, including mobile devices, is not claimed.

## Verification

An ideal sawtooth has harmonics at *k·f₀* with amplitude proportional to 1/*k*, and the filters have known transfer-function targets. The harness grades the shipped oscillator against the analytic prototype, checks filter response, stability, headroom, tuning, patch-bank loudness and distinctness, audio-thread cost, artifact size, package installation, browser audio, lifecycle failure paths, and real consumer builds.

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

`wasm_saw` is the shipped path. The remaining candidates include deliberate cheats: silence, a pure sine, a brick-wall construction, and a candidate special-cased to the visible grid. Their rejection demonstrates that an alias metric cannot pass by deleting the intended harmonic structure or overfitting published cases.

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

## Patch intent coverage

Every exported preset is bound to exactly one checked intent artifact. `prior` means Git history proves the intent predates implementation; `retrospective` means the artifact was reconstructed from an already tuned patch and did not guide its original tuning. New presets cannot use the frozen retrospective migration exception.

<!-- generated:intent-coverage -->
| intent coverage | count |
|---|---:|
| exported presets | 41 |
| exactly mapped implemented intents | 41 |
| written before implementation | 1 |
| reconstructed after implementation | 40 |
| proposed before implementation | 0 |
<!-- /generated:intent-coverage -->

## Harness

<!-- generated:harness-stats -->
| | |
|---|---|
| harness audit assertions | 25 |
| Python harness/spec tests | 23 |
| public metadata/README tests | 8 |
| deliberately-broken fixtures | 8 |
<!-- /generated:harness-stats -->

Rules are enforced as hooks, generated artifacts, or failing tests rather than prose alone. That includes deliberately broken fixtures proving the audit can fail for the defect it claims to catch.

- [`PRINCIPLES.md`](https://github.com/keunwoochoi/subtractive-synthesizers.js/blob/main/PRINCIPLES.md) — project constitution.
- [`AGENTS.md`](https://github.com/keunwoochoi/subtractive-synthesizers.js/blob/main/AGENTS.md) — operating rules and task routing.
- [`agentic-docs/design/`](https://github.com/keunwoochoi/subtractive-synthesizers.js/tree/main/agentic-docs/design) — architecture, verification, release criteria, and harness evidence.

## Development

```sh
rustup target add wasm32-unknown-unknown
npm install
git config core.hooksPath .githooks

cargo build -p subtractive-dsp --target wasm32-unknown-unknown --release
npm run audit:harness
npm run verify:spec
npm run audit:bundle
npm run check:install
npm run check:types
npm run check:bundlers
```

## A short build log

This project started after I released [`physical-instruments.js`](https://github.com/keunwoochoi/physical-instruments.js). Having a working project in a similar product area, I could begin with a very small prompt: I put this folder next to [`physical-instruments.js`](https://github.com/keunwoochoi/physical-instruments.js) and asked a coding agent (Claude Code or Codex—I use both interchangeably) to make the subtractive-synthesis counterpart.

Subtractive synthesis starts with a deliberately bright oscillator and carves a playable tone out of it: the filter removes spectral energy, envelopes give the note its motion, LFOs animate it, and the amplifier shapes its life in time. The biggest difference from `physical-instruments.js` is that instead of simulating a vibrating string, bar, or air column, this engine generates band-limited periodic waveforms and noise, then routes them through resonant filters, control-rate modulation, per-voice envelopes, and effects. There are a lot of hardware references: the [Moog Minimoog Model D](https://www.moogmusic.com/synthesizers/minimoog-model-d/), [ARP Odyssey](https://www.korg.com/us/products/synthesizers/arpodyssey/), [Korg MS-20](https://www.korg.com/us/products/synthesizers/ms_20mini/), [Sequential Prophet-5](https://sequential.com/product/prophet-5/), [Yamaha CS-80](https://usa.yamaha.com/products/contents/music_production/synth_chronology/modal/modal_cs-80.html), the [Oberheim OB-X/OB-Xa family](https://oberheim.com/products/ob-x8/), and Roland's [Jupiter-8](https://www.roland.com/global/products/rc_jupiter-8/), [Juno-60/Juno-106](https://www.roland.com/global/products/rc_juno-106/), [SH-101](https://www.roland.com/global/products/rc_sh-101/), and [TB-303](https://www.roland.com/global/promos/303day/).

There were times when finding a cool subtractive synthesizer sound was enough to define the sound of a song. For example:

- [Bernie Worrell recalled](https://www.powmag.net/p/the-minute-you-think-you-know-it-all-youre-in-trouble-an-interview-with-bernie-worrell) building Parliament's “Flash Light” bass line from three Minimoogs layered together—a useful reminder that a monophonic instrument can still make an enormous arrangement-defining sound.
- Herbie Hancock's [“Chameleon”](https://www.arpsynth.com/en/experience/sounds/2015/06/music/) made the ARP Odyssey bass line part of the vocabulary of jazz-funk.
- [Sequential credits the Prophet-5](https://sequential.com/50-years-of-sequential/) with Hall & Oates' “I Can't Go for That,” the opening chords of Michael Jackson's “Thriller,” the pad in A-ha's “Take On Me,” and Radiohead's “Everything in Its Right Place.”
- Eddie Van Halen recorded the keyboard riff of [“Jump”](https://www.musicradar.com/news/van-halens-Jump-at-40-how-the-most-famous-keyboard-riff-of-all-time-was-created-and-how-you-can-too) on an Oberheim OB-Xa, turning a synth-brass patch into one of rock's most recognizable openings.
- [Vangelis made the Yamaha CS-80](https://usa.yamaha.com/products/contents/proaudio/training_support/micro_tutorial/20170525/index.html) inseparable from the sound world of the *Blade Runner* score.
- Phuture's [“Acid Tracks”](https://articles.roland.com/acid-tracks-by-phuture/) transformed a second-hand Roland TB-303—originally intended to imitate a bass guitar—into the defining squelch of acid house.

## License

Dual-licensed under [MIT](LICENSE-MIT) or [Apache-2.0](LICENSE-APACHE), at your option. Porting and trademark policy is recorded in the repository's [licensing ledger](https://github.com/keunwoochoi/subtractive-synthesizers.js/blob/main/agentic-docs/licensing.md).
