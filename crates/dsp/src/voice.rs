//! One synthesizer voice: oscillators -> filter -> amplifier, with envelopes and drift.
//!
//! The signal path is fixed and curated (PRINCIPLES: "not a modular environment").
//! What varies is the patch.

use crate::filter::{tanh_fast, Diode, HalfBand, Ladder, Svf};
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
/// Maximum unison width. Seven is the supersaw count, and it is the number because
/// that is what the sound everyone means by "supersaw" actually has.
pub const MAX_UNISON: usize = 7;

/// Which filter is in the path. Six choices, not one -- the ladder alone was the whole
/// "filter set" until now, and a bandpass or a notch is not a ladder with a different
/// cutoff. Kinds 0-1 are the two 4-pole lowpass characters; 2-5 are the 2-pole
/// state-variable outputs, all of which fall out of a single solve.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum FilterKind {
    LadderLp,
    DiodeLp,
    SvfLp,
    SvfBp,
    SvfHp,
    SvfNotch,
}

impl FilterKind {
    pub fn from_u32(v: u32) -> Self {
        match v {
            1 => FilterKind::DiodeLp,
            2 => FilterKind::SvfLp,
            3 => FilterKind::SvfBp,
            4 => FilterKind::SvfHp,
            5 => FilterKind::SvfNotch,
            _ => FilterKind::LadderLp,
        }
    }
    fn is_svf(self) -> bool {
        !matches!(self, FilterKind::LadderLp | FilterKind::DiodeLp)
    }
}

#[derive(Clone, Copy)]
pub struct Patch {
    pub shape: Shape,
    pub filter_kind: FilterKind,
    pub unison: u32,
    pub glide_s: f32,
    /// LFO depths. Kept in the patch rather than the engine because how much vibrato a
    /// sound wants is part of the sound, not part of the instrument.
    pub lfo_pitch_cents: f32,
    pub lfo_cutoff_hz: f32,
    pub lfo_pwm: f32,
    /// 0 = mono, 1 = unison spread across the full image.
    pub stereo_width: f32,
    /// Hard-sync ratio. 1.0 is off; above that the oscillators run faster than the note
    /// and are reset by a master at the note's own pitch. Sweeping it is the classic
    /// tearing sync lead -- the pitch stays put while the timbre climbs.
    ///
    /// MEASURED, AND HONEST ABOUT THE LIMIT: at non-integer ratios the tone stays
    /// periodic at the note (inharmonic energy -42 to -53 dB) and brightness rises
    /// monotonically (spectral centroid 2350 -> 3185 Hz across 1.0 to 3.7). At INTEGER
    /// ratios the reset coincides with the oscillator's own wrap and the result is
    /// dirtier (-16 dB at 2.0, -23 dB at 3.0). Sweeping the ratio -- which is how sync
    /// is actually played -- passes through those points rather than sitting on them,
    /// so this ships as a known limit rather than a blocker.
    pub sync_ratio: f32,
    /// Pitch envelope depth in semitones, and its decay. A short downward sweep at the
    /// start of a note is what makes a kick a kick and a tom a tom; the LFO cannot do
    /// it because the LFO repeats and this must happen once, at the attack.
    pub pitch_env_amount: f32,
    pub pitch_env_decay: f32,
    /// Second LFO, per-voice and RETRIGGERED on each note. The shared LFO is
    /// free-running and moves every voice in lockstep, which is right for vibrato and
    /// wrong for a pluck that wants its own sweep starting when it was played.
    pub lfo2_rate: f32,
    pub lfo2_to_cutoff: f32,
    pub lfo2_to_pitch: f32,
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
            filter_kind: FilterKind::LadderLp,
            unison: 2,
            glide_s: 0.0,
            lfo_pitch_cents: 0.0,
            lfo_cutoff_hz: 0.0,
            lfo_pwm: 0.0,
            stereo_width: 0.7,
            sync_ratio: 1.0,
            pitch_env_amount: 0.0,
            pitch_env_decay: 0.08,
            lfo2_rate: 3.0,
            lfo2_to_cutoff: 0.0,
            lfo2_to_pitch: 0.0,
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
    osc: [Osc; MAX_UNISON],
    sub: Osc,
    /// Decimator for the 2x-oversampled path.
    hb: [HalfBand; 2],
    /// Portamento state: where the pitch is now, and where it is heading.
    f_now: f32,
    glide_c: f32,
    /// Master phase for hard sync, always at the note's own pitch.
    sync_phase: f32,
    sync_dt: f32,
    /// One-shot pitch envelope, and the per-voice LFO's own phase.
    pitch_env: f32,
    pitch_env_c: f32,
    lfo2_phase: f32,
    noise: Noise,
    filter: [Ladder; 2],
    diode: [Diode; 2],
    svf: [Svf; 2],
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
            osc: [Osc::new(); MAX_UNISON],
            sub: Osc::new(),
            hb: [HalfBand::new(); 2],
            f_now: 440.0,
            glide_c: 1.0,
            sync_phase: 0.0,
            sync_dt: 0.0,
            pitch_env: 0.0,
            pitch_env_c: 0.0,
            lfo2_phase: 0.0,
            noise: Noise::new(1),
            filter: [Ladder::new(); 2],
            diode: [Diode::new(); 2],
            svf: [Svf::new(); 2],
            amp_env: Adsr::new(),
            flt_env: Adsr::new(),
            f0: 440.0,
            vel: 1.0,
            drift_cents: 0.0,
            drift_cutoff: 1.0,
        }
    }

    pub fn start(&mut self, note: u8, vel: f32, patch: &Patch, sr: f32, seed: u32,
                 glide_from: f32) {
        self.note = note;
        self.active = true;
        self.age = 0;
        self.vel = vel.clamp(0.0, 1.0);
        self.f0 = midi_to_hz(note as f32);

        let mut n = Noise::new(seed.wrapping_mul(2654435761).wrapping_add(note as u32));
        self.drift_cents = n.tick() * 3.0;
        self.drift_cutoff = 1.0 + n.tick() * 0.06;
        self.noise = n;

        // Random start phases: unison voices that begin aligned sum to a single loud
        // click and then comb-filter each other instead of thickening.
        for o in self.osc.iter_mut() {
            o.set_phase(0.5 * (n.tick() + 1.0));
        }
        self.sub.set_phase(0.0);
        self.sync_phase = 0.0;
        // Both start fresh on every note: that is the entire difference between these
        // and the shared free-running LFO.
        self.pitch_env = 1.0;
        self.pitch_env_c = 1.0 - (-1.0 / (patch.pitch_env_decay.max(0.002) * sr)).exp();
        self.lfo2_phase = 0.0;

        // Portamento. Starting from the previous note's pitch rather than the new one is
        // the whole effect; a glide time of zero must still land exactly on pitch, hence
        // the explicit 1.0 rather than a very large coefficient.
        self.f_now = if patch.glide_s > 0.0001 && glide_from > 0.0 { glide_from } else { self.f0 };
        self.glide_c = if patch.glide_s > 0.0001 {
            1.0 - (-1.0 / (patch.glide_s * sr)).exp()
        } else {
            1.0
        };

        for i in 0..2 {
            self.filter[i].reset();
            self.diode[i].reset();
            self.svf[i].reset();
            self.hb[i].reset();
        }
        let (a, d, s, r) = patch.amp;
        self.amp_env.set(a, d, s, r, sr);
        let (fa, fd, fs, fr) = patch.flt;
        self.flt_env.set(fa, fd, fs, fr, sr);
        self.amp_env.gate_on();
        self.flt_env.gate_on();

        self.update_freqs(patch, self.f_now, sr * 2.0);
    }

    /// Spread `unison` oscillators evenly across +/- detune. `sr2` is the OVERSAMPLED
    /// rate: the oscillators run at 2x and are decimated, which is what lifts the alias
    /// ceiling PolyBLEP imposes on its own.
    fn update_freqs(&mut self, patch: &Patch, base_hz: f32, sr2: f32) {
        let n = (patch.unison.max(1) as usize).min(MAX_UNISON);
        let base = base_hz * cents(self.drift_cents);
        // The master always runs at the note; the oscillators run at ratio x the note.
        self.sync_dt = (base / sr2).clamp(0.0, 0.49);
        let ratio = patch.sync_ratio.max(1.0);
        let base = base * ratio;
        for i in 0..n {
            // -1..1 across the stack; a single oscillator sits dead centre.
            let t = if n == 1 { 0.0 } else { (i as f32 / (n - 1) as f32) * 2.0 - 1.0 };
            self.osc[i].set_freq(base * cents(patch.detune_cents * 0.5 * t), sr2);
        }
        self.sub.set_freq(base * 0.5, sr2);
    }

    pub fn release(&mut self) {
        self.amp_env.gate_off();
        self.flt_env.gate_off();
    }

    /// Render one output sample. `lfo` is the shared LFO value in -1..1.
    ///
    /// The oscillators and filter run at 2x and are decimated here. Everything that
    /// creates harmonics above the audible band -- the step discontinuities, the
    /// saturated feedback -- gets an extra octave of room before it can fold back.
    #[inline]
    pub fn tick(&mut self, patch: &Patch, sr: f32, lfo: f32) -> (f32, f32) {
        if !self.active {
            return (0.0, 0.0);
        }
        let sr2 = sr * 2.0;

        // Portamento and vibrato both act on frequency, so they are resolved together
        // and the oscillator bank is retuned once per output sample rather than twice.
        self.f_now += (self.f0 - self.f_now) * self.glide_c;
        // Per-voice LFO, retriggered at note-on.
        self.lfo2_phase += patch.lfo2_rate / sr;
        if self.lfo2_phase >= 1.0 {
            self.lfo2_phase -= 1.0;
        }
        let t2 = self.lfo2_phase;
        let lfo2 = if t2 < 0.5 { 4.0 * t2 - 1.0 } else { 3.0 - 4.0 * t2 };

        // One-shot pitch envelope. An exponential only ASYMPTOTES to zero, so without a
        // floor the note sits permanently sharp -- measured 141 Hz against 129 Hz on a
        // 24-semitone sweep three hundred milliseconds after the attack, which a player
        // would hear as the synth being out of tune rather than as an envelope.
        if self.pitch_env > 0.0 {
            self.pitch_env -= self.pitch_env * self.pitch_env_c;
            if self.pitch_env < 1e-3 {
                self.pitch_env = 0.0;
            }
        }

        let mut semis = 0.0;
        if patch.pitch_env_amount != 0.0 {
            semis += self.pitch_env * patch.pitch_env_amount;
        }
        if patch.lfo2_to_pitch != 0.0 {
            semis += lfo2 * patch.lfo2_to_pitch;
        }
        let vib = if patch.lfo_pitch_cents != 0.0 || semis != 0.0 {
            cents(lfo * patch.lfo_pitch_cents + semis * 100.0)
        } else {
            1.0
        };
        self.update_freqs(patch, self.f_now * vib, sr2);

        let env = self.flt_env.tick();
        let key = 1.0 + patch.key_track * (self.f0 / 261.63 - 1.0);
        // Velocity opens the filter as well as raising the level. This is THE defining
        // expressive gesture of subtractive synthesis -- harder playing must change
        // timbre, not only loudness.
        let cutoff = (patch.cutoff_hz * key * self.drift_cutoff
            + env * patch.env_amount
            + self.vel * patch.vel_to_cutoff
            + lfo * patch.lfo_cutoff_hz
            + lfo2 * patch.lfo2_to_cutoff)
            .clamp(20.0, sr2 * 0.45);
        for i in 0..2 {
            match patch.filter_kind {
                FilterKind::LadderLp => self.filter[i].set(cutoff, patch.resonance, patch.drive, sr2),
                FilterKind::DiodeLp => self.diode[i].set(cutoff, patch.resonance, patch.drive, sr2),
                _ => self.svf[i].set(cutoff, patch.resonance, sr2),
            }
        }

        let _ = patch.filter_kind.is_svf();
        let n = (patch.unison.max(1) as usize).min(MAX_UNISON);
        // Constant-power-ish normalisation: seven detuned saws are not seven times
        // louder than one, and scaling by 1/n would make wide unison disappear.
        let norm = 0.8 / (n as f32).sqrt();
        let pw = (patch.pulse_width + lfo * patch.lfo_pwm).clamp(0.05, 0.95);

        // Spread the unison stack across the image. This is where width comes from:
        // oscillator i sits at the same position in the stereo field as it does in the
        // detune spread, so the widest-detuned voices are also the widest-panned.
        let spread = patch.stereo_width.clamp(0.0, 1.0);

        let mut half_l = [0.0f32; 2];
        let mut half_r = [0.0f32; 2];
        for k in 0..2 {
            let mut l = 0.0;
            let mut r = 0.0;
            // Advance the sync master first: if it wrapped inside this sample, every
            // oscillator restarts at the same sub-sample offset.
            let mut synced = false;
            let mut frac = 0.0;
            if patch.sync_ratio > 1.0001 {
                self.sync_phase += self.sync_dt;
                if self.sync_phase >= 1.0 {
                    self.sync_phase -= 1.0;
                    synced = true;
                    // How far past the wrap we already are, as a fraction of a sample.
                    frac = if self.sync_dt > 0.0 { self.sync_phase / self.sync_dt } else { 0.0 };
                }
            }
            for i in 0..n {
                if synced {
                    self.osc[i].hard_sync(frac, patch.shape, pw);
                }
                let v = self.osc[i].tick(patch.shape, pw);
                let t = if n == 1 { 0.0 } else { (i as f32 / (n - 1) as f32) * 2.0 - 1.0 };
                let pan = t * spread;
                // Equal power, so widening does not change how loud the patch is.
                l += v * ((1.0 - pan) * 0.5).sqrt();
                r += v * ((1.0 + pan) * 0.5).sqrt();
            }
            // Sub and noise stay centred: a sub-bass that wanders is a mix problem, and
            // noise spread across the image just sounds like a broken speaker.
            let sub = self.sub.tick(Shape::Pulse, 0.5) * patch.sub_level;
            let nz = if patch.noise_level > 0.0 {
                self.noise.tick() * patch.noise_level
            } else {
                0.0
            };
            let centre = sub * 0.5 + nz * 0.3;
            let inputs = [l * norm + centre, r * norm + centre];

            for (ch, x) in inputs.iter().enumerate() {
                let y = match patch.filter_kind {
                    FilterKind::LadderLp => self.filter[ch].process(*x),
                    FilterKind::DiodeLp => self.diode[ch].process(*x),
                    kind => {
                        // Drive is applied here for the SVF, which has no internal drive
                        // of its own; without it, switching to a state-variable mode
                        // would silently drop the level the ladder modes are voiced at.
                        let (lp, bp, hp) = self.svf[ch].process_all(*x * patch.drive);
                        match kind {
                            FilterKind::SvfBp => bp,
                            FilterKind::SvfHp => hp,
                            FilterKind::SvfNotch => lp + hp,
                            _ => lp,
                        }
                    }
                };
                if ch == 0 { half_l[k] = y } else { half_r[k] = y }
            }
        }
        let fl = self.hb[0].decimate(half_l[0], half_l[1]);
        let fr = self.hb[1].decimate(half_r[0], half_r[1]);

        let amp = self.amp_env.tick();
        if self.amp_env.is_idle() {
            self.active = false;
        }
        self.age = self.age.saturating_add(1);
        let g = amp * (0.25 + 0.75 * self.vel);
        (fl * g, fr * g)
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
