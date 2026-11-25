# -*- coding: utf-8 -*-
"""Замеры скорости (v120, аудит скорости): один и тот же сценарий в Chrome и в приложении на эмуляторе или телефоне.
  Chrome (как слабый телефон: экран 915×412 ×2,6, процессор замедлен вчетверо, кэш выключен):
      python tools/perf.py chrome [--label до] [--runs 3]
  Приложение (отладочная сборка запущена; adb forward tcp:9333 localabstract:webview_devtools_remote_<pid>):
      python tools/perf.py emu [--label до] [--runs 3]
Что меряется (мс, медиана по прогонам; в игре ничего не меняется — замер снаружи, через отладочный канал браузера):
  запуск: страница готова; меню на экране (лого пропускаются сразу); сколько файлов и мегабайт загружено к меню и за 6 с покоя в меню
  карта миров (обычная игра, новый игрок): от «В бой» до первого кадра с картой, повторное открытие; время кадра на карте
  арена: от «Продолжить» на карте до боя на экране (арена видна) и до спрайтов всех врагов; то же для мира 5 (ничего не загружено)
  «Начать волну»: от нажатия до врагов со спрайтами (следующий раунд того же мира)
  ролики: от запуска до первого кадра (пролог, мир 5, финал)
  тяжёлый бой 25 с (мир 8, волны 7–9, герой бессмертен): кадр средний / 95 % / худший, доля кадров дольше 33 мс; память страницы,
  число и вес раскодированных картинок; на эмуляторе — память приложения целиком (adb dumpsys meminfo)
Итог дописывается в tests/perf/<режим>_<метка>.json; сравнение двух меток:  python tools/perf.py table до после"""
import sys, os, time, json, subprocess, statistics, urllib.request, argparse
import websocket
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(ROOT, 'tests', 'perf'); os.makedirs(OUT, exist_ok=True)
ADB = os.path.expandvars(r'%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe'); PKG = 'uz.tenworlds.game'
ap = argparse.ArgumentParser(); ap.add_argument('mode'); ap.add_argument('rest', nargs='*'); ap.add_argument('--label', default='run'); ap.add_argument('--runs', type=int, default=3); ap.add_argument('--root', default='')      # --root: папка с другой версией игры (для замера «до»)
A = ap.parse_args()
GAME = A.root or ROOT

NAMES = [('boot_ready', 'запуск: страница готова'), ('boot_menu', 'запуск: меню на экране (лого пропущены)'), ('boot_files', 'запуск: файлов загружено к меню'), ('boot_mb', 'запуск: мегабайт загружено к меню'),
  ('idle_files', 'меню, 6 с покоя: ещё файлов'), ('idle_mb', 'меню, 6 с покоя: ещё мегабайт'),
  ('map_cold', 'карта миров: первое открытие'), ('map_warm', 'карта миров: повторное открытие'), ('map_frame', 'карта миров (новый игрок, 9 миров закрыто): кадр, мс'),
  ('arena1_fight', 'мир 1: от «Продолжить» до арены на экране'), ('arena1_sprites', 'мир 1: до спрайтов всех врагов'),
  ('wave_sprites', '«Начать волну»: до врагов со спрайтами'),
  ('arena5_fight', 'мир 5 (впервые): до арены на экране'), ('arena5_sprites', 'мир 5 (впервые): до спрайтов всех врагов'),
  ('video_intro', 'ролик: пролог, до первого кадра'), ('video_world', 'ролик: мир 5, до первого кадра'), ('video_finale', 'ролик: финал, до первого кадра'),
  ('fight_avg', 'тяжёлый бой: кадр средний, мс'), ('fight_p95', 'тяжёлый бой: кадр 95 %, мс'), ('fight_max', 'тяжёлый бой: худший кадр, мс'), ('fight_slow', 'тяжёлый бой: кадров дольше 33 мс, %'),
  ('heap_mb', 'память страницы (JS), МБ'), ('img_n', 'раскодированных картинок, шт.'), ('img_mb', 'раскодированные картинки, МБ'), ('pss_mb', 'память приложения целиком, МБ'), ('gfx_mb', 'из неё процесс страницы (картинки, игра), МБ')]

if A.mode == 'table':
    a, b = A.rest[0], A.rest[1]
    for mode in ('chrome', 'emu'):
        fa, fb = os.path.join(OUT, '%s_%s.json' % (mode, a)), os.path.join(OUT, '%s_%s.json' % (mode, b))
        if not (os.path.exists(fa) and os.path.exists(fb)): continue
        da, db = json.load(open(fa, encoding='utf-8')), json.load(open(fb, encoding='utf-8'))
        print('\n### %s\n\n| Что | %s | %s | Изменение |\n|---|---|---|---|' % ('Chrome, как слабый телефон' if mode == 'chrome' else 'Приложение на эмуляторе', a, b))
        for k, nm in NAMES:
            if k not in da['med'] or k not in db['med'] or da['med'][k] is None or db['med'][k] is None: continue
            x, y = da['med'][k], db['med'][k]; ch = '' if not x else ('%+d %%' % round(100 * (y - x) / x))
            print('| %s | %s | %s | %s |' % (nm, x, y, ch))
    sys.exit()

# ---------- отладочный канал ----------
class Tab:
    def __init__(self, port, match):
        self.port, self.match, self.n = port, match, 0; self.connect()
    def connect(self):
        for i in range(60):
            try:
                pages = json.load(urllib.request.urlopen('http://127.0.0.1:%d/json' % self.port, timeout=3))
                pg = [x for x in pages if x.get('type') == 'page' and self.match in x['url']]
                if pg: self.ws = websocket.create_connection(pg[0]['webSocketDebuggerUrl'], suppress_origin=True, timeout=120); return
            except Exception: pass
            time.sleep(0.5)
        raise RuntimeError('нет страницы игры на порту %d' % self.port)
    def cmd(self, method, params=None):
        self.n += 1; self.ws.send(json.dumps({'id': self.n, 'method': method, 'params': params or {}}))
        while True:
            m = json.loads(self.ws.recv())
            if m.get('id') == self.n: return m.get('result', {})
    def ev(self, code, wait=False):
        r = self.cmd('Runtime.evaluate', {'expression': '(async () => JSON.stringify(await (' + code + ')))()', 'awaitPromise': True, 'returnByValue': True})
        if 'exceptionDetails' in r: raise RuntimeError(json.dumps(r['exceptionDetails'], ensure_ascii=False)[:400])
        v = r.get('result', {}).get('value'); return json.loads(v) if v not in (None, 'undefined') else None
    def until(self, code, sec=60, step=0.05):
        t = time.time()
        while time.time() - t < sec:
            try:
                if self.ev(code): return True
            except Exception: pass
            time.sleep(step)
        return False

# снаружи, не трогая игру: ловим первый кадр, в котором нарисована картинка с данным куском адреса
HOOK = """(() => { if (window.__pf) return 1; const P0 = CanvasRenderingContext2D.prototype, d0 = P0.drawImage; window.__pf = { seen: {} };
  P0.drawImage = function (im) { try { const s = im && im.src; if (s) { const k = s.split('/').slice(-2).join('/').split('?')[0]; if (!(k in __pf.seen)) __pf.seen[k] = performance.now(); } } catch (e) {} return d0.apply(this, arguments); };
  return 1; })()"""
FRAMES = """new Promise(res => { const d = []; let last = performance.now(), t0 = last; const tick = () => { const n = performance.now(); d.push(n - last); last = n; if (n - t0 < %d) requestAnimationFrame(tick); else { d.sort((a, b) => a - b); const s = d.reduce((a, b) => a + b, 0);
  res({ avg: +(s / d.length).toFixed(1), p95: +d[Math.floor(d.length * 0.95)].toFixed(1), max: +d[d.length - 1].toFixed(1), slow: +(100 * d.filter(x => x > 33.4).length / d.length).toFixed(1), n: d.length }); } }; requestAnimationFrame(tick); })"""
RES = "(() => { const r = performance.getEntriesByType('resource'); return { n: r.length, mb: +(r.reduce((a, x) => a + (x.encodedBodySize || x.transferSize || 0), 0) / 1048576).toFixed(1) }; })()"
IMGS = """(() => { const S = new Set(); const add = i => { if (i && i.naturalWidth > 0 && i.complete !== false) S.add(i); else if (i && i.width > 0 && i.getContext) S.add(i); };
  try { for (const k in CHARS) { const c = CHARS[k]; add(c.img); if (c.mul) for (const a in c.mul) add(c.mul[a].img); } } catch (e) {}
  try { for (const h of [GANFAUL, ARCHER]) if (h.mul) for (const a in h.mul) add(h.mul[a].img); } catch (e) {}
  try { for (const k in img) add(img[k]); } catch (e) {}
  for (const i of document.images) add(i);
  let px = 0; for (const i of S) px += (i.naturalWidth || i.width) * (i.naturalHeight || i.height);
  return { n: S.size, mb: Math.round(px * 4 / 1048576), heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null }; })()"""
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
GO = "(() => { const g = document.getElementById('pmGo'); for (const t of ['pointerdown', 'pointerup', 'click']) g.dispatchEvent(new PointerEvent(t, { bubbles: true })); return performance.now(); })()"
MAPREADY = "PATHMAP.on && !!document.getElementById('pmGo') && getComputedStyle(document.getElementById('pmGo')).display !== 'none'"
SPR = "SHOP.phase === 'fight' && enemies.length > 0 && enemies.every(e => e.ch && e.ch.ok)"
COVER = "(() => { const c = [...document.body.children].find(d => d.style && d.style.background === 'rgb(5, 8, 14)' && d.style.zIndex === '8'); return SHOP.phase === 'fight' && !ARENA_COVER.busy && (!c || c.style.display === 'none' || c.style.opacity === '0'); })()"

def one(tab, url, url2, emu):
    R = {}
    # чистое сохранение; ролики миров считаем просмотренными (их старт меряем отдельно)
    tab.cmd('Page.enable'); tab.cmd('Network.enable'); tab.cmd('Network.setCacheDisabled', {'cacheDisabled': True})
    # wave = 0 — чтобы игра при уходе со страницы не записала сохранение заново; ключи стираем по одному: в приложении каждое удаление уходит и в запасное хранилище Android (иначе сохранение вернётся при запуске)
    tab.ev("(() => { try { try { wave = 0; } catch (e) {} for (const k of Object.keys(localStorage)) localStorage.removeItem(k); sessionStorage.clear(); const s = {}; for (let i = 1; i <= 10; i++) s['world_' + String(i).padStart(2, '0')] = 1; s.finale = 1; localStorage.setItem('hw_cine', JSON.stringify(s)); } catch (e) {} return 1; })()")
    tab.cmd('Page.addScriptToEvaluateOnNewDocument', {'source': HOOK})
    tab.cmd('Page.navigate', {'url': url}); time.sleep(0.3)
    tab.until("document.readyState === 'complete' && typeof SAVE !== 'undefined' && performance.timing.loadEventEnd > 0", 120)
    R['boot_ready'] = tab.ev("performance.timing.loadEventEnd - performance.timing.navigationStart")
    # лого пропускаем сразу, как это сделал бы нетерпеливый игрок
    t0 = time.time()
    while time.time() - t0 < 40:
        s = tab.ev("(() => { const sp = document.getElementById('mSplash'); if (sp) sp." + PD + "; if (typeof CINE !== 'undefined' && CINE.on) CINE.skip(); const m = document.getElementById('mMain'); return !sp && !CINE.on && getComputedStyle(m).display === 'block' ? performance.now() : 0; })()")
        if s: R['boot_menu'] = round(s); break
        time.sleep(0.05)
    r0 = tab.ev(RES); R['boot_files'], R['boot_mb'] = r0['n'], r0['mb']
    time.sleep(6); r1 = tab.ev(RES); R['idle_files'], R['idle_mb'] = r1['n'] - r0['n'], round(r1['mb'] - r0['mb'], 1)
    # новая игра → выбор героя → «В бой» → (пролог пропускаем) → карта
    tab.ev("([...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Новая игра')." + PD + ", 1)"); time.sleep(1.2)
    t = tab.ev("(delete __pf.seen['map/map.webp'], document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown')), performance.now())")
    tab.until("(CINE.on && (CINE.skip(), 0)) || !!__pf.seen['map/map.webp']", 60, 0.03)
    w = tab.ev("__pf.seen['map/map.webp'] || 0"); R['map_cold'] = round(w - t) if w else None
    tab.until(MAPREADY, 30); time.sleep(1.5); f = tab.ev(FRAMES % 2500); R['map_frame'] = f['avg']
    # мир 1: «Продолжить» → арена → спрайты врагов
    t = tab.ev(GO); tab.until(COVER, 60, 0.03); R['arena1_fight'] = round(tab.ev("performance.now()") - t)
    tab.until(SPR, 60, 0.03); R['arena1_sprites'] = round(tab.ev("performance.now()") - t)
    # раунд отбит → «Начать волну» → карта (повторно) → «Продолжить» → враги со спрайтами
    for i in range(200):
        if tab.ev("SHOP.phase") == 'rest': break
        tab.ev("(P.hp = P.maxHp, enemies.slice().forEach(e => hurtEnemy(e, 1e9)), 1)"); time.sleep(0.25)
    time.sleep(2.5)
    t = tab.ev("(delete __pf.seen['map/map.webp'], SHOP.open && SHOP.closeShop(), SHOP.startWave(), performance.now())")
    tab.until("!!__pf.seen['map/map.webp']", 8, 0.02); w = tab.ev("__pf.seen['map/map.webp'] || 0"); R['map_warm'] = round(w - t) if w else None
    for i in range(40):      # карта не открылась с первого раза (шло окно, переход) — жмём «Начать волну» ещё
        if tab.ev(MAPREADY) or tab.ev("SHOP.phase") == 'fight': break
        tab.ev("(SHOP.open && SHOP.closeShop(), SHOP.startWave(), 1)"); time.sleep(0.7)
    time.sleep(0.8)
    if tab.ev(MAPREADY): t = tab.ev(GO); ok = tab.until(SPR, 30, 0.03); R['wave_sprites'] = round(tab.ev("performance.now()") - t) if ok else None
    # вторая часть — в сборке «все миры открыты» (то же сохранение): заново открываем страницу и жмём «Продолжить»
    tab.ev("(SAVE.save(), 1)"); tab.cmd('Page.navigate', {'url': url2}); time.sleep(0.3)
    tab.until("document.readyState === 'complete' && typeof SAVE !== 'undefined' && performance.timing.loadEventEnd > 0", 120)
    t0 = time.time()
    while time.time() - t0 < 40:
        if tab.ev("(() => { const sp = document.getElementById('mSplash'); if (sp) sp." + PD + "; if (typeof CINE !== 'undefined' && CINE.on) CINE.skip(); const m = document.getElementById('mMain'); return !sp && !CINE.on && getComputedStyle(m).display === 'block'; })()"): break
        time.sleep(0.05)
    time.sleep(1.0); tab.ev("([...document.querySelectorAll('#mMain .btns .b')].find(b => b.textContent === 'Продолжить')." + PD + ", 1)")
    tab.until(MAPREADY, 30); time.sleep(1.2)
    # гибель → Междумирье → карта → мир 5 (ещё ничего из него не загружено)
    def to_map():
        tab.ev("(hurtPlayer(1e12), 1)")
        for i in range(120):
            s = tab.ev("(() => { const w = document.getElementById('stWin'); if (w && getComputedStyle(w).display === 'flex') { const b = [...w.querySelectorAll('.bt')].find(b => /Междумирье/.test(b.textContent)); if (b) b." + PD + "; } if (LIMBO.on) { LIMBO.leave(); } return PATHMAP.on; })()")
            if s: break
            time.sleep(0.3)
        tab.until(MAPREADY, 30); time.sleep(1.0)
    tab.ev("PATHMAP.pickAt(5)"); time.sleep(0.8)
    t = tab.ev(GO)
    for i in range(400):
        s = tab.ev("(() => { const w = document.getElementById('stWin'); if (w && getComputedStyle(w).display === 'flex') { const b = [...w.querySelectorAll('.bt')].find(b => /^Играть/.test(b.textContent)); if (b) b." + PD + "; } return " + COVER + "; })()")
        if s: break
        time.sleep(0.03)
    R['arena5_fight'] = round(tab.ev("performance.now()") - t); tab.until(SPR, 60, 0.03); R['arena5_sprites'] = round(tab.ev("performance.now()") - t)
    # ролики: до первого кадра (сначала 6 с покоя — чтобы загрузка листов мира 5 не мешала замеру)
    time.sleep(6)
    for k, f in (('video_intro', 'intro.mp4'), ('video_world', 'world_05.mp4'), ('video_finale', 'finale.mp4')):
        t = tab.ev("(CINE.replay('%s'), performance.now())" % f)
        ok = tab.until("(() => { const v = document.querySelector('#cine video'); return !!v && v.currentTime > 0; })()", 30, 0.02)
        R[k] = round(tab.ev("performance.now()") - t) if ok else None
        tab.ev("(CINE.skip(), 1)"); tab.until("!CINE.on", 10); time.sleep(0.5)
    # тяжёлый бой: мир 8, раунд с волнами 7–9 (элита, мини-босс), герой бессмертен
    to_map(); tab.ev("PATHMAP.pickAt(8, 1)"); time.sleep(0.8); tab.ev(GO)
    for i in range(400):
        s = tab.ev("(() => { const w = document.getElementById('stWin'); if (w && getComputedStyle(w).display === 'flex') { const b = [...w.querySelectorAll('.bt')].find(b => /^Играть/.test(b.textContent)); if (b) b." + PD + "; } return " + SPR + "; })()")
        if s: break
        time.sleep(0.05)
    tab.ev("(window.__god = setInterval(() => { P.hp = P.maxHp = 1e9; P.mp = P.maxMp; }, 100), 1)"); time.sleep(6)
    f = tab.ev(FRAMES % 25000); R['fight_avg'], R['fight_p95'], R['fight_max'], R['fight_slow'] = f['avg'], f['p95'], f['max'], f['slow']
    m = tab.ev(IMGS); R['heap_mb'], R['img_n'], R['img_mb'] = m['heap'], m['n'], m['mb']
    if emu:
        # страница игры живёт в отдельном процессе WebView (sandboxed_process) — считаем его вместе с самим приложением
        o = subprocess.run([ADB, 'shell', 'dumpsys', 'meminfo'], capture_output=True, text=True).stdout; app = web = 0
        for line in o.splitlines():
            x = line.strip()
            if 'K: ' in x and '(pid' in x:
                kb = int(x.split('K:')[0].replace(',', '').strip())
                if PKG + ' (pid' in x: app = max(app, kb)
                if 'sandboxed_process' in x: web = max(web, kb)
        R['pss_mb'] = round((app + web) / 1024); R['gfx_mb'] = round(web / 1024)
    tab.ev("(clearInterval(window.__god), 1)")
    return R

srv = None; chrome = None
try:
    if A.mode == 'chrome':
        from playwright.sync_api import sync_playwright
        srv = subprocess.Popen([sys.executable, '-m', 'http.server', '8781', '--bind', '127.0.0.1', '--directory', GAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
        pw = sync_playwright().start(); chrome = pw.chromium.launch(channel='chrome', args=['--remote-debugging-port=9334', '--autoplay-policy=no-user-gesture-required', '--window-size=915,412'])
        pg = chrome.new_page(viewport={'width': 915, 'height': 412}, device_scale_factor=2.625); pg.goto('http://127.0.0.1:8781/manifest.json')
        url = 'http://127.0.0.1:8781/index.html?cine=1&fakestore=web'; url2 = url + '&allworlds'; port, match = 9334, '127.0.0.1:8781'
    else:
        url = 'https://duelarena.app/index.html'; url2 = url + '?allworlds'; port, match = 9333, 'duelarena.app'
    runs = []
    for i in range(A.runs):
        tab = Tab(port, match)
        if A.mode == 'chrome': tab.cmd('Emulation.setCPUThrottlingRate', {'rate': 4})
        try: r = one(tab, url, url2, A.mode == 'emu'); runs.append(r); print('прогон %d:' % (i + 1), json.dumps(r, ensure_ascii=False))
        except Exception as e: print('прогон %d сорвался:' % (i + 1), str(e)[:300])
        try: tab.ws.close()
        except Exception: pass
    med = {}
    for k, nm in NAMES:
        v = [r[k] for r in runs if r.get(k) is not None]; med[k] = (round(statistics.median(v), 1) if v else None)
    if A.mode == 'emu':
        apk = os.path.join(ROOT, 'apk'); f = sorted([x for x in os.listdir(apk) if x.startswith('DuelArena-v') and x.endswith('.apk') and 'test' not in x], key=lambda x: int(x.split('-v')[1].split('.')[0]))
    json.dump({'label': A.label, 'mode': A.mode, 'runs': runs, 'med': med, 'when': time.strftime('%d.%m %H:%M')}, open(os.path.join(OUT, '%s_%s.json' % (A.mode, A.label)), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('\nмедиана (%s, %s):' % (A.mode, A.label))
    for k, nm in NAMES:
        if med.get(k) is not None: print('  %-48s %s' % (nm, med[k]))
finally:
    if chrome:
        try: chrome.close(); pw.stop()
        except Exception: pass
    if srv: srv.terminate()
