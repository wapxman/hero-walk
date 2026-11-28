# -*- coding: utf-8 -*-
"""Правки v125 (Создатель 28.11) в настоящей странице.
1 — «Онлайн» → меню → «Продолжить» открывает карту миров, а не зал; «Назад» Android закрывает зал; при молчащем сервере зал ждёт 8 с.
2 — наград за рекламу нет (воскрешение на боссе, удвоение золота), реклама — всем без PRO после первой арены, окно PRO без слов о наградах.
3 — анонсы «Скоро» стоят в меню постоянно (две карточки), не всплывают, ничего не закрывают; тап — картинка на весь экран.
4 — стайка птиц летит над ареной и от камеры не зависит.
5 — стражника (мир 1), селянина (мир 2) и саламандры (мир 8) на аренах нет.
6 — на выборе героя третья карточка: силуэт нового героя и «Скоро»; выбрать её нельзя; три карточки и список умений влезают на любой экран.
Сервер страниц (порт 8787) и «молчащий» сервер (порт 8789) поднимает сам. Запуск: python tools/v125_check.py   снимки — tests/v125/. Код выхода 1 — красный."""
import sys, os, time, json, subprocess, socket, threading
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8787; MUTE = 8789; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'v125'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:420]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"
def save(wave, gold=1500):
    return json.dumps({'v': 1, 'wave': wave, 'best': wave, 'hp': 900, 'mp': 300, 'gold': gold, 'bag': ['sword', 'boots'], 'flasks': {'heal': 3}, 'lv': 1, 't': int(time.time() * 1000)})
SEEN = json.dumps({'world_%02d' % n: 1 for n in range(1, 11)})
ST = """(() => { const disp = id => document.getElementById(id) ? getComputedStyle(document.getElementById(id)).display : '-';
  return { lobby: disp('tmLobby') === 'block', st: window.LOBBY ? LOBBY.st : '', map: typeof PATHMAP !== 'undefined' && PATHMAP.on, sel: disp('hSel'), menu: disp('mMain'), kind: window.SEL_KIND, phase: SHOP.phase, wave, team: !!(window.TEAM && TEAM.on),
    btns: [...document.querySelectorAll('#tmLobby .bt')].map(b => b.dataset.ru || b.textContent), note: [...document.querySelectorAll('#tmLobby .no')].map(b => b.dataset.ru || b.textContent).join() }; })()"""
WIN = "(() => { const w = document.getElementById('stWin'); return w && w.style.display === 'flex' ? (w.querySelector('h2').dataset.ru || w.querySelector('h2').textContent) : ''; })()"
REST = "(w) => { enemies.length = 0; shots.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = w; if (WORLD !== BAL.at(w + 1).M) applyWorld(BAL.at(w + 1).M); SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.transit = false; SHOP.mapShown = true; P.dead = 0; P.hp = P.maxHp; }"
# прямоугольники на экране: видимость и пересечения
RECTS = """(sels) => { const r = {}; for (const [k, s] of Object.entries(sels)) { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') { r[k] = null; continue; } const b = e.getBoundingClientRect(); r[k] = [b.left, b.top, b.right, b.bottom]; } r.W = innerWidth; r.H = innerHeight; return r; }"""
def inside(r, W, H, pad=0): return r is not None and r[0] >= -pad and r[1] >= -pad and r[2] <= W + pad and r[3] <= H + pad and r[2] - r[0] > 4 and r[3] - r[1] > 4
def cross(a, b): return a is not None and b is not None and a[0] < b[2] - 1 and b[0] < a[2] - 1 and a[1] < b[3] - 1 and b[1] < a[3] - 1

# «молчащий» сервер: соединение принимает, на запрос не отвечает — так выглядит сеть, которая сервер не пускает
def mute_server():
    s = socket.socket(); s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1); s.bind(('127.0.0.1', MUTE)); s.listen(8); held = []
    while True:
        try: c, _ = s.accept(); held.append(c)
        except Exception: break
threading.Thread(target=mute_server, daemon=True).start()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        def page(store=None, q='', size=(1280, 576)):
            cx = br.new_context(viewport={'width': size[0], 'height': size[1]}); p = cx.new_page(); p.errs = []; p.cx = cx; p.miss = []
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            p.on('response', lambda r: p.miss.append(r.url[-60:]) if r.status == 404 else None)
            d = dict({'hw_lang': 'ru'}, **(store or {}))
            cx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); const d = %s; for (const k in d) localStorage.setItem(k, d[k]); }" % json.dumps(d))
            p.goto(BASE + ('?' + q if q else ''), timeout=120000)
            p.wait_for_function("document.getElementById('mMain') && getComputedStyle(document.getElementById('mMain')).display === 'block'", timeout=90000); time.sleep(1.2)
            return p
        def boot(q):      # сразу в бой, без меню (как tools/store_check.py)
            cx = br.new_context(viewport={'width': 960, 'height': 540}); p = cx.new_page(); p.errs = []; p.cx = cx; p.miss = []
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            p.on('response', lambda r: p.miss.append(r.url[-60:]) if r.status == 404 else None)
            p.goto(BASE + '?mode=play&allworlds&' + q, timeout=120000); p.wait_for_function('window.COMBAT_READY === true', timeout=120000)
            p.mouse.click(480, 270); p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); time.sleep(1.5)
            return p
        MB = lambda t: "[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === '%s')" % t
        tap = lambda p, expr, w=0.6: (p.evaluate("(() => { const e = %s; if (e) e.%s; return !!e; })()" % (expr, PD)), time.sleep(w))[0]
        st = lambda p: p.evaluate(ST)
        def until(p, cond, sec=12):
            t0 = time.time(); s = st(p)
            while time.time() - t0 < sec:
                s = st(p)
                if cond(s): return s
                time.sleep(0.2)
            return s
        press = lambda p, t: p.evaluate("(t) => { const b = [...document.querySelectorAll('#stWin .bt')].find(b => (b.dataset.ru || b.textContent).startsWith(t)); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return !!b; }", t)

        print('1. «Продолжить» после «Онлайн», кнопка «Назад» в зале, ожидание сервера')
        p = page({'hw_run_mage': save(12), 'hw_cine': SEEN, 'hw_hero': 'mage'}, 'server=ws://127.0.0.1:1')
        tap(p, MB('Онлайн')); s = st(p); chk('«Онлайн»: выбор героя для онлайна', s['sel'] == 'flex' and s['kind'] == 'online', s)
        tap(p, "document.querySelector('#hSel .back')"); s = st(p); chk('«← Меню»: главное меню', s['menu'] == 'block' and s['sel'] == 'none', s)
        tap(p, MB('Продолжить')); s = until(p, lambda s: s['map'], 8); p.screenshot(path=os.path.join(OUT, '1_continue_after_online.png'))
        chk('«Продолжить» после «Онлайн» → «Меню» открывает карту миров, зала нет', s['map'] and not s['lobby'] and s['menu'] == 'none', s)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()
        p = page({'hw_run_mage': save(12), 'hw_cine': SEEN, 'hw_hero': 'mage'}, 'server=ws://127.0.0.1:1')
        tap(p, MB('Онлайн')); r = p.evaluate('window.androidBack()'); time.sleep(0.5); s = st(p)
        chk('«Онлайн» → «Назад» Android: главное меню', r is True and s['menu'] == 'block', s)
        tap(p, MB('Продолжить')); s = until(p, lambda s: s['map'], 8); chk('после этого «Продолжить» тоже открывает карту миров', s['map'] and not s['lobby'], s); p.cx.close()
        p = page({'hw_run_mage': save(12), 'hw_cine': SEEN, 'hw_hero': 'mage'}, 'server=ws://127.0.0.1:%d' % MUTE)
        tap(p, MB('Онлайн')); tap(p, "document.querySelector('#hSel .go')", 0.4); t0 = time.time(); s = st(p)
        chk('«ДАЛЕЕ»: зал открыт, идёт подключение', s['lobby'] and s['st'] == 'conn' and 'Подключение' in s['note'], s)
        r = p.evaluate('window.androidBack()'); time.sleep(0.5); s = st(p)
        chk('«Назад» Android при открытом зале закрывает зал — снова выбор героя, меню не подменилось', r is True and not s['lobby'] and s['sel'] == 'flex' and s['menu'] == 'none', s)
        tap(p, "document.querySelector('#hSel .go')", 0.4); t0 = time.time(); time.sleep(4.0); s = st(p)
        chk('сервер молчит: через 4 с зал ещё ждёт', s['lobby'] and s['st'] == 'conn', s)
        s = until(p, lambda s: s['st'] == 'off', 12); dt = time.time() - t0; p.screenshot(path=os.path.join(OUT, '1_lobby_off.png'))
        chk('сервер молчит: «Сервер недоступен» примерно через 8 с (было около 20), есть «Повторить»', s['st'] == 'off' and 6.5 < dt < 10.5 and 'Сервер недоступен' in s['note'] and s['btns'] == ['Повторить'], [round(dt, 1), s])
        tap(p, "document.querySelector('#tmLobby .back')"); tap(p, "document.querySelector('#hSel .back')"); tap(p, MB('Продолжить')); s = until(p, lambda s: s['map'], 8)
        chk('из зала назад в меню → «Продолжить»: карта миров', s['map'] and not s['lobby'], s)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()

        print('2. реклама: наград нет, реклама всем без PRO после первой арены')
        p = boot('fakestore')
        p.evaluate(REST, 0); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
        chk('новая игра, первая арена: бой сразу, ни окна, ни рекламы', p.evaluate('SHOP.phase') == 'fight' and not p.evaluate(WIN) and p.evaluate('FAKE_ADS.length') == 0, p.evaluate('[SHOP.phase, FAKE_ADS.join()]'))
        p.evaluate(REST, 3); p.evaluate('SHOP.startWave()'); time.sleep(0.5)
        chk('вторая арена мира 1 (раньше реклама шла только с мира 3): один раз окно «Дальше — с рекламой»', p.evaluate(WIN) == 'Дальше — с рекламой' and p.evaluate('SHOP.phase') == 'rest', p.evaluate(WIN))
        p.screenshot(path=os.path.join(OUT, '2_gate.png')); press(p, 'Играть с рекламой'); time.sleep(0.6)
        chk('«Играть с рекламой» — бой начался', p.evaluate('SHOP.phase') == 'fight' and not p.evaluate(WIN))
        p.evaluate(REST, 6); p.evaluate('STORE._reset(); SHOP.startWave()'); time.sleep(0.5)
        chk('следующая арена мира 1: реклама перед раундом, окна второй раз нет', p.evaluate('FAKE_ADS.join()') == 'inter' and not p.evaluate(WIN) and p.evaluate('SHOP.phase') == 'rest', p.evaluate('[FAKE_ADS.join(), SHOP.phase]'))
        p.wait_for_function("SHOP.phase === 'fight'", timeout=20000)
        try: p.wait_for_function('!SHOP.paused', timeout=15000)      # на этой волне меняется арена — пауза держится, пока грузится её картинка
        except Exception: pass
        chk('реклама закрылась — бой идёт, пауза снята', not p.evaluate('SHOP.paused') and not p.evaluate("!!document.getElementById('stFake')"), p.evaluate("[SHOP.paused, STORE.busy, !!document.getElementById('stFake')]"))
        p.evaluate(REST, 9); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
        chk('раньше 2 минут — без рекламы', p.evaluate('SHOP.phase') == 'fight' and p.evaluate('FAKE_ADS.length') == 1)
        p.evaluate(REST, 29); p.evaluate('SHOP.startWave()'); time.sleep(0.3); p.wait_for_function('enemies.some(e => e.boss && e.hp > 0)', timeout=40000)
        p.evaluate('P.dashI = 0; hurtPlayer(1e9); if (P.dead <= 0) { P.hp = 0; P.dead = P.deadMax = 2.2; }'); p.wait_for_function('P.dead === 0', timeout=30000); time.sleep(0.5)
        chk('гибель на боссе: окна «Воскреснуть за рекламу» нет — сразу Междумирье', p.evaluate('LIMBO.on') and not p.evaluate(WIN) and 'reward' not in p.evaluate('FAKE_ADS.join()'), p.evaluate('[LIMBO.on, FAKE_ADS.join()]') + [p.evaluate(WIN)])
        p.evaluate('STORE._reset(); LIMBO.leave()'); time.sleep(0.6)
        chk('возвращение из Междумирья: обычная реклама', p.evaluate('FAKE_ADS.join()') == 'inter,inter', p.evaluate('FAKE_ADS.join()')); time.sleep(2.5)
        p.evaluate(REST, 30)
        g0 = p.evaluate("(() => { SHOP.onKill({ boss: 1, x: P.x + 5000, y: P.y, k: {}, type: 'x' }); const g = SHOP.gold; window.__done = 0; PATHMAP.show({ mode: 'short', t0: 0, t1: 0, onMid() {}, onDone() { window.__done = 1; } }); return g; })()"); time.sleep(0.8)
        chk('после босса: окна «Удвоить золото за рекламу» нет, золото не прибавилось', not p.evaluate(WIN) and p.evaluate('SHOP.gold') == g0 and 'reward' not in p.evaluate('FAKE_ADS.join()'), [p.evaluate(WIN), p.evaluate('SHOP.gold'), g0])
        chk('без ошибок', not p.errs, p.errs); p.cx.close()
        p = boot('fakestore=pro'); p.evaluate(REST, 3); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
        chk('с PRO: ни окна, ни рекламы', p.evaluate('SHOP.phase') == 'fight' and not p.evaluate(WIN) and p.evaluate('FAKE_ADS.length') == 0)
        p.evaluate(REST, 23); p.evaluate('STORE._reset(); SHOP.startWave()'); time.sleep(0.4)
        chk('с PRO в мире 3 — тоже без рекламы', p.evaluate('SHOP.phase') == 'fight' and p.evaluate('FAKE_ADS.length') == 0); p.cx.close()
        p = boot('fakestore=web'); p.evaluate(REST, 23); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
        chk('сайт (приложения нет): ни окна, ни рекламы, бой идёт', p.evaluate('SHOP.phase') == 'fight' and not p.evaluate(WIN)); p.cx.close()
        p = page(None, 'fakestore')
        p.evaluate("document.querySelector('#mMain .b.pro')." + PD); time.sleep(0.5)
        t = p.evaluate("(() => { const w = document.querySelector('#stWin p'); return w ? (w.dataset.ru || w.textContent) : ''; })()"); p.screenshot(path=os.path.join(OUT, '2_pro.png'))
        chk('окно PRO: «никакой рекламы», про рекламу за награду ни слова', t == 'Одна покупка навсегда: никакой рекламы.', t); p.cx.close()

        print('3. «Скоро» в главном меню стоит постоянно')
        for lang, size in (('ru', (915, 412)), ('ru', (1280, 576)), ('en', (1024, 768)), ('en', (915, 412))):
            p = page({'hw_lang': lang, 'hw_run_mage': save(12), 'hw_cine': SEEN}, '', size); time.sleep(0.8)
            s = p.evaluate("""(() => { const c = [...document.querySelectorAll('#tzBox .c')]; return { n: c.length, k: c.map(e => e.querySelector('.k').textContent), t: c.map(e => e.querySelector('.t').textContent),
              img: c.map(e => e.querySelector('.im').style.backgroundImage), x: !!document.querySelector('#tzBox .x, #tzCard'), tr: getComputedStyle(document.getElementById('tzBox')).transform }; })()""")
            r = p.evaluate(RECTS, {'box': '#tzBox', 'c0': '#tzBox .c:nth-child(1)', 'c1': '#tzBox .c:nth-child(2)', 'btns': '#mMain .btns', 'pro': '#mMain .b.pro', 'story': '#mMain .b.story', 'ver': '#mMain .ver', 'logo': '#mMain .logo'})
            name = '%s %dx%d' % (lang, size[0], size[1]); p.screenshot(path=os.path.join(OUT, '3_menu_%s_%d.png' % (lang, size[0])))
            chk(name + ': сразу в меню две карточки «Скоро» с картинками, без крестика, никуда не едут', s['n'] == 2 and all('teaser/' in i for i in s['img']) and not s['x'] and s['tr'] == 'none' and s['k'] == ['Скоро' if lang == 'ru' else 'Coming soon'] * 2, s)
            chk(name + ': карточки целиком на экране и не закрывают кнопки, «PRO», «Историю», лого и номер версии', inside(r['c0'], r['W'], r['H']) and inside(r['c1'], r['W'], r['H']) and not any(cross(r['box'], r[k]) for k in ('btns', 'pro', 'story', 'ver', 'logo')), r)
            ok = p.evaluate("(async () => { const o = []; for (const e of document.querySelectorAll('#tzBox .im')) { const u = e.style.backgroundImage.slice(5, -2); o.push((await fetch(u)).status); } return o; })()")
            chk(name + ': картинки карточек загружаются', ok == [200, 200], ok)
            if size[0] == 915:
                time.sleep(14); s2 = p.evaluate("(() => { const b = document.getElementById('tzBox').getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), document.querySelectorAll('#tzBox .c').length]; })()")
                chk(name + ': через 14 с карточки на том же месте (раньше уезжали через 12 с)', s2 == [round(r['box'][0]), round(r['box'][1]), 2], [s2, r['box']])
                p.evaluate("document.querySelector('#tzBox .c:nth-child(2)')." + PD); time.sleep(0.9)
                f = p.evaluate("(() => { const f = document.getElementById('tzFull'); return f ? { t: f.querySelector('.t').textContent, src: f.querySelector('img').src } : null; })()"); p.screenshot(path=os.path.join(OUT, '3_full_%s.png' % lang))
                chk(name + ': нажатие — анонс на весь экран (вторая карточка — новая история)', f is not None and 'location' in f['src'] and ('Руины' in f['t'] or 'Ruins' in f['t']), f)
                rb = p.evaluate('window.androidBack()'); time.sleep(0.6); chk(name + ': «Назад» закрывает анонс, меню на месте', rb is True and not p.evaluate("!!document.getElementById('tzFull')") and st(p)['menu'] == 'block')
            chk(name + ': без ошибок', not p.errs, p.errs); p.cx.close()

        print('4. стайка птиц летит над ареной, а не по экрану')
        p = boot('x=1'); p.evaluate(REST, 0); time.sleep(0.5)
        p.wait_for_function("typeof MFX !== 'undefined' && MFX.ok('sp_flyers')", timeout=30000)
        p.evaluate('ARENA_FLY.now()'); p.wait_for_function('ARENA_FLY.list.length === 4', timeout=15000)
        a = p.evaluate("(() => { const f = ARENA_FLY.list[0]; return { x: f.x, run: f.run, dir: f.dir, v: f.v, cam: cam.x, vw: cam.vw, px: P.x, W: WORLD_W }; })()")
        # герой (и камера за ним) уходит навстречу стайке
        p.evaluate("(d) => { window.__mv = setInterval(() => { P.x = Math.max(200, Math.min(WORLD_W - 200, P.x - d * 14)); }, 16); }", a['dir']); time.sleep(1.2)
        b = p.evaluate("(() => { clearInterval(window.__mv); const f = ARENA_FLY.list[0]; return { x: f.x, run: f.run, cam: cam.x, px: P.x }; })()")
        moved = abs(b['x'] - a['x']); run = b['run'] - a['run']
        chk('герой идёт навстречу — стайка летит с той же скоростью: путь над землёй равен пути по своим часам', run > 50 and abs(moved - run) < 1.0 and (b['x'] - a['x']) * a['dir'] > 0, [a, b])
        chk('камера при этом сдвинулась, а стайка за экраном не поехала', abs(b['cam'] - a['cam']) > 60 or abs(b['px'] - a['px']) > 200, [a['cam'], b['cam'], a['px'], b['px']])
        c = p.evaluate("(() => { const f = ARENA_FLY.list[0]; f.x = f.dir > 0 ? WORLD_W + 160 : -160; for (const g of ARENA_FLY.list) g.x = f.x; return 1; })()"); time.sleep(0.4)
        chk('за краем арены стайка исчезает (не разворачивается)', p.evaluate('ARENA_FLY.list.length') == 0)
        chk('без ошибок', not p.errs, p.errs)

        print('5. стражника, селянина и саламандры нет')
        s = p.evaluate("""(() => { const out = { gone: [], movers: [] }; for (const id of ['w1_guard', 'w2_villager', 'w8_salamander']) if (!LOCFX.defs[id] && !Object.values(LOCFX.place).some(m => m[id])) out.gone.push(id);
          for (const w in LOCFX.place) for (const id in LOCFX.place[w]) if (LOCFX.place[w][id].some(q => q.move)) out.movers.push(id); return out; })()""")
        chk('в данных арен их нет', s['gone'] == ['w1_guard', 'w2_villager', 'w8_salamander'], s)
        chk('двигаются только птицы, призраки, кит и скат', sorted(s['movers']) == sorted(['w2_crow', 'w5_bat', 'w6_eagle', 'w7_ghost', 'w8_phoenix', 'w9_dove', 'w9_whale', 'w10_wraith', 'w10_manta']), s['movers'])
        r = p.evaluate("(async () => { const o = {}; for (const id of ['w1_guard', 'w2_villager', 'w8_salamander', 'w7_ghost']) o[id] = (await fetch('ui/locfx/' + id + '.webp', { method: 'HEAD' })).status; return o; })()")
        chk('их листы из игры убраны (остальные на месте)', r == {'w1_guard': 404, 'w2_villager': 404, 'w8_salamander': 404, 'w7_ghost': 200}, r)
        for w in (1, 2, 8):
            p.miss.clear(); p.evaluate(REST, (w - 1) * 10); time.sleep(2.5); p.screenshot(path=os.path.join(OUT, '5_world%d.png' % w))
            chk('мир %d: арена рисуется, недостающих файлов нет' % w, p.evaluate('WORLD') == w and not [m for m in p.miss if 'locfx' in m], p.miss[:4])
        chk('без ошибок', not p.errs, p.errs); p.cx.close()

        print('6. выбор героя: карточка «Скоро»')
        for lang, size in (('ru', (915, 412)), ('ru', (1280, 576)), ('en', (1024, 768)), ('ru', (1280, 800))):
            p = page({'hw_lang': lang}, '', size); name = '%s %dx%d' % (lang, size[0], size[1])
            tap(p, "[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Герои')", 0.9)
            s = p.evaluate("""(() => { const c = [...document.querySelectorAll('#hSel .card')], z = c[2]; return { n: c.length, soon: z && z.classList.contains('soon'), b: z && z.querySelector('b').textContent, em: z && z.querySelector('em').textContent,
              img: z && z.querySelector('i').style.backgroundImage, hero: HERO_ID, on: c.map(e => e.classList.contains('on')), nm: c.slice(0, 2).map(e => e.querySelector('ul .nm').textContent) }; })()""")
            chk(name + ': третья карточка — «Скоро», «Новый герой», с картинкой силуэта', s['n'] == 3 and s['soon'] and s['b'] == ('Скоро' if lang == 'ru' else 'Coming soon') and s['em'] == ('Новый герой' if lang == 'ru' else 'New hero') and 'hero_card' in (s['img'] or ''), s)
            chk(name + ': в списке умений сверху имя героя', s['nm'] == (['Ganfaul', 'Эйра'] if lang == 'ru' else ['Ganfaul', 'Eira']), s['nm'])
            for i in (0, 1):
                tap(p, "document.querySelectorAll('#hSel .card')[%d]" % i, 0.5)
                r = p.evaluate(RECTS, {'c0': '#hSel .card:nth-child(1) i', 'c1': '#hSel .card:nth-child(2) i', 'c2': '#hSel .card:nth-child(3) i', 'ul': '#hSel .card.on ul', 'back': '#hSel .back', 'pl': '#hSel .pl', 'go': '#hSel .go'})
                if i == 1: p.screenshot(path=os.path.join(OUT, '6_select_%s_%dx%d.png' % (lang, size[0], size[1])))
                chk(name + ': выбран герой %d — три карточки и список умений целиком на экране, список не закрывает карточки' % (i + 1),
                    all(inside(r[k], r['W'], r['H']) for k in ('c0', 'c1', 'c2', 'ul')) and not any(cross(r['ul'], r[k]) for k in ('c0', 'c1', 'c2')) and r['c0'][2] < r['c1'][0] and r['c1'][2] < r['c2'][0], r)
            ok = p.evaluate("fetch('ui/teaser/hero_card.webp', { method: 'HEAD' }).then(r => r.status)"); chk(name + ': картинка силуэта загружается', ok == 200, ok)
            if size[0] == 915:
                h0 = p.evaluate('HERO_ID'); tap(p, "document.querySelectorAll('#hSel .card')[2]", 0.9)
                f = p.evaluate("(() => { const f = document.getElementById('tzFull'); return { full: !!f, src: f ? f.querySelector('img').src : '', hero: HERO_ID, on: [...document.querySelectorAll('#hSel .card')].map(e => e.classList.contains('on')) }; })()")
                p.screenshot(path=os.path.join(OUT, '6_soon_tap.png'))
                chk(name + ': нажатие на «Скоро» героя не выбирает, открывает анонс нового героя', f['full'] and 'teaser/hero.webp' in f['src'] and f['hero'] == h0 and f['on'][2] is False and sum(f['on']) == 1, f)
                p.evaluate('window.androidBack()'); time.sleep(0.6); chk(name + ': анонс закрывается, выбор героя на месте', not p.evaluate("!!document.getElementById('tzFull')") and st(p)['sel'] == 'flex')
            chk(name + ': без ошибок', not p.errs, p.errs); p.cx.close()
        p = page({'hw_lang': 'ru'}, '', (915, 412))
        tap(p, MB('Новая игра'), 0.9); s = st(p); chk('«Новая игра»: выбор героя с тремя карточками', s['sel'] == 'flex' and p.evaluate("document.querySelectorAll('#hSel .card').length") == 3, s)
        tap(p, "document.querySelector('#hSel .go')", 0.6); s = until(p, lambda s: s['map'], 12); chk('«В БОЙ» работает как раньше — карта миров', s['map'], s); p.cx.close()
        br.close()
finally:
    srv.terminate()
print('ИТОГ: всё в порядке' if not bad else 'ИТОГ: НЕ ПРОШЛО — ' + '; '.join(bad))
sys.exit(1 if bad else 0)
