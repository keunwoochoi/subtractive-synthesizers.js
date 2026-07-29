#!/usr/bin/env python3
"""Report gzipped size reproducibly, on any platform.

`gzip -9` is not one program. macOS ships a BSD gzip and Linux ships GNU gzip, and the
two produce different output SIZES for identical input -- measured 2026-07-28 on this
repo's own artifacts: 26,235 B locally against 26,019 B on ubuntu-24.04, a 216 B spread
on a 26 KB payload. The published bundle number was therefore not reproducible, and the
generated-docs check failed on CI for a reason that had nothing to do with the code.

Python's zlib is one implementation everywhere, and mtime=0 removes the timestamp that
would otherwise make even the same implementation non-deterministic between runs.

    python3 scripts/audit/gzsize.py FILE...
"""
import gzip
import sys
from pathlib import Path


def gz_size(p: Path) -> int:
    return len(gzip.compress(p.read_bytes(), compresslevel=9, mtime=0))


if __name__ == "__main__":
    for a in sys.argv[1:]:
        print(gz_size(Path(a)))
