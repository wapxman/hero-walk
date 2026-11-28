# -*- coding: utf-8 -*-
"""Правки v125 в настоящем приложении на эмуляторе или телефоне (отладочная сборка):
  запустить приложение, дойти до меню (или прогнать перед этим tools/emu_cine.py) и:
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_v125.py
Касания и кнопка «Назад» — настоящие (adb shell input). Проверяет: анонсы «Скоро» стоят в меню; «Онлайн» → «Меню» → «Продолжить» открывает
карту миров; настоящая кнопка «Назад» закрывает зал игры вдвоём; зал при недоступном сервере пишет об этом не позже чем через ~9 с;
на выборе героя есть карточка «Скоро», её нажатие открывает анонс; приложение не держит рекламу за награду, окна наград не появляются;
после первой арены — окно «Дальше — с рекламой».
Снимки — tests/v125/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'v125'); os.makedirs(OUT, exist_ok=True)
pages = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json'))
pg = next(x for x in pages if 'duelarena.app' in x['url'])
ws = websocket.create_connection(pg['webSocketDebuggerUrl'], suppress_origin=True); n = 0
def ev(code, wait_promise=False):
    global n; n += 1
    ws.send(json.dumps({'id': n, 'method': 'Runtime.evaluate', 'params': {'expression': code if wait_promise else 'JSON.stringify(' + code + ')', 'returnByValue': True, 'awaitPromise': wait_promise}}))
    while True:
        m = json.loads(ws.recv())
        if m.get('id') == n:
            if 'exceptionDetails' in m['result']: return {'err': json.dumps(m['result']['exceptionDetails'], ensure_ascii=False)[:300]}
            v = m['result'].get('result', {}).get('value'); return json.loads(v) if v not in (None, 'undefined') else None
def shot(name): open(os.path.join(OUT, 'emu_' + name + '.png'), 'wb').write(subprocess.run([ADB, 'exec-out', 'screencap', '-p'], capture_output=True).stdout)
def tap(expr):      # настоящее касание по середине элемента; expr — выражение JS, дающее элемент
    r = ev("(() => { const b = %s; if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio]; })()" % expr)
    if isinstance(r, list): subprocess.run([ADB, 'shell', 'input', 'tap', str(int(r[0])), str(int(r[1]))])
    time.sleep(0.9); return isinstance(r, list)
def back(): subprocess.run([ADB, 'shell', 'input', 'keyevent', '4']); time.sleep(0.9)      # настоящая кнопка «Назад»
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + ('  ' + str(extra)[:300] if extra and not ok else ''))
    if not ok: bad.append(name)
def until(code, sec=30):
    t = time.time()
    while time.time() - t < sec:
        if ev(code) is True: return True
        time.sleep(0.3)
    return False
BTN = lambda t: "[...document.querySelectorAll('#mMain .btns .b, #mMain > .b')].find(b => (b.dataset.ru || b.textContent) === %s)" % json.dumps(t, ensure_ascii=False)
SHOWN = lambda sel: "(() => { const e = document.querySelector(%s); return !!e && getComputedStyle(e).display !== 'none'; })()" % json.dumps(sel)
def to_menu():      # как «В главное меню» из паузы: перезагрузка с пометкой — меню без заставок
    ev("(sessionStorage.setItem('hw_tomenu', '1'), setTimeout(() => location.reload(), 50), 1)"); time.sleep(1.5)
    ok = until("!!document.getElementById('mMain') && getComputedStyle(document.getElementById('mMain')).display === 'block' && typeof PATHMAP !== 'undefined'", 60); time.sleep(1.5); return ok
ST = "(() => { const d = id => document.getElementById(id) ? getComputedStyle(document.getElementById(id)).display : '-'; return { lobby: d('tmLobby') === 'block', st: window.LOBBY ? LOBBY.st : '', map: PATHMAP.on, sel: d('hSel'), menu: d('mMain'), kind: window.SEL_KIND, full: !!document.getElementById('tzFull') }; })()"
WIN = "(() => { const w = document.getElementById('stWin'); return w && w.style.display === 'flex' ? (w.querySelector('h2').dataset.ru || w.querySelector('h2').textContent) : ''; })()"

print('версия', ev("typeof V === 'string' ? V : ''"))
# сохранение на волне 12 — чтобы в меню была кнопка «Продолжить» (данные приложения на эмуляторе — тестовые)
ev("(localStorage.setItem('hw_run_mage', JSON.stringify({ v: 1, wave: 12, best: 12, hp: 900, mp: 300, gold: 1500, bag: ['sword', 'boots'], flasks: { heal: 3 }, lv: 1, t: Date.now() })), localStorage.setItem('hw_hero', 'mage'), localStorage.setItem('hw_cine', JSON.stringify(Object.fromEntries([1,2,3,4,5,6,7,8,9,10].map(n => ['world_' + String(n).padStart(2, '0'), 1])))), 1)")

print('1. главное меню: анонсы «Скоро» стоят')
chk('меню открыто', to_menu())
time.sleep(1.5); shot('1_menu')
m = ev("(() => { const c = [...document.querySelectorAll('#tzBox .c')]; return { n: c.length, img: c.map(e => e.querySelector('.im').style.backgroundImage), fit: c.every(e => { const r = e.getBoundingClientRect(); return r.width > 40 && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }), first: (document.querySelector('#mMain .btns .b').dataset.ru || document.querySelector('#mMain .btns .b').textContent) }; })()")
ok = ev("(async () => { const o = []; for (const e of document.querySelectorAll('#tzBox .im')) o.push((await fetch(e.style.backgroundImage.slice(5, -2))).status); return JSON.stringify(o); })()", True)
chk('две карточки «Скоро» на экране, картинки загружены', m and m['n'] == 2 and m['fit'] and ok == [200, 200], [m, ok])
time.sleep(13); m2 = ev("document.querySelectorAll('#tzBox .c').length === 2 && document.getElementById('tzBox').getBoundingClientRect().right <= innerWidth")
chk('через 13 с карточки на месте', m2 is True)

print('2. «Онлайн» → «← Меню» → «Продолжить»')
chk('первая кнопка меню — «Продолжить»', m and m['first'] == 'Продолжить', m)
tap(BTN('Онлайн')); s = ev(ST); chk('«Онлайн»: выбор героя', s['sel'] == 'flex' and s['kind'] == 'online', s)
tap("document.querySelector('#hSel .back')"); s = ev(ST); chk('«← Меню»: главное меню', s['menu'] == 'block', s)
tap(BTN('Продолжить')); okm = until('PATHMAP.on === true', 12); s = ev(ST); time.sleep(1.0); shot('2_continue')
chk('«Продолжить» открывает карту миров, зала нет', okm and not s['lobby'], s)

print('3. зал: кнопка «Назад», ожидание сервера')
to_menu(); tap(BTN('Онлайн')); tap("document.querySelector('#hSel .go')"); t0 = time.time(); s = ev(ST)
chk('«ДАЛЕЕ»: зал открыт', s['lobby'], s)
back(); s = ev(ST); chk('кнопка «Назад» закрывает зал — снова выбор героя', not s['lobby'] and s['sel'] == 'flex' and s['menu'] == 'none', s)
tap("document.querySelector('#hSel .go')"); t0 = time.time()
got = until("LOBBY.st === 'idle' || LOBBY.st === 'off'", 20); dt = time.time() - t0; s = ev(ST); shot('3_lobby')
print('       зал: состояние «%s» через %.1f с' % (s['st'], dt))
chk('зал ответил не позже чем через ~9 с: либо список, либо «Сервер недоступен»', got and dt < 10.5, [s, round(dt, 1)])
back(); back(); s = ev(ST); chk('«Назад» дважды: зал закрыт, главное меню', not s['lobby'] and s['menu'] == 'block', s)

print('4. выбор героя: «Скоро»')
tap(BTN('Герои')); time.sleep(0.8); shot('4_select')
c = ev("(() => { const c = [...document.querySelectorAll('#hSel .card')], z = c[2], r = z ? z.getBoundingClientRect() : null; return { n: c.length, soon: z && z.classList.contains('soon'), b: z && (z.querySelector('b').dataset.ru || z.querySelector('b').textContent), img: z && z.querySelector('i').style.backgroundImage, fit: !!r && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hero: HERO_ID }; })()")
ok = ev("(async () => JSON.stringify((await fetch('ui/teaser/hero_card.webp' + V)).status))()", True)
chk('третья карточка «Скоро» с силуэтом, целиком на экране', c and c['n'] == 3 and c['soon'] and c['b'] == 'Скоро' and 'hero_card' in (c['img'] or '') and c['fit'] and ok == 200, [c, ok])
tap("document.querySelectorAll('#hSel .card')[2]"); s = ev(ST); time.sleep(0.8); shot('4_soon_full')
chk('нажатие на «Скоро» открывает анонс, герой не сменился', s['full'] and ev('HERO_ID') == c['hero'], s)
back(); s = ev(ST); chk('«Назад» закрывает анонс, выбор героя на месте', not s['full'] and s['sel'] == 'flex', s)

print('5. реклама: наград нет')
b = ev("({ bridge: !!window.DuelStore, native: STORE.native, pro: STORE.pro, rew: !!(window.DuelStore && DuelStore.rewardedReady()), free: STORE.CFG.freeWaves })")
chk('приложение на связи, рекламы за награду не держит, без рекламы — только первая арена', b and b['bridge'] and b['native'] and b['rew'] is False and b['free'] == 3, b)
to_menu(); tap(BTN('Продолжить')); until('PATHMAP.on === true', 12); time.sleep(1.2)
ev("(() => { for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true })); return 1; })()")
chk('бой начался', until("SHOP.phase === 'fight' && enemies.length > 0", 60)); time.sleep(1.0)
w0 = ev(WIN)
if w0: print('       перед боем было окно:', w0)
ev("(() => { enemies.length = 0; shots.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = 29; if (WORLD !== 3) applyWorld(3); SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.transit = false; SHOP.mapShown = true; P.dead = 0; P.hp = P.maxHp; STORE._st.gate = 1; return 1; })()")
ev("(SHOP.startWave(), 1)"); okb = until('enemies.some(e => e.boss && e.hp > 0)', 60)
ev("(P.dashI = 0, hurtPlayer(1e9), 1)"); until('P.dead === 0', 30); time.sleep(0.8); shot('5_boss_death')
chk('гибель на боссе: окна «Воскреснуть за рекламу» нет — сразу Междумирье', okb and ev('LIMBO.on') is True and not ev(WIN), [okb, ev('LIMBO.on'), ev(WIN)])
print('ИТОГ: всё в порядке' if not bad else 'ИТОГ: НЕ ПРОШЛО — ' + '; '.join(bad))
sys.exit(1 if bad else 0)
