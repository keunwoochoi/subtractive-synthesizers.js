//! subtractive-synthesizers.js DSP core.
//!
//! One engine, rendered inside a single AudioWorklet, allocation-free after init.
//! The public boundary is a hand-rolled C ABI -- no wasm-bindgen on the hot path.
//!
//! PRINCIPLES: the audio thread is sacred. Nothing below allocates, locks, or calls
//! into JS once `engine_new` has returned.

#![deny(unsafe_op_in_unsafe_fn)]

pub mod filter;
pub mod fx;
pub mod osc;
pub mod voice;

use fx::{Chorus, Delay, Reverb};
use osc::Shape;
use voice::{soft_clip, Patch, Voice};

pub const MAX_BLOCK: usize = 128;
pub const MAX_VOICES: usize = 16;

/// WASM has no hardware flush-to-zero, and denormals in a recursive filter are the
/// single largest performance cliff in browser audio. Every recursive state variable
/// passes through this once per sample.
#[inline(always)]
pub fn flush_denormal(x: f32) -> f32 {
    if x.abs() < 1e-20 {
        0.0
    } else {
        x
    }
}

pub struct Engine {
    sr: f32,
    voices: [Voice; MAX_VOICES],
    patch: Patch,
    seed: u32,
    gain: f32,
    out: [f32; MAX_BLOCK],
    /// Measurement-only oscillator. Persistent because phase MUST be continuous across
    /// blocks: a probe that restarts every 128 samples manufactures a discontinuity at
    /// each boundary, and the alias metric would then be measuring the harness rather
    /// than the oscillator.
    probe: osc::Osc,
    probe_hz: f32,
    probe_hb: filter::HalfBand,
    probe_os: bool,
    /// Shared LFO. One per engine, as on most vintage synths -- a per-voice LFO makes a
    /// chord shimmer incoherently instead of moving together.
    lfo_phase: f32,
    lfo_rate: f32,
    /// Pitch of the last note started, so portamento has somewhere to glide FROM.
    last_f0: f32,
    lfo_buf: [f32; MAX_BLOCK],
    chorus: Chorus,
    chorus_rate: f32,
    chorus_depth: f32,
    chorus_mix: f32,
    delay: Delay,
    delay_time: f32,
    delay_fb: f32,
    delay_tone: f32,
    delay_mix: f32,
    reverb: Reverb,
    rev_size: f32,
    rev_damp: f32,
    rev_predelay: f32,
    rev_mix: f32,
}

impl Engine {
    pub fn new(sample_rate: f32) -> Self {
        let sr = if sample_rate > 0.0 { sample_rate } else { 48_000.0 };
        Engine {
            sr,
            voices: [Voice::new(); MAX_VOICES],
            patch: Patch::init(),
            seed: 0x2545_F491,
            gain: 0.35,
            out: [0.0; MAX_BLOCK],
            probe: osc::Osc::new(),
            probe_hz: -1.0,
            probe_hb: filter::HalfBand::new(),
            probe_os: true,
            lfo_phase: 0.0,
            lfo_rate: 5.0,
            last_f0: 0.0,
            lfo_buf: [0.0; MAX_BLOCK],
            chorus: Chorus::new(),
            chorus_rate: 0.6,
            chorus_depth: 3.0,
            chorus_mix: 0.0,
            delay: Delay::new(sr),
            delay_time: 0.25,
            delay_fb: 0.35,
            delay_tone: 3200.0,
            delay_mix: 0.0,
            reverb: Reverb::new(sr),
            rev_size: 0.6,
            rev_damp: 4200.0,
            rev_predelay: 18.0,
            rev_mix: 0.0,
        }
    }

    pub fn note_on(&mut self, note: u8, vel: f32) {
        // Retrigger an existing voice for the same note rather than stacking two.
        if let Some(i) = self.voices.iter().position(|v| v.active && v.note == note) {
            self.seed = self.seed.wrapping_mul(1664525).wrapping_add(1013904223);
            self.voices[i].start(note, vel, &self.patch, self.sr, self.seed, self.last_f0);
            self.last_f0 = voice::midi_to_hz(note as f32);
            return;
        }
        let idx = self
            .voices
            .iter()
            .position(|v| !v.active)
            // Steal the oldest. Degradation is acceptable; corruption is not.
            .unwrap_or_else(|| {
                let mut oldest = 0;
                for i in 1..MAX_VOICES {
                    if self.voices[i].age > self.voices[oldest].age {
                        oldest = i;
                    }
                }
                oldest
            });
        self.seed = self.seed.wrapping_mul(1664525).wrapping_add(1013904223);
        self.voices[idx].start(note, vel, &self.patch, self.sr, self.seed, self.last_f0);
        self.last_f0 = voice::midi_to_hz(note as f32);
    }

    pub fn note_off(&mut self, note: u8) {
        for v in self.voices.iter_mut() {
            if v.active && v.note == note {
                v.release();
            }
        }
    }

    pub fn all_off(&mut self) {
        for v in self.voices.iter_mut() {
            v.release();
        }
    }

    fn sync_delay(&mut self) {
        self.delay.set(self.delay_time, self.delay_fb, self.delay_tone, self.delay_mix, self.sr);
    }

    fn sync_reverb(&mut self) {
        self.reverb.set(self.rev_size, self.rev_damp, self.rev_mix, self.rev_predelay, self.sr);
    }

    fn sync_chorus(&mut self) {
        self.chorus.set(self.chorus_rate, self.chorus_depth, self.chorus_mix, self.sr);
    }

    pub fn active_voices(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    pub fn render(&mut self, frames: usize) {
        let n = frames.min(MAX_BLOCK);
        for s in self.out[..n].iter_mut() {
            *s = 0.0;
        }

        // The LFO is evaluated ONCE per block into a scratch buffer, then read by every
        // voice. Recomputing it inside the per-voice loop would advance its phase once
        // per voice, so a chord would modulate faster than a single note -- a bug that
        // only appears with polyphony and sounds like the LFO rate is unstable.
        let inc = self.lfo_rate / self.sr;
        for i in 0..n {
            self.lfo_phase += inc;
            if self.lfo_phase >= 1.0 {
                self.lfo_phase -= 1.0;
            }
            // Triangle: cheaper than a sine and the classic modulation shape anyway.
            let t = self.lfo_phase;
            self.lfo_buf[i] = if t < 0.5 { 4.0 * t - 1.0 } else { 3.0 - 4.0 * t };
        }

        for v in self.voices.iter_mut() {
            if !v.active {
                continue;
            }
            for i in 0..n {
                self.out[i] += v.tick(&self.patch, self.sr, self.lfo_buf[i]);
            }
        }
        if self.chorus.is_active() {
            for s in self.out[..n].iter_mut() {
                *s = self.chorus.process(*s);
            }
        }
        if self.delay.is_active() {
            for s in self.out[..n].iter_mut() {
                *s = self.delay.process(*s);
            }
        }
        if self.reverb.is_active() {
            for s in self.out[..n].iter_mut() {
                *s = self.reverb.process(*s);
            }
        }
        for s in self.out[..n].iter_mut() {
            *s = soft_clip(*s * self.gain);
        }
    }
}

// ---------------------------------------------------------------------------------
// C ABI. Scalar args on a raw pointer; audio crosses as a pointer into WASM memory.
// Nothing is marshalled, so there is no allocation on any control path.
// ---------------------------------------------------------------------------------

#[no_mangle]
pub extern "C" fn engine_new(sample_rate: f32) -> *mut Engine {
    Box::into_raw(Box::new(Engine::new(sample_rate)))
}

/// # Safety
/// `p` must come from `engine_new` and must not be used afterwards.
#[no_mangle]
pub unsafe extern "C" fn engine_free(p: *mut Engine) {
    if !p.is_null() {
        drop(unsafe { Box::from_raw(p) });
    }
}

macro_rules! eng {
    ($p:expr) => {
        match unsafe { $p.as_mut() } {
            Some(e) => e,
            None => return,
        }
    };
}

/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn note_on(p: *mut Engine, note: u32, vel: f32) {
    eng!(p).note_on(note.min(127) as u8, vel);
}

/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn note_off(p: *mut Engine, note: u32) {
    eng!(p).note_off(note.min(127) as u8);
}

/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn all_off(p: *mut Engine) {
    eng!(p).all_off();
}

/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn render(p: *mut Engine, frames: u32) {
    eng!(p).render(frames as usize);
}

/// # Safety
/// `p` must be a live pointer from `engine_new`. The returned pointer is valid for
/// `MAX_BLOCK` floats until the next call that grows WASM memory.
#[no_mangle]
pub unsafe extern "C" fn out_ptr(p: *mut Engine) -> *const f32 {
    match unsafe { p.as_ref() } {
        Some(e) => e.out.as_ptr(),
        None => core::ptr::null(),
    }
}

/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn active_voices(p: *mut Engine) -> u32 {
    match unsafe { p.as_ref() } {
        Some(e) => e.active_voices(),
        None => 0,
    }
}

/// Patch parameters, by index. One entry point rather than twenty exports keeps the
/// ABI small; the index list is generated into the TS side from one source.
///
/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn set_param(p: *mut Engine, id: u32, v: f32) {
    let e = eng!(p);
    match id {
        0 => e.patch.shape = Shape::from_u32(v as u32),
        1 => e.patch.pulse_width = v,
        2 => e.patch.detune_cents = v,
        3 => e.patch.sub_level = v,
        4 => e.patch.noise_level = v,
        5 => e.patch.cutoff_hz = v,
        6 => e.patch.resonance = v,
        7 => e.patch.drive = v,
        8 => e.patch.env_amount = v,
        9 => e.patch.key_track = v,
        10 => e.patch.amp.0 = v,
        11 => e.patch.amp.1 = v,
        12 => e.patch.amp.2 = v,
        13 => e.patch.amp.3 = v,
        14 => e.patch.flt.0 = v,
        15 => e.patch.flt.1 = v,
        16 => e.patch.flt.2 = v,
        17 => e.patch.flt.3 = v,
        18 => e.patch.vel_to_cutoff = v,
        19 => e.gain = v,
        20 => { e.chorus_rate = v; e.sync_chorus(); }
        21 => { e.chorus_depth = v; e.sync_chorus(); }
        22 => {
            let was = e.chorus.is_active();
            e.chorus_mix = v;
            e.sync_chorus();
            // Clear the line when switching the effect on, or the first block plays
            // back whatever was sitting in the buffer from the previous patch.
            if !was && e.chorus.is_active() {
                e.chorus.reset();
            }
        }
        23 => { let w = e.delay.is_active(); e.delay_mix = v; e.sync_delay();
                if !w && e.delay.is_active() { e.delay.reset(); } }
        24 => { e.delay_time = v; e.sync_delay(); }
        25 => { e.delay_fb = v; e.sync_delay(); }
        26 => { e.delay_tone = v; e.sync_delay(); }
        27 => { let w = e.reverb.is_active(); e.rev_mix = v; e.sync_reverb();
                if !w && e.reverb.is_active() { e.reverb.reset(); } }
        28 => { e.rev_size = v; e.sync_reverb(); }
        29 => { e.rev_damp = v; e.sync_reverb(); }
        30 => { e.rev_predelay = v; e.sync_reverb(); }
        31 => e.patch.unison = (v as u32).clamp(1, voice::MAX_UNISON as u32),
        32 => e.patch.glide_s = v.max(0.0),
        33 => e.lfo_rate = v.clamp(0.01, 20.0),
        34 => e.patch.lfo_pitch_cents = v,
        35 => e.patch.lfo_cutoff_hz = v,
        36 => e.patch.lfo_pwm = v,
        _ => {}
    }
}

/// Render one oscillator in isolation, bypassing filter and envelopes, so the
/// verification harness can grade the OSCILLATOR against its analytic prototype rather
/// than grading the whole voice and guessing which stage was responsible.
///
/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn render_osc(p: *mut Engine, hz: f32, shape: u32, frames: u32) {
    let e = eng!(p);
    let n = (frames as usize).min(MAX_BLOCK);
    // Match the SHIPPED signal path by default. A probe that renders the oscillator at
    // 1x measures a path no listener ever hears once voices run oversampled, and the
    // alias gate would then be grading something the product does not contain.
    let rate = if e.probe_os { e.sr * 2.0 } else { e.sr };
    if e.probe_hz != hz {
        e.probe_hz = hz;
        e.probe.set_freq(hz, rate);
    }
    let sh = Shape::from_u32(shape);
    if e.probe_os {
        for i in 0..n {
            let a = e.probe.tick(sh, 0.5);
            let b = e.probe.tick(sh, 0.5);
            e.out[i] = e.probe_hb.decimate(a, b);
        }
    } else {
        for i in 0..n {
            e.out[i] = e.probe.tick(sh, 0.5);
        }
    }
}

/// Choose whether the probe mirrors the shipped oversampled path (default) or renders
/// the bare oscillator. Both are worth measuring: one is what ships, the other isolates
/// how much of the improvement the oversampler is responsible for.
///
/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn probe_oversample(p: *mut Engine, on: u32) {
    let e = eng!(p);
    e.probe_os = on != 0;
    e.probe_hz = -1.0;
    e.probe_hb.reset();
}

/// Restart the measurement oscillator's phase. Called once before a probe run.
///
/// # Safety
/// `p` must be a live pointer from `engine_new`.
#[no_mangle]
pub unsafe extern "C" fn probe_reset(p: *mut Engine) {
    let e = eng!(p);
    e.probe = osc::Osc::new();
    e.probe_hz = -1.0;
    e.probe_hb.reset();
}
