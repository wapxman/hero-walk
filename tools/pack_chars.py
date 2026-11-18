"""Упаковка листов персонажей в атлас: у каждого кадра обрезаются прозрачные поля, кадры плотно
укладываются в картинку шириной не больше 2048. В памяти телефона атлас занимает примерно втрое меньше,
качество кадров не меняется. Исходные листы лежат в chars/src (в APK не попадают).
usage: python tools/pack_chars.py   (из корня репозитория)
Результат: chars/at_<имя>.webp и chars/atlas.js с координатами кадров."""
import json, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "chars", "src")
OUT = os.path.join(ROOT, "chars")
SHEETS = {"zombie": 256, "vampire": 256, "mage": 256, "archer": 256, "boss": 320,
          "v_mutant": 320, "v_maw": 320, "v_pumpkin": 320, "v_demon": 320, "v_parasite": 288, "v_mremireh": 288,
          "v_warzombie": 288, "v_zgirl": 256, "v_copz": 256, "v_goblin": 256, "v_zlorp": 256,
          "hero_a": 400, "hero_b": 400, "hero_d": 400, "archer_a": 400, "archer_b": 400, "archer_d": 400}
MAXW, PAD = 2048, 2

atlas = {}
for name, cell in SHEETS.items():
    im = Image.open(os.path.join(SRC, "mx_" + name + ".webp")).convert("RGBA")
    a = np.asarray(im)
    gc, gr = im.width // cell, im.height // cell
    frames = []
    for gy in range(gr):
        for gx in range(gc):
            c = a[gy * cell:(gy + 1) * cell, gx * cell:(gx + 1) * cell]
            ys, xs = np.nonzero(c[..., 3])
            if len(xs) == 0:
                frames.append(None)
                continue
            x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
            frames.append([gx * cell + x0, gy * cell + y0, x1 - x0, y1 - y0, int(x0), int(y0)])
    # укладка полками: сначала высокие кадры
    order = sorted([i for i, f in enumerate(frames) if f], key=lambda i: -frames[i][3])
    x = y = shelf = 0
    pos = {}
    for i in order:
        w, h = frames[i][2], frames[i][3]
        if x + w + PAD > MAXW:
            x, y, shelf = 0, y + shelf + PAD, 0
        pos[i] = (x, y)
        x += w + PAD
        shelf = max(shelf, h)
    AW, AH = MAXW, y + shelf
    out = Image.new("RGBA", (AW, AH), (0, 0, 0, 0))
    meta = []
    for i, f in enumerate(frames):
        if not f:
            meta.append(0)
            continue
        sx, sy, w, h, ox, oy = f
        px, py = pos[i]
        out.paste(im.crop((sx, sy, sx + w, sy + h)), (px, py))
        meta.append([int(v) for v in (px, py, w, h, ox, oy)])
    # обрезаем лишнюю ширину справа
    used = max(m[0] + m[2] for m in meta if m)
    out = out.crop((0, 0, used, AH))
    out.save(os.path.join(OUT, "at_" + name + ".webp"), quality=92, method=6, alpha_quality=100)
    atlas[name] = {"cell": cell, "gc": gc, "f": meta}
    print(name, im.size, "->", out.size, round(im.width * im.height * 4 / 1e6, 1), "->",
          round(out.width * out.height * 4 / 1e6, 1), "MB")

with open(os.path.join(OUT, "atlas.js"), "w", encoding="utf-8") as fh:
    fh.write("// Создано tools/pack_chars.py. Кадр: [x, y, ширина, высота в атласе, сдвиг x, сдвиг y внутри исходной клетки];\n")
    fh.write("// номер кадра = ряд * gc + столбец исходного листа.\n")
    fh.write("const ATLAS = " + json.dumps(atlas, separators=(",", ":")) + ";\n")
