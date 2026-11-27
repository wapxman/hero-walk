# -*- coding: utf-8 -*-
"""v124 (Создатель 28.11): в Альма-матер ни одно имя не вылезает за рамку. Все записи всех вкладок (боссы, мини-боссы, враги,
предметы), на русском и английском, на трёх экранах (компьютер, телефон боком, планшет):
  • подписи под портретами в сетке книги — в своей клетке (по ширине и высоте);
  • заголовок, подзаголовок и строки записи справа — в странице;
  • карточки Зала трофеев (все 10 трофеев и 30 мини-боссов) — строки в карточке.
    python tools/alma_names_check.py          (выход 1, если что-то вылезло)"""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8797
BASE = 'http://127.0.0.1:%d/index.html' % PORT
OPEN_ALL = """() => { const D = ALMA.D();
  for (const t of ['boss', 'mini', 'foe', 'item']) for (const e of ALMA.list(t)) {
    if (e.k === 'i') D.items[e.id] = 1; else if (e.k === 'f') D.items['f:' + e.id] = 1; else D.seen[e.id] = 1;
    if (e.k === 'b') D.boss[e.id] = { d: Date.now(), hero: 'Ганфаул', sec: 3599, best: 1234 };
    if (e.k === 'm') D.mini[e.id] = 1; } }"""
# что вылезло: элементы, чей текст шире/выше своего места или выходит за рамку
OVER = """(sel) => { const out = [];
  const box = (e, c) => { const a = e.getBoundingClientRect(), b = c.getBoundingClientRect(); return a.left < b.left - 1 || a.right > b.right + 1; };
  for (const [q, up] of sel) for (const e of document.querySelectorAll(q)) {
    if (!e.offsetParent) continue;
    const c = e.closest(up), txt = (e.innerText || '').replace(/\\s+/g, ' ').trim();
    if (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1 || (c && box(e, c))) out.push(txt + ' [' + q + ' ' + e.scrollWidth + '/' + e.clientWidth + ' ' + e.scrollHeight + '/' + e.clientHeight + ']');
  } return out; }"""
GRID = [['#almaBook .c .nm', '.c']]
ENTRY = [['#almaBook .r h3', '.pg'], ['#almaBook .r .sub', '.pg'], ['#almaBook .r .ln', '.pg'], ['#almaBook .r .rc span', '.pg']]
CARD = [['#almaHall .card h3', '.card'], ['#almaHall .card .ln', '.card'], ['#almaHall .card .ln b', '.card']]
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
bad = []; n = 0
try:
    time.sleep(1)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        for lang in ('ru', 'en'):
            for vw, vh in ((1280, 600), (800, 360), (1024, 768)):
                p = b.new_page(viewport={'width': vw, 'height': vh})
                p.goto(BASE + '?lang=' + lang + '&skipintro=1', timeout=120000)
                p.wait_for_function("typeof ALMA !== 'undefined' && document.getElementById('mMain') !== null && ALMA.list('boss').length > 0", timeout=120000)
                p.evaluate(OPEN_ALL); p.evaluate("ALMA.openBook()"); time.sleep(0.6)
                tag = '%s %dx%d' % (lang, vw, vh)
                for t in ('boss', 'mini', 'foe', 'item'):
                    L = p.evaluate("(t) => ALMA.list(t).map(e => e.id)", t)
                    pages = (len(L) + 19) // 20
                    for pg in range(pages):
                        p.evaluate("([t, pg]) => { ALMA.ui.tab = t; ALMA.ui.page = pg; ALMA.ui.sel = null; ALMA.openBook(); }", [t, pg]); time.sleep(0.35)
                        for x in p.evaluate(OVER, GRID): bad.append('%s сетка %s: %s' % (tag, t, x))
                        ids = p.evaluate("[...document.querySelectorAll('#almaBook .grid .c')].map(c => c.dataset.id)")
                        for i in ids:
                            p.evaluate("(id) => document.querySelector('#almaBook .grid .c[data-id=\"' + id + '\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))", i); time.sleep(0.12)
                            n += 1
                            for x in p.evaluate(OVER, GRID + ENTRY): bad.append('%s запись %s/%s: %s' % (tag, t, i, x))
                p.evaluate("ALMA.openHall()"); time.sleep(0.6)
                for q in ('#almaHall .tr', '#almaHall .md .m'):
                    k = p.evaluate("(q) => document.querySelectorAll(q).length", q)
                    for j in range(k):
                        p.evaluate("([q, j]) => document.querySelectorAll(q)[j].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))", [q, j]); time.sleep(0.15)
                        n += 1
                        for x in p.evaluate(OVER, CARD): bad.append('%s зал %s#%d: %s' % (tag, q, j, x))
                p.evaluate("document.querySelector('#almaHall .rb').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(0.2)
                for x in p.evaluate(OVER, CARD): bad.append('%s зал рекорды: %s' % (tag, x))
                p.screenshot(path=os.path.join(os.environ.get('TEMP', ROOT), 'alma_names_%s_%d.png' % (lang, vw)))
                p.close()
        b.close()
finally:
    srv.terminate()
bad = list(dict.fromkeys(bad))
print('проверено записей и карточек:', n)
for x in bad[:80]: print('  ВЫЛЕЗЛО', x)
print('ИТОГ:', 'ЗЕЛЁНЫЙ — ни одно имя не вылезает' if not bad else 'КРАСНЫЙ — вылезло %d' % len(bad))
sys.exit(1 if bad else 0)
