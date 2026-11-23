"""Пакет прогонов бота (tools/balance_bot.py) и сводка по мирам: смерти, доля боссов, фласки, пропущенные раунды.
Нужен локальный сервер игры на 8765 (python ../hero-walk-apk/dev_server.py . 8765).
Запуск:  python tools/bot_batch.py --n 100 --par 5 --out C:/путь/папка [--q hard=dmg:1.1]
Сводка по готовым файлам:  python tools/bot_batch.py --sum C:/путь/папка
Профили по очереди: Ganfaul, Эйра, Ganfaul без рывка, Эйра без рывка (40 / 30 / 15 / 15 из 100)."""
import sys, os, json, glob, time, argparse, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--n', type=int, default=100); ap.add_argument('--par', type=int, default=5); ap.add_argument('--out', default='')
ap.add_argument('--q', default=''); ap.add_argument('--sum', default=''); ap.add_argument('--timeout', type=int, default=2400)
A = ap.parse_args()
PROF = [('mage', []), ('archer', ['--hero', 'archer']), ('mage', []), ('archer', ['--hero', 'archer']), ('mage_nodash', ['--nodash']), ('mage', []), ('archer_nodash', ['--hero', 'archer', '--nodash']),
        ('mage', []), ('archer', ['--hero', 'archer']), ('mage_nodash', ['--nodash'])]   # на каждые 10: 4 Ganfaul, 3 Эйра, 2 Ganfaul без рывка, 1 Эйра без рывка (≈ 40/30/20/10)

def summary(d):
    out = []
    groups = {'все': '*.json', 'с рывком': '*_dash_*.json', 'без рывка': '*_nodash_*.json'}
    for gname, pat in groups.items():
        files = sorted(glob.glob(os.path.join(d, pat)))
        if not files: continue
        W = {m: dict(d=0, db=0, fl=0, tk=0, tb=0, bt=0, stuck=0, runs_died=0) for m in range(1, 11)}; tot = 0; clean = 0
        for f in files:
            died = set(); dsum = 0
            for r in json.load(open(f, encoding='utf-8')):
                if r.get('t', 0) < 1 or r.get('C', 1) != 1: continue
                w = W[r['M']]; boss = r['W'] >= 10
                w['d'] += r['deaths']; dsum += r['deaths']; w['fl'] += r['flasks']; w['stuck'] += r.get('stuck', 0)
                if r['deaths']: died.add(r['M'])
                if boss: w['db'] += r['deaths']; w['tb'] += r['taken'] / r['maxHp']; w['bt'] += r['t']
                else: w['tk'] += r['taken'] / r['maxHp']
            for m in died: W[m]['runs_died'] += 1
            tot += dsum; clean += 1 if not dsum else 0
        n = len(files)
        out.append('%s — прогонов %d: смертей за прогон %.1f, без единой смерти %d %%' % (gname, n, tot / n, round(100 * clean / n)))
        for m in range(1, 11):
            w = W[m]
            out.append('  мир %2d: смертей %.2f (из них на боссе %.2f — %s), погибал в мире в %d %% прогонов, фласок %.1f, урон в раундах %.1f здоровья, на боссе %.0f %% здоровья за %.0f с, пропущено раундов %.2f'
                       % (m, w['d'] / n, w['db'] / n, ('%d %%' % round(100 * w['db'] / w['d'])) if w['d'] else '—', round(100 * w['runs_died'] / n), w['fl'] / n, w['tk'] / n, 100 * w['tb'] / n, w['bt'] / n, w['stuck'] / n))
    return '\n'.join(out)

if A.sum: print(summary(A.sum)); sys.exit()
os.makedirs(A.out, exist_ok=True)
jobs = []
for i in range(A.n):
    name, args = PROF[i % len(PROF)]
    tagd = 'nodash' if 'nodash' in name else 'dash'
    f = os.path.join(A.out, 'run_%03d_%s_%s.json' % (i + 1, name.split('_')[0], tagd))
    if not os.path.exists(f): jobs.append((f, args))
run = []; t0 = time.time(); done = 0; bad = 0
while jobs or run:
    while jobs and len(run) < A.par:
        f, args = jobs.pop(0)
        cmd = [sys.executable, os.path.join(ROOT, 'tools', 'balance_bot.py'), '--waves', '100', '--out', f] + args + (['--q', A.q] if A.q else [])
        run.append((subprocess.Popen(cmd, stdout=open(f[:-5] + '.log', 'w', encoding='utf-8'), stderr=subprocess.STDOUT), f, time.time()))
    time.sleep(3)
    for it in run[:]:
        p, f, ts = it
        if p.poll() is not None: run.remove(it); done += 1; bad += 0 if os.path.exists(f) else 1
        elif time.time() - ts > A.timeout: p.kill(); run.remove(it); bad += 1   # только свой процесс
    if int(time.time() - t0) % 60 < 3: print('готово %d, идёт %d, осталось %d, не дошло %d, %d мин' % (done, len(run), len(jobs), bad, (time.time() - t0) / 60))
print(summary(A.out)); print('не дошло до конца:', bad, '| время', round((time.time() - t0) / 60), 'мин')
