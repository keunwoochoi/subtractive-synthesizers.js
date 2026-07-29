// Measure DSP cost against the audio-thread budget, on the shipped WASM.
//
// THE UNIT IS AN ARRANGEMENT, NOT A VOICE COUNT.
// In the sibling project one voice is roughly one voice's worth of work. Here a pad
// voice with chorus and a mono bass voice differ by several times, so "32 voices" would
// let us pass with 32 cheap ones and ship something that stutters on the patch people
// actually want. The reference arrangement therefore contains the expensive patch by
// construction. (PRINCIPLES; owner decision 2026-07-28.)
//
// MEASUREMENT DISCIPLINE, from agentic-docs/design/2026-07-28-loop-evidence.md:
//   - warm up before timing; JIT and caches make the first blocks meaningless
//   - take the MINIMUM of many runs, not the mean: the minimum is the least
//     contaminated by scheduler noise, and we want the cost of the code, not of the
//     machine's mood
//   - run the whole thing TWICE and compare. "The fact they run benchmarking twice
//     with wildly different results should make them stop and think" — the cheapest
//     tripwire in the reward-hacking literature, and the one that would have caught a
//     published 100-150x speedup that was really 3x slower.
//
//     node scripts/verify/dsp_bench.mjs
import { readFileSync } from "node:fs";

const WASM = "packages/core/wasm/subtractive_dsp.wasm";
const SR = 48000;
const BLOCK = 128;
const BUDGET_MS = (BLOCK / SR) * 1000;      // 2.667 ms
const GATE_FRACTION = 0.5;                   // desktop-first gate: <= 50% of budget

const P = { cutoffHz: 5, resonance: 6, drive: 7, ampSustain: 12, gain: 19,
            chorusRate: 20, chorusDepth: 21, chorusMix: 22, detuneCents: 2 };

const { instance } = await WebAssembly.instantiate(readFileSync(WASM), {});
const x = instance.exports;

/** The reference arrangement: a chorused pad plus a bass plus a moving lead. */
function buildReference() {
  const e = x.engine_new(SR);
  x.set_param(e, P.ampSustain, 0.85);
  x.set_param(e, P.detuneCents, 19);
  x.set_param(e, P.resonance, 0.5);
  x.set_param(e, P.drive, 1.6);
  x.set_param(e, P.chorusRate, 0.42);
  x.set_param(e, P.chorusDepth, 4.2);
  x.set_param(e, P.chorusMix, 0.85);        // the expensive path is ON
  // FILL THE POOL. 12 notes measured 2.9% of budget, which is not a stress test of a
  // 16-voice engine -- it is a measurement of an engine that is not busy. The honest
  // worst case for this build is every voice sounding at once with the expensive path
  // enabled, so the arrangement saturates the pool: a 7-note pad voicing, a bass, and
  // an 8-note lead/upper cluster.
  for (const n of [48, 55, 60, 64, 67, 72, 76, 36, 79, 81, 83, 84, 86, 88, 90, 91]) {
    x.note_on(e, n, 0.85);
  }
  return e;
}

function timeBlocks(engine, blocks) {
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < blocks; i++) x.render(engine, BLOCK);
  return Number(process.hrtime.bigint() - t0) / 1e6;   // ms
}

function measure(reps = 40, blocksPerRep = 200) {
  const e = buildReference();
  timeBlocks(e, 2000);                       // warm up, discarded
  const perBlock = [];
  for (let r = 0; r < reps; r++) {
    perBlock.push(timeBlocks(e, blocksPerRep) / blocksPerRep);
  }
  const voices = x.active_voices(e);
  x.engine_free(e);
  perBlock.sort((a, b) => a - b);
  return {
    min: perBlock[0],
    median: perBlock[Math.floor(perBlock.length / 2)],
    p95: perBlock[Math.floor(perBlock.length * 0.95)],
    voices,
  };
}

const a = measure();
const b = measure();

const pct = (ms) => (ms / BUDGET_MS) * 100;
const fmt = (m) => `${m.min.toFixed(4)} ms  (${pct(m.min).toFixed(1)}% of budget)`;

console.log("dsp-bench — reference arrangement, shipped WASM\n");
console.log(`  budget            ${BUDGET_MS.toFixed(3)} ms per ${BLOCK} frames at ${SR} Hz`);
console.log(`  active voices     ${a.voices}   (pad + bass + lead, chorus on)`);
console.log(`  run 1             ${fmt(a)}`);
console.log(`  run 2             ${fmt(b)}`);
console.log(`  median / p95      ${a.median.toFixed(4)} / ${a.p95.toFixed(4)} ms`);

// Beyer's tripwire. Two independent runs that disagree mean the MEASUREMENT is broken,
// not that the code changed between them.
const spread = Math.abs(a.min - b.min) / Math.min(a.min, b.min);
console.log(`  run-to-run spread ${(spread * 100).toFixed(1)}%`);

let bad = false;
if (spread > 0.25) {
  console.log("\nBENCH UNRELIABLE — two runs disagreed by more than 25%.");
  console.log("Do not believe either number. Re-run on an idle machine.");
  bad = true;
}

const worst = Math.max(a.min, b.min);
const headroom = pct(worst);
console.log();
if (headroom > GATE_FRACTION * 100) {
  console.log(`BENCH FAIL — ${headroom.toFixed(1)}% of budget, gate is ${GATE_FRACTION * 100}%.`);
  bad = true;
} else {
  console.log(`bench OK — ${headroom.toFixed(1)}% of the ${GATE_FRACTION * 100}% budget gate ` +
              `(${(1 / (worst / BUDGET_MS)).toFixed(1)}x real time)`);
}
console.log("\nMeasured on this machine only. Not a claim about any other device, and\n" +
            "explicitly not a mobile number — estimated mobile figures are never\n" +
            "presented as budget rows here.");
process.exit(bad ? 1 : 0);
