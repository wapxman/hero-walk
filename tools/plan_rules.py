"""Проверка правил плана миров v101 в настоящей странице (не бот): каждое правило ставится руками и смотрится результат.
Нужен обычный сервер игры на 8767: python -m http.server 8767 --bind 127.0.0.1. Запуск: python tools/plan_rules.py"""
import time, sys
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
SH = "C:/Users/User/Desktop/night_19_11/plan2111"
import os; os.makedirs(SH, exist_ok=True)
with sync_playwright() as pw:
    b = pw.chromium.launch(); cx = b.new_context(viewport={"width": 915, "height": 412}, has_touch=True, is_mobile=True, device_scale_factor=1.5); p = cx.new_page(); errs = []
    p.on("pageerror", lambda e: errs.append(str(e)[:300]))
    E = p.evaluate
    def boot(w, bag=None, lvl=None):
        p.goto("http://127.0.0.1:8767/"); time.sleep(1)
        E("(a) => { localStorage.clear(); localStorage.setItem('hw_run_mage', JSON.stringify({ wave: a[0], best: a[0], lvl: a[2] || 10 + a[0], gold: 3000, bag: a[1] || [], hp: 99999 })); }", [w, bag, lvl])
        p.reload(); time.sleep(5.5)
        E("[...document.querySelectorAll('#mMain .b')][0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(2); p.keyboard.press('Enter'); time.sleep(4.5)
        if E("PATHMAP.on"): p.keyboard.press('Enter'); time.sleep(4)
        if E("SHOP.phase") != 'fight': E("SHOP.startWave()"); time.sleep(2)
        if E("PATHMAP.on"): p.keyboard.press('Enter'); time.sleep(4)
        E("window.__say = []; { const s = say; say = function (x, y, t, c) { __say.push(String(t)); return s(x, y, t, c); }; }")
    clear = "for (const e of enemies) { e.hp = 0; e.dieT = 0; } enemies.length = 0; ROUND.queue.length = 0; ROUND.mini = null; P.maxHp = 5000; P.hp = 5000; STATUS.clear(); SK.S.hex = 0;"
    ok = lambda name, cond, info='': print(('OK   ' if cond else 'ПЛОХО ') + name, info)

    # ---- мир 1: подсказка, фласка, заход с разных сторон, урон рядовых ----
    boot(1)
    r = E("(() => { const a = []; for (let i = 0; i < 5; i++) a.push(pickSpawn()); return [new Set(a.map(s => s.x + ':' + s.y)).size, SPAWNS.length, FIRST(1), SOFT1()]; })()")
    ok('мир 1: входы по очереди', r[0] == r[1] or r[0] == 5, r)
    r = E("(() => { " + clear + " ROUND.queue = ['porcelainmaid']; spawnEnemyBase('porcelainmaid'); const e = enemies[0]; return [e.dm, BAL.dmg(wave) * e.k.pw]; })()")
    ok('мир 1: рядовые бьют на 20 % слабее', abs(r[0] / r[1] - 0.8) < 0.01, r)
    E("localStorage.removeItem('hw_hint_ring'); " + clear + " ROUND.queue = []; ROUND.endW = wave; for (let i = 0; i < 5; i++) { spawnEnemyBase('porcelainmaid'); const e = enemies[i]; e.x = P.x + 120 * Math.cos(i * 1.26); e.y = P.y + 80 * Math.sin(i * 1.26); }"); time.sleep(0.8)
    r = E("[!!document.querySelector('#hintRing.on'), document.querySelector('#hintRing') && document.querySelector('#hintRing').textContent, localStorage.getItem('hw_hint_ring')]")
    ok('мир 1: подсказка «Окружили — рывок!»', r[0] and r[2] == '1', r); p.screenshot(path=SH + '/klod_hint_dash.png')
    E("P.hp = P.maxHp * 0.4; SHOP.flasks.heal = 3;"); time.sleep(0.6)
    r = E("[document.querySelector('#hFlask').classList.contains('low')]"); ok('фласка пульсирует при здоровье ≤ 50 %', r[0], r); p.screenshot(path=SH + '/klod_flask_pulse.png')
    E("P.hp = P.maxHp"); time.sleep(0.5); ok('фласка не пульсирует при полном здоровье', not E("document.querySelector('#hFlask').classList.contains('low')"))
    time.sleep(5); ok('подсказка гаснет', not E("!!document.querySelector('#hintRing.on')"))
    # копьё знаменосца без оглушения
    E(clear + " __say.length = 0; ROUND.queue = ['bogghoul']; ROUND.mini = null; spawnEnemyBase('mb_bannerlord'); const e = enemies[0]; e.mini = true; e.x = P.x + 400; e.y = P.y; window.__st = []; const sa = STATUS.add; STATUS.add = function (k) { __st.push(k); return sa.apply(this, arguments); };"); time.sleep(6)
    r = E("[__say.filter(t => /копь|пригвожд/i.test(t)), __st.slice(), P.hp < 5000]"); ok('мир 1: «Королевское копьё» без оглушения', 'stun' not in r[1] and len(r[0]) > 0, r)

    # ---- мир 4: ведьма, очередь ----
    boot(34)
    E(clear + " ROUND.queue = ['bogghoul']; spawnEnemyBase('toadwitch'); const e = enemies[0]; e.x = P.x + 420; e.y = P.y; window.__w = e;"); t0 = time.time(); seen = False; hexmax = 0
    while time.time() - t0 < 8:
        r = E("[SK.PR.length, SK.S.hex]"); seen = seen or r[0] > 0; hexmax = max(hexmax, r[1]); time.sleep(0.05)
    ok('мир 4: проклятие ведьмы летит снарядом, лягушкой не дольше 1,5 с', seen and 0 < hexmax <= 1.5, [seen, hexmax])
    E(clear + " ROUND.queue = ['bogghoul']; spawnEnemyBase('toadwitch'); const e = enemies[0]; e.x = P.x + 420; e.y = P.y;"); t0 = time.time(); hexmax = 0; shot = False
    while time.time() - t0 < 8:
        r = E("(() => { const pr = SK.PR[0]; if (pr && SK.dist(pr, P) < 130) P.dashI = 0.3; return [SK.PR.length, SK.S.hex]; })()"); hexmax = max(hexmax, r[1])
        if r[0] and not shot: shot = True; p.screenshot(path=SH + '/klod_witch_shot.png')
        time.sleep(0.03)
    ok('мир 4: рывок сквозь снаряд ведьмы спасает', hexmax == 0, hexmax)
    r = E("(() => { " + clear + " ROUND.queue = ['toadwitch', 'toadwitch', 'el_drowned', 'el_witch', 'el_drowned', 'bogghoul', 'toadwitch']; const out = []; for (let i = 0; i < 12 && ROUND.queue.length; i++) { const t = takeSpawn(); out.push(t || '-'); if (t) spawnEnemy(t); } return out; })()")
    ok('мир 4: не больше одной ведьмы и двух «жёстких» злодеев сразу (третий ждёт)', r[:3] == ['toadwitch', 'el_drowned', 'bogghoul'] and r[3:10] == ['-'] * 7, r)
    E("(() => { " + clear + " ROUND.queue = ['toadwitch', 'el_drowned', 'el_witch', 'el_drowned', 'bogghoul']; for (let i = 0; i < 3; i++) spawnEnemy(takeSpawn()); })()")
    r = E("(() => { for (const e of enemies) if (e.type === 'toadwitch' || e.type === 'el_drowned') { e.hp = 0; e.dieT = 0; } const out = []; for (let i = 0; i < 6 && ROUND.queue.length; i++) { const t = takeSpawn(); out.push(t || '-'); if (t) spawnEnemy(t); } return out; })()")
    ok('мир 4: когда место освободилось — элита выходит', any(x in ('el_drowned', 'el_witch') for x in r), r)
    # утопленник: без оглушения
    E(clear + " __st = []; window.__st = []; const sa = STATUS.add; STATUS.add = function (k) { __st.push(k); return sa.apply(this, arguments); }; ROUND.queue = ['bogghoul']; spawnEnemyBase('drownedknight'); const e = enemies[0]; e.x = P.x + 300; e.y = P.y; e.speed = 0; window.__hp = P.hp;"); time.sleep(5)
    r = E("[__st.slice(), P.hp < __hp, P.slowT > 0 || true]"); ok('мир 4: «Водяной столб» рядового без оглушения', 'stun' not in r[0] and r[1], r)

    # ---- мир 7: обмен ----
    boot(69); time.sleep(1)
    r = E("(() => { const e = enemies.find(e => e.boss); if (!e) return null; e.hp = e.max * 0.3; P.maxHp = 5000; P.hp = 5000; e.sk = e.sk || SK.DEF[e.type].map(() => ({ cd: 99 })); const i = SK.DEF[e.type].findIndex(s => s.ph === 'Обмен отражений'); e.sk.forEach((s, j) => s.cd = j === i ? 0 : 99); e.rf = e.sh = 99; return i; })()")
    time.sleep(0.5); p.screenshot(path=SH + '/klod_swap_warn.png'); time.sleep(2.5)
    r = E("[P.hp / P.maxHp, __say.filter(t => /Обмен|поменялось/.test(t))]"); ok('мир 7: обмен забирает не больше 22 % здоровья', 0.77 <= r[0] < 0.8, r)

    # ---- мир 8: Рок ----
    boot(79); time.sleep(1)
    force = "(() => { const e = enemies.find(e => e.boss); if (!e) return null; e.hp = e.max; P.maxHp = 9000; P.hp = 9000; STATUS.clear(); e.ccEnd = 0; e.sk = e.sk || SK.DEF[e.type].map(() => ({ cd: 99 })); const i = SK.DEF[e.type].findIndex(s => s.ph === 'Рок'); e.sk.forEach((s, j) => s.cd = j === i ? 0 : 99); e.mt1 = e.rg = 99; e.x = P.x + DX; e.y = P.y; e.speed = 0; __say.length = 0; return i; })()"
    E(force.replace('DX', '300')); time.sleep(1.2); p.screenshot(path=SH + '/klod_doom_warn.png'); s1 = E("P.ss.silence"); time.sleep(1.2); s2 = E("P.ss.silence")
    ok('мир 8: «Рок» — сначала метка, потом безмолвие', not (s1 > 0) and s2 > 0, [s1, s2, E("__say.filter(t => /Рок/.test(t))")])
    time.sleep(7); E(force.replace('DX', '300')); time.sleep(1.0); E("P.x -= 500; collide(P)"); time.sleep(1.5); s3 = E("P.ss.silence")
    ok('мир 8: от «Рока» можно уйти', not (s3 > 0), [s3, E("__say.filter(t => /Рок/.test(t))")])

    # ---- мир 9: кара ----
    boot(89); time.sleep(1)
    E("(() => { const e = enemies.find(e => e.boss); e.lt = 0; e.sl = 99; if (e.sk) e.sk.forEach(s => s.cd = 99); e.x = P.x + 400; e.y = P.y; fx.length = 0; })()"); time.sleep(1.3)
    r = E("fx.filter(f => f.type === 'tele').length"); p.screenshot(path=SH + '/klod_kara.png'); ok('мир 9: «Небесная кара» — шесть ударов', r == 6, r)

    # ---- мир 10: чернокнижник, Линка ----
    boot(94, ['linken'], 95); time.sleep(1)
    r = E("(() => { const q = []; for (let i = 0; i < 30; i++) { wave = 96; nextWave(); q.push(...ROUND.queue); } wave = 97; nextWave(); const el = ROUND.queue.filter(t => /^el_/.test(t)).length; return [q.includes('v_warlock'), el]; })()")
    ok('мир 10: чернокнижник в волнах, элиты три', r[0] and r[1] == 3, r)
    E(clear + " for (const k in RCD) RCD[k] = 0; ROUND.queue = ['bogghoul']; spawnEnemyBase('v_warlock'); const e = enemies[0]; e.x = P.x + 350; e.y = P.y; e.speed = 0; e.atkCd = 99; window.__hp = P.hp; window.__fd = 55 * e.dm; __say.length = 0;"); time.sleep(1.0); p.screenshot(path=SH + '/klod_finger_mark.png'); time.sleep(3.0)
    r = E("[__hp - P.hp, __fd, RCD.linken > 0, __say.filter(t => /Палец|отраж/.test(t))]"); ok('мир 10: Линка гасит «Палец смерти»', r[0] < r[1] * 0.5 and r[2], r)
    E("SHOP.bag = []; SHOP.recompute(); P.maxHp = 5000; P.hp = 5000; window.__hp = P.hp; const e = enemies[0]; if (e && e.sk) { e.sk[0].cd = 0; e.atkCd = 99; }"); time.sleep(7)
    r = E("[__hp - P.hp, __fd]"); ok('мир 10: без Линки «Палец» бьёт', r[0] >= r[1] * 0.9, r)
    print('ошибки:', errs[:6]); b.close()
