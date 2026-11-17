import sys, numpy as np
from PIL import Image
src, dst, C = sys.argv[1], sys.argv[2], int(sys.argv[3])
im = np.asarray(Image.open(src).convert('RGB')).astype(np.float32)
H, W, _ = im.shape; cw, ch = W // 3, H // 2
out = Image.new('RGBA', (3 * C, 2 * C), (0, 0, 0, 0))
for i in range(6):
    cx0, cy0 = (i % 3) * cw, (i // 3) * ch
    cell = im[cy0:cy0 + ch, cx0:cx0 + cw]
    br = cell.max(2)
    ys, xs = np.nonzero(br > 40)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    R = max(x1 - x0, y1 - y0) / 2
    yy, xx = np.mgrid[0:ch, 0:cw]
    d = np.hypot(xx - cx, yy - cy)
    # внутри рамки — непрозрачно; снаружи — прозрачность по яркости (самоцветы и свечение)
    inner = R * 0.9
    a_br = np.clip((br - 12) / 90, 0, 1)
    a = np.where(d < inner, 1.0, a_br)
    rgba = np.dstack([cell, a * 255]).astype(np.uint8)
    t = Image.fromarray(rgba, 'RGBA')
    s = int(R * 2 * 1.04)
    t = t.crop((int(cx - s / 2), int(cy - s / 2), int(cx - s / 2) + s, int(cy - s / 2) + s)).resize((C, C), Image.LANCZOS)
    out.paste(t, ((i % 3) * C, (i // 3) * C))
    print(i, 'center', round(cx), round(cy), 'R', round(R))
out.save(dst, 'WEBP', quality=90, method=6)
