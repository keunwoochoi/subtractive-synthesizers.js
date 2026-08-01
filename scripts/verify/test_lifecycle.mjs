import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { beforeEach } from "node:test";
import vm from "node:vm";

class MockPort {
  constructor() {
    this.messages = [];
    this.closeCalls = 0;
    this.onmessage = null;
    this.onmessageerror = null;
  }

  postMessage(message) {
    this.messages.push(message);
    if (message.type === "dispose" && MockNode.ackDispose) {
      queueMicrotask(() => this.emit({ type: "disposed" }));
    }
  }

  emit(data) {
    this.onmessage?.({ data });
  }

  close() {
    this.closeCalls++;
  }
}

class MockNode {
  static instances = [];
  static signal = "ready";
  static ackDispose = true;

  constructor(context, name, options) {
    this.context = context;
    this.name = name;
    this.options = options;
    this.port = new MockPort();
    this.connectTargets = [];
    this.disconnectCalls = 0;
    this.onprocessorerror = null;
    MockNode.instances.push(this);
    queueMicrotask(() => {
      if (MockNode.signal === "ready") this.port.emit({ type: "ready" });
      else if (MockNode.signal === "messageerror") this.port.onmessageerror?.(new Event("messageerror"));
      else if (MockNode.signal === "processorerror") this.onprocessorerror?.(new Event("processorerror"));
      else if (MockNode.signal === "worklet-error") this.port.emit({ type: "error", message: "boot failed" });
    });
  }

  connect(target) {
    this.connectTargets.push(target);
    return target;
  }

  disconnect() {
    this.disconnectCalls++;
  }
}

class MockContext {
  constructor(state = "suspended") {
    this.state = state;
    this.destination = { context: this };
    this.addedModules = [];
    this.resumeCalls = 0;
    this.closeCalls = 0;
    this.audioWorklet = {
      addModule: async (url) => { this.addedModules.push(String(url)); },
    };
  }

  resume() {
    this.resumeCalls++;
    this.state = "running";
    return Promise.resolve();
  }

  close() {
    this.closeCalls++;
    this.state = "closed";
    return Promise.resolve();
  }
}

class OwnedContext extends MockContext {
  constructor() {
    super("suspended");
    OwnedContext.instances.push(this);
  }

  static instances = [];
}

class MockOfflineContext extends MockContext {
  startRendering() {}
}

globalThis.AudioContext = OwnedContext;
globalThis.webkitAudioContext = undefined;
globalThis.AudioWorkletNode = MockNode;
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => new ArrayBuffer(16),
});

const { createEngine } = await import("../../packages/core/src/index.js");

beforeEach(() => {
  MockNode.instances.length = 0;
  MockNode.signal = "ready";
  MockNode.ackDispose = true;
  OwnedContext.instances.length = 0;
});

test("default routing owns and closes its context exactly once", async () => {
  const engine = await createEngine({ wasmUrl: "/engine.wasm", workletUrl: "/processor.js" });
  const context = OwnedContext.instances[0];
  const node = MockNode.instances[0];

  assert.equal(engine.node, node);
  assert.equal(engine.output, node);
  assert.deepEqual(node.connectTargets, [context.destination]);

  const first = engine.dispose();
  const second = engine.dispose();
  assert.equal(first, second, "dispose must return its one in-flight/completed promise");
  await first;
  assert.equal(node.port.messages.filter((message) => message.type === "dispose").length, 1);
  assert.equal(node.disconnectCalls, 1);
  assert.equal(node.port.closeCalls, 1);
  assert.equal(context.closeCalls, 1);
  assert.throws(() => engine.noteOn(60), /engine is disposed/);
});

test("connect:false leaves a supplied context and destination under caller control", async () => {
  const context = new MockContext("running");
  const engine = await createEngine({
    context,
    connect: false,
    wasmUrl: "/engine.wasm",
    workletUrl: "/processor.js",
  });
  const node = MockNode.instances[0];

  assert.equal(engine.output, engine.node);
  assert.deepEqual(node.connectTargets, []);
  await engine.dispose();
  await engine.dispose();
  assert.equal(context.closeCalls, 0, "a caller-owned context must never be closed");
  assert.equal(node.disconnectCalls, 1);
});

test("offline caller contexts do not wait for an undeliverable disposal acknowledgement", async () => {
  MockNode.ackDispose = false;
  const context = new MockOfflineContext("suspended");
  const engine = await createEngine({
    context,
    connect: false,
    wasmUrl: "/engine.wasm",
    workletUrl: "/processor.js",
  });

  await engine.dispose();
  assert.equal(context.closeCalls, 0);
  assert.equal(MockNode.instances[0].disconnectCalls, 1);
});

test("noteOn and resume recover interrupted and future non-running states but not closed", async () => {
  const context = new MockContext("interrupted");
  const engine = await createEngine({ context, wasmUrl: "/engine.wasm", workletUrl: "/processor.js" });
  const port = MockNode.instances[0].port;

  engine.noteOn(64, 0.7);
  assert.equal(context.resumeCalls, 1);
  assert.deepEqual(port.messages.at(-1), { type: "noteOn", note: 64, vel: 0.7 });

  context.state = "vendor-paused";
  engine.schedule([{ type: "noteOn", note: 67, vel: 0.5, at: 1 }]);
  assert.equal(context.resumeCalls, 2);

  context.state = "suspended";
  await engine.resume();
  assert.equal(context.resumeCalls, 3);

  context.state = "closed";
  await engine.resume();
  assert.equal(context.resumeCalls, 3, "closed contexts must not be resumed");
  await engine.dispose();
});

for (const [signal, expected] of [
  ["messageerror", /message failed to deserialize/],
  ["processorerror", /processor crashed during construction\/render/],
  ["worklet-error", /worklet: boot failed/],
]) {
  test(`construction rejects and closes its owned context on ${signal}`, async () => {
    MockNode.signal = signal;
    await assert.rejects(
      createEngine({ wasmUrl: "/engine.wasm", workletUrl: "/processor.js" }),
      expected,
    );
    assert.equal(OwnedContext.instances[0].closeCalls, 1);
    assert.equal(MockNode.instances[0].disconnectCalls, 1);
  });
}

test("runtime message and processor failures reach onError and remain loud", async () => {
  const context = new MockContext("running");
  const engine = await createEngine({ context, wasmUrl: "/engine.wasm", workletUrl: "/processor.js" });
  const node = MockNode.instances[0];
  const seen = [];
  const logged = [];
  const originalError = console.error;
  engine.onError = (error) => seen.push(error);
  console.error = (error) => logged.push(error);
  try {
    node.port.onmessageerror(new Event("messageerror"));
    node.onprocessorerror(new Event("processorerror"));
    node.port.emit({ type: "error", message: "render failed" });
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(seen.map((error) => error.message), [
    "subtractive-synthesizers: worklet message failed to deserialize",
    "subtractive-synthesizers: AudioWorklet processor crashed during construction/render",
    "subtractive-synthesizers worklet: render failed",
  ]);
  assert.equal(logged.length, 3);
  await engine.dispose();
});

function loadProcessor(WebAssemblyImplementation) {
  const source = readFileSync(new URL("../../packages/core/worklet/processor.js", import.meta.url), "utf8");
  let Processor;
  class Port {
    constructor() {
      this.messages = [];
      this.onmessage = null;
      this.onmessageerror = null;
    }
    postMessage(message) { this.messages.push(message); }
  }
  class AudioWorkletProcessor {
    constructor() { this.port = new Port(); }
  }
  const sandbox = {
    AudioWorkletProcessor,
    WebAssembly: WebAssemblyImplementation,
    registerProcessor: (_name, constructor) => { Processor = constructor; },
    sampleRate: 48000,
    currentTime: 0,
    Float32Array,
    Array,
    Error,
    TypeError,
    Math,
    String,
  };
  vm.runInNewContext(source, sandbox, { filename: "processor.js" });
  return Processor;
}

test("the worklet frees its WASM engine once and acknowledges repeated disposal", () => {
  const freed = [];
  const exports = {
    engine_new: () => 37,
    engine_free: (pointer) => freed.push(pointer),
  };
  const Processor = loadProcessor({
    Module: class {},
    Instance: class { constructor() { this.exports = exports; } },
  });
  const processor = new Processor({ processorOptions: { bytes: new ArrayBuffer(1) } });

  assert.equal(processor.port.messages.length, 1);
  assert.equal(processor.port.messages[0].type, "ready");
  processor.port.onmessage({ data: { type: "dispose" } });
  processor.port.onmessage({ data: { type: "dispose" } });
  assert.deepEqual(freed, [37]);
  assert.equal(processor.engine, 0);
  assert.equal(processor.wasm, null);
  assert.equal(processor.port.messages.filter((message) => message.type === "disposed").length, 2);
});

test("the worklet reports boot, malformed-message, and deserialization errors", () => {
  const Processor = loadProcessor({
    Module: class { constructor() { throw new Error("invalid wasm"); } },
    Instance: class {},
  });
  const processor = new Processor({ processorOptions: { bytes: new ArrayBuffer(1) } });
  processor.port.onmessage({ data: null });
  processor.port.onmessageerror(new Event("messageerror"));

  assert.equal(processor.port.messages.length, 3);
  assert.match(processor.port.messages[0].message, /invalid wasm/);
  assert.match(processor.port.messages[1].message, /object with a type/);
  assert.match(processor.port.messages[2].message, /failed to deserialize/);
});
