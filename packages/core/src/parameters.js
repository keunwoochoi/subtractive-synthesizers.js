/**
 * Authoritative public parameter metadata.
 *
 * Parameter ids, preset-reset defaults, supported control ranges, increments, units,
 * and enum values are defined here once. The public constants, preset defaults,
 * playground controls, TypeScript declarations, and README table all derive from this
 * object. A `default` is the value applied for an omitted field whenever a preset is
 * loaded; it is not a request to mutate the engine during construction.
 */

export const SHAPE = Object.freeze({ saw: 0, pulse: 1, triangle: 2 });

/** Filter types: two 4-pole lowpass characters, then the state-variable outputs. */
export const FILTER = Object.freeze({
  ladderLp: 0,
  diodeLp: 1,
  svfLp: 2,
  svfBp: 3,
  svfHp: 4,
  svfNotch: 5,
});

const define = (id, defaultValue, min, max, step, unit, values, editorMax) => Object.freeze({
  id,
  default: defaultValue,
  min,
  max,
  step,
  unit,
  ...(values ? { values } : {}),
  ...(editorMax === undefined ? {} : { editorMax }),
});
const enumeration = (id, defaultValue, values) => define(
  id, defaultValue, Math.min(...Object.values(values)), Math.max(...Object.values(values)), 1, "enum", values,
);

export const PARAMETERS = Object.freeze({
  shape: enumeration(0, 0, SHAPE),
  filterKind: enumeration(37, 0, FILTER),
  unison: define(31, 2, 1, 7, 1, "voices"),
  detuneCents: define(2, 8, 0, 1400, 0.5, "cents", undefined, 40),
  pulseWidth: define(1, 0.5, 0.05, 0.95, 0.01, "ratio"),
  subLevel: define(3, 0.25, 0, 1, 0.01, "linear gain"),
  noiseLevel: define(4, 0, 0, 1, 0.01, "linear gain"),
  glide: define(32, 0, 0, 0.4, 0.005, "seconds"),
  cutoffHz: define(5, 1200, 60, 8000, 10, "Hz"),
  resonance: define(6, 0.3, 0, 1, 0.01, "ratio"),
  drive: define(7, 1.2, 0.5, 4, 0.05, "times"),
  envAmount: define(8, 2400, 0, 8000, 50, "Hz"),
  keyTrack: define(9, 0.35, 0, 1, 0.01, "ratio"),
  velToCutoff: define(18, 2000, 0, 6000, 50, "Hz"),
  ampAttack: define(10, 0.005, 0.001, 2, 0.001, "seconds"),
  ampDecay: define(11, 0.25, 0.005, 2, 0.005, "seconds"),
  ampSustain: define(12, 0.7, 0, 1, 0.01, "ratio"),
  ampRelease: define(13, 0.25, 0.005, 3, 0.005, "seconds"),
  fltAttack: define(14, 0.002, 0.001, 2, 0.001, "seconds"),
  fltDecay: define(15, 0.3, 0.005, 2, 0.005, "seconds"),
  fltSustain: define(16, 0.3, 0, 1, 0.01, "ratio"),
  fltRelease: define(17, 0.25, 0.005, 3, 0.005, "seconds"),
  lfoRate: define(33, 5, 0.05, 16, 0.05, "Hz"),
  lfoToPitch: define(34, 0, 0, 60, 1, "cents"),
  lfoToCutoff: define(35, 0, 0, 3000, 25, "Hz"),
  lfoToPwm: define(36, 0, 0, 0.45, 0.01, "ratio"),
  chorusMix: define(22, 0, 0, 1, 0.01, "ratio"),
  chorusRate: define(20, 0.6, 0.05, 6, 0.01, "Hz"),
  chorusDepth: define(21, 3, 0, 12, 0.1, "milliseconds"),
  delayMix: define(23, 0, 0, 1, 0.01, "ratio"),
  delayTime: define(24, 0.25, 0.02, 1, 0.005, "seconds"),
  delayFeedback: define(25, 0.35, 0, 0.92, 0.01, "ratio"),
  delayTone: define(26, 3200, 400, 16000, 100, "Hz"),
  reverbMix: define(27, 0, 0, 1, 0.01, "ratio"),
  reverbSize: define(28, 0.6, 0, 1, 0.01, "ratio"),
  reverbDamp: define(29, 4200, 800, 14000, 100, "Hz"),
  reverbPredelay: define(30, 18, 0, 100, 1, "milliseconds"),
  stereoWidth: define(38, 0.7, 0, 1, 0.01, "ratio"),
  syncRatio: define(39, 1, 1, 8, 0.05, "ratio"),
  pitchEnvAmount: define(40, 0, -36, 36, 1, "semitones"),
  pitchEnvDecay: define(41, 0.08, 0.005, 1, 0.005, "seconds"),
  lfo2Rate: define(42, 3, 0.05, 16, 0.05, "Hz"),
  lfo2ToCutoff: define(43, 0, 0, 4000, 25, "Hz"),
  lfo2ToPitch: define(44, 0, 0, 12, 0.1, "semitones"),
  noiseColor: define(45, 0, 0, 1, 0.01, "ratio (white to pink)"),
  oscLevel: define(46, 1, 0, 1, 0.01, "linear gain"),
  gain: define(19, 0.32, 0, 0.85, 0.01, "linear gain", undefined, 0.8),
});

/** Numeric ids sent across the AudioWorklet boundary. */
export const PARAM = Object.freeze(Object.fromEntries(
  Object.entries(PARAMETERS).map(([name, definition]) => [name, definition.id]),
));

/** Complete preset-reset state. Exported as `DEFAULTS` from the presets entry point. */
export const PARAM_DEFAULTS = Object.freeze(Object.fromEntries(
  Object.entries(PARAMETERS).map(([name, definition]) => [name, definition.default]),
));
