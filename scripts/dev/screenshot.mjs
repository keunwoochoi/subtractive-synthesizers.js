// Capture the playground and showcase for the README / review.
import * as pw from "playwright";
const BROWSER = process.env.BROWSER ?? "chromium";
// --autoplay-policy is a Chromium-only flag; Linux WebKit refuses to start when
// handed an unknown option, while macOS WebKit ignored it. Hence green locally and
// red on CI. Select flags per engine rather than passing one set to all of them.
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const chromium = pw[BROWSER];
import { spawn } from "node:child_process";
const PORT = 8185;

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
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ args: launchArgs });
const out = process.argv[2] ?? "/tmp";
try {
  const p = await b.newPage({ viewportSize: { width: 1040, height: 900 }, deviceScaleFactor: 2 });

  await p.goto(`http://127.0.0.1:${PORT}/apps/playground/showcase.html`);
  await p.click("#play");
  await p.waitForFunction(() => document.getElementById("sr").textContent !== "—", null, { timeout: 20000 });
  await p.waitForTimeout(2500);          // let the analyser fill so the viz is not blank
  await p.screenshot({ path: `${out}/showcase.png`, fullPage: true });

  await p.goto(`http://127.0.0.1:${PORT}/apps/playground/`);
  await p.keyboard.press("a");
  await p.waitForFunction(() => window.__playground?.engine != null, null, { timeout: 15000 });
  await p.evaluate(() => { for (const n of [48,52,55,60]) document.querySelector(`[data-note="${n}"]`)?.classList.add("on"); });
  await p.screenshot({ path: `${out}/playground.png`, fullPage: true });
  console.log("wrote showcase.png and playground.png to", out);
} finally { await b.close(); server.kill(); }
