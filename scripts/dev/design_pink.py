#!/usr/bin/env python3
"""Design the pink-noise shaping filter used by crates/dsp/src/osc.rs.

Pink noise is defined by an EQUATION -- power proportional to 1/f, i.e. exactly
-3.0103 dB per octave -- so it can be designed and graded the same way the half-band
decimator was, instead of pasting coefficients from a forum post and hoping.

The design is a cascade of one-pole/one-zero sections with poles and zeros interleaved
geometrically across the audio band. Each pole starts a -6 dB/oct fall and each zero
above it flattens the response back out; interleaving them so the response spends half
its time falling and half flat averages to the -3 dB/oct that 1/f requires. This is the
standard pole-zero placement for fractional-order responses (Smith, PASP -- an approved
reference in agentic-docs/licensing.md).

Section frequencies are then refined by coordinate descent against the analytic target,
minimising the WORST error over 20 Hz - 20 kHz rather than the average, because average
error hides a filter that is correct in the midrange and wrong at both ends -- and both
ends are where a listener notices, as rumble or as hiss.

    python3 scripts/dev/design_pink.py
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from design_halfband import halfband, N as HB_N, BETA as HB_BETA

# The filter runs INSIDE the voice's 2x oversampled loop, so it sees 96 kHz, not the
# output rate. Designing it at 48 kHz put every pole an octave too high.
SR_OUT = 48000.0
SR = SR_OUT * 2.0
N_SECTIONS = 5
F_LO, F_HI = 20.0, 20000.0
SLOPE_DB_PER_OCT = -10.0 * np.log10(2.0)      # -3.0103, from power ~ 1/f


def response_db(fp: np.ndarray, fz: np.ndarray, f: np.ndarray) -> np.ndarray:
    """Magnitude of the cascade, in dB, at frequencies f."""
    w = 2.0 * np.pi * f / SR
    ejw = np.exp(-1j * w)
    h = np.ones_like(ejw)
    for p, z in zip(fp, fz):
        h *= (1.0 - np.exp(-2.0 * np.pi * z / SR) * ejw) / \
             (1.0 - np.exp(-2.0 * np.pi * p / SR) * ejw)
    return 20.0 * np.log10(np.abs(h))


def worst_error(fp: np.ndarray, fz: np.ndarray, f: np.ndarray,
                target: np.ndarray) -> float:
    """Max |error| in dB after removing the free overall gain (a level, not a shape)."""
    got = response_db(fp, fz, f)
    return float(np.max(np.abs((got - got.mean()) - (target - target.mean()))))


def design() -> tuple[np.ndarray, np.ndarray, float, float]:
    f = np.geomspace(F_LO, F_HI, 512)
    target = SLOPE_DB_PER_OCT * np.log2(f / F_LO)

    # Start interleaved: poles spread over the band, each zero a fixed ratio above its
    # pole. sqrt of the section spacing puts the zero halfway (in log f) to the next
    # pole, which is the equal-time-falling/flat starting point.
    fp = np.geomspace(F_LO * 0.5, F_HI * 0.5, N_SECTIONS)
    fz = fp * np.sqrt(fp[1] / fp[0])

    # BOUNDS, and the reason for them. Left unconstrained, the optimiser drives the
    # lowest pole to 0 Hz -- which is mathematically right (1/f noise really does have
    # unbounded power at DC) and unusable in an audio path: a pole at DC is an
    # integrator, so the noise random-walks away from zero, eats headroom and thumps the
    # speaker. Real pink noise sources stop the slope somewhere below hearing. 8 Hz costs
    # accuracy only below 20 Hz, where the target is not audible anyway.
    P_MIN, F_MAX = 8.0, SR * 0.48

    best = worst_error(fp, fz, f, target)
    step = 0.30                                    # in log2 of frequency
    while step > 1e-4:
        improved = False
        for arr in (fp, fz):
            for i in range(N_SECTIONS):
                for direction in (+1.0, -1.0):
                    trial = arr[i]
                    moved = np.clip(trial * 2.0 ** (direction * step), P_MIN, F_MAX)
                    if moved == trial:
                        continue
                    arr[i] = moved
                    e = worst_error(fp, fz, f, target)
                    if e < best - 1e-9:
                        best, improved = e, True
                    else:
                        arr[i] = trial
        if not improved:
            step *= 0.5

    # Normalise so white and pink arrive at the OUTPUT at the same level: the colour
    # control must change the spectrum and not the level, or every A/B of it is really a
    # level test.
    #
    # This has to model the DECIMATOR, and that is the whole of a real defect the gate
    # caught twice. Normalising over the full oversampled band left pink 5.8 dB louder
    # than white, because discarding everything above 24 kHz costs flat white a full 3 dB
    # and costs pink -- which has almost nothing up there -- nearly nothing. Treating the
    # decimator as an ideal brickwall at 24 kHz got that to 3.1 dB and no further: the
    # real half-band has a transition band, so it does not remove the octave that the
    # brickwall model assumed it did. Weighting by the ACTUAL taps closes it.
    fs = np.linspace(1.0, SR / 2.0, 8192)
    hb = halfband(HB_N, HB_BETA)
    w = 2.0 * np.pi * fs / SR
    hb_mag2 = np.abs(sum(c * np.exp(-1j * w * k) for k, c in enumerate(hb))) ** 2
    pink_p = np.mean(10.0 ** (response_db(fp, fz, fs) / 10.0) * hb_mag2)
    white_p = np.mean(hb_mag2)
    return fp, fz, best, float(np.sqrt(white_p / pink_p))


if __name__ == "__main__":
    fp, fz, err, gain = design()
    f = np.geomspace(F_LO, F_HI, 512)
    got = response_db(fp, fz, f)
    got -= got[0]

    print(f"// GENERATED by scripts/dev/design_pink.py -- do not hand-edit.")
    print(f"// {N_SECTIONS} one-pole/one-zero sections, worst error {err:.2f} dB "
          f"over {F_LO:.0f} Hz - {F_HI/1000:.0f} kHz vs the analytic -3.01 dB/oct.")
    print("const PINK_POLE: [f32; %d] = [%s];" % (
        N_SECTIONS, ", ".join(f"{np.exp(-2*np.pi*p/SR):.9}" for p in fp)))
    print("const PINK_ZERO: [f32; %d] = [%s];" % (
        N_SECTIONS, ", ".join(f"{np.exp(-2*np.pi*z/SR):.9}" for z in fz)))
    print(f"const PINK_GAIN: f32 = {gain:.9};")
    print()
    print(f"poles (Hz): {', '.join(f'{p:.1f}' for p in fp)}")
    print(f"zeros (Hz): {', '.join(f'{z:.1f}' for z in fz)}")
    print(f"worst error over the band: {err:.3f} dB")
    for probe in (20.0, 100.0, 1000.0, 10000.0, 20000.0):
        want = SLOPE_DB_PER_OCT * np.log2(probe / F_LO)
        have = float(np.interp(probe, f, got))
        print(f"  {probe:8.0f} Hz   want {want:7.2f} dB   got {have:7.2f} dB")
