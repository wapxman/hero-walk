# -*- coding: utf-8 -*-
"""Междумирье v2 (v122) в настоящей странице: новый фон и два новых места, Альма-матер (справочник), Зал трофеев, рекорды, память,
английская версия. Сервер страниц поднимает сам (порт 8786). Снимки — tests/alma/.
Запуск: python tools/alma_check.py     Код выхода 1 — если что-то не прошло."""
import sys, os, re, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8786; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'alma'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:700]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"
GO = "for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"
CYR = re.compile('[А-Яа-яЁё]')
def shot(p, name): p.screenshot(path=os.path.join(OUT, name + '.png'))
def start(p, q):
    p.goto(BASE + '?' + q, timeout=120000); p.wait_for_function("typeof ALMA !== 'undefined' && typeof LEVEL !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(3)
    p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => /^(Новая игра|Продолжить)$/.test(b.dataset.ru || b.textContent))." + PD); time.sleep(1)
    if p.evaluate("getComputedStyle(document.getElementById('hSel')).display") != 'none': p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
    p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(1.0)
    p.evaluate(GO); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(1.0)
def to_limbo(p):
    p.evaluate("hurtPlayer(1e9)"); p.wait_for_function("LIMBO.on", timeout=20000); time.sleep(1.5)
def walk(p, place):      # поставить героя на место и дождаться, что оно сработало
    p.evaluate("(id) => { const L = LIMBO.L, s = L.st[id]; P.x = s.p[0] * L.size[0] * AK; P.y = s.p[1] * L.size[1] * AK; }", place); time.sleep(0.8)
def away(p): p.evaluate("(() => { const L = LIMBO.L; P.x = L.fire[0] * L.size[0] * AK; P.y = L.fire[1] * L.size[1] * AK + 150; })()"); time.sleep(0.6)
VIS = "(id) => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; }"
def tab(p, name): p.evaluate("(t) => [...document.querySelectorAll('#almaBook .tabs div')].find(d => (d.dataset.ru || d.textContent) === t)." + PD, name); time.sleep(0.5)
BOOK = """(() => { const c = [...document.querySelectorAll('#almaBook .grid .c')], R = document.querySelector('#almaBook .pg.r'), l = document.querySelector('#almaBook .pg.l').getBoundingClientRect(), bx = document.querySelector('#almaBook .bx').getBoundingClientRect();
  const inPage = c.every(x => { const r = x.getBoundingClientRect(); return r.left >= l.left - 2 && r.right <= l.right + 2 && r.bottom <= l.bottom + 2; });
  return { n: c.length, open: c.filter(x => x.dataset.open === '1').map(x => x.dataset.id), names: c.map(x => x.querySelector('.nm').textContent), locked: c.filter(x => x.querySelector('.lock')).length, inPage,
    cnt: document.querySelector('#almaBook .pager .cnt').textContent, sel: R.dataset.id, title: (R.querySelector('h3') || {}).textContent, text: R.textContent, scroll: R.scrollHeight > R.clientHeight + 4,
    pics: c.filter(x => { const v = x.querySelector('canvas'); if (!v) return !!x.querySelector('.ci span'); const d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n > 60; }).length,
    box: [Math.round(bx.width), Math.round(bx.height)] }; })()"""
def cell(p, id): p.evaluate("(id) => document.querySelector('#almaBook .grid .c[data-id=\"' + id + '\"]')." + PD, id); time.sleep(0.4)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        start(p, 'allworlds&fakestore=web')
        print('память: что герой встретил и победил')
        s = p.evaluate("({ seen: Object.keys(ALMA.D().seen), now: [...new Set(enemies.map(e => e.type))], items: Object.keys(ALMA.D().items) })")
        chk('враги первой волны записаны как встреченные; склянка лечения — как найденная', s['seen'] and all(t in s['seen'] for t in s['now']) and 'f:heal' in s['items'], s)
        st0 = p.evaluate("[P.maxHp, P.maxMp, SHOP.gold]")
        p.evaluate("window.__god = setInterval(() => { P.hp = P.maxHp; }, 50); 1")
        # мини-босс и босс мира 1: встретить и победить; крит; предмет
        p.evaluate("(() => { enemies.length = 0; ROUND.queue.length = 0; ROUND.mini = 'mb_arbalest'; spawnEnemy('mb_arbalest'); const m = enemies[enemies.length - 1]; m.x = P.x + 400; m.almaT = 12; spawnEnemy('b_blackknight'); const e = enemies[enemies.length - 1]; e.x = P.x + 500; e.almaT = 83.4; "
                   "spawnEnemyBase('mb_executioner'); SHOP.gold += 5000; buyItem('boots'); P.crit = 1; HIT.atk = true; hurtEnemy(e, 100); HIT.atk = false; P.crit = 0; SHOP.recompute(); })()"); time.sleep(0.3)
        p.evaluate("(() => { for (const e of enemies.slice()) if (e.type !== 'mb_executioner') hurtEnemy(e, 1e12); })()"); time.sleep(0.5)
        d = p.evaluate("ALMA.D()")
        chk('босс побеждён: записаны дата, герой и время боя (83 с)', 'b_blackknight' in d['boss'] and 83 <= d['boss']['b_blackknight']['sec'] <= 85 and d['boss']['b_blackknight']['hero'] == 'Ganfaul' and abs(d['boss']['b_blackknight']['d'] / 1000 - time.time()) < 120, d['boss'])
        SEC = d['boss'].get('b_blackknight', {}).get('sec')
        chk('мини-босс побеждён — отмечен; второй только встречен', d['mini'].get('mb_arbalest') == 1 and 'mb_executioner' not in d['mini'] and d['seen'].get('mb_executioner') == 1, [d['mini'], list(d['seen'])])
        chk('самый сильный крит записан', d['rec']['crit'] >= 150, d['rec']); chk('купленный предмет записан', d['items'].get('boots') == 1, d['items'])
        clearInterval = p.evaluate("clearInterval(window.__god)")
        to_limbo(p)
        print('площадь Междумирья')
        s = p.evaluate("({ st: Object.keys(LIMBO.L.st), bg: img.ground && img.ground.src ? img.ground.src.split('/').slice(-2).join('/').split('?')[0] : '', w: [WORLD_W, WORLD_H] })")
        chk('мест шесть: кузница, лавка, зеркало, портал, Альма-матер, Зал трофеев; фон — новый', s['st'] == ['forge', 'shop', 'mirror', 'portal', 'alma', 'trophy'] and s['bg'] == 'limbo/bg.webp', s)
        s = p.evaluate("(() => { const L = LIMBO.L, r = {}; for (const id in L.st) { const q = L.st[id]; const x = q.p[0] * L.size[0] * AK, y = q.p[1] * L.size[1] * AK; r[id] = { walk: NAV.free ? NAV.free(x, y) : null, plaza: Math.pow((q.p[0] - L.plaza.c[0]) / L.plaza.r[0], 2) + Math.pow((q.p[1] - L.plaza.c[1]) / L.plaza.r[1], 2) < 1, solid: SOLID.some(o => Math.pow((x - o.x) / o.rx, 2) + Math.pow((y - o.y) / o.ry, 2) < 1) }; } return r; })()")
        chk('к каждому месту можно подойти (точка на площади и не внутри препятствия)', all(v['plaza'] and not v['solid'] for v in s.values()), s)
        z = p.evaluate("(() => { window.__z = cam.z; return 1; })()")
        shot(p, '1_plaza_fire')
        for pl in ('forge', 'shop', 'mirror', 'alma', 'trophy'):      # снимок площади с героем у каждого места (окна закрыты)
            walk(p, pl); p.evaluate("(() => { ALMA.close(); if (SHOP.open) SHOP.closeShop(); const f = document.getElementById('forge'); if (f) f.style.display = 'none'; })()"); time.sleep(0.5); shot(p, '1_plaza_' + pl)
            away(p)
        p.evaluate("(() => { const L = LIMBO.L, s = L.st.portal; P.x = s.p[0] * L.size[0] * AK; P.y = (s.p[1] + 0.07) * L.size[1] * AK; })()"); time.sleep(0.8); shot(p, '1_plaza_portal'); away(p)
        s = p.evaluate("(() => { const L = LIMBO.L, c = L.plaza.c, st = L.st, d = (a, b) => Math.abs(st[a].p[0] - c[0] + st[b].p[0] - c[0]) < 0.011 && Math.abs(st[a].p[1] - st[b].p[1]) < 0.011; return { pairs: d('forge', 'shop') && d('mirror', 'alma'), axis: Math.abs(st.portal.p[0] - 0.5) < 0.011 && Math.abs(st.trophy.p[0] - 0.5) < 0.011 && Math.abs(L.fire[0] - 0.5) < 0.011, solids: L.solid.length }; })()")
        chk('расстановка зеркальная: кузница — лавка, зеркало — Альма-матер; портал, костёр и Зал трофеев — по центру', s['pairs'] and s['axis'] and s['solids'] == 6, s)
        print('Альма-матер')
        walk(p, 'alma'); time.sleep(0.6)
        chk('подошёл к библиотеке — открылась книга', p.evaluate(VIS, 'almaBook') and p.evaluate("ALMA.cur") == 'book')
        time.sleep(1.5); s = p.evaluate(BOOK); shot(p, '2_book_bosses')
        chk('вкладки: Боссы, Мини-боссы, Враги, Предметы', p.evaluate("[...document.querySelectorAll('#almaBook .tabs div')].map(d => d.textContent)") == ['Боссы', 'Мини-боссы', 'Враги', 'Предметы'])
        chk('боссы: 10 записей, открыт только встреченный (Бранд), у остальных «???» и тёмный силуэт', s['n'] == 10 and s['open'] == ['b_blackknight'] and s['names'].count('???') == 9 and s['locked'] == 9 and s['names'][0] == 'Бранд', s)
        chk('картинки у всех десяти есть (кадр из листа босса), записи умещаются на странице', s['pics'] == 10 and s['inPage'], [s['pics'], s['inPage']])
        chk('запись босса: имя, титул, мир, описание и умения из текстов Клауди; здоровье и урон — из игры', s['title'] == 'Бранд' and all(x in s['text'] for x in ('Железный маршал Хоргата', 'Чёрный Рыцарь', 'Королевский замок', 'Тысячу лет мир Хоргат', 'Умения', 'Таран', 'Призрачная конница', 'Здоровье', 'Урон')), s['text'][:300])
        cell(p, 'b_voidmage'); s2 = p.evaluate(BOOK)
        chk('закрытая запись: «???» и подсказка, как открыть; текста босса нет', s2['title'] == '???' and 'встретит этого врага' in s2['text'] and 'Ардан' not in s2['text'], s2['text'])
        tab(p, 'Мини-боссы'); time.sleep(1.5); s = p.evaluate(BOOK); shot(p, '3_book_minis')
        chk('мини-боссы: 30 записей на двух страницах, открыты два встреченных', '30' in s['cnt'] and '1/2' in s['cnt'] and s['n'] == 20 and set(s['open']) == {'mb_arbalest', 'mb_executioner'} and s['pics'] == 20, s)
        chk('запись мини-босса: имя, мир, описание, умения', s['title'] == 'Королевская арбалетчица' and 'Лучший стрелок дворцовой стражи' in s['text'] and 'Град болтов' in s['text'], s['text'][:200])
        p.evaluate("document.querySelector('#almaBook .pager .ar.n')." + PD); time.sleep(1.0); s = p.evaluate(BOOK)
        chk('вторая страница: ещё 10 записей', s['n'] == 10 and '2/2' in s['cnt'], s['cnt'])
        tab(p, 'Враги'); time.sleep(1.5); s = p.evaluate(BOOK); shot(p, '4_book_foes')
        tot = p.evaluate("ALMA.list('foe').length"); seen = p.evaluate("ALMA.list('foe').filter(ALMA.isOpen).map(e => e.id)")
        chk('враги (рядовые и элита, %d): открыты только встреченные (%d)' % (tot, len(seen)), tot >= 60 and len(seen) >= 1 and set(s['open']) <= set(seen) and str(tot) in s['cnt'] and s['pics'] == s['n'], [tot, seen, s['cnt'], s['pics']])
        chk('запись врага: имя, тип, мир, здоровье и урон из данных игры', all(x in s['text'] for x in ('Тип', 'Мир', 'Здоровье', 'Урон')) and s['title'] == p.evaluate("(id) => { const n = KIND[id].nm; return Array.isArray(n) ? n[0] : n; }", s['sel']), [s['title'], s['text']])
        tab(p, 'Предметы'); time.sleep(0.8); s = p.evaluate(BOOK); shot(p, '5_book_items')
        tot = p.evaluate("ALMA.list('item').length")
        chk('предметы (%d, со склянками и реликвиями): открыт купленный, остальные «???»' % tot, 'boots' in s['open'] and s['n'] == 20 and s['pics'] == 20 and s['names'].count('???') >= 15, s)
        cell(p, 'boots'); s = p.evaluate(BOOK)
        chk('запись предмета: имя, описание, цена', s['title'] == p.evaluate("ALL.boots.nm") and 'Цена' in s['text'] and p.evaluate("itemText(ALL.boots)") in s['text'], s['text'])
        rid = p.evaluate("Object.keys(RECIPES).find(id => RECIPES[id].from.includes('boots'))"); p.evaluate("(id) => { ALMA.D().items[id] = 1; }", rid)
        pg = p.evaluate("(id) => Math.floor(ALMA.list('item').findIndex(e => e.id === id) / 20)", rid)
        for i in range(pg): p.evaluate("document.querySelector('#almaBook .pager .ar.n')." + PD); time.sleep(0.4)
        cell(p, rid); s = p.evaluate(BOOK); shot(p, '5b_book_recipe')
        chk('собираемый предмет: рецепт — из чего собирается (найденные части названы, остальные «???»)', 'Собирается из' in s['text'] and p.evaluate("ALL.boots.nm") in s['text'], s['text'])
        for i in range(10):
            if p.evaluate("!!document.querySelector('#almaBook .grid .c[data-id=heal]')"): break
            p.evaluate("document.querySelector('#almaBook .pager .ar.n')." + PD); time.sleep(0.4)
        cell(p, 'heal'); s = p.evaluate(BOOK)
        chk('склянки — в той же вкладке: склянка лечения открыта, написано, как пьётся', s['title'] == 'Склянка лечения' and 'вручную' in s['text'], s['text'])
        p.evaluate("document.querySelector('#almaBook .x')." + PD); time.sleep(0.4)
        chk('крестик закрывает книгу', not p.evaluate(VIS, 'almaBook') and p.evaluate("ALMA.cur") is None)
        away(p); walk(p, 'alma'); time.sleep(0.5); chk('отошёл и подошёл снова — книга открылась опять', p.evaluate(VIS, 'almaBook'))
        away(p); time.sleep(0.5); chk('отошёл — книга закрылась сама', not p.evaluate(VIS, 'almaBook'))

        print('Зал трофеев')
        walk(p, 'trophy'); time.sleep(2.0)
        chk('подошёл к залу — открылся экран трофеев', p.evaluate(VIS, 'almaHall') and p.evaluate("ALMA.cur") == 'hall')
        HALL = """(() => { const bx = document.querySelector('#almaHall .bx').getBoundingClientRect(), t = [...document.querySelectorAll('#almaHall .tr')], m = [...document.querySelectorAll('#almaHall .m')];
          const inb = r => r.left >= bx.left - 1 && r.right <= bx.right + 1 && r.top >= bx.top - 1 && r.bottom <= bx.bottom + 1;
          return { n: t.length, win: t.filter(x => x.dataset.win === '1').map(x => x.dataset.id), dark: t.filter(x => x.querySelector('img.lock')).length, loaded: t.filter(x => x.querySelector('img').naturalWidth > 0).length,
            pos: t.map(x => { const r = x.getBoundingClientRect(); return [Math.round((r.left + r.width / 2 - bx.left) / bx.width * 1000) / 1000, Math.round((r.bottom - bx.top) / bx.height * 1000) / 1000]; }), tin: t.every(x => inb(x.getBoundingClientRect())),
            mn: m.length, mwin: m.filter(x => x.dataset.win === '1').map(x => x.dataset.id), mdark: m.filter(x => x.querySelector('canvas.lock')).length, min: m.every(x => inb(x.getBoundingClientRect())),
            mpic: m.filter(x => { const v = x.querySelector('canvas'), d = v.getContext('2d').getImageData(0, 0, v.width, v.height).data; let n = 0; for (let i = 3; i < d.length; i += 16) if (d[i] > 40) n++; return n > 60; }).length,
            over: (() => { const a = document.querySelector('#almaHall .md').getBoundingClientRect(); return t.some(x => x.getBoundingClientRect().bottom > a.top + 2); })() }; })()"""
        s = p.evaluate(HALL); shot(p, '6_hall')
        chk('десять трофеев на постаментах: победный стоит, девять — тёмные силуэты', s['n'] == 10 and s['win'] == ['b_blackknight'] and s['dark'] == 9 and s['loaded'] == 10 and s['tin'], s)
        chk('трофеи стоят на своих постаментах (два ряда по пять) и не перекрыты полкой медальонов', len(set(y for x, y in s['pos'][:5])) == 1 and len(set(y for x, y in s['pos'][5:])) == 1 and s['pos'][0][1] < s['pos'][5][1] and not s['over'], s['pos'])
        chk('30 медальонов мини-боссов с портретами из их листов: победный светлый, остальные тёмные', s['mn'] == 30 and s['mwin'] == ['mb_arbalest'] and s['mdark'] == 29 and s['mpic'] == 30 and s['min'], s)
        CARD = "(() => { const c = document.querySelector('#almaHall .card'); return { on: getComputedStyle(c).display !== 'none', id: c.dataset.id, t: c.textContent, h: (c.querySelector('h3') || {}).textContent }; })()"
        p.evaluate("document.querySelector('#almaHall .tr[data-id=b_blackknight]')." + PD); time.sleep(0.4); c = p.evaluate(CARD); shot(p, '7_hall_card')
        today = time.strftime('%d.%m.%Y')
        chk('нажатие на трофей — карточка: трофей, босс, когда побеждён, каким героем, за сколько секунд', c['on'] and c['h'] == 'Шлем и щит Бранда' and all(x in c['t'] for x in ('Бранд', today, 'Ganfaul', str(SEC))), c)
        p.evaluate("document.querySelector('#almaHall .tr[data-id=b_voidmage]')." + PD); time.sleep(0.4); c = p.evaluate(CARD)
        chk('непобеждённый босс: «???», без имени трофея и босса', c['on'] and c['h'] == '???' and 'Посох' not in c['t'] and 'Ардан' not in c['t'] and 'после победы' in c['t'], c)
        p.evaluate("document.querySelector('#almaHall .m[data-id=mb_arbalest]')." + PD); time.sleep(0.4); c = p.evaluate(CARD)
        chk('медальон: имя мини-босса, мир, побеждён', c['h'] == 'Королевская арбалетчица' and 'побеждён' in c['t'], c)
        p.evaluate("ALMA.D().rec.wave = 37; ALMA.D().rec.ws = { 2: 431, 1: 505 }; ALMA.D().rec.nd = { 1: 1 }; document.querySelector('#almaHall .rb')." + PD); time.sleep(0.4); c = p.evaluate(CARD); shot(p, '8_hall_records')
        chk('рекорды: лучшая волна, самый быстрый мир, самый сильный крит, миры без смертей', all(x in c['t'] for x in ('Лучшая волна', '37', 'Самый быстрый мир', '7:11', 'Самый сильный крит', 'Миров без смертей', '1 из 10', 'не дают бонусов')), c)
        st1 = p.evaluate("[P.maxHp, P.maxMp]")
        chk('трофеи ничего не дают: здоровье и мана героя те же (сапоги дают только своё)', st1[1] == st0[1], [st0, st1])
        away(p); time.sleep(0.5); chk('отошёл — зал закрылся', not p.evaluate(VIS, 'almaHall'))
        walk(p, 'forge'); time.sleep(0.4); chk('старые места работают: кузница открывается', p.evaluate(VIS, 'forge')); away(p)
        walk(p, 'shop'); time.sleep(0.6); chk('старые места работают: лавка открывается', p.evaluate("SHOP.open")); p.evaluate("SHOP.closeShop()"); away(p)

        print('рекорды в настоящем бою, память после перезапуска')
        p.evaluate("ALMA.D().rec.wave = 0; ALMA.D().rec.ws = {}; ALMA.D().rec.nd = {}; ALMA.save()")
        walk(p, 'portal'); time.sleep(1.5)
        t0 = time.time()
        while time.time() - t0 < 240 and not p.evaluate("!!ALMA.D().rec.ws[1]"):
            s = p.evaluate("({ ph: SHOP.phase, map: PATHMAP.on, win: (() => { const w = document.getElementById('stWin'); return !!w && getComputedStyle(w).display === 'flex'; })(), limbo: LIMBO.on, wave })")
            if s['win']: p.evaluate("(() => { const b = document.querySelector('#stWin .bt'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()")
            elif s['map']: p.evaluate("(() => { const b = document.getElementById('pmGo'); if (b && getComputedStyle(b).display !== 'none') for (const t of ['pointerdown', 'pointerup', 'click']) b.dispatchEvent(new PointerEvent(t, { bubbles: true })); })()")
            elif s['ph'] == 'fight': p.evaluate("P.hp = P.maxHp; for (const e of enemies.slice()) hurtEnemy(e, 1e12)")
            elif s['ph'] == 'rest' and s['wave'] < 10: p.evaluate("SHOP.closeShop && SHOP.open && SHOP.closeShop(); SHOP.startWave()")
            time.sleep(0.35)
        d = p.evaluate("ALMA.D()")
        chk('мир 1 пройден с первой волны без гибели: записаны время мира, «без смертей», лучшая волна', d['rec']['ws'].get('1', 0) > 0 and d['rec']['nd'].get('1') == 1 and d['rec']['wave'] >= 9, d['rec'])
        p.evaluate("ALMA.save()"); p.reload(timeout=120000); p.wait_for_function("typeof ALMA !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(2)
        d2 = p.evaluate("ALMA.D()")
        chk('после перезапуска игры всё на месте (встреченные, трофеи, рекорды)', d2['boss'].get('b_blackknight', {}).get('sec') == SEC and d2['mini'].get('mb_arbalest') == 1 and d2['items'].get('boots') == 1 and d2['rec']['crit'] == d['rec']['crit'] and len(d2['seen']) >= len(d['seen']) - 0, [d2['boss'], d2['rec']])
        p.evaluate("(() => { for (const k of Object.keys(localStorage)) if (/^hw_(run|prog|mapt)_/.test(k) || k === 'hw_cine') localStorage.removeItem(k); })()"); p.reload(timeout=120000); p.wait_for_function("typeof ALMA !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(2)
        chk('«Новая игра» (стирание прогресса) витрину побед не трогает', p.evaluate("ALMA.D().boss.b_blackknight.sec") == SEC)
        chk('ошибок на странице нет', not errs, errs[:3]); cx.close()

        print('английская версия')
        cx = b.new_context(viewport={'width': 1280, 'height': 600}); q = cx.new_page(); q.on('pageerror', lambda e: errs.append(str(e)[:300]))
        start(q, 'allworlds&fakestore=web&lang=en')
        q.evaluate("(() => { const D = ALMA.D(); for (const t of ALMA_TEXTS.bosses) { D.seen[t.id] = 1; D.boss[t.id] = { d: Date.now(), hero: HEROES[t.world % 2 ? 'mage' : 'archer'].name, sec: 60 + t.world, best: 50 + t.world }; } for (const t of ALMA_TEXTS.minibosses) { D.seen[t.id] = 1; D.mini[t.id] = 1; } for (const e of ALMA.list('foe')) D.seen[e.id] = 1; for (const e of ALMA.list('item')) D.items[(e.k === 'f' ? 'f:' : '') + e.id] = 1; D.rec = { wave: 100, crit: 4321, ws: { 3: 295 }, nd: { 1: 1, 2: 1 } }; })()")
        to_limbo(q); walk(q, 'alma'); time.sleep(1.5)
        left = []
        for tb, n in (('Боссы', 10), ('Мини-боссы', 30), ('Враги', None), ('Предметы', None)):
            tab(q, tb); pages = q.evaluate("(t) => Math.ceil(ALMA.list(t).length / 20)", {'Боссы': 'boss', 'Мини-боссы': 'mini', 'Враги': 'foe', 'Предметы': 'item'}[tb])
            for pg in range(pages):
                ids = q.evaluate("[...document.querySelectorAll('#almaBook .grid .c')].map(c => c.dataset.id)")
                for i in ids:
                    cell(q, i) if False else q.evaluate("(id) => document.querySelector('#almaBook .grid .c[data-id=\"' + id + '\"]')." + PD, i)
                    t = q.evaluate("document.querySelector('#almaBook .bx').innerText")
                    if CYR.search(t): left.append((tb, i, [x for x in re.split(r'[\n]', t) if CYR.search(x)][:2]))
                if tb == 'Боссы' and pg == 0: time.sleep(1.0); shot(q, '9_book_en')
                if pg < pages - 1: q.evaluate("document.querySelector('#almaBook .pager .ar.n')." + PD); time.sleep(0.2)
        chk('книга на английском: во всех записях всех вкладок русского текста не осталось', not left, left[:6])
        s = q.evaluate("(() => { const R = document.querySelector('#almaBook .pg.r'); return { scroll: R.scrollHeight - R.clientHeight }; })()")
        away(q); walk(q, 'trophy'); time.sleep(2.0); shot(q, '10_hall_en'); left = []
        for sel in ['#almaHall .tr[data-id=%s]' % t for t in q.evaluate("ALMA_TEXTS.bosses.map(t => t.id)")] + ['#almaHall .m[data-id=%s]' % t for t in q.evaluate("ALMA_TEXTS.minibosses.map(t => t.id)")] + ['#almaHall .rb']:
            q.evaluate("(s) => document.querySelector(s)." + PD, sel); t = q.evaluate("document.querySelector('#almaHall .bx').innerText")
            if CYR.search(t): left.append((sel, [x for x in t.split('\n') if CYR.search(x)][:2]))
        shot(q, '11_hall_records_en')
        chk('зал трофеев на английском: карточки всех трофеев и медальонов, рекорды — без русского текста', not left, left[:6])
        chk('все десять трофеев и тридцать медальонов светлые, когда все побеждены', q.evaluate("document.querySelectorAll('#almaHall .lock').length") == 0)
        chk('ошибок на странице нет (англ.)', not errs, errs[:3]); cx.close(); b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad)); sys.exit(1 if bad else 0)
