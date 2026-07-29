#!/usr/bin/env python3
"""Propose a per-patch gain so the whole bank sits at one loudness.

The quality matrix requires matched loudness across a bank (audit-headroom): a user
switching patches must not have to ride the fader, and an A/B between two patches at
different levels measures the level, not the patch.

RMS alone is a poor proxy -- a sub-bass and a bright pluck at equal RMS are nowhere near
equally loud -- so the signal is K-weighted first, as BS.1770 does: a high-shelf plus a
high-pass, then mean square. This is a loudness ESTIMATE, not a certified LUFS meter, and
it is labelled as one.

    python3 scripts/dev/match_loudness.py            # report
    python3 scripts/dev/match_loudness.py --apply    # rewrite gains in presets.js
"""
import json
import math
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1].parent
# Target is the bank MEDIAN, not an absolute: this is a K-weighted estimate rather
# than a certified LUFS meter, so only the relative spread is meaningful.


def render_all() -> dict:
    out = subprocess.run(["node", "scripts/dev/render_patches.mjs"],
                         capture_output=True, text=True, cwd=ROOT, check=True)
    return json.loads(out.stdout)


def main() -> int:
    data = render_all()
    lus = sorted(d["lu"] for d in data.values() if math.isfinite(d["lu"]))
    target = lus[len(lus) // 2]
    print(f"target = bank median {target:.1f} LU (K-weighted estimate, gated)")
    print(f"spread before: {lus[-1] - lus[0]:.1f} dB\n")
    print(f"{'patch':16} {'now (LU)':>9} {'gain':>7} {'→ new gain':>11}")
    print("-" * 48)
    fixes = {}
    for name, d in sorted(data.items(), key=lambda kv: kv[1]["lu"]):
        lu, gain = d["lu"], d["gain"]
        if not math.isfinite(lu):
            print(f"{name:16} {'silent':>9}")
            continue
        adj = 10 ** ((target - lu) / 20.0)
        new = max(0.02, min(0.85, gain * adj))
        fixes[name] = round(new, 3)
        print(f"{name:16} {lu:9.1f} {gain:7.3f} {new:11.3f}")

    if "--apply" not in sys.argv:
        print("\n(report only; pass --apply to rewrite presets.js)")
        return 0

    p = ROOT / "packages/core/src/presets.js"
    src = p.read_text()
    for name, g in fixes.items():
        # Rewrite only the gain inside THIS patch's params block.
        pat = re.compile(r'("%s": \{.*?params: \{[^}]*?)gain: [0-9.]+' % re.escape(name),
                         re.S)
        src, n = pat.subn(lambda m: m.group(1) + f"gain: {g}", src, count=1)
        if n != 1:
            print(f"WARNING: could not rewrite gain for {name}", file=sys.stderr)
    p.write_text(src)
    print(f"\nrewrote {len(fixes)} gains in presets.js")
    return 0


if __name__ == "__main__":
    sys.exit(main())
