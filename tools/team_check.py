"""«Вместе»: два настоящих клиента (две страницы) против сервера. python team.py [ws-адрес] [сек боя]"""
import time, sys, json
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright
SRV = sys.argv[1] if len(sys.argv) > 1 else 'ws://127.0.0.1:8791'
SECS = int(sys.argv[2]) if len(sys.argv) > 2 else 60
BASE = sys.argv[3] if len(sys.argv) > 3 else 'http://127.0.0.1:8767/'
SH = "C:/Users/User/Desktop/night_19_11/coop"
ROOM = str(int(time.time()) % 9000 + 1000)
ST = "({ on: TEAM.on, host: TEAM.host, peer: !!TEAM.peer, pv: TEAM.pv.on, wave, world: WORLD, ph: SHOP.phase, en: enemies.length, mine: enemies.filter(e => e.own === (TEAM.host ? 0 : 1)).length, hp: Math.round(P.hp), mx: Math.round(P.maxHp), dead: P.dead > 0, limbo: LIMBO.on, lvl: P.lvl, gold: Math.round(SHOP.gold), q: ROUND.queue.length, endW: ROUND.endW, map: PATHMAP.on, tr: !!SHOP.transit })"
with sync_playwright() as pw:
    b = pw.chromium.launch()
    def mk(hero):
        cx = b.new_context(viewport={"width": 915, "height": 412}, has_touch=True, is_mobile=True); p = cx.new_page(); p.errs = []
        p.on("pageerror", lambda e: p.errs.append(str(e)[:300])); p.on("console", lambda m: p.errs.append('c: ' + m.text[:200]) if m.type == 'error' else None)
        p.goto(BASE + "?server=" + SRV); time.sleep(1); p.evaluate("localStorage.clear()"); p.reload(); time.sleep(5.5)
        p.evaluate("[...document.querySelectorAll('#mMain .b')][0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(1.5)
        if hero == 'archer': p.evaluate("(() => { const c = document.querySelectorAll('#hSel .card')[1]; for (const t of ['pointerdown', 'click']) c.dispatchEvent(new PointerEvent(t, { bubbles: true })); })()"); time.sleep(0.5)
        p.evaluate("(r) => { const m = [...document.querySelectorAll('#hSel .md')].find(d => /Вместе/.test(d.textContent)); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); document.querySelector('#hSel input').value = r; }", ROOM)
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(2.5)
        return p
    A = mk('mage'); print('A', A.evaluate(ST))
    # ведущий: карта выбора главы → «Продолжить»
    if A.evaluate("PATHMAP.on"): A.keyboard.press('Enter'); time.sleep(4)
    B = mk('archer'); time.sleep(2); print('A', A.evaluate(ST)); print('B', B.evaluate(ST))
    for p in (A, B): p.evaluate("P.maxHp = P.hp = 5000; window.__god = 1; setInterval(() => { if (window.__god) { P.dmgMul = 12; P.hp = P.maxHp; } if (SHOP.phase === 'fight' && !LIMBO.on) { held.key = true; const t = enemies.filter(e => e.hp > 0 && e.dieT == null).sort((a, b) => gdist(P, a) - gdist(P, b))[0]; if (t) { const d = gdist(P, t); stick.active = d > 420; if (stick.active) { stick.dx = (t.x - P.x) / d; stick.dy = (t.y - P.y) / YK / d; } for (const k of SK_IDS) if (P.cd[k] <= 0 && d < 500) cast(k); } } else { held.key = false; stick.active = false; } }, 200);")
    # бой начинает ведомый (просьба ведущему)
    B.keyboard.press('Enter'); time.sleep(3)
    if A.evaluate("PATHMAP.on"): A.keyboard.press('Enter'); time.sleep(4)
    t0 = time.time(); shot = 0; last = ''
    while time.time() - t0 < SECS:
        a, c = A.evaluate(ST), B.evaluate(ST)
        s = 'A в%d %s вр%d(мои %d) hp%d ур%d | B в%d %s вр%d(мои %d) hp%d ур%d' % (a['wave'], a['ph'], a['en'], a['mine'], a['hp'], a['lvl'], c['wave'], c['ph'], c['en'], c['mine'], c['hp'], c['lvl'])
        if s != last and int(time.time() - t0) % 4 == 0: print('%3d c' % (time.time() - t0), s); last = s
        if shot < 3 and a['ph'] == 'fight' and a['en'] > 3 and time.time() - t0 > 6 + shot * 8: A.screenshot(path=SH + '/klod_team_A_%d.png' % shot); B.screenshot(path=SH + '/klod_team_B_%d.png' % shot); shot += 1
        for p in (A, B):
            if p.evaluate("PATHMAP.on"): p.keyboard.press('Enter')
            if p.evaluate("SHOP.phase === 'rest' && !LIMBO.on && !PATHMAP.on && !SHOP.transit && P.dead <= 0 && !(SHOP.restT > 0)") and p is A: p.evaluate("SHOP.mapShown = true; SHOP.startWave()")
        time.sleep(1)
    print('итог A', A.evaluate(ST)); print('итог B', B.evaluate(ST))
    print('ошибки A', A.errs[:6]); print('ошибки B', B.errs[:6]); b.close()
