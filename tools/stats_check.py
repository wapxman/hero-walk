# -*- coding: utf-8 -*-
"""Статистика (stats.js, GameAnalytics) в настоящей странице.
1) Тестовый режим (автопрогон): события пишутся в METRICS.log, SDK не грузится, в сеть ничего не уходит; имена событий годятся для GameAnalytics.
2) Ключей нет (как сейчас в игре) и обычный игрок: SDK не грузится, запросов нет.
3) Ключи есть, сети до GameAnalytics нет: SDK загрузился, запросы пытались уйти и оборвались — игра идёт, ошибок нет.
4) Ключи есть, сервер отвечает: события действительно уходят (смотрим тела запросов).
5) Выключатель «Статистика» в настройках: выключено — SDK не грузится, запросов нет.
6) Скорость: сколько времени статистика добавляет к кадру.
Сервер страниц поднимает сам (порт 8785). Запуск: python tools/stats_check.py     Код выхода 1 — если что-то не прошло."""
import sys, os, re, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8785; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'stats'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:700]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
GO = "for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"
PART = r'[A-Za-z0-9 _.\-()!?]{1,64}'
ID = re.compile('^' + PART + '(:' + PART + '){0,4}$')
CFG_KEYS = "const STATS_KEYS = { gameKey: '0123456789abcdef0123456789abcdef', secretKey: '0123456789abcdef0123456789abcdef01234567' };"      # подставной файл ключей сборки
def open_page(b, query, keys=False, net='none', hero=None):
    """net: 'none' — запросов к GameAnalytics быть не должно (считаем); 'down' — обрываем; 'ok' — отвечаем как сервер"""
    cx = b.new_context(viewport={'width': 1280, 'height': 600}); p = cx.new_page(); p.errs = []; p.ga = []; p.lib = []
    p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
    p.on('request', lambda r: p.lib.append(r.url) if 'GameAnalytics.min.js' in r.url else None)
    def ga(route):
        rq = route.request; p.ga.append({'url': rq.url, 'body': (rq.post_data or '')[:200000]})
        if net == 'ok':
            body = {'enabled': True, 'server_ts': int(time.time()), 'flags': []} if rq.url.endswith('/init') or '/init' in rq.url else {}
            route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*'}, body=json.dumps(body))
        else: route.abort()
    cx.route(re.compile(r'gameanalytics\.com'), ga)
    p.keyfile = []; p.on('request', lambda r: p.keyfile.append(r.url) if 'stats_keys.js' in r.url else None)
    if keys: cx.route(re.compile(r'stats_keys\.js'), lambda route: route.fulfill(status=200, content_type='application/javascript', body=CFG_KEYS))
    p.goto(BASE + '?' + query, timeout=120000); p.wait_for_function("typeof METRICS !== 'undefined' && typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
    return cx, p
def play(p, archer=False):
    """новая игра → герой → карта → мир 1: волна 1 пройдена, покупка, волна 2 — гибель"""
    p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра')." + PD); p.wait_for_timeout(1000)
    if archer: p.evaluate("setHero('archer')"); p.wait_for_timeout(300)
    p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
    p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); p.wait_for_timeout(1000)
    p.evaluate(GO); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); p.wait_for_timeout(1000)
    t0 = time.time()
    while time.time() - t0 < 60 and p.evaluate("SHOP.phase") == 'fight':
        p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); p.wait_for_timeout(400)
    p.evaluate("for (const d of SHOP.drops) { d.x = P.x; d.y = P.y; }"); p.wait_for_timeout(2000)      # монеты с врагов — под ноги героя
    p.evaluate("(() => { SHOP.gold += 5000; const id = Object.keys(PARTS).sort((a, b) => PARTS[a].pr - PARTS[b].pr)[0]; window.__item = id; buyItem(id); SHOP.buy('flask', 'heal'); sellItem(0); })()")
    p.evaluate("if (PATHMAP.on) { " + GO + " } else SHOP.startWave()"); p.wait_for_timeout(1500)
    if p.evaluate("PATHMAP.on"): p.evaluate(GO)
    p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); p.wait_for_timeout(1500)
    p.evaluate("(() => { const e = enemies.find(x => x.hp > 0); window.__killer = e.type; e.x = P.x + 30; e.y = P.y; P.hp = 1; const u = updateEnemy; for (let i = 0; i < 400 && !(P.dead > 0); i++) { e.atkCd = 0; u(e, 0.05); } if (!(P.dead > 0)) hurtPlayer(1e9); })()")
    p.wait_for_timeout(1500)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()

        print('1. тестовый режим (автопрогон): события в логе, в сеть ничего')
        cx, p = open_page(b, 'allworlds&fakestore=web', keys=True)
        chk('тестовый режим включён сам (автопрогон), отправка выключена', p.evaluate("METRICS.TEST && !METRICS.live && METRICS.state === 'idle'"), p.evaluate("[METRICS.TEST, METRICS.live, METRICS.state]"))
        play(p, archer=True)
        p.evaluate("(() => { METRICS.cine('world_01.mp4', true); METRICS.cine('intro.mp4', false); METRICS.ad('Show', 'reward', 'gold'); METRICS.ad('RewardReceived', 'reward', 'gold'); METRICS.ad('FailedShow', 'inter', 'round'); METRICS.purchase('PRO'); METRICS.goldOut(300, 'Forge', 'q'); METRICS.error('TypeError: x is not a function', 'https://duelarena.app/combat.js?v=122', 12); METRICS.flush(); })()")
        L = p.evaluate("METRICS.log"); kinds = {}
        for e in L: kinds.setdefault(e[0] + (':' + e[1] if e[0] in ('prog', 'res', 'ad') else ''), []).append(e)
        prog = [(e[1], e[2], e[3]) for e in L if e[0] == 'prog']; des = [e[1] for e in L if e[0] == 'design']
        print('       событий в логе:', len(L), '·', ', '.join('%s×%d' % (k, len(v)) for k, v in sorted(kinds.items())))
        pairs = list(zip(prog[0::2], prog[1::2])); last = prog[-1][1] + ':' + prog[-1][2] if prog else ''
        chk('прохождение: у каждой волны старт и исход; первая арена (волны с 1-й) пройдена, на следующей — гибель (%s)' % last, len(prog) >= 4 and len(prog) % 2 == 0 and prog[0] == ('Start', 'World01', 'Wave01') and all(a[0] == 'Start' and a[1:] == b[1:] for a, b in pairs) and [b[0] for a, b in pairs] == ['Complete'] * (len(pairs) - 1) + ['Fail'], prog)
        fail = [e for e in L if e[0] == 'prog' and e[1] == 'Fail'][0][4]; killer = p.evaluate("__killer")
        chk('в гибели — уровень врагов и кто убил (%s)' % killer, fail.get('enemy_level') == p.evaluate('LEVEL.n') and fail.get('killer') == killer and fail.get('hero') == 'Eira', fail)
        d = [e for e in L if e[0] == 'design' and e[1].startswith('Death:')]
        chk('смерть: Death:%s:%s, значение — уровень врагов' % (last, killer), len(d) == 1 and d[0][1] == 'Death:' + last + ':' + killer and d[0][2] == p.evaluate('LEVEL.n'), d)
        chk('новая игра, герой, язык, уровень героя на входе в мир', all(x in des for x in ('Game:New:Eira', 'Hero:Select:Eira', 'Lang:ru', 'HeroLevel:World01')) and any(x.startswith('Session:Start:') for x in des), des)
        chk('эйра записана латиницей (Eira), Ганфаул — Ganfaul', p.evaluate("(() => { const n = METRICS.log.length; setHero('mage'); const r = METRICS.log.slice(n).map(e => e[1]); setHero('archer'); return r; })()").count('Hero:Select:Ganfaul') == 1)
        res = [(e[1], e[3], e[4], e[2]) for e in L if e[0] == 'res']; item = p.evaluate("__item")
        src = {t: n for f, t, i, n in res if f == 'Source'}; sink = {(t, i): n for f, t, i, n in res if f == 'Sink'}
        chk('золото — приход: с врагов и за арену, отдельно продажа', src.get('Enemies', 0) > 0 and src.get('Arena', 0) > 0 and src.get('Sell', 0) > 0, res)
        chk('золото — расход: предмет (%s), склянка, кузница' % item, sink.get(('Item', item), 0) > 0 and sink.get(('Flask', 'heal'), 0) > 0 and sink.get(('Forge', 'q')) == 300, res)
        chk('золото уходит одной строкой на волну, а не на каждую монету', len(res) <= 12, len(res))
        chk('ролики: Cinematic:world_01:Watched и Cinematic:intro:Skipped', 'Cinematic:world_01:Watched' in des and 'Cinematic:intro:Skipped' in des, des)
        chk('реклама: показ, награда, не показалась', [(e[1], e[2], e[3]) for e in L if e[0] == 'ad'] == [('Show', 'RewardedVideo', 'gold'), ('RewardReceived', 'RewardedVideo', 'gold'), ('FailedShow', 'Interstitial', 'round')], kinds.get('ad:Show'))
        chk('покупка PRO: товар, цена, валюта', [e[1:] for e in L if e[0] == 'biz'] == [['UZS', 4900000, 'Upgrade', 'PRO', 'menu']], [e for e in L if e[0] == 'biz'])
        er = [e[1] for e in L if e[0] == 'err']
        chk('ошибка JS: текст и место в коде, без адреса страницы', er == ['TypeError: x is not a function @combat.js:12'], er)
        n0 = len(p.evaluate("METRICS.log")); p.evaluate("setTimeout(() => { undefinedFunctionForTest(); }, 0)"); p.wait_for_timeout(500); er = [e[1] for e in p.evaluate("METRICS.log")[n0:] if e[0] == 'err']
        chk('настоящая ошибка на странице попадает в события', len(er) == 1 and 'undefinedFunctionForTest' in er[0], er); p.errs.clear()
        badid = [x for x in des if not ID.match(x)] + [str(e) for e in L if e[0] == 'prog' and not (ID.match(e[2]) and ID.match(e[3]))] + [str(e) for e in L if e[0] == 'res' and not (re.match(r'^[A-Za-z0-9_]{1,64}$', e[3]) and re.match(r'^[A-Za-z0-9_.\-]{1,64}$', e[4]))]
        chk('все имена событий годятся для GameAnalytics (латиница, не длиннее 64 знаков, не больше 5 частей)', not badid, badid[:5])
        priv = [json.dumps(e, ensure_ascii=False) for e in L if re.search(r'[A-Za-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}|https?://|\b\d{1,3}(\.\d{1,3}){3}\b', json.dumps(e, ensure_ascii=False))]
        chk('в событиях нет адресов, почты и прочих личных данных', not priv, priv[:3])
        chk('SDK не загружен, файл ключей даже не запрашивался, запросов к GameAnalytics нет', not p.lib and not p.keyfile and not p.ga and not p.evaluate("!!window.gameanalytics"), [p.lib, p.keyfile, len(p.ga)])
        print('6. скорость')
        t = p.evaluate("(() => { const t0 = performance.now(); for (let i = 0; i < 20000; i++) METRICS._watch(); return (performance.now() - t0) / 20000; })()")
        chk('слежение за боем добавляет к кадру %.4f мс (кадр — 16,7 мс)' % t, t < 0.05, t)
        chk('ошибок на странице нет', not p.errs, p.errs[:3]); cx.close()

        print('2. файла ключей нет (как на сайте): SDK не грузится, запросов нет')
        cx, p = open_page(b, 'allworlds&fakestore=web&stats=send')
        play(p); p.wait_for_timeout(6000)
        chk('файла ключей нет: отправка выключена, SDK не грузится, запросов нет, лог пуст', p.evaluate("!METRICS.TEST && METRICS.keys === 'no' && !METRICS.live && METRICS.state === 'idle' && METRICS.log.length === 0 && !window.gameanalytics") and not p.lib and not p.ga, [p.evaluate("[METRICS.TEST, METRICS.keys, METRICS.live, METRICS.state, METRICS.log.length]"), p.lib, len(p.ga)])
        chk('игра идёт как обычно, ошибок нет', not p.errs, p.errs[:3]); cx.close()
        cx, p = open_page(b, 'allworlds&fakestore=web'); p.evaluate('1'); cx.close()
        cx = b.new_context(viewport={'width': 1280, 'height': 600}); p = cx.new_page(); kf = []; p.on('request', lambda r: kf.append(r.url) if ('stats_keys.js' in r.url or 'gameanalytics' in r.url.lower()) else None)
        cx.add_init_script('Object.defineProperty(navigator, "webdriver", { get: () => false })')
        p.goto(BASE + '?fakestore=web', timeout=120000); p.wait_for_function("typeof METRICS !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); p.wait_for_timeout(9000)
        chk('обычный игрок на сайте (не автопрогон): файл ключей не запрашивается, SDK не грузится', not kf and p.evaluate("!METRICS.TEST && METRICS.keys === 'no' && METRICS.state === 'idle'"), [kf, p.evaluate('[METRICS.TEST, METRICS.keys, METRICS.state]')]); cx.close()

        print('3. ключи есть, сети до GameAnalytics нет')
        cx, p = open_page(b, 'allworlds&fakestore=web&stats=send', keys=True, net='down')
        play(p); p.wait_for_timeout(8000)
        s = p.evaluate("({ live: METRICS.live, state: METRICS.state, sdk: !!window.gameanalytics, phase: SHOP.phase, limbo: LIMBO.on, dead: P.dead })")
        chk('SDK загрузился и пытался связаться с сервером (запросов оборвано: %d)' % len(p.ga), s['live'] and s['state'] in ('init', 'ready') and s['sdk'] and len(p.ga) > 0, s)
        f0 = p.evaluate("(() => { window.__f = 0; const t = () => { __f++; requestAnimationFrame(t); }; t(); return 1; })()"); p.wait_for_timeout(2000); fr = p.evaluate("__f")
        chk('игра при этом идёт (кадров за 2 с: %d), ошибок на странице нет' % fr, fr > 30 and not p.errs, p.errs[:3]); cx.close()
        cx, p = open_page(b, 'allworlds&fakestore=web&stats=send', keys=True, net='down')
        cx.route(re.compile(r'GameAnalytics\.min\.js'), lambda route: route.abort()); p.reload(); p.wait_for_function("typeof METRICS !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); p.wait_for_timeout(3000)
        play(p); p.wait_for_timeout(6000)
        chk('сам SDK не загрузился (файл недоступен) — игра идёт, очередь событий сброшена, ошибок нет', p.evaluate("METRICS.state === 'failed' && !window.gameanalytics") and not p.errs, [p.evaluate("METRICS.state"), p.errs[:3]]); cx.close()

        print('4. ключи есть (файл сборки stats_keys.js), сервер отвечает: события уходят')
        cx, p = open_page(b, 'allworlds&fakestore=web&stats=send', keys=True, net='ok')
        play(p); p.evaluate("METRICS.flush()")
        t0 = time.time(); sent = []
        while time.time() - t0 < 45:
            sent = []
            for r in p.ga:
                if '/events' in r['url'] and r['body']:
                    try: sent += json.loads(r['body'])
                    except Exception: pass
            if any(e.get('category') == 'progression' and 'Fail' in e.get('event_id', '') for e in sent): break
            p.wait_for_timeout(1000)
        cats = {}
        for e in sent: cats[e.get('category')] = cats.get(e.get('category'), 0) + 1
        ids = [e.get('event_id') for e in sent if e.get('category') in ('progression', 'design', 'resource')]
        print('       ушло событий:', len(sent), cats)
        chk('на сервер ушли прохождение (с самого первого события), смерть и золото', 'Start:World01:Wave01' in ids and 'Complete:World01:Wave01' in ids and any(str(i).startswith('Fail:World01:') for i in ids) and any(str(i).startswith('Death:World01:') for i in ids) and any(str(i).startswith('Session:Start') for i in ids) and any(str(i).startswith('Source:Gold:') for i in ids) and any(str(i).startswith('Sink:Gold:Item:') for i in ids), ids[:40])
        one = next((e for e in sent if e.get('category') == 'progression'), {})
        chk('в событии: версия игры, герой, язык, площадка; номер установки — случайный', one.get('build') == p.evaluate("'1.0.' + /(\\d+)/.exec(V)[1]") and one.get('custom_01') == 'Ganfaul' and one.get('custom_02') == 'ru' and one.get('custom_03') == 'web' and re.match(r'^[0-9a-f-]{32,40}$', str(one.get('user_id', ''))), {k: one.get(k) for k in ('build', 'custom_01', 'custom_02', 'custom_03', 'user_id')})
        keys_sent = sorted(set(k for e in sent for k in e.keys()))
        print('       поля, которые SDK кладёт в событие:', ', '.join(keys_sent))
        json.dump(sent[:60], open(os.path.join(OUT, 'sent_events.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        chk('ошибок на странице нет', not p.errs, p.errs[:3])

        print('5. выключатель в настройках')
        p.evaluate("[...document.querySelectorAll('.mb, #mMain .b')].length")
        p.evaluate("METRICS.set(false)"); n0 = len(p.ga); p.evaluate("METRICS.cine('world_02.mp4', true); METRICS.flush()"); p.wait_for_timeout(4000)
        late = [e for r in p.ga[n0:] if '/events' in r['url'] and r['body'] for e in json.loads(r['body']) if 'world_02' in str(e.get('event_id'))]
        chk('выключили — новые события не уходят, выбор запомнен', not late and p.evaluate("localStorage.getItem('hw_stats')") == '0' and not p.evaluate("METRICS.on"), late[:2])
        p2 = cx.new_page(); p2.lib = []; p2.on('request', lambda r: p2.lib.append(r.url) if 'GameAnalytics.min.js' in r.url else None); n0 = len(p.ga)
        p2.goto(BASE + '?allworlds&fakestore=web&stats=send', timeout=120000); p2.wait_for_function("typeof METRICS !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); p.wait_for_timeout(7000)
        chk('следующий запуск с выключенной статистикой: SDK не грузится, запросов нет', not p2.lib and len(p.ga) == n0 and p2.evaluate("!METRICS.on && !METRICS.live && METRICS.state === 'idle'"), [p2.lib, len(p.ga) - n0])
        p2.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Настройки')." + PD); p.wait_for_timeout(800)
        row = p2.evaluate("(() => { const r = [...document.querySelectorAll('.row')].find(r => r.firstChild && r.firstChild.textContent === 'Статистика'); if (!r) return null; const o = [...r.querySelectorAll('.o')], b = r.getBoundingClientRect(); return { opts: o.map(x => x.textContent + (x.classList.contains('on') ? '*' : '')), vis: b.width > 0 && b.bottom <= innerHeight && b.top >= 0 }; })()")
        chk('в настройках строка «Статистика»: Отправлять / Нет, отмечено «Нет», строка на экране', row and row['opts'] == ['Отправлять', 'Нет*'] and row['vis'], row)
        p2.screenshot(path=os.path.join(OUT, '1_settings.png'))
        p2.evaluate("(() => { const r = [...document.querySelectorAll('.row')].find(r => r.firstChild.textContent === 'Статистика'); r.querySelector('.o')." + PD + "; })()"); p.wait_for_timeout(500)
        chk('включили обратно в настройках — запомнено', p2.evaluate("METRICS.on && localStorage.getItem('hw_stats') === '1'"))
        cx.close(); b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
