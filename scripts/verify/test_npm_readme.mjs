import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditNpmReadme } from "./check_npm_readme.mjs";

const real = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../../packages/core/package.json", import.meta.url), "utf8"));
const withStatus = (body) => real.replace(
  /<!-- generated:package-status -->\n[\s\S]*?<!-- \/generated:package-status -->/,
  `<!-- generated:package-status -->\n${body}\n<!-- /generated:package-status -->`,
);

test("the current generated npm README satisfies the consumer contract", () => {
  assert.deepEqual(auditNpmReadme({ version: manifest.version, readme: real }), []);
});

test("a final manifest fails closed on pre-release status language", () => {
  const readme = withStatus("> **Release status:** This checkout carries pre-release manifest version `9.8.7`. The install command below is the intended registry path after a later publish.");
  const failures = auditNpmReadme({ version: "9.8.7", readme });
  assert.ok(failures.some((failure) => failure.includes("stale release language")), failures.join("\n"));
});

test("a final manifest passes after the generated status becomes release-neutral", () => {
  const readme = withStatus("> **Release status:** This checkout carries final manifest version `9.8.7`. Registry publication is a separate human-authorized operation; confirm the available version on the [npm package page](https://www.npmjs.com/package/subtractive-synthesizers.js).");
  assert.deepEqual(auditNpmReadme({ version: "9.8.7", readme }), []);
});

test("a package-relative asset that is absent from the tarball fails", () => {
  const broken = real.replace(
    "https://raw.githubusercontent.com/keunwoochoi/subtractive-synthesizers.js/main/assets/logo/logo-256.png",
    "assets/logo/logo-256.png",
  );
  const failures = auditNpmReadme({ version: manifest.version, readme: broken });
  assert.ok(failures.some((failure) => failure.includes("not shipped")), failures.join("\n"));
});
