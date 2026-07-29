"""Analytic ground truth. The harness's private reference.

PRINCIPLES: "We do not need a reference recording because we have a reference equation."
A bandlimited sawtooth is not a matter of opinion -- its harmonic amplitudes are known
in closed form, so "is this oscillator correct" has an exact answer that needs no corpus,
no microphone, and no licence.

CANDIDATES MUST NOT IMPORT THIS MODULE. The thing being graded does not get to see the
answer key -- see agentic-docs/design/2026-07-28-loop-evidence.md. This is enforced by
test_verify_spec.py, not by convention.
"""

from __future__ import annotations

import numpy as np


def saw_harmonics(f0: float, sr: float) -> tuple[np.ndarray, np.ndarray]:
    """Frequencies and normalised magnitudes of an ideal bandlimited sawtooth.

    A sawtooth has every harmonic with amplitude proportional to 1/k. Only partials
    strictly below Nyquist exist; anything measured elsewhere is alias, by definition.
    Magnitudes are normalised to the fundamental so the check is level-independent --
    a candidate must not be able to pass by being quiet.
    """
    nyq = sr / 2.0
    k = np.arange(1, int(np.floor(nyq / f0)) + 1)
    if k.size == 0:
        raise ValueError(f"f0={f0} has no partials below Nyquist at sr={sr}")
    return k * f0, 1.0 / k


def square_harmonics(f0: float, sr: float) -> tuple[np.ndarray, np.ndarray]:
    """Odd harmonics only, amplitude 1/k. Even harmonics are alias or asymmetry."""
    nyq = sr / 2.0
    k = np.arange(1, int(np.floor(nyq / f0)) + 1)
    k = k[k % 2 == 1]
    if k.size == 0:
        raise ValueError(f"f0={f0} has no partials below Nyquist at sr={sr}")
    return k * f0, 1.0 / k


PROTOTYPES = {"saw": saw_harmonics, "square": square_harmonics}


def ladder_magnitude(f: np.ndarray, fc: float, k: float = 0.0) -> np.ndarray:
    """Magnitude response of the 4-pole transistor-ladder analog prototype.

        H(s) = 1 / ((1 + s/wc)^4 + k)

    The reference the digital filter is required to match. Present now so the filter
    work at M2 has its answer key already written and reviewed, rather than being
    graded against whatever the implementation happens to produce.
    """
    s = 1j * (f / fc)
    return np.abs(1.0 / ((1.0 + s) ** 4 + k))
