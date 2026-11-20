"""Бот проходит настоящую игру в ускоренном времени и печатает, как шёл забег (см. tools/balance_bot.js).
Нужен локальный сервер игры: python ../hero-walk-apk/dev_server.py . 8765
Запуск: python tools/balance_bot.py [--waves 100] [--hero archer] [--k hp=1,dmg=1,...] [--out file.json]"""
import sys, os, json, time, argparse
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--waves', type=int, default=100); ap.add_argument('--from', dest='frm', type=int, default=0); ap.add_argument('--hero', default='')
ap.add_argument('--k', default=''); ap.add_argument('--out', default=''); ap.add_argument('--url', default='http://localhost:8765/'); ap.add_argument('--lvl', type=int, default=0)
ap.add_argument('--build', default='1,1,1'); ap.add_argument('--nodash', action='store_true')
A = ap.parse_args()
K = {k: float(v) for k, v in (x.split('=') for x in A.k.split(',') if x)}
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True); p = b.new_page(viewport={'width': 640, 'height': 360})
    errs = []; p.on('pageerror', lambda e: errs.append(str(e)[:300]))
    p.goto(A.url + '?v=%d&mode=play' % int(time.time())); time.sleep(3)
    p.evaluate("() => { for (const k of Object.keys(localStorage)) if (/^hw_(run|prog|mapt)_/.test(k)) localStorage.removeItem(k); }")
    p.goto(A.url + '?v=%d&mode=play' % int(time.time())); time.sleep(3)
    p.mouse.click(320, 180)
    if A.hero: p.evaluate("id => setHero(id)", A.hero)
    p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); time.sleep(2)
    p.evaluate("k => { if (BAL.tune) BAL.tune(k); }", K)
    p.add_script_tag(path=os.path.join(ROOT, 'balance_model.js')); p.add_script_tag(path=os.path.join(ROOT, 'tools', 'balance_bot.js'))
    p.evaluate("a => { BOT.maxWave = a[0]; BOT.opt.build = a[2]; BOT.opt.dash = !a[4]; if (a[1]) { wave = a[1]; } if (a[3]) { P.lvl = a[3]; P.stp = 3 * (a[3] - 1); P.sp = a[3] - 1; } }", [A.waves, A.frm, [float(x) for x in A.build.split(',')], A.lvl, A.nodash])
    t0 = time.time(); shown = 0
    while True:
        st = p.evaluate("BOT.run(6000)")
        rs = p.evaluate("n => BOT.rounds.slice(n)", shown); shown += len(rs)
        for r in rs:
            print(f"М{r['M']} В{r['W']}-{(r['n1'] - 1) % 10 + 1} ур {r['lvl']}→{r['lvl1']} | {r['t']:.0f} с | урон по герою {r['taken']} ({r['taken'] / r['maxHp']:.1f} HP) (из них при мини-боссе/боссе {r.get('takenBoss', 0):.0f} за {r.get('tBoss', 0):.0f} с) | фласок {r['flasks']} | смертей {r['deaths']}{' ЗАСТРЯЛ' if r.get('stuck') else ''} | HP {r['maxHp']} | урон/с {r['dealt'] / max(1, r['t']):.0f} | золото {r['gold']}→{r['gold1']} | {', '.join(r['bag'])}", flush=True)
        if st['done'] or time.time() - t0 > 3000: break
    print('итог:', st, '| время прогона', round(time.time() - t0), 'с | ошибки:', errs or 'нет')
    if A.out: json.dump(p.evaluate("BOT.rounds"), open(A.out, 'w', encoding='utf-8'), ensure_ascii=False)
    b.close()
