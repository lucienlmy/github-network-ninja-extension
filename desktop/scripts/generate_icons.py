#!/usr/bin/env python3
"""Generate PNG / ICO / ICNS icons for Tauri (Windows requires icon.ico)."""
from __future__ import annotations

import struct
import zlib
from pathlib import Path


def png_bytes(w: int, h: int, rgba=(9, 105, 218, 255)) -> bytes:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    r, g, b, a = rgba
    cx, cy = w / 2, h / 2
    rad = min(w, h) * 0.4
    rows = []
    for y in range(h):
        row = bytearray([0])
        for x in range(w):
            if ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 < rad:
                row.extend((r, g, b, a))
            else:
                row.extend((246, 248, 250, 255))
        rows.append(bytes(row))
    raw = b"".join(rows)
    data = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 6))
    data += chunk(b"IEND", b"")
    return b"\x89PNG\r\n\x1a\n" + data


def write_png(path: Path, w: int, h: int) -> None:
    path.write_bytes(png_bytes(w, h))


def write_ico(path: Path, sizes=(16, 32, 48, 256)) -> None:
    images = [(s, png_bytes(s, s)) for s in sizes]
    count = len(images)
    offset = 6 + 16 * count
    out = struct.pack("<HHH", 0, 1, count)
    data = b""
    for s, png in images:
        wb = 0 if s >= 256 else s
        hb = 0 if s >= 256 else s
        out += struct.pack("<BBBBHHII", wb, hb, 0, 0, 1, 32, len(png), offset)
        data += png
        offset += len(png)
    path.write_bytes(out + data)


def write_icns(path: Path) -> None:
    png = png_bytes(512, 512)
    icon = b"ic09" + struct.pack(">I", len(png) + 8) + png
    path.write_bytes(b"icns" + struct.pack(">I", len(icon) + 8) + icon)


def main() -> None:
    icons = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    write_png(icons / "32x32.png", 32, 32)
    write_png(icons / "128x128.png", 128, 128)
    write_png(icons / "128x128@2x.png", 256, 256)
    write_png(icons / "icon.png", 512, 512)
    write_ico(icons / "icon.ico")
    write_icns(icons / "icon.icns")
    print("icons written to", icons)
    for p in sorted(icons.iterdir()):
        if p.is_file():
            print(" ", p.name, p.stat().st_size)


if __name__ == "__main__":
    main()
