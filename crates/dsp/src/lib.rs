//! subtractive-synthesizers.js DSP core.
//!
//! One engine, rendered inside a single AudioWorklet, allocation-free after init.
//! The public boundary is a hand-rolled C ABI -- no wasm-bindgen on the hot path.
//!
//! PRINCIPLES: the audio thread is sacred. Nothing below allocates, locks, or calls
//! into JS once `engine_new` has returned.

#![deny(unsafe_op_in_unsafe_fn)]

pub mod filter;
pub mod osc;
pub mod voice;

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
}

impl Engine {
    pub fn new(sample_rate: f32) -> Self {
        Engine {
            sr: if sample_rate > 0.0 { sample_rate } else { 48_000.0 },
            voices: [Voice::new(); MAX_VOICES],
            patch: Patch::init(),
            seed: 0x2545_F491,
            gain: 0.35,
            out: [0.0; MAX_BLOCK],
            probe: osc::Osc::new(),
            probe_hz: -1.0,
        }
    }

    pub fn note_on(&mut self, note: u8, vel: f32) {
        // Retrigger an existing voice for the same note rather than stacking two.
        if let Some(i) = self.voices.iter().position(|v| v.active && v.note == note) {
            self.seed = self.seed.wrapping_mul(1664525).wrapping_add(1013904223);
            self.voices[i].start(note, vel, &self.patch, self.sr, self.seed);
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
        self.voices[idx].start(note, vel, &self.patch, self.sr, self.seed);
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

    pub fn active_voices(&self) -> u32 {
        self.voices.iter().filter(|v| v.active).count() as u32
    }

    pub fn render(&mut self, frames: usize) {
        let n = frames.min(MAX_BLOCK);
        for s in self.out[..n].iter_mut() {
            *s = 0.0;
        }
        for v in self.voices.iter_mut() {
            if !v.active {
                continue;
            }
            for s in self.out[..n].iter_mut() {
                *s += v.tick(&self.patch, self.sr);
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
    if e.probe_hz != hz {
        e.probe_hz = hz;
        e.probe.set_freq(hz, e.sr);
    }
    let sh = Shape::from_u32(shape);
    let sr = e.sr;
    let _ = sr;
    for i in 0..n {
        e.out[i] = e.probe.tick(sh, 0.5);
    }
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
}
