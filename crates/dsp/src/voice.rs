//! One synthesizer voice: oscillators -> filter -> amplifier, with envelopes and drift.
//!
//! The signal path is fixed and curated (PRINCIPLES: "not a modular environment").
//! What varies is the patch.

use crate::filter::{tanh_fast, Ladder};
use crate::flush_denormal;
use crate::osc::{Noise, Osc, Shape};

/// Analog-style ADSR. Exponential approach rather than linear ramps: a linear decay is
/// one of the reliable giveaways that a synth is digital, because no analog envelope
/// generator discharges a capacitor in a straight line.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Stage {
    Idle,
    Attack,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy)]
pub struct Adsr {
    stage: Stage,
    level: f32,
    a: f32,
    d: f32,
    s: f32,
    r: f32,
}

impl Adsr {
    pub const fn new() -> Self {
        Adsr { stage: Stage::Idle, level: 0.0, a: 0.0, d: 0.0, s: 0.7, r: 0.0 }
    }

    /// Times in seconds. Converted to one-pole coefficients; the +1 keeps a zero time
    /// from producing a divide-by-zero rather than an instant attack.
    pub fn set(&mut self, a: f32, d: f32, s: f32, r: f32, sr: f32) {
        self.a = 1.0 - (-1.0 / (a.max(0.0005) * sr)).exp();
        self.d = 1.0 - (-1.0 / (d.max(0.0005) * sr)).exp();
        self.s = s.clamp(0.0, 1.0);
        self.r = 1.0 - (-1.0 / (r.max(0.0005) * sr)).exp();
    }

    pub fn gate_on(&mut self) {
        self.stage = Stage::Attack;
    }

    pub fn gate_off(&mut self) {
        if self.stage != Stage::Idle {
            self.stage = Stage::Release;
        }
    }

    pub fn is_idle(&self) -> bool {
        self.stage == Stage::Idle
    }

    #[inline]
    pub fn tick(&mut self) -> f32 {
        match self.stage {
            Stage::Idle => return 0.0,
            Stage::Attack => {
                // Overshoot the target so the attack actually reaches 1.0 in finite
                // time instead of asymptotically crawling at it.
                self.level += (1.2 - self.level) * self.a;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.stage = Stage::Decay;
                }
            }
            Stage::Decay => {
                self.level += (self.s - self.level) * self.d;
                if (self.level - self.s).abs() < 1e-4 {
                    self.stage = Stage::Sustain;
                }
            }
            Stage::Sustain => self.level = self.s,
            Stage::Release => {
                self.level -= self.level * self.r;
                if self.level < 1e-4 {
                    self.level = 0.0;
                    self.stage = Stage::Idle;
                }
            }
        }
        self.level = flush_denormal(self.level);
        self.level
    }
}

/// Patch parameters. PRINCIPLES #4: these are the controls players actually reach for,
/// so they are one argument away rather than buried.
#[derive(Clone, Copy)]
pub struct Patch {
    pub shape: Shape,
    pub pulse_width: f32,
    pub detune_cents: f32,
    pub sub_level: f32,
    pub noise_level: f32,
    pub cutoff_hz: f32,
    pub resonance: f32,
    pub drive: f32,
    pub env_amount: f32,
    pub key_track: f32,
    pub amp: (f32, f32, f32, f32),
    pub flt: (f32, f32, f32, f32),
    pub vel_to_cutoff: f32,
}

impl Patch {
    /// A usable default so the first note anyone plays is not a mistake.
    pub const fn init() -> Self {
        Patch {
            shape: Shape::Saw,
            pulse_width: 0.5,
            detune_cents: 8.0,
            sub_level: 0.35,
            noise_level: 0.0,
            cutoff_hz: 1200.0,
            resonance: 0.35,
            drive: 1.2,
            env_amount: 3200.0,
            key_track: 0.35,
            amp: (0.005, 0.20, 0.75, 0.25),
            flt: (0.002, 0.35, 0.30, 0.25),
            vel_to_cutoff: 2400.0,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Voice {
    pub note: u8,
    pub active: bool,
    pub age: u32,
    osc_a: Osc,
    osc_b: Osc,
    sub: Osc,
    noise: Noise,
    filter: Ladder,
    amp_env: Adsr,
    flt_env: Adsr,
    f0: f32,
    vel: f32,
    /// Per-voice constant offsets. Without them a chord phase-locks and the result
    /// sounds like a cheap plugin; with them the same patch breathes. Nearly free.
    drift_cents: f32,
    drift_cutoff: f32,
}

impl Voice {
    pub const fn new() -> Self {
        Voice {
            note: 0,
            active: false,
            age: 0,
            osc_a: Osc::new(),
            osc_b: Osc::new(),
            sub: Osc::new(),
            noise: Noise::new(1),
            filter: Ladder::new(),
            amp_env: Adsr::new(),
            flt_env: Adsr::new(),
            f0: 440.0,
            vel: 1.0,
            drift_cents: 0.0,
            drift_cutoff: 1.0,
        }
    }

    pub fn start(&mut self, note: u8, vel: f32, patch: &Patch, sr: f32, seed: u32) {
        self.note = note;
        self.active = true;
        self.age = 0;
        self.vel = vel.clamp(0.0, 1.0);
        self.f0 = midi_to_hz(note as f32);

        let mut n = Noise::new(seed.wrapping_mul(2654435761).wrapping_add(note as u32));
        self.drift_cents = n.tick() * 3.0;
        self.drift_cutoff = 1.0 + n.tick() * 0.06;
        self.noise = n;

        self.osc_a.set_phase(0.5 * (n.tick() + 1.0));
        self.osc_b.set_phase(0.5 * (n.tick() + 1.0));
        self.sub.set_phase(0.0);

        self.filter.reset();
        let (a, d, s, r) = patch.amp;
        self.amp_env.set(a, d, s, r, sr);
        let (fa, fd, fs, fr) = patch.flt;
        self.flt_env.set(fa, fd, fs, fr, sr);
        self.amp_env.gate_on();
        self.flt_env.gate_on();

        self.update_freqs(patch, sr);
    }

    fn update_freqs(&mut self, patch: &Patch, sr: f32) {
        let base = self.f0 * cents(self.drift_cents);
        self.osc_a.set_freq(base * cents(-patch.detune_cents * 0.5), sr);
        self.osc_b.set_freq(base * cents(patch.detune_cents * 0.5), sr);
        self.sub.set_freq(base * 0.5, sr);
    }

    pub fn release(&mut self) {
        self.amp_env.gate_off();
        self.flt_env.gate_off();
    }

    #[inline]
    pub fn tick(&mut self, patch: &Patch, sr: f32) -> f32 {
        if !self.active {
            return 0.0;
        }
        let a = self.osc_a.tick(patch.shape, patch.pulse_width);
        let b = self.osc_b.tick(patch.shape, patch.pulse_width);
        let sub = self.sub.tick(Shape::Pulse, 0.5) * patch.sub_level;
        let nz = if patch.noise_level > 0.0 {
            self.noise.tick() * patch.noise_level
        } else {
            0.0
        };
        let mixed = (a + b) * 0.4 + sub * 0.5 + nz * 0.3;

        // Velocity opens the filter as well as raising the level. This is THE defining
        // expressive gesture of subtractive synthesis -- harder playing must change
        // timbre, not only loudness.
        let env = self.flt_env.tick();
        let key = 1.0 + patch.key_track * (self.f0 / 261.63 - 1.0);
        let cutoff = (patch.cutoff_hz * key * self.drift_cutoff
            + env * patch.env_amount
            + self.vel * patch.vel_to_cutoff)
            .clamp(20.0, sr * 0.45);
        self.filter.set(cutoff, patch.resonance, patch.drive, sr);

        let filtered = self.filter.process(mixed);
        let amp = self.amp_env.tick();
        if self.amp_env.is_idle() {
            self.active = false;
        }
        self.age = self.age.saturating_add(1);
        filtered * amp * (0.25 + 0.75 * self.vel)
    }
}

#[inline]
pub fn midi_to_hz(n: f32) -> f32 {
    440.0 * ((n - 69.0) / 12.0).exp2()
}

#[inline]
fn cents(c: f32) -> f32 {
    (c / 1200.0).exp2()
}

/// Master limiter: value- and slope-continuous at the knee, so it never introduces a
/// discontinuity of its own. Degradation is acceptable; corruption is not.
#[inline]
pub fn soft_clip(x: f32) -> f32 {
    const KNEE: f32 = 0.7;
    if x.abs() <= KNEE {
        x
    } else {
        let s = x.signum();
        let over = x.abs() - KNEE;
        s * (KNEE + (1.0 - KNEE) * tanh_fast(over / (1.0 - KNEE)))
    }
}
