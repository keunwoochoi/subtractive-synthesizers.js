// Build the publishable package.
//
// The only transformation is INLINING THE WORKLET as a string, and it is worth explaining
// because it is the whole reason this package needs a build at all:
//
// `audioWorklet.addModule()` takes a URL, not a module. Every bundler wants to rewrite,
// rename or inline a file that is imported like a module, and a worklet must survive to
// runtime as a fetchable script. That is the single most common reason an audio library
// "works in dev and breaks in the build". Embedding the source as a string and handing
// the browser a Blob URL removes the bundler from the path entirely.
//
// Measured cost: +40 bytes gzipped. The WASM is NOT inlined -- that costs +10,743 B gz,
// 38 % of the whole budget, to serve a case `wasmUrl` already covers.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, "..");
const dist = join(pkg, "dist");
mkdirSync(dist, { recursive: true });

const worklet = readFileSync(join(pkg, "worklet/processor.js"), "utf8");
const src = readFileSync(join(pkg, "src/index.js"), "utf8");

// JSON.stringify gives a correctly escaped JS string literal for arbitrary source.
const out = src.replace(
  "/* __WORKLET_SOURCE__ */ null",
  JSON.stringify(worklet),
);
if (out === src) {
  console.error("build: worklet placeholder not found in src/index.js");
  process.exit(1);
}

writeFileSync(join(dist, "index.js"), out);
copyFileSync(join(pkg, "src/index.d.ts"), join(dist, "index.d.ts"));
copyFileSync(join(pkg, "src/presets.js"), join(dist, "presets.js"));
copyFileSync(join(pkg, "src/presets.d.ts"), join(dist, "presets.d.ts"));
mkdirSync(join(dist, "wasm"), { recursive: true });
copyFileSync(join(pkg, "wasm/subtractive_dsp.wasm"), join(dist, "wasm/subtractive_dsp.wasm"));

console.log(`built dist/: index.js ${out.length} B (worklet inlined, ${worklet.length} B)`);
