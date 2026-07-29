// Render every patch and report a K-weighted loudness estimate, as JSON on stdout.
// Used by match_loudness.py; kept separate because the WASM lives on the node side.
import { readFileSync } from "node:fs";
// PARAM is IMPORTED, not mirrored. The previous copy carried a comment claiming it
// was generated from the same source; it was hand-written, and it broke the moment
// stereoWidth was added -- "unknown param stereoWidth" on a patch that was fine.
import { PARAM } from "../../packages/core/src/index.js";
import { PRESETS, DEFAULTS } from "../../packages/core/src/presets.js";

const SR = 48000;
const { instance } = await WebAssembly.instantiate(
  readFileSync("packages/core/wasm/subtractive_dsp.wasm"), {});
const x = instance.exports;

// Notes a patch is actually played at. Judging a sub-bass at C6 or a bell at C2 measures
// the wrong thing; each group is levelled where it lives.
const NOTE = { bass: 36, lead: 67, pad: 55, pluck: 60, brass: 55 };

/** BS.1770-style K-weighting: high shelf then high-pass, both 2nd order at 48 kHz. */
function kWeight(a) {
  const sh = [1.53512485958697, -2.69169618940638, 1.19839281085285,
              -1.69065929318241, 0.73248077421585];
  const hp = [1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621];
  const biquad = (src, c) => {
    const o = new Float32Array(src.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < src.length; i++) {
      const v = c[0] * src[i] + c[1] * x1 + c[2] * x2 - c[3] * y1 - c[4] * y2;
      x2 = x1; x1 = src[i]; y2 = y1; y1 = v; o[i] = v;
    }
    return o;
  };
  return biquad(biquad(a, sh), hp);
}

/** Gated mean square, after BS.1770/EBU R128.
 *
 * Ungated, a patch that decays in 300 ms is judged on 1.2 s of the silence that follows
 * and measures ~20 dB quieter than a sustained pad that is no louder at all. Gating drops
 * blocks more than 10 LU below the ungated mean, so a pluck is levelled on the part of it
 * anyone hears. This is what took the measured spread across the bank from 41 dB of
 * mostly-artefact down to a real one.
 */
function gatedLoudness(k) {
  const block = Math.floor(SR * 0.4), hop = Math.floor(block / 4);
  const blocks = [];
  for (let i = 0; i + block <= k.length; i += hop) {
    let s = 0;
    for (let j = 0; j < block; j++) s += k[i + j] * k[i + j];
    blocks.push(s / block);
  }
  if (!blocks.length) return -Infinity;
  const ungated = blocks.reduce((a, b) => a + b, 0) / blocks.length;
  if (ungated <= 0) return -Infinity;
  const floor = ungated * Math.pow(10, -10 / 10);          // -10 LU relative gate
  const kept = blocks.filter((b) => b > floor);
  const ms = (kept.length ? kept : blocks).reduce((a, b) => a + b, 0)
           / (kept.length || blocks.length);
  return ms > 0 ? 10 * Math.log10(ms) : -Infinity;
}

const out = {};
for (const [name, preset] of Object.entries(PRESETS)) {
  const params = { ...DEFAULTS, ...preset.params };
  const e = x.engine_new(SR);
  for (const [k, v] of Object.entries(params)) x.set_param(e, PARAM[k], v);
  const note = NOTE[preset.group] ?? 60;
  x.note_on(e, note, 0.9);
  const n = Math.floor(SR * 1.5);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i += 128) {
    const f = Math.min(128, n - i);
    x.render(e, f);
    // The MONO SUM: loudness is what a listener hears, and reading only the left channel
    // under-measures every wide patch -- which would then be gain-matched too loud.
    const L = new Float32Array(x.memory.buffer, x.out_ptr(e), f);
    const R = new Float32Array(x.memory.buffer, x.out_ptr_r(e), f);
    for (let j = 0; j < f; j++) buf[i + j] = (L[j] + R[j]) * 0.5;
  }
  x.engine_free(e);
  out[name] = { lu: gatedLoudness(kWeight(buf)), gain: params.gain };
}
process.stdout.write(JSON.stringify(out));
