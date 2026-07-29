// Demo patterns for the showcase. These live in the DEMO APP, not in the library.
//
// PRINCIPLES: "not a DAW, sequencer, arpeggiator, or groovebox." The library plays a
// note when told to; deciding WHICH notes is an application concern, and
// scripts/audit/harness_audit.py enforces that this file cannot drift into packages/.
//
// Keyed by GROUP, not by patch. Thirty-six bespoke sequences would be thirty-six chances
// to write a bad one, and a bass patch does not need its own bassline to be judged --
// it needs A bassline. What must differ per patch is the SOUND.

export const PATTERNS = {
  bass: { steps: [
    {n:36,a:1},null,{n:36},null,{n:43},null,{n:36},null,
    {n:41,a:1},null,{n:36},null,{n:39},null,{n:36},{n:48}], gate: 0.55 },

  lead: { steps: [
    {n:72,a:1},null,{n:75},null,{n:79},{n:77},{n:75},null,
    {n:72,a:1},null,{n:70},null,{n:67},null,{n:70},{n:72}], gate: 0.7 },

  pad: { steps: [
    {n:[48,55,63,67]},null,null,null,null,null,null,null,
    {n:[46,53,60,65]},null,null,null,null,null,null,null], gate: 7.5 },

  pluck: { steps: [
    {n:60,a:1},{n:67},{n:64},{n:72},{n:60},{n:67},{n:64},{n:76},
    {n:59,a:1},{n:65},{n:62},{n:71},{n:59},{n:65},{n:62},{n:67}], gate: 0.4 },

  brass: { steps: [
    {n:[52,59,64],a:1},null,null,{n:[52,59,64]},null,null,{n:[50,57,62],a:1},null,
    null,{n:[52,59,64]},null,null,{n:[55,62,67],a:1},null,null,null], gate: 0.5 },
};
