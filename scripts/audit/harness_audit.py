#!/usr/bin/env python3
"""Audit the agent harness itself. Stdlib only, no dependencies, always terminates.

Every check here exists because a specific rule in AGENTS.md or PRINCIPLES.md would
otherwise be enforced by memory, and instruction files are context rather than
configuration -- under pressure, prose gets ignored. See
agentic-docs/design/2026-07-28-harness-evidence.md for the evidence behind each.

Run against the repo:            python3 scripts/audit/harness_audit.py
Run against a fixture (expect failure):
                                 python3 scripts/audit/harness_audit.py --root scripts/audit/fixtures/<name>
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

# The always-on operating surface. Paths cited here MUST exist -- these files are
# injected into every session, so a stale reference misleads on every task.
OPERATING_SURFACE = ("AGENTS.md", "PRINCIPLES.md")

# Budgets. Sources: Claude Code docs (<200 lines), Windsurf (12k chars total),
# Aider CONVENTIONS.md (150-200 lines). Deliberately a failing check, not an aspiration.
MAX_LINES = {"AGENTS.md": 150, "PRINCIPLES.md": 150}
MAX_TOTAL_CHARS = 24_000

# A measurement belongs in the script that measures it, never in the constitution.
# Version numbers, dates and maths (1/k) must not trip this.
DERIVED_NUMBER = re.compile(
    r"\b\d[\d,._]*\s?(KB|MB|GB|kB|ms|µs|us|Hz|kHz|dB|dBFS|LUFS|%|voices|frames|bytes)\b"
)

PATHISH = re.compile(r"`([^`\n]+)`")
MD_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
CLARIFY = re.compile(r"\[NEEDS CLARIFICATION[^\]]*\]")
TODO = re.compile(r"\b(TODO|FIXME|XXX)\b\s*[:(]")
SEMVER_HEADER = re.compile(r"^\*\*Version (\d+\.\d+\.\d+)\*\*.*Ratified (\d{4}-\d{2}-\d{2})", re.M)
AMENDMENT_HEAD = re.compile(r"^### (\d+\.\d+\.\d+) — (\d{4}-\d{2}-\d{2}) — (.+)$", re.M)


@dataclass
class Report:
    failures: list[str] = field(default_factory=list)
    checks_run: int = 0

    def check(self, ok: bool, ident: str, detail: str) -> None:
        self.checks_run += 1
        if not ok:
            self.failures.append(f"{ident}: {detail}")


def looks_like_path(tok: str) -> bool:
    """Backticked tokens that are plausibly repo paths. Conservative on purpose:
    a false positive here blocks a commit, so we only claim the obvious cases."""
    if " " in tok or tok.startswith(("http", "@", "$", "-", "npm ", "git ")):
        return False
    if tok.endswith("/"):
        return True
    if "/" in tok and re.search(r"\.(md|sh|py|toml|json|rs|ts|js|mjs|yml|yaml)$", tok):
        return True
    return bool(re.fullmatch(r"[A-Z]+\.md", tok))


def read(p: Path) -> str:
    try:
        return p.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return ""


def audit(root: Path) -> Report:
    r = Report()
    # Exclusions are relative to root: when auditing a fixture, `root` is itself inside
    # scripts/audit/fixtures/, and matching on absolute parts would exclude every doc and
    # silently disable the checks. (Caught by test_harness_audit.py on the first run.)
    # Vendored and build trees are not ours to audit: node_modules ships thousands of
    # READMEs with broken relative links, and target/ is compiler output.
    SKIP = {".git", "fixtures", "node_modules", "target", "dist"}

    # Anything git ignores is a build artifact, and build artifacts are not ours to audit.
    # The package build stages copies of README.md and the two licences into
    # packages/core/ so npm actually ships them; the README copy sits one level deeper
    # than the original, so its relative links resolve from the wrong place and C2-LINKS
    # failed on a file no human wrote and nobody reads from there. The rule was right and
    # the input was wrong -- so filter the input rather than weaken the rule.
    ignored: set[str] = set()
    try:
        out = subprocess.run(["git", "ls-files", "--others", "--ignored", "--exclude-standard"],
                             cwd=root, capture_output=True, text=True, check=False).stdout
        ignored = {line.strip() for line in out.splitlines() if line.strip()}
    except OSError:
        pass

    def excluded(p: Path) -> bool:
        rel = p.relative_to(root)
        return bool(SKIP & set(rel.parts)) or rel.as_posix() in ignored

    docs = sorted(p for p in root.rglob("*.md") if not excluded(p))

    # --- C1/C3: every path cited on the always-on surface exists, and every directory
    # it names is genuinely populated. A directory that exists implies it is real;
    # intent goes in an issue, never in an empty folder.
    for name in OPERATING_SURFACE:
        f = root / name
        if not f.exists():
            r.check(False, "C1-PATHS", f"{name} is missing from the operating surface")
            continue
        text = read(f)
        # Lines that explicitly declare something absent are exempt and must say so.
        exempt = {i for i, ln in enumerate(text.splitlines())
                  if re.search(r"does not exist|not exist yet|M0 item", ln, re.I)}
        for i, line in enumerate(text.splitlines()):
            if i in exempt:
                continue
            for tok in PATHISH.findall(line):
                if not looks_like_path(tok):
                    continue
                target = root / tok.rstrip("/")
                if not target.exists():
                    r.check(False, "C1-PATHS", f"{name}:{i+1} cites `{tok}` which does not exist")
                elif target.is_dir():
                    real = [c for c in target.rglob("*") if c.is_file() and c.name != ".gitkeep"]
                    r.check(bool(real), "C3-NONEMPTY",
                            f"{name}:{i+1} cites directory `{tok}` but it holds no real files")

    # --- C2: markdown links to local files resolve, across every doc.
    for d in docs:
        for i, line in enumerate(read(d).splitlines()):
            for href in MD_LINK.findall(line):
                if href.startswith(("http", "#", "mailto:")):
                    continue
                tgt = (d.parent / href.split("#", 1)[0]).resolve()
                r.check(tgt.exists(), "C2-LINKS",
                        f"{d.relative_to(root)}:{i+1} links to {href} which does not resolve")

    # --- C4/C5: context budget, and deep header structure. Volume without granularity
    # is the declining-project profile (arXiv 2606.13449).
    total = 0
    for name, cap in MAX_LINES.items():
        f = root / name
        if not f.exists():
            continue
        text = read(f)
        total += len(text)
        n = len(text.splitlines())
        r.check(n <= cap, "C4-BUDGET", f"{name} is {n} lines, over its {cap}-line budget")
        h3 = len(re.findall(r"^### ", text, re.M))
        r.check(h3 >= 3, "C5-STRUCTURE",
                f"{name} has {h3} H3 headings; deep structure correlates with agent success")
    r.check(total <= MAX_TOTAL_CHARS, "C4-BUDGET",
            f"always-on context is {total} chars, over the {MAX_TOTAL_CHARS} budget")

    # --- C6: the constitution is versioned and every amendment propagates.
    prin = root / "PRINCIPLES.md"
    if prin.exists():
        text = read(prin)
        r.check(bool(SEMVER_HEADER.search(text)), "C6-CONSTITUTION",
                "PRINCIPLES.md lacks a '**Version X.Y.Z** ... Ratified YYYY-MM-DD' header")
        # Amendment reasoning lives outside the constitution's context budget, but it must
        # exist somewhere and every amendment must still name what it propagates to.
        ledger = root / "agentic-docs" / "amendments.md"
        ledger_text = read(ledger)
        amendments = AMENDMENT_HEAD.findall(text + ledger_text)
        r.check(bool(amendments), "C6-CONSTITUTION", "no amendment record found")
        blocks = re.split(r"^### (?=\d+\.\d+\.\d+ — )", text + ledger_text, flags=re.M)[1:]
        for b in blocks:
            ver = b.split(" ", 1)[0]
            if ver.endswith(".0.0") and "Ratified" in b.split("\n")[0]:
                continue
            if re.match(r"1\.0\.0", ver):
                continue
            r.check("Sync Impact Report" in b, "C6-CONSTITUTION",
                    f"amendment {ver} has no Sync Impact Report naming what it propagates to")

        # --- C7: no number derived from code may live in the constitution.
        for i, line in enumerate(text.splitlines()):
            m = DERIVED_NUMBER.search(line)
            if m:
                r.check(False, "C7-NO-DERIVED-NUMBERS",
                        f"PRINCIPLES.md:{i+1} states '{m.group(0)}' -- numbers belong in the "
                        f"script that measures them")

    # --- C8: the two harness files may not contradict each other on authority gates.
    ag, pr = read(root / "AGENTS.md"), read(prin) if prin.exists() else ""
    if ag and pr:
        main_never = re.search(r"push.{0,40}`main`.{0,40}\*\*never\*\*", ag, re.I | re.S)
        main_lifted = "Direct commits and pushes to `main` are permitted" in pr
        r.check(not (main_never and main_lifted), "C8-GATES-AGREE",
                "AGENTS.md says pushing to main is 'never' while PRINCIPLES.md lifts that gate")

    # --- C11: the library stays an instrument. PRINCIPLES lists "not a DAW, sequencer,
    # arpeggiator, or groovebox" as a non-goal, and a non-goal with no enforcement is a
    # matter of judgement on a tired afternoon. The demo app may sequence all it likes;
    # packages/ may not. Caught a real violation on its first run: a table of sixteen-step
    # basslines was living in packages/core/src/presets.js.
    #
    # Note the distinction this encodes: scheduling infrastructure (playing a note at a
    # given time) is the library's job; deciding WHICH notes to play is not.
    banned = re.compile(r"\b(arpeggiat\w*|PATTERNS|stepSequenc\w*|bassline)\b", re.I)
    pkg = root / "packages"
    if pkg.exists():
        for f in sorted(pkg.rglob("*")):
            if not f.is_file() or f.suffix not in (".js", ".ts", ".rs"):
                continue
            if "node_modules" in f.relative_to(root).parts:
                continue
            for i, line in enumerate(read(f).splitlines()):
                # Skip comments: prose ABOUT the rule is not a violation of it. The
                # check fired on the comment explaining why patterns were moved out,
                # which is the rule catching its own documentation.
                st = line.lstrip()
                if st.startswith(("//", "/*", "*", "#")):
                    continue
                m = banned.search(line)
                if m:
                    r.check(False, "C11-NOT-A-GROOVEBOX",
                            f"{f.relative_to(root)}:{i+1} has '{m.group(0)}' -- musical "
                            f"sequencing belongs in apps/, not in the library")

    # --- C12: no protected name on a product surface. A factual history section in the
    # README may name its subject; presets, APIs, demos, and product claims may not.
    MARKS = ("moog", "minimoog", "juno", "jupiter", "roland", "korg", "yamaha",
             "prophet", "oberheim", "ob-xa", "solina", "jp-8000", "tb-303", "tb303",
             "tr-808", "tr808", "tr-909", "tr909", "nord", "arturia", "serum", "massive")
    mark_re = re.compile(r"\b(" + "|".join(MARKS) + r")\b", re.I)
    SHIPPED = ("packages", "apps", "README.md")
    for rel in SHIPPED:
        target = root / rel
        if not target.exists():
            continue
        files = [target] if target.is_file() else [
            f for f in target.rglob("*")
            if f.is_file() and f.suffix in (".js", ".ts", ".html", ".md", ".json")
            and "node_modules" not in f.relative_to(root).parts
            and "dist" not in f.relative_to(root).parts
            and not excluded(f)]
        for f in files:
            in_readme_history = False
            for i, line in enumerate(read(f).splitlines()):
                if f.name == "README.md" and line.startswith("## "):
                    in_readme_history = line == "## A short build log"
                m = mark_re.search(line)
                if m and not in_readme_history:
                    r.check(False, "C12-TRADEMARK",
                            f"{f.relative_to(root)}:{i+1} names '{m.group(0)}' on a shipped "
                            f"product surface -- describe our sound, never brand it")

    # --- C9/C10: unresolved markers.
    for d in docs:
        text = read(d)
        accepted = re.search(r"^Status:\s*\*{0,2}accepted", text, re.M | re.I)
        for i, line in enumerate(text.splitlines()):
            if CLARIFY.search(line):
                r.check(not accepted, "C9-CLARIFY",
                        f"{d.relative_to(root)}:{i+1} still has a NEEDS CLARIFICATION marker "
                        f"in an accepted document")
            if TODO.search(line) and d.name in OPERATING_SURFACE:
                r.check(False, "C10-TODO", f"{d.relative_to(root)}:{i+1} has an unresolved marker")

    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None, help="directory to audit (default: repo root)")
    args = ap.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]

    rep = audit(root)
    if rep.failures:
        print(f"HARNESS AUDIT FAIL — {len(rep.failures)} of {rep.checks_run} checks failed\n")
        for f in rep.failures:
            print(f"  {f}")
        print("\nFix the artifact, not the rule. If a rule is wrong, amend PRINCIPLES.md.")
        return 1
    print(f"harness audit OK — {rep.checks_run} checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
