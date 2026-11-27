# -*- coding: utf-8 -*-
"""Картинки для галереи «История» (v124): из каждого ролика книги берётся кадр и из него — гравюра с правой страницы
(выпрямляется по четырём углам, контраст поднимается). Ничего не дорисовывается. Результат — cine/th/<ролик>.webp.
Запуск: python tools/story_thumbs.py      (нужен ffmpeg). Доля ролика, с которой берётся кадр, — в AT."""
import os, sys, subprocess, io
from PIL import Image, ImageOps, ImageEnhance, ImageFilter
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AT = {'intro': 0.30, 'world_01': 0.30, 'world_02': 0.30, 'world_03': 0.45, 'world_04': 0.45, 'world_05': 0.30, 'world_06': 0.30,
      'world_07': 0.30, 'world_08': 0.30, 'world_09': 0.45, 'world_10': 0.30, 'finale': 0.30}
QUAD = (701, 205, 717, 506, 1069, 499, 1018, 198)      # углы гравюры в кадре 1280×720: верх-лево, низ-лево, низ-право, верх-право
SIZE = 384
os.makedirs(os.path.join(ROOT, 'cine', 'th'), exist_ok=True)
for k, frac in AT.items():
    src = os.path.join(ROOT, 'cine', k + '.mp4')
    d = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src], capture_output=True, text=True).stdout)
    png = subprocess.run(['ffmpeg', '-v', 'error', '-ss', '%.2f' % (d * frac), '-i', src, '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    im = Image.open(io.BytesIO(png)).convert('RGB')
    assert im.size == (1280, 720), im.size
    t = im.transform((SIZE, SIZE), Image.QUAD, QUAD, Image.BICUBIC)
    # тон гравюры — тёплая сепия книги: яркость растягиваем на весь диапазон и красим от тёмно-коричневого к пергаменту
    g = ImageOps.autocontrast(t.convert('L'), cutoff=(1, 1)); g = ImageEnhance.Contrast(g).enhance(1.1)
    t = ImageOps.colorize(g, black='#150d07', white='#f3e4c2', mid='#8a6f4d').filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))
    out = os.path.join(ROOT, 'cine', 'th', k + '.webp'); t.save(out, 'WEBP', quality=84, method=6)
    print('%-9s кадр %5.1f с → %s, %d КБ' % (k, d * frac, os.path.relpath(out, ROOT), os.path.getsize(out) // 1024))
