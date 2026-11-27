# -*- coding: utf-8 -*-
"""Английская версия (v121): проходит игру на английском и показывает всё, что осталось по-русски.
  1) данные: имена врагов и боссов, умения, предметы и их описания, склянки, состояния, миры и арены, реплики боссов — каждая
     строка прогоняется через переводчик (LANG.t), в результате не должно остаться кириллицы;
  2) экраны: главное меню, настройки, «История», выбор героя, карта миров, бой, окно героя, лавка (все вкладки и все товары),
     пауза, Междумирье, окна магазина — на каждом в разметке не должно быть кириллицы; плюс всё, что игра рисовала на холсте;
  3) выбор языка: первый запуск — экран выбора; переключение в настройках туда и обратно; русская версия не изменилась.
Сервер поднимает сам (порт 8784). Снимки — tests/lang/. Код выхода 1 — если что-то осталось непереведённым."""
import sys, os, time, json, subprocess, re
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8784; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'lang'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:700]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
# русский текст, видимый в разметке (только то, что на экране)
DOMRU = """(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (!p || p.closest('script,style')) continue; if (!/[А-Яа-яЁё]/.test(n.nodeValue)) continue;
    let e = p, vis = true; while (e && e !== document.body) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden') { vis = false; break; } e = e.parentElement; }
    if (vis && n.nodeValue.trim() !== 'Русский') out.push(n.nodeValue.trim().slice(0, 80)); }
  return out; })()"""
DATA = """(() => { const S = new Set(), add = v => { if (typeof v === 'string') S.add(v); else if (Array.isArray(v)) v.forEach(add); };
  for (const k in KIND) { add(KIND[k].nm); add(KIND[k].spells); }
  for (const id in ALL) { const it = ALL[id]; add(it.nm); add(it.ds); if (it.st) add(statText(it.st)); try { add(itemText(it)); } catch (e) {} }
  for (const id in RELICS) { add(RELICS[id].nm); add(RELICS[id].ds); add(RELICS[id].boss); }
  for (const f of FLASKS) { add(f.name); add(f.desc); add(FLASK_AUTO[f.id]); }
  for (const t in SK.DEF) for (const s of SK.DEF[t]) { add(s.ph); if (s.ph) add(s.ph + '!'); }
  for (const w of WORLDS) add(w.name);
  for (const h in HEROES) { add(HEROES[h].name); add(HEROES[h].role); add(HEROES[h].skills); }
  for (const s of STATS) { add(s.name); add(s.desc); }
  if (typeof BOSSVO !== 'undefined') for (const b in BOSSVO) { add(BOSSVO[b].l); for (const k in (BOSSVO[b].s || {})) { add(k); add(k + '!'); } }
  try { for (const it of CINE.unlocked()) { add(it.nm); const c = it.nm.indexOf('. '); add(it.nm.slice(0, c)); add(it.nm.slice(c + 2)); } add('не открыт'); add('Открыто: 3 / 12'); } catch (e) {}      // v124: галерея «История»
  for (let m = 1; m <= 10; m++) { add('Мир ' + m + ' пройден!'); add('Волна ' + (m * 10) + ' — БОСС МИРА'); add('Волна ' + (m * 10 - 3) + '  · дальше без передышки'); add('В бой — волна ' + m); add('Мини-босс: ' + (Array.isArray(KIND[ROSTER[m].mini[0]].nm) ? KIND[ROSTER[m].mini[0]].nm[0] : KIND[ROSTER[m].mini[0]].nm)); }
  for (const x of ['Раунд отбит  +96', '+220 маны', 'Уровень 7!  очки прокачки', 'Сундук: Меч ученика', 'Золото +30', 'КРИТ 250', 'Возрождение через 2', 'Собрано: Клинок воина', 'Верный глаз: враг ближе 300 — отойди', 'Таких склянок — не больше 5', 'трещина 2/3', 'время вспять +120', 'Щит 300', 'взрыв щита 120']) add(x);
  const miss = []; for (const s of S) { const r = LANG.t(s); if (/[А-Яа-яЁё]/.test(r)) miss.push(s + '  →  ' + r); }
  return { n: S.size, miss }; })()"""
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); cx = b.new_context(viewport={'width': 1280, 'height': 600}); errs = []
        p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        p.goto(BASE + '?lang=en&allworlds&fakestore=web', timeout=120000); p.wait_for_function("typeof LANG !== 'undefined' && typeof SAVE !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(4)
        print('данные')
        s = p.evaluate(DATA)
        chk('имена, умения, предметы, описания, склянки, состояния, миры, реплики — %d строк, все переводятся' % s['n'], not s['miss'], s['miss'][:25])
        print('экраны')
        def screen(name, shot=None):
            time.sleep(0.5); ru = p.evaluate(DOMRU)
            if shot: p.screenshot(path=os.path.join(OUT, shot + '.png'))
            chk(name + ' — по-русски ничего не осталось', not ru, ru[:12])
        screen('главное меню', '1_menu')
        p.evaluate("[...document.querySelectorAll('#mMain .b')].find(b => (b.dataset.ru || b.textContent) === 'Настройки')." + PD); screen('настройки', '2_settings')
        p.evaluate("[...document.querySelectorAll('#mSet .b')].pop()." + PD); time.sleep(0.3)
        p.evaluate("document.querySelector('#mMain .b.story')." + PD); screen('«История»', '3_story'); p.evaluate("document.querySelector('#cineList .x')." + PD)
        p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Новая игра')." + PD); screen('выбор героя', '4_heroes')
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        p.wait_for_function("PATHMAP.on && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=30000); time.sleep(1.5); screen('карта миров', '5_map')
        p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(2.5); screen('бой', '6_fight')
        p.evaluate("progOpen(true)"); screen('окно героя', '7_hero'); p.evaluate("progOpen(false)")
        p.evaluate("SHOP.togglePause()"); screen('пауза', '8_pause'); p.evaluate("SHOP.togglePause()")
        p.evaluate("enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = wave; SHOP.phase = 'rest'; SHOP.gold = 99999; SHOP.openShop()"); time.sleep(0.6)
        tabs = p.evaluate("document.querySelectorAll('#shTabs div').length"); ru_all = []
        for i in range(tabs):
            p.evaluate("(i) => document.querySelectorAll('#shTabs div')[i]." + PD, i); time.sleep(0.3)
            n = p.evaluate("document.querySelectorAll('#shList .ci').length")
            for j in range(n):
                p.evaluate("(j) => document.querySelectorAll('#shList .ci')[j]." + PD, j); ru_all += p.evaluate(DOMRU)
            if i in (0, 3): p.screenshot(path=os.path.join(OUT, '9_shop_%d.png' % i))
        chk('лавка: все вкладки и все товары (описания, дерево сборки) — по-русски ничего не осталось', not ru_all, sorted(set(ru_all))[:15])
        p.evaluate("SHOP.closeShop(); P.hp = P.maxHp; SHOP.startWave()"); time.sleep(1.5)
        if p.evaluate("PATHMAP.on"): p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        p.wait_for_function("SHOP.phase === 'fight'", timeout=20000); p.evaluate("hurtPlayer(1e12)")
        p.wait_for_function("LIMBO.on || getComputedStyle(document.getElementById('stWin') || document.body).display === 'flex'", timeout=20000); time.sleep(1.5)
        if not p.evaluate("LIMBO.on"): screen('окно магазина после гибели'); p.evaluate("[...document.querySelectorAll('#stWin .bt')].pop()." + PD)
        p.wait_for_function("LIMBO.on", timeout=20000); time.sleep(2.5); screen('Междумирье', '10_limbo')
        # бои разных миров: каждый мир — волна с рядовыми, потом босс; всё, что игра пишет на холсте, собирается в LANG.miss
        p.evaluate("LIMBO.leave()"); time.sleep(1.5)
        for m in (1, 3, 5, 7, 10):
            p.evaluate("(m) => { if (PATHMAP.on) { PATHMAP.pickAt(m); for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true })); } }", m); time.sleep(2.5)
            p.evaluate("(() => { const w = document.getElementById('stWin'); if (w && getComputedStyle(w).display === 'flex') [...w.querySelectorAll('.bt')].pop()." + PD + "; })()"); time.sleep(1.5)
            p.evaluate("(m) => { P.maxHp = 1e9; P.hp = 1e9; window.NO_SOFT = 1; for (const t of [...ROSTER[m].mel, ...ROSTER[m].rng, ...ROSTER[m].elite, ROSTER[m].mini[0], ROSTER[m].boss].slice(0, 14)) { spawnEnemy(t); const e = enemies[enemies.length - 1]; e.x = P.x + 300 + Math.random() * 200; e.y = P.y + Math.random() * 200 - 100; } }", m)
            time.sleep(9)
            if m == 5: p.screenshot(path=os.path.join(OUT, '11_fight_world5.png'))
            p.evaluate("(() => { window.NO_SOFT = 0; for (const e of enemies.slice()) hurtEnemy(e, 1e12); ROUND.queue.length = 0; ROUND.endW = wave; })()"); time.sleep(2.5)
            p.evaluate("(() => { const w = document.getElementById('stWin'); if (w && getComputedStyle(w).display === 'flex') [...w.querySelectorAll('.bt')].pop()." + PD + "; if (SHOP.open) SHOP.closeShop(); if (!PATHMAP.on && SHOP.phase === 'rest') SHOP.startWave(); })()"); time.sleep(2.0)
        miss = p.evaluate("[...LANG.miss]")
        chk('за всё время игры (меню, карта, бои пяти миров с боссами, лавка, Междумирье) непереведённых строк нет', not miss, miss[:30])
        chk('ошибок страницы нет', not errs, errs[:3])
        print('выбор языка')
        q = cx.new_page(); q.goto(BASE + '?fakestore=web', timeout=120000); q.wait_for_function("typeof LANG !== 'undefined' && document.getElementById('mMain') !== null", timeout=120000); time.sleep(4)
        s = q.evaluate("({ cur: LANG.cur, ru: [...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent) })")
        chk('без выбора язык русский, меню по-русски', s['cur'] == 'ru' and 'Новая игра' in s['ru'], s)
        q.evaluate("LANG.set('en')"); time.sleep(0.5); s = q.evaluate("({ cur: LANG.cur, t: [...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent), saved: localStorage.getItem('hw_lang') })")
        chk('переключили на английский — меню сразу по-английски, выбор запомнен', s['cur'] == 'en' and 'New game' in s['t'] and s['saved'] == 'en', s)
        q.evaluate("LANG.set('ru')"); time.sleep(0.5); s = q.evaluate("[...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent)")
        chk('вернули русский — меню снова по-русски', 'Новая игра' in s, s)
        q.close(); b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
