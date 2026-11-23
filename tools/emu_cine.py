# -*- coding: utf-8 -*-
"""Ролики книги в настоящем приложении на эмуляторе или телефоне (v116, отладочная сборка, свежие данные приложения):
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_cine.py
Касания — настоящие (adb shell input tap). Новая игра: вступление → касание → ролик мира 1 → касание → бой.
Ролики миров 2–10 и финал запускаются прямо (CINE.world / CINE.finale): идут, звук есть, касание пропускает, игра продолжается.
Снимки экрана — tests/cine/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'cine'); os.makedirs(OUT, exist_ok=True)
pages = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
pg = next(x for x in pages if 'duelarena.app' in x['url'])
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True); n = 0
def ev(code):
    global n; n += 1
    ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression': 'JSON.stringify(' + code + ')', 'returnByValue': True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n:
            if 'exceptionDetails' in m['result']: return {'err': json.dumps(m['result']['exceptionDetails'], ensure_ascii=False)[:300]}
            v = m['result'].get('result', {}).get('value'); return json.loads(v) if v not in (None, 'undefined') else None
def shot(name): open(os.path.join(OUT, 'emu_' + name + '.png'), 'wb').write(subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
def tap(x=900, y=800): time.sleep(1.0); subprocess.run([ADB, 'shell', 'input', 'tap', str(x), str(y)])      # настоящее касание по экрану (не по надписи «Пропустить»)
ST = """(() => { const c = document.getElementById('cine'), v = c && c.querySelector('video'), on = !!c && c.style.display === 'block';
  return { on, video: on && v ? v.src.split('/').pop().split('?')[0] : '', t: on && v ? +v.currentTime.toFixed(1) : 0, dur: on && v ? +v.duration.toFixed(1) : 0, muted: on && v ? v.muted : null, vol: on && v ? v.volume : 0,
    bytes: on && v ? (v.webkitAudioDecodedByteCount || 0) : 0, w: on && v ? v.videoWidth : 0, vis: on && v ? +getComputedStyle(v).opacity : 0, menu: getComputedStyle(document.getElementById('mMain')).display,
    phase: SHOP.phase, paused: SHOP.paused, wave, map: PATHMAP.on, d: window.__d || 0 }; })()"""
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + ('  ' + str(extra)[:260] if extra else ''))
    if not ok: bad.append(name)
def wait(cond, sec=30):
    t = time.time(); s = ev(ST)
    while time.time() - t < sec and not cond(s): time.sleep(0.3); s = ev(ST)
    return s
plays = lambda k: (lambda s: s['video'] == k and s['t'] > 1.5 and s['vis'] > 0.9)
snd = lambda s: s['muted'] is False and s['vol'] > 0.9 and s['bytes'] > 1000 and s['w'] >= 1280

print('страница:', pg['title'], pg['url'], '| версия', ev("typeof V === 'string' ? V : ''"), '| звук телефона (музыка):', subprocess.run([ADB, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get'], capture_output=True, text=True).stdout.strip()[-40:])
s = wait(lambda s: not s['on'] and s['menu'] == 'block', 40); chk('после лого — главное меню', not s['on'] and s['menu'] == 'block', s); shot('1_menu')
ev("([...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1)"); time.sleep(1.5)
ev("(document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown')), 1)")
s = wait(plays('intro.mp4'), 30); chk('«Новая игра» → вступление intro.mp4 идёт, звук есть', plays('intro.mp4')(s) and snd(s) and s['dur'] > 100, s); time.sleep(4); shot('2_intro')
tap(); s = wait(plays('world_01.mp4'), 30); chk('касание — вступление пропущено, идёт ролик мира 1, звук есть, игра стоит', plays('world_01.mp4')(s) and snd(s) and s['paused'], s); time.sleep(3); shot('3_world01')
tap(); s = wait(lambda s: s['phase'] == 'fight' and not s['paused'] and not s['on'], 30); chk('касание — ролик пропущен, первый бой мира 1 идёт', s['phase'] == 'fight' and not s['on'] and s['wave'] == 1, s); time.sleep(2); shot('4_fight')
for i in range(2, 11):
    k = 'world_%02d.mp4' % i
    ev("(window.__d = 0, CINE.reset(), CINE.world(%d, () => { window.__d = 1; }), 1)" % i)
    s = wait(plays(k), 30); ok1 = plays(k)(s) and snd(s) and s['paused']
    if i in (5, 10): time.sleep(3); shot('5_world%02d' % i)
    tap(); s2 = wait(lambda s: s['d'] == 1 and not s['on'], 15)
    chk('мир %d: %s идёт (%.0f с), звук есть; касание — пропущен, игра идёт дальше' % (i, k, s['dur']), ok1 and s2['d'] == 1 and not s2['on'] and not s2['paused'], [s, s2] if not (ok1 and s2['d'] == 1) else '')
ev("(window.__d = 0, CINE.reset(), CINE.finale(() => { window.__d = 1; }), 1)")
s = wait(plays('finale.mp4'), 40); ok1 = plays('finale.mp4')(s) and snd(s) and s['dur'] > 250; time.sleep(5); shot('6_finale')
tap(); s2 = wait(lambda s: s['d'] == 1 and not s['on'], 15)
chk('финал: finale.mp4 идёт (%.0f с), звук есть; касание — пропущен, игра идёт дальше' % s['dur'], ok1 and s2['d'] == 1 and not s2['on'], [s, s2])
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
