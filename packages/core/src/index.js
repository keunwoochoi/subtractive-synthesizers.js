// Public API. SSR-safe: nothing touches `window` or `AudioContext` at import time.
//
// The worklet source is inlined at build time and served from a Blob URL, so no bundler
// configuration is required and no file has to be copied into a consumer's public
// directory. In the source tree the placeholder is null and the worklet is fetched from
// its own file, which keeps `npm run dev` working without a build.
const WORKLET_SOURCE = /* __WORKLET_SOURCE__ */ null;

/** Patch parameter ids. Mirrors the `set_param` match arms in crates/dsp/src/lib.rs. */
export const PARAM = {
  shape: 0, pulseWidth: 1, detuneCents: 2, subLevel: 3, noiseLevel: 4,
  cutoffHz: 5, resonance: 6, drive: 7, envAmount: 8, keyTrack: 9,
  ampAttack: 10, ampDecay: 11, ampSustain: 12, ampRelease: 13,
  fltAttack: 14, fltDecay: 15, fltSustain: 16, fltRelease: 17,
  velToCutoff: 18, gain: 19,
  chorusRate: 20, chorusDepth: 21, chorusMix: 22,
  delayMix: 23, delayTime: 24, delayFeedback: 25, delayTone: 26,
  reverbMix: 27, reverbSize: 28, reverbDamp: 29, reverbPredelay: 30,
  unison: 31, glide: 32, filterKind: 37, stereoWidth: 38, syncRatio: 39,
  pitchEnvAmount: 40, pitchEnvDecay: 41,
  lfo2Rate: 42, lfo2ToCutoff: 43, lfo2ToPitch: 44,
  lfoRate: 33, lfoToPitch: 34, lfoToCutoff: 35, lfoToPwm: 36,
};

export const SHAPE = { saw: 0, pulse: 1, triangle: 2 };

/** Filter types: two 4-pole lowpass characters, then the state-variable outputs. */
export const FILTER = {
  ladderLp: 0, diodeLp: 1, svfLp: 2, svfBp: 3, svfHp: 4, svfNotch: 5,
};

/**
 * Create the engine. Lazy: the AudioContext is constructed here, so call it from a
 * user gesture (browsers refuse to start audio otherwise).
 */
/**
 * Create the engine.
 *
 * Zero configuration is the point: with no arguments it resolves its own WASM relative to
 * this module and builds the worklet from inlined source. Both are overridable for anyone
 * serving assets from a CDN or a non-standard path.
 *
 * Call it from a user gesture — browsers refuse to start audio otherwise.
 */
export async function createEngine({ wasmUrl, workletUrl, context, initialEvents } = {}) {
  const ctx = context ?? new (globalThis.AudioContext ?? globalThis.webkitAudioContext)();

  // Vite, webpack 5 and Rollup all understand this and emit the asset; it is the one
  // idiom that does not require a plugin.
  const wasm = wasmUrl ?? new URL("./wasm/subtractive_dsp.wasm", import.meta.url);
  const res = await fetch(wasm);
  if (!res.ok) {
    throw new Error(
      `subtractive-synthesizers: could not load WASM from ${wasm} (HTTP ${res.status}). ` +
      `Pass { wasmUrl } if you serve it from elsewhere.`);
  }
  const bytes = await res.arrayBuffer();

  let moduleUrl = workletUrl;
  let revoke;
  if (!moduleUrl) {
    if (WORKLET_SOURCE) {
      const blob = new Blob([WORKLET_SOURCE], { type: "text/javascript" });
      moduleUrl = URL.createObjectURL(blob);
      revoke = () => URL.revokeObjectURL(moduleUrl);
    } else {
      // Source-tree fallback: no build has run, so fetch the worklet from its own file.
      moduleUrl = new URL("../worklet/processor.js", import.meta.url);
    }
  }
  try {
    await ctx.audioWorklet.addModule(moduleUrl);
  } finally {
    revoke?.();
  }

  // Everything the engine needs to make sound is handed over WITH the node. Port
  // messages remain the live-control path, but an offline render must never depend on
  // one being delivered — see the worklet constructor.
  const node = new AudioWorkletNode(ctx, "subtractive", {
    outputChannelCount: [2],
    processorOptions: { bytes: bytes.slice(0), events: initialEvents },
  });
  node.connect(ctx.destination);

  // A realtime context services the port, so waiting for the ack is meaningful there.
  // An offline context may not, and must not be blocked on one — it is already armed.
  if (typeof ctx.startRendering !== "function") {
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("worklet never signalled ready")), 5000);
      node.port.onmessage = (e) => {
        if (e.data?.type === "ready") { clearTimeout(t); resolve(); }
      };
    });
  }

  const post = (m) => node.port.postMessage(m);
  const api = { voices: 0 };
  node.port.onmessage = (e) => {
    if (e.data?.type === "stats") {
      api.voices = e.data.voices;
      api.onStats?.(e.data);
    }
  };

  return Object.assign(api, {
    context: ctx,
    node,
    resume: () => ctx.resume(),
    noteOn: (note, vel = 0.8) => post({ type: "noteOn", note, vel }),
    noteOff: (note) => post({ type: "noteOff", note }),
    allOff: () => post({ type: "allOff" }),
    /** Schedule events at absolute context times. Applied on the exact frame. */
    schedule: (events) => post({ type: "schedule", events }),
    /** Drop everything pending and silence. */
    clear: () => post({ type: "clear" }),
    setParam: (name, value) => {
      const id = PARAM[name];
      if (id === undefined) throw new Error(`unknown parameter: ${name}`);
      post({ type: "param", id, value });
    },
  });
}
