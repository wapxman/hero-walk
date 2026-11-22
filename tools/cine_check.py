# -*- coding: utf-8 -*-
"""Проверка заставок в настоящей странице (нужен обычный Chrome — в нём есть H.264): python tools/cine_check.py [адрес]
Снимки — tests/cine/."""
import sys, time, os
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8770/index.html'   # сервер: python tools/serve.py
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'cine'); os.makedirs(OUT, exist_ok=True)
ok = True
def chk(name, cond, extra=''):
    global ok; ok = ok and bool(cond); print(('  да ' if cond else 'НЕТ  ') + name, extra)
ST = """() => { const c = document.getElementById('cine'), v = c && c.querySelector('video'), on = !!c && c.style.display === 'block';
  return { on, video: on && v ? v.src.split('/').pop().split('?')[0] : '', t: on && v ? v.currentTime : 0, err: on && v && v.error ? v.error.code : 0, slides: on ? c.querySelectorAll('.sl').length : 0,
    shown: on ? [...c.querySelectorAll('.sl')].findIndex(s => s.classList.contains('on')) + 1 : 0, sub: on && c.querySelector('.sub') ? c.querySelector('.sub').textContent : '',
    menu: document.getElementById('mMain') ? getComputedStyle(document.getElementById('mMain')).display : 'none', paused: typeof SHOP !== 'undefined' && SHOP.paused, cine: typeof CINE !== 'undefined' && CINE.on }; }"""
SKIP = "document.querySelector('#cine .skip').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
def wait(p, cond, sec=30):
    t = time.time()
    while time.time() - t < sec:
        s = p.evaluate(ST)
        if cond(s): return s
        time.sleep(0.25)
    return p.evaluate(ST)
with sync_playwright() as pw:
    br = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    p.goto(URL + '?v=%d&cine=1&allworlds' % int(time.time()), timeout=120000)
    s = wait(p, lambda s: s['video'] == 'logo_paladium.mp4' and s['t'] > 0.5, 60)
    chk('запуск: после лого игры идёт видео студии, меню ещё не видно', s['video'] == 'logo_paladium.mp4' and s['t'] > 0.5 and s['menu'] == 'none', s)
    p.screenshot(path=os.path.join(OUT, '1_paladium.png'))
    INTRO = p.evaluate("CINE.CFG.intro")
    if INTRO:
        s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.5, 20)
        chk('первый запуск: следом вступление', s['video'] == 'intro.mp4' and s['t'] > 0.5, s)
        p.screenshot(path=os.path.join(OUT, '2_intro.png'))
        p.evaluate(SKIP); s = wait(p, lambda s: not s['on'] and s['menu'] == 'block', 10)
        chk('«Пропустить» — главное меню', not s['on'] and s['menu'] == 'block' and not s['cine'], s)
    else:
        seen = []; t = time.time()
        while time.time() - t < 20:
            s = p.evaluate(ST); seen.append(s['video'])
            if not s['on'] and s['menu'] == 'block': break
            time.sleep(0.2)
        chk('вступление выключено: после лого студии сразу меню, intro.mp4 не играл', not s['on'] and s['menu'] == 'block' and 'intro.mp4' not in seen and time.time() - t < 12, [s, round(time.time() - t, 1)])
    chk('в меню кнопка «PRO», «История» — ' + ('есть' if INTRO else 'убрана'), p.evaluate("!!document.querySelector('#mMain .b.story') === %s && !!document.querySelector('#mMain .b.pro')" % ('true' if INTRO else 'false')))
    time.sleep(0.8); p.screenshot(path=os.path.join(OUT, '3_menu.png'))
    p.mouse.click(640, 700); time.sleep(1.0)
    chk('музыка меню — m7', p.evaluate("typeof mus !== 'undefined' && !!mus.el && /m7\\.mp3/.test(mus.el.src)"), p.evaluate("typeof mus !== 'undefined' && mus.el ? mus.el.src : 'нет'"))
    if INTRO:
        p.evaluate("document.querySelector('#mMain .b.story').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
        s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.3, 15)
        chk('«История» в меню — вступление ещё раз', s['video'] == 'intro.mp4' and s['t'] > 0.3, s)
        p.evaluate(SKIP); s = wait(p, lambda s: not s['on'], 15)
        chk('«Пропустить» — снова меню', not s['on'] and s['menu'] == 'block', s)
    else:
        p.evaluate("CINE.intro()"); time.sleep(0.5)
        chk('вызов вступления напрямую тоже ничего не показывает', not p.evaluate(ST)['on'])
    # в игру: первый бой мира 1 — рассказ
    p.evaluate("(() => { const m = [...document.querySelectorAll('#mMain .b')].find(b => /Играть|Продолжить|Новая/.test(b.textContent)); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()"); time.sleep(0.8)
    p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); time.sleep(1.5)
    p.wait_for_function("document.getElementById('pmGo') && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=20000); time.sleep(0.5)
    p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))"); time.sleep(0.5)
    s = wait(p, lambda s: s['slides'] == 2 and s['shown'] == 1 and s['sub'], 10)
    chk('первый бой мира 1: рассказ — 2 картинки, субтитры, игра стоит', s['slides'] == 2 and s['shown'] == 1 and 'Первые врата' in s['sub'] and s['paused'] and p.evaluate("SHOP.phase") == 'rest', s)
    time.sleep(2.5); p.screenshot(path=os.path.join(OUT, '4_world1.png'))
    chk('музыка притушена под рассказ', p.evaluate("mus.v != null && mus.v <= MUS_VOL * 0.3"), p.evaluate("[mus.v, MUS_VOL]"))
    time.sleep(1.5); v = p.evaluate("(() => { const a = document.getElementById('cine')._au; return a ? [a.src.split('cine/')[1].split('?')[0], a.paused, +a.currentTime.toFixed(1), +a.duration.toFixed(1)] : null; })()")
    chk('голос мира играет', v and v[0] == 'world_01/vo.mp3' and not v[1] and v[2] > 0.5, v)
    t0 = time.time(); s = wait(p, lambda s: 'В ту ночь' in s['sub'], 16)
    chk('вторая строка (9 с) — и с ней вторая картинка (поле slide)', s['shown'] == 2 and 'В ту ночь' in s['sub'], s)
    p.screenshot(path=os.path.join(OUT, '5_world1_b.png'))
    p.evaluate(SKIP); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)   # пауза ещё держится, пока грузится картинка арены
    chk('«Пропустить» — бой начался, пауза снята', p.evaluate("SHOP.phase") == 'fight' and not p.evaluate('SHOP.paused') and not p.evaluate(ST)['on'], p.evaluate("[SHOP.phase, SHOP.paused]"))
    p.evaluate("enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = 0; SHOP.phase = 'rest'; SHOP.mapShown = true; SHOP.startWave()"); time.sleep(0.6)
    chk('второй раз рассказ мира 1 не показывается', not p.evaluate(ST)['on'] and p.evaluate("SHOP.phase") == 'fight')
    # финал
    p.evaluate("enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = 100; SHOP.phase = 'rest'; window.__m = 0; PATHMAP.show({ mode: 'short', t0: 0, t1: 0, onMid() {}, onDone() { window.__m = 1; } })")
    s = wait(p, lambda s: s['slides'] == 9 and s['sub'], 10)
    chk('после босса мира 10 — финал, 9 кадров', s['slides'] == 9 and s['shown'] == 1 and 'боги' in s['sub'], s)
    s = wait(p, lambda s: 'небо треснуло' in s['sub'], 14)
    chk('финал: вторая строка (8 с) — второй кадр', s['shown'] == 2, s)
    s = wait(p, lambda s: 'Лиору' in s['sub'], 20)
    chk('финал: третья строка (22 с) — третий кадр', s['shown'] == 3, s)
    p.screenshot(path=os.path.join(OUT, '6_finale.png'))
    p.evaluate(SKIP); time.sleep(1.0)
    chk('после финала игра идёт дальше (карта перехода)', not p.evaluate(ST)['on'] and p.evaluate('PATHMAP.on || window.__m === 1'))
    chk('ошибок нет', not errs, errs[:3]); cx.close()

    # второй запуск: вступления уже нет
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page()
    cx.add_init_script("localStorage.setItem('hw_cine', JSON.stringify({ intro2: 1 }))")
    p.goto(URL + '?v=%d&cine=1&allworlds' % int(time.time()), timeout=120000)
    s = wait(p, lambda s: s['video'] == 'logo_paladium.mp4' and s['t'] > 0.3, 60)
    s2 = wait(p, lambda s: not s['on'] and s['menu'] == 'block', 20)
    chk('второй запуск: лого студии → сразу меню, без вступления', s['video'] == 'logo_paladium.mp4' and not s2['on'] and s2['menu'] == 'block', s2)
    cx.close(); br.close()
print('ИТОГ:', 'всё в порядке' if ok else 'ЕСТЬ ОШИБКИ'); sys.exit(0 if ok else 1)
