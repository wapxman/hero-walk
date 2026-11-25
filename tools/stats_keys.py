# -*- coding: utf-8 -*-
"""Ключи статистики (GameAnalytics) → файл stats_keys.js для сборки. В git ни ключи, ни этот файл не попадают.
    python tools/stats_keys.py android <папка с index.html> [путь к ga_keys.json]
    python tools/stats_keys.py ios     <папка с index.html> [путь к ga_keys.json]
Без пути ищет ga_keys.json: рядом с папкой игры, в Desktop/night_19_11, в домашней папке.
Файл ключей — как у Клауди: { "android": { "game_key": "...", "secret_key": "..." }, "ios": { ... } }.
Ключи на экран не печатаются. Нет файла ключей — код выхода 2, stats_keys.js не создаётся (игра соберётся без статистики)."""
import sys, os, io, json, re
sys.stdout.reconfigure(encoding='utf-8')
if len(sys.argv) < 3 or sys.argv[1] not in ('android', 'ios'): print(__doc__); sys.exit(1)
plat, out = sys.argv[1], sys.argv[2]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); home = os.path.expanduser('~')
cands = [sys.argv[3]] if len(sys.argv) > 3 else [os.path.join(os.path.dirname(ROOT), 'ga_keys.json'), os.path.join(home, 'Desktop', 'night_19_11', 'ga_keys.json'), os.path.join(home, 'ga_keys.json')]
src = next((c for c in cands if os.path.isfile(c)), None)
if not src: print('файл ключей не найден (искал: ' + '; '.join(cands) + ') — сборка пойдёт без статистики'); sys.exit(2)
d = json.load(io.open(src, encoding='utf-8-sig')).get(plat) or {}
gk, sk = str(d.get('game_key', '')).strip(), str(d.get('secret_key', '')).strip()
if not (re.fullmatch(r'[0-9a-f]{32}', gk) and re.fullmatch(r'[0-9a-f]{40}', sk)): print('в файле ключей нет годных game_key / secret_key для', plat); sys.exit(2)
if not os.path.isfile(os.path.join(out, 'index.html')): print('в папке', out, 'нет index.html'); sys.exit(1)
io.open(os.path.join(out, 'stats_keys.js'), 'w', encoding='utf-8', newline='\n').write(
    "// Ключи GameAnalytics для сборки (%s). Сделан tools/stats_keys.py; в git не кладётся.\nconst STATS_KEYS = { gameKey: '%s', secretKey: '%s' };\n" % (plat, gk, sk))
print('stats_keys.js готов:', plat, '(игра №%s) →' % d.get('game_id', '?'), os.path.join(out, 'stats_keys.js'))
