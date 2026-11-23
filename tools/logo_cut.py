# -*- coding: utf-8 -*-
"""Логотип игры от Клауди нарисован на чёрном фоне. Для главного меню чёрный фон вокруг снимаем (только тот, что связан с краем
картинки — тёмные места внутри логотипа не трогаем). Сама картинка не меняется.  python tools/logo_cut.py вход.png выход.webp"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
def cut(src, dst, size=1254):
    im = Image.open(src).convert('RGB'); a = np.asarray(im).astype(np.float32); mx = a.max(axis=2)
    lab, n = ndimage.label(mx < 60)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    bg = ndimage.binary_dilation(bg, iterations=2)                 # край фона заходит на свечение на пару точек
    soft = np.clip((mx - 8) / 52.0, 0, 1)                           # в зоне фона: чем темнее точка, тем прозрачнее
    alpha = np.where(bg, soft, 1.0)
    A = Image.fromarray((alpha * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
    out = im.convert('RGBA'); out.putalpha(A)
    bb = out.getbbox(); out = out.crop(bb); out.thumbnail((size, size), Image.LANCZOS)
    out.save(dst, 'WEBP', quality=92, method=6); return out.size
if __name__ == '__main__': print(cut(sys.argv[1], sys.argv[2]))
