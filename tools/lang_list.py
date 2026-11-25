# -*- coding: utf-8 -*-
"""Список строк для перевода без мусора (куски кода и стилей, попавшие в выборку). python tools/lang_list.py [с] [по]"""
import json, io, sys, re
sys.stdout.reconfigure(encoding='utf-8')
d = json.load(io.open('tools/lang_todo.json', encoding='utf-8'))
def junk(x): return bool(re.search(r'[{}]|=>|;\s*\n|px;|function |const |//|\.style|vh;|rgba\(|\.webp|&&|\|\|', x)) or len(x) > 260
a = int(sys.argv[1]) if len(sys.argv) > 1 else 0; b = int(sys.argv[2]) if len(sys.argv) > 2 else len(d)
for i, x in enumerate(d):
    if a <= i < b and not junk(x): print(i, json.dumps(x, ensure_ascii=False))
