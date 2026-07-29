// Render the REAL WASM oscillator to raw float32 on stdout, so the Python harness
// grades the shipped artifact rather than a Python reimplementation of it.
//
// This closes the gap that would otherwise make every verify-spec number a claim about
// a stub: the prototypes are the answer key, candidates.py is scaffolding, and THIS is
// the thing that actually has to pass.
import { readFileSync } from "node:fs";

const [, , wasmPath, hzArg, srArg, nArg, shapeArg] = process.argv;
const hz = Number(hzArg), sr = Number(srArg), n = Number(nArg);
const shape = Number(shapeArg ?? 0);

const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const x = instance.exports;
const eng = x.engine_new(sr);
const os = process.argv[7] === undefined ? 1 : Number(process.argv[7]);
if (x.probe_oversample) x.probe_oversample(eng, os);
x.probe_reset(eng);

const BLOCK = 128;
const out = new Float32Array(n);
let done = 0;
while (done < n) {
  const frames = Math.min(BLOCK, n - done);
  x.render_osc(eng, hz, shape, frames);
  const ptr = x.out_ptr(eng);
  const view = new Float32Array(x.memory.buffer, ptr, frames);
  out.set(view, done);
  done += frames;
}
process.stdout.write(Buffer.from(out.buffer));
