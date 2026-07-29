// Demo patterns for the showcase. These live in the DEMO APP, not in the library.
//
// PRINCIPLES: "not a DAW, sequencer, arpeggiator, or groovebox." The library's job is
// to play a note when you tell it to; deciding WHICH notes to play is an application
// concern. Presets stay in packages/ because curation is the product — a patch is the
// instrument. A sixteen-step bassline is not.
//
// This file was moved out of packages/core/src/presets.js after the boundary was made
// explicit; scripts/audit/harness_audit.py now enforces it.

/** 16-step patterns. `null` is a rest; `a` marks an accent (higher velocity). */
export const PATTERNS = {
  "analog-bass": { steps: [
    {n:36,a:1},null,{n:36},null,{n:43},null,{n:36},null,
    {n:41,a:1},null,{n:36},null,{n:39},null,{n:36},{n:48}], gate: 0.55 },
  "acid": { steps: [
    {n:36,a:1},{n:36},{n:48,a:1},{n:36},{n:39},{n:36},{n:36,a:1},{n:43},
    {n:36,a:1},{n:36},{n:51},{n:36},{n:39,a:1},{n:36},{n:46},{n:36}], gate: 0.85 },
  "poly-pad": { steps: [
    {n:[48,55,63]},null,null,null,null,null,null,null,
    {n:[46,53,60]},null,null,null,null,null,null,null], gate: 7.5 },
  "lead": { steps: [
    {n:72,a:1},null,{n:75},null,{n:79},{n:77},{n:75},null,
    {n:72,a:1},null,{n:70},null,{n:67},null,{n:70},{n:72}], gate: 0.7 },
  "brass-stab": { steps: [
    {n:[52,59,64],a:1},null,null,{n:[52,59,64]},null,null,{n:[50,57,62],a:1},null,
    null,{n:[52,59,64]},null,null,{n:[55,62,67],a:1},null,null,null], gate: 0.5 },
  "pluck": { steps: [
    {n:60,a:1},{n:67},{n:64},{n:72},{n:60},{n:67},{n:64},{n:76},
    {n:59,a:1},{n:65},{n:62},{n:71},{n:59},{n:65},{n:62},{n:67}], gate: 0.4 },
};

