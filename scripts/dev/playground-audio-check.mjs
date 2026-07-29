// Does the PATCH EDITOR actually make a sound?
//
// Nothing verified this. e2e-check renders the packaged engine offline, showcase-check
// drives the showcase, and arp-check asserts that events are SCHEDULED -- none of them
// touches the editor's audio path. The owner reported "the patch editor doesn't sound"
// while every check was green, which is the definition of a gap.
//
//     node scripts/dev/playground-audio-check.mjs      (BROWSER=webkit to switch engine)
import * as pw from "playwright";
import { spawn } from "node:child_process";

const BROWSER = process.env.BROWSER ?? "chromium";
const launchArgs = BROWSER === "chromium" ? ["--autoplay-policy=no-user-gesture-required"] : [];
const PORT = 8307;
const fail = (m) => { console.error(`PLAYGROUND AUDIO FAIL [${BROWSER}]: ${m}`); process.exit(1); };

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"],
                     { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await pw[BROWSER].launch({ args: launchArgs });
try {
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });

  await page.goto(`http://127.0.0.1:${PORT}/apps/playground/`, { timeout: 15000 });
  await page.click("#start");
  await page.waitForFunction(() => window.__playground?.engine != null, null, { timeout: 20000 });

  // Tap the engine node and measure. Measuring the NODE rather than the destination is
  // deliberate: it isolates "the synth is producing samples" from "the machine has
  // speakers", and a headless runner has no speakers.
  const measure = async (patch) => page.evaluate(async (key) => {
    const e = window.__playground.engine;
    if (key) window.__playground.loadPreset(key);
    const an = e.context.createAnalyser();
    an.fftSize = 2048;
    e.node.connect(an);
    const buf = new Float32Array(an.fftSize);
    const peakOver = async (ms) => {
      let pk = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < ms) {
        an.getFloatTimeDomainData(buf);
        for (const v of buf) pk = Math.max(pk, Math.abs(v));
        await new Promise((r) => requestAnimationFrame(r));
      }
      return pk;
    };
    const before = await peakOver(220);
    e.noteOn(60, 0.9);
    const during = await peakOver(800);
    e.noteOff(60);
    return { before, during };
  }, patch);

  const state = await page.evaluate(() => window.__playground.engine.context.state);
  console.log(`  context state after Start: ${state}`);
  if (state !== "running") fail(`AudioContext is "${state}" after the gesture — iOS-class bug`);

  // The path a person actually uses: a mouse press on a piano key. scrollIntoView first,
  // because raw mouse.move does not auto-scroll and the keyboard is below the fold on a
  // page this tall -- the first version of this check clicked empty space and reported
  // the editor as silent.
  {
    const key = page.locator('.wk[data-note="60"]');
    await key.scrollIntoViewIfNeeded();
    const box = await key.boundingBox();
    const pk = page.evaluate(async () => {
      const e = window.__playground.engine;
      const an = e.context.createAnalyser(); an.fftSize = 2048;
      e.node.connect(an);
      const buf = new Float32Array(2048);
      let peak = 0; const t0 = performance.now();
      while (performance.now() - t0 < 900) {
        an.getFloatTimeDomainData(buf);
        for (const v of buf) peak = Math.max(peak, Math.abs(v));
        await new Promise((r) => requestAnimationFrame(r));
      }
      return peak;
    });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85);
    await page.mouse.down();
    await page.waitForTimeout(350);
    await page.mouse.up();
    const peak = await pk;
    console.log(`  mouse click on a key   peak ${peak.toFixed(4)}`);
    if (peak < 0.01) fail(`clicking a key produced silence — peak ${peak}`);
  }

  // Default patch, plus one from each group -- a silent patch in one category would
  // otherwise hide behind a loud default.
  for (const patch of [null, "analog-bass", "supersaw", "warm-pad", "clav", "brass-stab"]) {
    const { before, during } = await measure(patch);
    const name = patch ?? "(default)";
    console.log(`  ${name.padEnd(13)} idle ${before.toFixed(4)}  playing ${during.toFixed(4)}`);
    if (during < 0.01) fail(`${name} produced (near) silence — peak ${during}`);
    if (during > 1.0) fail(`${name} clipped — peak ${during}`);
  }

  if (errs.length) fail("page errors: " + errs.slice(0, 3).join(" | "));
  console.log(`PLAYGROUND AUDIO OK [${BROWSER}] — the editor sounds on every patch tested`);
} finally {
  await browser.close();
  server.kill();
}
