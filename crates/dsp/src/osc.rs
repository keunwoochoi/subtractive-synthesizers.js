//! Antialiased oscillators.
//!
//! PolyBLEP rather than wavetables, per the architecture doc: wavetables suppress alias
//! better but cost a table per waveform per octave band, and bytes in the data budget
//! are exactly the axis this library exists to win on. PolyBLEP is a dozen lines and
//! needs no tables.
//!
//! Measured (scripts/verify, 2026-07-28): PolyBLEP buys a consistent +16 dB over a raw
//! phase ramp, and degrades with pitch -- -47 dB at 28 Hz, -35 dB at 440 Hz, -27 dB at
//! 2.2 kHz. That degradation is a known limit, recorded rather than hidden, and it is
//! why the upper register will need oversampling before the alias gate can be tightened.
//!
//! Reference: Valimaki & Huovilainen, BLIT/BLEP oscillator literature (papers only).

use crate::flush_denormal;

/// Second-order polynomial approximation to the bandlimited step residual.
#[inline]
fn poly_blep(t: f32, dt: f32) -> f32 {
    if t < dt {
        let t = t / dt;
        t + t - t * t - 1.0
    } else if t > 1.0 - dt {
        let t = (t - 1.0) / dt;
        t * t + t + t + 1.0
    } else {
        0.0
    }
}

/// The naive waveform value at a phase, used to size a sync discontinuity.
#[inline]
fn raw_value(shape: Shape, t: f32, width: f32) -> f32 {
    match shape {
        Shape::Saw => 2.0 * t - 1.0,
        Shape::Pulse => if t < width.clamp(0.05, 0.95) { 1.0 } else { -1.0 },
        Shape::Triangle => 4.0 * (t - 0.5).abs() - 1.0,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Shape {
    Saw,
    Pulse,
    Triangle,
}

impl Shape {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => Shape::Pulse,
            2 => Shape::Triangle,
            _ => Shape::Saw,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Osc {
    phase: f32,
    dt: f32,
    /// Retained from an abandoned experiment; see hard_sync.
    sync_jump: f32,
    sync_age: f32,
    /// Triangle is an integrated square; this holds the integrator state.
    tri: f32,
}

impl Osc {
    pub const fn new() -> Self {
        Osc { phase: 0.0, dt: 0.0, sync_jump: 0.0, sync_age: 2.0, tri: 0.0 }
    }

    #[inline]
    pub fn set_freq(&mut self, hz: f32, sr: f32) {
        // Clamp below Nyquist. An oscillator asked for an impossible pitch must not
        // silently alias its way to something plausible.
        self.dt = (hz / sr).clamp(0.0, 0.49);
    }

    /// Randomise start phase so unison voices do not phase-lock into a comb filter.
    #[inline]
    pub fn set_phase(&mut self, p: f32) {
        self.phase = p.fract().abs();
    }

    /// Hard sync: force the phase back to `frac` because a master oscillator wrapped.
    ///
    /// `frac` is how far INTO this sample the master crossed, not zero. Resetting to a
    /// flat zero quantises every reset to a sample boundary, which turns the sync edge
    /// into a stream of jitter at the sample rate -- audible as a gritty buzz that gets
    /// worse the higher the note. Carrying the sub-sample position through is most of
    /// what makes hard sync sound like a tone rather than like noise.
    /// Hard sync: force the phase back because a master oscillator wrapped.
    ///
    /// `frac` is how far INTO the sample the master crossed, not zero. Resetting to a
    /// flat zero quantises every reset to a sample boundary, which turns the sync edge
    /// into jitter at the sample rate -- a gritty buzz that worsens with pitch. Carrying
    /// the sub-sample position through is most of what makes sync a tone, not noise.
    ///
    /// NO BLEP CORRECTION HERE, and that was a deliberate reversal. Band-limiting the
    /// reset step the way the waveform's own edges are band-limited MEASURED WORSE:
    /// inharmonic energy at non-integer ratios went from -53 dB to -42 dB, and the
    /// integer-ratio artefacts it was written to fix did not move at all. Kept simple
    /// rather than kept clever. The known limit is recorded on `sync_ratio`.
    #[inline]
    pub fn hard_sync(&mut self, frac: f32, _shape: Shape, _width: f32) {
        self.phase = frac * self.dt;
    }

    #[inline]
    pub fn dt(&self) -> f32 {
        self.dt
    }

    #[inline]
    pub fn tick(&mut self, shape: Shape, width: f32) -> f32 {
        let t = self.phase;
        let dt = self.dt;
        let out = match shape {
            Shape::Saw => (2.0 * t - 1.0) - poly_blep(t, dt),
            Shape::Pulse => {
                let w = width.clamp(0.05, 0.95);
                let raw = if t < w { 1.0 } else { -1.0 };
                // Two discontinuities per period: the rising edge at 0 and the falling
                // edge at w. Both need correcting or PWM aliases worse than a saw.
                let mut y = raw + poly_blep(t, dt);
                let t2 = if t >= w { t - w } else { t + 1.0 - w };
                y -= poly_blep(t2, dt);
                y
            }
            Shape::Triangle => {
                // Integrate a corrected square. The leaky integrator keeps DC from
                // walking off over long notes.
                let raw = if t < 0.5 { 1.0 } else { -1.0 };
                let mut sq = raw + poly_blep(t, dt);
                let t2 = if t >= 0.5 { t - 0.5 } else { t + 0.5 };
                sq -= poly_blep(t2, dt);
                self.tri = flush_denormal(self.tri + 4.0 * dt * sq - 1e-4 * self.tri);
                self.tri
            }
        };

        self.phase += dt;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }
        out
    }
}

/// White noise. Xorshift rather than an LCG: the low bits of a small LCG are audibly
/// periodic on a sustained pad.
#[derive(Clone, Copy)]
pub struct Noise(u32);

impl Noise {
    pub const fn new(seed: u32) -> Self {
        Noise(if seed == 0 { 0x9E3779B9 } else { seed })
    }

    #[inline]
    pub fn tick(&mut self) -> f32 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        self.0 = x;
        (x as f32 / u32::MAX as f32) * 2.0 - 1.0
    }
}

// GENERATED by scripts/dev/design_pink.py -- do not hand-edit.
// Runs at the voice's 2x oversampled rate (96 kHz), which is what it was designed for.
// 5 one-pole/one-zero sections, worst error 0.06 dB over 20 Hz - 20 kHz vs the analytic -3.01 dB/oct.
// Design rationale and the DC-pole bound live in that script.
const PINK_POLE: [f32; 5] = [0.999401624, 0.996326249, 0.979515655, 0.890129683, 0.519391765];
const PINK_ZERO: [f32; 5] = [0.998449143, 0.9913101, 0.952104519, 0.758813146, 0.16819892];
const PINK_GAIN: f32 = 0.378187955;

/// Shapes white noise to pink (-3 dB/octave). White noise reads as hiss and air; pink
/// has the energy distribution of wind, breath and surf, so it is what a patch wants
/// whenever the noise is meant to be a BODY rather than a top end.
///
/// PINK_GAIN normalises the cascade to unity RMS on white input, so the colour control
/// changes the spectrum and not the level -- otherwise every comparison of it is really
/// a loudness test, which is the same trap the patch bank's loudness gate exists for.
#[derive(Clone, Copy, Default)]
pub struct Pink {
    x1: [f32; 5],
    y1: [f32; 5],
}

impl Pink {
    pub const fn new() -> Self {
        Pink { x1: [0.0; 5], y1: [0.0; 5] }
    }

    #[inline]
    pub fn tick(&mut self, white: f32) -> f32 {
        let mut v = white;
        for i in 0..5 {
            let y = v - PINK_ZERO[i] * self.x1[i] + PINK_POLE[i] * self.y1[i];
            self.x1[i] = v;
            self.y1[i] = y;
            v = y;
        }
        v * PINK_GAIN
    }
}
