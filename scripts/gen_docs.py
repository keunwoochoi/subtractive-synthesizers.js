#!/usr/bin/env python3
"""Generate every number that appears in a document, from the thing that produces it.

The sibling project's README claimed 13 instruments and ~31 KB when the measured reality
was 29 and 85.4 KB, and its technical report was started at the end with a headline
figure that was already stale on arrival. Both failures have the same cause: a human
typed a number into prose, and prose does not recompute.

So no number is typed here. Blocks delimited by

    <!-- generated:NAME -->
    ...
    <!-- /generated:NAME -->

are rewritten from live measurement. `--check` regenerates into memory and diffs; a
difference is a test failure, not a suggestion (the readme-sync pattern).

    python3 scripts/gen_docs.py            # rewrite in place
    python3 scripts/gen_docs.py --check    # fail if any block is stale
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts" / "verify"))

BLOCK = re.compile(
    r"(<!-- generated:(?P<name>[a-z0-9-]+) -->\n?)(?P<body>.*?)(<!-- /generated:(?P=name) -->)",
    re.S,
)


# --- generators: each returns the markdown body for its block --------------------

def _node_json(source: str):
    """Run a small ESM projection when JavaScript owns the fact being documented."""
    out = subprocess.run(["node", "--input-type=module", "-e", source],
                         capture_output=True, text=True, cwd=ROOT, check=True)
    return json.loads(out.stdout)


def gen_product_summary() -> str:
    data = _node_json(
        "import {PRESETS} from './packages/core/src/presets.js';"
        "import {PARAMETERS} from './packages/core/src/parameters.js';"
        "console.log(JSON.stringify({patches:Object.keys(PRESETS).length,params:Object.keys(PARAMETERS).length}))"
    )
    return (f"A browser subtractive synthesizer with {data['patches']} curated patches and "
            f"{data['params']} documented controls. Audio is synthesized at runtime in a "
            "WebAssembly AudioWorklet; the package contains no samples and needs no network "
            "access while playing.\n")


def gen_package_status() -> str:
    package = json.loads((ROOT / "packages/core/package.json").read_text(encoding="utf-8"))
    version = package["version"]
    if "-" in version:
        return (f"> **Release status:** This checkout carries pre-release manifest version "
                f"`{version}`. The install command below is the intended registry path after "
                "the owner authorizes the first publish; the live demos remain available now.\n")
    return (f"> **Release status:** This checkout carries final manifest version `{version}`. "
            "Registry publication is a separate human-authorized operation; confirm the available "
            "version on the [npm package page](https://www.npmjs.com/package/subtractive-synthesizers.js).\n")


def gen_parameters() -> str:
    definitions = _node_json(
        "import {PARAMETERS} from './packages/core/src/parameters.js';"
        "console.log(JSON.stringify(PARAMETERS))"
    )
    rows = [
        "| parameter | id | preset default | supported range | step | unit / values |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for name, definition in definitions.items():
        values = definition.get("values")
        if values:
            detail = ", ".join(f"`{key}` = {value}" for key, value in values.items())
        else:
            detail = definition["unit"]
        rows.append(
            f"| `{name}` | {definition['id']} | {definition['default']} | "
            f"{definition['min']} … {definition['max']} | {definition['step']} | {detail} |"
        )
    return "\n".join(rows) + "\n"

def gen_alias_table() -> str:
    """Measured alias suppression. The number that sets the M1 gate."""
    import numpy as np
    import candidates as C
    from metrics import measure

    sr, dur = 48_000.0, 0.5
    n = int(dur * sr)
    rows = ["| f0 (Hz) | naive ramp | PolyBLEP | gain |", "|---:|---:|---:|---:|"]
    for f0 in (55, 110, 220, 440, 880, 1760, 2200):
        a = measure(np.asarray(C.naive_saw(f0, sr, n)), f0, sr)["alias_db"]
        b = measure(np.asarray(C.polyblep_saw(f0, sr, n)), f0, sr)["alias_db"]
        rows.append(f"| {f0} | {a:.1f} dB | {b:.1f} dB | {a - b:+.1f} dB |")
    return "\n".join(rows) + "\n"


def gen_verdicts() -> str:
    """What the spec harness currently accepts and rejects."""
    import verify_spec as V
    import candidates as C

    rows = ["| candidate | alias dB | harmonic err | verdict |", "|---|---:|---:|---|"]
    for name, fn in C.ALL.items():
        r = V.run(name, fn)
        h = r["hidden"]
        v = "**PASS**" if r["pass_hidden"] else "REJECT"
        if r["pass_visible"] and not r["pass_hidden"]:
            v = "REJECT (passed visible)"
        a = "—" if h["crashed"] else f"{h['alias_db']:.1f}"
        e = "—" if h["crashed"] else f"{h['harmonic_err_db']:.1f}"
        rows.append(f"| `{name}` | {a} | {e} | {v} |")
    return "\n".join(rows) + "\n"


def gen_roster() -> str:
    """The patch bank, counted from the source of truth rather than described."""
    import subprocess as sp
    js = ("import('./packages/core/src/presets.js').then(m=>{const g={};"
          "for(const p of Object.values(m.PRESETS))g[p.group]=(g[p.group]||0)+1;"
          "console.log(JSON.stringify({n:Object.keys(m.PRESETS).length,g}))})")
    out = sp.run(["node", "-e", js], capture_output=True, text=True, cwd=ROOT)
    try:
        d = __import__("json").loads(out.stdout.strip())
    except Exception:
        return "_(bank unavailable)_\n"
    rows = ["| group | patches |", "|---|---:|"]
    for k, v in sorted(d["g"].items(), key=lambda kv: -kv[1]):
        rows.append(f"| {k} | {v} |")
    rows.append(f"| **total** | **{d['n']}** |")
    return "\n".join(rows) + "\n"


def gen_intent_coverage() -> str:
    """Preset-to-intent coverage and honest provenance, from the enforced mapping."""
    from check_intents import inspect_repository

    inventory = inspect_repository(ROOT)
    if inventory.errors:
        return "_(intent mapping unavailable: run `npm run check:intents`)_\n"
    prior = sum(
        intent.status == "implemented" and intent.provenance == "prior"
        for intent in inventory.intents
    )
    retrospective = sum(
        intent.status == "implemented" and intent.provenance == "retrospective"
        for intent in inventory.intents
    )
    proposed = sum(intent.status == "proposed" for intent in inventory.intents)
    rows = [
        "| intent coverage | count |",
        "|---|---:|",
        f"| exported presets | {len(inventory.preset_ids)} |",
        f"| exactly mapped implemented intents | {len(inventory.implemented)} |",
        f"| written before implementation | {prior} |",
        f"| reconstructed after implementation | {retrospective} |",
        f"| proposed before implementation | {proposed} |",
    ]
    return "\n".join(rows) + "\n"


def _gen_roster_dirs() -> str:
    """The patch INTENT directories -- separate from the bank; an intent is a target."""
    patches = ROOT / "patches"
    rows = ["| patch | intent | implementation |", "|---|---|---|"]
    dirs = sorted(p for p in patches.iterdir() if p.is_dir()) if patches.exists() else []
    for d in dirs:
        has_intent = (d / "intent.md").exists()
        has_impl = any(f.suffix in (".rs", ".ts") for f in d.rglob("*") if f.is_file())
        rows.append(f"| `{d.name}` | {'yes' if has_intent else '**missing**'} "
                    f"| {'yes' if has_impl else 'not yet'} |")
    if not dirs:
        rows.append("| _(none yet)_ | | |")
    return "\n".join(rows) + "\n"


def _count_ok(cmd: list[str]) -> int:
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    m = re.search(r"Ran (\d+) test", out.stdout + out.stderr)
    return int(m.group(1)) if m else 0


def _count_node_tests(cmd: list[str]) -> int:
    out = subprocess.run(cmd, capture_output=True, text=True, cwd=ROOT)
    m = re.search(r"(?:ℹ|#) tests (\d+)", out.stdout + out.stderr)
    return int(m.group(1)) if m else 0


def gen_harness_stats() -> str:
    """Counts of the gates, so 'the harness is thorough' is never an unbacked claim."""
    audit = subprocess.run([sys.executable, "scripts/audit/harness_audit.py"],
                           capture_output=True, text=True, cwd=ROOT)
    m = re.search(r"(\d+) checks passed", audit.stdout)
    checks = int(m.group(1)) if m else 0
    a = _count_ok([sys.executable, "scripts/audit/test_harness_audit.py"])
    v = _count_ok([sys.executable, "scripts/verify/test_verify_spec.py"])
    public = _count_node_tests([
        "node", "--test", "scripts/verify/test_parameters.mjs",
        "scripts/verify/test_npm_readme.mjs",
    ])
    fixtures = len([p for p in (ROOT / "scripts/audit/fixtures").iterdir() if p.is_dir()])
    return ("| | |\n|---|---|\n"
            f"| harness audit assertions | {checks} |\n"
            f"| Python harness/spec tests | {a + v} |\n"
            f"| public metadata/README tests | {public} |\n"
            f"| deliberately-broken fixtures | {fixtures} |\n")


def gen_bundle() -> str:
    """Measured size of everything a browser downloads. Owned by the audit script."""
    out = subprocess.run(["scripts/audit/bundle-size-audit.sh"],
                         capture_output=True, text=True, cwd=ROOT)
    rows = ["| artifact | raw | gzipped |", "|---|---:|---:|"]
    total = pct = None
    for ln in out.stdout.splitlines():
        parts = ln.split()
        if len(parts) == 3 and parts[0].startswith("packages/"):
            rows.append(f"| `{parts[0]}` | {int(parts[1]):,} B | {int(parts[2]):,} B |")
        elif parts[:1] == ["TOTAL"]:
            total = int(parts[1])
        elif ln.startswith("budget:"):
            pct = ln.split("using")[-1].strip()
    if total is not None:
        rows.append(f"| **total** | | **{total:,} B ({total/1024:.1f} KB)** |")
    if pct:
        rows.append("")
        rows.append(f"Budget is 60 KB gzipped for the whole library — currently **{pct}**.")
    return "\n".join(rows) + "\n"


def gen_bundle_total() -> str:
    """Just the headline figure, for places that want one number inline."""
    out = subprocess.run(["scripts/audit/bundle-size-audit.sh"],
                         capture_output=True, text=True, cwd=ROOT)
    for ln in out.stdout.splitlines():
        parts = ln.split()
        if parts[:1] == ["TOTAL"]:
            return f"{int(parts[1]) / 1024:.1f} KB"
    return "unknown"


def gen_bench() -> str:
    """Audio-thread cost. Measured on whatever machine regenerates this — which is why
    the row says so rather than implying a universal figure."""
    out = subprocess.run(["node", "scripts/verify/dsp_bench.mjs"],
                         capture_output=True, text=True, cwd=ROOT)
    voices = pct = rt = None
    for ln in out.stdout.splitlines():
        if "active voices" in ln:
            voices = ln.split()[2]
        m = re.search(r"bench OK — ([\d.]+)% .*?\(([\d.]+)x real time\)", ln)
        if m:
            pct, rt = m.group(1), m.group(2)
    if pct is None:
        return "_(bench did not complete)_\n"
    return ("| | |\n|---|---|\n"
            f"| voices in the reference arrangement | {voices} (pad + bass + lead, chorus on) |\n"
            f"| audio-thread budget used | **{pct} %** of the 2.667 ms / 128-frame budget |\n"
            f"| real-time factor | {rt}x |\n")


# Blocks whose value legitimately differs by machine. They are still GENERATED — never
# typed — but --check does not diff them, because "this laptop is faster than that CI
# runner" is not a documentation defect. Everything not listed here must be identical
# everywhere, and a difference is a real failure.
VOLATILE = {"bench"}

def gen_quickstart() -> str:
    """The quickstart snippet, taken from the file that is actually EXECUTED.

    A copy-pasteable snippet nobody has run is a bug report waiting, and one that lives
    only in a README drifts the first time the API moves. examples/quickstart.js is run
    against the PACKED, INSTALLED package by scripts/verify/check_quickstart.mjs; this
    embeds that same file, cut at the harness marker so the reader sees only the part
    that is the quickstart.
    """
    src = (ROOT / "examples/quickstart.js").read_text(encoding="utf-8")
    marker = "// --8<--"
    if marker not in src:
        raise SystemExit("examples/quickstart.js lost its --8<-- marker")
    snippet = src.split(marker)[0].rstrip()
    return f"```js\n{snippet}\n```\n"


def _members(dts: str, block: str) -> list[tuple[str, str]]:
    """(signature, doc) for each member of an interface, in declaration order.

    Parsed out of index.d.ts rather than written by hand: a reference table that is
    maintained alongside the types is a reference table that disagrees with them within
    a release. This one cannot -- if a method is renamed and this block is not
    regenerated, `npm run docs:check` fails.
    """
    body = dts.split(f"interface {block} {{", 1)[1]
    depth, out, doc = 1, [], []
    for raw in body.splitlines():
        line = raw.strip()
        depth += line.count("{") - line.count("}")
        if depth <= 0:
            break
        if line.startswith("/**"):
            doc = [line.removeprefix("/**").removesuffix("*/").strip()]
        elif line.startswith("*/"):
            pass
        elif line.startswith("*"):
            doc.append(line.lstrip("* ").removesuffix("*/").strip())
        elif line and not line.startswith("//"):
            out.append((line.rstrip(";"), " ".join(d for d in doc if d).strip()))
            doc = []
    return out


def _pipe(text: str) -> str:
    """Escape `|` so a union type does not silently split a markdown table cell."""
    return text.replace("|", "\\|")


def gen_api() -> str:
    dts = (ROOT / "packages/core/src/index.d.ts").read_text(encoding="utf-8")
    rows = ["**`createEngine(options?)` → `Promise<Engine>`**", "",
            "| option | meaning |", "|---|---|"]
    for sig, doc in _members(dts, "CreateEngineOptions"):
        rows.append(f"| `{_pipe(sig)}` | {doc or '—'} |")
    rows += ["", "**`Engine`**", "", "| member | meaning |", "|---|---|"]
    for sig, doc in _members(dts, "Engine"):
        rows.append(f"| `{_pipe(sig)}` | {doc or '—'} |")

    metadata = _node_json(
        "import {PARAMETERS} from './packages/core/src/parameters.js';"
        "console.log(JSON.stringify({count:Object.keys(PARAMETERS).length}))"
    )
    rows += ["",
             f"`PARAMETERS` is the authoritative metadata for all {metadata['count']} controls; "
             "`PARAM`, `SHAPE`, `FILTER`, preset defaults, declarations, the playground, and the parameter table below derive from it."]
    return "\n".join(rows) + "\n"


GENERATORS = {
    "api": gen_api,
    "package-status": gen_package_status,
    "parameters": gen_parameters,
    "product-summary": gen_product_summary,
    "quickstart": gen_quickstart,
    "bench": gen_bench,
    "bundle": gen_bundle,
    "bundle-total": gen_bundle_total,
    "alias-table": gen_alias_table,
    "verdicts": gen_verdicts,
    "roster": gen_roster,
    "intent-coverage": gen_intent_coverage,
    "harness-stats": gen_harness_stats,
}

TARGETS = ["README.md", "agentic-docs/report/draft.md"]


def _mask(text: str) -> str:
    """Blank the body of every volatile block, so the diff only sees stable content."""
    def sub(m: re.Match) -> str:
        if m.group("name") in VOLATILE:
            return m.group(1) + m.group(4)
        return m.group(0)
    return BLOCK.sub(sub, text)


def render(path: Path) -> str:
    text = path.read_text(encoding="utf-8")

    def sub(m: re.Match) -> str:
        name = m.group("name")
        if name not in GENERATORS:
            raise SystemExit(f"{path}: unknown generated block '{name}'")
        body = GENERATORS[name]()
        # Inline blocks (inside an HTML tag) must not gain a newline.
        if m.group(1).endswith("-->\n") is False:
            body = body.strip()
        return m.group(1) + body + m.group(4)

    return BLOCK.sub(sub, text)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    stale = []
    for rel in TARGETS:
        p = ROOT / rel
        if not p.exists():
            continue
        current = p.read_text(encoding="utf-8")
        fresh = render(p)
        if args.check:
            # Compare with volatile blocks masked out on both sides.
            if _mask(current) == _mask(fresh):
                continue
        elif current == fresh:
            continue
        if args.check:
            stale.append(rel)
        else:
            p.write_text(fresh, encoding="utf-8")
            print(f"regenerated {rel}")

    if args.check and stale:
        print("DOCS CHECK FAIL — generated blocks are stale:\n")
        for s in stale:
            print(f"  {s}")
        print("\nRun: python3 scripts/gen_docs.py")
        print("Do not hand-edit inside a generated block; the edit will be overwritten.")
        return 1
    print("docs OK — every generated block matches its measurement"
          if args.check else "docs regenerated")
    return 0


if __name__ == "__main__":
    sys.exit(main())
