// Patch bank. PRINCIPLES #1: curation is the product -- these values are the work.
//
// Each patch commits to one direction rather than hedging. `acid` is the aggressive
// end, not a usable-everywhere compromise; see patches/acid-bass/intent.md, which was
// written before any of these numbers existed.

export const PRESETS = {
  "analog-bass": {
    label: "Analog bass", blurb: "Round, punchy, sits under everything.",
    params: { shape: 0, detuneCents: 6, subLevel: 0.6, noiseLevel: 0, pulseWidth: 0.5,
      cutoffHz: 420, resonance: 0.28, drive: 1.6, envAmount: 2200, keyTrack: 0.25,
      ampAttack: 0.004, ampDecay: 0.30, ampSustain: 0.60, ampRelease: 0.14,
      fltAttack: 0.001, fltDecay: 0.22, fltSustain: 0.12, fltRelease: 0.15,
      velToCutoff: 1800, gain: 0.38, chorusMix: 0 ,
      reverbMix: 0.05, reverbSize: 0.35, delayMix: 0 },
  },
  "acid": {
    label: "Acid", blurb: "Squelch. The filter is the instrument.",
    params: { shape: 0, detuneCents: 0, subLevel: 0.18, noiseLevel: 0, pulseWidth: 0.5,
      cutoffHz: 170, resonance: 0.88, drive: 2.6, envAmount: 3400, keyTrack: 0.15,
      ampAttack: 0.002, ampDecay: 0.5, ampSustain: 0.85, ampRelease: 0.07,
      fltAttack: 0.001, fltDecay: 0.17, fltSustain: 0.0, fltRelease: 0.10,
      velToCutoff: 2600, gain: 0.34, chorusMix: 0 ,
      reverbMix: 0.10, reverbSize: 0.4, delayMix: 0.18, delayTime: 0.187, delayFeedback: 0.32 },
  },
  "poly-pad": {
    label: "Poly pad", blurb: "Slow and wide, ensemble into a long hall.",
    params: { shape: 0, detuneCents: 19, subLevel: 0.28, noiseLevel: 0.03, pulseWidth: 0.5,
      cutoffHz: 620, resonance: 0.18, drive: 1.1, envAmount: 1500, keyTrack: 0.45,
      ampAttack: 0.55, ampDecay: 1.2, ampSustain: 0.80, ampRelease: 1.30,
      fltAttack: 0.70, fltDecay: 1.4, fltSustain: 0.55, fltRelease: 1.20,
      velToCutoff: 900, gain: 0.30,
      chorusRate: 0.42, chorusDepth: 4.2, chorusMix: 0.85 ,
      reverbMix: 0.55, reverbSize: 0.85, reverbPredelay: 30, delayMix: 0 },
  },
  "lead": {
    label: "Lead", blurb: "Hollow pulse, cuts through without volume.",
    params: { shape: 1, detuneCents: 11, subLevel: 0.20, noiseLevel: 0, pulseWidth: 0.32,
      cutoffHz: 1500, resonance: 0.42, drive: 1.5, envAmount: 2400, keyTrack: 0.5,
      ampAttack: 0.015, ampDecay: 0.35, ampSustain: 0.82, ampRelease: 0.22,
      fltAttack: 0.005, fltDecay: 0.30, fltSustain: 0.45, fltRelease: 0.22,
      velToCutoff: 2000, gain: 0.30, chorusRate: 0.9, chorusDepth: 2.0, chorusMix: 0.30 ,
      reverbMix: 0.30, reverbSize: 0.6, delayMix: 0.28, delayTime: 0.25, delayFeedback: 0.38 },
  },
  "brass-stab": {
    label: "Brass stab", blurb: "Filter env does the work. Hit it hard.",
    params: { shape: 0, detuneCents: 13, subLevel: 0.22, noiseLevel: 0, pulseWidth: 0.5,
      cutoffHz: 480, resonance: 0.48, drive: 1.8, envAmount: 4200, keyTrack: 0.35,
      ampAttack: 0.012, ampDecay: 0.22, ampSustain: 0.68, ampRelease: 0.26,
      fltAttack: 0.018, fltDecay: 0.26, fltSustain: 0.22, fltRelease: 0.24,
      velToCutoff: 2800, gain: 0.30, chorusRate: 0.7, chorusDepth: 2.4, chorusMix: 0.35 ,
      reverbMix: 0.28, reverbSize: 0.55, delayMix: 0 },
  },
  "pluck": {
    label: "Pluck", blurb: "Short, bright, no sustain. The default that just works.",
    params: { shape: 0, detuneCents: 5, subLevel: 0.30, noiseLevel: 0, pulseWidth: 0.5,
      cutoffHz: 900, resonance: 0.55, drive: 1.3, envAmount: 3600, keyTrack: 0.45,
      ampAttack: 0.002, ampDecay: 0.26, ampSustain: 0.0, ampRelease: 0.12,
      fltAttack: 0.001, fltDecay: 0.13, fltSustain: 0.0, fltRelease: 0.10,
      velToCutoff: 2200, gain: 0.34, chorusMix: 0 ,
      reverbMix: 0.22, reverbSize: 0.5, delayMix: 0.22, delayTime: 0.125, delayFeedback: 0.28 },
  },
};

export function applyPreset(engine, name) {
  const p = PRESETS[name];
  if (!p) throw new Error(`unknown preset: ${name}`);
  for (const [k, v] of Object.entries(p.params)) engine.setParam(k, v);
  return p;
}
