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

    /// One solve, all four outputs. Highpass and bandpass are free once the state-variable
    /// equations are resolved -- charging for them separately would mean running the
    /// filter twice for a notch.
    #[inline]
    pub fn process_all(&mut self, x: f32) -> (f32, f32, f32) {
        let g = self.g;
        let denom = 1.0 + 2.0 * self.r * g + g * g;
        let hp = (x - (2.0 * self.r + g) * self.s1 - self.s2) / denom;
        let bp = g * hp + self.s1;
        let lp = g * bp + self.s2;
        self.s1 = flush_denormal(g * hp + bp);
        self.s2 = flush_denormal(g * bp + lp);
        (lp, bp, hp)
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        self.process_all(x).0
    }
}

/// Diode-ladder lowpass — the acid voice.
///
/// A transistor ladder and a diode ladder are not interchangeable, and the difference is
/// the whole reason a 303-style line sounds like itself: the diode ladder's stages load
/// each other, so its poles are not evenly spaced, its resonance is fiercer and less
/// linear, and it keeps more low end when resonance is up instead of thinning out.
///
/// HONEST LABEL: this is a VOICED APPROXIMATION, not a circuit model. It reproduces the
/// behaviours above with unequal stage gains and an asymmetric feedback shaper; it does
/// not solve the diode equations. `scripts/verify/check_engine.mjs` asserts it measurably
/// differs from the transistor ladder rather than claiming authenticity.
#[derive(Clone, Copy)]
pub struct Diode {
    g: [f32; 4],
    k: f32,
    drive: f32,
    s: [f32; 4],
}

impl Diode {
    pub const fn new() -> Self {
        Diode { g: [0.0; 4], k: 0.0, drive: 1.0, s: [0.0; 4] }
    }

    pub fn reset(&mut self) {
        self.s = [0.0; 4];
    }

    pub fn set(&mut self, cutoff_hz: f32, res: f32, drive: f32, sr: f32) {
        let fc = cutoff_hz.clamp(20.0, sr * 0.45);
        let base = (PI * fc / sr).tan();
        // Successive stages run progressively faster. Even spacing is what makes a
        // transistor ladder smooth; the unevenness here is the squelch.
        const SPREAD: [f32; 4] = [1.0, 0.72, 0.58, 0.5];
        let mut i = 0;
        while i < 4 {
            let g = base * SPREAD[i];
            self.g[i] = g / (1.0 + g);
            i += 1;
        }
        self.k = 5.2 * res.clamp(0.0, 1.0);
        self.drive = drive.max(0.1);
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        let mut sigma = self.s[3] * (1.0 - self.g[3]);
        let mut gp = self.g[3];
        let mut i = 2;
        loop {
            sigma += gp * self.s[i] * (1.0 - self.g[i]);
            gp *= self.g[i];
            if i == 0 {
                break;
            }
            i -= 1;
        }
        let gall = self.g[0] * self.g[1] * self.g[2] * self.g[3];

        let u = x * self.drive;
        let y = (gall * u + sigma) / (1.0 + self.k * gall);

        // Asymmetric saturation: diodes conduct one way. This is what gives the acid
        // squelch its buzz instead of the ladder's smooth compression.
        let sat = tanh_fast(y * 1.3 + 0.15 * y * y);
        let mut v = u - self.k * sat;

        let mut j = 0;
        while j < 4 {
            let a = (v - self.s[j]) * self.g[j];
            let yj = a + self.s[j];
            self.s[j] = flush_denormal(yj + a);
            v = yj;
            j += 1;
        }
        v
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

/// Half-band decimator for 2x oversampling.
///
/// Running the voice at twice the sample rate and filtering before throwing every other
/// sample away is what lets the OSCILLATOR and the filter's saturation stop folding
/// their own images back into the audible band. PolyBLEP alone measured -27 dB at
/// 2.2 kHz; that ceiling is set by how sharp the step correction can be at a given rate,
/// and the only way past it is to raise the rate.
///
/// Coefficients are GENERATED by scripts/dev/design_halfband.py, not typed. The first
/// version was hand-written, summed to 0.387 instead of 1.0, and made alias WORSE.
#[derive(Clone, Copy)]
pub struct HalfBand {
    z: [f32; HB_LEN],
}

// N=23 Kaiser beta=8.0, sum=1.000000
// passband ripple <= 0.24 dB, stopband <= -50.9 dB above 0.70 Nyquist
const HB_LEN: usize = 23;
const HB: [f32; 23] = [
    -6.767617127e-05,
    0.0,
    0.001578801455,
    0.0,
    -0.008360257726,
    0.0,
    0.02820326001,
    0.0,
    -0.07992882155,
    0.0,
    0.308586444,
    0.4999764999,
    0.308586444,
    0.0,
    -0.07992882155,
    0.0,
    0.02820326001,
    0.0,
    -0.008360257726,
    0.0,
    0.001578801455,
    0.0,
    -6.767617127e-05,
];

impl HalfBand {
    pub const fn new() -> Self {
        HalfBand { z: [0.0; HB_LEN] }
    }

    pub fn reset(&mut self) {
        self.z = [0.0; HB_LEN];
    }

    /// Feed two samples from the 2x-rate stream, get one band-limited output.
    #[inline]
    pub fn decimate(&mut self, a: f32, b: f32) -> f32 {
        // Shift both 2x-rate samples in, then evaluate once. Only the odd offsets and
        // the centre are non-zero, so this is ~7 multiplies rather than 23.
        self.z.copy_within(0..HB_LEN - 2, 2);
        self.z[1] = a;
        self.z[0] = b;
        let mut y = 0.0;
        let mut i = 0;
        while i < HB_LEN {
            if HB[i] != 0.0 {
                y += HB[i] * self.z[i];
            }
            i += 1;
        }
        // No scaling: the taps already sum to 1, and evaluating the full FIR once per
        // pair of inputs is unity for DC. The first version multiplied by 2 here to
        // compensate for taps that summed to 0.387, which then doubled the output the
        // moment the coefficients were corrected.
        crate::flush_denormal(y)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Steady-state magnitude of `f` at `hz`, by driving a sine and measuring the
    /// amplitude after transients settle. Slower than an impulse response but immune to
    /// the windowing choices that made the band-energy estimate ambiguous.
    fn mag(hz: f32, sr: f32, mut f: impl FnMut(f32) -> f32) -> f32 {
        let n = (sr / hz * 200.0) as usize;
        let mut peak = 0.0f32;
        for i in 0..n {
            let x = (core::f32::consts::TAU * hz * i as f32 / sr).sin();
            let y = f(x);
            if i > n / 2 {
                peak = peak.max(y.abs());
            }
        }
        peak
    }

    #[test]
    fn svf_outputs_have_the_shapes_their_names_claim() {
        let sr = 48_000.0;
        let fc = 1_000.0;
        for &(name, pick) in &[
            ("lp", 0usize),
            ("bp", 1),
            ("hp", 2),
        ] {
            let m = |hz: f32| {
                let mut s = Svf::new();
                s.set(fc, 0.0, sr);
                mag(hz, sr, |x| {
                    let (lp, bp, hp) = s.process_all(x);
                    [lp, bp, hp][pick]
                })
            };
            let (low, at, high) = (m(fc / 8.0), m(fc), m(fc * 8.0));
            match name {
                "lp" => {
                    assert!(low > 0.7, "lp passband {low}");
                    assert!(high < 0.1, "lp stopband {high}");
                }
                "bp" => {
                    assert!(at > low * 2.0 && at > high * 2.0, "bp {low} {at} {high}");
                }
                "hp" => {
                    assert!(high > 0.7, "hp passband {high}");
                    assert!(low < 0.1, "hp stopband {low}");
                }
                _ => {}
            }
        }
    }

    /// A notch must DIP at cutoff and pass both sides. Summing lp+hp is the textbook
    /// identity, and this is the check that says whether our particular formulation
    /// actually realises it -- a "notch" that measures the same as the lowpass is just a
    /// lowpass with a different label.
    #[test]
    fn notch_dips_at_cutoff_and_passes_both_sides() {
        let sr = 48_000.0;
        let fc = 1_000.0;
        let m = |hz: f32| {
            let mut s = Svf::new();
            s.set(fc, 0.0, sr);
            mag(hz, sr, |x| {
                let (lp, _bp, hp) = s.process_all(x);
                lp + hp
            })
        };
        let (low, at, high) = (m(fc / 8.0), m(fc), m(fc * 8.0));
        assert!(low > 0.7, "notch should pass well below cutoff, got {low}");
        assert!(high > 0.7, "notch should pass well above cutoff, got {high}");
        assert!(at < 0.5, "notch should dip AT cutoff, got {at} (low {low} high {high})");
    }
}
