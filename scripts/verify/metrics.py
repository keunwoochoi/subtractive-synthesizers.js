"""Measurements the harness computes. Candidates supply a buffer and nothing else.

Every number in this project is produced here, from samples. A candidate never reports
its own score -- that is the rule that stops the whole class of failure where an agent
overwrites the timer, returns the reference, or prints a number nobody computed.

Two metrics, deliberately paired:

  alias_db          how much energy sits where no partial should be
  harmonic_err_db   how far the partials that SHOULD be there are from the prototype

Neither is sufficient alone, and that is the point. Silence has perfect alias
suppression. So does a pure sine. So does a sawtooth brickwalled at 8 kHz. Gating on
alias alone rewards every one of them -- the search would find the thing the metric
cannot see. The pair is what makes "alias-free because bandlimited correctly"
distinguishable from "alias-free because there is nothing there."
"""

from __future__ import annotations

import numpy as np

from prototypes import PROTOTYPES

# Analysis window. Blackman-Harris: ~ -92 dB sidelobes, so leakage from a strong
# fundamental cannot masquerade as alias energy in a neighbouring bin.
_BIN_HALFWIDTH = 4  # bins claimed by each partial, either side


def _spectrum(x: np.ndarray, sr: float) -> tuple[np.ndarray, np.ndarray]:
    n = len(x)
    w = np.blackman(n)
    mag = np.abs(np.fft.rfft(x * w))
    freqs = np.fft.rfftfreq(n, 1.0 / sr)
    return freqs, mag


def measure(x: np.ndarray, f0: float, sr: float, shape: str = "saw") -> dict:
    """Grade one rendered buffer against its analytic prototype."""
    out: dict = {}

    finite = np.isfinite(x)
    out["nonfinite"] = int((~finite).sum())
    if out["nonfinite"]:
        # A NaN buffer cannot be spectrally analysed, and must never be scored as
        # "no alias energy" -- the circle-packing NaN exploit is exactly that mistake.
        out.update(peak=float("nan"), rms=float("nan"),
                   alias_db=float("inf"), harmonic_err_db=float("inf"),
                   tuning_cents=float("inf"), n_partials=0)
        return out

    out["peak"] = float(np.max(np.abs(x))) if x.size else 0.0
    out["rms"] = float(np.sqrt(np.mean(x ** 2))) if x.size else 0.0

    freqs, mag = _spectrum(x, sr)
    total = float(np.sum(mag ** 2))
    if total <= 0.0:
        # Digital silence. Report it as maximally wrong on both axes rather than
        # letting a zero numerator read as a perfect score.
        out.update(alias_db=float("inf"), harmonic_err_db=float("inf"),
                   tuning_cents=float("inf"), n_partials=0)
        return out

    h_freqs, h_amps = PROTOTYPES[shape](f0, sr)
    bin_hz = sr / len(x)

    claimed = np.zeros(len(freqs), dtype=bool)
    claimed[: int(np.ceil(20.0 / bin_hz))] = True  # DC and sub-audio: not alias
    measured = np.zeros(len(h_freqs))

    for i, hf in enumerate(h_freqs):
        c = int(round(hf / bin_hz))
        lo, hi = max(0, c - _BIN_HALFWIDTH), min(len(freqs), c + _BIN_HALFWIDTH + 1)
        if lo >= hi:
            continue
        claimed[lo:hi] = True
        measured[i] = float(np.max(mag[lo:hi]))

    alias_energy = float(np.sum(mag[~claimed] ** 2))
    out["alias_db"] = 10.0 * np.log10(max(alias_energy, 1e-30) / total)

    # Harmonic structure, normalised to the fundamental so level cannot buy a pass.
    if measured[0] <= 0.0:
        out["harmonic_err_db"] = float("inf")
        out["n_partials"] = 0
    else:
        got = measured / measured[0]
        want = h_amps / h_amps[0]
        # Floor at -80 dB: a missing partial reads as absent, not as -inf.
        got_db = 20.0 * np.log10(np.maximum(got, 1e-4))
        want_db = 20.0 * np.log10(np.maximum(want, 1e-4))
        out["harmonic_err_db"] = float(np.sqrt(np.mean((got_db - want_db) ** 2)))
        out["n_partials"] = int(np.sum(got > 10 ** (-40 / 20)))

    # Tuning. Raw bin-argmax is not good enough: at 0.5 s the bin is 2 Hz, which at
    # f0=40 Hz is 86 cents of quantisation. The first run reported ~11.9 cents for
    # EVERY candidate including a pure sine -- a constant that large, identical across
    # implementations, is the signature of a broken measurement rather than a broken
    # oscillator. Parabolic interpolation over the log-magnitude peak recovers sub-bin
    # precision and makes the number mean what it claims.
    c = int(round(f0 / bin_hz))
    lo, hi = max(0, c - 8), min(len(freqs), c + 9)
    if hi > lo and np.max(mag[lo:hi]) > 0:
        k = lo + int(np.argmax(mag[lo:hi]))
        if 0 < k < len(mag) - 1:
            a, b, g = (float(np.log(max(mag[k + d], 1e-30))) for d in (-1, 0, 1))
            denom = a - 2.0 * b + g
            delta = 0.5 * (a - g) / denom if abs(denom) > 1e-30 else 0.0
            delta = float(np.clip(delta, -0.5, 0.5))
        else:
            delta = 0.0
        peak_f = (k + delta) * bin_hz
        out["tuning_cents"] = abs(1200.0 * np.log2(max(peak_f, 1e-9) / f0))
    else:
        out["tuning_cents"] = float("inf")

    return out
