import type { Engine, ParamName } from "./index.js";

export type PresetGroup = "bass" | "lead" | "pad" | "pluck" | "brass";

export interface Preset {
  label: string;
  /** Which demo pattern suits this patch. */
  group: PresetGroup;
  blurb: string;
  params: Partial<Record<ParamName, number>>;
}
/** Every parameter, at a neutral value. Patches are merged over this. */
export declare const DEFAULTS: Readonly<Record<ParamName, number>>;
export declare const PRESETS: Record<string, Preset>;
export declare const GROUPS: readonly PresetGroup[];
/** Apply a preset by name. Sends every parameter, so nothing carries over. */
export declare function applyPreset(engine: Engine, name: string): Preset;
