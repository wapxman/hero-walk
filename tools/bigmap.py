# Большая карта мира из картинок ChatGPT (рисовать кодом нельзя — только режем, масштабируем и склеиваем).
#   prep <layout.png> <outdir>   — общий план 1536x1024 режется на 4 перекрывающихся четверти (864x576),
#                                  каждая увеличивается до 1536x1024 и отправляется в ChatGPT на перерисовку в полной детализации
#   join <outdir> <out.webp>     — 4 перерисованные четверти (t00..t11.png) сжимаются до 1296x864 и склеиваются
#                                  в карту 2304x1536 с плавным переходом в полосах перекрытия
import sys, os
from PIL import Image
import numpy as np
LW, LH, CW, CH = 1536, 1024, 864, 576
FW, FH, K = 2304, 1536, 1.5
def boxes():
    for j in (0, 1):
        for i in (0, 1):
            yield i, j, i * (LW - CW), j * (LH - CH)
if sys.argv[1] == 'prep':
    L = Image.open(sys.argv[2]).convert('RGB').resize((LW, LH), Image.LANCZOS)
    os.makedirs(sys.argv[3], exist_ok=True)
    for i, j, x, y in boxes():
        L.crop((x, y, x + CW, y + CH)).resize((1536, 1024), Image.LANCZOS).save(f'{sys.argv[3]}/q{j}{i}.png')
else:
    acc = np.zeros((FH, FW, 3)); wsum = np.zeros((FH, FW, 1))
    tw, th = int(CW * K), int(CH * K)
    def ramp(n, ov, lo, hi):
        r = np.ones(n)
        if lo: r[:ov] = np.linspace(0, 1, ov)
        if hi: r[n - ov:] = np.linspace(1, 0, ov)
        return np.clip(r, 1e-3, 1)
    ovx, ovy = 2 * tw - FW, 2 * th - FH
    for i, j, x, y in boxes():
        t = np.asarray(Image.open(f'{sys.argv[2]}/t{j}{i}.png').convert('RGB').resize((tw, th), Image.LANCZOS), dtype=float)
        w = ramp(th, ovy, j == 1, j == 0)[:, None] * ramp(tw, ovx, i == 1, i == 0)[None, :]
        w = w[..., None] ** 1.5
        X, Y = int(x * K), int(y * K)
        acc[Y:Y + th, X:X + tw] += t * w; wsum[Y:Y + th, X:X + tw] += w
    Image.fromarray(np.clip(acc / wsum, 0, 255).astype('uint8')).save(sys.argv[3], quality=86, method=6)
