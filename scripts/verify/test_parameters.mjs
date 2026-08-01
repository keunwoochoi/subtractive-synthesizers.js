import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FILTER, PARAM, PARAMETERS, PARAM_DEFAULTS, SHAPE } from "../../packages/core/src/parameters.js";
import { DEFAULTS, PRESETS } from "../../packages/core/src/presets.js";

test("metadata owns a complete contiguous worklet ABI", () => {
  const entries = Object.entries(PARAMETERS);
  assert.equal(entries.length, 47);
  assert.deepEqual(entries.map(([, definition]) => definition.id).sort((a, b) => a - b),
                   Array.from({ length: entries.length }, (_, id) => id));
  assert.deepEqual(PARAM, Object.fromEntries(entries.map(([name, definition]) => [name, definition.id])));
  assert.deepEqual(PARAM_DEFAULTS,
                   Object.fromEntries(entries.map(([name, definition]) => [name, definition.default])));
  assert.deepEqual(DEFAULTS, PARAM_DEFAULTS);

  for (const [name, definition] of entries) {
    assert.ok(Number.isFinite(definition.default), `${name} has a finite default`);
    assert.ok(Number.isFinite(definition.min), `${name} has a finite minimum`);
    assert.ok(Number.isFinite(definition.max), `${name} has a finite maximum`);
    assert.ok(Number.isFinite(definition.step) && definition.step > 0, `${name} has a positive step`);
    assert.ok(definition.min <= definition.default && definition.default <= definition.max,
              `${name} default is inside its supported range`);
    assert.ok(definition.unit.length > 0, `${name} names its unit`);
    if (definition.editorMax !== undefined) {
      assert.ok(definition.default <= definition.editorMax && definition.editorMax <= definition.max,
                `${name} editor ceiling is between its default and supported maximum`);
    }
    if (definition.values) {
      const values = Object.values(definition.values);
      assert.ok(values.includes(definition.default),
                `${name} default is a declared enum value`);
      assert.deepEqual(values, Array.from({ length: Object.keys(definition.values).length }, (_, value) => value));
      assert.equal(definition.min, Math.min(...values));
      assert.equal(definition.max, Math.max(...values));
    }
  }
  assert.equal(PARAMETERS.shape.values, SHAPE);
  assert.equal(PARAMETERS.filterKind.values, FILTER);
  assert.ok(Object.isFrozen(PARAMETERS));
  assert.ok(entries.every(([, definition]) => Object.isFrozen(definition)));
});

test("every preset field is named and inside the documented range", () => {
  for (const [presetName, preset] of Object.entries(PRESETS)) {
    for (const [name, value] of Object.entries(preset.params)) {
      const definition = PARAMETERS[name];
      assert.ok(definition, `${presetName}.${name} is a public parameter`);
      assert.ok(value >= definition.min && value <= definition.max,
                `${presetName}.${name}=${value} is inside ${definition.min}..${definition.max}`);
      if (definition.values) {
        assert.ok(Object.values(definition.values).includes(value),
                  `${presetName}.${name}=${value} is a declared enum value`);
      }
    }
  }
});

test("the playground derives every engine control from exported metadata", () => {
  const html = readFileSync(new URL("../../apps/playground/index.html", import.meta.url), "utf8");
  const tags = [...html.matchAll(/<(?:input|select)\b[^>]*\bdata-param\b[^>]*>/g)].map((match) => match[0]);
  const ids = tags.map((tag) => tag.match(/\bid="([^"]+)"/)?.[1]);
  assert.deepEqual(new Set(ids), new Set(Object.keys(PARAMETERS)));
  assert.equal(ids.length, Object.keys(PARAMETERS).length, "one control per parameter");
  for (const tag of tags) {
    assert.doesNotMatch(tag, /\b(?:min|max|step|value)="/,
                        `control metadata must not be duplicated in ${tag}`);
  }
  assert.match(html, /const definition = PARAMETERS\[el\.id\]/);
});

test("the Rust worklet ABI accepts every metadata id", () => {
  const rust = readFileSync(new URL("../../crates/dsp/src/lib.rs", import.meta.url), "utf8");
  const body = rust.split("pub unsafe extern \"C\" fn set_param", 2)[1]
                   .split("pub unsafe extern \"C\" fn render_osc", 1)[0];
  const ids = [...body.matchAll(/^\s*(\d+)\s*=>/gm)].map((match) => Number(match[1]));
  assert.deepEqual(ids, Object.values(PARAM).sort((a, b) => a - b));
});
