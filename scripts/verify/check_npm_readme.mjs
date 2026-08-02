// Validate the README as npm will render it, including the stale release language that
// is easiest to forget after publication. This check never asks the registry whether a
// version is published: a manifest version and a registry upload are separate facts.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REQUIRED_HEADINGS = [
  "Install", "Demo", "What is included", "Compatibility and lifecycle", "API",
  "Parameters", "Known limits", "License",
];

const FINAL_STALE = [
  /\bpre-alpha\b/i,
  /\bnot\s+(?:yet\s+)?published\b/i,
  /\bunpublished\b/i,
  /\bpre-release manifest version\b/i,
  /\bintended registry path after\b/i,
  /\bregistry publication is a separate\b/i,
];

const PROJECT_LINKS = "[npm package](https://www.npmjs.com/package/subtractive-synthesizers.js) | [Patch showcase](https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/showcase.html) | [Playground](https://keunwoochoi.github.io/subtractive-synthesizers.js/apps/playground/index.html) | [Changelog](https://github.com/keunwoochoi/subtractive-synthesizers.js/blob/main/CHANGELOG.md)";

export function auditNpmReadme({ version, readme }) {
  const failures = [];
  const finalVersion = /^\d+\.\d+\.\d+$/.test(version);
  const fail = (message) => failures.push(message);

  if (!readme.includes("npm install subtractive-synthesizers.js")) fail("missing the exact npm install command");
  if (!readme.includes("https://www.npmjs.com/package/subtractive-synthesizers.js")) fail("missing the npm package-page link");
  if (!readme.includes(PROJECT_LINKS)) fail("project links are not the compact npm/showcase/playground/changelog line");
  if (/<!-- generated:package-status -->|> \*\*Release status:\*\*/i.test(readme)) fail("obsolete release-status paragraph is present");
  for (const heading of REQUIRED_HEADINGS) {
    if (!readme.includes(`## ${heading}\n`)) fail(`missing required '${heading}' section`);
  }
  for (const marker of ["product-summary", "quickstart", "api", "parameters", "roster"]) {
    if (!readme.includes(`<!-- generated:${marker} -->`) || !readme.includes(`<!-- /generated:${marker} -->`)) {
      fail(`missing generated:${marker} block`);
    }
  }

  if (finalVersion) {
    for (const stale of FINAL_STALE) {
      if (stale.test(readme)) fail(`final version contains stale release language matching ${stale}`);
    }
  }

  const references = [
    ...readme.matchAll(/\[[^\]]*\]\(([^)]+)\)/g),
    ...readme.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g),
  ].map((match) => match[1].split("#", 1)[0]);
  const shippedLocalFiles = new Set(["LICENSE-MIT", "LICENSE-APACHE"]);
  for (const reference of references) {
    if (!reference || reference.startsWith("#")) continue;
    if (/^https:\/\//.test(reference)) continue;
    if (/^[a-z][a-z+.-]*:/i.test(reference)) {
      fail(`non-HTTPS package-page reference: ${reference}`);
    } else if (!shippedLocalFiles.has(reference)) {
      fail(`relative package-page reference is not shipped: ${reference}`);
    }
  }
  return failures;
}

export function checkRoot(root) {
  const packageJson = JSON.parse(readFileSync(join(root, "packages/core/package.json"), "utf8"));
  const readme = readFileSync(join(root, "README.md"), "utf8");
  const failures = auditNpmReadme({ version: packageJson.version, readme });
  const logoPath = "assets/logo/logo-256.png";
  const logoUrl = `https://raw.githubusercontent.com/keunwoochoi/subtractive-synthesizers.js/main/${logoPath}`;
  if (!readme.includes(`src="${logoUrl}"`)) failures.push("npm logo is not the canonical absolute repository asset URL");
  if (!existsSync(join(root, logoPath))) failures.push(`canonical npm logo source is missing: ${logoPath}`);
  return failures;
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invoked) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const failures = checkRoot(root);
  if (failures.length) {
    console.error(`NPM README FAIL — ${failures.length} problem(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }
  console.log("npm README OK — install, compatibility, parameters, limits, and package-page links are release-accurate");
}
