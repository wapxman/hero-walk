"""Лист героя с переносом строк: на каждое направление кадры выбранных анимаций идут подряд по wrap в строке."""
import sys, json, os
from PIL import Image, ImageFilter

cfgp, outp, keys, wrap = sys.argv[1], sys.argv[2], sys.argv[3].split(","), int(sys.argv[4])
c = json.load(open(cfgp, encoding="utf-8"))
res, dirs = c["res"], c["dirs"]
anims = [a for a in c["anims"] if a[0] in keys]
n = sum(a[2] for a in anims)
rows_per = -(-n // wrap)
sheet = Image.new("RGBA", (wrap * res, len(dirs) * rows_per * res), (0, 0, 0, 0))
for r, d in enumerate(dirs):
    k = 0
    for key, _, cnt, _ in anims:
        for i in range(cnt):
            im = Image.open(os.path.join(c["out"], f"{key}_d{d}_f{i}.png")).convert("RGBA")
            a = im.getchannel("A")
            grow = a.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
            edge = Image.new("RGBA", im.size, (18, 14, 20, 0))
            edge.putalpha(grow.point(lambda v: int(v * 0.8)))
            sheet.paste(Image.alpha_composite(edge, im), ((k % wrap) * res, (r * rows_per + k // wrap) * res))
            k += 1
sheet.save(outp, "WEBP", quality=90, method=6)
print(outp, sheet.size, rows_per, os.path.getsize(outp))
