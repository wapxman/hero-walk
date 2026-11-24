# -*- coding: utf-8 -*-
"""Уровни сложности, тестовая сборка мира 1 и крюк мясника (v117) — в настоящей странице.
Сервер страниц поднимает сам (порт 8776) и сам останавливает (только свой процесс). Код выхода 1 — если что-то не прошло.
Запуск: python tools/level_check.py        снимки — tests/levels/"""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8776; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'levels'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:300]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
REAL = json.dumps({'v': 1, 'wave': 37, 'best': 37, 'hp': 500, 'mp': 100, 'gold': 4321, 'bag': [], 'flasks': {}, 't': 1})
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        def page(q):
            p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300])); p.goto(BASE + q, timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(2.5); return p
        def pick(p, L):      # выбрать уровень → выбор героя → «В бой» → первый бой
            p.evaluate("(L) => [...document.querySelectorAll('#lvPick .b')][L - 1]." + PD, L); time.sleep(1)
            p.wait_for_function("typeof LEVEL !== 'undefined' && getComputedStyle(document.getElementById('hSel')).display === 'flex'", timeout=120000); time.sleep(1.5)
            p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
            p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(0.5)
        clear = "enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = 99; ROUND.mini = null; shots.length = 0; HOOK.L.length = 0; P.sk.pull = null; P.sk.pin = 0; P.hp = P.maxHp = 1e6; "

        print('обычная игра')
        p = page('')
        p.evaluate("(v) => localStorage.setItem('hw_run_mage', v)", REAL)
        s = p.evaluate("({ n: LEVEL.n, test: LEVEL.TEST, auto: LEVEL.AUTO, pick: !!document.getElementById('lvPick'), chip: !!document.getElementById('lvChip'), k: LEVEL.K() })")
        chk('уровень 1, экрана выбора уровня нет, числа уровня 1 — без прибавок', s['n'] == 1 and not s['test'] and not s['pick'] and s['auto'] and all(abs(s['k'][x] - 1) < 1e-9 for x in ('run', 'atk', 'wind', 'cd', 'dmg', 'hp', 'bdmg', 'bhp')), s)
        s = p.evaluate("(() => { wave = 0; spawnEnemy('v_maskedassassin'); const e = enemies[enemies.length - 1]; const r = [e.lv || 0, e.speed, KIND.v_maskedassassin.speed * BAL.speed(0) * HARD.spdK()]; enemies.length = 0; return r; })()")
        chk('враг обычной игры — без прибавок уровня', s[0] == 0 and abs(s[1] - s[2]) < 0.01, s)
        chk('в мире 1 нет «Фарфоровой фрейлины», рядовой — «Убийца в маске»', p.evaluate("!JSON.stringify(ROSTER[1]).includes('porcelainmaid') && ROSTER[1].mel[0] === 'v_maskedassassin'"))
        p.close()

        print('обычная игра: уровень врагов сам — победа на арене +1, гибель −2 (v118)')
        cx2 = b.new_context(viewport={'width': 1280, 'height': 600}); p = cx2.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        p.goto(BASE, timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра')." + PD); time.sleep(1)
        chk('в меню и у выбора героя выбора уровня нет', not p.evaluate("!!document.getElementById('lvPick')") and 'Уровень' not in p.evaluate("document.getElementById('mMain').textContent + document.getElementById('hSel').textContent"))
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        GO = "(() => { const g = document.getElementById('pmGo'); if (PATHMAP.on && g && getComputedStyle(g).display !== 'none') for (const t of ['pointerdown', 'pointerup', 'click']) g.dispatchEvent(new PointerEvent(t, { bubbles: true })); })()"
        WINB = "(() => { const w = document.getElementById('stWin'); if (!w || getComputedStyle(w).display !== 'flex') return; const x = [...w.querySelectorAll('.bt')].find(x => /^(В Междумирье|Дальше|Играть)/.test(x.textContent)); if (x) x.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()"
        def fight():      # до начала боя: карта → «Продолжить», из отдыха — «Начать волну»
            t0 = time.time()
            while time.time() - t0 < 40:
                st = p.evaluate("({ ph: SHOP.phase, map: PATHMAP.on, tr: !!SHOP.transit, limbo: LIMBO.on, dead: P.dead > 0, en: enemies.length })")
                if st['ph'] == 'fight' and not st['limbo'] and not st['dead'] and st['en'] > 0: return True
                p.evaluate(WINB)
                if st['map']: p.evaluate(GO); time.sleep(1.2)
                elif st['limbo']: p.evaluate("LIMBO.leave()"); time.sleep(1)
                elif st['ph'] == 'rest' and not st['tr']: p.evaluate("SHOP.open && SHOP.closeShop(); SHOP.startWave()"); time.sleep(0.8)
                time.sleep(0.3)
            return False
        def win():        # зачистить арену (раунд)
            t0 = time.time()
            while time.time() - t0 < 180 and p.evaluate("SHOP.phase") == 'fight': p.evaluate("P.hp = P.maxHp; for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); p.evaluate(WINB); time.sleep(0.3)
            time.sleep(0.6)
        def die():        # погибнуть на арене
            p.evaluate("window.__pop = []; hurtPlayer(1e9)"); t0 = time.time()
            while time.time() - t0 < 20 and not p.evaluate("LIMBO.on"): p.evaluate(WINB); time.sleep(0.3)
            time.sleep(0.5)
        p.evaluate(r"window.__pop = []; window.__round = []; const _say = say; say = function (x, y, t) { if (/ровень|ровня|сильнее/i.test(t) && !/^Уровень \d+!/.test(t)) __pop.push(t); const m = /^Раунд отбит\s+\+(\d+)/.exec(t); if (m) __round.push(+m[1]); return _say.apply(this, arguments); }; 1")
        HID = "(() => { const t = [...document.querySelectorAll('body *')].filter(x => x.children.length === 0 && x.offsetParent !== null).map(x => x.textContent).join('|'); return { chip: !!document.getElementById('lvChip'), txt: /Уровень (врагов|сложности)|Уровень [↑↓]/.test(t) }; })()"
        def hidden(): h = p.evaluate(HID); return not h['chip'] and not h['txt'] and p.evaluate("__pop.length") == 0
        chk('новая игра → карта → первый бой', fight()); s0 = p.evaluate("({ n: LEVEL.n, lv: enemies.map(e => e.lv || 1), rk: LEVEL.rk() })")
        chk('новая игра начинается с уровня врагов 1, награда ×1,0; в бою уровень врагов не показан', s0['n'] == 1 and all(x == 1 for x in s0['lv']) and s0['rk'] == 1 and hidden(), [s0, p.evaluate(HID), p.evaluate('__pop')])
        REW = "(() => { const w = wave, base = (() => { let b = 0; for (let x = SHOP.roundFrom || w; x <= roundEnd(SHOP.roundFrom || w); x++) b += BAL.waveGold(x); return b; })(); const x0 = P.xp, l0 = P.lvl, n0v = LEVEL.n; P.lvl = 90; P.xp = 0; P.lvl = 90; P.xp = 0; LEVEL.load(1); gainXp(100); const xp1 = P.xp; P.xp = 0; LEVEL.load(n0v); gainXp(100); const xp = P.xp / xp1; P.lvl = l0; P.xp = x0; "               "const n0 = SHOP.drops.length; SHOP.onKill({ boss: true, x: P.x + 900, y: P.y, k: {}, type: 'b_blackknight' }); const bg = SHOP.drops[n0].amount; SHOP.drops.length = n0; return { xp, bg, bossBase: BAL.bossGold(w), base, rk: LEVEL.rk() }; })()"
        r1 = p.evaluate(REW)
        win(); s1 = p.evaluate("({ n: LEVEL.n, pop: __pop, save: SAVE.read().lv, round: __round })")
        chk('уровень 1: награда ×1,0 — опыт, золото босса и награда за арену как раньше', abs(r1['xp'] - 1) < 0.02 and r1['bg'] == round(r1['bossBase']) and s1['round'] == [round(r1['base'])], [r1, s1])
        chk('арена пройдена → уровень врагов 2 (записан в сохранение), всплывашки нет', s1['n'] == 2 and s1['pop'] == [] and s1['save'] == 2, s1)
        fight(); s2 = p.evaluate("enemies.map(e => e.lv)"); chk('следующая арена — враги 2-го уровня', len(s2) > 0 and all(x == 2 for x in s2), s2[:5])
        die(); s3 = p.evaluate("({ n: LEVEL.n, pop: __pop, save: SAVE.read().lv })")
        chk('гибель на уровне 2 → уровень 1 (ниже 1 не падает), всплывашки нет', s3['n'] == 1 and s3['pop'] == [] and s3['save'] == 1, s3)
        fight(); die(); s4 = p.evaluate("({ n: LEVEL.n, pop: __pop })"); chk('гибель на уровне 1 → остаётся 1', s4['n'] == 1 and s4['pop'] == [], s4)
        def climb(target):      # проходить арены, пока уровень не дойдёт до target; каждая пройденная арена должна дать ровно +1
            a = p.evaluate("[LEVEL.n, __round.length]")
            for i in range(16):
                if p.evaluate("LEVEL.n") >= target: break
                fight(); win()
            z = p.evaluate("[LEVEL.n, __round.length]"); return z[0] == target and z[0] - a[0] == z[1] - a[1], [a, z]
        ok6, d6 = climb(7); chk('шесть арен подряд → уровень 7 (каждая пройденная арена +1)', ok6, d6)
        fight(); die(); s5 = p.evaluate("({ n: LEVEL.n, pop: __pop })"); chk('гибель на уровне 7 → уровень 5', s5['n'] == 5 and s5['pop'] == [], s5)
        ok10, d10 = climb(10); fight(); win(); fight(); win()
        s6 = p.evaluate("({ n: LEVEL.n, wave })"); chk('пять арен → уровень 10; ещё две арены — выше 10 не растёт', ok10 and s6['n'] == 10, [d10, s6])
        fight(); s7 = p.evaluate("enemies.map(e => e.lv)"); chk('на уровне 10 враги 10-го уровня', len(s7) > 0 and all(x == 10 for x in s7), s7[:5])
        r10 = p.evaluate(REW); p.evaluate("__round.length = 0"); win(); rr = p.evaluate("__round")
        chk('уровень 10: награда ×1,9 — опыт, золото босса, награда за арену', abs(r10['rk'] - 1.9) < 1e-9 and abs(r10['xp'] - 1.9) < 0.02 and r10['bg'] == round(r10['bossBase'] * 1.9) and rr == [round(r10['base'] * 1.9)], [r10, rr])
        chk('уровень 10 и выше не растёт; в бою и после него уровень врагов нигде не показан, пометок о надбавке нет', p.evaluate("LEVEL.n") == 10 and hidden() and not any('%' in str(x) or 'бонус' in str(x) for x in p.evaluate('__pop')), [p.evaluate(HID), p.evaluate('__pop')])
        fight()
        p.reload(timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(6)
        p.mouse.click(400, 200); time.sleep(3.5); p.mouse.click(400, 200); time.sleep(3)
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Продолжить')." + PD); time.sleep(1.5); fight()
        chk('перезапуск → «Продолжить»: уровень из сохранения (10)', p.evaluate("LEVEL.n") == 10, p.evaluate("LEVEL.n"))
        cx2.close()
        p = page(''); chk('ошибок страницы нет', not errs, errs[:3]); p.close()

        print('тестовая сборка: выбор уровня')
        p = page('?levels')
        s = p.evaluate("({ pick: !!document.getElementById('lvPick'), n: document.querySelectorAll('#lvPick .b').length, test: LEVEL.TEST, cine: typeof CINE !== 'undefined' })")
        chk('на старте — экран «Уровень 1…10»', s['pick'] and s['n'] == 10 and s['test'], s); p.screenshot(path=os.path.join(OUT, '1_pick.png'))
        pick(p, 7)
        s = p.evaluate("({ n: LEVEL.n, wave, ph: SHOP.phase, world: WORLD, gold: SHOP.gold, bag: SHOP.bag.length, lvl: typeof PROG !== 'undefined' && PROG.lvl ? PROG.lvl : (P.lvl || P.level || 1), chip: (document.getElementById('lvChip') || {}).textContent, cine: CINE.on, "
                       "en: enemies.map(e => [e.type, e.lv, e.speed / (e.k.speed * BAL.speed(wave) * HARD.spdK())]) })")
        chk('уровень 7 → выбор героя → сразу первый бой мира 1 (без роликов)', s['n'] == 7 and s['wave'] == 1 and s['ph'] == 'fight' and s['world'] == 1 and not s['cine'], s)
        chk('герой «голый»: золота 0, сумка пуста, уровень героя 1', s['gold'] == 0 and s['bag'] == 0 and s['lvl'] == 1, s)
        chk('сверху — «Уровень 7 · сменить»', s['chip'] and 'Уровень 7' in s['chip'], s)
        chk('враги 7-го уровня: бег ×1,36', len(s['en']) > 0 and all(e[1] == 7 and abs(e[2] - 1.36) < 0.02 for e in s['en']), s['en'][:4])
        raw = p.evaluate("(() => { const g = Object.getPrototypeOf(Storage.prototype.getItem); return [Object.keys(localStorage).filter(k => !k.startsWith('lt_')), Object.keys(localStorage).filter(k => k.startsWith('lt_hw_run'))]; })()")
        p2 = page(''); real = p2.evaluate("localStorage.getItem('hw_run_mage')"); p2.close()
        chk('настоящее сохранение не тронуто, у теста своё (lt_*)', real == REAL and len(raw[1]) > 0, [real, raw])
        p.screenshot(path=os.path.join(OUT, '2_fight_lv7.png'))

        print('добавочные приёмы по уровням')
        p.evaluate(clear + "window.HARD_OFF = 1; for (let i = 0; i < 4; i++) { spawnEnemy('v_maskedassassin'); const e = enemies[enemies.length - 1]; e.x = P.x + 470 + 15 * i; e.y = P.y + 40 * i; e.lgCd = 0.4 + 0.3 * i; } spawnEnemy('jester'); window.__j = enemies[enemies.length - 1]; window.__lp = 0; window.__fan = 0;"
                   "const _lt = leapTo; leapTo = function (e) { if (!e.boss) __lp++; return _lt.apply(this, arguments); }; 1")
        t0 = time.time(); fan = 0
        while time.time() - t0 < 14:
            fan = max(fan, p.evaluate("shots.filter(s => s.own === 'e').length")); time.sleep(0.1)
        s = p.evaluate("({ lp: __lp, fan: __j.k.fan, base: KIND.jester.fan || 1 })")
        chk('уровень 7: ближние делают «Рывок»', s['lp'] >= 1, s)
        chk('уровень 7: стрелок бьёт веером (+2 снаряда)', s['fan'] == s['base'] + 2 and fan >= s['fan'], [s, fan])

        print('крюк мясника')
        def hook(kind, dodge):
            p.evaluate(clear + "spawnEnemyBase('%s'); const e = enemies[0]; e.x = P.x + 430; e.y = P.y; window.__e = e; window.__x0 = P.x; window.__y0 = P.y; window.__hp = P.hp;" % kind)
            st = set(); t0 = time.time(); shot = False; moved = False; dmin = 1e9
            while time.time() - t0 < 7:
                s = p.evaluate("({ h: HOOK.L.map(h => [h.st, h.t, h.wind - h.lock]), d: gdist(P, __e), pull: !!P.sk.pull, hit: HOOK.HITS.length })")
                if s['h']:
                    st.add(s['h'][0][0])
                    if dodge and not moved and s['h'][0][0] == 'aim' and s['h'][0][1] >= s['h'][0][2]: p.evaluate("P.y += 190; collide(P)"); moved = True      # линия замерла — уходим с неё
                    if s['h'][0][0] in ('fly', 'pull') and not shot: p.screenshot(path=os.path.join(OUT, '3_hook_%s_%s.png' % (kind, 'miss' if dodge else 'hit'))); shot = True
                elif st and ('pull' in st or 'back' in st): break
                dmin = min(dmin, s['d']); time.sleep(0.02)
            r = p.evaluate("({ d: gdist(P, __e), lost: __hp - P.hp, moved: Math.hypot(P.x - __x0, P.y - __y0) })"); r['st'] = sorted(st); return r
        r = hook('v_butcher', False)
        chk('Тюремный мясник: замах → крюк летит → герой притянут вплотную и получил урон', 'aim' in r['st'] and 'pull' in r['st'] and r['d'] < 150 and r['lost'] > 0, r)
        r = hook('v_butcher', True)
        chk('ушёл с линии после того, как она замерла, — промах: цепь вернулась, урона и притяжения нет', 'fly' in r['st'] and 'back' in r['st'] and 'pull' not in r['st'] and r['lost'] == 0, r)
        r = hook('el_butcher', False)
        chk('Главный мясник: крюк притягивает и бьёт', 'pull' in r['st'] and r['d'] < 150 and r['lost'] > 0, r)
        p.evaluate(clear + "spawnEnemyBase('v_butcher'); const e = enemies[0]; e.x = P.x + 430; e.y = P.y; window.__e = e;")
        p.wait_for_function("HOOK.L.length > 0 && HOOK.L[0].st === 'aim'", timeout=8000); p.evaluate("hurtEnemy(__e, 1e9)"); time.sleep(1.2)
        chk('мясника убили во время замаха — броска нет', p.evaluate("HOOK.L.length === 0 && !P.sk.pull"))

        print('босс и конец мира 1')
        p.evaluate(clear + "window.HARD_OFF = 0; wave = 9; SHOP.phase = 'rest'; ROUND.endW = 9; SHOP.mapShown = true; SHOP.startWave();"); time.sleep(1.5)
        if p.evaluate("PATHMAP.on"): p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        p.wait_for_function("enemies.some(e => e.boss)", timeout=20000)
        s = p.evaluate("(() => { const e = enemies.find(e => e.boss); return { lv: e.lv, type: e.type, wave, soft: SOFT1(), kit: HARD.KIT[e.type] }; })()")
        chk('босс мира 1 — 7-го уровня, мир не «мягкий»', s['lv'] == 7 and s['wave'] == 10 and not s['soft'], s)
        time.sleep(12); p.screenshot(path=os.path.join(OUT, '4_boss_lv7.png'))
        t0 = time.time()
        while time.time() - t0 < 25 and not p.evaluate("!!document.getElementById('lvPick')"): p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); time.sleep(0.4)
        if not p.evaluate("!!document.getElementById('lvPick')"): print('   состояние:', p.evaluate("({ ph: SHOP.phase, wave, en: enemies.map(e => [e.type, e.hp, e.dieT]), q: ROUND.queue, fin: ROUND.fin })"))
        p.wait_for_function("!!document.getElementById('lvPick')", timeout=3000); time.sleep(0.5)
        chk('босс убит — «Мир 1 пройден!» и снова выбор уровня', 'Мир 1 пройден' in p.evaluate("document.querySelector('#lvPick h1').textContent")); p.screenshot(path=os.path.join(OUT, '5_done.png'))
        pick(p, 10)
        s = p.evaluate("({ n: LEVEL.n, wave, gold: SHOP.gold, en: enemies.map(e => e.lv) })")
        chk('уровень 10 выбран — мир 1 с начала, враги 10-го уровня', s['n'] == 10 and s['wave'] == 1 and s['gold'] == 0 and all(x == 10 for x in s['en']), s)
        p.evaluate("P.hp = P.maxHp = 1e6"); time.sleep(20)
        chk('20 секунд боя на уровне 10 — без ошибок', not errs, errs[:3]); p.screenshot(path=os.path.join(OUT, '6_lv10.png'))
        chk('ошибок страницы нет', not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
