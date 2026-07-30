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
let out = src.replace(
  "/* __WORKLET_SOURCE__ */ null",
  JSON.stringify(worklet),
);
if (out === src) {
  console.error("build: worklet placeholder not found in src/index.js");
  process.exit(1);
}

// STRIP THE SOURCE-TREE FALLBACK. It exists so apps/playground can run straight from
// src/ with no build, and it is unreachable once the worklet is inlined above -- but
// UNREACHABLE IS NOT ENOUGH. webpack resolves `new URL(specifier, import.meta.url)`
// statically, at build time, without caring whether the branch can execute. It looked
// for ../worklet/processor.js relative to dist/, which the tarball does not contain, and
// failed the consumer's build outright. Vite happily ignored it, so this was invisible
// until there was a webpack fixture. Found by scripts/dev/bundler-check.mjs.
const FALLBACK = `    } else {
      // Source-tree fallback: no build has run, so fetch the worklet from its own file.
      // STRIPPED BY THE BUILD -- see scripts/build.mjs. It must not reach the tarball.
      moduleUrl = new URL("../worklet/processor.js", import.meta.url);
    }`;
if (!out.includes(FALLBACK)) {
  console.error("build: the source-tree worklet fallback moved — update scripts/build.mjs");
  process.exit(1);
}
out = out.replace(FALLBACK, `    } else {
      // Unreachable: the worklet is inlined above in the published package.
      throw new Error("subtractive-synthesizers.js: worklet source missing from build");
    }`);
if (out.includes("worklet/processor.js")) {
  console.error("build: dist/index.js still references the worklet by path");
  process.exit(1);
}

writeFileSync(join(dist, "index.js"), out);
copyFileSync(join(pkg, "src/index.d.ts"), join(dist, "index.d.ts"));
copyFileSync(join(pkg, "src/presets.js"), join(dist, "presets.js"));
copyFileSync(join(pkg, "src/presets.d.ts"), join(dist, "presets.d.ts"));
mkdirSync(join(dist, "wasm"), { recursive: true });
copyFileSync(join(pkg, "wasm/subtractive_dsp.wasm"), join(dist, "wasm/subtractive_dsp.wasm"));

// THE README AND THE LICENCES. `files` in package.json listed all three, and npm
// silently omits a listed path that does not exist -- so the tarball shipped with no
// README (a blank page on npm) and, worse, NO LICENCE TEXT AT ALL for a package that
// claims to be dual MIT/Apache-2.0. install-check.mjs never noticed because it only ever
// asserted the contents of dist/. Found by scripts/release/check-release-ready.sh.
//
// Copied at build time rather than duplicated in the tree: the repo root owns all three,
// and the copies are gitignored, so there is still exactly one editable original.
const root = join(pkg, "../..");
for (const f of ["README.md", "LICENSE-MIT", "LICENSE-APACHE"]) {
  copyFileSync(join(root, f), join(pkg, f));
}

console.log(`built dist/: index.js ${out.length} B (worklet inlined, ${worklet.length} B)` +
            `; README + 2 licences staged for the tarball`);
