# Огромная карта «Путь героев» из картинок ChatGPT (кодом не рисуем — только режем, масштабируем и склеиваем).
#   prep <map.png> <outdir>       — карта режется на 3×3 перекрывающихся куска (по 40 % ширины и высоты),
#                                   каждый растягивается до 1672×941 и уходит в ChatGPT на перерисовку в полной детализации
#   join <outdir> <out.webp> [K]  — перерисованные куски t<j><i>.png ставятся на свои места в карте K× крупнее исходной
#                                   и склеиваются с плавным переходом в полосах перекрытия
import sys, os
import numpy as np
from PIL import Image
N, F = 3, 0.4          # сетка и доля куска
def boxes(W, H):
    cw, ch = W * F, H * F
    for j in range(N):
        for i in range(N):
            yield i, j, i * (W - cw) / (N - 1), j * (H - ch) / (N - 1), cw, ch
if sys.argv[1] == 'prep':
    L = Image.open(sys.argv[2]).convert('RGB'); W, H = L.size
    os.makedirs(sys.argv[3], exist_ok=True)
    for i, j, x, y, cw, ch in boxes(W, H):
        L.crop((round(x), round(y), round(x + cw), round(y + ch))).resize((1672, 941), Image.LANCZOS).save(f'{sys.argv[3]}/q{j}{i}.png')
    print('ok', W, H)
else:
    src = Image.open(os.path.join(sys.argv[2], 'q00.png')); K = float(sys.argv[4]) if len(sys.argv) > 4 else 2.5
    W0, H0 = 1672, 941
    FW, FH = round(W0 * K), round(H0 * K)
    acc = np.zeros((FH, FW, 3)); wsum = np.zeros((FH, FW, 1))
    for i, j, x, y, cw, ch in boxes(FW, FH):
        tw, th = round(cw), round(ch)
        t = np.asarray(Image.open(f'{sys.argv[2]}/t{j}{i}.png').convert('RGB').resize((tw, th), Image.LANCZOS), dtype=float)
        # вес: 1 в середине куска, плавно к 0 у краёв, которые перекрываются соседями
        ov = 0.3
        wx = np.ones(tw); wy = np.ones(th)
        nx, ny = int(tw * ov), int(th * ov)
        if i > 0: wx[:nx] = np.linspace(0.001, 1, nx)
        if i < N - 1: wx[tw - nx:] = np.linspace(1, 0.001, nx)
        if j > 0: wy[:ny] = np.linspace(0.001, 1, ny)
        if j < N - 1: wy[th - ny:] = np.linspace(1, 0.001, ny)
        w = (wy[:, None] * wx[None, :])[..., None]
        X, Y = round(x), round(y); X2, Y2 = min(FW, X + tw), min(FH, Y + th)
        acc[Y:Y2, X:X2] += t[:Y2 - Y, :X2 - X] * w[:Y2 - Y, :X2 - X]; wsum[Y:Y2, X:X2] += w[:Y2 - Y, :X2 - X]
    out = (acc / np.maximum(wsum, 1e-6)).clip(0, 255).astype(np.uint8)
    Image.fromarray(out).save(sys.argv[3], quality=93, method=6)
    print('ok', FW, FH)
