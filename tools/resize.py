#!/usr/bin/env python
"""把参考图压到生3D 能接受的大小。

生3D 接口对 ImageBase64 有 6 MB 上限，而 Seedream 出的是 2K PNG（约 4.5–5 MB），
base64 之后会膨胀 33% 直接超限。这个脚本压到指定最长边 + JPEG 质量，
再铺一层纯白底（透明背景也能吃）。

用法：
  python tools/resize.py <输入> <输出> [最长边=1024] [JPEG质量=90]
"""
import os
import sys
from pathlib import Path

from PIL import Image


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 1
    src, dst = Path(sys.argv[1]), Path(sys.argv[2])
    max_side = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
    quality = int(sys.argv[4]) if len(sys.argv) > 4 else 90

    im = Image.open(src)
    im = im.convert("RGBA")
    flat = Image.new("RGB", im.size, (255, 255, 255))
    flat.paste(im, mask=im.split()[3])

    w, h = flat.size
    k = min(1.0, max_side / max(w, h))
    if k < 1.0:
        flat = flat.resize((round(w * k), round(h * k)), Image.LANCZOS)

    dst.parent.mkdir(parents=True, exist_ok=True)
    flat.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)

    kb = os.path.getsize(dst) / 1024
    print(f"{dst}  {flat.size[0]}x{flat.size[1]}  {kb:.0f} KB  (base64 约 {kb * 1.34:.0f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
