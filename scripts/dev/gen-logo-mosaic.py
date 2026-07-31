#!/usr/bin/env python3
"""Generate assets/logo/logo.svg — a rounded-square-tile mosaic of the favicon.

The favicon SVG stays the single owner of the mark; this script derives the
logo from it by sampling a 24x24 grid and snapping every tile to a fixed
three-tone steel palette (plus a lifted plate tone), so the logo reads as
deliberate pixel art rather than a blurry downscale.

Requires rsvg-convert (brew install librsvg) and ImageMagick (brew install
imagemagick). Stdlib-only Python.
"""
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FAVICON = ROOT / "apps/playground/favicon.svg"          # source mark (input)
OUT = ROOT / "assets/logo/logo.svg"
FAVICON_OUT = ROOT / "apps/playground/favicon-pixel.svg"  # generated pixel-art favicon

GRID = 24            # tiles across
TILE_FRAC = 0.80     # tile side as a fraction of grid pitch (rest is grout)
CORNER_FRAC = 0.26   # tile corner radius as a fraction of tile side
PLATE = (18, 21, 28)         # favicon plate #12151c
PLATE_TILE = (34, 40, 54)    # lifted so the tile texture reads against grout
GROUT = "#0b0d11"
FIT_SCALE = 1.2      # enlarge the mark about plate center; see comment in main()
PLATE_RX = 15.0      # plate corner radius, favicon units (matches favicon and grout rect)


def cell_on_plate(i, j, pitch):
    """Whole grid cell inside the rounded plate — not just the cell center.

    Presence by center-alpha alone lets a tile straddle the plate's corner
    arc: the center clears the alpha threshold while the tile's outer half
    pokes past the curve, leaving stray nubs outside the silhouette. Tiles
    are drawn unclipped, so the cell must fit entirely inside the rx-15
    rounded rect; testing the cell (not the smaller tile) keeps the
    full-bleed favicon pixels inside their rounded plate too.
    """
    x0, y0 = i * pitch, j * pitch
    for x, y in ((x0, y0), (x0 + pitch, y0), (x0, y0 + pitch), (x0 + pitch, y0 + pitch)):
        dx = max(PLATE_RX - x, x - (64.0 - PLATE_RX), 0.0)
        dy = max(PLATE_RX - y, y - (64.0 - PLATE_RX), 0.0)
        if dx * dx + dy * dy > PLATE_RX * PLATE_RX:
            return False
    return True


def snap(c):
    """Fixed palette: steel-blue hues -> 3 metallic tones, else plate tone."""
    lum = 0.30 * c[0] + 0.59 * c[1] + 0.11 * c[2]
    if c[2] - c[0] > 14 and lum > 50:
        if lum >= 180:
            return (214, 232, 247)
        if lum >= 110:
            return (150, 183, 214)
        return (90, 128, 168)
    return PLATE_TILE


def load_raster():
    """Favicon -> 128x128 RGBA grid via rsvg-convert + magick txt dump."""
    with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
        subprocess.run(
            ["rsvg-convert", "-w", "512", "-h", "512", str(FAVICON), "-o", tmp.name],
            check=True,
        )
        txt = subprocess.run(
            ["magick", tmp.name, "-resize", "128x128", "-depth", "8", "txt:-"],
            check=True, capture_output=True, text=True,
        ).stdout
    px = [[(0, 0, 0, 0)] * 128 for _ in range(128)]
    pat = re.compile(r"^(\d+),(\d+):\s+\((\d+),(\d+),(\d+),(\d+)\)")
    for line in txt.splitlines():
        m = pat.match(line)
        if m:
            x, y, r, g, b, a = map(int, m.groups())
            px[y][x] = (r, g, b, a)
    return px


def sample(px, fx, fy, win):
    """Alpha-weighted mean around favicon-space coords (0..64; raster 2px/unit)."""
    cx, cy = int(round(fx * 2)), int(round(fy * 2))
    rs = gs = bs = as_ = n = 0
    for dy in range(-win, win + 1):
        for dx in range(-win, win + 1):
            x, y = cx + dx, cy + dy
            if 0 <= x < 128 and 0 <= y < 128:
                r, g, b, a = px[y][x]
                rs += r * a
                gs += g * a
                bs += b * a
                as_ += a
                n += 1
    if n == 0 or as_ == 0:
        return (0, 0, 0, 0)
    return (rs // as_, gs // as_, bs // as_, as_ // n)


def main():
    px = load_raster()
    pitch = 64.0 / GRID
    side = pitch * TILE_FRAC
    win = max(1, int(side * 0.55))
    tiles = []  # (i, j, (r, g, b))
    for j in range(GRID):
        for i in range(GRID):
            cx, cy = (i + 0.5) * pitch, (j + 0.5) * pitch
            # The [-] glyph is mirror-symmetric both ways, but raster
            # antialiasing, rounding, and the fit transform all flip
            # threshold tiles differently on each side. Rather than hoping
            # mirrored samples agree, compute everything from the canonical
            # quadrant (i, j folded into the top-left) so symmetry holds by
            # construction: presence and membership are quadrant-decided;
            # tone re-samples at the tile's own row so the vertical steel
            # gradient still reads.
            ci, cj = min(i, GRID - 1 - i), min(j, GRID - 1 - j)
            qx, qy = (ci + 0.5) * pitch, (cj + 0.5) * pitch
            if not cell_on_plate(i, j, pitch):
                continue  # cell would poke past the plate's corner arc
            if sample(px, qx, qy, win)[3] < 150:
                continue  # outside the rounded plate corners
            # The favicon composes [-] for a tiny square with generous air;
            # at logo size that reads as wasted margin, so color samples look
            # at the favicon enlarged FIT_SCALE-x about the plate center
            # (~4 tiles of margin down to ~3). Presence above still follows
            # the unzoomed alpha, so the plate silhouette is unchanged.
            fx = 32.0 + (qx - 32.0) / FIT_SCALE
            fyq = 32.0 + (qy - 32.0) / FIT_SCALE
            fy = 32.0 + ((j + 0.5) * pitch - 32.0) / FIT_SCALE
            cq = sample(px, fx, fyq, win)      # canonical quadrant: membership
            crow = sample(px, fx, fy, win)     # same column, own row: tone
            if snap(cq) == PLATE_TILE:
                color = PLATE_TILE
            else:
                glyph = snap(crow)
                color = glyph if glyph != PLATE_TILE else snap(cq)
            tiles.append((i, j, color))

    # The mosaic logo: rounded tiles with grout gaps.
    parts = [
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">',
        f'<rect width="64" height="64" rx="15" fill="{GROUT}"/>',
    ]
    for i, j, (r, g, b) in tiles:
        cx, cy = (i + 0.5) * pitch, (j + 0.5) * pitch
        parts.append(
            f'<rect x="{cx - side / 2:.2f}" y="{cy - side / 2:.2f}" '
            f'width="{side:.2f}" height="{side:.2f}" rx="{side * CORNER_FRAC:.2f}" '
            f'fill="#{r:02x}{g:02x}{b:02x}"/>'
        )
    parts.append("</svg>")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("\n".join(parts) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)} ({GRID}x{GRID} grid)")

    # The favicon: the same tile grid as true pixel art - one full-bleed hard
    # pixel per tile, no grout, no corner rounding - so the tab icon matches
    # the mosaic logo instead of being a blurry miniature of it.
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}" '
        'shape-rendering="crispEdges">',
        f'<rect width="{GRID}" height="{GRID}" rx="{GRID * 15 / 64:.2f}" fill="{GROUT}"/>',
    ]
    for i, j, (r, g, b) in tiles:
        parts.append(f'<rect x="{i}" y="{j}" width="1" height="1" fill="#{r:02x}{g:02x}{b:02x}"/>')
    parts.append("</svg>")
    FAVICON_OUT.write_text("\n".join(parts) + "\n")
    print(f"wrote {FAVICON_OUT.relative_to(ROOT)} ({GRID}x{GRID} px)")


if __name__ == "__main__":
    sys.exit(main())
