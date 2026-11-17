"""Перекраска текстур врагов по правилам: маски по насыщенности/яркости/оттенку, тонирование и усиление цвета.
usage: recolor2.py spec.json"""
import sys, json, colorsys
import numpy as np
from PIL import Image

spec = json.load(open(sys.argv[1], encoding="utf-8"))
for job in spec:
    im = np.asarray(Image.open(job["src"]).convert("RGB")).astype(np.float32) / 255
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    mx = im.max(2); mn = im.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    val = mx
    # оттенок 0..1
    d = np.maximum(mx - mn, 1e-4)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    out = im.copy()
    for t in job.get("tints", []):
        m = (sat >= t.get("s0", 0)) & (sat <= t.get("s1", 1)) & (val >= t.get("v0", 0)) & (val <= t.get("v1", 1))
        if "h0" in t:
            h0, h1 = t["h0"], t["h1"]
            m &= ((hue >= h0) & (hue <= h1)) if h0 <= h1 else ((hue >= h0) | (hue <= h1))
        col = np.clip(lum[..., None] * np.array(t["c"]) * t.get("g", 1.6), 0, 1)
        k = t.get("k", 0.7)
        out = np.where(m[..., None], im * (1 - k) + col * k, out)
    if job.get("sat", 1) != 1 or job.get("gain", 1) != 1:
        l2 = (0.3 * out[..., 0] + 0.59 * out[..., 1] + 0.11 * out[..., 2])[..., None]
        out = np.clip((l2 + (out - l2) * job.get("sat", 1)) * job.get("gain", 1), 0, 1)
    Image.fromarray((out * 255).astype(np.uint8)).save(job["dst"])
    print("OK", job["dst"])
