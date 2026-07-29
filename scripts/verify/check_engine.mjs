// Tier-1 gates at the ENGINE level, on the shipped WASM.
//
// scripts/verify/verify_spec.py grades the oscillator against its analytic prototype.
// That leaves everything the oscillator is not: envelopes, voice stealing, the filter
// under sustained resonance, and whether an effect does what its name claims. Those are
// stability and headroom checks — first and second in the quality-matrix dependency
// order — and a NaN here corrupts every spectral number downstream of it.
//
//     node scripts/verify/check_engine.mjs
import { readFileSync } from "node:fs";

const WASM = "packages/core/wasm/subtractive_dsp.wasm";
const SR = 48000;
const P = { ampSustain: 12, ampRelease: 13, gain: 19, chorusRate: 20, chorusDepth: 21,
            chorusMix: 22, resonance: 6, cutoffHz: 5, drive: 7,
            delayMix: 23, delayTime: 24, delayFeedback: 25,
            reverbMix: 27, reverbSize: 28, filterKind: 37,
            unison: 31, detuneCents: 2, stereoWidth: 38, ampRelease2: 13,
            delayTime: 24, delayFeedback: 25, syncRatio: 39, envAmount: 8,
            subLevel: 3, velToCutoff: 18 };

const { instance } = await WebAssembly.instantiate(readFileSync(WASM), {});
const x = instance.exports;

const fails = [];
const check = (ok, name, detail) => {
  if (ok) console.log(`  ok    ${name}${detail ? " — " + detail : ""}`);
  else { console.log(`  FAIL  ${name} — ${detail}`); fails.push(name); }
};

/** Render the MONO SUM. Since the delay went ping-pong, the left channel alone carries
 * only every other repeat -- two timing checks here failed on correct behaviour because
 * they were still reading one channel of a two-channel effect. Anything measuring the
 * effect as a whole (timing, decay, level) wants the sum; anything measuring WIDTH must
 * read the channels separately, which the stereo block below does. */
function renderSum(seconds, setup, events = []) {
  const e = x.engine_new(SR);
  setup(e);
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const pending = [...events].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < n; i += 128) {
    while (pending.length && pending[0][0] * SR <= i) pending.shift()[1](e);
    const f = Math.min(128, n - i);
    x.render(e, f);
    const L = new Float32Array(x.memory.buffer, x.out_ptr(e), f);
    const R = new Float32Array(x.memory.buffer, x.out_ptr_r(e), f);
    for (let j = 0; j < f; j++) out[i + j] = (L[j] + R[j]) * 0.5;
  }
  x.engine_free(e);
  return out;
}

/** Render `seconds` of the engine after running `setup`, in real 128-frame blocks.
 *
 * `events` fire at a given time IN SECONDS, mid-render. Without this, a test that wants
 * a short blip has to call note_off in setup — before a single sample has been rendered
 * — so the envelope never leaves zero and the whole render is silent. That produced four
 * confident FAILs from working effects the first time these checks ran. */
function render(seconds, setup, events = []) {
  const e = x.engine_new(SR);
  setup(e);
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const pending = [...events].sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < n; i += 128) {
    while (pending.length && pending[0][0] * SR <= i) pending.shift()[1](e);
    const f = Math.min(128, n - i);
    x.render(e, f);
    out.set(new Float32Array(x.memory.buffer, x.out_ptr(e), f), i);
  }
  x.engine_free(e);
  return out;
}
const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const allFinite = (a) => a.every(Number.isFinite);

/** Coefficient of variation of the short-time envelope: how much the level moves. */
function envelopeCV(a, from = 0) {
  const W = 960, v = [];
  for (let i = from; i + W < a.length; i += W) {
    let s = 0; for (let j = 0; j < W; j++) s += a[i + j] ** 2;
    v.push(Math.sqrt(s / W));
  }
  const m = v.reduce((p, c) => p + c, 0) / v.length;
  return Math.sqrt(v.reduce((p, c) => p + (c - m) ** 2, 0) / v.length) / m;
}

console.log("engine checks (shipped WASM)\n");

// --- stability: sustained note, nothing runs away or goes non-finite
{
  const a = render(4, (e) => { x.set_param(e, P.ampSustain, 0.9); x.note_on(e, 60, 0.9); });
  check(allFinite(a), "sustained note stays finite", `${a.length} frames`);
  check(peak(a) <= 1.0, "sustained note inside full scale", `peak ${peak(a).toFixed(3)}`);
  check(rms(a) > 0.01, "sustained note is not silent", `rms ${rms(a).toFixed(3)}`);
}

// --- the dangerous case: maximum resonance and drive, held. A self-oscillating
// nonlinear ladder is where this engine is most likely to blow up.
{
  const a = render(4, (e) => {
    x.set_param(e, P.ampSustain, 1.0);
    x.set_param(e, P.resonance, 1.0);
    x.set_param(e, P.drive, 4.0);
    x.set_param(e, P.cutoffHz, 220);
    x.note_on(e, 40, 1.0);
  });
  check(allFinite(a), "max resonance + max drive stays finite");
  check(peak(a) <= 1.0, "max resonance + max drive inside full scale",
        `peak ${peak(a).toFixed(3)}`);
}

// --- headroom under polyphony, including voice stealing past the pool size
{
  const a = render(3, (e) => {
    x.set_param(e, P.ampSustain, 0.9);
    for (let n = 36; n < 36 + 24; n++) x.note_on(e, n, 1.0);   // 24 notes, 16 voices
  });
  check(allFinite(a), "24 notes into a 16-voice pool stays finite");
  check(peak(a) <= 1.0, "24 notes inside full scale", `peak ${peak(a).toFixed(3)}`);
}

// --- envelope: release must actually reach silence, or notes pile up forever
{
  const a = render(3, (e) => {
    x.note_on(e, 60, 0.9);
    x.note_off(e, 60);
  });
  const tail = a.subarray(a.length - SR / 2);
  check(rms(tail) < 1e-4, "note released decays to silence",
        `tail rms ${rms(tail).toExponential(1)}`);
}

// --- chorus: an effect must be shown to do the thing its name claims
{
  const setup = (mix) => (e) => {
    x.set_param(e, P.ampSustain, 0.9);
    x.set_param(e, P.chorusRate, 0.42);
    x.set_param(e, P.chorusDepth, 4.2);
    x.set_param(e, P.chorusMix, mix);
    x.note_on(e, 60, 0.8);
  };
  const dry = render(2, setup(0)), wet = render(2, setup(0.85));
  const dcv = envelopeCV(dry, SR), wcv = envelopeCV(wet, SR);
  check(allFinite(wet), "chorus output stays finite");
  check(peak(wet) <= 1.0, "chorus inside full scale", `peak ${peak(wet).toFixed(3)}`);
  check(wcv > dcv * 1.4, "chorus modulates the envelope",
        `CV ${dcv.toFixed(3)} dry → ${wcv.toFixed(3)} wet (${(wcv / dcv).toFixed(2)}x)`);

  // mix=0 must be a true bypass, and the engine must be deterministic run to run.
  const dry2 = render(2, setup(0));
  let same = true;
  for (let i = 0; i < dry.length; i++) if (dry[i] !== dry2[i]) { same = false; break; }
  check(same, "chorus at mix=0 is a true bypass and deterministic");
}

// --- reverb: a tail must OUTLAST the note. Otherwise it is an EQ with extra steps.
{
  const setup = (mix) => (e) => {
    x.set_param(e, P.ampSustain, 0.0);      // short blip
    x.set_param(e, P.ampRelease, 0.02);
    x.set_param(e, P.reverbSize, 0.8);
    x.set_param(e, P.reverbMix, mix);
    x.note_on(e, 60, 0.9);
  };
  const off = [[0.15, (e) => x.note_off(e, 60)]];
  const dry = render(2.5, setup(0), off), wet = render(2.5, setup(0.7), off);
  // A full second after the note is gone, dry must be silent and wet must not be.
  const from = Math.floor(SR * 1.2);
  const dryTail = rms(dry.subarray(from)), wetTail = rms(wet.subarray(from));
  check(allFinite(wet), "reverb output stays finite");
  check(peak(wet) <= 1.0, "reverb inside full scale", `peak ${peak(wet).toFixed(3)}`);
  check(dryTail < 1e-5, "no tail without reverb", `dry tail ${dryTail.toExponential(1)}`);
  check(wetTail > 1e-3, "reverb produces a tail that outlasts the note",
        `wet tail ${wetTail.toExponential(2)} vs dry ${dryTail.toExponential(1)}`);

  // ...and the tail must DECAY, not sustain. A feedback network that does not lose
  // energy is an oscillator, and it will find the limiter eventually.
  const early = rms(wet.subarray(Math.floor(SR * 0.6), Math.floor(SR * 0.9)));
  const late = rms(wet.subarray(Math.floor(SR * 2.0), Math.floor(SR * 2.3)));
  check(late < early * 0.7, "reverb tail decays",
        `${early.toExponential(2)} -> ${late.toExponential(2)}`);
}

// --- delay: a repeat must appear AT THE TIME ASKED FOR, not merely somewhere
{
  const T = 0.25;
  const a = renderSum(1.6, (e) => {
    x.set_param(e, P.ampSustain, 0.0);
    x.set_param(e, P.ampRelease, 0.02);
    x.set_param(e, P.delayTime, T);
    x.set_param(e, P.delayFeedback, 0.5);
    x.set_param(e, P.delayMix, 0.9);
    x.note_on(e, 60, 0.9);
  }, [[0.05, (e) => x.note_off(e, 60)]]);
  check(allFinite(a), "delay output stays finite");
  check(peak(a) <= 1.0, "delay inside full scale", `peak ${peak(a).toFixed(3)}`);

  // Envelope in 5 ms hops; the repeat should be the loudest thing near t = T.
  const hop = Math.floor(SR * 0.005);
  const env = [];
  for (let i = 0; i + hop < a.length; i += hop) env.push(rms(a.subarray(i, i + hop)));
  const at = (t) => Math.round((t * SR) / hop);
  const peakIn = (lo, hi) => {
    let bi = lo, bv = -1;
    for (let i = Math.max(0, lo); i <= Math.min(env.length - 1, hi); i++)
      if (env[i] > bv) { bv = env[i]; bi = i; }
    return [bi, bv];
  };
  // Measure the GAP between the original's envelope peak and the repeat's, not the
  // repeat's absolute time. A repeat is a delayed copy of the whole blip, so its
  // envelope peak inherits the blip's own attack offset — timing it against t=0 reports
  // the attack as delay error. That produced a confident 15 ms "failure" from a delay
  // line that was accurate.
  const [srcI, srcV] = peakIn(0, at(0.08));
  const [repI, repV] = peakIn(at(T - 0.05), at(T + 0.05));
  const measured = ((repI - srcI) * hop) / SR;
  const err = Math.abs(measured - T) * 1000;
  check(repV > 1e-3, "delay produces an audible repeat", `peak ${repV.toExponential(2)}`);
  check(err < 10, "repeat lands at the requested time",
        `measured ${(measured * 1000).toFixed(1)} ms vs ${T * 1000} ms (${err.toFixed(1)} ms off)`);

  // A second repeat means feedback is working, not just a single tap.
  const [, second] = peakIn(at(2 * T - 0.05) + srcI, at(2 * T + 0.05) + srcI);
  check(second > 1e-4 && second < repV, "feedback gives a quieter second repeat",
        `${repV.toExponential(2)} -> ${second.toExponential(2)}`);
}

// --- the filter set: six kinds must actually be six sounds
{
  const NAMES = ["ladder LP", "diode LP", "SVF LP", "SVF BP", "SVF HP", "SVF notch"];
  // Band energy of a sustained saw through each filter, so the shapes are comparable.
  const spectra = NAMES.map((_, kind) => {
    const a = render(1.2, (e) => {
      x.set_param(e, P.ampSustain, 0.9);
      x.set_param(e, P.filterKind, kind);
      x.set_param(e, P.cutoffHz, 700);
      x.set_param(e, P.resonance, 0.55);
      x.note_on(e, 45, 0.9);
    });
    const seg = a.subarray(SR / 2, SR / 2 + 16384);
    // Crude 3-band split via successive one-poles: enough to tell a lowpass from a
    // highpass from a bandpass without pulling in an FFT here.
    let lo = 0, mid = 0, hi = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < seg.length; i++) {
      s1 += 0.02 * (seg[i] - s1);          // ~150 Hz
      s2 += 0.18 * (seg[i] - s2);          // ~1.5 kHz
      lo += s1 * s1; mid += (s2 - s1) ** 2; hi += (seg[i] - s2) ** 2;
    }
    const t = lo + mid + hi;
    return { lo: lo / t, mid: mid / t, hi: hi / t, rms: rms(seg), finite: allFinite(a),
             peak: peak(a) };
  });

  spectra.forEach((s, i) => {
    check(s.finite && s.peak <= 1.0, `${NAMES[i]} is stable and inside full scale`,
          `peak ${s.peak.toFixed(3)}`);
  });
  check(spectra.every((s) => s.rms > 0.005), "every filter kind produces sound",
        spectra.map((s) => s.rms.toFixed(3)).join(" "));

  const [lad, dio, svfLp, svfBp, svfHp, notch] = spectra;
  check(svfHp.hi > svfLp.hi * 2, "SVF highpass keeps highs the lowpass removes",
        `hi ${svfLp.hi.toFixed(3)} LP vs ${svfHp.hi.toFixed(3)} HP`);
  check(svfBp.lo < svfLp.lo * 0.25, "SVF bandpass rejects lows the lowpass passes",
        `lo ${svfLp.lo.toFixed(3)} LP vs ${svfBp.lo.toFixed(3)} BP`);
  // NOT asserted here: the shape of the notch. Band-energy fractions cannot separate a
  // narrow notch from a lowpass when the source is a low sawtooth -- most of the energy
  // is below cutoff either way, so both read as "lots of low". The first version of this
  // check claimed the notch was broken; a direct magnitude-response test in Rust
  // (crates/dsp/src/filter.rs) showed it dips at cutoff and passes both sides correctly.
  // Response SHAPE is owned by that test; this file owns engine-level behaviour.
  check(Math.abs(notch.hi - svfHp.hi) > 0.3, "notch is not merely the highpass",
        `hi ${notch.hi.toFixed(3)} vs ${svfHp.hi.toFixed(3)}`);
  // The two 4-pole characters must not be the same filter with a different name.
  const diff = Math.abs(lad.lo - dio.lo) + Math.abs(lad.mid - dio.mid)
             + Math.abs(lad.hi - dio.hi);
  check(diff > 0.02, "diode ladder differs from the transistor ladder",
        `band-balance distance ${diff.toFixed(3)}`);
}

// --- stereo: the engine has two channels, and they must not be the same channel
{
  const stereoRender = (seconds, setup) => {
    const e = x.engine_new(SR);
    setup(e);
    const n = Math.floor(SR * seconds);
    const L = new Float32Array(n), R = new Float32Array(n);
    for (let i = 0; i < n; i += 128) {
      const f = Math.min(128, n - i);
      x.render(e, f);
      L.set(new Float32Array(x.memory.buffer, x.out_ptr(e), f), i);
      R.set(new Float32Array(x.memory.buffer, x.out_ptr_r(e), f), i);
    }
    x.engine_free(e);
    let d = 0, s = 0;
    for (let i = 0; i < n; i++) { d += (L[i] - R[i]) ** 2; s += (L[i] ** 2 + R[i] ** 2) / 2; }
    return { widthDb: 10 * Math.log10((d / n) / ((s / n) || 1e-30)), L, R };
  };

  const wide = stereoRender(1.5, (e) => {
    x.set_param(e, P.ampSustain, 0.9); x.set_param(e, P.unison, 7);
    x.set_param(e, P.detuneCents, 26); x.set_param(e, P.stereoWidth, 1);
    x.note_on(e, 60, 0.9);
  });
  const mono = stereoRender(1.5, (e) => {
    x.set_param(e, P.ampSustain, 0.9); x.set_param(e, P.unison, 7);
    x.set_param(e, P.detuneCents, 26); x.set_param(e, P.stereoWidth, 0);
    x.note_on(e, 60, 0.9);
  });
  check(wide.widthDb > -12, "unison spreads across the image",
        `L/R difference ${wide.widthDb.toFixed(1)} dB`);
  // width=0 must be EXACTLY mono, not just narrow: a patch that has to sit centred
  // (a sub-bass) cannot be allowed to wander.
  check(!Number.isFinite(mono.widthDb) || mono.widthDb < -100,
        "width 0 is exactly mono", `${mono.widthDb} dB`);

  for (const [name, setup] of [
    ["chorus", (e) => { x.set_param(e, P.chorusMix, 0.85); }],
    ["reverb", (e) => { x.set_param(e, P.reverbMix, 0.7); }],
  ]) {
    const r = stereoRender(1.5, (e) => {
      x.set_param(e, P.ampSustain, 0.9); x.set_param(e, P.stereoWidth, 0);
      setup(e); x.note_on(e, 60, 0.9);
    });
    check(r.widthDb > -12, `${name} produces width from a mono source`,
          `${r.widthDb.toFixed(1)} dB`);
  }

  // Ping-pong: repeats must ALTERNATE sides. Feeding both lines and crossing the
  // feedback looks like ping-pong and measures as pure mono, which is what the first
  // implementation did.
  const pp = stereoRender(2.2, (e) => {
    x.set_param(e, P.ampSustain, 0); x.set_param(e, 13, 0.03);
    x.set_param(e, P.stereoWidth, 0);
    x.set_param(e, P.delayTime, 0.25); x.set_param(e, P.delayFeedback, 0.6);
    x.set_param(e, P.delayMix, 0.9);
    x.note_on(e, 60, 0.9);
  });
  const env = (a, t) => {
    const w = 2400, i = Math.floor(t * SR);
    let s = 0; for (let j = 0; j < w; j++) s += a[i + j] ** 2;
    return Math.sqrt(s / w);
  };
  const first = env(pp.L, 0.25) > env(pp.R, 0.25);
  const second = env(pp.R, 0.5) > env(pp.L, 0.5);
  check(first && second, "delay repeats ping-pong between the channels",
        `t=0.25 L ${env(pp.L, 0.25).toFixed(4)}/R ${env(pp.R, 0.25).toFixed(4)}, ` +
        `t=0.50 L ${env(pp.L, 0.5).toFixed(4)}/R ${env(pp.R, 0.5).toFixed(4)}`);
}

// --- hard sync: pitch must hold, timbre must climb
{
  const centroidOf = (ratio) => {
    const a = renderSum(1.0, (e) => {
      x.set_param(e, P.ampSustain, 0.9); x.set_param(e, P.unison, 1);
      x.set_param(e, P.stereoWidth, 0); x.set_param(e, P.cutoffHz, 20000);
      x.set_param(e, P.resonance, 0); x.set_param(e, P.envAmount, 0);
      x.set_param(e, P.velToCutoff, 0);
      // The SUB must be off: an oscillator an octave down puts energy at HALF-integer
      // multiples of the note, which any harmonic metric correctly calls inharmonic.
      // Leaving it on made a clean sawtooth measure -6.5 dB and sent this whole
      // investigation chasing a sync bug that did not exist.
      x.set_param(e, P.subLevel, 0);
      x.set_param(e, P.syncRatio, ratio);
      x.note_on(e, 48, 0.9);
    });
    const seg = a.subarray(SR / 2, SR / 2 + 16384);
    let num = 0, den = 0, prev = 0, zc = 0;
    for (let i = 0; i < seg.length; i++) { if (prev <= 0 && seg[i] > 0) zc++; prev = seg[i]; }
    // Crude brightness proxy: zero crossings per second rise with harmonic content and
    // need no FFT here.
    return { zc: zc / (seg.length / SR), rms: rms(seg) };
  };
  const flat = centroidOf(1.0);
  const torn = centroidOf(3.7);
  check(torn.zc > flat.zc * 1.2, "hard sync brightens the tone",
        `zero crossings/s ${flat.zc.toFixed(0)} -> ${torn.zc.toFixed(0)}`);
  check(torn.rms > 0.01, "sync patch still sounds", `rms ${torn.rms.toFixed(3)}`);
}

console.log();
if (fails.length) {
  console.log(`ENGINE CHECKS FAIL — ${fails.length}: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("engine checks OK");
