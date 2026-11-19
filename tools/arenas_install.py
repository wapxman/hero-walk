# 40 арен: готовые картинки ChatGPT (night_19_11\gpt\ar40\w<мир>_<арена>.png, арены 2–4) → arena/w<мир>_<арена>.webp 2304×1536
# и строка ARENAS в data.js. Запускать, когда дорисовались новые.
import os, re, json
from PIL import Image
SRC = r'C:\Users\User\Desktop\night_19_11\gpt\ar40'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = {}
for w in range(1, 11):
    row = []
    for k in (2, 3, 4):
        src = os.path.join(SRC, 'w%d_%d.png' % (w, k)); dst = 'arena/w%d_%d.webp' % (w, k)
        if os.path.exists(src):
            full = os.path.join(ROOT, dst)
            if not os.path.exists(full) or os.path.getmtime(full) < os.path.getmtime(src):
                Image.open(src).convert('RGB').resize((2304, 1536), Image.LANCZOS).save(full, quality=95, method=6)
            row.append(dst)
        else:
            row.append(None)
    if any(row): A[w] = row
p = os.path.join(ROOT, 'data.js'); s = open(p, encoding='utf-8').read()
s = re.sub(r'const ARENAS = \{.*?\};', 'const ARENAS = ' + json.dumps(A, separators=(',', ':')) + ';', s, count=1, flags=re.S)
open(p, 'w', encoding='utf-8').write(s)
print('арен готово:', sum(1 for r in A.values() for x in r if x), {w: [bool(x) for x in r] for w, r in A.items()})
