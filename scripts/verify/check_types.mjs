// Pack and install the package, then compile a strict TypeScript consumer against the
// installed declarations. Source-tree imports cannot catch missing files or export-map
// mistakes, which are the failures this release gate exists to expose.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const core = join(root, "packages/core");
const work = mkdtempSync(join(tmpdir(), "subsynth-types-"));
let tarball;

const run = (command, args, options = {}) => execFileSync(command, args, {
  timeout: 180_000,
  ...options,
});

try {
  run("npm", ["run", "build"], { cwd: core, stdio: "ignore" });
  const name = run("npm", ["pack", "--silent"], { cwd: core, encoding: "utf8" }).trim();
  tarball = join(core, name);
  writeFileSync(join(work, "package.json"), JSON.stringify({ name: "strict-consumer", private: true, type: "module" }));
  run("npm", ["install", "--no-audit", "--no-fund", "--silent", tarball], { cwd: work, stdio: "ignore" });
  writeFileSync(join(work, "tsconfig.json"), JSON.stringify({
    compilerOptions: {
      strict: true,
      noEmit: true,
      target: "ES2022",
      module: "NodeNext",
      moduleResolution: "NodeNext",
      lib: ["ES2022", "DOM"],
      skipLibCheck: false,
    },
    include: ["consumer.ts"],
  }));
  writeFileSync(join(work, "consumer.ts"), `
import { FILTER, PARAM, PARAMETERS, SHAPE, createEngine, type Engine, type ParamName } from "subtractive-synthesizers.js";
import { DEFAULTS, PRESETS, applyPreset, type Preset } from "subtractive-synthesizers.js/presets";

const name: ParamName = "cutoffHz";
const id: number = PARAM[name];
const cutoffDefault: number = PARAMETERS.cutoffHz.default;
const cutoffUnit: "Hz" = PARAMETERS.cutoffHz.unit;
const shape: 0 = SHAPE.saw;
const filter: 5 = FILTER.svfNotch;
const preset: Preset = PRESETS.supersaw;
const defaults: Readonly<Record<ParamName, number>> = DEFAULTS;

async function play(): Promise<Engine> {
  const engine = await createEngine({ connect: false });
  engine.setParam(name, cutoffDefault);
  applyPreset(engine, "supersaw");
  engine.output.connect(engine.context.destination);
  return engine;
}

// @ts-expect-error unknown parameter names must not widen to string
PARAM.notAParameter;
// @ts-expect-error preset fields must use public parameter names
const invalid: Preset = { label: "x", group: "lead", blurb: "x", params: { nope: 1 } };
void [id, cutoffUnit, shape, filter, preset, defaults, play, invalid];
`);

  const tsc = join(root, "node_modules/typescript/bin/tsc");
  run(process.execPath, [tsc, "--project", join(work, "tsconfig.json")], { cwd: work, stdio: "inherit" });

  const installed = JSON.parse(readFileSync(join(work, "node_modules/subtractive-synthesizers.js/package.json"), "utf8"));
  console.log(`TYPE CONSUMER OK — strict TypeScript compiled against installed ${installed.name}@${installed.version}`);
} finally {
  if (tarball) rmSync(tarball, { force: true });
  rmSync(work, { recursive: true, force: true });
}
