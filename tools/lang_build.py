# -*- coding: utf-8 -*-
"""Английская версия (v121): собрать словарь lang/en.js из частей lang/src/*.json и показать, чего в нём не хватает.
    python tools/lang_build.py            собрать и напечатать русские строки игры, которых нет в словаре (по коду)
Строки игры берёт tools/lang_extract.js (node). Куски кода и стилей, попавшие в выборку, отсеиваются.
Что реально осталось непереведённым на экране, показывает tools/lang_check.py (проходит игру на английском)."""
import io, os, re, json, glob, subprocess, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = {}
for f in sorted(glob.glob(os.path.join(ROOT, 'lang', 'src', '*.json'))):
    for k, v in json.load(io.open(f, encoding='utf-8')).items():
        if k in D and D[k] != v: print('  дважды с разным переводом:', repr(k), '→', repr(D[k]), '/', repr(v), '(' + os.path.basename(f) + ')')
        D[k] = v
out = os.path.join(ROOT, 'lang', 'en.js')
io.open(out, 'w', encoding='utf-8', newline='\n').write('// Английский словарь. Собран из lang/src/*.json: python tools/lang_build.py. Не править руками.\nconst LANG_EN = ' + json.dumps(D, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('lang/en.js: строк', len(D), '·', os.path.getsize(out), 'байт')
subprocess.run(['node', os.path.join(ROOT, 'tools', 'lang_extract.js')], capture_output=True, cwd=ROOT)
S = json.load(io.open(os.path.join(ROOT, 'tools', 'lang_strings.json'), encoding='utf-8'))
def junk(x): return bool(re.search(r'[{}]|=>|;\s*\n|px;|function |const |//|\.style|vh;|rgba\(|\.webp|&&|\|\|', x)) or len(x) > 260
keys = sorted([k for k in D if len(k.strip()) >= 2], key=len, reverse=True)
def cover(s):
    if s in D or s.strip() in D: return True
    r = re.sub(r'<[^>]*>', ' ', s)
    for k in keys: r = r.replace(k, ' ')
    return not re.search('[А-Яа-яЁё]', r)
miss = []
for f, l in S.items():
    for x in l:
        if not junk(x) and not cover(x) and x not in miss: miss.append(x)
print('нет в словаре (по коду):', len(miss))
for x in miss: print('  ', json.dumps(x, ensure_ascii=False)[:230])
