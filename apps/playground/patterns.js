// Demo music for the showcase. Lives in the DEMO APP, never in the library
// (harness_audit.py C11 enforces that), and is NOT in the npm tarball — `files` ships
// dist/ and the licences only.
//
// WHY THESE ARE GENRE IDIOMS RATHER THAN NAMED SONGS
//
// Owner, 2026-07-29: "we can have fun like having, you know, um smoke on the water using
// this tone. Instead, I don't know, something from Jamiroquai, like some popular techno
// music... that would be way more interesting."
//
// The goal is right: a patch demoed on a scale teaches nothing, and nobody chooses a
// synth because they heard a chromatic run. What sells a bass patch is hearing a
// BASSLINE. So each riff below is written to be idiomatic for the patch — a funk octave
// line, an acid 16th figure, a rock riff in fifths, a trance arpeggio, house stabs —
// without transcribing a specific copyrighted composition. A short melodic figure is
// precisely the part of a song that copyright protects, and this repo is heading to npm.
//
// The sibling project made the opposite call for its demo page under explicit owner
// direction, and that option stays open here: swapping in a named riff is a one-line
// change to the data below. It is the owner's decision, not one to make quietly.
//
// Keys: A minor for the electronic material, E minor for the rock figure.

const P = (steps, gate) => ({ steps, gate });
const _ = null;

export const PATTERNS = {
  // --- BASS ------------------------------------------------------------------------
  /** Disco/funk octaves: root on the beat, octave off it, walking tail. */
  "funk-octaves": P([
    {n:33,a:1},_,{n:45},_,{n:33},{n:45},{n:40},_,
    {n:33,a:1},_,{n:45},_,{n:43},{n:40},{n:38},{n:45}], 0.5),

  /** Acid: relentless 16ths with accents and octave jumps. The glide does the rest. */
  "acid-line": P([
    {n:33,a:1},{n:33},{n:45,a:1},{n:33},{n:36},{n:33},{n:33,a:1},{n:40},
    {n:33,a:1},{n:33},{n:48},{n:33},{n:36,a:1},{n:33},{n:44},{n:43}], 0.85),

  /** Dub: almost nothing, very low, all space. */
  "dub-slow": P([
    {n:33,a:1},_,_,_,_,_,{n:36},_,
    {n:38,a:1},_,_,_,_,_,_,_], 3.2),

  /** Wobble: hold it and let the LFO do the work. */
  "wobble": P([
    {n:33,a:1},_,_,_,_,_,_,_,
    {n:36,a:1},_,_,_,{n:33},_,_,_], 3.6),

  /** Drum & bass: rolling, syncopated, rarely on the obvious beat. */
  "rolling-dnb": P([
    {n:33,a:1},_,_,{n:33},_,{n:40},_,{n:33},
    _,{n:45,a:1},_,{n:43},_,{n:40},{n:38},_], 0.75),

  /** Slap-ish funk: short, percussive, higher in the register. */
  "slap-funk": P([
    {n:33,a:1},{n:33},_,{n:45},_,{n:40},{n:45,a:1},_,
    {n:33},_,{n:43},{n:45},_,{n:40},_,{n:38}], 0.35),

  // --- LEAD ------------------------------------------------------------------------
  /** Trance: 16th arpeggio up an Am triad, resolving down. */
  "trance-lead": P([
    {n:69,a:1},{n:72},{n:76},{n:72},{n:69},{n:72},{n:76},{n:81,a:1},
    {n:79},{n:76},{n:72},{n:76},{n:74,a:1},{n:71},{n:67},{n:71}], 0.6),

  /** Big anthem chords: Am – F – C – G, one per beat. */
  "anthem": P([
    {n:[57,60,64,69],a:1},_,_,_,{n:[53,57,60,65]},_,_,_,
    {n:[48,52,55,60],a:1},_,_,_,{n:[55,59,62,67]},_,_,_], 1.9),

  /** Rock riff in fifths, E minor. Low, blunt, on the beat. */
  "power-fifths": P([
    {n:40,a:1},_,{n:40},_,{n:43,a:1},_,{n:45},_,
    {n:40,a:1},_,{n:40},_,{n:47},{n:45},{n:43},_], 0.85),

  /** Eighth-note synthpop: singable, steady, slightly wistful. */
  "synthpop": P([
    {n:69,a:1},_,{n:72},_,{n:71},_,{n:67},_,
    {n:69,a:1},_,{n:76},_,{n:74},_,{n:72},_], 0.9),

  /** Chiptune: fast, staccato, jumps an octave for the hook. */
  "chip-melody": P([
    {n:72,a:1},{n:76},{n:79},{n:84},{n:79},{n:76},{n:72},{n:76},
    {n:74,a:1},{n:77},{n:81},{n:86},{n:81},{n:77},{n:74},{n:72}], 0.35),

  /** Slow ballad melody. Wants to be held and breathed through. */
  "ballad": P([
    {n:69,a:1},_,_,_,{n:72},_,_,_,
    {n:71,a:1},_,_,_,{n:67},_,_,_], 1.8),

  // --- PAD -------------------------------------------------------------------------
  /** Four slow chords: Am – F – C – G. The bed everything sits on. */
  "pad-progression": P([
    {n:[57,60,64,67],a:1},_,_,_,{n:[53,57,60,65]},_,_,_,
    {n:[55,60,64,67],a:1},_,_,_,{n:[50,55,59,62]},_,_,_], 2.1),

  /** Two chords, barely moving. For patches that are more space than note. */
  "ambient-drift": P([
    {n:[45,57,64,72],a:1},_,_,_,_,_,_,_,
    {n:[43,55,62,70]},_,_,_,_,_,_,_], 7.5),

  // --- KEYS & STABS ----------------------------------------------------------------
  /** House: chords on the offbeat, never on the downbeat. */
  "house-stabs": P([
    _,_,{n:[57,60,64],a:1},_,_,_,{n:[57,60,64]},_,
    _,_,{n:[53,57,60],a:1},_,_,_,{n:[55,59,62]},_], 0.45),

  /** Clav funk: single notes, syncopated 16ths, tight and dry. */
  "funk-clav": P([
    {n:57,a:1},_,{n:57},{n:60},_,{n:57},_,{n:64},
    {n:57,a:1},_,{n:63},_,{n:60},{n:57},_,{n:55}], 0.3),

  /** Classic up-arpeggio over Am – F: the sound of a sequencer being switched on. */
  "arp-classic": P([
    {n:57,a:1},{n:60},{n:64},{n:69},{n:64},{n:60},{n:64},{n:72},
    {n:53,a:1},{n:57},{n:60},{n:65},{n:60},{n:57},{n:60},{n:69}], 0.4),

  /** Brass hits: short, hard, answered. */
  "brass-hits": P([
    {n:[52,59,64],a:1},_,_,{n:[52,59,64]},_,_,{n:[50,57,62],a:1},_,
    _,{n:[52,59,64]},_,_,{n:[55,62,67],a:1},_,_,_], 0.5),
};

/** Which riff suits which patch. */
export const PATTERN_FOR = {
  "analog-bass":"funk-octaves", "acid":"acid-line", "sub-bass":"dub-slow",
  "growl-bass":"wobble", "pluck-bass":"slap-funk", "wide-bass":"rolling-dnb",

  "square-lead":"chip-melody", "saw-lead":"trance-lead", "supersaw":"anthem",
  "fifths-lead":"power-fifths", "sync-lead":"trance-lead", "soft-lead":"ballad", "buzz-lead":"power-fifths",
  "pwm-lead":"synthpop", "whistle-lead":"ballad", "sci-fi":"chip-melody",

  "warm-pad":"pad-progression", "string-pad":"pad-progression",
  "choir-pad":"pad-progression", "sweep-pad":"pad-progression",
  "glass-pad":"ambient-drift", "dark-pad":"ambient-drift",
  "halo-pad":"ambient-drift", "notch-pad":"pad-progression",
  "atmosphere":"ambient-drift", "wind":"ambient-drift", "breath-pad":"pad-progression", "rain":"ambient-drift",

  "pluck":"arp-classic", "bell-pluck":"arp-classic", "e-piano":"house-stabs",
  "clav":"funk-clav", "mallet":"arp-classic", "stab-key":"house-stabs",
  "crystal":"arp-classic",

  "brass-stab":"brass-hits", "brass-section":"brass-hits",
  "hoover":"house-stabs", "horn-swell":"ballad",
};

/** Group fallback, so a new patch always has something to play. */
const GROUP_DEFAULT = {
  bass:"funk-octaves", lead:"trance-lead", pad:"pad-progression",
  pluck:"arp-classic", brass:"brass-hits",
};

export function patternFor(key, group) {
  return PATTERNS[PATTERN_FOR[key]] ?? PATTERNS[GROUP_DEFAULT[group]] ?? PATTERNS["arp-classic"];
}
