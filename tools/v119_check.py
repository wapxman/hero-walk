# -*- coding: utf-8 -*-
"""Правки v119 в настоящей странице: босс мира 5 (воскрешение вместо лечения), мана, 20 уровней умений и рывка, герой до 100,
12 слотов предметов (v120: в два ряда), временные цифры (v120: только криты героя). Сервер страниц поднимает сам (порт 8778) и сам останавливает (только свой процесс).
Запуск: python tools/v119_check.py        снимки — tests/v119/.  Код выхода 1 — если что-то не прошло."""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8778; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'v119'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:400]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        p.goto(BASE, timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра')." + PD); time.sleep(1)
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(0.8)
        p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(0.5)
        clear = "enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = 199; ROUND.mini = null; shots.length = 0; P.hp = P.maxHp = 1e6; window.HARD_OFF = 1; "

        print('мана')
        s = p.evaluate("(() => { P.st = { str: 0, agi: 0, int: 0 }; SHOP.bag = []; SHOP.recompute(); const base = P.mpRegen; P.st.int = 30; SHOP.recompute(); const i30 = P.mpRegen; P.st.int = 0; SHOP.bag = ['rune']; SHOP.recompute(); const rune = P.mpRegen; SHOP.bag = []; SHOP.recompute(); return { base, i30, rune, MP_REGEN }; })()")
        chk('восстановление маны: 3,7 в секунду (было 11), очко интеллекта +0,12 (было 0,35), предметы — как были', abs(s['base'] - 3.7) < 1e-6 and abs(s['i30'] - 7.3) < 1e-6 and abs(s['rune'] - 4.7) < 1e-6, s)
        p.evaluate(clear + "P.mp = 0; SHOP.phase = 'fight'; spawnEnemyBase('v_maskedassassin'); enemies[0].x = P.x + 5000; enemies[0].speed = 0; window.__t0 = performance.now()"); time.sleep(4)
        s = p.evaluate("[P.mp, (performance.now() - __t0) / 1000, SHOP.phase]")
        chk('в бою мана копится около 3,7 в секунду', s[2] == 'fight' and 2.6 < s[0] / s[1] < 4.6, s)

        print('прокачка: 20 уровней умений и рывка, герой до 100')
        s = p.evaluate("(() => { const r = { max: LVL_MAX, skMax: SK_MAX, ids: SK_IDS.slice() }; P.lvl = 1; P.xp = 0; P.sp = 0; P.stp = 0; for (const k of SK_IDS) P.skLv[k] = 1; "
                       "let g = 0; while (P.lvl < LVL_MAX && g++ < 5000) gainXp(1e7); r.lvl = P.lvl; r.sp = P.sp; gainXp(1e9); r.lvl2 = P.lvl; r.sp2 = P.sp; return r; })()")
        chk('уровни героя — до 100, одно очко умений за уровень (99 очков к 100-му), выше 100 не растёт', s['max'] == 100 and s['lvl'] == 100 and s['sp'] == 99 and s['lvl2'] == 100 and s['sp2'] == 99, s)
        chk('качаются пять: четыре умения и рывок, у каждого 20 уровней', s['skMax'] == 20 and s['ids'] == ['q', 'e', 'f', 'r', 'dash'], s)
        p.evaluate("progOpen(true)"); time.sleep(0.5)
        n = 0
        for i in range(120):      # жмём «+» у всех пяти по кругу, пока жмётся
            n += p.evaluate("(() => { let c = 0; for (const k of SK_IDS) { const b = PE.sk[k].querySelector('.pl'); if (!b.classList.contains('off')) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); c++; } } return c; })()")
        s = p.evaluate("({ sk: Object.assign({}, P.skLv), sp: P.sp, rows: SK_IDS.map(k => PE.sk[k].querySelector('b').textContent + ' ' + PE.sk[k].querySelector('em').textContent + ' | ' + PE.sk[k].querySelector('.tx div').textContent), tt: PE.tt.textContent, kn: PE.kn.textContent, "
                       "fit: (() => { const c = PE.box.querySelector('.c2').getBoundingClientRect(), l = PE.sk.dash.getBoundingClientRect(), pn = PE.box.querySelector('.pn').getBoundingClientRect(); return l.bottom <= pn.bottom - pn.height * 0.06 && l.height > 20; })(), "
                       "dmg: skDmg('q') / (P.skMul || 1), cd: skCd('q'), dcd: DASH.cdOf(), dd: DASH.distOf() })")
        chk('к 100-му уровню все пять доведены до 20 кнопками «+» в окне героя (95 очков, 4 в запасе)', n == 95 and all(v == 20 for v in s['sk'].values()) and s['sp'] == 4, [n, s['sk'], s['sp']])
        chk('окно героя: «уровень 100 из 100», пять строк с «20/20», строка рывка помещается', '100 из 100' in s['tt'] and all('20/20' in r for r in s['rows']) and s['rows'][4].startswith('Рывок') and s['fit'], [s['tt'], s['rows'], s['fit']])
        chk('20-й уровень: умение ×2,33 и перезарядка −38 %; рывок 2 с (v120) и дальность 326', abs(s['dmg'] - 2.33) < 0.001 and abs(s['cd'] - 0.62) < 0.001 and abs(s['dcd'] - 2.0) < 1e-6 and s['dd'] == 326, s)
        p.screenshot(path=os.path.join(OUT, '1_hero_window.png')); p.evaluate("progOpen(false)")
        s = p.evaluate("(() => { P.cd.dash = 0; P.cdMul = 1; const x0 = P.x, y0 = P.y; P.face = { x: 1, y: 0 }; const ok = cast('dash'); return { ok, cd: P.cd.dash, x0 }; })()"); time.sleep(0.6)
        d = p.evaluate("P.x") - s['x0']
        chk('рывок 20-го уровня в игре: перезарядка 2 с, пролетает дальше прежних 250', s['ok'] and abs(s['cd'] - 2.0) < 0.05 and d > 262, [s, d])

        print('12 слотов предметов')
        ids = ['bloodstone'] * 12 + ['rune']
        s = p.evaluate("(ids) => { SHOP.bag = []; SHOP.gold = 1e6; SHOP.bag = ids.slice(0, 11); const got = ids.slice(0, 11).map(() => true).concat([buyItem('rune'), buyItem('rune')]); SHOP.recompute(); SHOP.refresh(); const sl = [...document.querySelectorAll('#hInv > .hs')], r = sl.map(x => x.getBoundingClientRect()); "
                       "return { max: BAG_MAX, bag: SHOP.bag.length, got, slots: sl.length, filled: sl.filter(x => x.innerHTML).length, w: r[0].width, h: innerHeight, left: r[0].left, right: r[11].right, row: Math.abs(r[0].top - r[5].top) < 2 && Math.abs(r[6].top - r[11].top) < 2 && r[6].top > r[0].bottom - 2 && Math.abs(r[0].left - r[6].left) < 2, right5: r[5].right, bottom: r[11].bottom, vw: innerWidth }; }", ids)
        chk('в сумке 12 мест: 12-й предмет покупается, 13-й не влезает', s['max'] == 12 and s['bag'] == 12 and s['got'][11] and not s['got'][12], s)
        chk('внизу экрана 12 слотов в два ряда по шесть (v120: крупнее), все на экране и заполнены', s['slots'] == 12 and s['filled'] == 12 and s['row'] and s['left'] >= 0 and s['right5'] <= s['vw'] and s['bottom'] <= s['h'] and s['w'] > 0.075 * s['h'], s)
        p.screenshot(path=os.path.join(OUT, '2_slots.png'))
        p.evaluate("SHOP.phase = 'rest'; enemies.length = 0; SHOP.openShop()"); time.sleep(0.8)
        s = p.evaluate("(() => { const c = [...document.querySelectorAll('#shBag .ci')], r = c.map(x => x.getBoundingClientRect()), go = document.getElementById('shGo').getBoundingClientRect(); return { n: c.length, right: r[5].right, go: go.left, row: Math.abs(r[0].top - r[5].top) < 2 && Math.abs(r[6].top - r[11].top) < 2 && r[6].top > r[0].bottom - 2 && Math.abs(r[0].left - r[6].left) < 2, w: r[0].width, hud: document.querySelector('#hInv > .hs').getBoundingClientRect().width, bottom: r[11].bottom, h: innerHeight, pic: c.filter(x => x.firstElementChild && x.firstElementChild.getBoundingClientRect().width > 5).length }; })()")
        chk('в лавке сумка — 12 ячеек в два ряда по шесть (v121), того же размера, что слоты в бою; картинки предметов видны', s['n'] == 12 and s['row'] and abs(s['w'] - s['hud']) < 0.02 * s['h'] and s['bottom'] <= s['h'] + 1 and s['pic'] == 12, s)
        p.screenshot(path=os.path.join(OUT, '3_shop_bag.png')); p.evaluate("SHOP.closeShop(); SHOP.bag = []; SHOP.recompute(); SHOP.refresh()")
        s = p.evaluate("(() => { SHOP.bag = Object.keys(PARTS).slice(0, 12); SAVE.save(); const d = SAVE.read(); return d.bag.length; })()"); chk('12 предметов записываются в сохранение', s == 12, s)
        p.evaluate("SHOP.bag = []; SHOP.recompute(); SHOP.refresh()")

        print('временное: крупные цифры критов героя; урона врагов на экране больше нет (v120)')
        p.evaluate(clear + "SHOP.phase = 'fight'; P.hp = P.maxHp = 5000; spawnEnemy('v_maskedassassin'); window.__e = enemies[0]; __e.x = P.x + 60; __e.y = P.y; __e.speed = 0; __e.hp = __e.max = 1e7; window.__hp = P.hp; DMGSHOW.N.length = 0; 1")
        time.sleep(3.5)
        s = p.evaluate("({ lost: __hp - P.hp, big: DMGSHOW.N.length, small: texts.filter(t => /^-\\d+$/.test(String(t.txt))).length })")
        chk('удары врага по герою: обычные мелкие цифры, крупных нет', s['lost'] > 0 and s['big'] == 0, s)
        s = p.evaluate("(() => { const c0 = P.crit; P.crit = 1; HIT.atk = true; const n0 = texts.length; hurtEnemy(__e, 50); HIT.atk = false; const big = DMGSHOW.N.map(n => n.v), yellow = texts.slice(n0).filter(t => t.col === DMGSHOW.CRIT).length; "
                       "P.crit = 0; DMGSHOW.N.length = 0; const n1 = texts.length; hurtEnemy(__e, 50); const plain = texts.length - n1, big2 = DMGSHOW.N.length; P.crit = c0; return { big, yellow, plain, big2 }; })()")
        chk('крит героя — одна крупная цифра (обычной жёлтой нет); обычный удар — обычная цифра', len(s['big']) == 1 and s['yellow'] == 0 and s['plain'] == 1 and s['big2'] == 0, s)
        p.evaluate("(P.crit = 1, HIT.atk = true, hurtEnemy(__e, 50), HIT.atk = false, P.crit = 0, 1)"); time.sleep(0.25); p.screenshot(path=os.path.join(OUT, '4_crit_number.png'))
        s = p.evaluate("(() => { const src = drawEnemy.toString() + DMGSHOW.toString; return { label: !!Object.keys(DMGSHOW).includes('hit') }; })()")
        chk('урона врага у полоски здоровья больше нет', not s['label'], s)

        print('босс мира 5: «Закалка» больше не лечит, воскрешает двух разных рядовых')
        p.evaluate(clear + "wave = 49; applyWorld(5); SHOP.phase = 'fight'; ROUND.endW = 50; wave = 50; spawnEnemy('b_forgegolem'); window.__b = enemies.find(e => e.boss); __b.x = P.x + 300; __b.y = P.y; __b.speed = 0; __b.silT = 1e6; __b.hp = __b.max * 0.5; window.__r = []; 1"); time.sleep(1.0)
        res = []
        for k in range(3):
            p.evaluate("(() => { const L = SK.DEF.b_forgegolem, i = L.findIndex(s => s.ph === 'Закалка'); (__b.sk || []).forEach(x => { x.cd = 1e6; }); __b.skHp = 0; window.__n0 = enemies.length; window.__hp0 = __b.hp; __b.act = null; L[i].cast(__b); })()"); time.sleep(0.4)
            if k == 0: p.screenshot(path=os.path.join(OUT, '5_forgegolem_raise.png'))
            time.sleep(5.2)
            res.append(p.evaluate("({ add: enemies.slice(__n0).map(e => e.type), heal: __b.hp - __hp0, mark: true, kinds: [...new Set(ROSTER[5].mel.concat(ROSTER[5].rng))] })"))
            p.evaluate("for (const e of enemies.slice()) if (!e.boss) hurtEnemy(e, 1e9)"); time.sleep(0.3)
        chk('здоровье босса за «Закалку» не растёт', all(r['heal'] <= 0.5 for r in res), [r['heal'] for r in res])
        chk('каждый раз появляются два РАЗНЫХ вида рядовых врагов мира 5', all(len(r['add']) == 2 and r['add'][0] != r['add'][1] and all(t in r['kinds'] for t in r['add']) for r in res), [r['add'] for r in res])
        s = p.evaluate("(() => { __b.act = null; const L = SK.DEF.b_forgegolem, i = L.findIndex(s => s.ph === 'Закалка'); const m0 = SK.MARKS.length; L[i].cast(__b); return { marks: SK.MARKS.length - m0, img: SK.MARKS.slice(m0).map(m => String(m.img && (m.img.src || m.img)).split('/').pop().split('?')[0]) }; })()")
        chk('свечение «Закалки» на боссе осталось прежним (лист fg_temper)', s['marks'] >= 1 and any('fg_temper' in x for x in s['img']), s)
        chk('ошибок страницы нет', not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
