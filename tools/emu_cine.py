# -*- coding: utf-8 -*-
"""Запуск игры и ролики книги в настоящем приложении на эмуляторе или телефоне (отладочная сборка, свежие данные приложения):
  запустить приложение и сразу:  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_cine.py [ru|en]        язык, который выбрать на экране выбора (по умолчанию en — заодно проверяется перевод меню)
Касания — настоящие (adb shell input tap).
v124: запуск — выбор языка (первый раз) → лого студии → «PALLADIUM представляет» → пролог → лого игры (один раз, уезжает на своё место
в меню) → меню. Касание по экрану ролик НЕ закрывает, закрывает только кнопка «Продолжить» сверху. «Новая игра» → карта миров (без пролога) → ролик мира 1 → бой.
Ролики миров 2–10 и финал запускаются прямо (CINE.world / CINE.finale): идут, звук есть, экран не закрывает, кнопка закрывает.
Снимки экрана — tests/cine/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
LNG = sys.argv[1] if len(sys.argv) > 1 else 'en'
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
def adb_tap(x, y): subprocess.run([ADB, 'shell', 'input', 'tap', str(int(x)), str(int(y))])
def tap_el(sel):      # настоящее касание по середине элемента
    r = ev("(() => { const b = document.querySelector(%s); if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio]; })()" % json.dumps(sel))
    if r: adb_tap(r[0], r[1])
    return bool(r)
ST = """(() => { const c = document.getElementById('cine'), v = c && c.querySelector('video'), on = !!c && c.style.display === 'block', pr = c && c.querySelector('.pres.on'), sk = c && c.querySelector('.skip');
  return { on, en: !!(on && v && /\/cine_en\//.test(v.src)), video: on && v ? v.src.split('/').pop().split('?')[0] : '', t: on && v ? +v.currentTime.toFixed(1) : 0, dur: on && v ? +v.duration.toFixed(1) : 0, muted: on && v ? v.muted : null, vol: on && v ? v.volume : 0,
    bytes: on && v ? (v.webkitAudioDecodedByteCount || 0) : 0, w: on && v ? v.videoWidth : 0, vis: on && v ? +getComputedStyle(v).opacity : 0, menu: getComputedStyle(document.getElementById('mMain')).display, map: PATHMAP.on,
    lg: !!(c && c.querySelector('.lg.on')), pick: !!document.getElementById('lgPick'), pres: pr ? pr.textContent : '', skip: sk ? sk.textContent : '',
    phase: SHOP.phase, paused: SHOP.paused, wave, d: window.__d || 0 }; })()"""
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
def screen_keeps(name):      # три настоящих касания по экрану: ролик идёт дальше
    s0 = ev(ST)
    for x, y in ((900, 800), (1400, 500), (500, 300)): time.sleep(0.7); adb_tap(x, y)
    time.sleep(1.2); s1 = ev(ST)
    ok = s1['on'] and s1['video'] == s0['video'] and s1['t'] > s0['t']
    chk(name + ': касания по экрану ролик не закрывают', ok, '' if ok else [s0, s1]); return ok
def press_skip(): time.sleep(0.6); return tap_el('#cine .skip')      # настоящее касание по кнопке «Продолжить»

print('страница:', pg['title'], pg['url'], '| версия', ev("typeof V === 'string' ? V : ''"), '| звук телефона (музыка):', subprocess.run([ADB, 'shell', 'cmd', 'media_session', 'volume', '--stream', '3', '--get'], capture_output=True, text=True).stdout.strip()[-40:])
print('запуск')
for _ in range(100):      # страница ещё грузится — ждём, пока появятся меню и карта
    if ev("!!document.getElementById('mMain') && typeof PATHMAP !== 'undefined' && typeof SHOP !== 'undefined'") is True: break
    time.sleep(0.2)
seq = []; t0 = time.time(); intro = None
while time.time() - t0 < 120:
    s = ev(ST)
    if s['menu'] == 'block' and not s['on']: seq.append('menu'); break
    if s['video'] == 'logo_paladium.mp4' and 'studio' not in seq: seq.append('studio'); shot('0_studio')
    elif s['video'] == 'intro.mp4' and s['t'] > 1.5 and s['vis'] > 0.9 and 'intro' not in seq:
        seq.append('intro'); intro = s; time.sleep(3); shot('0d_intro')
        chk('пролог при запуске идёт, звук есть, сверху кнопка «Продолжить»', snd(intro) and intro['dur'] > 90 and s['skip'] != '', intro)
        chk('пролог — на выбранном языке (%s)' % ('cine_en' if LNG == 'en' else 'cine'), intro['en'] == (LNG == 'en'), intro)
        screen_keeps('пролог'); press_skip()
    elif s['pick'] and 'pick' not in seq:
        time.sleep(1.2); seq.append('pick'); shot('0b_language'); tap_el('#lgPick [data-l=%s]' % LNG)
    elif s['pres'] and not any(x.startswith('pres') for x in seq): seq.append('pres:' + s['pres']); time.sleep(1.1); shot('0c_presents')
    elif s['lg'] and 'game' not in seq: seq.append('game'); time.sleep(0.8); shot('0e_game')
    time.sleep(0.2)
pres = 'pres:PALLADIUM' + ('presents' if LNG == 'en' else 'представляет')
want = ['pick', 'studio', pres, 'intro', 'game', 'menu']
chk('порядок запуска: выбор языка → лого студии → «PALLADIUM %s» → пролог → лого игры (один раз) → меню' % pres[14:], seq == want, seq)
time.sleep(2); shot('1_menu')
lg = ev("(() => { const l = document.querySelector('#mMain .logo'), r = l.getBoundingClientRect(), c = document.getElementById('cine'); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), vis: +getComputedStyle(l).opacity, cine: c ? c.style.display : '', W: innerWidth, H: innerHeight }; })()")
chk('в меню лого игры стоит на своём месте, заставка убрана (второго лого поверх нет)', lg['w'] > 100 and lg['h'] > 60 and lg['vis'] > 0.9 and lg['cine'] != 'block' and lg['x'] >= 0 and lg['x'] + lg['w'] <= lg['W'], lg)
b = ev("[...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent)")
chk('меню на выбранном языке (%s): %s' % (LNG, ', '.join(b)), ('New game' in b) if LNG == 'en' else ('Новая игра' in b), b)
chk('язык запомнен', ev("localStorage.getItem('hw_lang')") == LNG)

print('новая игра')
ev("([...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })), 1)"); time.sleep(1.5); shot('2_select')
ev("(document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown')), 1)")
s = wait(lambda s: s['map'] or s['on'], 30); chk('«Новая игра» → сразу карта миров, пролог не идёт', s['map'] and not s['on'], s); time.sleep(2.5); shot('3a_map')
tap_el('#pmGo')
s = wait(plays('world_01.mp4'), 30); chk('мир 1 на карте — ролик мира 1 (%s), звук есть, игра стоит' % ('английский' if LNG == 'en' else 'русский'), plays('world_01.mp4')(s) and snd(s) and s['paused'] and s['en'] == (LNG == 'en'), s); time.sleep(3); shot('3_world01')
screen_keeps('ролик мира 1'); press_skip()
s = wait(lambda s: s['phase'] == 'fight' and not s['paused'] and not s['on'], 30); chk('кнопка «Продолжить» — ролик закрыт, первый бой мира 1 идёт', s['phase'] == 'fight' and not s['on'] and s['wave'] == 1, s); time.sleep(2); shot('4_fight')
print('остальные ролики')
for i in range(2, 11):
    k = 'world_%02d.mp4' % i
    ev("(window.__d = 0, CINE.reset(), CINE.world(%d, () => { window.__d = 1; }), 1)" % i)
    s = wait(plays(k), 30); ok1 = plays(k)(s) and snd(s) and s['paused'] and s['en'] == (LNG == 'en')
    if i in (5, 10): time.sleep(3); shot('5_world%02d' % i)
    keep = screen_keeps('мир %d' % i) if i in (2, 6, 10) else True
    press_skip(); s2 = wait(lambda s: s['d'] == 1 and not s['on'], 15)
    chk('мир %d: %s идёт (%.0f с), звук есть; кнопка «Продолжить» — закрыт, игра идёт дальше' % (i, k, s['dur']), ok1 and keep and s2['d'] == 1 and not s2['on'] and not s2['paused'], [s, s2] if not (ok1 and s2['d'] == 1) else '')
ev("(window.__d = 0, CINE.reset(), CINE.finale(() => { window.__d = 1; }), 1)")
s = wait(plays('finale.mp4'), 40); ok1 = plays('finale.mp4')(s) and snd(s) and s['dur'] > 250 and s['en'] == (LNG == 'en'); time.sleep(5); shot('6_finale')
keep = screen_keeps('финал'); press_skip(); s2 = wait(lambda s: s['d'] == 1 and not s['on'], 15)
chk('финал: finale.mp4 идёт (%.0f с), звук есть; кнопка «Продолжить» — закрыт, игра идёт дальше' % s['dur'], ok1 and keep and s2['d'] == 1 and not s2['on'], [s, s2])
# голоса героев — на выбранном языке (v123): длина звука в памяти совпадает с файлом из нужной папки
def ev_async(code):
    global n; n += 1
    ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression': code, 'awaitPromise': True, 'returnByValue': True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n: return json.loads(m['result'].get('result', {}).get('value') or 'null')
vo = ev_async("""(async () => { const names = ['vo_attack_1', 'vo_kill_2', 'archer_vo_attack_3', 'archer_vo_death_1', 'vo_move_4'], out = { en: 0, ru: 0, n: names.length, all: Object.keys(SND).filter(x => /^(archer_)?vo_/.test(x)).length };
  const dur = async u => { const b = await (await fetch(u)).arrayBuffer(); return (await new Promise((ok, no) => AC.decodeAudioData(b, ok, no))).duration; };
  for (const x of names) { const e = await dur('sfx_en/' + x + '.mp3'), r = await dur('sfx/' + x + '.mp3'), c = SND[x].duration; if (Math.abs(c - e) < 0.005) out.en++; if (Math.abs(c - r) < 0.005) out.ru++; } return JSON.stringify(out); })()""")
chk('реплики героев в памяти — %s (сверено 5 из %d по длине звука)' % ('английские' if LNG == 'en' else 'русские', vo['all']), vo['all'] >= 99 and (vo['en'] == vo['n'] and vo['ru'] == 0 if LNG == 'en' else vo['ru'] == vo['n'] and vo['en'] == 0), vo)
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
