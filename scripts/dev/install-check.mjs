// Pack the package, install it into a throwaway project, and make a sound from it.
//
// This is the release gate for "npm install → three lines → a synthesizer". Every other
// check in this repo runs against the SOURCE TREE, where the paths happen to line up and
// nothing is missing from `files`. None of them can tell you whether what we PUBLISH
// works — a wrong `exports` map, a file left out of `files`, or a WASM URL that only
// resolves relative to src/ all produce a package that fails on someone else's machine
// and passes on ours.
import * as pw from "playwright";
const BROWSER = process.env.BROWSER ?? "chromium";
// --autoplay-policy is a Chromium-only flag; Linux WebKit refuses to start when
// handed an unknown option, while macOS WebKit ignored it. Hence green locally and
// red on CI. Select flags per engine rather than passing one set to all of them.
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const chromium = pw[BROWSER];
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const fail = (m) => { console.error("INSTALL FAIL: " + m); process.exit(1); };
const ROOT = process.cwd();
const work = mkdtempSync(join(tmpdir(), "subsynth-install-"));

console.log("packing…");
execSync("npm run build", { cwd: join(ROOT, "packages/core"), stdio: "ignore" });
const tgz = execSync("npm pack --silent", { cwd: join(ROOT, "packages/core"), encoding: "utf8" }).trim();
const tarball = join(ROOT, "packages/core", tgz);

console.log(`installing ${tgz} into a clean project…`);
writeFileSync(join(work, "package.json"), JSON.stringify({ name: "consumer", private: true, type: "module" }));
execSync(`npm install --no-audit --no-fund --silent "${tarball}"`, { cwd: work, stdio: "ignore" });

const installed = join(work, "node_modules/subtractive-synthesizers.js");
const shipped = readdirSync(join(installed, "dist"));
console.log("shipped dist/:", shipped.join(", "));
for (const need of ["index.js", "index.d.ts", "presets.js", "presets.d.ts", "wasm"]) {
  if (!shipped.includes(need)) fail(`dist/${need} was not published (check "files")`);
}

// The three lines from the README, run for real against the installed package.
writeFileSync(join(work, "index.html"), `<!doctype html><meta charset="utf-8"><body>
<script type="module">
  import { createEngine } from "/node_modules/subtractive-synthesizers.js/dist/index.js";
  import { applyPreset } from "/node_modules/subtractive-synthesizers.js/dist/presets.js";
  window.__result = (async () => {
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
    const engine = await createEngine({ context: ctx,
      initialEvents: [{ type: "noteOn", note: 60, vel: 0.9, at: 0 }] });
    applyPreset(engine, "supersaw");
    const buf = await ctx.startRendering();
    const ch = buf.getChannelData(0);
    let peak = 0, sum = 0, bad = 0;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) { bad++; continue; }
      peak = Math.max(peak, Math.abs(v)); sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / ch.length), bad };
  })();
</script></body>`);

const PORT = 8302;
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
                     { cwd: work, stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ args: launchArgs });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 15000 });
  const r = await page.evaluate(() => window.__result, { timeout: 20000 });
  console.log("installed package rendered:", JSON.stringify(r));
  if (errs.length) fail("page errors: " + errs.slice(0, 2).join(" | "));
  if (r.bad) fail(`${r.bad} non-finite samples`);
  if (r.rms < 0.01) fail(`installed package produced silence — rms ${r.rms}`);
  if (r.peak > 1.0) fail(`clipped — peak ${r.peak}`);
  console.log("INSTALL OK — packed, installed clean, resolved its own WASM and worklet, and made a sound");
} finally {
  await browser.close();
  server.kill();
  execSync(`rm -f "${tarball}"`);
}
