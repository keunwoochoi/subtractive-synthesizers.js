#!/usr/bin/env python3
"""Prove the spec harness rejects what it must, and for the right reason.

Same discipline as scripts/audit/fixtures: an evaluator that has never been observed to
reject anything is not evidence. Each cheat below must fail, and must fail via the
metric it was built to defeat -- a cheat rejected for an unrelated reason would mean the
gate we rely on is dead.

    python3 scripts/verify/test_verify_spec.py
"""

from __future__ import annotations

import ast
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import candidates as C  # noqa: E402
import verify_spec as V  # noqa: E402


class TestHarnessDiscriminates(unittest.TestCase):
    def test_honest_implementation_passes(self):
        r = V.run("polyblep_saw", C.polyblep_saw)
        self.assertTrue(r["pass_hidden"],
                        f"the intended implementation was rejected: {r['fails']}")

    def test_negative_control_is_rejected(self):
        """A raw phase ramp must fail. If it does not, the alias gate measures nothing."""
        r = V.run("naive_saw", C.naive_saw)
        self.assertFalse(r["pass_hidden"], "a fully aliasing oscillator was accepted")
        self.assertIn("alias_db", " ".join(r["fails"]))

    def test_every_cheat_is_rejected(self):
        for name, fn in C.CHEATS.items():
            with self.subTest(cheat=name):
                r = V.run(name, fn)
                self.assertFalse(r["pass_hidden"], f"{name} was accepted")

    def test_silence_and_sine_are_caught_by_harmonic_structure_not_alias(self):
        """The reason the metrics are paired.

        A pure sine has BETTER alias suppression than the real implementation. Gating on
        alias alone would rank it first. Only the harmonic-structure metric sees that it
        is not a sawtooth.
        """
        sine = V.run("cheat_pure_sine", C.cheat_pure_sine)
        good = V.run("polyblep_saw", C.polyblep_saw)
        self.assertLess(sine["hidden"]["alias_db"], good["hidden"]["alias_db"],
                        "expected the sine to look BETTER than the real thing on alias")
        self.assertGreater(sine["hidden"]["harmonic_err_db"], 20.0)
        self.assertFalse(sine["pass_hidden"])

    def test_special_casing_is_caught_only_by_the_hidden_grid(self):
        """An implementation correct on the published grid and naive elsewhere passes
        the visible grid and must still be rejected."""
        r = V.run("cheat_special_cased", C.cheat_special_cased)
        self.assertTrue(r["pass_visible"], "fixture no longer passes the visible grid")
        self.assertFalse(r["pass_hidden"], "special-casing survived the hidden grid")
        self.assertGreater(r["gap_db"], 5.0,
                           "the visible/hidden gap should expose special-casing")


class TestEvaluatorIntegrity(unittest.TestCase):
    def test_candidates_cannot_see_the_answer_key(self):
        """The thing being graded must not import the prototypes or the metrics.

        Enforced by parsing the module rather than by convention, because 'we agreed not
        to' is exactly the guarantee that fails under pressure.
        """
        src = (Path(__file__).resolve().parent / "candidates.py").read_text()
        imported = set()
        for node in ast.walk(ast.parse(src)):
            if isinstance(node, ast.Import):
                imported.update(a.name.split(".")[0] for a in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported.add(node.module.split(".")[0])
        for forbidden in ("prototypes", "metrics", "verify_spec"):
            self.assertNotIn(forbidden, imported,
                             f"candidates.py imports {forbidden} — it can see its own score")

    def test_locked_grid_points_are_rejected(self):
        """The alias metric is blind where sr/f0 is integral. A grid containing such a
        point must be refused, not silently graded."""
        self.assertTrue(V.harmonically_locked(3000.0, 48_000.0))
        self.assertFalse(V.harmonically_locked(2999.0, 48_000.0))
        with self.assertRaises(AssertionError):
            V.assert_grid_is_measurable([(3000.0, 48_000.0)], "test")

    def test_shipped_grids_are_measurable(self):
        V.assert_grid_is_measurable([(f, V.VISIBLE_SR) for f in V.VISIBLE_NOTES], "visible")
        V.assert_grid_is_measurable(V.hidden_grid(), "hidden")


if __name__ == "__main__":
    unittest.main(verbosity=2)
