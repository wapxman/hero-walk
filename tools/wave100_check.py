"""Волна 100 (финальный босс главы 10) стартует — как у настоящего игрока, с окнами и рекламой (v115).
Баг 23.11: на телефоне реклама перед волной 100 не открылась и не ответила, игра ждала её 5 минут, а «Начать волну» открывала карту.
Сценарии: сайт; приложение (реклама отвечает); приложение (реклама молчит); вход из меню через «Продолжить» с сохранением на волне 99.
Сервер страниц поднимает сам (порт 8772) и сам же останавливает (только свой процесс). Код выхода 1 — если что-то не прошло.
Запуск: python tools/wave100_check.py"""
import sys, os, time, json, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8772; BASE = 'http://127.0.0.1:%d/index.html' % PORT
ST = """({ wave, ph: SHOP.phase, map: PATHMAP.on, limbo: LIMBO.on, busy: STORE.busy, dead: P.dead > 0, boss: enemies.filter(e => e.boss).map(e => e.type).join(), ads: (window.FAKE_ADS || []).join(),
  win: (() => { const w = document.getElementById('stWin'); return w && getComputedStyle(w).display === 'flex' ? w.querySelector('h2').textContent : '' })() })"""
bad = []
def chk(name, ok, extra=''):
    print(('  ок   ' if ok else '  НЕТ  ') + name + ((' — ' + str(extra)) if extra and not ok else ''))
    if not ok: bad.append(name)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        def page(q, save=None):
            p = b.new_page(viewport={'width': 915, 'height': 412}); p.errs = []
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            p.goto(BASE + '?' + q, timeout=120000); time.sleep(1)
            p.evaluate("(s) => { localStorage.clear(); if (s) localStorage.setItem('hw_run_mage', JSON.stringify(s)); }", save)
            p.reload(timeout=120000); p.wait_for_function("document.getElementById('mMain') !== null", timeout=120000); time.sleep(6)
            p.mouse.click(400, 200); time.sleep(3.5); p.mouse.click(400, 200); time.sleep(3)      # лого игры, лого студии
            p.evaluate("[...document.querySelectorAll('#mMain .b')][0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(2)   # «Новая игра» или «Продолжить»
            return p
        st = lambda p: p.evaluate(ST)
        def wait(p, cond, sec):
            t0 = time.time()
            while time.time() - t0 < sec:
                s = st(p)
                if cond(s): return s
                time.sleep(0.4)
            return st(p)
        go = lambda p: p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        btn = lambda p, t: p.evaluate("(t) => { const b = [...document.querySelectorAll('#stWin .bt')].find(b => b.textContent.indexOf(t) === 0); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", t)
        def new_game_to_map(p):
            p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); time.sleep(2)
            for i in range(3): p.evaluate("CINE.skip && CINE.skip()"); time.sleep(1.2)
            return wait(p, lambda s: s['map'], 15)
        fight100 = lambda s: s['wave'] == 100 and s['ph'] == 'fight' and s['boss'] == 'b_voidmage'
        def pick_boss10(p, name, button, sec=12):
            chk(name + ': точка «волна 10» главы 10 выбирается на карте', p.evaluate("PATHMAP.pickAt(10, 2)"))
            time.sleep(0.8); go(p); time.sleep(2.5)
            s = st(p)
            if s['win']: btn(p, button); time.sleep(0.5)
            s = wait(p, fight100, sec); chk(name + ': волна 100 началась, Архимаг Бездны на арене', fight100(s), s)
            return s
        # 1. сайт: новая игра, все миры открыты
        print('сайт'); p = page('allworlds&fakestore=web'); s = new_game_to_map(p); chk('сайт: карта открылась', s['map'], s)
        pick_boss10(p, 'сайт', 'Играть'); chk('сайт: без ошибок', not p.errs, p.errs); p.close()
        # 2 и 3. приложение: реклама отвечает / молчит. Первый вход — окно «Дальше — с рекламой»; гибель, Междумирье, второй вход — уже с рекламой
        for q, name in (('allworlds&fakestore', 'приложение, реклама отвечает'), ('allworlds&fakestore=silent', 'приложение, реклама молчит')):
            print(name); p = page(q); s = new_game_to_map(p); chk(name + ': карта открылась', s['map'], s)
            pick_boss10(p, name, 'Играть с рекламой')
            p.evaluate("hurtPlayer(1e9)"); s = wait(p, lambda s: s['win'] or s['limbo'], 12)
            if s['win']: btn(p, 'В Междумирье')
            s = wait(p, lambda s: s['limbo'], 12); chk(name + ': после гибели — Междумирье', s['limbo'], s)
            p.evaluate("LIMBO.leave()"); s = wait(p, lambda s: s['map'], 10); chk(name + ': из Междумирья — карта', s['map'], s)
            go(p); time.sleep(1.5); s = st(p)
            if 'silent' in q:
                chk(name + ': игра ждёт рекламу', s['busy'] and 'inter' in s['ads'], s)
                p.evaluate("SHOP.startWave()"); time.sleep(0.5); s = st(p); chk(name + ': «Начать волну» во время ожидания не открывает карту', not s['map'], s)
            s = wait(p, fight100, 12); chk(name + ': «Продолжить» с карты — волна 100 началась', fight100(s) and 'inter' in s['ads'], s)
            chk(name + ': без ошибок', not p.errs, p.errs); p.close()
        # 4. сохранение на волне 99: главное меню → «Продолжить» → карта → «Продолжить»
        print('сохранение'); p = page('fakestore=web', {'v': 1, 'wave': 99, 'best': 99, 'hp': 500, 'mp': 100, 'gold': 0, 'bag': [], 'flasks': {}, 't': int(time.time() * 1000)})
        s = wait(p, lambda s: s['map'], 15); chk('сохранение: «Продолжить» в меню открывает карту', s['map'], s)
        go(p); time.sleep(2.5); s = st(p)
        if s['win']: btn(p, 'Играть'); time.sleep(0.5)
        s = wait(p, fight100, 12); chk('сохранение: волна 100 началась, Архимаг Бездны на арене', fight100(s), s)
        chk('сохранение: без ошибок', not p.errs, p.errs); p.close()
        b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
