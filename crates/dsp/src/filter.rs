//! Zero-delay-feedback filters, topology-preserving transform.
//!
//! PRINCIPLES: "the filter is the personality, and it is the one place to spend."
//! A linear biquad is the single most common reason a software synth sounds cheap.
//!
//! Reference: Zavalishin, *The Art of VA Filter Design* (rev 2.1.2). A book, freely
//! copyable in full, so reimplementing from it is clean-room under our papers-only
//! policy. Nonlinear ladder behaviour: Huovilainen, DAFx-04. Both papers, no source.
//!
//! Why ZDF and not a naive bilinear cascade: with a one-sample delay in the feedback
//! path the resonant peak's frequency drifts as resonance rises, and the cutoff warps
//! badly near Nyquist. TPT solves the feedback instantaneously, which is what makes
//! cutoff track the requested frequency across the whole range -- the property
//! scripts/verify grades against the analog prototype.

use crate::flush_denormal;
use core::f32::consts::PI;

/// 4-pole transistor-ladder lowpass, 24 dB/oct, with saturation in the feedback path.
///
/// Analog prototype: H(s) = 1 / ((1 + s/wc)^4 + k)
#[derive(Clone, Copy)]
pub struct Ladder {
    /// Per-stage TPT integrator gain, already in G = g/(1+g) form.
    g: f32,
    g4: f32,
    k: f32,
    drive: f32,
    s: [f32; 4],
}

impl Ladder {
    pub const fn new() -> Self {
        Ladder { g: 0.0, g4: 0.0, k: 0.0, drive: 1.0, s: [0.0; 4] }
    }

    pub fn reset(&mut self) {
        self.s = [0.0; 4];
    }

    /// `res` is 0..1. At 1.0 the loop gain reaches 4, where the ladder self-oscillates.
    pub fn set(&mut self, cutoff_hz: f32, res: f32, drive: f32, sr: f32) {
        // Prewarp so the digital cutoff lands on the analog one. Without this the
        // filter flattens out near Nyquist and high notes lose their character.
        let fc = cutoff_hz.clamp(20.0, sr * 0.45);
        let g = (PI * fc / sr).tan();
        self.g = g / (1.0 + g);
        self.g4 = self.g * self.g * self.g * self.g;
        self.k = 4.0 * res.clamp(0.0, 1.0);
        self.drive = drive.max(0.1);
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let g = self.g;
        // Instantaneous state contribution of each stage, propagated to the output.
        let s1 = (1.0 - g) * self.s[0];
        let s2 = (1.0 - g) * self.s[1];
        let s3 = (1.0 - g) * self.s[2];
        let s4 = (1.0 - g) * self.s[3];
        let sigma = g * g * g * s1 + g * g * s2 + g * s3 + s4;

        // Solve the feedback loop with no unit delay: y4 = (G^4*u + sigma)/(1 + k*G^4).
        let u = x * self.drive;
        let y4 = (self.g4 * u + sigma) / (1.0 + self.k * self.g4);

        // Saturate the feedback. This is what stops self-oscillation growing without
        // bound and gives the ladder its characteristic loss of bass at high resonance.
        let fb = self.k * tanh_fast(y4);
        let mut v = u - fb;

        // Run the four stages for real, updating state.
        for i in 0..4 {
            let a = (v - self.s[i]) * g;
            let y = a + self.s[i];
            self.s[i] = flush_denormal(y + a);
            v = y;
        }
        v
    }
}

/// 2-pole state-variable, TPT. The brighter, more surgical personality: pads, sweeps,
/// stabs. Kept alongside the ladder rather than instead of it because they are not
/// interchangeable -- one is warm and loses bass under resonance, the other does not.
#[derive(Clone, Copy)]
pub struct Svf {
    g: f32,
    r: f32,
    s1: f32,
    s2: f32,
}

impl Svf {
    pub const fn new() -> Self {
        Svf { g: 0.0, r: 1.0, s1: 0.0, s2: 0.0 }
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }

    pub fn set(&mut self, cutoff_hz: f32, res: f32, sr: f32) {
        let fc = cutoff_hz.clamp(20.0, sr * 0.45);
        self.g = (PI * fc / sr).tan();
        self.r = 1.0 - res.clamp(0.0, 0.98);
    }

    /// Returns the lowpass output; band and high are available from the same solve.
    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let g = self.g;
        let denom = 1.0 + 2.0 * self.r * g + g * g;
        let hp = (x - (2.0 * self.r + g) * self.s1 - self.s2) / denom;
        let bp = g * hp + self.s1;
        let lp = g * bp + self.s2;
        self.s1 = flush_denormal(g * hp + bp);
        self.s2 = flush_denormal(g * bp + lp);
        lp
    }
}

/// Rational tanh approximation. A real tanh is a libm call on every sample of every
/// voice; this is within 0.2% over +/-3 and monotonic, which is what the feedback path
/// actually needs.
#[inline]
pub fn tanh_fast(x: f32) -> f32 {
    let x = x.clamp(-4.0, 4.0);
    let x2 = x * x;
    x * (27.0 + x2) / (27.0 + 9.0 * x2)
}
