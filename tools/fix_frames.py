"""Покадровая правка листов мини-боссов: в отдельных кадрах фигура нарисована мельче и выше линии ног (дефект генерации),
а под ней лежит обрывок чужого кадра. Кадр считается битым, если низ фигуры выше ног больше чем на 8 % клетки И фигура
ниже 80 % обычного роста в этом ряду (настоящий прыжок рост сохраняет — его не трогаем). Битый кадр: убираем куски под
фигурой, увеличиваем фигуру до обычного роста ряда (не больше ×2) и ставим на линию ног.
usage: python tools/fix_frames.py   (все vl_mb_*; печатает имена исправленных листов — их перепаковать pack_chars.py)"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = json.load(open(os.path.join(ROOT, "chars", "villains.json"), encoding="utf-8"))
C = json.load(open(os.path.join(ROOT, "chars", "src", "lossless.json"), encoding="utf-8"))
done = []
for vid, v in V.items():
    if not vid.startswith("mb_"): continue
    for an, a in v["mul"].items():
        if a["rows"] < 2: continue
        c, foot, p = C[a["at"]], a["foot"], os.path.join(ROOT, "chars", "src", a["at"] + ".png")
        im = Image.open(p).convert("RGBA"); arr = np.array(im); n = 0
        info = {}
        for r in range(a["rows"]):
            for f in range(a["n"]):
                al = arr[r * c:(r + 1) * c, f * c:(f + 1) * c, 3] > 40
                if not al.any(): continue
                lab, k = ndimage.label(al, structure=np.ones((3, 3)))
                sizes = ndimage.sum(al, lab, range(1, k + 1)); big = int(np.argmax(sizes)) + 1
                ys, xs = np.nonzero(lab == big)
                info[(r, f)] = (lab, big, xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
        for r in range(a["rows"]):
            fr = [info[(r, f)] for f in range(a["n"]) if (r, f) in info]
            good = [i[5] - i[3] for i in fr if i[5] >= foot - 0.08 * c]
            if not good: good = [i[5] - i[3] for i in info.values() if i[5] >= foot - 0.08 * c]
            if not good: continue
            ref = float(np.median(good))
            for f in range(a["n"]):
                if (r, f) not in info: continue
                lab, big, x0, y0, x1, y1 = info[(r, f)]
                if not (y1 < foot - 0.08 * c and (y1 - y0) < 0.8 * ref): continue
                cell = arr[r * c:(r + 1) * c, f * c:(f + 1) * c]
                keep = cell.copy(); ly, lx = np.nonzero((lab != big) & (lab > 0))
                # куски под фигурой — обрывки; искры рядом с фигурой оставляем
                for i in np.unique(lab[(lab != big) & (lab > 0)]):
                    yy = np.nonzero(lab == i)[0]
                    if yy.min() > y1 - 4: keep[lab == i] = 0
                ys, xs = np.nonzero(keep[..., 3] > 40); bx0, by0, bx1, by1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
                k = float(min(2.0, max(1.0, ref / (y1 - y0))))
                part = Image.fromarray(keep[by0:by1, bx0:bx1])
                w, h = max(1, round(part.width * k)), max(1, round(part.height * k))
                if h > foot: s2 = foot / h; w, h = max(1, round(w * s2)), foot
                if w > c: s2 = c / w; w, h = c, max(1, round(h * s2))
                part = part.resize((w, h), Image.LANCZOS)
                out = Image.new("RGBA", (c, c), (0, 0, 0, 0))
                nx = int(min(max(0, round((bx0 + bx1) / 2 - w / 2)), c - w))
                out.paste(part, (nx, max(0, foot - h)))
                arr[r * c:(r + 1) * c, f * c:(f + 1) * c] = np.array(out); n += 1
        if n: Image.fromarray(arr).save(p); done.append(a["at"]); print(a["at"], "кадров:", n, file=sys.stderr)
print(" ".join(done))
