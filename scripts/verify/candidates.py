"""Oscillator implementations under test. Each returns samples and nothing else.

This module MUST NOT import prototypes or metrics. The thing being graded does not get
to see the answer key or compute its own score. test_verify_spec.py asserts this rather
than trusting it.

Two honest implementations and four cheats. The cheats are here because they were
written BEFORE any real DSP, per agentic-docs/design/2026-07-28-loop-evidence.md: every
gate has a degenerate optimum, and the only way to know a gate measures what you meant
is to build the thing that games it and watch it lose.
"""

from __future__ import annotations

import numpy as np

# The grid a lazy implementation would notice it is being tested on. Used only by the
# special-cased cheat, to prove the visible/hidden split catches exactly this.
_VISIBLE_HINT = (55.0, 110.0, 220.0, 440.0, 880.0, 1760.0)


def _phase(f0: float, sr: float, n: int) -> np.ndarray:
    return (np.arange(n) * (f0 / sr)) % 1.0


def _poly_blep(t: np.ndarray, dt: float) -> np.ndarray:
    """Second-order polynomial approximation to the bandlimited step residual."""
    out = np.zeros_like(t)
    rise = t < dt
    tr = t[rise] / dt
    out[rise] = tr + tr - tr * tr - 1.0
    fall = t > 1.0 - dt
    tf = (t[fall] - 1.0) / dt
    out[fall] = tf * tf + tf + tf + 1.0
    return out


# --- honest implementations -------------------------------------------------------

def naive_saw(f0: float, sr: float, n: int) -> np.ndarray:
    """A raw phase ramp. Correct in the limit, and audibly wrong at any real pitch --
    every harmonic above Nyquist folds back. Present as the negative control: if the
    alias gate does not reject this, the gate is not measuring anything."""
    return 2.0 * _phase(f0, sr, n) - 1.0


def polyblep_saw(f0: float, sr: float, n: int) -> np.ndarray:
    """The intended implementation: a phase ramp with the step discontinuity corrected."""
    t = _phase(f0, sr, n)
    return (2.0 * t - 1.0) - _poly_blep(t, f0 / sr)


# --- cheats: each must be REJECTED ------------------------------------------------

def cheat_silence(f0: float, sr: float, n: int) -> np.ndarray:
    """Perfect alias suppression. Perfect stability. No sound."""
    return np.zeros(n)


def cheat_pure_sine(f0: float, sr: float, n: int) -> np.ndarray:
    """Perfectly bandlimited, perfectly in tune, perfectly stable, and not a sawtooth.
    This is the cheat that alias-energy-alone cannot see, and the reason the harmonic
    error metric exists."""
    return np.sin(2.0 * np.pi * f0 * np.arange(n) / sr)


def cheat_brickwall(f0: float, sr: float, n: int) -> np.ndarray:
    """A sawtooth with everything above 4 kHz removed. Kills the alias energy and the
    instrument together -- the 'blur everything' cheat, in the spectral domain."""
    x = naive_saw(f0, sr, n)
    spec = np.fft.rfft(x)
    spec[np.fft.rfftfreq(n, 1.0 / sr) > 4000.0] = 0.0
    return np.fft.irfft(spec, n)


def cheat_special_cased(f0: float, sr: float, n: int) -> np.ndarray:
    """Correct on the frequencies it expects to be tested at, naive everywhere else.
    Invisible to any fixed grid; caught only by evaluating on a grid it has not seen."""
    if any(abs(f0 - v) < 0.5 for v in _VISIBLE_HINT):
        return polyblep_saw(f0, sr, n)
    return naive_saw(f0, sr, n)


HONEST = {"polyblep_saw": polyblep_saw}
NEGATIVE_CONTROL = {"naive_saw": naive_saw}
CHEATS = {
    "cheat_silence": cheat_silence,
    "cheat_pure_sine": cheat_pure_sine,
    "cheat_brickwall": cheat_brickwall,
    "cheat_special_cased": cheat_special_cased,
}
ALL = {**HONEST, **NEGATIVE_CONTROL, **CHEATS}
