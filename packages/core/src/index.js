// Public API. SSR-safe: nothing touches `window` or `AudioContext` at import time.
//
// The worklet source is inlined at build time and served from a Blob URL, so no bundler
// configuration is required and no file has to be copied into a consumer's public
// directory. In the source tree the placeholder is null and the worklet is fetched from
// its own file, which keeps `npm run dev` working without a build.
const WORKLET_SOURCE = /* __WORKLET_SOURCE__ */ null;

import { PARAM } from "./parameters.js";
export { FILTER, PARAM, PARAMETERS, SHAPE } from "./parameters.js";

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
export async function createEngine({ wasmUrl, workletUrl, context, initialEvents, connect = true } = {}) {
  const ownsContext = context === undefined;
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  const ctx = context ?? new Context();
  let node;

  try {
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
        // STRIPPED BY THE BUILD -- see scripts/build.mjs. It must not reach the tarball.
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
    node = new AudioWorkletNode(ctx, "subtractive", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      processorOptions: { bytes: bytes.slice(0), events: initialEvents },
    });

    const realtime = typeof ctx.startRendering !== "function";
    const api = { voices: 0 };
    let readyState = realtime ? "pending" : "ready";
    let resolveReady;
    let rejectReady;
    let resolveDisposed;
    let readyTimer;
    const ready = realtime ? new Promise((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
      readyTimer = setTimeout(() => {
        readyState = "rejected";
        reject(new Error("subtractive-synthesizers: worklet never signalled ready"));
      }, 5000);
    }) : Promise.resolve();
    const disposedAck = new Promise((resolve) => { resolveDisposed = resolve; });
    const waitForDisposed = () => new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("subtractive-synthesizers: worklet did not acknowledge disposal")),
        5000,
      );
      disposedAck.then(() => {
        clearTimeout(timer);
        resolve();
      });
    });

    const asError = (detail) => detail instanceof Error
      ? detail
      : new Error(`subtractive-synthesizers: ${String(detail)}`);
    const report = (detail) => {
      const error = asError(detail);
      if (readyState === "pending") {
        readyState = "rejected";
        clearTimeout(readyTimer);
        rejectReady(error);
        return;
      }
      console.error(error);
      api.onError?.(error);
    };

    node.port.onmessage = (event) => {
      const message = event.data;
      if (message?.type === "ready" && readyState === "pending") {
        readyState = "ready";
        clearTimeout(readyTimer);
        resolveReady();
      } else if (message?.type === "error") {
        report(new Error(`subtractive-synthesizers worklet: ${message.message}`));
      } else if (message?.type === "stats") {
        api.voices = message.voices;
        api.onStats?.(message);
      } else if (message?.type === "disposed") {
        resolveDisposed();
      }
    };
    node.port.onmessageerror = () => report(new Error(
      "subtractive-synthesizers: worklet message failed to deserialize"));
    node.onprocessorerror = () => report(new Error(
      "subtractive-synthesizers: AudioWorklet processor crashed during construction/render"));

    if (connect !== false) node.connect(ctx.destination);

    // A realtime context services the port, so waiting for the ack is meaningful there.
    // An offline context may not, and must not be blocked on one — it is already armed.
    await ready;

    let disposed = false;
    let disposePromise;
    const assertLive = () => {
      if (disposed) throw new Error("subtractive-synthesizers: engine is disposed");
    };
    const resume = async () => {
      assertLive();
      if (ctx.state === "running" || ctx.state === "closed") return;
      try {
        await ctx.resume();
      } catch (error) {
        report(error);
        throw error;
      }
    };
    const resumeIfNeeded = () => {
      if (realtime && ctx.state !== "running" && ctx.state !== "closed") {
        void resume().catch(() => {});
      }
    };
    const post = (message) => {
      assertLive();
      node.port.postMessage(message);
    };
    const dispose = () => {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        try {
          node.port.postMessage({ type: "dispose" });
          // A closed or offline context has already destroyed, or owns, the processor
          // lifetime. A live realtime context can acknowledge that engine_free ran.
          if (realtime && ctx.state !== "closed") await waitForDisposed();
        } finally {
          node.disconnect();
          node.port.close?.();
          if (ownsContext && ctx.state !== "closed") await ctx.close();
        }
      })();
      return disposePromise;
    };

    return Object.assign(api, {
      context: ctx,
      node,
      output: node,
      resume,
      noteOn: (note, vel = 0.8) => {
        resumeIfNeeded();
        post({ type: "noteOn", note, vel });
      },
      noteOff: (note) => post({ type: "noteOff", note }),
      allOff: () => post({ type: "allOff" }),
      /** Schedule events at absolute context times. Applied on the exact frame. */
      schedule: (events) => {
        resumeIfNeeded();
        post({ type: "schedule", events });
      },
      /** Drop everything pending and silence. */
      clear: () => post({ type: "clear" }),
      setParam: (name, value) => {
        const id = PARAM[name];
        if (id === undefined) throw new Error(`unknown parameter: ${name}`);
        post({ type: "param", id, value });
      },
      dispose,
    });
  } catch (error) {
    if (node) {
      try { node.port.postMessage({ type: "dispose" }); } catch {}
      try { node.disconnect(); } catch {}
      try { node.port.close?.(); } catch {}
    }
    if (ownsContext && ctx.state !== "closed") {
      try { await ctx.close(); } catch {}
    }
    throw error;
  }
}
