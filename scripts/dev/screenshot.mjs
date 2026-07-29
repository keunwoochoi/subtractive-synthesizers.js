// Capture the playground and showcase for the README / review.
import { chromium } from "playwright";
import { spawn } from "node:child_process";
const PORT = 8185;
const server = spawn("python3", ["-m", "http.server", String(PORT)], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
const out = process.argv[2] ?? "/tmp";
try {
  const p = await b.newPage({ viewportSize: { width: 1040, height: 900 }, deviceScaleFactor: 2 });

  await p.goto(`http://localhost:${PORT}/apps/playground/showcase.html`);
  await p.click("#play");
  await p.waitForFunction(() => document.getElementById("sr").textContent !== "—", null, { timeout: 20000 });
  await p.waitForTimeout(2500);          // let the analyser fill so the viz is not blank
  await p.screenshot({ path: `${out}/showcase.png`, fullPage: true });

  await p.goto(`http://localhost:${PORT}/apps/playground/`);
  await p.click("#start");
  await p.waitForFunction(() => document.getElementById("status").textContent.startsWith("ready"), null, { timeout: 15000 });
  await p.evaluate(() => { for (const n of [48,52,55,60]) document.querySelector(`[data-note="${n}"]`)?.classList.add("on"); });
  await p.screenshot({ path: `${out}/playground.png`, fullPage: true });
  console.log("wrote showcase.png and playground.png to", out);
} finally { await b.close(); server.kill(); }
