// Prove the showcase actually plays: patches load, the sequencer schedules, notes sound.
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
const PORT = 8183;

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
const fail = (m) => { console.error("SHOWCASE FAIL: " + m); server.kill(); process.exit(1); };
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ args: launchArgs });
try {
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/apps/playground/showcase.html`, { timeout: 15000 });

  // Derived from the preset bank, not hardcoded: a magic number here means adding a
  // patch silently stops being verified. Caught when the supersaw took the count to 7
  // and the check still asserted 6.
  const { PRESETS } = await import("../../packages/core/src/presets.js");
  const expected = Object.keys(PRESETS).length;
  const cards = await p.locator(".card").count();
  if (cards !== expected) fail(`expected ${expected} patch cards, found ${cards}`);

  await p.click("#play");
  await p.waitForFunction(() => document.getElementById("sr").textContent !== "—",
                          null, { timeout: 20000 });
  await p.waitForTimeout(1800);

  // A voice counter that reads 0 while the synth is audibly playing is a UI number
  // that lies. Assert it moves rather than trusting that the wiring works.
  const peakVoices = await p.evaluate(async () => {
    let peak = 0;
    for (let i = 0; i < 25; i++) {
      peak = Math.max(peak, Number(document.getElementById("voices").textContent));
      await new Promise(r => setTimeout(r, 80));
    }
    return peak;
  });
  if (peakVoices < 1) fail("voice counter never left 0 while playing");

  const state = await p.evaluate(() => ({
    sr: document.getElementById("sr").textContent,
    size: document.getElementById("size").textContent,
    label: document.getElementById("play").textContent,
    lit: document.querySelectorAll(".st.now").length,
  }));
  if (!state.label.includes("Stop")) fail("transport did not enter playing state");
  if (!/KB/.test(state.size)) fail(`size was not measured: ${state.size}`);

  // Switching patch mid-play must not throw or silence the engine -- AND the UI must
  // follow. The previous version clicked cards and asserted nothing about the result,
  // so it passed happily while selection was visibly stuck: the cards had moved inside
  // per-group rows and the highlight code still walked only direct children.
  const highlighted = () =>
    p.evaluate(() => [...document.querySelectorAll(".card.on")].map((e) => e.dataset.key));

  const before = await highlighted();
  if (before.length !== 1) fail(`expected exactly 1 selected card at load, got ${before}`);

  for (const key of ["warm-pad", "acid", "crystal", "brass-stab"]) {
    await p.locator(`.card[data-key="${key}"]`).click();
    await p.waitForTimeout(220);
    const on = await highlighted();
    if (on.length !== 1) fail(`selecting ${key} left ${on.length} cards highlighted: ${on}`);
    if (on[0] !== key) fail(`selected ${key} but ${on[0]} is highlighted`);
    // The step grid is keyed off the patch's GROUP, so it must track too.
    const lit = await p.evaluate(() =>
      [...document.querySelectorAll(".st")].filter((e) => e.classList.contains("hit")
        || e.classList.contains("acc")).length);
    if (lit === 0) fail(`${key}: step grid shows no steps for its group`);
  }
  await p.waitForTimeout(500);
  await p.click("#play");

  if (errs.length) fail("page errors: " + errs.slice(0, 3).join(" | "));
  console.log("showcase:", JSON.stringify({ ...state, peakVoices }));
  console.log(`SHOWCASE OK — ${expected} patches, transport runs, size measured in-page, selection + step grid follow every click`);
} finally { await b.close(); server.kill(); }
