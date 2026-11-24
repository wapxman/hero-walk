# -*- coding: utf-8 -*-
"""Тестовый режим «уровни сложности» и крюк мясника в настоящем приложении на эмуляторе или телефоне (v117, отладочная сборка):
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_levels.py
Открывает в приложении адрес с ?levels (то же, что window.LEVEL_TEST в сборке test-levels). Касания — настоящие (adb shell input tap).
Снимки экрана — tests/levels/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'levels'); os.makedirs(OUT, exist_ok=True)
def connect():
    pages = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
    pg = next(x for x in pages if 'duelarena.app' in x['url'])
    return websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True)
ws = connect(); n = 0
def ev(code):
    global n; n += 1
    ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression': 'JSON.stringify(' + code + ')', 'returnByValue': True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n:
            if 'exceptionDetails' in m['result']: return {'err': json.dumps(m['result']['exceptionDetails'], ensure_ascii=False)[:300]}
            v = m['result'].get('result', {}).get('value'); return json.loads(v) if v not in (None, 'undefined') else None
def shot(name): open(os.path.join(OUT, 'emu_' + name + '.png'), 'wb').write(subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
def tap_el(js):
    r = ev("(() => { const b = %s; if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio]; })()" % js)
    if r: subprocess.run([ADB, 'shell', 'input', 'tap', str(int(r[0])), str(int(r[1]))])
    return r
def wait(code, sec=40):
    t = time.time()
    while time.time() - t < sec:
        try:
            if ev(code) is True: return True
        except Exception: pass
        time.sleep(0.4)
    return False
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + ('  ' + str(extra)[:260] if extra and not ok else ''))
    if not ok: bad.append(name)

real = ev("localStorage.getItem('hw_cine')")
ev("(sessionStorage.removeItem('hw_lv'), location.href = location.origin + location.pathname + '?levels', 1)"); time.sleep(6); ws = connect()
chk('экран «Уровень 1…10» на старте', wait("typeof LEVEL !== 'undefined' && LEVEL.TEST && document.querySelectorAll('#lvPick .b').length === 10")); time.sleep(1); shot('1_pick')
tap_el("document.querySelectorAll('#lvPick .b')[2]"); time.sleep(6); ws = connect()
chk('касание «Уровень 3» → выбор героя', wait("typeof LEVEL !== 'undefined' && LEVEL.n === 3 && getComputedStyle(document.getElementById('hSel')).display === 'flex'")); time.sleep(1.5)
tap_el("document.querySelector('#hSel .go')")
chk('«В бой» → первый бой мира 1, без роликов', wait("SHOP.phase === 'fight' && wave === 1 && !CINE.on && enemies.length > 0", 30)); time.sleep(2); shot('2_fight_lv3')
s = ev("({ gold: SHOP.gold, bag: SHOP.bag.length, lv: enemies.map(e => e.lv), chip: (document.getElementById('lvChip') || {}).textContent, raw: Object.keys(localStorage).filter(k => k.indexOf('lt_') === 0).length })")
chk('герой «голый», враги 3-го уровня, сверху «Уровень 3 · сменить», сохранение отдельное', s['gold'] == 0 and s['bag'] == 0 and all(x == 3 for x in s['lv']) and 'Уровень 3' in (s['chip'] or '') and s['raw'] > 0, s)
# крюк: один мясник в стороне от героя
ev("(enemies.length = 0, ROUND.queue.length = 0, ROUND.endW = 99, ROUND.mini = null, P.hp = P.maxHp = 1e6, window.__hp = P.hp, spawnEnemyBase('v_butcher'), window.__e = enemies[0], __e.x = P.x + 430, __e.y = P.y, 1)")
ev("(window.__st = {}, window.__iv = setInterval(() => { for (const h of HOOK.L) { __st[h.st] = 1; if (h.st === 'fly' && h.len > 200 && !window.__frz) { window.__frz = 1; STORE.freeze(true); } } }, 8), 1)")      # в полёте игра на миг замирает — для снимка
t = time.time(); aim = False
while time.time() - t < 12:
    h = ev("HOOK.L.map(h => h.st)")
    if h and h[0] == 'aim' and not aim: aim = True; shot('3_hook_aim')
    if ev("!!window.__frz"): time.sleep(0.3); shot('3_hook_fly'); ev("(STORE.freeze(false), 1)"); break
    time.sleep(0.03)
time.sleep(2.5); st = set(ev("Object.keys(__st)")); ev("(clearInterval(__iv), 1)")
r = ev("({ d: gdist(P, __e), lost: __hp - P.hp })")
chk('крюк мясника: замах → полёт → герой притянут и получил урон', 'aim' in st and 'pull' in st and r['d'] < 150 and r['lost'] > 0, [sorted(st), r])
tap_el("document.getElementById('lvChip')"); time.sleep(1)
chk('«сменить» → снова выбор уровня', wait("!!document.getElementById('lvPick')", 5)); shot('4_change')
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
