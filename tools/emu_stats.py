# -*- coding: utf-8 -*-
"""Статистика в настоящем приложении на эмуляторе или телефоне (отладочная сборка С КЛЮЧАМИ, свежие данные приложения):
  запустить приложение и сразу:  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_stats.py
Проходит запуск, начинает игру, выигрывает арену и гибнет; смотрит, что настоящий сервер GameAnalytics отвечает 200.
ВНИМАНИЕ: события уходят в настоящую статистику игры (одна тестовая установка). Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
pages = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
pg = next(x for x in pages if 'duelarena.app' in x['url'])
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True); n = 0; net = {}; resp = []
def pump(m):
    if m.get('method') == 'Network.requestWillBeSent' and 'gameanalytics' in m['params']['request']['url']: net[m['params']['requestId']] = m['params']['request']['url'].split('?')[0]
    if m.get('method') == 'Network.responseReceived' and m['params']['requestId'] in net: resp.append((__import__('re').sub(r'/[0-9a-f]{32}/', '/<ключ>/', net[m['params']['requestId']].replace('https://api.gameanalytics.com', '')), m['params']['response']['status']))
def call(method, params=None):
    global n; n += 1; ws.send(json.dumps({'id': n, 'method': method, 'params': params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n: return m
        pump(m)
def ev(code):
    m = call('Runtime.evaluate', {'expression': 'JSON.stringify(' + code + ')', 'returnByValue': True})
    if 'exceptionDetails' in m['result']: return {'err': json.dumps(m['result']['exceptionDetails'], ensure_ascii=False)[:300]}
    v = m['result'].get('result', {}).get('value'); return json.loads(v) if v not in (None, 'undefined') else None
def tap_el(sel):
    r = ev("(() => { const b = document.querySelector(%s); if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio]; })()" % json.dumps(sel))
    if r: subprocess.run([ADB, 'shell', 'input', 'tap', str(int(r[0])), str(int(r[1]))])
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + ('  ' + str(extra)[:300] if extra else ''))
    if not ok: bad.append(name)
def until(code, sec):
    t = time.time()
    while time.time() - t < sec:
        if ev(code): return True
        time.sleep(0.4)
    return False
call('Network.enable')
print('страница:', pg['url'], '| версия', ev("typeof V === 'string' ? V : ''"))
chk('в приложении: не тест, файл ключей ещё не спрашивали или уже есть', ev("!METRICS.TEST && METRICS.on && METRICS.keys !== 'no'"), ev("[METRICS.TEST, METRICS.on, METRICS.keys, METRICS.state]"))
t0 = time.time()
while time.time() - t0 < 150 and not ev("getComputedStyle(document.getElementById('mMain')).display === 'block' && !CINE.on"):
    if ev("!!document.getElementById('lgPick')"): time.sleep(1.0); tap_el('#lgPick [data-l=ru]')
    elif ev("!!document.querySelector('#cine .skip')"): time.sleep(1.0); tap_el('#cine .skip')
    time.sleep(0.5)
ev("([...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1)"); time.sleep(1.5)
ev("(document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown')), 1)")
until("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", 30); time.sleep(1.5); tap_el('#pmGo')
t0 = time.time()
while time.time() - t0 < 90 and not ev("SHOP.phase === 'fight' && !SHOP.paused && !CINE.on"):
    if ev("!!document.querySelector('#cine .skip')"): time.sleep(1.5); tap_el('#cine .skip')
    time.sleep(0.5)
chk('бой мира 1 идёт', ev("SHOP.phase === 'fight' && wave >= 1"))
t0 = time.time()
while time.time() - t0 < 60 and ev("SHOP.phase") == 'fight': ev("(enemies.slice().forEach(e => hurtEnemy(e, 1e9)), 1)"); time.sleep(0.5)
time.sleep(2)
# кадры с работающей статистикой
fr = ev("(() => { window.__f = 0; window.__t0 = performance.now(); const t = () => { __f++; requestAnimationFrame(t); }; t(); return 1; })()"); time.sleep(3); fps = ev("__f / ((performance.now() - __t0) / 1000)")
chk('игра не тормозит со статистикой: %.0f кадров в секунду' % fps, fps > 40, fps)
ev("(METRICS.flush(), 1)")
ok = False; t0 = time.time()
while time.time() - t0 < 60:
    ev('1'); codes = [c for u, c in resp]
    if any('/events' in u and c == 200 for u, c in resp): ok = True; break
    time.sleep(1)
chk('ключи сборки загрузились, SDK готов (дождался ответа сервера)', until("METRICS.keys === 'yes' && METRICS.state === 'ready'", 30), ev("[METRICS.keys, METRICS.state]"))
print('       ответы сервера GameAnalytics:', sorted(set(resp)))
chk('настоящий сервер принял ключи (init — 200 или 201)', any('/init' in u and c in (200, 201) for u, c in resp), resp[:6])
chk('настоящий сервер принял события (events — 200)', ok, resp[:10])
chk('других ответов (отказ, ошибка) нет', all(200 <= c < 300 for u, c in resp), [x for x in resp if not 200 <= x[1] < 300][:5])
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
