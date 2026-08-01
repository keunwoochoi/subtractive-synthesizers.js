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

  const docks = await p.evaluate(async () => {
    const main = document.querySelector("main");
    const header = document.querySelector("header");
    const footer = document.querySelector(".visual-dock");
    const before = { header: header.getBoundingClientRect().top,
      footer: footer.getBoundingClientRect().bottom };
    main.scrollTop = main.scrollHeight;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const after = { header: header.getBoundingClientRect().top,
      footer: footer.getBoundingClientRect().bottom, scrollTop: main.scrollTop,
      viewport: innerHeight };
    const views = [...document.querySelectorAll(".viewtabs a")].map((link) => {
      const style = getComputedStyle(link);
      return { text: link.textContent, href: link.getAttribute("href"),
        current: link.getAttribute("aria-current"), color: style.color,
        background: style.backgroundColor };
    });
    return { before, after, views, repoHref: document.querySelector("header h1 a.hl").href };
  });
  if (docks.after.scrollTop < 1) fail("patch cards do not scroll between the fixed docks");
  if (Math.abs(docks.before.header - docks.after.header) > 1 || docks.after.header < -1)
    fail("transport header moved while patch cards scrolled");
  if (Math.abs(docks.before.footer - docks.after.footer) > 1 ||
      Math.abs(docks.after.footer - docks.after.viewport) > 1)
    fail("spectrum/step dock moved or left the viewport while patch cards scrolled");
  const [editorView, showcaseView] = docks.views;
  if (docks.repoHref !== "https://github.com/keunwoochoi/subtractive-synthesizers.js" ||
      docks.views.length !== 2 || editorView.text !== "Patch editor" ||
      editorView.href !== "./index.html" || editorView.current !== null ||
      showcaseView.text !== "Patch showcase" || showcaseView.href !== "./showcase.html" ||
      showcaseView.current !== "page")
    fail(`showcase view tabs are mislabeled or miswired: ${JSON.stringify(docks.views)}`);
  if (showcaseView.color === editorView.color && showcaseView.background === editorView.background)
    fail("selected showcase tab is not visually distinguished from the editor tab");

  // A patch name is the primary audition gesture: it must initialize the engine and
  // start transport, not merely move a highlight while the page remains silent.
  await p.locator('.card[data-key="warm-pad"] h3').click();
  await p.waitForFunction(() => document.getElementById("sr").textContent !== "—",
                          null, { timeout: 20000 });
  await p.waitForFunction(() => document.getElementById("play").textContent.includes("Stop"));
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
    label: document.getElementById("play").textContent,
    lit: document.querySelectorAll(".st.now").length,
  }));
  if (!state.label.includes("Stop")) fail("transport did not enter playing state");

  // Space is the global transport shortcut and must not scroll the patch list.
  const scrollBeforeSpace = await p.locator("main").evaluate((el) => el.scrollTop);
  await p.keyboard.press("Space");
  await p.waitForFunction(() => document.getElementById("play").textContent.includes("Play"));
  const stopped = await p.evaluate(() => ({
    scrollTop: document.querySelector("main").scrollTop,
    pressed: document.getElementById("play").getAttribute("aria-pressed"),
    lit: document.querySelectorAll(".st.now").length,
  }));
  if (Math.abs(stopped.scrollTop - scrollBeforeSpace) > 1) fail("Space scrolled the patch list");
  if (stopped.pressed !== "false" || stopped.lit) fail("Space did not fully stop transport");
  await p.keyboard.press("Space");
  await p.waitForFunction(() => document.getElementById("play").textContent.includes("Stop"));
  if (await p.locator("#play").getAttribute("aria-pressed") !== "true")
    fail("Space restarted transport without synchronizing the Play button");

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
    // The riff is chosen PER PATCH now, so the label must follow the selection too --
    // otherwise a patch could silently fall back to its group's default and nobody
    // would notice the music stopped matching the sound.
    const riff = await p.evaluate(() => document.getElementById("riff").textContent);
    if (!riff || riff === "—") fail(`${key}: no riff named for this patch`);

    // The step grid is keyed off the chosen riff, so it must track too.
    const lit = await p.evaluate(() =>
      [...document.querySelectorAll(".st")].filter((e) => e.classList.contains("hit")
        || e.classList.contains("acc")).length);
    if (lit === 0) fail(`${key}: step grid shows no steps for its group`);
  }
  await p.waitForTimeout(500);
  await p.keyboard.press("Space");

  if (errs.length) fail("page errors: " + errs.slice(0, 3).join(" | "));
  console.log("showcase:", JSON.stringify({ ...state, peakVoices }));
  console.log(`SHOWCASE OK — ${expected} patches, patch-click starts, Space toggles, docks stay visible, selection + step grid follow every click`);
} finally { await b.close(); server.kill(); }
