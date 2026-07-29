// AudioWorkletProcessor hosting the WASM engine. Runs on the audio thread:
// no allocation, no async, no per-block object creation.
class SubtractiveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = 0;
    this.wasm = null;
    this.view = null;
    // Sorted pending events. A plain array with a monotonic read cursor, never shift():
    // shift() on a hot queue is O(n) per call and O(n^2) per block.
    this.queue = [];
    this.cursor = 0;
    this.statFrames = 0;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    if (msg.type === "init") {
      // Compile INSIDE the worklet from bytes. Never postMessage a WebAssembly.Module:
      // Safari and headless Chromium silently drop the clone into `messageerror`, which
      // presents as an engine that never becomes ready.
      const mod = new WebAssembly.Module(msg.bytes);
      this.wasm = new WebAssembly.Instance(mod, {}).exports;
      this.engine = this.wasm.engine_new(sampleRate);
      this.port.postMessage({ type: "ready" });
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
    const mem = this.wasm.memory.buffer;
    if (!this.view || this.view.buffer !== mem) {
      this.view = new Float32Array(mem, this.wasm.out_ptr(this.engine), 128);
    }
    const src = this.view.subarray(0, frames);
    for (let ch = 0; ch < out.length; ch++) out[ch].set(src, offset);
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
