// Every patch in the bank, rendered through the shipped WASM and measured.
//
// A patch bank is the product (PRINCIPLES #1), so it gets gates like any other output.
// Three questions, none of which is "does it sound good" -- that is Loop B and a human:
//
//   1. Is it STABLE and inside headroom? A patch that NaNs or clips is broken whatever
//      it sounds like, and stability/headroom come first in the dependency order.
//   2. Is it AUDIBLE? A patch whose amp envelope never opens is a name in a menu.
//   3. Is it DISTINCT? Thirty-six patches that measure as twenty is padding. This is the
//      one that stops a bank growing by copy-paste, and it is why the check exists at all.
//
// The distinctness test is deliberately a FINGERPRINT comparison, not a similarity
// judgement: two patches may legitimately be close cousins, so the bar is "not nearly
// identical", not "maximally different".
//
//     node scripts/verify/check_patches.mjs
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { PRESETS, DEFAULTS } from "../../packages/core/src/presets.js";

const SR = 48000;
const { instance } = await WebAssembly.instantiate(
  readFileSync("packages/core/wasm/subtractive_dsp.wasm"), {});
const x = instance.exports;

// Mirrors PARAM in packages/core/src/index.js. Generated from the same order so a new
// parameter cannot silently stop being applied here.
const PARAM = {
  shape: 0, pulseWidth: 1, detuneCents: 2, subLevel: 3, noiseLevel: 4,
  cutoffHz: 5, resonance: 6, drive: 7, envAmount: 8, keyTrack: 9,
  ampAttack: 10, ampDecay: 11, ampSustain: 12, ampRelease: 13,
  fltAttack: 14, fltDecay: 15, fltSustain: 16, fltRelease: 17,
  velToCutoff: 18, gain: 19, chorusRate: 20, chorusDepth: 21, chorusMix: 22,
  delayMix: 23, delayTime: 24, delayFeedback: 25, delayTone: 26,
  reverbMix: 27, reverbSize: 28, reverbDamp: 29, reverbPredelay: 30,
  unison: 31, glide: 32, lfoRate: 33, lfoToPitch: 34, lfoToCutoff: 35,
  lfoToPwm: 36, filterKind: 37,
};

const fails = [];
const check = (ok, name, detail) => {
  if (!ok) { fails.push(name); console.log(`  FAIL  ${name} — ${detail}`); }
};

/** Render one patch: a held note, released partway, so attack AND tail are captured. */
function render(name, seconds = 3.0, note = 48) {
  const e = x.engine_new(SR);
  const params = { ...DEFAULTS, ...PRESETS[name].params };
  for (const [k, v] of Object.entries(params)) {
    if (PARAM[k] === undefined) throw new Error(`${name}: unknown param ${k}`);
    x.set_param(e, PARAM[k], v);
  }
  x.note_on(e, note, 0.9);
  const n = Math.floor(SR * seconds);
  const out = new Float32Array(n);
  const offAt = Math.floor(SR * 1.2);
  for (let i = 0; i < n; i += 128) {
    if (i >= offAt && i - 128 < offAt) x.note_off(e, note);
    const f = Math.min(128, n - i);
    x.render(e, f);
    out.set(new Float32Array(x.memory.buffer, x.out_ptr(e), f), i);
  }
  x.engine_free(e);
  return out;
}

const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / a.length);
const peak = (a) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

/** A small, stable descriptor of what a patch sounds like. */
function fingerprint(a) {
  let lo = 0, mid = 0, hi = 0, s1 = 0, s2 = 0;
  const body = a.subarray(0, Math.floor(SR * 1.2));
  for (let i = 0; i < body.length; i++) {
    s1 += 0.02 * (body[i] - s1);
    s2 += 0.18 * (body[i] - s2);
    lo += s1 * s1; mid += (s2 - s1) ** 2; hi += (body[i] - s2) ** 2;
  }
  const t = lo + mid + hi || 1;

  // Envelope shape in 10 ms hops, normalised: attack position and tail length are as
  // much of a patch's identity as its spectrum. A pad and a pluck can share a filter
  // setting and still be nothing alike.
  const hop = Math.floor(SR * 0.01);
  const env = [];
  for (let i = 0; i + hop < a.length; i += hop) env.push(rms(a.subarray(i, i + hop)));
  const top = Math.max(...env) || 1;
  const attackHops = env.findIndex((v) => v >= top * 0.9);
  const tail = a.subarray(Math.floor(SR * 2.2));
  return {
    lo: lo / t, mid: mid / t, hi: hi / t,
    attack: Math.min(attackHops < 0 ? 100 : attackHops, 100) / 100,
    tail: Math.min(rms(tail) / (top || 1), 1),
  };
}

const dist = (a, b) =>
  Math.abs(a.lo - b.lo) + Math.abs(a.mid - b.mid) + Math.abs(a.hi - b.hi)
  + Math.abs(a.attack - b.attack) * 1.5 + Math.abs(a.tail - b.tail) * 1.5;

const names = Object.keys(PRESETS);
console.log(`patch bank — ${names.length} patches through the shipped WASM\n`);

const prints = {};
for (const name of names) {
  const a = render(name);
  const finite = a.every(Number.isFinite);
  const p = peak(a), r = rms(a.subarray(0, Math.floor(SR * 1.2)));
  check(finite, `${name}: finite`, "non-finite samples");
  check(p <= 1.0, `${name}: headroom`, `peak ${p.toFixed(3)}`);
  check(r > 0.004, `${name}: audible`, `rms ${r.toFixed(4)}`);
  if (finite) prints[name] = fingerprint(a);
}

// Loudness match. A bank you have to ride the fader on is unusable, and an A/B between
// two patches at different levels measures the level rather than the patch. Measured
// spread was 40.7 dB before this was checked; the two worst offenders turned out to be
// DESIGN errors (a triangle behind a highpass has no harmonics left to pass), not gain
// errors, which is exactly the kind of thing a loudness gate surfaces and a listen does
// not, because you just reach for the volume.
{
  const out = execSync("node scripts/dev/render_patches.mjs", { encoding: "utf8" });
  const lus = Object.entries(JSON.parse(out))
    .map(([n, d]) => [n, d.lu]).filter(([, l]) => Number.isFinite(l))
    .sort((a, b) => a[1] - b[1]);
  const spread = lus[lus.length - 1][1] - lus[0][1];
  check(spread <= 8.0, "bank is loudness-matched",
        `spread ${spread.toFixed(1)} dB — quietest ${lus[0][0]}, loudest ${lus[lus.length - 1][0]}`);
  console.log(`  loudness spread: ${spread.toFixed(1)} dB across ${lus.length} patches`);
}

// Distinctness: nearest neighbour for every patch.
const MIN_DIST = 0.05;
let worst = { d: Infinity, a: "", b: "" };
for (let i = 0; i < names.length; i++) {
  for (let j = i + 1; j < names.length; j++) {
    const a = names[i], b = names[j];
    if (!prints[a] || !prints[b]) continue;
    const d = dist(prints[a], prints[b]);
    if (d < worst.d) worst = { d, a, b };
    check(d >= MIN_DIST, `${a} vs ${b}: distinct`,
          `fingerprint distance ${d.toFixed(3)} < ${MIN_DIST}`);
  }
}

console.log(`  closest pair: ${worst.a} / ${worst.b} at ${worst.d.toFixed(3)}`);
console.log(`  ${names.length} patches, ${Object.keys(prints).length} measured\n`);
if (fails.length) {
  console.log(`PATCH CHECKS FAIL — ${fails.length}`);
  process.exit(1);
}
console.log("patch bank OK — all stable, in headroom, audible, and mutually distinct");
