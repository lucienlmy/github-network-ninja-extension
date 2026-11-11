#!/usr/bin/env python3
"""Generate minimal PNG icons for Tauri bundle."""
import struct, zlib
from pathlib import Path

def write_png(path: Path, w: int, h: int, rgba=(9, 105, 218, 255)):
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )

    r, g, b, a = rgba
    raw = b""
    for y in range(h):
        raw += b"\x00"
        for x in range(w):
            cx, cy = w / 2, h / 2
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < min(w, h) * 0.4:
                raw += bytes([r, g, b, a])
            else:
                raw += bytes([246, 248, 250, 255])
    data = chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    data += chunk(b"IDAT", zlib.compress(raw, 9))
    data += chunk(b"IEND", b"")
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + data)

def main():
    icons = Path(__file__).resolve().parents[1] / "src-tauri" / "icons"
    icons.mkdir(parents=True, exist_ok=True)
    write_png(icons / "32x32.png", 32, 32)
    write_png(icons / "128x128.png", 128, 128)
    write_png(icons / "128x128@2x.png", 256, 256)
    write_png(icons / "icon.png", 512, 512)
    print("icons written to", icons)

if __name__ == "__main__":
    main()
