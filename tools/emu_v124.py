# -*- coding: utf-8 -*-
"""Новые экраны v124 в настоящем приложении на эмуляторе или телефоне (отладочная сборка):
  запустить приложение, дойти до меню (или прогнать перед этим tools/emu_cine.py) и:
  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_v124.py
Касания — настоящие (adb shell input tap). Проверяет: главное меню (лого, кнопки), «Статистика», «История» (12 карточек с картинками),
настройки (камера — два положения, «Аналитика»), музыка (файлы на месте, m1 нет), «Онлайн» → выбор героя (Эйра говорит, кнопка «ДАЛЕЕ»)
→ зал ожидания: связь с сервером есть — три действия; связи нет — «Сервер недоступен» не позже чем через 15 с.
Снимки — tests/v124/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'v124'); os.makedirs(OUT, exist_ok=True)
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
    return isinstance(r, list)
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

print('версия', ev("typeof V === 'string' ? V : ''"))
print('1. главное меню')
chk('«В главное меню» — меню открыто, заставки заново не идут', to_menu() and ev(SHOWN('#cine')) is not True)
m = ev("(() => { const l = document.querySelector('#mMain .logo'), r = l.getBoundingClientRect(), im = getComputedStyle(l).backgroundImage; return { btns: [...document.querySelectorAll('#mMain .btns .b')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.ru || b.textContent), side: [...document.querySelectorAll('#mMain > .b')].filter(b => getComputedStyle(b).display !== 'none').map(b => b.dataset.ru || b.textContent), logo: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], im: /logo_game/.test(im + l.innerHTML), W: innerWidth, H: innerHeight, fit: [...document.querySelectorAll('#mMain .btns .b')].every(b => { const q = b.getBoundingClientRect(); return q.width === 0 || (q.top >= 0 && q.bottom <= innerHeight); }) }; })()")
shot('1_menu'); print('      ', m)
chk('в столбце есть «Статистика» и «Онлайн», все кнопки помещаются на экране', 'Статистика' in m['btns'] and 'Онлайн' in m['btns'] and m['fit'], m)
chk('лого игры на месте и целиком на экране', m['logo'][2] > 100 and m['logo'][0] >= 0 and m['logo'][1] >= 0 and m['logo'][1] + m['logo'][3] <= m['H'], m)

print('2. «Статистика»')
tap(BTN('Статистика')); ok = until(SHOWN('#tlScr'), 10); time.sleep(1.2); shot('2_stats')
s = ev("(() => { const b = document.getElementById('tlScr'); if (!b) return null; return { rows: b.querySelectorAll('.col .rw').length, heroes: b.querySelectorAll('.hr div').length, txt: b.textContent.length }; })()")
ic = ev("(async () => JSON.stringify((await fetch('ui/stat_icons.webp' + V)).status))()", True)
chk('экран статистики открылся: два героя, строки со счётчиками, лист значков на месте', ok and s and s['heroes'] == 2 and s['rows'] >= 10 and ic == 200, [s, ic])

print('3. «История»')
to_menu(); tap("document.querySelector('#mMain .b.story')"); ok = until(SHOWN('#cineList'), 10); time.sleep(1.5); shot('3_story')
s = ev("""(async () => { const b = document.getElementById('cineList'), it = [...b.querySelectorAll('.it')]; let okImg = 0;
  for (const x of it) { const i = x.querySelector('.fr i'), u = i ? i.style.backgroundImage.slice(5, -2) : ''; if (!u) continue; await new Promise(r => { const im = new Image(); im.onload = () => { if (im.naturalWidth > 50) okImg++; r(); }; im.onerror = r; im.src = u; }); }
  return JSON.stringify({ n: it.length, open: it.filter(x => !x.classList.contains('no')).map(x => x.dataset.k), img: okImg, cnt: b.querySelector('.cnt').textContent }); })()""", True)
chk('галерея: 12 карточек, у каждой картинка загрузилась, пролог открыт, счётчик показан (открыто: %s)' % ', '.join(s['open'] if s else []), ok and s and s['n'] == 12 and s['img'] == 12 and s['open'][:1] == ['intro'] and '/ 12' in s['cnt'], s)

print('4. настройки и музыка')
to_menu(); tap(BTN('Настройки')); ok = until(SHOWN('#mSet'), 10); time.sleep(1.0); shot('4_settings')
s = ev("(() => { const rows = [...document.querySelectorAll('#mSet .row')], name = r => r.firstChild.textContent, cam = rows.find(r => name(r) === 'Камера'); return { rows: rows.map(name), cam: cam ? [...cam.querySelectorAll('.o')].map(o => o.textContent) : null }; })()")
chk('камера — только «Обычно» и «Чуть дальше»; строка «Аналитика» есть', ok and s and s['cam'] == ['Обычно', 'Чуть дальше'] and 'Аналитика' in s['rows'], s)
mu = ev("""(async () => { const ids = MUSIC.map(m => m[0]).concat([...new Set(Object.values(BOSS_MUSIC))]), bad = []; for (const id of ids) { try { const r = await fetch('music/' + id + '.mp3', { method: 'HEAD' }); if (r.status !== 200) bad.push(id); } catch (e) { bad.push(id); } }
  let m1 = 200; try { m1 = (await fetch('music/m1.mp3', { method: 'HEAD' })).status; } catch (e) { m1 = 0; }
  return JSON.stringify({ ids, bad, m1, playing: !!(mus.el && !mus.el.paused), track: mus.el ? mus.el.src.split('/').pop().split('?')[0] : '' }); })()""", True)
print('      ', mu)
chk('музыка: все файлы круга и боссов есть в приложении (%d), m1 нет ни в списке, ни в файлах, в меню музыка играет' % len(mu['ids']), not mu['bad'] and 'm1' not in mu['ids'] and mu['m1'] != 200 and len(mu['ids']) == 16 and mu['playing'], mu)

print('5. «Онлайн»: выбор героя и зал ожидания')
to_menu(); tap(BTN('Онлайн')); ok = until(SHOWN('#hSel'), 10); time.sleep(1.0)
s = ev("({ go: (document.querySelector('#hSel .go').dataset.ru || document.querySelector('#hSel .go').textContent), modes: getComputedStyle(document.querySelector('#hSel .modes')).display, kind: window.SEL_KIND })")
chk('выбор героя: кнопка «ДАЛЕЕ», одиночной игры и дуэли на экране нет', ok and s['go'] == 'ДАЛЕЕ' and s['modes'] == 'none' and s['kind'] == 'online', s)
ev("(pickVoice.log.length = 0, 1)"); tap("document.querySelectorAll('#hSel .card')[1]"); time.sleep(1.2); shot('5_select')
v = ev("({ log: pickVoice.log.slice(), hero: HERO_ID, shots: document.body.textContent.includes('Выстрел:') })")
chk('касание по Эйре — она выбрана и говорит фразу; выбора вида выстрела нет', v['hero'] == 'archer' and len(v['log']) == 1 and 'archer' in json.dumps(v['log']) and not v['shots'], v)
tap("document.querySelector('#hSel .go')"); ok = until(SHOWN('#tmLobby'), 10); t0 = time.time(); time.sleep(1.0); shot('6_lobby_start')
st = lambda: ev("({ st: LOBBY.st, btns: [...document.querySelectorAll('#tmLobby .bt')].map(b => b.dataset.ru || b.textContent), no: [...document.querySelectorAll('#tmLobby .no')].map(b => b.dataset.ru || b.textContent).join(' '), team: TEAM.on, phase: SHOP.phase })")
s = st(); chk('«ДАЛЕЕ» — зал ожидания, игра не началась', ok and not s['team'] and s['phase'] == 'rest', s)
while time.time() - t0 < 150 and s['st'] == 'conn': time.sleep(0.5); s = st()
dt = time.time() - t0; shot('7_lobby'); print('       через %.0f с: %s' % (dt, s))
if s['st'] == 'idle':
    chk('связь с сервером есть: три действия — искать напарника, комната для друга, войти по коду', s['btns'][:3] == ['Искать напарника', 'Комната для друга', 'Войти по коду'], s)
else:
    chk('связи с сервером нет: игра не зависла, показано «Сервер недоступен» (ждать пришлось %.0f с)' % dt, s['st'] == 'off' and 'Сервер недоступен' in s['no'] and dt <= 60, s)
    chk('есть кнопка «Повторить»', 'Повторить' in s['btns'], s['btns'])
tap("document.querySelector('#tmLobby .back')"); time.sleep(0.8); chk('«Назад» — снова выбор героя', ev(SHOWN('#hSel')) is True and ev(SHOWN('#tmLobby')) is not True)

# 6. Зал ожидания в приложении с настоящим вторым игроком на БОЕВОМ сервере (только с ключом --tunnel). Приложение не пускает открытое
# соединение ws:// (только wss), поэтому местный сервер ему не подходит. Если боевой сервер из этой сети закрыт, нужен обход:
#   ssh -N -L 127.0.0.1:30777:abpartners.uz:30777 minipc                 (туннель; закрыть потом по PID)
#   adb shell "echo '_ --host-resolver-rules=\"MAP abpartners.uz 10.0.2.2\"' > /data/local/tmp/webview-command-line"   и перезапустить приложение
# Второй игрок — браузер на ПК с тем же правилом (на 127.0.0.1). Комната — закрытая «для друга»: в общем списке её нет, чужие её не видят.
if '--tunnel' in sys.argv:
    print('6. зал ожидания в приложении на боевом сервере: комната для друга, второй игрок — браузер на ПК')
    from playwright.sync_api import sync_playwright
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WEB = 8775
    web = subprocess.Popen([sys.executable, '-m', 'http.server', str(WEB), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"
    try:
        time.sleep(1.5)
        with sync_playwright() as pw:
            br = pw.chromium.launch(args=['--host-resolver-rules=MAP abpartners.uz 127.0.0.1']); cx = br.new_context(viewport={'width': 915, 'height': 412}); p = cx.new_page(); errs = []
            p.on('pageerror', lambda e: errs.append(str(e)[:300]))
            cx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('hw_lang', 'ru'); }")
            p.goto('http://127.0.0.1:%d/index.html' % WEB, timeout=120000)
            p.wait_for_function("document.getElementById('mMain') && getComputedStyle(document.getElementById('mMain')).display === 'block'", timeout=60000); time.sleep(1.2)
            p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Онлайн')." + PD); time.sleep(0.8)
            p.evaluate("document.querySelector('#hSel .go')." + PD)
            p.wait_for_function("window.LOBBY && LOBBY.st === 'idle'", timeout=30000)
            p.evaluate("[...document.querySelectorAll('#tmLobby .bt')].find(b => (b.dataset.ru || b.textContent) === 'Комната для друга')." + PD)
            p.wait_for_function("LOBBY.st === 'friend' && /^[0-9]{4}$/.test((document.querySelector('#tmLobby .big') || {}).textContent || '')", timeout=15000)
            code = p.evaluate("document.querySelector('#tmLobby .big').textContent"); print('       ПК открыл комнату для друга, код получен')
            tap("document.querySelector('#hSel .go')"); t0 = time.time(); s = st()
            while time.time() - t0 < 40 and s['st'] != 'idle': time.sleep(0.4); s = st()
            chk('приложение подключилось к боевому серверу (%.0f с): в зале три действия' % (time.time() - t0), s['st'] == 'idle' and s['btns'][:3] == ['Искать напарника', 'Комната для друга', 'Войти по коду'], s)
            time.sleep(3.0); shot('8_lobby_idle')
            rooms = ev("[...document.querySelectorAll('#tmLobby .rw')].map(r => r.dataset.room)")
            chk('закрытая комната ПК в общем списке приложения не видна', code not in (rooms or []), rooms)
            tap("[...document.querySelectorAll('#tmLobby .bt')].find(b => (b.dataset.ru || b.textContent) === 'Войти по коду')"); until("LOBBY.st === 'code'", 8); time.sleep(0.5)
            for k in code: tap("document.querySelector('#tmLobby .k[data-k=\"%s\"]')" % k); time.sleep(0.35)
            time.sleep(0.4); shot('8_keypad'); typed = ev("LOBBY.code || ''") if ev("typeof LOBBY.code") == 'string' else None
            tap("document.querySelector('#tmLobby .k[data-k=\"OK\"]')")
            a = until("TEAM.on && !TEAM.host && !!TEAM.peer && getComputedStyle(document.getElementById('tmLobby')).display === 'none'", 20)
            chk('код набран настоящими касаниями по экранным цифрам — приложение вошло в комнату ПК, зал закрыт', a, ev("({ on: TEAM.on, host: TEAM.host, peer: TEAM.peer && TEAM.peer.name, st: LOBBY.st, err: [...document.querySelectorAll('#tmLobby .err')].map(e => e.textContent).join() })"))
            p.wait_for_function("TEAM.on && TEAM.host && !!TEAM.peer", timeout=20000)
            p.wait_for_function("PATHMAP.on", timeout=20000); p.keyboard.press('Enter'); time.sleep(1.0)
            p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
            b = until("SHOP.phase === 'fight' && enemies.length > 0", 60); time.sleep(3.0); shot('9_team_fight'); p.screenshot(path=os.path.join(OUT, 'emu_9_team_fight_pc.png'))
            Q = "({ phase: SHOP.phase, wave, en: enemies.length, hero: HERO_ID, peer: TEAM.peer && TEAM.peer.hero, on: TEAM.on })"
            w = [ev(Q), p.evaluate(Q)]
            chk('бой вдвоём идёт: в приложении и на ПК одна волна, враги на поле, герои — Эйра и Ganfaul', b and w[0]['phase'] == 'fight' and w[1]['phase'] == 'fight' and w[0]['wave'] == w[1]['wave'] == 1 and w[0]['peer'] == 'mage' and w[1]['peer'] == 'archer', w)
            time.sleep(10.0); w2 = [ev(Q), p.evaluate(Q)]
            chk('через 10 с связь держится у обоих, на ПК ошибок нет', w2[0]['on'] and w2[1]['on'] and not errs, [w2, errs])
            br.close()
        time.sleep(2.0); w3 = ev("({ on: TEAM.on, phase: SHOP.phase })"); print('       ПК вышел; в приложении:', w3)
    finally:
        web.terminate()
    to_menu()
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
