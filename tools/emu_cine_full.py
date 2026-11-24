# -*- coding: utf-8 -*-
"""Ролики книги в настоящем приложении (эмулятор или телефон, отладочная сборка): каждый идёт с самого начала и до конца (v119).
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_cine_full.py
Каждый из 12 роликов запускается через «Историю» (CINE.replay) и проигрывается целиком, ускоренно ×8. Смотрим: первый кадр — у
самого начала, время дошло до конца файла, ролик закрылся сам по событию конца. Код выхода 1 — если что-то не прошло."""
import sys, time, os, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
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
FILES = ['intro.mp4'] + ['world_%02d.mp4' % i for i in range(1, 11)] + ['finale.mp4']
WATCH = """((file) => { window.__v = { first: null, max: 0, ended: false, closedAt: null, dur: 0, jumps: 0, last: 0 }; const o = window.__v;
  const tick = () => { const c = document.getElementById('cine'), v = c && c.style.display === 'block' ? c.querySelector('video') : null;
    if (v && v.src.indexOf(file) >= 0) { if (!v.__w) { v.__w = 1; v.addEventListener('ended', () => { o.ended = true; }); }
      if (v.currentTime > 0 && o.first == null) { o.first = v.currentTime; o.dur = v.duration; v.playbackRate = 8; }
      if (v.currentTime > o.max) o.max = v.currentTime; if (v.currentTime < o.last - 0.5) o.jumps++; o.last = v.currentTime; }
    else if (o.first != null && o.closedAt == null) o.closedAt = o.max;
    if (o.closedAt == null) setTimeout(tick, 30); }; tick(); return 1; })('%s')"""
bad = []
print('версия', ev("typeof V === 'string' ? V : ''"))
t = time.time()
while time.time() - t < 40 and not ev("typeof CINE !== 'undefined' && !CINE.on && getComputedStyle(document.getElementById('mMain')).display === 'block'"): time.sleep(0.5)
for f in FILES:
    ev(WATCH % f); ev("(CINE.replay('%s'), 1)" % f); t = time.time(); o = ev('__v')
    while time.time() - t < 120 and o['closedAt'] is None: time.sleep(0.4); o = ev('__v')
    time.sleep(1.0); on = ev('CINE.on')
    ok = o['first'] is not None and o['first'] < 0.8 and o['dur'] > 20 and o['max'] >= o['dur'] - 0.8 and o['ended'] and o['jumps'] == 0 and not on
    print(('  да   ' if ok else '  НЕТ  ') + '%s: с начала (первый кадр на %.2f с) и до конца (%.1f из %.1f с), закрылся сам' % (f, o['first'] if o['first'] is not None else -1, o['max'], o['dur']) + ('' if ok else '  ' + str(o)))
    if not ok: bad.append(f)
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + ', '.join(bad)); sys.exit(1 if bad else 0)
