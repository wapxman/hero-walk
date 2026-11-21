# -*- coding: utf-8 -*-
"""Проверка рекламы и покупки в настоящем приложении на эмуляторе или телефоне (отладочная сборка):
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_store.py state | inter | reward | buy | cb | js "<код>"
Снимок экрана — tests/store/emu_<команда>.png."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8')
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'store'); os.makedirs(OUT, exist_ok=True)
cmd = sys.argv[1] if len(sys.argv) > 1 else 'state'
def shot(name):
    png = subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True).stdout
    open(os.path.join(OUT, 'emu_' + name + '.png'), 'wb').write(png)
pages = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
pg = next((x for x in pages if 'duelarena' in x['url']), pages[0])
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True); n = 0
def ev(code):
    global n; n += 1
    ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression': 'JSON.stringify(' + code + ')', 'returnByValue': True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n:
            r = m['result'].get('result', {})
            if 'exceptionDetails' in m['result']: return 'ОШИБКА: ' + json.dumps(m['result']['exceptionDetails'], ensure_ascii=False)[:300]
            return json.loads(r['value']) if r.get('value') not in (None, 'undefined') else None
HOOK = "(() => { if (!window.__cb) { window.__cb = []; const _c = STORE.cb; STORE.cb = function (k, ok, tag) { window.__cb.push([k, ok, tag]); return _c.apply(this, arguments); }; } return 1; })()"
print('страница:', pg['url'])
print(ev("({ bridge: !!window.DuelStore, pro: window.DuelStore && DuelStore.isPro(), price: window.DuelStore && DuelStore.price(), inter: window.DuelStore && DuelStore.interReady(), rew: window.DuelStore && DuelStore.rewardedReady(), native: typeof STORE !== 'undefined' && STORE.native, ver: typeof V !== 'undefined' && V })"))
if cmd == 'js': print(ev(sys.argv[2]))
if cmd in ('inter', 'reward'):
    ev(HOOK); ev("(DuelStore.showInterstitial(), 1)" if cmd == 'inter' else "(DuelStore.showRewarded('revive'), 1)")
    time.sleep(7); shot(cmd + '_shown'); print('ответ сразу после показа:', ev('window.__cb'))
if cmd == 'buy':
    ev(HOOK); ev("(DuelStore.buyPro(), 1)"); time.sleep(5); shot('buy'); print('ответ:', ev('window.__cb'))
if cmd == 'state': shot('state')
if cmd == 'cb': shot('cb'); print(ev('window.__cb'))
