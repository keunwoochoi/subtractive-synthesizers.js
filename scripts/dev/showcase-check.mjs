// Prove the showcase actually plays: patches load, the sequencer schedules, notes sound.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PORT = 8183;
const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
const fail = (m) => { console.error("SHOWCASE FAIL: " + m); server.kill(); process.exit(1); };
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`http://localhost:${PORT}/apps/playground/showcase.html`, { timeout: 15000 });

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

  // Switching patch mid-play must not throw or silence the engine.
  await p.locator('.card[data-key="poly-pad"]').click();
  await p.waitForTimeout(900);
  await p.locator('.card[data-key="analog-bass"]').click();
  await p.waitForTimeout(600);
  await p.click("#play");

  if (errs.length) fail("page errors: " + errs.slice(0, 3).join(" | "));
  console.log("showcase:", JSON.stringify({ ...state, peakVoices }));
  console.log(`SHOWCASE OK — ${expected} patches, transport runs, size measured in-page, patch switching clean`);
} finally { await b.close(); server.kill(); }
