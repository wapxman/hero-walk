# Живые элементы арен и выстрелы героев от Клауди (locfx): копирует готовые листы (по _done.json) в ui/locfx/ без потерь
# и пишет ui/locfx/locfx.js — описания листов (cell, frames, fps, blend) и места на аренах (PLACE из locfx_place.py).
# Запускать заново, когда в locfx появляются новые миры.
import json, os, sys, importlib.util
from PIL import Image
sys.stdout.reconfigure(encoding='utf-8')
SRC = r'C:\Users\User\Desktop\night_19_11\locfx'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'ui', 'locfx'); os.makedirs(OUT, exist_ok=True)
done = {k for k, v in json.load(open(os.path.join(SRC, '_done.json'), encoding='utf-8')).items() if v == 'ok'}
spec = importlib.util.spec_from_file_location('pl', r'C:\Users\User\browser-tools\locfx_place.py'); pl = importlib.util.module_from_spec(spec); spec.loader.exec_module(pl)
defs = {}
for id in sorted(done):
    j = os.path.join(SRC, 'game', id + '.json')
    if not os.path.exists(j): continue
    d = json.load(open(j, encoding='utf-8')); src = os.path.join(SRC, 'game', d['file'])
    dst = os.path.join(OUT, id + '.webp')
    if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(src):
        Image.open(src).save(dst, lossless=True)
    defs[id] = {k: d[k] for k in ('cell', 'frames', 'fps', 'blend') if k in d}
place = {w: {id: v for id, v in m.items() if id in defs} for w, m in pl.PLACE.items()}
place = {w: m for w, m in place.items() if m}
with open(os.path.join(OUT, 'locfx.js'), 'w', encoding='utf-8') as f:
    f.write('// Создано tools/locfx_import.py: листы живых элементов и выстрелов (Клауди) и их места на аренах.\n')
    f.write('const LOCFX = ' + json.dumps({'defs': defs, 'place': place}, ensure_ascii=False, separators=(',', ':')) + ';\n')
print(len(defs), 'листов; миры:', sorted(place))
