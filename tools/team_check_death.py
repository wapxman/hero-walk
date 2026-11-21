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
    time.sleep(6)
    S2 = lambda p: p.evaluate(ST)
    pr = lambda t: print(t, '| A', {k: v for k, v in S2(A).items() if k in ('wave', 'ph', 'en', 'mine', 'limbo', 'dead', 'host')}, '| B', {k: v for k, v in S2(B).items() if k in ('wave', 'ph', 'en', 'mine', 'limbo', 'dead', 'host')})
    for p in (A, B): p.evaluate("window.__god = 0; P.dmgMul = 0.2")
    pr('бой идёт')
    # 1. ведомый гибнет
    B.evaluate("P.hp = 1; hurtPlayer(1e9)"); time.sleep(5); pr('B погиб → Междумирье (все злодеи должны стать A)')
    B.screenshot(path=SH + '/klod_team_limbo_B.png'); A.screenshot(path=SH + '/klod_team_limbo_A.png')
    B.evaluate("LIMBO.leave()"); time.sleep(6)
    if B.evaluate("PATHMAP.on"): B.keyboard.press('Enter'); time.sleep(4)
    pr('B вернулся (должен быть в бою, видеть злодеев)')
    # 2. ведущий гибнет
    A.evaluate("P.hp = 1; hurtPlayer(1e9)"); time.sleep(5); pr('A погиб (злодеи должны стать B)')
    time.sleep(4); pr('…через 4 с')
    A.evaluate("LIMBO.leave()"); time.sleep(4)
    if A.evaluate("PATHMAP.on"): A.keyboard.press('Enter'); time.sleep(5)
    pr('A вернулся и начал раунд заново'); time.sleep(6); pr('…через 6 с')
    # 3. оба гибнут
    for p in (A, B): p.evaluate("P.hp = 1; hurtPlayer(1e9)")
    time.sleep(5); pr('оба погибли')
    B.evaluate("LIMBO.leave()"); time.sleep(3); A.evaluate("LIMBO.leave()"); time.sleep(4)
    for p in (A, B):
        if p.evaluate("PATHMAP.on"): p.keyboard.press('Enter')
    time.sleep(6); pr('оба вернулись')
    for p in (A, B): p.evaluate("window.__god = 1")
    time.sleep(25); pr('через 25 с боя')
    # 4. ведущий выходит
    ea = A.errs[:6]; A.close(); time.sleep(3); print('A вышел | B', {k: v for k, v in S2(B).items() if k in ('wave', 'ph', 'en', 'mine', 'host', 'peer', 'q')})
    time.sleep(25); print('B один, через 25 с', {k: v for k, v in S2(B).items() if k in ('wave', 'ph', 'en', 'mine', 'host', 'peer', 'q')})
    print('ошибки A', ea); print('ошибки B', B.errs[:6]); b.close()
