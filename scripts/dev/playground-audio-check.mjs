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

  const layout = await page.evaluate(async () => {
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    const footer = document.querySelector(".keyboard-dock");
    const patchbar = document.querySelector(".patchbar");
    const runtime = document.querySelector(".runtime");
    const modulation = [...document.querySelectorAll(".stage.modulation .panel")]
      .map((panel) => panel.getBoundingClientRect());
    const before = { header: header.getBoundingClientRect().top,
      footer: footer.getBoundingClientRect().bottom };
    main.scrollTop = main.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    return {
      before,
      after: { header: header.getBoundingClientRect().top,
        footer: footer.getBoundingClientRect().bottom, scrollTop: main.scrollTop,
        viewport: innerHeight },
      patchInHeader: header.contains(patchbar),
      keyboardInFooter: footer.contains(document.getElementById("kb")),
      statusRightGap: patchbar.getBoundingClientRect().right - runtime.getBoundingClientRect().right,
      modulation: modulation.map(({ top, width }) => ({ top, width })),
      panels: document.querySelectorAll(".panel").length,
      randomizers: document.querySelectorAll(".panel .randomize").length,
      repoHref: document.querySelector("header h1 a.hl").href,
      views: [...document.querySelectorAll(".viewtabs a")].map((link) => {
        const style = getComputedStyle(link);
        return { text: link.textContent, href: link.getAttribute("href"),
          current: link.getAttribute("aria-current"), color: style.color,
          background: style.backgroundColor };
      }),
    };
  });
  if (!layout.patchInHeader || !layout.keyboardInFooter)
    fail("patch selector or keyboard is outside its fixed dock");
  if (layout.after.scrollTop < 1) fail("control panels do not scroll between the fixed docks");
  if (Math.abs(layout.before.header - layout.after.header) > 1 || layout.after.header < -1)
    fail("title/patch dock moved while controls scrolled");
  if (Math.abs(layout.before.footer - layout.after.footer) > 1 ||
      Math.abs(layout.after.footer - layout.after.viewport) > 1)
    fail("keyboard dock moved or left the viewport while controls scrolled");
  if (layout.statusRightGap < -1 || layout.statusRightGap > 16)
    fail(`runtime status is not at the patch bar's right edge (gap ${layout.statusRightGap})`);
  if (layout.modulation.length !== 5 ||
      Math.max(...layout.modulation.map((panel) => panel.top)) -
      Math.min(...layout.modulation.map((panel) => panel.top)) > 1 ||
      layout.modulation.some((panel) => panel.width < 184))
    fail(`modulation panels are not one usable row: ${JSON.stringify(layout.modulation)}`);
  if (layout.panels !== layout.randomizers)
    fail(`expected one randomizer per panel, found ${layout.randomizers}/${layout.panels}`);
  const [editorView, showcaseView] = layout.views;
  if (layout.repoHref !== "https://github.com/keunwoochoi/subtractive-synthesizers.js" ||
      layout.views.length !== 2 || editorView.text !== "Patch editor" ||
      editorView.href !== "./index.html" || editorView.current !== "page" ||
      showcaseView.text !== "Patch showcase" || showcaseView.href !== "./showcase.html" ||
      showcaseView.current !== null)
    fail(`editor view tabs are mislabeled or miswired: ${JSON.stringify(layout.views)}`);
  if (editorView.color === showcaseView.color && editorView.background === showcaseView.background)
    fail("selected editor tab is not visually distinguished from the showcase tab");

  await page.keyboard.press("a");
  await page.waitForFunction(() => window.__playground?.engine != null, null, { timeout: 20000 });

  // A randomizer changes only its panel. Selecting the same base patch through the
  // custom marker restores every public value, including demo-only arpeggiator state.
  await page.evaluate(() => window.__playground.loadPreset("analog-bass"));
  const values = (panel) => panel.locator("input, select").evaluateAll((controls) =>
    Object.fromEntries(controls.map((control) => [control.id, control.value])));
  const oscillator = page.locator(".panel.audio").nth(0);
  const filter = page.locator(".panel.audio").nth(1);
  const oscBefore = await values(oscillator);
  const filterBefore = await values(filter);
  await oscillator.locator(".randomize").click();
  const oscRandom = await values(oscillator);
  const filterRandom = await values(filter);
  if (JSON.stringify(oscRandom) === JSON.stringify(oscBefore)) fail("oscillator randomizer changed nothing");
  if (JSON.stringify(filterRandom) !== JSON.stringify(filterBefore))
    fail("oscillator randomizer changed the filter panel");
  if (await page.locator("#preset").inputValue() !== "__custom" ||
      await page.locator("#preset option[data-custom]").count() !== 1)
    fail("randomizing a panel did not expose the choose-a-patch reset path");
  await page.selectOption("#preset", "analog-bass");
  if (JSON.stringify(await values(oscillator)) !== JSON.stringify(oscBefore) ||
      await page.locator("#preset option[data-custom]").count())
    fail("choosing the base patch did not restore randomized oscillator values");

  const arpeggiator = page.locator(".panel.play");
  const arpBefore = await values(arpeggiator);
  await arpeggiator.locator(".randomize").click();
  if (JSON.stringify(await values(arpeggiator)) === JSON.stringify(arpBefore))
    fail("arpeggiator randomizer changed nothing");
  await page.selectOption("#preset", "analog-bass");
  if (JSON.stringify(await values(arpeggiator)) !== JSON.stringify(arpBefore))
    fail("choosing a patch did not restore randomized arpeggiator values");

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

  if (await page.locator("#start").count()) {
    fail("a Start button is back — the first gesture should boot the engine");
  }

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
