#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Decode icons/*.png.b64 into icons/*.png (with padding fix)."""
import base64
from pathlib import Path

def fix_b64(s: str) -> str:
    s = "".join(s.split())  # remove all whitespace
    s += "=" * (-len(s) % 4)
    return s

def main():
    root = Path(__file__).resolve().parent.parent / "icons"
    root.mkdir(parents=True, exist_ok=True)
    files = sorted(root.glob("*.png.b64"))
    if not files:
        print("No *.png.b64 found under icons/. Use write_icons.py instead.")
        return
    for p in files:
        out = Path(str(p)[:-4])  # strip .b64
        data = base64.b64decode(fix_b64(p.read_text(encoding="utf-8")))
        out.write_bytes(data)
        print(f"wrote {out} ({len(data)} bytes)")

if __name__ == "__main__":
    main()
