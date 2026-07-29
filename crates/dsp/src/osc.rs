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
    /// Triangle is an integrated square; this holds the integrator state.
    tri: f32,
}

impl Osc {
    pub const fn new() -> Self {
        Osc { phase: 0.0, dt: 0.0, tri: 0.0 }
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
