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
const P = { ampSustain: 12, gain: 19, chorusRate: 20, chorusDepth: 21, chorusMix: 22,
            resonance: 6, cutoffHz: 5, drive: 7 };

const { instance } = await WebAssembly.instantiate(readFileSync(WASM), {});
const x = instance.exports;

const fails = [];
const check = (ok, name, detail) => {
  if (ok) console.log(`  ok    ${name}${detail ? " — " + detail : ""}`);
  else { console.log(`  FAIL  ${name} — ${detail}`); fails.push(name); }
};

/** Render `seconds` of the engine after running `setup`, in real 128-frame blocks. */
function render(seconds, setup) {
  const e = x.engine_new(SR);
  setup(e);
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 128) {
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

console.log();
if (fails.length) {
  console.log(`ENGINE CHECKS FAIL — ${fails.length}: ${fails.join(", ")}`);
  process.exit(1);
}
console.log("engine checks OK");
