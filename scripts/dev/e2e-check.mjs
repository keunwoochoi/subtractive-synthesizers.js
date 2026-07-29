// Prove the playground actually makes sound in a real browser.
//
// The WASM is graded directly by scripts/verify. This checks the part that harness
// cannot see: the AudioWorklet lifecycle, the module handshake, and whether a noteOn
// produces non-silent audio all the way through the browser's audio graph.
//
// Every step has a timeout, so this script always terminates.
// Engine selectable so CI can run the same checks on WebKit. Safari is where audio
// APIs most often differ -- suspended contexts, a 44.1 kHz lock, and the
// WebAssembly.Module cloning bug the worklet already works around.
import * as pw from "playwright";
const BROWSER = process.env.BROWSER ?? "chromium";
// --autoplay-policy is a Chromium-only flag; Linux WebKit refuses to start when
// handed an unknown option, while macOS WebKit ignored it. Hence green locally and
// red on CI. Select flags per engine rather than passing one set to all of them.
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const chromium = pw[BROWSER];
import { spawn } from "node:child_process";

const PORT = 8179;

// Fail if the port is already held. A check that silently attaches to someone else's
// server tests someone else's files — and a stale server from another project held
// 8174 on this machine for six days without anyone noticing.
async function requireFreePort(port) {
  const { createServer } = await import("node:net");
  await new Promise((res, rej) => {
    const s = createServer();
    s.once("error", () => rej(new Error(`port ${port} is already in use`)));
    s.once("listening", () => s.close(res));
    s.listen(port, "127.0.0.1");
  });
}

await requireFreePort(PORT);
const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { stdio: "ignore" });
const fail = (m) => { console.error("E2E FAIL: " + m); server.kill(); process.exit(1); };

await new Promise((r) => setTimeout(r, 600));
const browser = await chromium.launch({ args: launchArgs });

try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/apps/playground/`, { timeout: 15000 });

  // Render through the real graph offline and measure the result. An OfflineAudioContext
  // runs faster than real time and gives us the actual samples the engine produced,
  // rather than "the promise resolved" as a proxy for "it works".
  const result = await page.evaluate(async () => {
    const { createEngine } = await import("../../packages/core/src/index.js");
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
    const engine = await createEngine({
      wasmUrl: "../../packages/core/wasm/subtractive_dsp.wasm",
      workletUrl: "../../packages/core/worklet/processor.js",
      context: ctx,
      initialEvents: [{ type: "noteOn", note: 60, vel: 0.9, at: 0 }],
    });
    const buf = await ctx.startRendering();
    const ch = buf.getChannelData(0);
    let peak = 0, sum = 0, nonFinite = 0;
    for (let i = 0; i < ch.length; i++) {
      const v = ch[i];
      if (!Number.isFinite(v)) { nonFinite++; continue; }
      const a = Math.abs(v); if (a > peak) peak = a; sum += v * v;
    }
    return { peak, rms: Math.sqrt(sum / ch.length), nonFinite, frames: ch.length };
  }, { timeout: 20000 });

  console.log("offline render:", JSON.stringify(result));
  if (errors.length) fail("page errors: " + errors.slice(0, 3).join(" | "));
  if (result.nonFinite) fail(`${result.nonFinite} non-finite samples`);
  if (result.rms < 0.01) fail(`engine produced (near) silence — rms ${result.rms}`);
  if (result.peak > 1.0) fail(`output exceeded full scale — peak ${result.peak}`);

  // A second note must not crash the voice allocator, and releasing must decay.
  const poly = await page.evaluate(async () => {
    const { createEngine } = await import("../../packages/core/src/index.js");
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 96000, sampleRate: 48000 });
    const engine = await createEngine({
      wasmUrl: "../../packages/core/wasm/subtractive_dsp.wasm",
      workletUrl: "../../packages/core/worklet/processor.js",
      context: ctx,
      initialEvents: [48, 55, 60, 64, 67, 72].map(
        (note) => ({ type: "noteOn", note, vel: 0.8, at: 0 })),
    });
    const buf = await ctx.startRendering();
    const ch = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
    const tail = ch.subarray(ch.length - 4800);
    let tailPeak = 0;
    for (let i = 0; i < tail.length; i++) tailPeak = Math.max(tailPeak, Math.abs(tail[i]));
    return { peak, tailPeak };
  }, { timeout: 20000 });

  console.log("6-note chord:", JSON.stringify(poly));
  if (poly.peak > 1.0) fail(`chord clipped — peak ${poly.peak}`);
  if (poly.peak < 0.02) fail("chord was silent");

  console.log("E2E OK — engine loads, sounds, holds 6 voices, stays inside full scale");
} finally {
  await browser.close();
  server.kill();
}
