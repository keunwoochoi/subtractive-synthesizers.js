// Run the README's quickstart, verbatim, against the packed and installed package.
//
// Release-standard area F: "a quickstart that is EXECUTED rather than written — a
// copy-pasteable snippet nobody has run is a bug report waiting." Everything that makes
// a quickstart wrong is invisible to every other gate in this repo:
//
//   - an import path that does not exist in the "exports" map
//   - a function renamed since the README was written
//   - a preset id that is no longer in the bank
//   - a snippet that only works because the author had a bundler or a dev server
//
// The README block is GENERATED from examples/quickstart.js (see scripts/gen_docs.py),
// so the file executed here and the text a reader copies cannot drift apart.
//
// This deliberately uses a LIVE AudioContext, not an OfflineAudioContext. The quickstart
// calls `createEngine()` with no arguments, which is the path a real user takes and the
// only path that exercises the default context, the default WASM URL and the Blob-URL
// worklet together. install-check.mjs already covers the offline path.
//
//     node scripts/verify/check_quickstart.mjs
//     BROWSER=webkit node scripts/verify/check_quickstart.mjs
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as pw from "playwright";

const ROOT = process.cwd();
const BROWSER = process.env.BROWSER ?? "chromium";
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const PORT = 8303;
const COMMAND_TIMEOUT_MS = 180_000;
const work = mkdtempSync(join(tmpdir(), "subsynth-quickstart-"));

let stage = "validate browser";
let browser;
let server;
let tarball;

class GateFailure extends Error {}
const fail = (message) => {
  throw new GateFailure(`QUICKSTART FAIL [${BROWSER}] [${stage}]: ${message}`);
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

  stage = "verify generated README snippet";
  // The snippet must be the same text both READMEs show. packages/core/README.md is
  // npm's actual package page, so checking only the repository README would validate
  // the wrong consumer surface.
  const source = readFileSync(join(ROOT, "examples/quickstart.js"), "utf8");
  if (!source.includes("// --8<--")) fail("examples/quickstart.js lost its --8<-- marker");
  const snippet = source.split("// --8<--")[0].trimEnd();
  const generatedBlock = `<!-- generated:quickstart -->\n\`\`\`js\n${snippet}\n\`\`\`\n` +
                         `<!-- /generated:quickstart -->`;
  for (const path of ["README.md", "packages/core/README.md"]) {
    const readme = readFileSync(join(ROOT, path), "utf8");
    if (!readme.includes(generatedBlock)) {
      fail(`${path}'s generated quickstart does not exactly match examples/quickstart.js`);
    }
  }

  console.log(`packing for ${BROWSER}…`);
  run("build package", "npm", ["run", "build"], {
    cwd: join(ROOT, "packages/core"), stdio: "ignore",
  });
  const tgz = run("pack package", "npm", ["pack", "--silent"], {
    cwd: join(ROOT, "packages/core"), encoding: "utf8",
  }).trim();
  tarball = join(ROOT, "packages/core", tgz);

  stage = "create clean consumer";
  writeFileSync(join(work, "package.json"),
                JSON.stringify({ name: "consumer", private: true, type: "module" }));
  run("install packed package", "npm",
      ["install", "--no-audit", "--no-fund", "--silent", tarball],
      { cwd: work, stdio: "ignore" });
  // Copy the source that generated the README, including its harness-only export. The
  // import and public calls above the marker therefore run completely unmodified.
  cpSync(join(ROOT, "examples/quickstart.js"), join(work, "quickstart.js"));

  // An import map, so the file can use the BARE specifier exactly as printed. Without one
  // a browser cannot resolve "subtractive-synthesizers.js" at all — and rewriting the
  // import to a path would mean testing a snippet the README never shows.
  writeFileSync(join(work, "index.html"), `<!doctype html><meta charset="utf-8"><body>
<script type="importmap">
{"imports": {
  "subtractive-synthesizers.js": "/node_modules/subtractive-synthesizers.js/dist/index.js",
  "subtractive-synthesizers.js/presets": "/node_modules/subtractive-synthesizers.js/dist/presets.js"
}}
</script>
<script type="module">
  window.__ready = (async () => {
    const { engine } = await import("/quickstart.js");
    // Tap the engine's own output node. This is documented public surface (Engine.node),
    // so the quickstart above runs completely unmodified — nothing is injected into it.
    const ctx = engine.context;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    engine.node.connect(analyser);
    await engine.resume();

    // Watch for ~1 s and keep the loudest frame. A single sample of a live context can
    // land in the attack or between callbacks and read as silence for reasons that have
    // nothing to do with the library.
    const buf = new Float32Array(analyser.fftSize);
    let peak = 0, bad = 0;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 16));
      analyser.getFloatTimeDomainData(buf);
      for (const value of buf) {
        if (!Number.isFinite(value)) { bad++; continue; }
        if (Math.abs(value) > peak) peak = Math.abs(value);
      }
    }
    return { peak, bad, state: ctx.state, voices: engine.voices };
  })();
  window.__ready.then(
    (value) => { window.__outcome = { ok: true, value }; },
    (error) => { window.__outcome = { ok: false, error: String(error) }; },
  );
</script></body>`);

  stage = "start quickstart server";
  // A nonce this run alone can serve proves that a squatter on the fixed port cannot
  // make this run measure a previous temp directory.
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
    fail(`port ${PORT} is not serving this run's quickstart`);
  }

  stage = "launch browser";
  browser = await browserType.launch({ args: launchArgs, timeout: 30_000 });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  stage = "load quickstart";
  await page.goto(`http://127.0.0.1:${PORT}/`, { timeout: 20_000 });

  stage = "run quickstart";
  try {
    await page.waitForFunction(() => window.__outcome !== undefined, null, { timeout: 30_000 });
  } catch (error) {
    fail(`quickstart did not finish within 30 s${errors.length ? `: ${errors.slice(0, 2).join(" | ")}` : ""}`);
  }
  const outcome = await page.evaluate(() => window.__outcome);
  if (!outcome.ok) fail(`the quickstart threw: ${outcome.error}`);
  const result = outcome.value;

  stage = "validate quickstart audio";
  if (errors.length) fail("the quickstart threw: " + errors.slice(0, 2).join(" | "));
  if (result.bad) fail(`${result.bad} non-finite samples`);
  if (result.state !== "running") fail(`context is "${result.state}", not running`);
  if (result.peak < 0.01) fail(`the quickstart made no sound — peak ${result.peak}`);
  console.log(`quickstart ran on a live context: peak ${result.peak.toFixed(3)}, ` +
              `${result.voices} voice(s), context ${result.state}`);
  console.log(`QUICKSTART OK [${BROWSER}] — the snippet in the README is the snippet that ran`);
} catch (error) {
  if (error instanceof GateFailure) {
    console.error(error.message);
  } else {
    console.error(`QUICKSTART FAIL [${BROWSER}] [${stage}]: ${boundedError(error)}`);
  }
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.kill();
  if (tarball) rmSync(tarball, { force: true });
  rmSync(work, { recursive: true, force: true });
}
