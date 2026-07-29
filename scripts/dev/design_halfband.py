#!/usr/bin/env python3
"""Generate the half-band decimator coefficients used by crates/dsp/src/filter.rs.

Hand-typed filter coefficients are how the first attempt shipped a decimator whose taps
summed to 0.387 instead of 1.0 -- it attenuated by 2.2 dB and filtered almost nothing,
and it made the alias figure WORSE than no oversampling at all. The taps are computed
here and pasted as a block, so the design and the code cannot disagree.

    python3 scripts/dev/design_halfband.py
"""
import numpy as np

N, BETA = 23, 8.0


def halfband(n_taps: int, beta: float) -> np.ndarray:
    m = n_taps // 2
    n = np.arange(-m, m + 1)
    h = 0.5 * np.sinc(n / 2.0) * np.kaiser(n_taps, beta)
    h[np.abs(n) % 2 == 0] = 0.0     # even offsets vanish by construction
    h[m] = 0.5
    return h / h.sum()              # unity DC gain, or the whole voice gets quieter


if __name__ == "__main__":
    h = halfband(N, BETA)
    H = 20 * np.log10(np.maximum(np.abs(np.fft.rfft(h, 16384))[:8192], 1e-12))
    w = np.linspace(0, 1, 8192)
    print(f"// N={N} Kaiser beta={BETA}, sum={h.sum():.6f}")
    print(f"// passband ripple <= {abs(H[w < 0.35]).max():.2f} dB, "
          f"stopband <= {H[w > 0.70].max():.1f} dB above 0.70 Nyquist")
    print(f"const HB_LEN: usize = {N};")
    print("const HB: [f32; %d] = [" % N)
    for v in h:
        print(f"    {v:.10}," if v else "    0.0,")
    print("];")
