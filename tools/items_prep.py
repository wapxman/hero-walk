"""Иконки предметов из ChatGPT (три листа 4x4 на прозрачном фоне) -> ui/items.webp: 4 столбца x 12 строк по 128 px.
Каждая иконка вписывается в свою клетку по рамке непрозрачных пикселей.
usage: python tools/items_prep.py items_a.png items_b.png items_c.png"""
import sys, os
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C, PAD = 128, 6
out = Image.new("RGBA", (4 * C, 12 * C), (0, 0, 0, 0))
for s, path in enumerate(sys.argv[1:4]):
    im = Image.open(path).convert("RGBA"); cw, ch = im.width / 4, im.height / 4
    for i in range(16):
        cell = im.crop((round((i % 4) * cw), round((i // 4) * ch), round((i % 4 + 1) * cw), round((i // 4 + 1) * ch)))
        a = np.asarray(cell)[..., 3]; ys, xs = np.nonzero(a > 20)
        if not len(xs): continue
        cell = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
        k = (C - 2 * PAD) / max(cell.width, cell.height)
        cell = cell.resize((max(1, round(cell.width * k)), max(1, round(cell.height * k))), Image.LANCZOS)
        n = s * 16 + i
        out.paste(cell, ((n % 4) * C + (C - cell.width) // 2, (n // 4) * C + (C - cell.height) // 2), cell)
out.save(os.path.join(ROOT, "ui", "items.webp"), quality=90, method=6, alpha_quality=95)
print("ui/items.webp", out.size, os.path.getsize(os.path.join(ROOT, "ui", "items.webp")))
