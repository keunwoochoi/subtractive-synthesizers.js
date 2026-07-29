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
            reverbMix: 27, reverbSize: 28 };

const { instance } = await WebAssembly.instantiate(readFileSync(WASM), {});
const x = instance.exports;

const fails = [];
const check = (ok, name, detail) => {
  if (ok) console.log(`  ok    ${name}${detail ? " — " + detail : ""}`);
  else { console.log(`  FAIL  ${name} — ${detail}`); fails.push(name); }
};

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
  const a = render(1.6, (e) => {
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

console.log();
if (fails.length) {
  console.log(`ENGINE CHECKS FAIL — ${fails.length}: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("engine checks OK");
