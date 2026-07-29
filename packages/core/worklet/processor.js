// AudioWorkletProcessor hosting the WASM engine. This runs on the audio thread:
// no allocation, no async, no JS objects created per block.
class SubtractiveProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.engine = 0;
    this.wasm = null;
    this.view = null;
    this.port.onmessage = (e) => this.onMessage(e.data);
  }

  onMessage(msg) {
    if (msg.type === "init") {
      // Compile INSIDE the worklet from bytes. Never postMessage a WebAssembly.Module:
      // Safari and headless Chromium silently drop the clone into `messageerror`, which
      // presents as an engine that never becomes ready. (Inherited from the sibling
      // project, where it cost real debugging time.)
      const mod = new WebAssembly.Module(msg.bytes);
      this.wasm = new WebAssembly.Instance(mod, {}).exports;
      this.engine = this.wasm.engine_new(sampleRate);
      this.port.postMessage({ type: "ready" });
      return;
    }
    if (!this.wasm) return;
    switch (msg.type) {
      case "noteOn":  this.wasm.note_on(this.engine, msg.note, msg.vel); break;
      case "noteOff": this.wasm.note_off(this.engine, msg.note); break;
      case "allOff":  this.wasm.all_off(this.engine); break;
      case "param":   this.wasm.set_param(this.engine, msg.id, msg.value); break;
    }
  }

  process(_inputs, outputs) {
    const out = outputs[0];
    if (!this.wasm || !out || out.length === 0) return true;
    const n = out[0].length;
    this.wasm.render(this.engine, n);

    // Rebuild the view only when WASM memory has grown; otherwise reuse it, because
    // allocating a Float32Array per block is exactly the GC pressure that produces
    // dropouts under polyphony.
    const mem = this.wasm.memory.buffer;
    if (!this.view || this.view.buffer !== mem || this.view.length !== n) {
      this.view = new Float32Array(mem, this.wasm.out_ptr(this.engine), n);
    }
    for (let ch = 0; ch < out.length; ch++) out[ch].set(this.view);
    return true;
  }
}
registerProcessor("subtractive", SubtractiveProcessor);
