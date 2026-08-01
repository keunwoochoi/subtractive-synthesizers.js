/** Patch parameter names accepted by `Engine.setParam`. */
export type ParamName =
  | "shape" | "pulseWidth" | "detuneCents" | "subLevel" | "noiseLevel"
  | "cutoffHz" | "resonance" | "drive" | "envAmount" | "keyTrack"
  | "ampAttack" | "ampDecay" | "ampSustain" | "ampRelease"
  | "fltAttack" | "fltDecay" | "fltSustain" | "fltRelease"
  | "velToCutoff" | "gain"
  | "chorusRate" | "chorusDepth" | "chorusMix"
  | "delayMix" | "delayTime" | "delayFeedback" | "delayTone"
  | "reverbMix" | "reverbSize" | "reverbDamp" | "reverbPredelay"
  | "unison" | "glide"
  | "lfoRate" | "lfoToPitch" | "lfoToCutoff" | "lfoToPwm"
  | "filterKind" | "stereoWidth" | "syncRatio"
  | "pitchEnvAmount" | "pitchEnvDecay"
  | "lfo2Rate" | "lfo2ToCutoff" | "lfo2ToPitch" | "noiseColor" | "oscLevel";

export declare const PARAM: Record<ParamName, number>;

/** Oscillator waveforms. */
export declare const SHAPE: { saw: 0; pulse: 1; triangle: 2 };

/** Filter types. Two 4-pole lowpass characters, then the state-variable outputs. */
export declare const FILTER: {
  ladderLp: 0; diodeLp: 1; svfLp: 2; svfBp: 3; svfHp: 4; svfNotch: 5;
};

/** An event applied at an absolute AudioContext time. */
export interface ScheduledEvent {
  type: "noteOn" | "noteOff" | "allOff" | "param";
  /** MIDI note number, for noteOn / noteOff. */
  note?: number;
  /** 0..1, for noteOn. */
  vel?: number;
  /** Parameter id, for `param`. See {@link PARAM}. */
  id?: number;
  value?: number;
  /** AudioContext time in seconds. */
  at: number;
}

export interface Engine {
  /** The context the engine was created on — yours, or one it made. */
  readonly context: BaseAudioContext;
  /** The engine's output node. Connected to the destination unless `connect: false` was requested. */
  readonly node: AudioWorkletNode;
  /** Unambiguous output handle. This is the same AudioWorkletNode as `node`. */
  readonly output: AudioWorkletNode;
  /** Voices currently sounding. Updated ~10 times a second. */
  readonly voices: number;
  /** Called with engine stats as they arrive. */
  onStats?: (stats: { voices: number }) => void;
  /** Called when the worklet reports a runtime, message-deserialization, or processor error. */
  onError?: (error: Error) => void;
  /** Resume any non-running, non-closed context state, including WebKit's `interrupted`. Safe to call from a user gesture. */
  resume(): Promise<void>;
  /** Start a note now. `note` is MIDI (60 = middle C), `vel` is 0..1. */
  noteOn(note: number, vel?: number): void;
  /** Release a note now; its amp release still rings out. */
  noteOff(note: number): void;
  /** Release every sounding note, tails intact. */
  allOff(): void;
  /** Queue events at absolute context times; applied on the exact frame. */
  schedule(events: ScheduledEvent[]): void;
  /** Drop everything pending and silence. */
  clear(): void;
  /** Set one patch parameter, effective on the next block. */
  setParam(name: ParamName, value: number): void;
  /** Free the WASM engine and disconnect its output. Idempotent; closes only a context the library created. */
  dispose(): Promise<void>;
}

export interface CreateEngineOptions {
  /** Override where the WASM is fetched from. Defaults to the packaged asset. */
  wasmUrl?: string | URL;
  /** Override the worklet module URL. Defaults to inlined source via a Blob URL. */
  workletUrl?: string | URL;
  /** Supply your own context — required for an OfflineAudioContext render. */
  context?: BaseAudioContext;
  /** Connect the output to `context.destination`. Defaults to true; pass false for caller-controlled routing. */
  connect?: boolean;
  /**
   * Events applied at node construction. Required for offline rendering: an
   * OfflineAudioContext can finish rendering without ever servicing the message port.
   */
  initialEvents?: ScheduledEvent[];
}

/** Create the engine. Call from a user gesture; browsers refuse to start audio otherwise. */
export declare function createEngine(options?: CreateEngineOptions): Promise<Engine>;
