# -*- coding: utf-8 -*-
"""Значки статистики (v124): лист ChatGPT 4×2 с прозрачным фоном → ui/stat_icons.webp (8 клеток по 256 px, значок по центру клетки).
Порядок: песочные часы, надгробие, корона, кубок / молния, медаль, латная перчатка, свиток.
Запуск: python tools/stat_icons_prep.py [исходник.png]   (по умолчанию Desktop/night_19_11/stat_icons/stat_icons_chatgpt.png)"""
import os, sys
import numpy as np
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/Desktop/night_19_11/stat_icons/stat_icons_chatgpt.png')
im = Image.open(src).convert('RGBA'); W, H = im.size; cw, ch = W // 4, H // 2; C = 256; PAD = 14
out = Image.new('RGBA', (4 * C, 2 * C), (0, 0, 0, 0))
for i in range(8):
    cell = im.crop(((i % 4) * cw, (i // 4) * ch, (i % 4 + 1) * cw, (i // 4 + 1) * ch))
    a = np.asarray(cell)[..., 3] > 16; ys, xs = np.nonzero(a)
    icon = cell.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    k = (C - 2 * PAD) / max(icon.size); icon = icon.resize((max(1, round(icon.width * k)), max(1, round(icon.height * k))), Image.LANCZOS)
    out.alpha_composite(icon, ((i % 4) * C + (C - icon.width) // 2, (i // 4) * C + (C - icon.height) // 2))
    print(i, 'значок', icon.size)
dst = os.path.join(ROOT, 'ui', 'stat_icons.webp'); out.save(dst, 'WEBP', quality=92, method=6)
print(os.path.relpath(dst, ROOT), out.size, os.path.getsize(dst) // 1024, 'КБ')
