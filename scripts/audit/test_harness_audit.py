#!/usr/bin/env python3
"""Prove the harness audit fails when it should.

METR's task standard requires submitting an invalid, a partially-correct, and a best
solution and confirming each scores as expected before a task is accepted. The same
logic applies to an audit script: one that has never been observed to fail is not
evidence of anything, and a green audit tells you nothing until you know it can go red.

Each fixture below is a deliberately broken minimal harness. The audit MUST reject it,
and MUST do so via the named check -- failing for an unrelated reason would mean the
check we care about is silently dead.

    python3 scripts/audit/test_harness_audit.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from harness_audit import audit  # noqa: E402

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# fixture directory -> the check id that must appear among the failures
MUST_REJECT = {
    "missing-referent": "C1-PATHS",
    "empty-dir-claimed": "C3-NONEMPTY",
    "broken-link": "C2-LINKS",
    "unversioned-constitution": "C6-CONSTITUTION",
    "amendment-no-sync": "C6-CONSTITUTION",
    "derived-number": "C7-NO-DERIVED-NUMBERS",
    "trademark-leak": "C12-TRADEMARK",
}


class TestAuditFailsCorrectly(unittest.TestCase):
    def test_good_fixture_passes(self):
        """The audit is not merely always-red: a clean harness must go green."""
        rep = audit(FIXTURES / "good")
        self.assertEqual(rep.failures, [], f"clean fixture was rejected: {rep.failures}")
        self.assertGreater(rep.checks_run, 0, "clean fixture ran no checks at all")

    def test_broken_fixtures_are_rejected(self):
        for name, expected in MUST_REJECT.items():
            with self.subTest(fixture=name):
                rep = audit(FIXTURES / name)
                self.assertTrue(rep.failures, f"{name} was accepted but must be rejected")
                ids = {f.split(":", 1)[0] for f in rep.failures}
                self.assertIn(
                    expected, ids,
                    f"{name} was rejected, but not by {expected} -- got {sorted(ids)}. "
                    f"The check we rely on may be dead.",
                )

    def test_every_fixture_is_covered(self):
        """A fixture nobody asserts against is decoration."""
        on_disk = {p.name for p in FIXTURES.iterdir() if p.is_dir()}
        self.assertEqual(
            on_disk - {"good"}, set(MUST_REJECT),
            "fixtures on disk and asserted fixtures disagree",
        )


class TestIdentityCheckFailsCorrectly(unittest.TestCase):
    """The identity check is the one gate whose failure publishes something.
    It gets the same fail-correctly proof as the file audit."""

    SCRIPT = Path(__file__).resolve().parent / "check-identity.sh"

    def _run(self, expected, actual):
        return subprocess.run([str(self.SCRIPT), expected, actual],
                              capture_output=True, text=True)

    def _run_with_fake_gh(self, gh_body):
        with tempfile.TemporaryDirectory() as temp:
            fake_bin = Path(temp) / "bin"
            fake_bin.mkdir()
            fake_gh = fake_bin / "gh"
            fake_gh.write_text("#!/usr/bin/env bash\nset -euo pipefail\n" + gh_body)
            fake_gh.chmod(0o755)
            env = os.environ.copy()
            env["PATH"] = f"{fake_bin}:{env['PATH']}"
            return subprocess.run([str(self.SCRIPT), "owner"], capture_output=True,
                                  text=True, env=env)

    def test_matching_identity_passes(self):
        r = self._run("owner", "owner")
        self.assertEqual(r.returncode, 0, r.stderr)

    def test_mismatched_identity_is_rejected(self):
        r = self._run("owner", "some-other-account")
        self.assertEqual(r.returncode, 1, "a wrong account was accepted")
        self.assertIn("IDENTITY CHECK FAIL", r.stderr)

    def test_failure_message_names_the_fix(self):
        r = self._run("owner", "wrong")
        self.assertIn("gh auth switch -u owner", r.stderr)

    def test_mismatched_live_identity_self_heals_before_reporting(self):
        r = self._run_with_fake_gh(r'''
state="$0.state"
case "$1 $2" in
  "api user")
    [ -f "$state" ] && echo owner || echo wrong
    ;;
  "auth switch")
    [ "$3" = "-u" ] && [ "$4" = "owner" ]
    touch "$state"
    ;;
  *) exit 2 ;;
esac
''')
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("identity ok — owner", r.stdout)

    def test_failed_self_heal_still_rejects_wrong_identity(self):
        r = self._run_with_fake_gh(r'''
case "$1 $2" in
  "api user") echo wrong ;;
  "auth switch") exit 1 ;;
  *) exit 2 ;;
esac
''')
        self.assertEqual(r.returncode, 1, "a failed account switch was accepted")
        self.assertIn("IDENTITY CHECK FAIL", r.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
