// The body of every bundler fixture. Shared on purpose: if each bundler got its own
// snippet, a fixture could pass because its snippet was easier, not because its bundler
// works. One file, three build systems, one claim.
//
// The BARE SPECIFIER is the whole point. install-check.mjs imports by path, which proves
// the tarball is well-formed but bypasses module resolution entirely. Only a bundler
// resolving "subtractive-synthesizers.js" through node_modules, and then rewriting the
// `new URL("./wasm/...", import.meta.url)` inside it, exercises what a real user hits.
import { createEngine } from "subtractive-synthesizers.js";
import { applyPreset } from "subtractive-synthesizers.js/presets";

export async function run() {
  const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: 48000, sampleRate: 48000 });
  const engine = await createEngine({
    context: ctx,
    initialEvents: [{ type: "noteOn", note: 60, vel: 0.9, at: 0 }],
  });
  applyPreset(engine, "supersaw");
  const buf = await ctx.startRendering();
  const ch = buf.getChannelData(0);
  let peak = 0, sum = 0, bad = 0;
  for (let i = 0; i < ch.length; i++) {
    const v = ch[i];
    if (!Number.isFinite(v)) { bad++; continue; }
    peak = Math.max(peak, Math.abs(v));
    sum += v * v;
  }
  return { peak, rms: Math.sqrt(sum / ch.length), bad };
}
