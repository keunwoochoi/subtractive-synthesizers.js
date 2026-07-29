//! Effects that are part of the instrument, not a post-process.
//!
//! This is a deliberate architectural departure from the sibling project, where body
//! resonance lives INSIDE the model. Here the chorus is part of the patch: a
//! string-machine pad without its ensemble is not a quieter version of that sound, it
//! is a different and worse one. The architecture doc calls this milestone-critical
//! rather than polish, and the pad preset shipped with a blurb admitting it was missing.

use crate::flush_denormal;
use core::f32::consts::TAU;

/// Longest modulated delay we can address, at any supported sample rate.
/// 4096 samples is 42 ms at 96 kHz — comfortably past the ~30 ms a chorus ever needs.
const DELAY_LEN: usize = 4096;
const MASK: usize = DELAY_LEN - 1;

/// Three-tap bucket-brigade-style chorus/ensemble.
///
/// Three taps rather than two because the classic ensemble sound is three phases at
/// 120° — two taps give a chorus, three give the wide, slightly seasick shimmer that
/// makes a pad sound like a string machine instead of a detuned saw.
#[derive(Clone, Copy)]
pub struct Chorus {
    buf: [f32; DELAY_LEN],
    write: usize,
    phase: f32,
    inc: f32,
    depth_s: f32,
    base_s: f32,
    mix: f32,
    sr: f32,
    /// One-pole lowpass per tap. A BBD line is not flat — it loses top end with every
    /// bucket, and that dullness in the wet path is most of why the effect sits behind
    /// the dry signal instead of on top of it.
    lp: [f32; 3],
}

impl Chorus {
    pub const fn new() -> Self {
        Chorus {
            buf: [0.0; DELAY_LEN],
            write: 0,
            phase: 0.0,
            inc: 0.0,
            depth_s: 0.0,
            base_s: 0.0,
            mix: 0.0,
            sr: 48_000.0,
            lp: [0.0; 3],
        }
    }

    pub fn set(&mut self, rate_hz: f32, depth_ms: f32, mix: f32, sr: f32) {
        self.sr = sr;
        self.inc = rate_hz.clamp(0.02, 8.0) / sr;
        self.depth_s = depth_ms.clamp(0.0, 12.0) * 0.001 * sr;
        self.base_s = 0.012 * sr; // 12 ms centre
        self.mix = mix.clamp(0.0, 1.0);
    }

    pub fn reset(&mut self) {
        self.buf = [0.0; DELAY_LEN];
        self.write = 0;
        self.lp = [0.0; 3];
    }

    pub fn is_active(&self) -> bool {
        self.mix > 0.0005
    }

    /// Linear interpolation on the read tap. Cubic would be more accurate, but the
    /// delay is being swept continuously and the error lands as a tiny amount of
    /// high-frequency noise inside an effect whose whole job is to be blurry.
    #[inline]
    fn read(&self, delay: f32) -> f32 {
        let d = delay.clamp(1.0, (DELAY_LEN - 2) as f32);
        let pos = self.write as f32 - d;
        let pos = if pos < 0.0 { pos + DELAY_LEN as f32 } else { pos };
        let i = pos as usize & MASK;
        let frac = pos - pos.floor();
        let a = self.buf[i];
        let b = self.buf[(i + 1) & MASK];
        a + (b - a) * frac
    }

    #[inline]
    pub fn process(&mut self, x: f32) -> f32 {
        self.buf[self.write] = x;
        self.write = (self.write + 1) & MASK;

        self.phase += self.inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        let mut wet = 0.0;
        for k in 0..3 {
            // 120 degrees apart.
            let p = self.phase + k as f32 / 3.0;
            let lfo = (TAU * p).sin();
            let s = self.read(self.base_s + self.depth_s * lfo);
            // ~4 kHz one-pole, the BBD dullness.
            let c = 1.0 - (-TAU * 4000.0 / self.sr).exp();
            self.lp[k] = flush_denormal(self.lp[k] + c * (s - self.lp[k]));
            wet += self.lp[k];
        }
        wet *= 0.4;

        x * (1.0 - 0.5 * self.mix) + wet * self.mix
    }
}
