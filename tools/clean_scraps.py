"""Чистка листов злодеев от обрывков: в клетку иногда попадает верхушка соседнего кадра — отдельный кусок у нижнего края,
ниже линии ног. В игре такие куски мелькают под персонажем. Убираем отдельные куски (не связанные с фигурой), которые целиком
лежат ниже линии ног (foot − 6 % клетки) или касаются края клетки и меньше четверти фигуры.
usage: python tools/clean_scraps.py vl_mb_hydra_cast1 ...   (листы chars/src/<имя>.png, клетка — chars/src/lossless.json, ноги — chars/villains.json)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cells = json.load(open(os.path.join(ROOT, "chars", "src", "lossless.json"), encoding="utf-8"))
foot = {}
for v in json.load(open(os.path.join(ROOT, "chars", "villains.json"), encoding="utf-8")).values():
    for a in v["mul"].values(): foot[a["at"]] = a["foot"]
total = 0
for name in sys.argv[1:]:
    p = os.path.join(ROOT, "chars", "src", name + ".png"); c = cells[name]; ft = foot.get(name, c)
    a = np.array(Image.open(p).convert("RGBA")); n = 0
    for r in range(a.shape[0] // c):
        for f in range(a.shape[1] // c):
            cell = a[r * c:(r + 1) * c, f * c:(f + 1) * c]; al = cell[..., 3] > 24
            if not al.any(): continue
            lab, k = ndimage.label(al, structure=np.ones((3, 3)))
            if k < 2: continue
            sizes = ndimage.sum(al, lab, range(1, k + 1)); big = int(np.argmax(sizes)) + 1
            for i in range(1, k + 1):
                if i == big: continue
                ys, xs = np.nonzero(lab == i)
                edge = ys.min() == 0 or ys.max() == c - 1 or xs.min() == 0 or xs.max() == c - 1
                if ys.min() > ft - 0.06 * c or (edge and sizes[i - 1] < 0.25 * sizes[big - 1]):
                    cell[lab == i] = 0; n += 1
    if n: Image.fromarray(a).save(p); print(name, "убрано кусков:", n)
    total += n
print("всего", total)
