#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate colorful spider-web icons into ../icons/ (no external files needed)."""
import struct, zlib, math
from pathlib import Path

def chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

def write_png(path, width, height, rgba_func):
    raw = bytearray()
    for y in range(height):
        raw.append(0)
        for x in range(width):
            r, g, b, a = rgba_func(x, y, width, height)
            raw.extend((
                max(0, min(255, int(r))),
                max(0, min(255, int(g))),
                max(0, min(255, int(b))),
                max(0, min(255, int(a))),
            ))
    data = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(data)
    return len(data)

def blend(c1, c2, t):
    return tuple(c1[i] * (1 - t) + c2[i] * t for i in range(4))

def icon_pixel(x, y, w, h):
    cx, cy = (w - 1) / 2, (h - 1) / 2
    px = (x - cx) / (w * 0.45)
    py = (y - cy) / (h * 0.45)
    r = math.hypot(px, py)
    ang = math.atan2(py, px)
    if r > 1.05:
        return (0, 0, 0, 0)
    bg1, bg2, bg3 = (15, 23, 42, 255), (30, 27, 75, 255), (76, 29, 149, 255)
    t = min(1.0, r)
    base = blend(bg2, bg1, t * 2) if t < 0.5 else blend(bg2, bg3, (t - 0.5) * 2)
    if r > 0.92:
        base = blend(base, (0, 0, 0, 0), min(1, (r - 0.92) / 0.13))
    cyan, violet, pink, green = (34, 211, 238, 255), (167, 139, 250, 255), (244, 114, 182, 255), (52, 211, 153, 255)

    def line_color(a):
        k = (a / math.pi + 1) / 2
        if k < 0.25:
            return blend(cyan, violet, k * 4)
        if k < 0.5:
            return blend(violet, pink, (k - 0.25) * 4)
        if k < 0.75:
            return blend(pink, green, (k - 0.5) * 4)
        return blend(green, cyan, (k - 0.75) * 4)

    col = list(base)
    n_spokes = 8
    for i in range(n_spokes):
        target = -math.pi + i * (2 * math.pi / n_spokes)
        da = abs((ang - target + math.pi) % (2 * math.pi) - math.pi)
        thickness = 0.045 if w >= 48 else 0.07
        if da < thickness and r < 0.95:
            strength = (1 - da / thickness) * 0.9
            lc = line_color(target)
            for j in range(3):
                col[j] = col[j] * (1 - strength) + lc[j] * strength
            col[3] = max(col[3], 255 * strength)
    for ring in (0.28, 0.52, 0.78):
        dr = abs(r - ring)
        thickness = 0.04 if w >= 48 else 0.06
        if dr < thickness:
            strength = (1 - dr / thickness) * 0.85
            lc = line_color(ang + ring)
            for j in range(3):
                col[j] = col[j] * (1 - strength) + lc[j] * strength
            col[3] = max(col[3], 255 * strength)
    for i in range(n_spokes):
        a = -math.pi + i * (2 * math.pi / n_spokes)
        for ring in (0.28, 0.52, 0.78):
            nx, ny = math.cos(a) * ring, math.sin(a) * ring
            d = math.hypot(px - nx, py - ny)
            nr = 0.06 if w >= 48 else 0.09
            if d < nr:
                strength = 1 - d / nr
                node = blend(cyan, pink, (i % 4) / 3)
                for j in range(3):
                    col[j] = col[j] * (1 - strength) + node[j] * strength
                col[3] = max(col[3], 255)
    if r < 0.12:
        strength = 1 - r / 0.12
        for j in range(3):
            col[j] = col[j] * (1 - strength * 0.9) + 255 * strength * 0.9
        col[3] = max(col[3], 255)
    return tuple(col)

def main():
    root = Path(__file__).resolve().parent.parent / "icons"
    root.mkdir(parents=True, exist_ok=True)
    for size in (16, 32, 48, 128):
        n = write_png(root / f"icon{size}.png", size, size, icon_pixel)
        print(f"wrote icons/icon{size}.png ({n} bytes)")
    print("Done. Reload the extension in chrome://extensions/")

if __name__ == "__main__":
    main()
