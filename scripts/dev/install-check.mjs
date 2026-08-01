// Pack the package, install it into a throwaway project, and make a sound from it.
//
// This is the release gate for "npm install → three lines → a synthesizer". Every other
// check in this repo runs against the SOURCE TREE, where the paths happen to line up and
// nothing is missing from `files`. None of them can tell you whether what we PUBLISH
// works — a wrong `exports` map, a file left out of `files`, or a WASM URL that only
// resolves relative to src/ all produce a package that fails on someone else's machine
// and passes on ours.
//
//     node scripts/dev/install-check.mjs
//     BROWSER=webkit node scripts/dev/install-check.mjs
import * as pw from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BROWSER = process.env.BROWSER ?? "chromium";
// --autoplay-policy is a Chromium-only flag; Linux WebKit refuses to start when
// handed an unknown option, while macOS WebKit ignored it. Hence green locally and
// red on CI. Select flags per engine rather than passing one set to all of them.
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const ROOT = process.cwd();
const work = mkdtempSync(join(tmpdir(), "subsynth-install-"));
const PORT = 8302;
const COMMAND_TIMEOUT_MS = 180_000;

let stage = "validate browser";
let browser;
let server;
let tarball;

class GateFailure extends Error {}
const fail = (message) => {
  throw new GateFailure(`INSTALL FAIL [${BROWSER}] [${stage}]: ${message}`);
};

const boundedError = (error) => {
  const output = `${error?.stdout ?? ""}${error?.stderr ?? ""}`.trim();
  return output ? output.slice(-2000) : String(error).split("\n")[0];
};

const run = (nextStage, command, args, options = {}) => {
  stage = nextStage;
  try {
    return execFileSync(command, args, { timeout: COMMAND_TIMEOUT_MS, ...options });
  } catch (error) {
    fail(`${command} ${args.join(" ")} failed: ${boundedError(error)}`);
  }
};

try {
  const browserType = pw[BROWSER];
  if (!browserType || typeof browserType.launch !== "function") {
    fail(`unknown browser engine; expected one of chromium, firefox, webkit`);
  }

  console.log(`packing for ${BROWSER}…`);
  run("build package", "npm", ["run", "build"], {
    cwd: join(ROOT, "packages/core"), stdio: "ignore",
  });
  const tgz = run("pack package", "npm", ["pack", "--silent"], {
    cwd: join(ROOT, "packages/core"), encoding: "utf8",
  }).trim();
  tarball = join(ROOT, "packages/core", tgz);

  console.log(`installing ${tgz} into a clean project…`);
  writeFileSync(join(work, "package.json"),
                JSON.stringify({ name: "consumer", private: true, type: "module" }));
  run("install packed package", "npm",
      ["install", "--no-audit", "--no-fund", "--silent", tarball],
      { cwd: work, stdio: "ignore" });

  stage = "inspect installed files";
  const installed = join(work, "node_modules/subtractive-synthesizers.js");
  const shipped = readdirSync(join(installed, "dist"));
  console.log("shipped dist/:", shipped.join(", "));
  for (const need of ["index.js", "index.d.ts", "parameters.js", "parameters.d.ts",
                      "presets.js", "presets.d.ts", "wasm"]) {
    if (!shipped.includes(need)) fail(`dist/${need} was not published (check "files")`);
  }
  // The package ROOT, not just dist/. "files" listed README.md and both licences, and npm
  // silently omits a listed path that does not exist -- they lived at the repo root, so the
  // published package had a blank page on npm and NO LICENCE TEXT for something that claims
  // to be dual MIT/Apache-2.0. This check only looked inside dist/, so it never saw it.
  const rootFiles = readdirSync(installed);
  for (const need of ["README.md", "LICENSE-MIT", "LICENSE-APACHE"]) {
    if (!rootFiles.includes(need)) fail(`${need} was not published (check "files")`);
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
  window.__result.then(
    (value) => { window.__outcome = { ok: true, value }; },
    (error) => { window.__outcome = { ok: false, error: String(error) }; },
  );
</script></body>`);

  stage = "start package server";
  // A nonce only this run can serve proves that a stale process on the fixed port cannot
  // make this run measure a previous tarball.
  const nonce = `${process.pid}-${process.hrtime.bigint()}`;
  writeFileSync(join(work, "nonce.txt"), nonce);
  server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
                 { cwd: work, stdio: "ignore" });
  await new Promise((resolve) => setTimeout(resolve, 800));
  const nonceResponse = await fetch(`http://127.0.0.1:${PORT}/nonce.txt`, {
    signal: AbortSignal.timeout(5_000),
  }).catch(() => null);
  const servedNonce = nonceResponse?.ok ? (await nonceResponse.text()).trim() : null;
  if (servedNonce !== nonce) {
    fail(`port ${PORT} is not serving this run's installed package`);
  }

  stage = "launch browser";
  browser = await browserType.launch({ args: launchArgs, timeout: 30_000 });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  stage = "load installed package";
  await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 20_000 });

  stage = "render installed package";
  try {
    await page.waitForFunction(() => window.__outcome !== undefined, null, { timeout: 30_000 });
  } catch (error) {
    fail(`render did not finish within 30 s${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  }
  const outcome = await page.evaluate(() => window.__outcome);
  if (!outcome.ok) fail(`installed package threw: ${outcome.error}`);
  const result = outcome.value;

  stage = "validate rendered audio";
  console.log("installed package rendered:", JSON.stringify(result));
  if (errors.length) fail("page errors: " + errors.slice(0, 2).join(" | "));
  if (result.bad) fail(`${result.bad} non-finite samples`);
  if (result.rms < 0.01) fail(`installed package produced silence — rms ${result.rms}`);
  if (result.peak > 1.0) fail(`clipped — peak ${result.peak}`);
  console.log(`INSTALL OK [${BROWSER}] — packed, installed clean, resolved its own WASM ` +
              `and worklet, and made a sound`);
} catch (error) {
  if (error instanceof GateFailure) {
    console.error(error.message);
  } else {
    console.error(`INSTALL FAIL [${BROWSER}] [${stage}]: ${boundedError(error)}`);
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
  if (tarball) rmSync(tarball, { force: true });
  rmSync(work, { recursive: true, force: true });
}
