#!/usr/bin/env python3
"""Enforce PRINCIPLES #2: write the target down before you tune it.

An intent statement that is optional, or that may be vague, is an exhortation rather
than a mechanism. This makes it a gate:

  - every patch directory has an intent.md
  - every intent has all four required sections
  - every intent commits to ONE target, in the section that exists to prevent
    tuning to the washed-out average
  - every intent carries 3-5 measurable targets
  - every measurable target names the phrase of prose it derives from, so the chain
    from taste to number stays auditable and nobody can invent a target the
    description never implied
  - an implementation with no intent is a hard failure; an intent with no
    implementation is the normal early state

    python3 scripts/verify/check_intents.py [--root DIR]
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REQUIRED = {
    "## For": "what the patch is for",
    "## In words": "how it should sound, in prose",
    "## The one committed target": "the direction that wins when forced to choose",
    "## Measurable targets": "3-5 rows, each naming the phrase it derives from",
}
MIN_TARGETS, MAX_TARGETS = 3, 5
IMPL_SUFFIXES = (".rs", ".ts", ".js", ".json")


def _check(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    rel = path.parent.name
    errs: list[str] = []

    for heading, why in REQUIRED.items():
        if heading not in text:
            errs.append(f"{rel}: missing section '{heading}' ({why})")

    if "## Measurable targets" in text:
        block = text.split("## Measurable targets", 1)[1].split("\n## ", 1)[0]
        rows = [ln for ln in block.splitlines()
                if ln.strip().startswith("|")
                and not re.match(r"^\s*\|[\s|:-]+\|\s*$", ln)
                and not re.search(r"\|\s*#\s*\|", ln)]
        if not (MIN_TARGETS <= len(rows) <= MAX_TARGETS):
            errs.append(f"{rel}: has {len(rows)} measurable targets, "
                        f"needs {MIN_TARGETS}-{MAX_TARGETS}")
        for row in rows:
            cells = [c.strip() for c in row.strip().strip("|").split("|")]
            if len(cells) < 3 or not cells[-1]:
                errs.append(f"{rel}: a target does not name the phrase it derives from "
                            f"-- {row.strip()[:60]}")
            elif not re.search(r"[A-Za-z]", cells[1]):
                errs.append(f"{rel}: a target row has no target text")

    # A committed direction must actually commit, not restate the description.
    if "## The one committed target" in text:
        block = text.split("## The one committed target", 1)[1].split("\n## ", 1)[0]
        if len(block.split()) < 10:
            errs.append(f"{rel}: the committed target is too short to be a decision")

    return errs


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None)
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]
    patches = root / "patches"

    if not patches.exists():
        print("no patches/ directory; nothing to check.")
        return 0

    errs: list[str] = []
    n = 0
    for d in sorted(p for p in patches.iterdir() if p.is_dir()):
        intent = d / "intent.md"
        has_impl = any(f.suffix in IMPL_SUFFIXES for f in d.rglob("*") if f.is_file())
        if not intent.exists():
            if has_impl:
                errs.append(f"{d.name}: has an implementation but NO intent.md -- "
                            f"the target must be written before the tuning")
            else:
                errs.append(f"{d.name}: no intent.md")
            continue
        n += 1
        errs.extend(_check(intent))

    if errs:
        print(f"INTENT CHECK FAIL — {len(errs)} problem(s)\n")
        for e in errs:
            print(f"  {e}")
        return 1
    print(f"intent check OK — {n} patch intent(s) well-formed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
