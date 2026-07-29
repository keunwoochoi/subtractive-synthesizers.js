#!/usr/bin/env python3
"""Loop A, stage 1-3: grade an oscillator against its analytic prototype.

    python3 scripts/verify/verify_spec.py                 # every candidate
    python3 scripts/verify/verify_spec.py polyblep_saw    # one

Design rules this implements, from agentic-docs/design/2026-07-28-loop-evidence.md:

  - the candidate returns a buffer; every number here is computed by the harness
  - gates are the WORST case over the grid, never the mean: an average hides a
    screaming alias tone at one pitch, and the search will find what the average
    cannot see
  - a VISIBLE grid for iteration and a HIDDEN grid for the verdict, with the gap
    between them reported; a widening gap means the proxy is being optimised past
    the specification
  - crash, silence, and bad-score are distinct outcomes, never collapsed into one
    'worst value'

Thresholds below are provisional. Per the owner decision of 2026-07-28 ("ok cool"),
the real alias threshold is set at M1 from measurement, not chosen now.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

import candidates as C  # noqa: E402
from metrics import measure  # noqa: E402

DUR = 0.5
VISIBLE_SR = 48_000.0

# The alias metric has a known blind spot, found by measurement on 2026-07-28: when
# sr/f0 is an integer, every aliased partial folds exactly ONTO a harmonic bin, so the
# metric sees no inharmonic energy at all. A naive sawtooth measures -11.6 dB at
# f0=2999 Hz and -120.3 dB at f0=3000 Hz with sr=48 kHz -- the same oscillator, the
# same aliasing, and a 109 dB difference in the reported score. Harmonic error barely
# moves (0.8 -> 1.9 dB), so the pair does not save us either.
#
# Any grid containing such a point silently grades a broken oscillator as perfect. The
# current visible grid happens to avoid it, BY LUCK, not by design. So the grid is now
# guarded rather than trusted.
# Tolerance measured, not guessed (2026-07-28). Reported alias for a naive saw whose
# true value is -11.5 dB, as sr/f0 approaches an integer:
#   offset 0.00000 -> -120.3 dB     offset 0.00100 -> -19.7 dB
#   offset 0.00010 -> -108.5 dB     offset 0.00300 -> -13.3 dB
#   offset 0.00030 ->  -99.2 dB     offset 0.00500 -> -11.6 dB  (accurate)
# The blind region is narrow and its edge is sharp. 0.005 is where the reading becomes
# truthful, so that is the tolerance. A wider guess (the first attempt used 0.02) throws
# away perfectly measurable points -- it rejected 2999 Hz, which reads correctly.
_LOCK_TOLERANCE = 0.005


def harmonically_locked(f0: float, sr: float) -> bool:
    r = sr / f0
    return abs(r - round(r)) < _LOCK_TOLERANCE


def assert_grid_is_measurable(grid: list[tuple[float, float]], label: str) -> None:
    bad = [(f, s) for f, s in grid if harmonically_locked(f, s)]
    if bad:
        raise AssertionError(
            f"{label} grid contains harmonically-locked points where the alias metric "
            f"is blind: {[(round(f, 2), s) for f, s in bad]}. "
            f"An evaluator that cannot see the defect must not be used to grade it."
        )

# Iteration grid: stable, published, what you tune against.
VISIBLE_NOTES = (55.0, 110.0, 220.0, 440.0, 880.0, 1760.0)

# Verdict grid: never tuned against. Includes sample rates and pitches the visible
# grid does not, because "correct at 48 kHz on A440" is not the claim we ship.
HIDDEN_SEED = 20260728


def hidden_grid(n: int = 10) -> list[tuple[float, float]]:
    """Randomised verdict grid, with locked points rejected at construction.

    The guard below caught this function on its first run: a uniform draw over
    40-3000 Hz produced a point where sr/f0 was integral to within tolerance, and the
    grid would have graded a fully aliasing oscillator as perfect at that point. A
    random grid is not automatically a safe grid.
    """
    rng = np.random.default_rng(HIDDEN_SEED)
    rates = [44_100.0, 48_000.0, 96_000.0]
    grid: list[tuple[float, float]] = []
    while len(grid) < n:
        f0 = float(rng.uniform(40.0, 3000.0))
        sr = float(rates[int(rng.integers(len(rates)))])
        if not harmonically_locked(f0, sr):
            grid.append((f0, sr))
    return grid


# Thresholds set from measurement on 2026-07-28, per the owner decision to calibrate
# at M1 rather than guess ("ok cool"). Measured worst case over the hidden grid:
#   naive phase ramp   -12.8 dB      PolyBLEP   -27.4 dB
# PolyBLEP buys a consistent +16 dB across the whole range, but degrades with pitch:
# -47 dB at 28 Hz, -35 dB at 440 Hz, -27 dB at 2.2 kHz. So -35 dB is NOT achievable by
# PolyBLEP alone above about A440, which is an architectural finding, not a tuning
# detail -- see the oversampling discussion in the architecture doc.
# -20 dB is the M1 floor: it rejects the naive ramp by 7 dB and passes PolyBLEP by 7 dB,
# so it discriminates implementations with margin on both sides. It is deliberately a
# FLOOR and not a quality bar, and it must be tightened when oversampling lands.
GATES = {
    "alias_db": ("<=", -20.0, "inharmonic energy, worst case"),
    "harmonic_err_db": ("<=", 6.0, "partial structure vs prototype, worst case"),
    "tuning_cents": ("<=", 5.0, "pitch error, worst case"),
    "peak": ("<=", 1.5, "no runaway"),
    "rms": (">=", 0.02, "not silent"),
}


def _worst(rows: list[dict], key: str, direction: str) -> float:
    vals = [r[key] for r in rows]
    return max(vals) if direction == "<=" else min(vals)


def evaluate(fn, grid: list[tuple[float, float]], shape: str = "saw",
             label: str = "grid") -> dict:
    assert_grid_is_measurable(grid, label)
    rows = []
    for f0, sr in grid:
        n = int(DUR * sr)
        try:
            x = np.asarray(fn(f0, sr, n), dtype=float)
        except Exception as e:  # a crash is its own outcome, not a bad score
            return {"crashed": f"{type(e).__name__}: {e}", "rows": []}
        rows.append({**measure(x, f0, sr, shape), "f0": f0, "sr": sr})

    summary = {"crashed": None, "rows": rows}
    for key, (direction, _thr, _desc) in GATES.items():
        summary[key] = _worst(rows, key, direction)
    summary["nonfinite"] = sum(r["nonfinite"] for r in rows)
    return summary


def verdict(summary: dict) -> tuple[bool, list[str]]:
    if summary["crashed"]:
        return False, [f"CRASHED: {summary['crashed']}"]
    fails = []
    if summary["nonfinite"]:
        fails.append(f"{summary['nonfinite']} non-finite samples")
    for key, (direction, thr, desc) in GATES.items():
        v = summary[key]
        bad = (v > thr) if direction == "<=" else (v < thr)
        if bad or not np.isfinite(v):
            fails.append(f"{desc}: {key}={v:.2f} fails {direction} {thr}")
    return (not fails), fails


def run(name: str, fn) -> dict:
    vis = evaluate(fn, [(f, VISIBLE_SR) for f in VISIBLE_NOTES], label="visible")
    hid = evaluate(fn, hidden_grid(), label="hidden")
    ok_v, _ = verdict(vis)
    ok_h, fails_h = verdict(hid)

    gap = None
    if not vis["crashed"] and not hid["crashed"]:
        gap = hid["alias_db"] - vis["alias_db"]  # >0 means worse when unseen

    return {"name": name, "visible": vis, "hidden": hid,
            "pass_visible": ok_v, "pass_hidden": ok_h,
            "fails": fails_h, "gap_db": gap}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("candidate", nargs="?", help="one candidate, or all if omitted")
    args = ap.parse_args()

    todo = {args.candidate: C.ALL[args.candidate]} if args.candidate else C.ALL
    print(f"verify-spec — {len(VISIBLE_NOTES)} visible points, "
          f"{len(hidden_grid())} hidden, {DUR}s each\n")
    print(f"{'candidate':22} {'alias dB':>9} {'harm err':>9} {'cents':>7} "
          f"{'rms':>6} {'gap dB':>7}  verdict")
    print("-" * 86)

    results = []
    for name, fn in todo.items():
        r = run(name, fn)
        results.append(r)
        h = r["hidden"]
        if h["crashed"]:
            print(f"{name:22} {'—':>9} {'—':>9} {'—':>7} {'—':>6} {'—':>7}  CRASH")
            continue
        gap = f"{r['gap_db']:+.1f}" if r["gap_db"] is not None else "—"
        mark = "PASS" if r["pass_hidden"] else "REJECT"
        if r["pass_visible"] and not r["pass_hidden"]:
            mark = "REJECT (passed visible!)"
        print(f"{name:22} {h['alias_db']:>9.1f} {h['harmonic_err_db']:>9.1f} "
              f"{h['tuning_cents']:>7.2f} {h['rms']:>6.3f} {gap:>7}  {mark}")

    print()
    for r in results:
        if not r["pass_hidden"] and r["fails"]:
            print(f"  {r['name']}: {r['fails'][0]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
