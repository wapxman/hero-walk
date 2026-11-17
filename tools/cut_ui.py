"""Нарезка набора интерфейса из ChatGPT (прозрачный фон): каждый отдельный элемент -> ui/h_<имя>.webp.
Элементы находятся по непрозрачным пятнам и нумеруются сверху вниз, слева направо (ряды — по центру по высоте).
usage: python tools/cut_ui.py <kit.png> имя:макс_ширина имя:макс_ширина ...
Печатает размеры и, для рамок, внутреннее тёмное поле (куда кладётся полоска или текст)."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
im = Image.open(sys.argv[1]).convert("RGBA")
names = [a.split(":") for a in sys.argv[2:]]
a = np.asarray(im)[..., 3] > 24
lab, n = ndimage.label(ndimage.binary_closing(a, iterations=3))
boxes = []
for i, sl in enumerate(ndimage.find_objects(lab)):
    ys, xs = sl
    if (ys.stop - ys.start) * (xs.stop - xs.start) < 3000:
        continue
    boxes.append((xs.start, ys.start, xs.stop, ys.stop))
# ряды: элементы, чьи центры по высоте ближе 60 пикселей, считаются одним рядом
boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
rows = []
for b in boxes:
    cy = (b[1] + b[3]) / 2
    if rows and abs(cy - rows[-1][0]) < 60:
        rows[-1][1].append(b)
    else:
        rows.append([cy, [b]])
order = [b for _, r in rows for b in sorted(r, key=lambda b: b[0])]
print(len(order), "элементов")
for (nm, mw), b in zip(names, order):
    x0, y0, x1, y1 = b
    piece = im.crop((max(0, x0 - 2), max(0, y0 - 2), min(im.width, x1 + 2), min(im.height, y1 + 2)))
    mw = int(mw)
    if piece.width > mw:
        piece = piece.resize((mw, round(piece.height * mw / piece.width)), Image.LANCZOS)
    piece.save(os.path.join(ROOT, "ui", "h_" + nm + ".webp"), quality=90, method=6, alpha_quality=95)
    print(nm, b, "->", piece.size)
