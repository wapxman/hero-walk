# -*- coding: utf-8 -*-
"""Проверка рекламы и PRO в настоящей странице с поддельным мостом (?fakestore): python tools/store_check.py [адрес]
Правила с v125: наград за рекламу нет; реклама — всем без PRO после первой арены новой игры; на сайте ни рекламы, ни окон.
То же самое (и остальные правки v125) проверяет tools/v125_check.py — он входит в сборку и сервер поднимает сам. Снимки — tests/store/."""
import sys, time, os
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8765/index.html'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'store'); os.makedirs(OUT, exist_ok=True)
ok = True
def chk(name, cond, extra=''):
    global ok; ok = ok and bool(cond); print(('  да ' if cond else 'НЕТ  ') + name, extra)
REST = "(w) => { enemies.length = 0; shots.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = w; if (WORLD !== BAL.at(w + 1).M) applyWorld(BAL.at(w + 1).M); SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.transit = false; SHOP.mapShown = true; P.dead = 0; P.hp = P.maxHp; }"
WIN = "() => { const w = document.getElementById('stWin'); return w && w.style.display === 'flex' ? (w.querySelector('h2').dataset.ru || w.querySelector('h2').textContent) : ''; }"
def boot(br, q):
    cx = br.new_context(viewport={'width': 960, 'height': 540}); p = cx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    p.goto(URL + '?v=%d&mode=play&allworlds&%s' % (int(time.time()), q), timeout=120000); p.wait_for_function('window.COMBAT_READY === true', timeout=120000)
    p.mouse.click(480, 270); p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); time.sleep(1.5)
    return p, errs
def press(p, text): p.evaluate("(t) => [...document.querySelectorAll('#stWin .bt')].find(b => (b.dataset.ru || b.textContent).startsWith(t)).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))", text)
def boss(p):
    p.evaluate(REST, 29); p.evaluate('SHOP.startWave()'); time.sleep(0.3)
    p.wait_for_function('enemies.some(e => e.boss && e.hp > 0)', timeout=40000)
def die(p):
    p.evaluate('P.dashI = 0; hurtPlayer(1e9); if (P.dead <= 0) { P.hp = 0; P.dead = P.deadMax = 2.2; }'); p.wait_for_function('P.dead === 0', timeout=30000); time.sleep(0.4)
with sync_playwright() as pw:
    br = pw.chromium.launch()
    print('--- приложение без PRO')
    p, errs = boot(br, 'fakestore')
    chk('кнопка PRO в главном меню', p.evaluate("(() => { const b = document.querySelector('#mMain .b.pro'); return b && (b.dataset.ru || b.textContent); })()") == 'PRO — без рекламы')
    p.evaluate(REST, 0); p.evaluate('SHOP.startWave()'); time.sleep(0.3)
    chk('новая игра, первая арена: бой начался сразу, рекламы и окон нет', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate(WIN) and p.evaluate('FAKE_ADS.length') == 0)
    p.evaluate(REST, 3); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
    chk('вторая арена мира 1: один раз экран «Дальше — с рекламой»', p.evaluate(WIN) == 'Дальше — с рекламой' and p.evaluate('SHOP.paused') and p.evaluate("SHOP.phase") == 'rest')
    p.screenshot(path=os.path.join(OUT, 'gate.png'))
    press(p, 'Играть с рекламой'); time.sleep(0.5)
    chk('после экрана бой начался', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate(WIN))
    p.evaluate(REST, 6); p.evaluate('STORE._reset(); SHOP.startWave()'); time.sleep(0.4)
    chk('следующая арена: реклама перед раундом, экран второй раз не показан', p.evaluate('FAKE_ADS.join()') == 'inter' and p.evaluate("SHOP.phase") == 'rest' and not p.evaluate(WIN))
    p.wait_for_function("SHOP.phase === 'fight'", timeout=20000); p.wait_for_function('!SHOP.paused', timeout=15000)
    chk('реклама закрылась — бой начался, пауза снята', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate('SHOP.paused'))
    p.evaluate(REST, 9); p.evaluate('SHOP.startWave()'); time.sleep(0.3)
    chk('следующий раунд раньше 2 минут: без рекламы', p.evaluate("SHOP.phase") == 'fight' and p.evaluate('FAKE_ADS.length') == 1 and not p.evaluate(WIN))
    boss(p); die(p)
    chk('смерть на боссе: окна «Воскреснуть за рекламу» нет — сразу Междумирье', p.evaluate('LIMBO.on') and not p.evaluate(WIN) and 'reward' not in p.evaluate('FAKE_ADS.join()'))
    n = p.evaluate('FAKE_ADS.length'); p.evaluate('STORE._reset(); LIMBO.leave()'); time.sleep(0.5)
    chk('возвращение из Междумирья: реклама', p.evaluate('FAKE_ADS.length') == n + 1 and p.evaluate('FAKE_ADS[FAKE_ADS.length - 1]') == 'inter', p.evaluate('FAKE_ADS.join()'))
    time.sleep(3)
    p.evaluate(REST, 30)
    g0 = p.evaluate("(() => { SHOP.onKill({ boss: 1, x: P.x + 5000, y: P.y, k: {}, type: 'x' }); const g = SHOP.gold; window.__done = 0; PATHMAP.show({ mode: 'short', t0: 0, t1: 0, onMid() {}, onDone() { window.__done = 1; } }); return g; })()"); time.sleep(0.6)
    chk('после босса: окна «Удвоить золото» нет, золото не прибавилось', not p.evaluate(WIN) and p.evaluate('SHOP.gold') == g0)
    chk('ошибок нет', not errs, errs[:3]); p.context.close()

    print('--- приложение с PRO')
    p, errs = boot(br, 'fakestore=pro')
    chk('в меню «PRO куплен»', p.evaluate("(() => { const b = document.querySelector('#mMain .b.pro'); return b.dataset.ru || b.textContent; })()") == 'PRO куплен')
    p.evaluate(REST, 20); p.evaluate('STORE._reset(); SHOP.startWave()'); time.sleep(0.4)
    chk('с PRO: ни экрана, ни рекламы', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate(WIN) and p.evaluate('FAKE_ADS.length') == 0)
    boss(p); die(p)
    chk('с PRO смерть на боссе — тоже сразу Междумирье', p.evaluate('LIMBO.on') and not p.evaluate(WIN))
    chk('ошибок нет', not errs, errs[:3]); p.context.close()

    print('--- покупка PRO с экрана')
    p, errs = boot(br, 'fakestore')
    p.evaluate(REST, 3); p.evaluate('SHOP.startWave()'); time.sleep(0.4); press(p, 'Купить PRO'); time.sleep(1.0)
    chk('купил PRO на экране: бой без рекламы, в меню «PRO куплен»', p.evaluate('STORE.pro') and p.evaluate("SHOP.phase") == 'fight' and p.evaluate('FAKE_ADS.length') == 0 and p.evaluate("(() => { const b = document.querySelector('#mMain .b.pro'); return b.dataset.ru || b.textContent; })()") == 'PRO куплен')
    chk('ошибок нет', not errs, errs[:3]); p.context.close()

    print('--- сайт (моста нет)')
    p, errs = boot(br, 'fakestore=web')
    p.evaluate(REST, 20); p.evaluate('SHOP.startWave()'); time.sleep(0.4)
    chk('на сайте: ни окна, ни рекламы, бой идёт', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate(WIN))
    boss(p); die(p)
    chk('на сайте смерть на боссе — сразу Междумирье', p.evaluate('LIMBO.on') and not p.evaluate(WIN))
    chk('ошибок нет', not errs, errs[:3]); p.context.close()
    br.close()
print('ИТОГ:', 'всё в порядке' if ok else 'ЕСТЬ ОШИБКИ'); sys.exit(0 if ok else 1)
