# subtractive-synthesizers.js

**A real analog-style synthesizer for the browser, computed on the fly.**
No samples, no CDN, works offline. `noteOn()` and you have a sound.

> **Status: pre-alpha.** Nothing on npm yet. But the engine is real and playable: an
> antialiased oscillator through a zero-delay-feedback ladder filter with per-voice
> analog drift, 16-voice polyphony, inside one AudioWorklet.
>
> ```sh
> cargo build -p subtractive-dsp --target wasm32-unknown-unknown --release
> scripts/dev/serve.sh     # → http://127.0.0.1:8291/apps/playground/showcase.html
> ```

Second library in the `sets-of-instruments-js` family.
[`physical-instruments.js`](https://github.com/keunwoochoi/physical-instruments.js) models
instruments that exist. **This one ships synthesizers, whose output imitates nothing** —
and that difference decides how the whole project verifies its work.

## Size

<!-- generated:bundle -->
| artifact | raw | gzipped |
|---|---:|---:|
| `packages/core/wasm/subtractive_dsp.wasm` | 72,042 B | 28,317 B |
| `packages/core/src/index.js` | 3,108 B | 1,559 B |
| `packages/core/worklet/processor.js` | 4,616 B | 1,873 B |
| **total** | | **31,749 B (31.0 KB)** |

Budget is 60 KB gzipped for the whole library — currently **51%**.
<!-- /generated:bundle -->

## Cost

<!-- generated:bench -->
| | |
|---|---|
| voices in the reference arrangement | 16 (pad + bass + lead, chorus on) |
| audio-thread budget used | **7.6 %** of the 2.667 ms / 128-frame budget |
| real-time factor | 13.2x |
<!-- /generated:bench -->

Measured on the machine that regenerated this table, with the voice pool saturated and
the chorus on — the worst case this build can produce. **Not a claim about any other
device, and explicitly not a mobile figure**: estimated mobile numbers are never
presented as budget rows here.

## How it verifies itself

A sawtooth through a resonant lowpass is not an imitation of anything, so there is no
recording we are failing to match. **We do not need a reference recording, because we
have a reference equation.** An ideal sawtooth has harmonics at *k·f₀* with amplitude
∝ 1/*k*; a ladder filter is a discretization of a known transfer function. Those have
exact answers that need no corpus, no microphone, and no licence.

Every oscillator is graded against that prototype, worst-case across a grid, on a
**hidden** set of frequencies and sample rates it was never tuned against:

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

`wasm_saw` is the shipped artifact. Everything else is scaffolding — including four
cheats written *before* any DSP existed, because every gate has a degenerate optimum and
the only way to know a gate measures what you meant is to build the thing that games it
and watch it lose.

Note `cheat_pure_sine`: it has **the best alias suppression of any candidate**, better
than the real implementation. A gate on alias energy alone would rank it first. It is
caught only by harmonic structure — which is why the two metrics are paired.

And `cheat_special_cased` — correct on the published grid, naive everywhere else —
passes the visible grid outright and is caught only by the hidden one.

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

PolyBLEP buys a consistent ~16 dB over a raw phase ramp, and degrades with pitch. That
degradation is a known limit, recorded rather than hidden: the upper register needs
oversampling before the gate can be tightened.

## Patches

Every patch's **intent is written before any parameter is tuned** — prose plus 3–5
measurable targets, each naming the phrase of prose it derives from. With no reference
to converge on, an intent written first is the only thing that lets a result be *wrong*,
which is the only thing that lets the work finish.

<!-- generated:roster -->
| patch | intent | implementation |
|---|---|---|
| `acid-bass` | yes | not yet |
<!-- /generated:roster -->

## Harness

<!-- generated:harness-stats -->
| | |
|---|---|
| harness audit assertions | 24 |
| fail-correctly tests | 18 |
| deliberately-broken fixtures | 7 |
<!-- /generated:harness-stats -->

Rules here are hooks, generated artifacts, or failing tests — never prose. Including the
rule that **the harness must be shown to fail**: deliberately broken fixtures that every
gate is asserted to reject. That discipline found a dead check within minutes of being
written.

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
