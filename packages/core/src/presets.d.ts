export interface Preset {
  label: string;
  /** Which demo pattern suits this patch: bass | lead | pad | pluck | brass. */
  group: string;
  blurb: string;
  params: Record<string, number>;
}
/** Every parameter, at a neutral value. Patches are merged over this. */
export declare const DEFAULTS: Record<string, number>;
export declare const PRESETS: Record<string, Preset>;
export declare const GROUPS: readonly string[];
/** Apply a preset by name. Sends every parameter, so nothing carries over. */
export declare function applyPreset(engine: unknown, name: string): Preset;
