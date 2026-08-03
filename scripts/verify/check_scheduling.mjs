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
const SR = 48000;
const QUANTUM = 128;
const TOLERANCE = 1;

const fails = [];
const check = (ok, name, detail) => {
  if (ok) console.log(`  ok    ${name}${detail ? " — " + detail : ""}`);
  else { console.log(`  FAIL  ${name} — ${detail}`); fails.push(name); }
};

// ---------------------------------------------------------------------------------
// AudioWorkletGlobalScope, only as far as processor.js actually reaches into it.
// `currentTime` is the time at the START of the current render quantum and is read
// inside process(), so it has to be a live getter rather than a captured number --
// freezing it is precisely the bug that would make a block-granular implementation
// look correct here.
// ---------------------------------------------------------------------------------
let blocksRendered = 0;
let registered = null;

class FakePort {
  constructor() { this.onmessage = null; this.onmessageerror = null; this.sent = []; }
  postMessage(m) { this.sent.push(m); }
  deliver(data) { this.onmessage({ data }); }
}

globalThis.sampleRate = SR;
Object.defineProperty(globalThis, "currentTime", {
  get: () => (blocksRendered * QUANTUM) / SR,
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
const NOTES = OFFSETS.map((offset, i) => {
  const frame = i * SPACING + offset;
  return { frame, offset, at: frame / SR };
});
const TOTAL = NOTES.length * SPACING + SPACING;
const events = NOTES.map(({ at }) => ({ type: "noteOn", note: 48, vel: 1, at }));

/** Error in frames per note, positive = late. A note that never sounds reads as null. */
function onsetErrors(buf) {
  return NOTES.map(({ frame }) => {
    const detected = onsetAtOrAfter(buf, Math.max(0, frame - QUANTUM));
    return detected < 0 ? null : detected - frame;
  });
}

console.log("\n== scheduled onsets land on their frame ==");

const shipped = render(Processor, events, TOTAL);
const shippedErrors = onsetErrors(shipped);

check(
  onsetAtOrAfter(shipped, 0) === NOTES[0].frame,
  "the bus is exact silence until the first scheduled note",
  "onset detection needs no amplitude threshold",
);

for (const [i, { offset }] of NOTES.entries()) {
  const error = shippedErrors[i];
  check(
    error !== null && Math.abs(error) <= TOLERANCE,
    `note at quantum offset ${String(offset).padStart(3)} starts on its frame`,
    error === null ? "never sounded" : `error ${error > 0 ? "+" : ""}${error} frame(s)`,
  );
}

const worst = shippedErrors.reduce((a, b) => (b !== null && Math.abs(b) > Math.abs(a) ? b : a), 0);
check(
  Math.abs(worst) <= TOLERANCE,
  "worst onset error over the run",
  `${Math.abs(worst)} frame(s), tolerance ${TOLERANCE}`,
);

// ---------------------------------------------------------------------------------
// Prove the gate fails closed. An assertion nobody has watched fail is not a gate;
// scripts/audit/fixtures/ applies the same rule to the repo audit.
// ---------------------------------------------------------------------------------
console.log("\n== the gate rejects a block-granular implementation ==");

const regressed = render(BlockGranularProcessor, events, TOTAL);
const regressedErrors = onsetErrors(regressed);

// Under block-granular application a note is pulled back to the start of the block it
// fell in, so its error is exactly minus its offset. Asserting the mechanism rather than
// "something differed" is what makes this a fixture and not a smoke test.
const displaced = NOTES.map(({ offset }, i) => ({ offset, error: regressedErrors[i], expected: -offset }));
check(
  displaced.every(({ error, expected }) => error === expected),
  "each note is pulled back to its block boundary",
  displaced.map(({ offset, error }) => `${offset}→${error}`).join(" "),
);

const shouldBeCaught = displaced.filter(({ offset }) => offset > TOLERANCE);
const caught = shouldBeCaught.filter(({ error }) => error === null || Math.abs(error) > TOLERANCE);
check(
  caught.length === shouldBeCaught.length && shouldBeCaught.length > 0,
  "every note further than the tolerance from a boundary is rejected",
  `${caught.length} of ${shouldBeCaught.length} off-grid notes fail the gate`,
);

const withinTolerance = displaced.filter(({ offset }) => offset <= TOLERANCE);
check(
  withinTolerance.every(({ error }) => error !== null && Math.abs(error) <= TOLERANCE),
  "notes already on the boundary still pass under the regression",
  "the gate measures placement inside the block, not a constant offset",
);

console.log(
  fails.length
    ? `\nscheduling FAILED — ${fails.length} check(s): ${fails.join(", ")}`
    : `\nscheduling OK — every onset within ${TOLERANCE} frame, and block-granular application is rejected`,
);
process.exit(fails.length ? 1 : 0);
