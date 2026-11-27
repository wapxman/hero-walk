# -*- coding: utf-8 -*-
"""Правки v124 (14 задач Создателя 27.11) в настоящей странице.
Камера (два положения), один вид выстрела, реплика героя при выборе (оба героя), подсказка о прокачке на портрете, музыка (m1 убрана,
новые треки, своя музыка боссов), предел добавочных групп (мини-босс 5, босс 8), торговцы Междумирья (склянки / вещи), экран загрузки
арены, галерея «История», статистика (счёт, итоги мира, экран в меню, вкладка «Герои» в Альма-матер), «Аналитика» в настройках, английский.
Порядок заставок проверяет cine_check, мелькание чужой локации — trans_check, зал онлайна — lobby_check.
Сервер страниц поднимает сам (порт 8786). Запуск: python tools/v124_check.py     снимки — tests/v124/. Код выхода 1 — красный."""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8786; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'v124'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:420]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"
GO = "for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"
CYR = "(sel) => [...document.querySelectorAll(sel + ' *')].filter(e => e.children.length === 0 && /[А-Яа-яЁё]/.test(e.textContent)).map(e => e.textContent).slice(0, 6)"
def save(wave, gold=1500):
    return json.dumps({'v': 1, 'wave': wave, 'best': wave, 'hp': 900, 'mp': 300, 'gold': gold, 'bag': ['sword', 'boots'], 'flasks': {'heal': 3, 'swift': 2}, 'lv': 1, 't': int(time.time() * 1000)})
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        br = pw.chromium.launch(args=['--autoplay-policy=no-user-gesture-required'])
        def page(store=None, q='', size=(1280, 576)):
            cx = br.new_context(viewport={'width': size[0], 'height': size[1]}); p = cx.new_page(); p.errs = []; p.cx = cx
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            d = dict({'hw_lang': 'ru'}, **(store or {}))
            cx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); const d = %s; for (const k in d) localStorage.setItem(k, d[k]); }" % json.dumps(d))
            p.goto(BASE + ('?' + q if q else ''), timeout=120000)
            p.wait_for_function("document.getElementById('mMain') && getComputedStyle(document.getElementById('mMain')).display === 'block'", timeout=90000); time.sleep(1.2)
            return p
        menu_btn = lambda p, t: p.evaluate("(t) => [...document.querySelectorAll('#mMain .b')].find(b => (b.dataset.ru || b.textContent) === t)." + PD, t)
        def to_fight(p):      # «Продолжить» → карта → бой
            p.evaluate("[...document.querySelectorAll('#mMain .btns .b')][0]." + PD)
            p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(0.8)
            p.evaluate(GO); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=40000); time.sleep(0.8)
        god = "window.__god = setInterval(() => { P.hp = Math.max(P.hp, P.maxHp * 0.6); }, 40); 1"

        print('1. меню, настройки, выбор героя')
        p = page({'hw_cam': '1.95', 'hw_prog_mage': json.dumps({'lvl': 30}), 'hw_prog_archer': json.dumps({'lvl': 5})})
        s = p.evaluate("({ cam: CFG.cam, opts: [...[...document.querySelectorAll('#mSet .row')].find(r => r.firstChild.textContent === 'Камера').querySelectorAll('.o')].map(o => o.textContent + (o.classList.contains('on') ? '*' : '')), rows: [...document.querySelectorAll('#mSet .row')].map(r => r.firstChild.textContent) })")
        chk('камера: только «Обычно» и «Чуть дальше»; сохранённое «Далеко» стало «Чуть дальше»', s['opts'] == ['Обычно', 'Чуть дальше*'] and abs(s['cam'] - 1.8) < 1e-6, s)
        chk('в настройках строка «Аналитика» (а «Статистика» — отдельный экран)', 'Аналитика' in s['rows'] and 'Статистика' not in s['rows'], s['rows'])
        chk('в главном меню есть «История» и «Статистика»', p.evaluate("!!document.querySelector('#mMain .b.story') && !!document.querySelector('#mMain .b.stat')"))
        p.mouse.click(640, 560); time.sleep(0.6)      # первое касание включает звук
        menu_btn(p, 'Герои'); time.sleep(0.6)
        p.wait_for_function("AC && AC.state === 'running' && !!SND.vo_respawn_1 && !!SND.archer_vo_respawn_1", timeout=30000)
        chk('выбора «Выстрел: 1 / 2 / 3» больше нет, вид выстрела один', p.evaluate("!document.querySelector('.shotSel') && /1$/.test(SHOTS.id())"))
        p.evaluate("window.__lv = 0; { const f = vo; vo = function (n) { if (n === 'levelup') __lv++; return f.apply(this, arguments); }; } 1")
        p.evaluate("document.querySelectorAll('#hSel .card')[1]." + PD); time.sleep(0.5); a = p.evaluate("({ vo: pickVoice.log.slice(), hero: HERO_ID, lvl: P.lvl })")
        p.evaluate("document.querySelectorAll('#hSel .card')[0]." + PD); time.sleep(1.5); b = p.evaluate("({ vo: pickVoice.log.slice(), hero: HERO_ID, lvl: P.lvl, lv: __lv })")
        chk('Эйра при выборе говорит свою реплику', a['hero'] == 'archer' and a['vo'] == ['archer_vo_respawn'], a)
        chk('Ganfaul, выбранный сразу следом, тоже говорит (прежняя реплика обрывается); фраза «новый уровень» при смене героя не звучит', b['hero'] == 'mage' and b['lvl'] == 30 and b['vo'] == ['archer_vo_respawn', 'vo_respawn'] and b['lv'] == 0, b)
        chk('музыка: m1 нет, в общем круге m2–m7 и g1–g4, у десяти миров — треки боссов b1–b6', p.evaluate("MUSIC.map(m => m[0]).join() === 'm2,m3,m4,m5,m6,m7,g1,g2,g3,g4' && [1,2,3,4,5,6,7,8,9,10].every(w => /^b[1-6]$/.test(BOSS_MUSIC[w]))"))
        r = p.evaluate("(async () => { const out = {}; for (const f of ['m1', ...MUSIC.map(m => m[0]), ...new Set(Object.values(BOSS_MUSIC))]) out[f] = (await fetch('music/' + f + '.mp3', { method: 'HEAD' })).status; return out; })()")
        chk('файлы музыки на месте (m1 удалён)', r.get('m1') == 404 and all(v == 200 for k, v in r.items() if k != 'm1') and len(r) == 17, r)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()

        print('2. бой: подсказка о прокачке, предел групп, музыка босса, счёт статистики, итоги мира')
        p = page({'hw_run_mage': save(9), 'hw_cine': json.dumps({'world_%02d' % n: 1 for n in range(1, 11)}), 'hw_hero': 'mage'}, 'tally=1')
        p.mouse.click(640, 560); time.sleep(0.5); to_fight(p); p.evaluate(god)
        s = p.evaluate("(() => { P.sp = 2; P.stp = 1; progUI(); const h = document.getElementById('hHero'), l = h.querySelector('.upl'); const a = { up: h.classList.contains('up'), txt: l.textContent, shown: getComputedStyle(l).display, ring: getComputedStyle(h.querySelector('.upr')).display }; l." + PD + "; a.open = getComputedStyle(document.getElementById('hProg')).display; progOpen(false); P.sp = 0; P.stp = 0; progUI(); a.off = !h.classList.contains('up') && getComputedStyle(l).display === 'none'; return a; })()")
        chk('есть очки — портрет в кольце и подпись «Прокачка +3»; нажатие открывает прокачку; очков нет — подсказки нет', s['up'] and s['txt'] == '▲ Прокачка +3' and s['shown'] == 'block' and s['ring'] == 'block' and s['open'] == 'flex' and s['off'], s)
        p.screenshot(path=os.path.join(OUT, '2_boss_fight.png'))
        s = p.evaluate("(() => { const b = enemies.find(e => e.boss), m = { mini: 1, grpN: 0 }; const a = [], c = []; for (let i = 0; i < 10; i++) a.push(HARD.grp({ boss: 1, grpN: i })); let n = 0; const x = { boss: 1 }; while (HARD.grp(x)) n++; let k = 0; while (HARD.grp(m)) k++; return { boss: !!b, n, k, cap: HARD.GRP }; })()")
        chk('добавочных групп: к боссу не больше 8, к мини-боссу не больше 5', s['boss'] and s['n'] == 8 and s['k'] == 5 and s['cap'] == {'mini': 5, 'boss': 8}, s)
        s = p.evaluate("(() => { const b = enemies.find(e => e.boss); b.grpN = 8; b.rfT = 0; b.hSum = 0; HARD.rfQ.length = 0; for (let i = 0; i < 80; i++) { P.hp = P.maxHp; combatUpdate(0.25); } return { q: HARD.rfQ.length, reinf: enemies.filter(e => e.reinf || e.ally).length, n: b.grpN }; })()")
        chk('группы исчерпаны — новые подкрепления и призыв босса не идут', s['q'] == 0 and s['reinf'] == 0 and s['n'] == 8, s)
        p.wait_for_function("mus.el && mus.boss === 'b1' && /music\\/b1\\.mp3/.test(mus.el.src)", timeout=15000)
        chk('в бою с боссом мира 1 играет его трек', True)
        t0 = p.evaluate("JSON.parse(JSON.stringify(TALLY.T()))")
        p.evaluate("for (const e of enemies.slice()) if (!e.boss) hurtEnemy(e, 1e6); P.hp -= 50; cast('q'); 1"); time.sleep(2.0)
        t9 = time.time()
        while time.time() - t9 < 60 and not p.evaluate("TALLY.win"):      # босс, его союзники и подкрепления — добиваем, пока не выйдет окно итогов
            p.evaluate("if (SHOP.phase === 'fight') for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); time.sleep(0.4)
        chk('после победы над боссом вышло окно итогов мира', p.evaluate("TALLY.win"), p.evaluate("({ ph: SHOP.phase, wave, en: enemies.length, map: PATHMAP.on, last: TALLY.D.last && TALLY.D.last.fresh, run: !!TALLY.D.run })"))
        time.sleep(1.8); p.screenshot(path=os.path.join(OUT, '2_world_summary.png'))
        t1 = p.evaluate("JSON.parse(JSON.stringify(TALLY.T()))")
        chk('счёт идёт: убийства, босс, урон, время, полученный урон, пройденный мир', t1['kills'] > t0['kills'] and t1['boss'] == 1 and t1['dmg'] > 0 and t1['time'] > 1 and t1['taken'] >= 49 and t1['worlds'] == 1 and t1['waves'] >= 1 and t1['hit'] > 0, t1)
        s = p.evaluate("(() => { const w = document.getElementById('tlWin'); return { title: w.querySelector('.tt').textContent, rank: w.querySelector('.rk b').textContent, rows: w.querySelectorAll('.rt .rw').length, who: w.querySelector('.who').textContent, tr: w.querySelector('.tr').style.backgroundImage, map: PATHMAP.on, paused: SHOP.paused, lv: /Ур\. врагов|уровень врагов/i.test(w.textContent) }; })()")
        chk('после босса — окно «Мир 1 пройден»: трофей, оценка, 10 строк; карта ещё не открыта, игра стоит', s['title'] == 'Мир 1 пройден' and s['rank'] in 'SABC' and s['rows'] == 10 and 'повержен' in s['who'] and 't_b_' in s['tr'] and not s['map'] and s['paused'], s)
        chk('скрытый уровень врагов в итогах не показан', not s['lv'], s)
        p.wait_for_function("!mus.boss", timeout=10000); chk('босс пал — музыка босса сменилась общим кругом', p.evaluate("!/music\\/b\\d\\.mp3/.test(mus.el.src)"))
        p.evaluate("document.querySelector('#tlWin .go')." + PD); p.wait_for_function("PATHMAP.on && !TALLY.win", timeout=15000)
        chk('«Дальше» — окно закрыто, идёт карта перехода в мир 2', True)
        s = p.evaluate("(() => { const d = JSON.parse(localStorage.getItem('hw_tally')); return { best: d.best.mage && d.best.mage[1], last: !!d.last, h: d.h.mage.worlds }; })()")
        chk('итог записан навсегда: лучший результат мира 1 и общий счёт героя', bool(s['best']) and s['best']['rank'] in 'SABC' and s['h'] == 1, s)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()

        print('3. торговцы Междумирья и лавка в бою')
        p = page({'hw_run_mage': save(12), 'hw_cine': json.dumps({'world_%02d' % n: 1 for n in range(1, 11)}), 'hw_hero': 'mage'})
        to_fight(p)
        TABS = "[...document.querySelectorAll('#shTabs > div')].filter(d => getComputedStyle(d).display !== 'none').map(d => d.dataset.ru || d.textContent)"
        p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9); ROUND.queue.length = 0; ROUND.mini = null; 1"); p.wait_for_function("SHOP.phase === 'rest'", timeout=30000); time.sleep(1.0)
        s = p.evaluate("(() => { SHOP.openShop(); const a = { open: SHOP.open, kind: SHOP.kind || '', tabs: %s, bag: getComputedStyle(document.getElementById('shBag')).display }; SHOP.closeShop(); return a; })()" % TABS)
        chk('лавка между волнами в бою — как раньше: все четыре вкладки', s['open'] and s['kind'] == '' and s['tabs'] == ['Предметы', 'Части', 'Против боссов', 'Склянки'] and s['bag'] != 'none', s)
        p.evaluate("LIMBO.enter(); 1"); time.sleep(1.5)
        at = "(id) => { const s = LIMBO.L.st[id]; P.x = s.p[0] * LIMBO.L.size[0] * AK; P.y = s.p[1] * LIMBO.L.size[1] * AK; }"
        p.evaluate(at, 'shop'); time.sleep(1.2); s = p.evaluate("({ open: SHOP.open, kind: SHOP.kind, tabs: %s, bag: getComputedStyle(document.getElementById('shBag')).display })" % TABS); p.screenshot(path=os.path.join(OUT, '3_keeper_flasks.png'))
        chk('Хранитель Перепутья (шатёр): только склянки, сумки для продажи нет', s['open'] and s['kind'] == 'flasks' and s['tabs'] == ['Склянки'] and s['bag'] == 'none', s)
        p.evaluate("(() => { P.x = 0.5 * LIMBO.L.size[0] * AK; P.y = 0.5 * LIMBO.L.size[1] * AK; })()"); time.sleep(1.0)
        s = p.evaluate("(() => { const a = { closed: !SHOP.open }; SHOP.openShop(); a.still = !SHOP.open; return a; })()")
        chk('в стороне от торговцев лавка не открывается (кнопка лавки, клавиша B)', s['closed'] and s['still'], s)
        p.evaluate(at, 'mirror'); time.sleep(1.2); s = p.evaluate("({ open: SHOP.open, kind: SHOP.kind, tabs: %s, bag: getComputedStyle(document.getElementById('shBag')).display })" % TABS); p.screenshot(path=os.path.join(OUT, '3_mirror_items.png'))
        chk('Святилище зеркала: только вещи (предметы, части, против боссов), сумка для продажи на месте', s['open'] and s['kind'] == 'items' and s['tabs'] == ['Предметы', 'Части', 'Против боссов'] and s['bag'] != 'none', s)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()

        print('4. экран загрузки арены')
        p = page({'hw_run_mage': save(40), 'hw_cine': json.dumps({'world_%02d' % n: 1 for n in range(1, 11)}), 'hw_hero': 'mage'})
        p.route('**/arena/world5*', lambda r: (time.sleep(2.5), r.continue_()))
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')][0]." + PD)
        p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(0.8); p.evaluate(GO)
        LD = "(() => { const b = document.getElementById('arenaLoad'); return { op: +getComputedStyle(b).opacity, title: b.children[1].textContent, img: b.children[0].style.backgroundImage, busy: ARENA_COVER.busy }; })()"
        p.wait_for_function("+getComputedStyle(document.getElementById('arenaLoad')).opacity > 0.9", timeout=15000); s = p.evaluate(LD); p.screenshot(path=os.path.join(OUT, '4_loading.png'))
        chk('арена грузится долго — на затемнении медальон и «Глава 5: Гномьи шахты»', s['op'] > 0.9 and s['title'] == 'Глава 5: Гномьи шахты' and 'm5.webp' in s['img'] and s['busy'], s)
        p.wait_for_function("!ARENA_COVER.busy", timeout=20000); time.sleep(0.8); s = p.evaluate(LD)
        chk('арена загрузилась — экран загрузки ушёл', s['op'] < 0.05 and not s['busy'], s)
        chk('без ошибок', not p.errs, p.errs); p.cx.close()
        p = page({'hw_run_mage': save(1), 'hw_cine': json.dumps({'world_%02d' % n: 1 for n in range(1, 11)}), 'hw_hero': 'mage'})
        p.evaluate("window.__ld = 0; setInterval(() => { const b = document.getElementById('arenaLoad'); if (b && +getComputedStyle(b).opacity > 0.05) __ld++; }, 16); 1")
        to_fight(p); time.sleep(1.0)
        chk('арена загрузилась быстро — экран загрузки не мелькает', p.evaluate("__ld") == 0, p.evaluate("__ld")); p.cx.close()

        print('5. «История», «Статистика», Альма-матер — на русском и на английском')
        TAL = {'v': 1, 'h': {'mage': {'kills': 1843, 'elite': 96, 'mini': 27, 'boss': 9, 'dmg': 2954310, 'taken': 184520, 'hit': 4821, 'deaths': 6, 'time': 13954, 'waves': 92, 'gold': 61280, 'spent': 55140, 'flasks': 74, 'dash': 512, 'streak': 38, 'worlds': 9, 'cast': {'q': 310, 'e': 402, 'f': 188, 'r': 41}}},
               'best': {'mage': {str(w): {'t': 600 + w * 37, 'rank': 'SABAASBAC'[w - 1], 'n': 1} for w in range(1, 10)}}}
        for lang, size in (('ru', (1280, 576)), ('en', (915, 412))):
            p = page({'hw_lang': lang, 'hw_tally': json.dumps(TAL), 'hw_cine': json.dumps({'world_01': 1, 'world_02': 1, 'world_03': 1})}, size=size)
            p.evaluate("document.querySelector('#mMain .b.story')." + PD); time.sleep(1.5)
            s = p.evaluate("(async () => { const b = document.getElementById('cineList'), it = [...b.querySelectorAll('.it')]; const bad = []; for (const x of it) { const u = x.querySelector('.fr i').style.backgroundImage.slice(5, -2); if ((await fetch(u, { method: 'HEAD' })).status !== 200) bad.push(u); }"
                           " const r = b.getBoundingClientRect(), last = b.querySelector('.x').getBoundingClientRect(); return { n: it.length, open: it.filter(x => !x.classList.contains('no')).map(x => x.dataset.k), cnt: b.querySelector('.cnt').textContent, bad, fits: last.bottom <= innerHeight + 1 && it[0].getBoundingClientRect().top >= 0, bg: getComputedStyle(it[0]).backgroundImage }; })()")
            p.screenshot(path=os.path.join(OUT, '5_story_%s.png' % lang))
            chk(lang + ': «История» — 12 карточек с гравюрами, открыты пролог и миры 1–3, счётчик, всё помещается на экране', s['n'] == 12 and s['open'] == ['intro', 'world_01', 'world_02', 'world_03'] and ('4 / 12' in s['cnt']) and not s['bad'] and s['fits'] and s['bg'] == 'none', s)
            if lang == 'en': chk('en: в «Истории» нет русского текста', not p.evaluate(CYR, '#cineList'), p.evaluate(CYR, '#cineList'))
            p.evaluate("document.querySelector('#cineList .x')." + PD); time.sleep(0.4)
            p.evaluate("document.querySelector('#mMain .b.stat')." + PD); time.sleep(1.2)
            s = p.evaluate("(() => { const b = document.getElementById('tlScr'), pn = b.querySelector('.pn').getBoundingClientRect(); return { rows: b.querySelectorAll('.col .rw').length, heroes: b.querySelectorAll('.hr div').length, worlds: b.querySelectorAll('.ws .w:not(.no)').length, kills: b.querySelector('.col .rw:nth-child(3) b').textContent, fits: pn.top >= -1 && pn.bottom <= innerHeight + 1, lv: /врагов \\d|Enemy level/.test(b.textContent) }; })()")
            p.screenshot(path=os.path.join(OUT, '5_stats_%s.png' % lang))
            chk(lang + ': «Статистика» — 18 строк, два героя, девять пройденных миров с оценкой, помещается на экране', s['rows'] == 18 and s['heroes'] == 2 and s['worlds'] == 9 and s['kills'].replace(' ', '') == '1843' and s['fits'], s)
            if lang == 'en': chk('en: в «Статистике» нет русского текста', not p.evaluate(CYR, '#tlScr'), p.evaluate(CYR, '#tlScr'))
            p.evaluate("TALLY.close(); TALLY.summary({ hero: 'mage', world: 5, cyc: 1, full: true, c: TALLY.T(), rank: 'A', rec: { time: true } }, () => { window.__next = 1; }); 1"); time.sleep(2.0)
            p.screenshot(path=os.path.join(OUT, '5_summary_%s.png' % lang))
            if lang == 'en': chk('en: в итогах мира нет русского текста', not p.evaluate(CYR, '#tlWin'), p.evaluate(CYR, '#tlWin'))
            p.keyboard.press('Enter'); time.sleep(0.4); chk(lang + ': итоги закрываются клавишей и продолжают игру', p.evaluate("window.__next === 1 && !TALLY.win"))
            p.evaluate("document.getElementById('mMain').style.display = 'none'; ALMA.openBook(); 1"); time.sleep(0.8)
            s = p.evaluate("(() => { const t = [...document.querySelectorAll('#almaBook .tabs div')]; t[t.length - 1]." + PD + "; const bx = document.querySelector('#almaBook .bx').getBoundingClientRect(), l = t[t.length - 1].getBoundingClientRect(), f = t[0].getBoundingClientRect(); return { tabs: t.map(x => x.dataset.ru || x.textContent), fit: f.left >= bx.left && l.right <= bx.right, heroes: document.querySelectorAll('#almaBook .hc .h').length, lines: document.querySelectorAll('#almaBook .r .tl').length }; })()")
            time.sleep(0.6); p.screenshot(path=os.path.join(OUT, '5_alma_%s.png' % lang))
            chk(lang + ': Альма-матер — пятая вкладка «Герои»: два героя и летопись выбранного', s['tabs'][-1] == 'Герои' and len(s['tabs']) == 5 and s['fit'] and s['heroes'] == 2 and s['lines'] >= 20, s)
            if lang == 'en': chk('en: на странице героя нет русского текста', not p.evaluate(CYR, '#almaBook'), p.evaluate(CYR, '#almaBook'))
            chk(lang + ': без ошибок', not p.errs, p.errs); p.cx.close()
        br.close()
finally:
    srv.terminate()
print('ИТОГ: всё в порядке' if not bad else 'ИТОГ: НЕ ПРОШЛО — ' + '; '.join(bad))
sys.exit(1 if bad else 0)
