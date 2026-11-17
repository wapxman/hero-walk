"""Арена v3 из картинки ChatGPT: земля целиком + вырезанные по контуру высокие предметы (обелиск, портал),
чтобы герой и враги могли заходить за них. Контуры обведены по картинке вручную (координаты в пикселях исходника).
usage: python tools/cut_arena.py <arena2.png>
Результат: arena/arena2.webp (земля) и arena/arena2_cut.webp (вырезки), координаты вырезок печатаются для data.js."""
import os, sys
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = Image.open(sys.argv[1]).convert("RGB")
src.save(os.path.join(ROOT, "arena", "arena2.webp"), quality=90, method=6)

CUTS = {
    "obelisk2": [(342, 278), (370, 303), (374, 350), (397, 372), (388, 408), (422, 418), (447, 450), (450, 500),
                 (402, 532), (345, 542), (288, 537), (248, 512), (243, 465), (268, 425), (297, 414), (288, 386),
                 (310, 360), (313, 314)],
    "portal2": [(1185, 507), (1178, 435), (1220, 418), (1220, 300), (1224, 240), (1283, 198), (1320, 203), (1365, 180),
                (1387, 188), (1422, 212), (1462, 238), (1493, 290), (1493, 470), (1462, 522), (1402, 542),
                (1370, 537), (1220, 527)],
}
x = 0
parts = []
for name, poly in CUTS.items():
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    x0, y0, x1, y1 = min(xs) - 3, min(ys) - 3, max(xs) + 3, max(ys) + 3
    m = Image.new("L", src.size, 0)
    ImageDraw.Draw(m).polygon(poly, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(1.2))      # мягкий край в 1–2 пикселя
    piece = src.crop((x0, y0, x1, y1)).convert("RGBA")
    piece.putalpha(m.crop((x0, y0, x1, y1)))
    parts.append((name, piece, x0, y0))
W = sum(p[1].width for p in parts) + 4 * len(parts)
H = max(p[1].height for p in parts)
out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
for name, piece, x0, y0 in parts:
    out.paste(piece, (x, 0))
    # SPR: [лист, x, y, w, h]; опора — по низу контура, положение в исходнике (x0, y0)
    print(f"{name}: ['c2', {x}, 0, {piece.width}, {piece.height}]  src at {x0},{y0}")
    x += piece.width + 4
out.save(os.path.join(ROOT, "arena", "arena2_cut.webp"), quality=92, method=6, alpha_quality=100)
