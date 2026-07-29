// AudioWorkletProcessor hosting the WASM engine. Runs on the audio thread:
// no allocation, no async, no per-block object creation.
class SubtractiveProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.engine = 0;
    this.wasm = null;
    this.viewL = null;
    this.viewR = null;
    // Sorted pending events. A plain array with a monotonic read cursor, never shift():
    // shift() on a hot queue is O(n) per call and O(n^2) per block.
    this.queue = [];
    this.cursor = 0;
    this.statFrames = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);

    // Initialise from processorOptions when they are supplied, NOT from a port message.
    // An OfflineAudioContext renders to completion without necessarily servicing the
    // message port, so a port-delivered init (and any port-delivered notes) can arrive
    // after rendering has already finished — producing silence, non-deterministically,
    // depending only on how fast the machine is. processorOptions are delivered with
    // the node itself, before the first block.
    const opts = options?.processorOptions;
    if (opts?.bytes) {
      this.boot(opts.bytes);
      if (opts.events) this.onMessage({ type: "schedule", events: opts.events });
    }
  }

  boot(bytes) {
    // Compile INSIDE the worklet from bytes. Never postMessage a WebAssembly.Module:
    // Safari and headless Chromium silently drop the clone into `messageerror`, which
    // presents as an engine that never becomes ready.
    const mod = new WebAssembly.Module(bytes);
    this.wasm = new WebAssembly.Instance(mod, {}).exports;
    this.engine = this.wasm.engine_new(sampleRate);
    this.port.postMessage({ type: "ready" });
  }

  onMessage(msg) {
    if (msg.type === "init") {
      if (!this.wasm) this.boot(msg.bytes);
      else this.port.postMessage({ type: "ready" });
      return;
    }
    if (!this.wasm) return;

    if (msg.type === "schedule") {
      // Merge a batch of future events, then re-sort once. Compacting first keeps the
      // array from growing without bound over a long sequence.
      if (this.cursor > 0) {
        this.queue = this.queue.slice(this.cursor);
        this.cursor = 0;
      }
      for (let i = 0; i < msg.events.length; i++) this.queue.push(msg.events[i]);
      this.queue.sort((a, b) => a.at - b.at);
      return;
    }
    if (msg.type === "clear") {
      this.queue.length = 0;
      this.cursor = 0;
      this.wasm.all_off(this.engine);
      return;
    }
    this.apply(msg);
  }

  apply(e) {
    switch (e.type) {
      case "noteOn":  this.wasm.note_on(this.engine, e.note, e.vel); break;
      case "noteOff": this.wasm.note_off(this.engine, e.note); break;
      case "allOff":  this.wasm.all_off(this.engine); break;
      case "param":   this.wasm.set_param(this.engine, e.id, e.value); break;
    }
  }

  render(out, offset, frames) {
    if (frames <= 0) return;
    this.wasm.render(this.engine, frames);
    // Rebuild the views only when WASM memory has grown; allocating a Float32Array per
    // block is exactly the GC pressure that produces dropouts under polyphony.
    const mem = this.wasm.memory.buffer;
    if (!this.viewL || this.viewL.buffer !== mem) {
      this.viewL = new Float32Array(mem, this.wasm.out_ptr(this.engine), 128);
      this.viewR = new Float32Array(mem, this.wasm.out_ptr_r(this.engine), 128);
    }
    out[0].set(this.viewL.subarray(0, frames), offset);
    // A mono output still gets the left channel rather than silence.
    if (out.length > 1) out[1].set(this.viewR.subarray(0, frames), offset);
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.wasm || !out || out.length === 0) return true;
    const n = out[0].length;

    // Render in segments between event boundaries, so a note lands on the exact frame
    // it was scheduled for rather than at the next 128-sample quantum. At 128 frames a
    // whole-block granularity is 2.7 ms of jitter, which is audible on a 16th-note
    // sequence and reads as a sloppy player rather than a sloppy clock.
    let done = 0;
    const t0 = currentTime;
    const spf = 1 / sampleRate;
    while (this.cursor < this.queue.length) {
      const ev = this.queue[this.cursor];
      let frame = Math.round((ev.at - t0) / spf);
      if (frame >= n) break;
      if (frame < done) frame = done;
      this.render(out, done, frame - done);
      done = frame;
      this.apply(ev);
      this.cursor++;
    }
    this.render(out, done, n - done);

    // ~10 Hz stats. Posting every block would be 375 messages/second of pure overhead
    // on the audio thread, to update a number a human reads a few times a second.
    this.statFrames += n;
    if (this.statFrames >= sampleRate / 10) {
      this.statFrames = 0;
      this.port.postMessage({ type: "stats", voices: this.wasm.active_voices(this.engine) });
    }
    return true;
  }
}
registerProcessor("subtractive", SubtractiveProcessor);
