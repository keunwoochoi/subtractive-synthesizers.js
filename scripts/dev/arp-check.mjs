// Prove the arpeggiator actually arpeggiates: holding a chord must produce a stream of
// SEPARATE notes over time, not one sustained cluster. "It didn't crash" is not a check.
import * as pw from "playwright";
const BROWSER = process.env.BROWSER ?? "chromium";
// --autoplay-policy is a Chromium-only flag; Linux WebKit refuses to start when
// handed an unknown option, while macOS WebKit ignored it. Hence green locally and
// red on CI. Select flags per engine rather than passing one set to all of them.
const launchArgs = BROWSER === "chromium"
  ? ["--autoplay-policy=no-user-gesture-required"] : [];
const chromium = pw[BROWSER];
import { spawn } from "node:child_process";
const PORT = 8187;

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
const fail = (m) => { console.error("ARP FAIL: " + m); server.kill(); process.exit(1); };
await new Promise(r => setTimeout(r, 700));
const b = await chromium.launch({ args: launchArgs });
try {
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", e => errs.push(String(e)));
  p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(`http://127.0.0.1:${PORT}/apps/playground/`, { timeout: 15000 });
  await p.keyboard.press("a");
  // Wait on the ENGINE existing, not on UI copy. The first version waited for the
  // status line to read "ready…", which broke the moment that line was deleted at the
  // owner's request -- a check coupled to wording rather than to state.
  await p.waitForFunction(() => window.__playground?.engine != null,
                          null, { timeout: 20000 });

  // Instrument the port so we can see what the arp actually schedules.
  await p.evaluate(() => {
    window.__ev = [];
    const e = window.__playground.engine;
    const orig = e.node.port.postMessage.bind(e.node.port);
    e.node.port.postMessage = (m) => { window.__ev.push(m); return orig(m); };
  });

  await p.selectOption("#arpOn", "1");
  await p.selectOption("#arpMode", "up");
  await p.selectOption("#arpRate", "16");
  await p.evaluate(() => { for (const n of [60, 64, 67]) window.__playground.down(n); });
  await p.waitForTimeout(1600);

  const r = await p.evaluate(() => {
    const ons = window.__ev.filter(m => m.type === "schedule")
      .flatMap(m => m.events).filter(e => e.type === "noteOn");
    return {
      count: ons.length,
      distinct: [...new Set(ons.map(e => e.note))].sort((a, b) => a - b),
      ascending: ons.slice(0, 6).map(e => e.note),
      voices: window.__playground.engine.voices,
    };
  });
  console.log("arp:", JSON.stringify(r));

  // ~1.6 s of 16ths at 120 BPM is about 12 steps; allow slack for lookahead and startup.
  if (r.count < 6) fail(`expected a stream of notes, got ${r.count}`);
  if (r.distinct.length !== 3) fail(`expected 3 distinct notes, got ${r.distinct}`);
  if (String(r.distinct) !== "60,64,67") fail(`wrong notes: ${r.distinct}`);
  const a = r.ascending;
  const cyclesUp = a[0] === 60 && a[1] === 64 && a[2] === 67 && a[3] === 60;
  if (!cyclesUp) fail(`'up' mode did not cycle low→high: ${a}`);

  // Octave range must actually transpose.
  await p.evaluate(() => { window.__ev = []; document.getElementById("arpOct").value = 2;
                           document.getElementById("arpOct").dispatchEvent(new Event("input")); });
  await p.waitForTimeout(1200);
  const oct = await p.evaluate(() => [...new Set(window.__ev.filter(m => m.type === "schedule")
    .flatMap(m => m.events).filter(e => e.type === "noteOn").map(e => e.note))].sort((a, b) => a - b));
  if (!oct.includes(72)) fail(`octaves=2 did not add the upper octave: ${oct}`);

  // Turning the arp off must stop the stream.
  await p.selectOption("#arpOn", "0");
  await p.evaluate(() => { window.__ev = []; });
  await p.waitForTimeout(700);
  const after = await p.evaluate(() => window.__ev.filter(m => m.type === "schedule").length);
  if (after > 0) fail("arp kept scheduling after being switched off");

  // Loading a patch from the bank must write the ENGINE and the CONTROLS. If only the
  // engine were written, every slider would still show the previous patch and the editor
  // would be lying about the sound it is making.
  const readCtl = () => p.evaluate(() => ({
    cutoff: document.getElementById("cutoffHz").value,
    unison: document.getElementById("unison").value,
    filter: document.getElementById("filterKind").value,
    blurb: document.getElementById("presetBlurb").textContent,
  }));
  const sub = await p.evaluate(() => { window.__playground.loadPreset("sub-bass"); }).then(readCtl);
  const sup = await p.evaluate(() => { window.__playground.loadPreset("supersaw"); }).then(readCtl);
  if (sub.cutoff === sup.cutoff) fail(`loading a patch did not move cutoff (${sub.cutoff})`);
  if (sub.unison === sup.unison) fail(`loading a patch did not move unison (${sub.unison})`);
  if (!sup.blurb) fail("loading a patch did not show its description");
  if (Number(sup.unison) !== 7) fail(`supersaw should load unison 7, got ${sup.unison}`);

  // The filter selector is a <select>, not a range, so it takes a separate code path
  // to the engine. Exercising every kind here catches a wiring break that would
  // otherwise only show up as "the filter menu does nothing".
  for (let k = 0; k < 6; k++) {
    await p.selectOption("#filterKind", String(k));
    await p.waitForTimeout(60);
  }
  const kindErr = errs.filter((e) => /unknown parameter|filterKind/.test(e));
  if (kindErr.length) fail("filter type wiring: " + kindErr[0]);

  if (errs.length) fail("page errors: " + errs.slice(0, 3).join(" | "));
  console.log("ARP OK — cycles held notes, respects mode and octave range, stops cleanly; all 6 filter types wire through; patch bank loads into the controls");
} finally { await b.close(); server.kill(); }
