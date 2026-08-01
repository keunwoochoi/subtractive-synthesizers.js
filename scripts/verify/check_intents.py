#!/usr/bin/env python3
"""Bind the exported preset bank to honest patch-intent artifacts.

The mapping is intentionally checked from the JavaScript export rather than from a
second hand-maintained roster.  The migration cutoff is immutable evidence: a preset
may call its intent retrospective only when that preset already existed at the cutoff.
Anything added later must have a prior intent commit.

    python3 scripts/verify/check_intents.py [--root DIR]
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

REQUIRED = {
    "## Historical provenance": "whether the artifact preceded or followed tuning",
    "## For": "what the patch is for",
    "## In words": "how it should sound, in prose",
    "## The one committed target": "the direction that wins when forced to choose",
    "## Measurable targets": "3-5 rows, each naming the phrase it derives from",
}
MIN_TARGETS, MAX_TARGETS = 3, 5
PRESET_SOURCE = Path("packages/core/src/presets.js")

# This SHA is the last commit before issue #4 repaired the mapping.  It freezes the set
# eligible for honest retrospective migration.  Moving the cutoff would require editing
# the gate; adding a new preset cannot make itself eligible merely by claiming history.
RETROSPECTIVE_CUTOFF = "d242df1dd97992d38b4be12eecb06b8c0e422223"
RENAMED_PRIOR_PATHS = {"acid": "patches/acid-bass/intent.md"}

ID = r"[a-z0-9]+(?:-[a-z0-9]+)*"
HEADER_RE = re.compile(rf"^# Patch intent: (?P<id>{ID})\s*$", re.M)
PRESET_RE = re.compile(rf"^Preset: `(?P<id>{ID})`\s*$", re.M)
STATUS_RE = re.compile(r"^Status: (?P<status>proposed|implemented)\s*$", re.M)
PROVENANCE_RE = re.compile(r"^Provenance: (?P<kind>prior|retrospective)\s*$", re.M)
PRIOR_PATH_RE = re.compile(r"^Prior path: `(?P<path>patches/[^`]+/intent\.md)`\s*$", re.M)


@dataclass
class Intent:
    directory: str
    path: Path
    preset_id: str | None
    header_id: str | None
    status: str | None
    provenance: str | None
    prior_path: str | None
    text: str


@dataclass
class Inventory:
    preset_ids: set[str] = field(default_factory=set)
    intents: list[Intent] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def implemented(self) -> list[Intent]:
        return [i for i in self.intents if i.status == "implemented"]


def _field(regex: re.Pattern[str], text: str, name: str) -> str | None:
    match = regex.search(text)
    return match.group(name) if match else None


def _preset_ids_from_source(source: str, where: str) -> tuple[set[str], str | None]:
    # Evaluate only the bank declaration. The current module imports generated defaults,
    # while historical snapshots before the metadata migration are self-contained. A
    # stdin ESM has no file URL beside presets.js, so a relative import would resolve at
    # the repository root and fail before the inventory could be read. Removing imports
    # and supplying an inert default object keeps this history audit focused on its one
    # question: which preset ids did this exact source export?
    bank = re.sub(r"^import\s+.*?;\s*$", "", source, flags=re.M)
    bank = re.sub(r"\b(?:SHAPE|FILTER)\.\w+", "0", bank)
    program = ("const PARAM_DEFAULTS = {};\n" + bank +
               "\nprocess.stdout.write(JSON.stringify(Object.keys(PRESETS)));\n")
    try:
        run = subprocess.run(
            ["node", "--input-type=module"], input=program, capture_output=True,
            text=True, timeout=15, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return set(), f"cannot evaluate {where}: {exc}"
    if run.returncode:
        detail = (run.stderr or run.stdout).strip().splitlines()
        return set(), f"cannot evaluate {where}: {detail[-1] if detail else 'node failed'}"
    try:
        value = json.loads(run.stdout)
    except json.JSONDecodeError as exc:
        return set(), f"cannot read preset ids from {where}: {exc}"
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        return set(), f"{where} did not export a string-keyed PRESETS object"
    if len(value) != len(set(value)):
        return set(), f"{where} exports duplicate preset ids"
    return set(value), None


def _load_preset_ids(root: Path) -> tuple[set[str], str | None]:
    path = root / PRESET_SOURCE
    if not path.exists():
        return set(), f"missing exported preset bank: {PRESET_SOURCE}"
    return _preset_ids_from_source(path.read_text(encoding="utf-8"), PRESET_SOURCE.as_posix())


def _git(root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    # Git hooks export repository-local GIT_* variables.  If inherited by a fixture
    # subprocess, those variables make `git -C fixture` report the outer repository as
    # though the fixture itself were its root, enabling history checks on fake paths.
    env = os.environ.copy()
    for name in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_PREFIX"):
        env.pop(name, None)
    return subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True,
                          check=False, env=env)


def _is_git_root(root: Path) -> bool:
    run = _git(root, "rev-parse", "--show-toplevel")
    if run.returncode:
        return False
    return Path(run.stdout.strip()).resolve() == root.resolve()


def _cutoff_ids(root: Path) -> tuple[set[str], str | None]:
    run = _git(root, "show", f"{RETROSPECTIVE_CUTOFF}:{PRESET_SOURCE.as_posix()}")
    if run.returncode:
        return set(), f"retrospective cutoff {RETROSPECTIVE_CUTOFF} is unavailable"
    return _preset_ids_from_source(run.stdout, f"{RETROSPECTIVE_CUTOFF}:{PRESET_SOURCE}")


def _first_preset_commits(root: Path) -> tuple[dict[str, str], str | None]:
    run = _git(root, "rev-list", "--reverse", "HEAD", "--", PRESET_SOURCE.as_posix())
    if run.returncode:
        return {}, "cannot inspect preset history"
    first: dict[str, str] = {}
    for sha in run.stdout.splitlines():
        shown = _git(root, "show", f"{sha}:{PRESET_SOURCE.as_posix()}")
        if shown.returncode:
            continue
        ids, error = _preset_ids_from_source(shown.stdout, f"{sha}:{PRESET_SOURCE}")
        if error:
            return {}, error
        for preset_id in ids:
            first.setdefault(preset_id, sha)
    return first, None


def _first_intent_commit(root: Path, intent: Intent) -> str | None:
    rel = intent.prior_path or intent.path.relative_to(root).as_posix()
    run = _git(root, "log", "--diff-filter=A", "--format=%H", "--", rel)
    commits = run.stdout.splitlines() if run.returncode == 0 else []
    return commits[-1] if commits else None


def _strict_ancestor(root: Path, older: str, newer: str) -> bool:
    if older == newer:
        return False
    return _git(root, "merge-base", "--is-ancestor", older, newer).returncode == 0


def _parse_intent(path: Path) -> Intent:
    text = path.read_text(encoding="utf-8")
    return Intent(
        directory=path.parent.name,
        path=path,
        preset_id=_field(PRESET_RE, text, "id"),
        header_id=_field(HEADER_RE, text, "id"),
        status=_field(STATUS_RE, text, "status"),
        provenance=_field(PROVENANCE_RE, text, "kind"),
        prior_path=_field(PRIOR_PATH_RE, text, "path"),
        text=text,
    )


def _check_shape(intent: Intent) -> list[str]:
    text, rel = intent.text, intent.directory
    errors: list[str] = []
    for heading, why in REQUIRED.items():
        if heading not in text:
            errors.append(f"{rel}: missing section '{heading}' ({why})")

    if intent.header_id is None:
        errors.append(f"{rel}: missing or invalid '# Patch intent: <id>' heading")
    if intent.preset_id is None:
        errors.append(f"{rel}: missing or invalid 'Preset: `<id>`' mapping")
    if intent.status is None:
        errors.append(f"{rel}: missing 'Status: proposed|implemented'")
    if intent.provenance is None:
        errors.append(f"{rel}: missing 'Provenance: prior|retrospective'")
    expected_prior_path = RENAMED_PRIOR_PATHS.get(intent.preset_id or "")
    if intent.prior_path and intent.prior_path != expected_prior_path:
        errors.append(f"{rel}: Prior path is not an approved historical rename")
    if expected_prior_path and intent.prior_path != expected_prior_path:
        errors.append(f"{rel}: historical rename must retain Prior path `{expected_prior_path}`")

    if intent.provenance == "retrospective":
        marker = "This record was reconstructed after implementation and did not guide the original tuning."
        if marker not in text:
            errors.append(f"{rel}: retrospective intent must state that it did not guide the original tuning")
        if intent.status == "proposed":
            errors.append(f"{rel}: a retrospective intent cannot be proposed")
    elif intent.provenance == "prior":
        marker = "This intent was written before implementation."
        if marker not in text:
            errors.append(f"{rel}: prior intent must state that it was written before implementation")

    if "## Measurable targets" in text:
        block = text.split("## Measurable targets", 1)[1].split("\n## ", 1)[0]
        rows = [
            line for line in block.splitlines()
            if line.strip().startswith("|")
            and not re.match(r"^\s*\|[\s|:-]+\|\s*$", line)
            and not re.search(r"\|\s*#\s*\|", line)
        ]
        if not (MIN_TARGETS <= len(rows) <= MAX_TARGETS):
            errors.append(f"{rel}: has {len(rows)} measurable targets, needs {MIN_TARGETS}-{MAX_TARGETS}")
        for row in rows:
            cells = [cell.strip() for cell in row.strip().strip("|").split("|")]
            if len(cells) < 3 or not cells[-1]:
                errors.append(f"{rel}: a target does not name the phrase it derives from -- {row.strip()[:60]}")
            elif not re.search(r"[A-Za-z]", cells[1]):
                errors.append(f"{rel}: a target row has no target text")

    if "## The one committed target" in text:
        block = text.split("## The one committed target", 1)[1].split("\n## ", 1)[0]
        if len(block.split()) < 10:
            errors.append(f"{rel}: the committed target is too short to be a decision")
    return errors


def inspect_repository(root: Path, *, check_history: bool = True) -> Inventory:
    root = root.resolve()
    inventory = Inventory()
    inventory.preset_ids, source_error = _load_preset_ids(root)
    if source_error:
        inventory.errors.append(source_error)

    patches = root / "patches"
    if not patches.exists():
        inventory.errors.append("missing patches/ directory")
        return inventory

    for directory in sorted(path for path in patches.iterdir() if path.is_dir()):
        intent_path = directory / "intent.md"
        if not intent_path.exists():
            inventory.errors.append(f"{directory.name}: patch directory has no intent.md")
            continue
        intent = _parse_intent(intent_path)
        inventory.intents.append(intent)
        inventory.errors.extend(_check_shape(intent))

    mapped: dict[str, list[Intent]] = {}
    for intent in inventory.intents:
        if intent.preset_id:
            mapped.setdefault(intent.preset_id, []).append(intent)

    for preset_id, intents in sorted(mapped.items()):
        if len(intents) > 1:
            locations = ", ".join(i.directory for i in intents)
            inventory.errors.append(f"{preset_id}: duplicate mapping from intent directories {locations}")

    for intent in inventory.intents:
        if intent.preset_id and intent.directory != intent.preset_id:
            inventory.errors.append(
                f"{intent.directory}: mismatched preset id '{intent.preset_id}'; directory, heading, and Preset field must agree"
            )
        if intent.preset_id and intent.header_id and intent.header_id != intent.preset_id:
            inventory.errors.append(
                f"{intent.directory}: mismatched preset id '{intent.header_id}' in heading; expected '{intent.preset_id}'"
            )

    implemented_ids = {
        intent.preset_id for intent in inventory.intents
        if intent.status == "implemented" and intent.preset_id
    }
    proposed_ids = {
        intent.preset_id for intent in inventory.intents
        if intent.status == "proposed" and intent.preset_id
    }
    for preset_id in sorted(inventory.preset_ids - implemented_ids):
        inventory.errors.append(f"{preset_id}: exported preset has NO implemented intent.md")
    for preset_id in sorted(implemented_ids - inventory.preset_ids):
        inventory.errors.append(f"{preset_id}: orphan intent maps to no exported preset")
    for preset_id in sorted(proposed_ids & inventory.preset_ids):
        inventory.errors.append(f"{preset_id}: proposed intent already has an exported preset; mark it implemented")

    # Fixture roots exercise mapping and schema without inheriting the parent repo's
    # history.  The real repository additionally proves temporal ordering.
    if check_history and _is_git_root(root):
        cutoff_ids, cutoff_error = _cutoff_ids(root)
        first_presets, history_error = _first_preset_commits(root)
        if cutoff_error:
            inventory.errors.append(cutoff_error)
        if history_error:
            inventory.errors.append(history_error)
        for intent in inventory.intents:
            if not intent.preset_id:
                continue
            if intent.provenance == "retrospective":
                if not cutoff_error and intent.preset_id not in cutoff_ids:
                    inventory.errors.append(
                        f"{intent.preset_id}: retrospective provenance is forbidden; preset did not exist at cutoff {RETROSPECTIVE_CUTOFF}"
                    )
                continue
            if intent.provenance != "prior" or intent.status != "implemented":
                continue
            intent_sha = _first_intent_commit(root, intent)
            preset_sha = first_presets.get(intent.preset_id)
            if not intent_sha:
                inventory.errors.append(
                    f"{intent.preset_id}: prior intent has no earlier committed artifact; commit the proposed intent before implementation"
                )
            elif preset_sha and not _strict_ancestor(root, intent_sha, preset_sha):
                inventory.errors.append(
                    f"{intent.preset_id}: intent commit {intent_sha[:7]} must predate preset commit {preset_sha[:7]}"
                )
    return inventory


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=None)
    args = parser.parse_args()
    root = Path(args.root).resolve() if args.root else Path(__file__).resolve().parents[2]
    inventory = inspect_repository(root)
    if inventory.errors:
        print(f"INTENT CHECK FAIL — {len(inventory.errors)} problem(s)\n")
        for error in inventory.errors:
            print(f"  {error}")
        return 1
    prior = sum(i.provenance == "prior" and i.status == "implemented" for i in inventory.intents)
    retrospective = sum(i.provenance == "retrospective" for i in inventory.intents)
    proposed = sum(i.status == "proposed" for i in inventory.intents)
    print(
        f"intent check OK — {len(inventory.preset_ids)} exported preset(s), "
        f"{prior} prior, {retrospective} retrospective, {proposed} proposed"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
