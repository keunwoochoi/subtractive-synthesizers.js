//! Effects that are part of the instrument, not a post-process.
//!
//! This is a deliberate architectural departure from the sibling project, where body
//! resonance lives INSIDE the model. Here the chorus is part of the patch: a
//! string-machine pad without its ensemble is not a quieter version of that sound, it
//! is a different and worse one. The architecture doc calls this milestone-critical
//! rather than polish, and the pad preset shipped with a blurb admitting it was missing.

extern crate alloc;

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
    pub fn process(&mut self, xl: f32, xr: f32) -> (f32, f32) {
        // The line is fed the mono sum; the WIDTH comes from where the taps sit, not
        // from carrying two delay lines.
        let x = (xl + xr) * 0.5;
        self.buf[self.write] = x;
        self.write = (self.write + 1) & MASK;

        self.phase += self.inc;
        if self.phase >= 1.0 {
            self.phase -= 1.0;
        }

        // Pan the three taps hard left / centre / hard right. In mono all three summed
        // to one point and the third tap bought nothing but cost; spread, they are what
        // makes an ensemble sound wide rather than merely detuned.
        const TAP_PAN: [f32; 3] = [-1.0, 0.0, 1.0];
        let mut wl = 0.0;
        let mut wr = 0.0;
        for k in 0..3 {
            // 120 degrees apart.
            let p = self.phase + k as f32 / 3.0;
            let lfo = (TAU * p).sin();
            let s = self.read(self.base_s + self.depth_s * lfo);
            // ~4 kHz one-pole, the BBD dullness.
            let c = 1.0 - (-TAU * 4000.0 / self.sr).exp();
            self.lp[k] = flush_denormal(self.lp[k] + c * (s - self.lp[k]));
            let pan = TAP_PAN[k];
            wl += self.lp[k] * ((1.0 - pan) * 0.5).sqrt();
            wr += self.lp[k] * ((1.0 + pan) * 0.5).sqrt();
        }
        let dry = 1.0 - 0.5 * self.mix;
        (xl * dry + wl * 0.55 * self.mix, xr * dry + wr * 0.55 * self.mix)
    }
}

// ---------------------------------------------------------------------------------
// The two effects every hardware synth ships with, and the reason it ships with them:
// a synth without reverb and delay is not a smaller product, it is an unfinished one.
// Owner, 2026-07-29: "if we can provide those ... sort of extra peripheral optional
// features ... that'd be great. But again, only for those used very, very commonly."
//
// That last clause is the whole scope rule. Reverb, delay and chorus are on the front
// panel of essentially every synthesizer made since 1985. A compressor, an EQ, a
// bitcrusher and a phaser are not, and stay out — this is an instrument, not a rack.
//
// Buffers here are Vec, allocated once when the engine is created. "Allocation-free"
// governs the RENDER path, not init; and a 128 KB array inside a Copy struct would be
// constructed on the WASM stack before being moved into the box, which is a real way to
// blow a 1 MB stack.
// ---------------------------------------------------------------------------------

/// Feedback delay with a damped repeat path.
///
/// The lowpass in the feedback is what makes a delay sound like an effect rather than a
/// stack of copies: each repeat loses top end, so the tail recedes instead of piling up.
pub struct Delay {
    buf: alloc::vec::Vec<f32>,
    buf_r: alloc::vec::Vec<f32>,
    write: usize,
    delay: f32,
    feedback: f32,
    mix: f32,
    damp_state: f32,
    damp_r: f32,
    damp_c: f32,
}

impl Delay {
    pub fn new(sr: f32) -> Self {
        // 1.5 s at any supported rate.
        let n = (sr * 1.5) as usize + 4;
        Delay {
            buf: alloc::vec![0.0; n],
            buf_r: alloc::vec![0.0; n],
            write: 0,
            delay: sr * 0.25,
            feedback: 0.35,
            mix: 0.0,
            damp_state: 0.0,
            damp_r: 0.0,
            damp_c: 0.35,
        }
    }

    pub fn set(&mut self, time_s: f32, feedback: f32, damp_hz: f32, mix: f32, sr: f32) {
        let max = (self.buf.len() - 2) as f32;
        self.delay = (time_s.clamp(0.01, 1.5) * sr).min(max);
        // Cap below 1.0 or the tail never decays and the line saturates into the limiter.
        self.feedback = feedback.clamp(0.0, 0.92);
        self.damp_c = 1.0 - (-TAU * damp_hz.clamp(400.0, 16000.0) / sr).exp();
        self.mix = mix.clamp(0.0, 1.0);
    }

    pub fn is_active(&self) -> bool {
        self.mix > 0.0005
    }

    pub fn reset(&mut self) {
        for s in self.buf.iter_mut().chain(self.buf_r.iter_mut()) {
            *s = 0.0;
        }
        self.damp_state = 0.0;
        self.damp_r = 0.0;
    }

    #[inline]
    fn tap(buf: &[f32], write: usize, delay: f32) -> f32 {
        let n = buf.len();
        let pos = write as f32 - delay;
        let pos = if pos < 0.0 { pos + n as f32 } else { pos };
        let i = pos as usize % n;
        let frac = pos - pos.floor();
        let a = buf[i];
        let b = buf[(i + 1) % n];
        a + (b - a) * frac
    }

    /// Ping-pong: each side's repeat feeds the OTHER side. A mono delay just makes a
    /// sound longer; a ping-pong delay makes it move, which is why every hardware unit
    /// that has one puts it on the front panel.
    #[inline]
    pub fn process(&mut self, xl: f32, xr: f32) -> (f32, f32) {
        let n = self.buf.len();
        let el = Self::tap(&self.buf, self.write, self.delay);
        let er = Self::tap(&self.buf_r, self.write, self.delay);

        self.damp_state = flush_denormal(self.damp_state + self.damp_c * (el - self.damp_state));
        self.damp_r = flush_denormal(self.damp_r + self.damp_c * (er - self.damp_r));

        // The input enters ONE side only. Feeding both and crossing the feedback looks
        // like ping-pong on paper and is silent as an effect: with a symmetric input the
        // two lines stay symmetric forever and L == R exactly, which is what the first
        // version measured (-inf dB of difference). Injecting on the left makes the
        // first repeat left, the second right, and so on -- the bounce IS the effect.
        let x = (xl + xr) * 0.5;
        self.buf[self.write] = flush_denormal(x + self.damp_r * self.feedback);
        self.buf_r[self.write] = flush_denormal(self.damp_state * self.feedback);
        self.write = (self.write + 1) % n;

        (xl + el * self.mix, xr + er * self.mix)
    }
}

/// Small feedback-delay-network reverb: predelay, four diffusing allpasses, then four
/// damped delay lines mixed through a Householder matrix.
///
/// Four lines rather than eight because eight is twice the cost for a difference that
/// does not survive a synth patch sitting on top of it, and this is a reverb for an
/// instrument, not a mastering plate.
pub struct Reverb {
    predelay: alloc::vec::Vec<f32>,
    pd_write: usize,
    pd_len: usize,
    ap: [alloc::vec::Vec<f32>; 4],
    ap_i: [usize; 4],
    lines: [alloc::vec::Vec<f32>; 4],
    li: [usize; 4],
    damp: [f32; 4],
    damp_c: f32,
    feedback: f32,
    mix: f32,
}

impl Reverb {
    pub fn new(sr: f32) -> Self {
        let ms = |m: f32| ((sr * m / 1000.0) as usize).max(4);
        // Mutually prime-ish lengths: equal or harmonically related lines make the tail
        // ring on a pitch instead of dissolving.
        let ap_ms = [13.7, 19.3, 27.1, 35.9];
        let ln_ms = [61.7, 79.3, 97.1, 113.9];
        Reverb {
            predelay: alloc::vec![0.0; ms(120.0)],
            pd_write: 0,
            pd_len: ms(20.0),
            ap: core::array::from_fn(|i| alloc::vec![0.0; ms(ap_ms[i])]),
            ap_i: [0; 4],
            lines: core::array::from_fn(|i| alloc::vec![0.0; ms(ln_ms[i])]),
            li: [0; 4],
            damp: [0.0; 4],
            damp_c: 0.3,
            feedback: 0.72,
            mix: 0.0,
        }
    }

    /// `size` 0..1 scales the tail length; `damp_hz` sets how fast the top end dies.
    pub fn set(&mut self, size: f32, damp_hz: f32, mix: f32, predelay_ms: f32, sr: f32) {
        self.feedback = 0.45 + 0.52 * size.clamp(0.0, 1.0);
        self.damp_c = 1.0 - (-TAU * damp_hz.clamp(500.0, 16000.0) / sr).exp();
        self.mix = mix.clamp(0.0, 1.0);
        self.pd_len = ((predelay_ms.clamp(0.0, 100.0) / 1000.0 * sr) as usize)
            .min(self.predelay.len() - 1)
            .max(1);
    }

    pub fn is_active(&self) -> bool {
        self.mix > 0.0005
    }

    pub fn reset(&mut self) {
        for b in self.ap.iter_mut().chain(self.lines.iter_mut()) {
            for s in b.iter_mut() {
                *s = 0.0;
            }
        }
        for s in self.predelay.iter_mut() {
            *s = 0.0;
        }
        self.damp = [0.0; 4];
    }

    #[inline]
    fn allpass(&mut self, k: usize, x: f32) -> f32 {
        let n = self.ap[k].len();
        let i = self.ap_i[k];
        let d = self.ap[k][i];
        let y = -x + d;
        self.ap[k][i] = flush_denormal(x + d * 0.5);
        self.ap_i[k] = (i + 1) % n;
        y
    }

    #[inline]
    pub fn process(&mut self, xl: f32, xr: f32) -> (f32, f32) {
        let x = (xl + xr) * 0.5;
        // Predelay: the gap before the tail is most of what makes a space feel large.
        let pl = self.predelay.len();
        let rd = (self.pd_write + pl - self.pd_len) % pl;
        let pre = self.predelay[rd];
        self.predelay[self.pd_write] = x;
        self.pd_write = (self.pd_write + 1) % pl;

        let mut v = pre;
        for k in 0..4 {
            v = self.allpass(k, v);
        }

        let mut out = [0.0f32; 4];
        for k in 0..4 {
            out[k] = self.lines[k][self.li[k]];
        }

        // Householder feedback: every line feeds every other, which is what turns four
        // discrete echoes into a diffuse tail.
        let sum = (out[0] + out[1] + out[2] + out[3]) * 0.5;
        for k in 0..4 {
            let fed = out[k] - sum;
            self.damp[k] = flush_denormal(self.damp[k] + self.damp_c * (fed - self.damp[k]));
            let n = self.lines[k].len();
            self.lines[k][self.li[k]] = flush_denormal(v * 0.35 + self.damp[k] * self.feedback);
            self.li[k] = (self.li[k] + 1) % n;
        }

        // Lines 0/2 to the left, 1/3 to the right. Summing all four to one channel was
        // throwing away a stereo field the network already produced for free.
        let wl = (out[0] + out[2]) * 0.5;
        let wr = (out[1] + out[3]) * 0.5;
        (xl + wl * self.mix, xr + wr * self.mix)
    }
}
