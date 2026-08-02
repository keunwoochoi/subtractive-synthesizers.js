// Validate the README as npm will render it, including the version transition that is
// otherwise easiest to forget. This check never asks the registry whether a version is
// published: a manifest version and a registry upload are separate facts.
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

export function auditNpmReadme({ version, readme }) {
  const failures = [];
  const finalVersion = /^\d+\.\d+\.\d+$/.test(version);
  const fail = (message) => failures.push(message);
  const status = readme.match(/<!-- generated:package-status -->\n([\s\S]*?)<!-- \/generated:package-status -->/)?.[1] ?? "";

  if (!readme.includes("npm install subtractive-synthesizers.js")) fail("missing the exact npm install command");
  if (!status.includes(`\`${version}\``)) fail(`release-status block does not name manifest version ${version}`);
  for (const heading of REQUIRED_HEADINGS) {
    if (!readme.includes(`## ${heading}\n`)) fail(`missing required '${heading}' section`);
  }
  for (const marker of ["product-summary", "package-status", "quickstart", "api", "parameters", "roster"]) {
    if (!readme.includes(`<!-- generated:${marker} -->`) || !readme.includes(`<!-- /generated:${marker} -->`)) {
      fail(`missing generated:${marker} block`);
    }
  }

  if (finalVersion) {
    if (!/\bpublished on npm\b/i.test(status)) fail("final version does not say that the package is published on npm");
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
  console.log("npm README OK — install, compatibility, parameters, limits, version status, and package-page links are release-accurate");
}
