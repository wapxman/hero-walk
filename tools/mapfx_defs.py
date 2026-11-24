# -*- coding: utf-8 -*-
"""Собирает описания живых элементов карты (ui/mapfx/*.json) в один файл ui/mapfx/defs.js (v120, аудит скорости):
раньше игра на запуске запрашивала каждый json отдельно и ждала ответа, останавливая загрузку страницы.
Запускать после любой правки json в ui/mapfx:  python tools/mapfx_defs.py"""
import io, os, json, glob
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
defs = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'ui', 'mapfx', '*.json'))):
    defs[os.path.splitext(os.path.basename(f))[0]] = json.load(io.open(f, encoding='utf-8'))
out = os.path.join(ROOT, 'ui', 'mapfx', 'defs.js')
io.open(out, 'w', encoding='utf-8', newline='\n').write('// Собрано из ui/mapfx/*.json: python tools/mapfx_defs.py. Не править руками.\nconst MAPFX_DEFS = ' + json.dumps(defs, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('ui/mapfx/defs.js:', len(defs), 'листов,', os.path.getsize(out), 'байт')
