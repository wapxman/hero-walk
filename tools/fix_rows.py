"""Правка листов злодеев: в некоторых рядах-направлениях фигура нарисована мельче и выше линии ног, чем в остальных
(дефект генерации — в игре персонаж в этих направлениях «подпрыгивал» и съёживался). Такие ряды (низ фигуры выше ног
больше чем на 8 % клетки) ставим на линию ног и увеличиваем до роста остальных рядов (не больше ×2).
usage: python tools/fix_rows.py            (все vl_mb_*; печатает исправленные листы — их потом перепаковать pack_chars.py)"""
import json, os, sys
import numpy as np
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = json.load(open(os.path.join(ROOT, "chars", "villains.json"), encoding="utf-8"))
C = json.load(open(os.path.join(ROOT, "chars", "src", "lossless.json"), encoding="utf-8"))
done = []
for vid, v in V.items():
    if not vid.startswith("mb_"): continue
    for an, a in v["mul"].items():
        if a["rows"] != 8: continue
        c, foot, p = C[a["at"]], a["foot"], os.path.join(ROOT, "chars", "src", a["at"] + ".png")
        im = Image.open(p).convert("RGBA"); al = np.asarray(im)[..., 3]
        box = lambda r, f: (lambda ys, xs: None if not len(ys) else (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))(*np.nonzero(al[r * c:(r + 1) * c, f * c:(f + 1) * c] > 40))
        B = [[box(r, f) for f in range(a["n"])] for r in range(8)]
        bot = [np.median([b[3] for b in B[r] if b]) for r in range(8)]; hgt = [np.median([b[3] - b[1] for b in B[r] if b]) for r in range(8)]
        badrows = [r for r in range(8) if bot[r] - foot < -0.08 * c]
        if not badrows: continue
        good = np.median([hgt[r] for r in range(8) if r not in badrows])
        for r in badrows:
            k = float(min(2.0, max(1.0, good / hgt[r])))
            for f in range(a["n"]):
                b = B[r][f]
                if not b: continue
                x0, y0 = f * c, r * c
                fr = im.crop((x0 + b[0], y0 + b[1], x0 + b[2], y0 + b[3]))
                w, h = max(1, round(fr.width * k)), max(1, round(fr.height * k))
                if h > foot: k2 = foot / h; w, h = max(1, round(w * k2)), foot
                w = min(w, c)
                fr = fr.resize((w, h), Image.LANCZOS)
                cx = (b[0] + b[2]) / 2; nx = int(min(max(0, round(cx - w / 2)), c - w))
                im.paste(Image.new("RGBA", (c, c), (0, 0, 0, 0)), (x0, y0))
                im.paste(fr, (x0 + nx, y0 + foot - h - (foot - b[3] if abs(b[3] - bot[r]) > 0.05 * c and b[3] < bot[r] else 0) * 0))
        im.save(p); done.append(a["at"]); print(a["at"], "ряды", badrows, file=sys.stderr)
print(" ".join(done))
