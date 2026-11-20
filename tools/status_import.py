# Значки состояний героя: python tools/status_import.py
# PNG 128x128 с прозрачностью из Desktop\night_19_11\status_icons\png -> ui/status/<имя>.webp (без потерь).
# Имена — как в status.js (HSTAT.DEF) плюс star (звезда оглушения).
import os, sys
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
SRC = r'C:\Users\User\Desktop\night_19_11\status_icons\png'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ui', 'status'); os.makedirs(OUT, exist_ok=True)
NAMES = 'stun freeze root slow silence poison burn cold bleed shred weak blind mark fear curse shield haste immune clarity star dash'.split()   # dash — иконка кнопки рывка
bad = []
for n in NAMES:
    p = os.path.join(SRC, n + '.png')
    if not os.path.exists(p): bad.append(n + ' — нет файла'); continue
    im = Image.open(p).convert('RGBA')
    if im.size != (128, 128): im = im.resize((128, 128), Image.LANCZOS)
    if im.getchannel('A').getextrema()[0] == 255: bad.append(n + ' — нет прозрачности')
    im.save(os.path.join(OUT, n + '.webp'), lossless=True, method=6)
print('готово:', len(NAMES) - len([b for b in bad if 'нет файла' in b]), 'из', len(NAMES)); print('\n'.join(bad))
