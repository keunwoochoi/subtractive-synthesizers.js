// Tier-1 gate on WHEN a scheduled note starts, not whether it sounds.
//
// packages/core/worklet/processor.js renders each block in segments split at event
// boundaries so a note lands on its scheduled frame. Every other gate in this repo
// grades what comes out -- stability, headroom, alias, loudness, distinctness -- and all
// of them pass just as well if events are applied at the block boundary instead. The
// notes are the same notes; they are only displaced, by between zero and one render
// quantum depending on where in the block they fell. That is inaudible on a pad and
// obvious on a sixteenth-note line, and nothing here would have caught it (#23).
//
// This drives the REAL processor.js rather than the WASM directly, because the segmented
// render is JavaScript in the worklet, not DSP. The WASM cannot be asked whether it was
// called at the right frame.
//
//     node scripts/verify/check_scheduling.mjs
import { readFileSync } from "node:fs";
import { PARAM } from "../../packages/core/src/index.js";

const WASM = "packages/core/wasm/subtractive_dsp.wasm";
const QUANTUM = 128;
const TOLERANCE = 1;
// Both rates a browser actually hands out: 48 kHz on Chromium, 44.1 kHz on WebKit. A
// single rate is not a sweep -- with only 48 kHz exercised, replacing the seconds-to-
// frames conversion with a hard-coded 1/48000 passes every check here and displaces
// every off-grid event on Safari. PRINCIPLES #1: gate on the worst case over the sweep.
const RATES = [44100, 48000];

const fails = [];
const check = (ok, name, detail) => {
  if (ok) console.log(`  ok    ${name}${detail ? " — " + detail : ""}`);
  else { console.log(`  FAIL  ${name} — ${detail}`); fails.push(name); }
};

// ---------------------------------------------------------------------------------
// AudioWorkletGlobalScope, only as far as processor.js actually reaches into it.
// ---------------------------------------------------------------------------------
let blocksRendered = 0;
let contextRate = RATES[RATES.length - 1];
let registered = null;

class FakePort {
  constructor() { this.onmessage = null; this.onmessageerror = null; this.sent = []; }
  postMessage(m) { this.sent.push(m); }
  deliver(data) { this.onmessage({ data }); }
}

// Both are getters. `sampleRate` because the sweep changes it between runs and the
// processor reads it inside process() as well as at boot; `currentTime` because it is
// the time at the START of the current render quantum, and freezing it is precisely the
// bug that would make a block-granular implementation look correct here.
Object.defineProperty(globalThis, "sampleRate", {
  get: () => contextRate,
  configurable: true,
});
Object.defineProperty(globalThis, "currentTime", {
  get: () => (blocksRendered * QUANTUM) / contextRate,
  configurable: true,
});
globalThis.AudioWorkletProcessor = class { constructor() { this.port = new FakePort(); } };
globalThis.registerProcessor = (name, cls) => { registered = { name, cls }; };

await import("../../packages/core/worklet/processor.js");
if (!registered) throw new Error("processor.js did not call registerProcessor");
const Processor = registered.cls;

/** The regression #23 describes: collapse the segmented render into one whole-block
 * render and apply every due event at the block boundary. This is a plausible
 * simplification -- it removes a loop, a cursor, and a rounding step from the hot path,
 * and it would measure no slower on dsp-bench -- which is why the gate has to reject it
 * rather than trust review to. */
class BlockGranularProcessor extends Processor {
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.engine || !out || out.length === 0) return true;
    const n = out[0].length;
    const t0 = currentTime;
    const spf = 1 / sampleRate;
    while (this.cursor < this.queue.length) {
      const ev = this.queue[this.cursor];
      if (Math.round((ev.at - t0) / spf) >= n) break;
      this.apply(ev);
      this.cursor++;
    }
    this.render(out, 0, n);
    return true;
  }
}

/** The regression the rate sweep exists for: the seconds-to-frames conversion hard-codes
 * 48 kHz instead of reading the context rate. Correct on Chromium and wrong on a 44.1 kHz
 * WebKit context, where every event is converted with a 1.088x error on its offset into
 * the block. A single-rate gate cannot see this at all, which is why it is checked in
 * rather than described. */
class HardCodedRateProcessor extends Processor {
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.engine || !out || out.length === 0) return true;
    const n = out[0].length;
    let done = 0;
    const t0 = currentTime;
    const spf = 1 / 48000;
    while (this.cursor < this.queue.length) {
      const ev = this.queue[this.cursor];
      let frame = Math.round((ev.at - t0) / spf);
      if (frame >= n) break;
      if (frame < done) frame = done;
      this.render(out, done, frame - done);
      done = frame;
      this.apply(ev);
      this.cursor++;
    }
    this.render(out, done, n - done);
    return true;
  }
}

const wasmBytes = readFileSync(WASM);

// A patch whose onset is a step and whose note ends itself, so the run needs no noteOff.
// Only the sub oscillator sounds: Voice::start randomises the main oscillators' start
// phase from an engine seed that advances on every note-on, so their first sample and
// their PolyBLEP correction differ per note, while the sub is reset to phase 0 every
// time. sustain 0 with a short decay makes each note a blip that returns the voice to
// idle -- and therefore the bus to exact silence -- long before the next is scheduled.
const PATCH = [
  [PARAM.oscLevel, 0], [PARAM.subLevel, 1], [PARAM.noiseLevel, 0],
  [PARAM.cutoffHz, 8000], [PARAM.resonance, 0], [PARAM.drive, 1],
  [PARAM.ampAttack, 0.001], [PARAM.ampDecay, 0.005],
  [PARAM.ampSustain, 0], [PARAM.ampRelease, 0.005],
  [PARAM.chorusMix, 0], [PARAM.delayMix, 0], [PARAM.reverbMix, 0],
];

/** Drive a processor over `frames` and return the mono-sum render. */
function render(ProcessorClass, events, frames) {
  blocksRendered = 0;
  const proc = new ProcessorClass({ processorOptions: { bytes: wasmBytes } });
  for (const [id, value] of PATCH) proc.port.deliver({ type: "param", id, value });
  proc.port.deliver({ type: "schedule", events });

  const out = new Float32Array(frames);
  const bufs = [new Float32Array(QUANTUM), new Float32Array(QUANTUM)];
  for (let i = 0; i < frames; i += QUANTUM) {
    bufs[0].fill(0); bufs[1].fill(0);
    proc.process([], [bufs]);
    const n = Math.min(QUANTUM, frames - i);
    for (let k = 0; k < n; k++) out[i + k] = bufs[0][k] + bufs[1][k];
    blocksRendered++;
  }
  return out;
}

/** Onset is the first frame that is not exact silence. With no voice active and every
 * effect at zero mix the bus is bit-zero, so this needs no amplitude threshold and no
 * envelope calibration: a threshold would instead measure attack time, and the level at
 * which it was crossed varies per note because drift retunes the sub and moves its
 * PolyBLEP correction. */
function onsetAtOrAfter(buf, from) {
  for (let i = from; i < buf.length; i++) if (buf[i] !== 0) return i;
  return -1;
}

// Offsets within the render quantum, including the two a block-granular implementation
// gets right by accident (0, and 1 which lands inside tolerance). Passing must not come
// from having chosen convenient offsets.
const OFFSETS = [0, 1, 37, 64, 91, 127, 5, 113];
const SPACING = 4096;                     // >> the ~240-frame lifetime of a sustain-0 blip
const NOTES = OFFSETS.map((offset, i) => ({ frame: i * SPACING + offset, offset }));
const TOTAL = NOTES.length * SPACING + SPACING;
const ON_GRID = NOTES.findIndex(({ offset }) => offset === 0);

/** Error in frames per note, positive = late. A note that never sounds reads as null. */
function onsetErrors(buf) {
  return NOTES.map(({ frame }) => {
    const detected = onsetAtOrAfter(buf, Math.max(0, frame - QUANTUM));
    return detected < 0 ? null : detected - frame;
  });
}

/** Render both implementations at one context rate. Events are rebuilt per rate because
 * a scheduled time is seconds, not frames — which is the whole point of sweeping. */
function runAtRate(rate) {
  contextRate = rate;
  const events = NOTES.map(({ frame }) => ({ type: "noteOn", note: 48, vel: 1, at: frame / rate }));
  const shipped = render(Processor, events, TOTAL);
  return {
    rate,
    firstSound: onsetAtOrAfter(shipped, 0),
    shipped: onsetErrors(shipped),
    regressed: onsetErrors(render(BlockGranularProcessor, events, TOTAL)),
    hardCoded: onsetErrors(render(HardCodedRateProcessor, events, TOTAL)),
  };
}

const runs = RATES.map(runAtRate);

// ---------------------------------------------------------------------------------
// The shipped path: a note starts on the frame it was scheduled for, at every rate.
// ---------------------------------------------------------------------------------
console.log("\n== scheduled onsets land on their frame ==");

for (const { rate, firstSound, shipped } of runs) {
  check(
    firstSound === NOTES[0].frame,
    `${rate} Hz — the bus is exact silence until the first scheduled note`,
    "onset detection needs no amplitude threshold",
  );
  const bad = NOTES.map(({ offset }, i) => ({ offset, error: shipped[i] }))
    .filter(({ error }) => error === null || Math.abs(error) > TOLERANCE);
  check(
    bad.length === 0,
    `${rate} Hz — every note starts within ${TOLERANCE} frame of its schedule`,
    bad.length
      ? bad.map(({ offset, error }) => `offset ${offset}: ${error === null ? "never sounded" : error}`).join(", ")
      : NOTES.map(({ offset }, i) => `${offset}→${shipped[i]}`).join(" "),
  );
}

// Worst case over the sweep, never the average (PRINCIPLES #1).
const worst = runs.flatMap(({ rate, shipped }) =>
  shipped.map((error, i) => ({ rate, offset: NOTES[i].offset, error })))
  .reduce((a, b) => (b.error === null || Math.abs(b.error) > Math.abs(a.error ?? 0) ? b : a));
check(
  worst.error !== null && Math.abs(worst.error) <= TOLERANCE,
  "worst onset error over the whole sweep",
  worst.error === null
    ? `a note never sounded at ${worst.rate} Hz`
    : `${Math.abs(worst.error)} frame(s) at ${worst.rate} Hz offset ${worst.offset}, tolerance ${TOLERANCE}`,
);

// ---------------------------------------------------------------------------------
// Prove the gate fails closed. An assertion nobody has watched fail is not a gate;
// scripts/audit/fixtures/ applies the same rule to the repo audit.
// ---------------------------------------------------------------------------------
console.log("\n== the gate rejects a block-granular implementation ==");

for (const { rate, regressed } of runs) {
  // Normalised against the on-grid note, whose placement both implementations agree on.
  // Asserting a raw -offset would hard-code today's DSP onset latency: if a legitimate
  // change made the first non-silent sample arrive one frame after note_on, the shipped
  // path would still pass its tolerance while this fixture failed CI.
  const latency = regressed[ON_GRID];
  const displacement = NOTES.map(({ offset }, i) => ({
    offset,
    actual: regressed[i] === null || latency === null ? null : regressed[i] - latency,
    expected: -offset,
  }));
  check(
    displacement.every(({ actual, expected }) => actual === expected),
    `${rate} Hz — each note is pulled back to its block boundary`,
    displacement.map(({ offset, actual }) => `${offset}→${actual}`).join(" "),
  );

  const shouldBeCaught = NOTES.map(({ offset }, i) => ({ offset, error: regressed[i] }))
    .filter(({ offset }) => offset > TOLERANCE);
  const caught = shouldBeCaught.filter(({ error }) => error === null || Math.abs(error) > TOLERANCE);
  check(
    shouldBeCaught.length > 0 && caught.length === shouldBeCaught.length,
    `${rate} Hz — every note further than the tolerance from a boundary is rejected`,
    `${caught.length} of ${shouldBeCaught.length} off-grid notes fail the gate`,
  );

  const onBoundary = NOTES.map(({ offset }, i) => ({ offset, error: regressed[i] }))
    .filter(({ offset }) => offset <= TOLERANCE);
  check(
    onBoundary.every(({ error }) => error !== null && Math.abs(error) <= TOLERANCE),
    `${rate} Hz — notes already on the boundary still pass under the regression`,
    "the gate measures placement inside the block, not a constant offset",
  );
}

// ---------------------------------------------------------------------------------
// Prove the SWEEP fails closed, not just the gate. A second rate that never catches
// anything is scaffolding; this is the regression it is here for.
// ---------------------------------------------------------------------------------
console.log("\n== the sweep rejects a hard-coded 48 kHz conversion ==");

const outsideTolerance = (errors) =>
  NOTES.map(({ offset }, i) => ({ offset, error: errors[i] }))
    .filter(({ error }) => error === null || Math.abs(error) > TOLERANCE);

for (const { rate, hardCoded } of runs) {
  const bad = outsideTolerance(hardCoded);
  const detail = NOTES.map(({ offset }, i) => `${offset}→${hardCoded[i]}`).join(" ");
  if (rate === 48000) {
    check(
      bad.length === 0,
      `${rate} Hz — the hard-coded variant is indistinguishable from the shipped path`,
      "which is exactly why one rate is not a sweep",
    );
  } else {
    check(bad.length > 0, `${rate} Hz — the hard-coded variant is rejected`, detail);
  }
}

console.log(
  fails.length
    ? `\nscheduling FAILED — ${fails.length} check(s): ${fails.join(", ")}`
    : `\nscheduling OK — every onset within ${TOLERANCE} frame at ${RATES.join(" and ")} Hz, and block-granular application is rejected`,
);
process.exit(fails.length ? 1 : 0);
