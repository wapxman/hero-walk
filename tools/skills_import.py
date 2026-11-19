"""Новые умения злодеев (пакет Клауди 20.11): <villains>/<sprite>/sk_game/ -> игра.
usage: python tools/skills_import.py [sprite ...]   (без аргументов — все папки с sk_game)
- листы кастов и существ (в meta.json есть rows) -> chars/src/sk_<sprite>_<key>.png и атласы без потерь (tools/pack_chars.py);
- картинки эффектов (в meta.json есть file) -> fx/sk/<sprite>_<key>.webp без потерь;
- chars/skills.js — const SKSHEETS = {sprite: {a: {key: {at, n, ms, rows, foot, size}}, f: {key: {img, view}}}}."""
import json, os, shutil, subprocess, sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = {'thornroot': 'C:/Users/User/Desktop/villain_thornroot/sk_game'}
V = 'C:/Users/User/Desktop/villains'
for d in os.listdir(V):
    if os.path.isdir(os.path.join(V, d, 'sk_game')): SRC[d] = os.path.join(V, d, 'sk_game')
want = sys.argv[1:] or sorted(SRC)
os.makedirs(os.path.join(ROOT, 'fx', 'sk'), exist_ok=True)
lj = os.path.join(ROOT, 'chars', 'src', 'lossless.json')
lossless = json.load(open(lj, encoding='utf-8')) if os.path.exists(lj) else {}
tj = os.path.join(ROOT, 'chars', 'skills.json')
table = json.load(open(tj, encoding='utf-8')) if os.path.exists(tj) else {}
names = []
for sp in want:
    g = SRC[sp]; meta = json.load(open(os.path.join(g, 'meta.json'), encoding='utf-8'))
    ent = {'a': {}, 'f': {}}
    for key, m in meta.items():
        if 'rows' in m:
            f = os.path.join(g, '%s_%s.png' % (sp, key))
            if not os.path.exists(f): print('нет листа', f); continue
            name = 'sk_%s_%s' % (sp, key)
            dst = os.path.join(ROOT, 'chars', 'src', name + '.png')
            if not os.path.exists(dst) or os.path.getmtime(dst) < os.path.getmtime(f):
                shutil.copyfile(f, dst); names.append(name)
            lossless[name] = m['cell']
            ent['a'][key] = {'at': name, 'n': m['frames'], 'ms': m['ms'], 'rows': m['rows'], 'foot': m['foot']}
            if 'size' in m: ent['a'][key]['size'] = m['size']
        elif 'file' in m:
            out = 'fx/sk/%s_%s.webp' % (sp, key)
            full = os.path.join(ROOT, out); src = os.path.join(g, m['file'])
            if not os.path.exists(full) or os.path.getmtime(full) < os.path.getmtime(src):
                Image.open(src).convert('RGBA').save(full, lossless=True, quality=100, method=6, exact=True)
            ent['f'][key] = {'img': out, 'view': m.get('view', 'ground')}
    table[sp] = ent
    print(sp, len(ent['a']), 'листов,', len(ent['f']), 'эффектов')
json.dump(lossless, open(lj, 'w', encoding='utf-8'), indent=1)
json.dump(table, open(tj, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(os.path.join(ROOT, 'chars', 'skills.js'), 'w', encoding='utf-8') as fh:
    fh.write('// Создано tools/skills_import.py: листы кастов/существ и картинки эффектов новых умений злодеев (пакет Клауди 20.11).\n')
    fh.write('const SKSHEETS = ' + json.dumps(table, ensure_ascii=False, separators=(',', ':')) + ';\n')
if names: subprocess.check_call([sys.executable, os.path.join(ROOT, 'tools', 'pack_chars.py')] + names)
print('упаковано листов:', len(names))
