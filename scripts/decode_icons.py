#!/usr/bin/env python3
"""Decode base64 icon files into PNG (run once after clone if PNGs missing)."""
import base64
from pathlib import Path
root = Path(__file__).resolve().parent.parent / "icons"
for p in sorted(root.glob("*.png.b64")):
    out = Path(str(p)[:-4]) if str(p).endswith(".b64") else p
    out.write_bytes(base64.b64decode(p.read_text().strip()))
    print("wrote", out)
