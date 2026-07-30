# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file records what changed for **users of the package**. The engineering record —
what was wrong, how it was found, what was tried and abandoned — lives in commit messages
and is deliberately not duplicated here.

## [Unreleased]

Nothing yet.

## [0.1.0] — unreleased

First public version. `npm install`, three lines, a synthesizer.

### Synthesis

- Polyphonic subtractive engine, 16 voices, in one AudioWorklet with a Rust/WASM core.
- Antialiased oscillators (PolyBLEP): saw, pulse with PWM, triangle, plus a sub oscillator.
- Six filters: two 4-pole lowpass characters (ladder, diode) and the four state-variable
  outputs (lowpass, bandpass, highpass, notch), all zero-delay-feedback.
- Two ADSR envelopes — amplitude and filter — with velocity to cutoff and key tracking.
- Unison up to 7 voices with detune and equal-power stereo spread; portamento.
- Hard sync with an independently tunable master ratio.
- Pitch envelope: a one-shot sweep into the note, for percussive and drum-like patches.
- Two LFOs — one shared and free-running for vibrato, one per-voice and retriggered on
  every note — routable to pitch, cutoff and pulse width.
- White and pink noise on a continuous colour control, and an oscillator level so noise
  can be the source rather than a garnish.
- 2× oversampling through a Kaiser half-band decimator.

### Effects

- Three-phase ensemble chorus, ping-pong delay with a tone control, and a stereo FDN
  reverb with size, damping and pre-delay.

### Patches

- 41 patches across bass, lead, pad, pluck and brass, loudness-matched to within 8 dB
  and verified mutually distinct.

### Packaging

- Zero-config in Vite, webpack 5 and Next — each verified by a fixture that builds the
  library into a real app and makes it produce audio.
- The worklet is inlined and served from a Blob URL; the WASM resolves through
  `new URL(..., import.meta.url)`, with `wasmUrl` available as an override.
- Hand-written TypeScript declarations for the whole public surface.
- Dual licensed MIT OR Apache-2.0.

### Known limits

- Recorded rather than hidden. PolyBLEP alias rejection degrades with pitch (−47 dB at
  28 Hz, −27 dB at 2.2 kHz); hard sync at non-integer ratios leaves inharmonic energy
  around −53 dB; the pink filter's slope is held flat below ~8 Hz on purpose, because a
  true 1/f pole at DC makes the noise wander off centre.

[Unreleased]: https://github.com/keunwoochoi/subtractive-synthesizers.js/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/keunwoochoi/subtractive-synthesizers.js/releases/tag/v0.1.0
