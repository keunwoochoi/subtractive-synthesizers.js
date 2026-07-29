// Public API. SSR-safe: nothing touches `window` or `AudioContext` at import time.

/** Patch parameter ids. Mirrors the `set_param` match arms in crates/dsp/src/lib.rs. */
export const PARAM = {
  shape: 0, pulseWidth: 1, detuneCents: 2, subLevel: 3, noiseLevel: 4,
  cutoffHz: 5, resonance: 6, drive: 7, envAmount: 8, keyTrack: 9,
  ampAttack: 10, ampDecay: 11, ampSustain: 12, ampRelease: 13,
  fltAttack: 14, fltDecay: 15, fltSustain: 16, fltRelease: 17,
  velToCutoff: 18, gain: 19,
};

export const SHAPE = { saw: 0, pulse: 1, triangle: 2 };

/**
 * Create the engine. Lazy: the AudioContext is constructed here, so call it from a
 * user gesture (browsers refuse to start audio otherwise).
 */
export async function createEngine({ wasmUrl, workletUrl, context } = {}) {
  const ctx = context ?? new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();
  const bytes = await (await fetch(wasmUrl)).arrayBuffer();
  await ctx.audioWorklet.addModule(workletUrl);

  const node = new AudioWorkletNode(ctx, "subtractive", { outputChannelCount: [2] });
  node.connect(ctx.destination);

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("worklet never signalled ready")), 5000);
    node.port.onmessage = (e) => {
      if (e.data?.type === "ready") { clearTimeout(t); resolve(); }
    };
    // Transfer a copy: the original ArrayBuffer stays usable for a second engine.
    const copy = bytes.slice(0);
    node.port.postMessage({ type: "init", bytes: copy }, [copy]);
  });

  const post = (m) => node.port.postMessage(m);

  return {
    context: ctx,
    node,
    resume: () => ctx.resume(),
    noteOn: (note, vel = 0.8) => post({ type: "noteOn", note, vel }),
    noteOff: (note) => post({ type: "noteOff", note }),
    allOff: () => post({ type: "allOff" }),
    setParam: (name, value) => {
      const id = PARAM[name];
      if (id === undefined) throw new Error(`unknown parameter: ${name}`);
      post({ type: "param", id, value });
    },
  };
}
