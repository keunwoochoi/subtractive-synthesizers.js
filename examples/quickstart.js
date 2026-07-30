import { createEngine } from "subtractive-synthesizers.js";
import { applyPreset } from "subtractive-synthesizers.js/presets";

const engine = await createEngine();   // resolves its own WASM and worklet
applyPreset(engine, "supersaw");
engine.noteOn(60, 0.9);
// --8<-- everything below is harness, not quickstart; gen_docs.py cuts here
// scripts/verify/check_quickstart.mjs taps `engine.node` -- a documented part of the
// public surface -- so the snippet above runs completely unmodified. The moment this
// file needs a change to stay runnable, the README changes with it, because the README
// block is generated FROM this file rather than written alongside it.
export { engine };
