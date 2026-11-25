# -*- coding: utf-8 -*-
"""Междумирье v2 (v122): картинки и тексты Клауди → файлы игры.
    python tools/alma_prep.py [папка-источник]      по умолчанию Desktop/villains/alma_mater
hub_v2.png → limbo/bg.webp (фон площади);  alma_book.png → alma/book.webp;  trophy_hall.png → alma/hall.webp;
trophies/<id босса>.png → alma/t_<id>.webp (обрезаны по рисунку, высота до 420 px);  alma_texts.json → alma/texts.js (const ALMA_TEXTS).
Картинки только пережимаются в webp — ничего не дорисовывается."""
import sys, os, io, json
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser('~'), 'Desktop', 'villains', 'alma_mater')
OUT = os.path.join(ROOT, 'alma'); os.makedirs(OUT, exist_ok=True)
def save(im, path, q):
    if im.mode == 'RGBA' and im.getextrema()[3][0] == 255: im = im.convert('RGB')
    im.save(path, 'WEBP', quality=q, method=6); print('  ', os.path.relpath(path, ROOT), im.size, im.mode, os.path.getsize(path) // 1024, 'КБ')
save(Image.open(os.path.join(SRC, 'hub_v2.png')), os.path.join(ROOT, 'limbo', 'bg.webp'), 90)
save(Image.open(os.path.join(SRC, 'alma_book.png')), os.path.join(OUT, 'book.webp'), 88)
save(Image.open(os.path.join(SRC, 'trophy_hall.png')), os.path.join(OUT, 'hall.webp'), 88)
T = json.load(io.open(os.path.join(SRC, 'alma_texts.json'), encoding='utf-8-sig'))
for b in T['bosses']:
    im = Image.open(os.path.join(SRC, 'trophies', b['id'] + '.png')).convert('RGBA')
    im = im.crop(im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox())
    k = 420 / max(im.size); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    save(im, os.path.join(OUT, 't_' + b['id'] + '.webp'), 90); b['tw'], b['th'] = im.size; b.pop('trophy_img', None)
out = { 'bosses': T['bosses'], 'minibosses': T['minibosses'] }
io.open(os.path.join(OUT, 'texts.js'), 'w', encoding='utf-8', newline='\n').write(
    '// Тексты Альма-матер (Клауди, alma_texts.json). Собрано tools/alma_prep.py — руками не править.\nconst ALMA_TEXTS = ' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('alma/texts.js: боссов', len(out['bosses']), '· мини-боссов', len(out['minibosses']))
