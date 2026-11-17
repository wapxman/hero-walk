"""Лист эффекта на чёрном фоне -> WebP с прозрачностью. Яркость пикселя становится его непрозрачностью."""
import sys, os
import numpy as np
from PIL import Image

src, dst, grid, cell = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
im = Image.open(src).convert("RGB")
# приводим к ровной сетке: grid x grid ячеек размера cell
im = im.resize((grid * cell, grid * cell), Image.LANCZOS)
a = np.asarray(im).astype(np.float32) / 255.0
m = a.max(axis=2)
alpha = np.clip((m - 0.03) * 1.45, 0, 1) ** 0.85
rgb = a / np.maximum(m, 1e-3)[..., None]          # убираем затемнение: цвет остаётся чистым
rgb = np.clip(rgb * (0.55 + 0.45 * m[..., None]), 0, 1)   # слегка возвращаем объём
out = np.dstack([rgb, alpha])
Image.fromarray((out * 255).astype(np.uint8), "RGBA").save(dst, "WEBP", quality=88, method=6)
print(dst, grid * cell, os.path.getsize(dst))
