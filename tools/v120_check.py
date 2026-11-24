# -*- coding: utf-8 -*-
"""Правки v120 в настоящей странице: Сердце великана (лечит до 70 %), вампиризм −35 %, боссы зовут союзников, склянки пьются
сами, склянок не больше пяти, временная надпись уровня врагов; из аудита скорости — листы прошлого мира отпускаются, арена под
картой и меню не рисуется, прогресс героя не пишется на каждое убийство.
Сервер страниц поднимает сам (порт 8783). Запуск: python tools/v120_check.py     Код выхода 1 — если что-то не прошло."""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8783; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'v120'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:420]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        p.goto(BASE + '?allworlds&fakestore=web', timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
        s = p.evaluate("({ hid: arenaHidden(), go: LAZY.go, world: LAZY.world() })")
        chk('в главном меню арена под ним не рисуется; отложенная загрузка запущена', s['hid'] and s['go'] and s['world'] == 1, s)
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра')." + PD); time.sleep(1)
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(1.0)
        chk('на карте миров арена под ней не рисуется', p.evaluate("arenaHidden()"))
        GO = "for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"
        p.evaluate(GO); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(1.0)
        chk('в бою арена рисуется', not p.evaluate("arenaHidden()"))
        s = p.evaluate("({ t: (document.getElementById('lvTmp') || {}).textContent, d: getComputedStyle(document.getElementById('lvTmp')).display, n: LEVEL.n })")
        chk('временная надпись в бою: «Ур. врагов 1»', s['t'] == 'Ур. врагов 1' and s['d'] == 'block', s)
        clear = "enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = 199; ROUND.mini = null; shots.length = 0; SHOP.phase = 'fight'; P.dead = 0; window.HARD_OFF = 1; "
        p.evaluate("window.__god = setInterval(() => { if (window.__keep) { P.hp = Math.max(P.hp, P.maxHp * window.__keep); } }, 50); window.__keep = 0; 1")

        print('Сердце великана: лечит только до 70 %')
        s = p.evaluate("(() => { " + clear + "SHOP.bag = ['tarrasque']; SHOP.recompute(); ITEMFX.T.calm = 99; const r = {}; for (const f of [0.3, 0.69, 0.7, 0.9]) { P.hp = Math.round(P.maxHp * f); const h0 = P.hp; for (let i = 0; i < 40; i++) { ITEMFX.T.calm = 99; ITEMFX.tick(0.05); } r[f] = [h0 / P.maxHp, P.hp / P.maxHp]; } "
                       "P.hp = Math.round(P.maxHp * 0.5); ITEMFX.T.calm = 99; for (let i = 0; i < 1200; i++) { ITEMFX.T.calm = 99; ITEMFX.tick(0.05); } r.top = P.hp / P.maxHp; r.ds = ALL.tarrasque.ds; SHOP.bag = []; SHOP.recompute(); return r; })()")
        chk('с 50 % здоровья долечивает ровно до 70 % и останавливается; выше 70 % не лечит', abs(s['top'] - 0.7) < 0.005 and s['0.9'][1] <= s['0.9'][0] + 1e-6 and s['0.3'][1] > s['0.3'][0] and '70 %' in s['ds'], s)

        print('вампиризм −35 %')
        s = p.evaluate("(() => { const r = { ls: {}, cap: 0 }; for (const id of ['fang', 'vdagger', 'bblade', 'reaper', 'divine', 'satanic']) r.ls[id] = ALL[id].st.ls; SHOP.bag = ['satanic', 'divine', 'reaper', 'bblade']; SHOP.recompute(); r.cap = P.ls; "
                       "SHOP.bag = ['octarine']; SHOP.recompute(); r.spl1 = P.spl; SHOP.bag = ['bloodstone']; SHOP.recompute(); r.spl2 = P.spl; r.un = [ALL.satanic.act.ls, ALL.satanic.act.cap]; SHOP.bag = []; SHOP.recompute(); "
                       "r.leech = KIND.leechworm.leech; r.troll = String(SK.ON_HIT.mb_trollminer); return r; })()")
        want = {'fang': 0.0325, 'vdagger': 0.0585, 'bblade': 0.065, 'reaper': 0.078, 'divine': 0.078, 'satanic': 0.0975}
        chk('предметы: вампиризм ×0,65 (5→3,25 %, 9→5,85 %, 10→6,5 %, 12→7,8 %, 15→9,75 %), потолок 16 %', all(abs(s['ls'][k] - v) < 1e-9 for k, v in want.items()) and abs(s['cap'] - 0.16) < 1e-9, s)
        chk('вампиризм умений 6,5 % и 13 %; «Кровавая жажда» +32,5 % (потолок 49 %)', abs(s['spl1'] - 0.065) < 1e-9 and abs(s['spl2'] - 0.13) < 1e-9 and abs(s['un'][0] - 0.325) < 1e-9 and abs(s['un'][1] - 0.49) < 1e-9, s)
        chk('враги: Пиявец 39 %, Тролль-рудокоп в трансе 13 %', abs(s['leech'] - 0.39) < 1e-9 and '0.13' in s['troll'] and '0.2)' not in s['troll'], s)
        s = p.evaluate("(() => { " + clear + "SHOP.bag = ['fang']; SHOP.recompute(); spawnEnemyBase('v_butcher'); const e = enemies[0]; e.hp = e.max = 1e7; P.maxHp = 1e6; P.hp = 1000; P.crit = 0; HIT.atk = true; const h0 = e.hp; hurtEnemy(e, 1000); HIT.atk = false; const dealt = h0 - e.hp, heal = P.hp - 1000; SHOP.bag = []; SHOP.recompute(); return { dealt, heal, k: heal / dealt }; })()")
        chk('в бою: «Клык упыря» возвращает 3,25 % нанесённого ударом урона', abs(s['k'] - 0.0325) < 0.0005, s)

        print('склянки: не больше пяти, пьются сами')
        s = p.evaluate("(() => { const r = { max: [HEAL.max, FLASK_MAX] }; SHOP.gold = 1e6; for (const f of FLASKS) { SHOP.flasks[f.id] = 0; for (let i = 0; i < 9; i++) SHOP.buy('flask', f.id); } r.bought = Object.assign({}, SHOP.flasks); "
                       "SHOP.flasks.mana = 5; SHOP.pick({ kind: 'flask', id: 'mana' }); r.pick = SHOP.flasks.mana; return r; })()")
        chk('в лавке и с земли — не больше 5 склянок каждого вида, лечения тоже', s['max'] == [5, 5] and all(v == 5 for v in s['bought'].values()) and s['pick'] == 5, s)
        def auto(setup, sec=1.6):
            p.evaluate("(() => { " + clear + "AUTOFLASK.log.length = 0; SHOP.buffs.swift = 0; SHOP.buffs.power = 0; for (const k in SHOP.flasks) SHOP.flasks[k] = 3; P.maxHp = 1000; P.hp = 1000; P.mp = P.maxMp; for (const k in P.cd) P.cd[k] = 0; " + setup + " })()")
            time.sleep(sec); return p.evaluate("({ log: AUTOFLASK.log.slice(), fl: Object.assign({}, SHOP.flasks), buffs: Object.assign({}, SHOP.buffs), hp: P.hp / P.maxHp, mp: P.mp / P.maxMp })")
        FOE = "const foe = (t, d, n) => { for (let i = 0; i < n; i++) { spawnEnemyBase(t); const e = enemies[enemies.length - 1]; const a = i * 2.1; e.x = P.x + Math.cos(a) * d; e.y = P.y + Math.sin(a) * d * YK; e.speed = 0; e.atkCd = 1e9; e.skBusy = 1e9; e.sk = []; e.hp = e.max = 1e7; } }; "
        r = auto(FOE + "foe('v_chaplain', 900, 1); window.__keep = 0; P.hp = 250;")
        chk('здоровья меньше 30 % — сама пьётся склянка скорости (одна), лечение само не пьётся', r['log'] == ['swift'] and r['fl']['swift'] == 2 and r['fl']['heal'] == 3 and r['buffs']['swift'] > 0, r)
        time.sleep(1.5); r2 = p.evaluate("({ log: AUTOFLASK.log.slice(), fl: SHOP.flasks.swift })")
        chk('пока скорость действует, вторая такая же не тратится', r2['log'].count('swift') == 1 and r2['fl'] == 2, r2)
        r = auto(FOE + "foe('v_chaplain', 900, 1); P.hp = 1000; P.mp = P.maxMp * 0.2;")
        chk('маны меньше 25 % — сама пьётся склянка маны', r['log'] == ['mana'] and r['fl']['mana'] == 2 and r['mp'] > 0.25, r)
        r = auto(FOE + "foe('v_chaplain', 900, 3); P.hp = 1000;")
        chk('трое врагов далеко, здоровье полное — ничего не пьётся', r['log'] == [], r)
        r = auto(FOE + "foe('v_chaplain', 400, 4); P.hp = 1000;")
        chk('здоровья больше 70 % и рядом четверо врагов — сама пьётся склянка силы', r['log'] == ['power'] and r['buffs']['power'] > 0, r)
        r = auto(FOE + "foe('v_chaplain', 900, 1); spawnEnemy('mb_arbalest'); const m = enemies[enemies.length - 1]; m.x = P.x + 450; m.y = P.y; m.speed = 0; m.atkCd = 1e9; m.skBusy = 1e9; m.sk = []; m.mini = true; P.hp = 1000;")
        chk('рядом мини-босс — сила пьётся', r['log'] == ['power'], r)
        r = auto(FOE + "foe('v_chaplain', 100, 3); P.hp = 600; P.cd.q = 6; P.cd.e = 5;")
        chk('трое вплотную и умения на перезарядке — сама пьётся склянка холода, перезарядка сброшена', r['log'] == ['frost'] and r['fl']['frost'] == 2, r)
        r = auto(FOE + "foe('v_chaplain', 100, 3); P.hp = 600;")
        chk('трое вплотную, но умения готовы — холод не тратится', 'frost' not in r['log'], r)
        p.evaluate("window.__keep = 1; for (const k in SHOP.flasks) SHOP.flasks[k] = 0; 1")

        print('боссы зовут союзников')
        # своя чистая страница: бой босса идёт сам, герой бессмертен; смотрим, кто и когда пришёл на зов
        q = cx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:300]))
        q.goto(BASE + '?allworlds&fakestore=web', timeout=120000); q.wait_for_function("typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
        q.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра')." + PD); time.sleep(1)
        q.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        q.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(1.0)
        q.evaluate(GO); q.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(1.0)
        q.evaluate("window.__god = setInterval(() => { P.hp = P.maxHp; }, 50); hurtPlayer = function () {}; 1")      # герой не получает урона вовсе: бой босса должен идти, сколько нужно
        for m, boss in ((1, 'b_blackknight'), (4, 'b_toadking'), (8, 'b_ashlord')):
            q.evaluate("(() => { enemies.length = 0; ROUND.queue.length = 0; ROUND.mini = null; shots.length = 0; P.dead = 0; window.HARD_OFF = 0; wave = %d; applyWorld(%d); SHOP.phase = 'fight'; ROUND.endW = wave; P.maxHp = 1e9; P.hp = 1e9; spawnEnemy('%s'); const e = enemies.find(x => x.boss); e.x = P.x + 500; e.y = P.y; e.hp = e.max = 1e9; "
                       "window.__grp = []; window.__seen = new Set(); clearInterval(window.__gi); window.__gi = setInterval(() => { const n = enemies.filter(x => x.ally && !__seen.has(x)); if (n.length) { n.forEach(x => __seen.add(x)); __grp.push(n.map(x => x.type)); } }, 100); })()" % (m * 10, m, boss))
            t0 = time.time()
            while time.time() - t0 < 60 and q.evaluate("__grp.length") < 2: time.sleep(0.5)
            if m == 4: q.screenshot(path=os.path.join(OUT, '1_boss_allies.png'))
            groups = q.evaluate("__grp"); kinds = q.evaluate("[...new Set(ROSTER[%d].mel.concat(ROSTER[%d].rng))]" % (m, m)); sec = round(time.time() - t0)
            n_ok = all((len(g) == 1 if m == 1 else len(g) == 2) for g in groups)
            chk('мир %d: за %d с боя босс дважды призвал союзников — рядовые своего мира, в одном призыве разные виды (%s)' % (m, sec, 'по одному: мир 1 мягкий' if m == 1 else 'по двое'),
                len(groups) >= 2 and n_ok and all(len(set(g)) == len(g) and all(t in kinds for t in g) for g in groups), [groups, q.evaluate("(() => { const e = enemies.find(x => x.boss); return { ph: SHOP.phase, paused: SHOP.paused, dead: P.dead, limbo: LIMBO.on, map: PATHMAP.on, cover: ARENA_COVER.busy, boss: e ? [e.type, e.hSum, e.summonCd, e.hp > 0] : null, n: enemies.length, wave, w: WORLD, hid: document.hidden }; })()")])
        q.evaluate("(() => { clearInterval(window.__gi); enemies.length = 0; ROUND.queue.length = 0; wave = 40; applyWorld(4); SHOP.phase = 'fight'; ROUND.endW = 40; spawnEnemy('b_toadking'); const e = enemies.find(x => x.boss); e.hp = e.max = 1e9; e.x = P.x + 500; e.y = P.y; e.hSum = 0; for (let i = 0; i < 6; i++) { spawnEnemyBase('bogghoul'); const m = enemies[enemies.length - 1]; m.speed = 0; m.hp = m.max = 1e9; m.atkCd = 1e9; } return 1; })()"); time.sleep(9)
        chk('на арене уже шесть союзников — босс новых не зовёт', q.evaluate("enemies.filter(x => !x.boss).length") == 6, q.evaluate("enemies.map(x => x.type)"))
        q.evaluate("(() => { enemies.length = 0; ROUND.queue.length = 0; wave = 50; applyWorld(5); SHOP.phase = 'fight'; ROUND.endW = 50; spawnEnemy('b_forgegolem'); const e = enemies.find(x => x.boss); e.hp = e.max = 1e9; return 1; })()"); time.sleep(1.5)
        s = q.evaluate("(() => { const e = enemies.find(x => x.boss); return { skip: !!HARD.ALLY.skip.b_forgegolem, old: e.summonCd, hSum: e.hSum == null ? null : e.hSum }; })()")
        chk('Горн-Голем (мир 5) общего призыва не получил — он зовёт своей «Закалкой»; старый призыв трёх одинаковых выключен', s['skip'] and s['old'] > 1e8 and s['hSum'] is None, s)
        q.close()

        print('аудит скорости: память и запись')
        s = p.evaluate("(async () => { " + clear + "window.HARD_OFF = 1; SHOP.phase = 'rest'; corpses.length = 0; wave = 0; applyWorld(1); TUNE.warmWorld(1); await new Promise(r => setTimeout(r, 2500)); const ld = () => Object.keys(CHARS).filter(k => CHARS[k].loading).sort(); const w1 = ld(); "
                       "wave = 40; applyWorld(5); await new Promise(r => setTimeout(r, 2500)); const w5 = ld(); const k5 = new Set([...ROSTER[5].mel, ...ROSTER[5].rng, ...ROSTER[5].elite].map(t => KIND[t].ch)); "
                       "return { w1, w5, gone: w1.filter(k => !w5.includes(k)), k5ok: [...k5].every(k => w5.includes(k)), img1: w1.every(k => !w5.includes(k) ? Object.values(CHARS[k].mul).every(a => !a.img) : true) }; })()")
        chk('мир 1 → мир 5: листы злодеев мира 1 отпущены, листы мира 5 загружены', len(s['w1']) >= 5 and len(s['gone']) == len(s['w1']) and s['k5ok'] and s['img1'], s)
        s = p.evaluate("(async () => { wave = 0; applyWorld(1); SHOP.phase = 'fight'; ROUND.endW = 199; await new Promise(r => setTimeout(r, 300)); spawnEnemyBase('v_maskedassassin'); const e = enemies[enemies.length - 1]; const t0 = performance.now(); while (!e.ch.ok && performance.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50)); return { ok: e.ch.ok, ms: Math.round(performance.now() - t0) }; })()")
        chk('вернулись в мир 1 — его листы загрузились снова, враг со спрайтом', s['ok'], s)
        s = p.evaluate("(async () => { " + clear + "let n = 0; const key = 'hw_prog_' + HERO_ID, set = Storage.prototype.setItem; Storage.prototype.setItem = function (k) { if (k === key) n++; return set.apply(this, arguments); }; P.lvl = 50; P.xp = 0; "
                       "for (let i = 0; i < 20; i++) gainXp(1); const fast = n; await new Promise(r => setTimeout(r, 3400)); const later = n; const x = JSON.parse(localStorage.getItem(key)).xp; Storage.prototype.setItem = set; return { fast, later, saved: x, xp: P.xp }; })()")
        chk('20 убийств подряд — прогресс героя записан на диск один раз (отложенно), а не 20', s['fast'] == 0 and s['later'] == 1 and s['saved'] == s['xp'], s)
        chk('ошибок страницы нет', not errs, errs[:3])
        b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
