# -*- coding: utf-8 -*-
"""Правки v121 в настоящей странице: дальность Эйры и «Верного глаза», подкрепления четвёрками при мини-боссе и боссе,
склянки отдельным рядом (не в слотах предметов) и пояснения на вкладке «Склянки», английский язык в меню.
Вампиризм ×0,65 проверяет v120_check, порядок заставок и выход из роликов кнопкой — cine_check, перевод целиком — lang_check.
Сервер страниц поднимает сам (порт 8784). Запуск: python tools/v121_check.py     Код выхода 1 — если что-то не прошло."""
import sys, os, time, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8784; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'v121'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:520]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
GO = "for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"
def start(p, url):
    p.goto(url, timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
    p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра')." + PD); time.sleep(1)
    p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
    p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(1.0)
    p.evaluate(GO); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(1.0)
    p.evaluate("window.__god = setInterval(() => { P.hp = P.maxHp; P.dead = 0; }, 50); hurtPlayer = function () {}; window.__xp = 0; { const g = gainXp; gainXp = function (n) { window.__xp += n; return g(n); }; } 1")
SMALL = "enemies.filter(x => x.hp > 0 && !x.dieT && x.reinf)"
def arena(p, m, typ, mini):
    p.evaluate("(() => { enemies.length = 0; ROUND.queue.length = 0; ROUND.mini = null; HARD.rfQ.length = 0; shots.length = 0; P.dead = 0; window.HARD_OFF = 0; wave = %d; applyWorld(%d); SHOP.phase = 'fight'; ROUND.endW = wave; SHOP.drops.length = 0; "
               "%s spawnEnemy('%s'); const e = enemies[enemies.length - 1]; e.x = P.x + 500; e.y = P.y; e.hp = e.max = 1e9; window.__host = e; window.__seen = new Set(); window.__loot = 0; "
               "clearInterval(window.__gi); window.__gi = setInterval(() => { for (const x of enemies) if (x.reinf) __seen.add(x); }, 100); return [e.type, !!e.mini, !!e.boss]; })()" % (m * 10 - (1 if mini else 0), m, ("ROUND.mini = '%s';" % typ) if mini else '', typ))
def wait_n(p, n, sec):
    t0 = time.time()
    while time.time() - t0 < sec and p.evaluate("__seen.size") < n: time.sleep(0.3)
    return round(time.time() - t0, 1)
def kill_small(p): return p.evaluate("(() => { const d0 = SHOP.drops.length, x0 = __xp, l = " + SMALL + "; const paid = l.filter(x => !x.noLoot).length; for (const e of l) hurtEnemy(e, 1e9); return { n: l.length, paid, drops: SHOP.drops.length - d0, xp: __xp - x0 }; })()")
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        start(p, BASE + '?allworlds&fakestore=web')

        print('дальность Эйры и «Верный глаз»')
        s = p.evaluate("(() => { const h = Object.entries(HEROES).map(([k, v]) => [k, v.name, v.range]); const src = String(markRange); return { h, src }; })()")
        rng = {k: r for k, n, r in s['h']}; names = {n: r for k, n, r in s['h']}
        gan = [rng['mage']] if 'mage' in rng else []; eira = rng.get('archer')
        chk('дальность атаки Эйры — на 10 %% больше, чем у Ганфаула (%s против %s)' % (eira, gan), len(gan) == 1 and eira and abs(eira / gan[0] - 1.1) < 0.005, s['h'])
        chk('«Верный глаз»: +5 % дальности на 1-м уровне и по +0,25 % за уровень (было +10 % и +0,5 %)', '1.05 + 0.0025' in s['src'], s['src'])

        print('склянки — отдельным рядом, не в слотах предметов')
        s = p.evaluate("(() => { SHOP.bag = Array(12).fill('bloodstone'); for (const f of FLASKS) SHOP.flasks[f.id] = 3; SHOP.recompute(); SHOP.refresh(); const sl = [...document.querySelectorAll('#hInv > .hs')], fl = [...document.querySelectorAll('#hFl .hs')]; "
                       "const r = fl.map(x => x.getBoundingClientRect()), a = sl[0].getBoundingClientRect(); return { slots: sl.length, same: new Set(sl.map(x => x.innerHTML)).size, fl: fl.length, cnt: fl.map(x => (x.querySelector('b') || {}).textContent), kinds: FLASKS.length, "
                       "on: r.every(q => q.width > 10 && q.right <= innerWidth && q.bottom <= innerHeight && q.left >= 0), small: r[0].width < a.width, heal: !!document.getElementById('hFlask'), title: fl[0].title }; })()")
        chk('12 слотов заняты только предметами; склянки (кроме лечения) — свой ряд маленьких ячеек с числом, всё на экране', s['slots'] == 12 and s['same'] == 1 and s['fl'] == s['kinds'] - 1 and all(c == '3' for c in s['cnt']) and s['on'] and s['small'] and s['heal'], s)
        chk('у ячейки склянки подсказка, когда она пьётся', '—' in s['title'] and len(s['title']) > 15, s['title'])
        p.screenshot(path=os.path.join(OUT, '1_flask_row.png'))
        p.evaluate("SHOP.phase = 'rest'; enemies.length = 0; SHOP.openShop()"); time.sleep(0.8)
        tab = "(t) => { const b = [...document.querySelectorAll('#shTabs div')].find(b => (b.dataset.ru || b.textContent) === t); for (const k of ['pointerdown', 'pointerup', 'click']) b.dispatchEvent(new PointerEvent(k, { bubbles: true })); }"
        txt = "(() => { const l = document.getElementById('shList'); return { note: !!l.querySelector('.fnote'), t: l.innerHTML }; })()"
        fn = p.evaluate("FLASKS.map(f => SHOP.iconHtml(ICON[f.id]))")
        res = {}
        for t in ('Предметы', 'Части', 'Против боссов', 'Склянки'):
            p.evaluate(tab, t); time.sleep(0.5); a = p.evaluate(txt); res[t] = [a['note'], [n for n in fn if n in a['t']]]
            if t == 'Склянки': p.screenshot(path=os.path.join(OUT, '2_shop_flasks.png'))
        chk('в лавке склянки есть только на вкладке «Склянки» (там же пояснение), на вкладках предметов их нет', all(not res[t][0] and not res[t][1] for t in ('Предметы', 'Части', 'Против боссов')) and res['Склянки'][0] and len(res['Склянки'][1]) == len(fn), res)
        s = p.evaluate("FLASKS.map(f => [f.id, FLASK_AUTO[f.id] || ''])")
        chk('у каждой склянки написано, когда она срабатывает (сама или вручную)', all(len(t) > 12 for i, t in s) and any('вручную' in t for i, t in s) and sum('сама' in t for i, t in s) >= 3, s)
        p.evaluate("SHOP.closeShop(); SHOP.bag = []; for (const f of FLASKS) SHOP.flasks[f.id] = 0; SHOP.recompute(); SHOP.refresh()")

        print('подкрепления: мини-босс')
        mini = p.evaluate("ROSTER[1].mini[0]")
        a = p.evaluate("1") and arena(p, 1, mini, True); a = p.evaluate("[__host.type, !!__host.mini]")
        chk('мини-босс мира 1 на арене (%s)' % a[0], a[1], a)
        t1 = wait_n(p, 4, 25); time.sleep(1.5); s = p.evaluate("({ n: __seen.size, types: [...__seen].map(x => x.type), kinds: [...new Set(ROSTER[1].mel.concat(ROSTER[1].rng))], grp: __host.rfN, q: HARD.rfQ.length })")
        chk('пока жив мини-босс, вышла четвёрка рядовых своего мира (через %s с)' % t1, s['n'] == 4 and s['grp'] == 1 and all(t in s['kinds'] for t in s['types']) and 6 <= t1 <= 16, s)
        p.screenshot(path=os.path.join(OUT, '3_mini_reinforce.png'))
        time.sleep(6); chk('пока четвёрка жива, новые не выходят', p.evaluate("__seen.size") == 4)
        k1 = kill_small(p); t2 = wait_n(p, 8, 25); time.sleep(1.0)
        chk('четвёрку убили — выходит следующая (через %s с)' % t2, p.evaluate("__seen.size") == 8 and p.evaluate("__host.rfN") == 2, [k1, p.evaluate("__seen.size")])
        chk('за первую четвёрку идут монеты; опыта подкрепления не дают', k1['n'] == 4 and k1['paid'] == 4 and k1['drops'] >= 4 and k1['xp'] < 1, k1)
        k2 = kill_small(p); t3 = wait_n(p, 12, 25); time.sleep(1.0); k3 = kill_small(p)
        chk('вторая и следующие четвёрки выходят, но без награды (чтобы не копить золото и опыт бесконечно)', k2['paid'] == 0 and k2['drops'] == 0 and k2['xp'] < 1 and k3['n'] == 4 and k3['paid'] == 0 and k3['drops'] == 0 and k3['xp'] < 1, [k2, k3])
        t0 = time.time()
        while time.time() - t0 < 25 and p.evaluate("HARD.rfQ.length") == 0: time.sleep(0.1)
        q0 = p.evaluate("HARD.rfQ.length"); n0 = p.evaluate("__seen.size"); p.evaluate("hurtEnemy(__host, 1e12)"); time.sleep(16)
        s = p.evaluate("({ q: HARD.rfQ.length, n: __seen.size, live: " + SMALL + ".length, host: __host.hp > 0 })")
        chk('мини-босс убит — те, кто ещё не вышел, не выходят, новых четвёрок нет', q0 > 0 and not s['host'] and s['q'] == 0 and s['n'] <= n0 + 1, [q0, n0, s])

        print('подкрепления: босс')
        arena(p, 4, 'b_toadking', False); p.evaluate("window.__al = new Set(); clearInterval(window.__ai); window.__ai = setInterval(() => { for (const x of enemies) if (x.ally) __al.add(x); }, 100)")
        t0 = time.time()
        while time.time() - t0 < 60 and not (p.evaluate("__seen.size") >= 4 and p.evaluate("__al.size") >= 4): time.sleep(0.5)
        s = p.evaluate("({ rf: __seen.size, ally: __al.size, both: [...__seen].filter(x => x.ally).length, live: enemies.filter(x => x.hp > 0 && !x.boss).length, grp: __host.rfN })")
        chk('босс: и сам зовёт союзников по двое, и четвёрки выходят из входов арены (за %d с: призвано %d, вышло %d)' % (time.time() - t0, s['ally'], s['rf']), s['rf'] >= 4 and s['ally'] >= 4 and s['both'] == 0, s)
        p.screenshot(path=os.path.join(OUT, '4_boss_reinforce.png'))
        time.sleep(20); n = p.evaluate("enemies.filter(x => x.hp > 0 && !x.boss).length")
        chk('рядовых на арене при боссе не больше 14 (шесть призванных + восемь из подкреплений)', n <= 14, n)
        p.evaluate("hurtEnemy(__host, 1e12)"); time.sleep(1.0); p.evaluate("clearInterval(__gi); clearInterval(__ai)")
        chk('ошибок на странице нет', not errs, errs[:3]); cx.close()

        print('английский язык')
        cx = b.new_context(viewport={'width': 1280, 'height': 600}); q = cx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:300]))
        q.goto(BASE + '?lang=en&fakestore=web', timeout=120000); q.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
        s = q.evaluate("[...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent)")
        cyr = [t for t in s if any('а' <= c.lower() <= 'я' for c in t)]
        chk('меню на английском: ' + ', '.join(s), 'New game' in s and not cyr, s)
        q.screenshot(path=os.path.join(OUT, '5_menu_en.png'))
        q.evaluate("LANG.set('ru')"); time.sleep(0.5); s = q.evaluate("[...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent)")
        chk('переключение обратно на русский сразу меняет надписи', 'Новая игра' in s, s)
        chk('ошибок на странице нет (англ.)', not errs, errs[:3]); cx.close(); b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'всё в порядке' if not bad else 'ЕСТЬ ОШИБКИ: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
