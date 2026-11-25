# -*- coding: utf-8 -*-
"""Междумирье v2 в настоящем приложении на эмуляторе или телефоне (отладочная сборка, свежие данные приложения):
  запустить приложение и сразу:  adb forward tcp:9333 localabstract:webview_devtools_remote_<pid приложения>
  python tools/emu_alma.py
Проходит запуск, начинает игру, встречает и побеждает босса и мини-босса мира 1, гибнет — и смотрит площадь, книгу и зал.
Касания по вкладкам, записям и трофеям — настоящие. Снимки — tests/alma/emu_*.png. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess, json, urllib.request
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'alma'); os.makedirs(OUT, exist_ok=True)
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
def tap_el(sel):
    r = ev("(() => { const b = document.querySelector(%s); if (!b) return null; const r = b.getBoundingClientRect(); return [(r.left + r.width / 2) * devicePixelRatio, (r.top + r.height / 2) * devicePixelRatio]; })()" % json.dumps(sel))
    if r: subprocess.run([ADB, 'shell', 'input', 'tap', str(int(r[0])), str(int(r[1]))]); time.sleep(0.8)
    return bool(r)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + ('  ' + str(extra)[:300] if extra and not ok else ''))
    if not ok: bad.append(name)
def until(code, sec):
    t = time.time()
    while time.time() - t < sec:
        if ev(code): return True
        time.sleep(0.4)
    return False
def walk(pl): ev("((id) => { const L = LIMBO.L, s = L.st[id]; P.x = s.p[0] * L.size[0] * AK; P.y = s.p[1] * L.size[1] * AK; return 1; })(%s)" % json.dumps(pl)); time.sleep(1.5)
def away(): ev("(() => { const L = LIMBO.L; P.x = L.fire[0] * L.size[0] * AK; P.y = L.fire[1] * L.size[1] * AK + 150; return 1; })()"); time.sleep(0.8)
VIS = lambda i: ev("(() => { const e = document.getElementById(%s); return !!e && getComputedStyle(e).display !== 'none'; })()" % json.dumps(i))
print('страница:', pg['url'], '| версия', ev("typeof V === 'string' ? V : ''"))
PICK = "(() => { const e = document.getElementById('lgPick'), c = document.getElementById('cine'); return !!e && !!c && c.style.display === 'block' && +getComputedStyle(e).opacity > 0.5; })()"
until("CINE.on", 20)      # запуск: дождаться, что заставки начались (иначе меню «видно» ещё до них)
t0 = time.time()
while time.time() - t0 < 150 and not ev("getComputedStyle(document.getElementById('mMain')).display === 'block' && !CINE.on && !document.getElementById('mSplash')"):
    if ev(PICK): time.sleep(1.0); tap_el('#lgPick [data-l=ru]')
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
ev("(() => { ROUND.queue.length = 0; ROUND.mini = 'mb_arbalest'; spawnEnemy('mb_arbalest'); spawnEnemy('b_blackknight'); const e = enemies[enemies.length - 1]; e.almaT = 71; P.hp = P.maxHp; for (const x of enemies.slice()) hurtEnemy(x, 1e12); return 1; })()"); time.sleep(1.0)
ev("(hurtPlayer(1e9), 1)"); chk('герой погиб — Междумирье', until("LIMBO.on", 25)); time.sleep(2.5)
shot('1_plaza'); chk('фон площади загружен (новый)', ev("!!img.ground && img.ground.naturalWidth === 1536 && /limbo\\/bg\\.webp/.test(img.ground.src)"), ev("img.ground && img.ground.src"))
walk('alma'); chk('подошёл к библиотеке — книга открылась', VIS('almaBook')); time.sleep(2.0); shot('2_book')
s = ev("(() => { const c = [...document.querySelectorAll('#almaBook .grid .c')], bg = getComputedStyle(document.querySelector('#almaBook .bx')).backgroundImage, R = document.querySelector('#almaBook .pg.r'), bx = document.querySelector('#almaBook .bx').getBoundingClientRect(); return { n: c.length, open: c.filter(x => x.dataset.open === '1').length, bg: /alma\\/book/.test(bg), title: R.querySelector('h3').textContent, fit: R.scrollHeight <= R.clientHeight + 2, box: [Math.round(bx.width), Math.round(bx.height), innerWidth, innerHeight], pics: c.filter(x => { const v = x.querySelector('canvas'); const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n > 60; }).length }; })()")
chk('книга: 10 боссов, открыт встреченный (Бранд), портреты нарисованы', s['n'] == 10 and s['open'] == 1 and s['bg'] and s['title'] == 'Бранд' and s['pics'] == 10, s)
# все записи боссов и мини-боссов (на обоих языках) должны помещаться на странице без прокрутки — шрифт телефона шире браузерного
FIT = """(() => { const D = ALMA.D(), keep = JSON.stringify(D.seen), bad = [], R = () => document.querySelector('#almaBook .pg.r'); for (const t of ALMA_TEXTS.bosses.concat(ALMA_TEXTS.minibosses)) D.seen[t.id] = 1;
  const l0 = LANG.cur; for (const lg of ['ru', 'en']) { LANG.set(lg); for (const tb of [0, 1]) { document.querySelectorAll('#almaBook .tabs div')[tb].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    for (let pg = 0; pg < 2; pg++) { for (const c of [...document.querySelectorAll('#almaBook .grid .c')]) { document.querySelector('#almaBook .grid .c[data-id="' + c.dataset.id + '"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); LANG.apply(); const r = R(); if (r.scrollHeight > r.clientHeight + 2) bad.push([lg, c.dataset.id, r.scrollHeight - r.clientHeight]); }
      const n = document.querySelector('#almaBook .pager .ar.n'); if (n.classList.contains('no')) break; n.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); } } }
  LANG.set(l0); D.seen = JSON.parse(keep); document.querySelectorAll('#almaBook .tabs div')[0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); return bad; })()"""
bad_fit = ev(FIT); chk('все 40 записей боссов и мини-боссов помещаются на странице без прокрутки (рус. и англ.)', bad_fit == [], bad_fit)
tap_el('#almaBook .tabs div:nth-child(2)'); time.sleep(1.5); shot('3_book_minis')
chk('настоящее касание по вкладке «Мини-боссы» — 20 записей на странице', ev("document.querySelectorAll('#almaBook .grid .c').length") == 20)
tap_el('#almaBook .tabs div:nth-child(4)'); time.sleep(1.0); shot('4_book_items'); chk('вкладка «Предметы» открывается', ev("ALMA.ui.tab") == 'item')
tap_el('#almaBook .x'); chk('крестик закрывает книгу', not VIS('almaBook')); away()
walk('trophy'); chk('подошёл к залу — открылся Зал трофеев', VIS('almaHall')); time.sleep(2.5); shot('5_hall')
s = ev("(() => { const t = [...document.querySelectorAll('#almaHall .tr')], m = [...document.querySelectorAll('#almaHall .m')]; return { n: t.length, loaded: t.filter(x => x.querySelector('img').naturalWidth > 0).length, win: t.filter(x => x.dataset.win === '1').length, mn: m.length, mwin: m.filter(x => x.dataset.win === '1').length }; })()")
chk('зал: 10 трофеев загружены, один победный; 30 медальонов, один победный', s == {'n': 10, 'loaded': 10, 'win': 1, 'mn': 30, 'mwin': 1}, s)
tap_el('#almaHall .tr[data-id=b_blackknight]'); c = ev("document.querySelector('#almaHall .card').textContent"); shot('6_hall_card')
chk('настоящее касание по трофею — карточка: герой, дата, 71 с', 'Шлем и щит Бранда' in c and 'Ganfaul' in c and '71' in c and time.strftime('%Y') in c, c)
tap_el('#almaHall .card .cx'); tap_el('#almaHall .rb'); c = ev("document.querySelector('#almaHall .card').textContent"); shot('7_hall_records')
chk('кнопка «Рекорды» — карточка рекордов', 'Лучшая волна' in c and 'Самый сильный крит' in c, c)
away(); chk('отошёл — зал закрылся', not VIS('almaHall'))
print('ИТОГ:', 'всё в порядке' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
