# -*- coding: utf-8 -*-
"""Проверка заставок и порядка экранов (v113, v116 — ролики книги) в настоящей странице (нужен обычный Chrome — в нём есть H.264):
python tools/cine_check.py [адрес]      без адреса сервер страниц поднимает сам (порт 8773) и сам останавливает;  снимки — tests/cine/.
v116: вступление, ролики всех 10 миров и финал — идут, со звуком, пропускаются касанием, после ролика мир стартует. Код выхода 1 — если что-то не прошло."""
import sys, time, os, subprocess
sys.stdout.reconfigure(encoding='utf-8')
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); SRV = None
if len(sys.argv) > 1: URL = sys.argv[1]
else:
    SRV = subprocess.Popen([sys.executable, '-m', 'http.server', '8773', '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1.5)
    URL = 'http://127.0.0.1:8773/index.html'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'cine'); os.makedirs(OUT, exist_ok=True)
ok = True
def chk(name, cond, extra=''):
    global ok; ok = ok and bool(cond); print(('  да ' if cond else 'НЕТ  ') + name, str(extra)[:230])
ST = """() => { const c = document.getElementById('cine'), v = c && c.querySelector('video'), on = !!c && c.style.display === 'block';
  const disp = id => document.getElementById(id) ? getComputedStyle(document.getElementById(id)).display : 'none';
  return { on, video: on && v ? v.src.split('/').pop().split('?')[0] : '', t: on && v ? v.currentTime : 0, vis: on && v ? +getComputedStyle(v).opacity : 0, slides: on ? c.querySelectorAll('.sl').length : 0,
    shown: on ? [...c.querySelectorAll('.sl')].findIndex(s => s.classList.contains('on')) + 1 : 0, sub: on && c.querySelector('.sub') ? c.querySelector('.sub').textContent : '',
    menu: disp('mMain'), sel: disp('hSel'), splash: !!document.getElementById('mSplash'), map: typeof PATHMAP !== 'undefined' && PATHMAP.on, phase: typeof SHOP !== 'undefined' ? SHOP.phase : '', wave: typeof wave !== 'undefined' ? wave : -1,
    paused: typeof SHOP !== 'undefined' && SHOP.paused, cine: typeof CINE !== 'undefined' && CINE.on, btns: [...document.querySelectorAll('#mMain .btns .b')].map(b => b.textContent + (b.classList.contains('hl') ? '*' : '')) }; }"""
# звук ролика: не выключен, громкость есть, звуковая дорожка действительно раскодируется
SND = "(() => { const v = document.querySelector('#cine video'); return v ? { muted: v.muted, vol: v.volume, bytes: v.webkitAudioDecodedByteCount || 0, paused: v.paused, t: +v.currentTime.toFixed(1), dur: +v.duration.toFixed(1), w: v.videoWidth } : null; })()"
snd_ok = lambda a: bool(a) and not a['muted'] and a['vol'] > 0.9 and a['bytes'] > 1000 and not a['paused'] and a['w'] >= 1280
def tap(p): time.sleep(0.9); p.mouse.click(500, 420)      # пропуск касанием в любом месте экрана (не по надписи «Пропустить»)
WIN = "(() => { const w = document.getElementById('stWin'); return !!w && getComputedStyle(w).display === 'flex'; })()"
def win_btn(p, t): p.evaluate("(t) => { const b = [...document.querySelectorAll('#stWin .bt')].find(b => b.textContent.indexOf(t) === 0); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", t)
def wait(p, cond, sec=30):
    t = time.time()
    while time.time() - t < sec:
        try:
            s = p.evaluate(ST)
            if cond(s): return s
        except Exception: pass          # страница перезагружается
        time.sleep(0.2)
    return p.evaluate(ST)
def btn(p, text): p.evaluate("(t) => { const m = [...document.querySelectorAll('#mMain .btns .b, #mMain .b.story')].find(b => b.textContent === t); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", text)
def go(p): p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
def map_go(p):
    p.wait_for_function("document.getElementById('pmGo') && getComputedStyle(document.getElementById('pmGo')).display !== 'none'", timeout=20000); time.sleep(0.5)
    p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
# с первого мгновения: что видел игрок (раз в кадр) — ни одного видео с кнопками или без пустого постера, и ни одного видео, показанного до первого кадра
WATCH = """() => { window.__w = { bad: [], vids: 0, early: 0 }; const tick = () => {
    for (const v of document.querySelectorAll('video')) { __w.vids++; if (v.controls || !/^data:image/.test(v.poster || '')) __w.bad.push('controls/poster');
      if (+getComputedStyle(v).opacity > 0.01 && !(v.currentTime > 0)) __w.early++; }
    requestAnimationFrame(tick); }; tick(); }"""
with sync_playwright() as pw:
    br = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    cx.add_init_script("addEventListener('DOMContentLoaded', " + WATCH + ")")
    U = URL + '?cine=1'
    print('--- первый запуск')
    p.goto(U, timeout=120000)
    s = wait(p, lambda s: s['video'] == 'logo_paladium.mp4' and s['t'] > 0.5, 60)
    chk('после лого игры идёт лого студии, меню ещё не видно', s['video'] == 'logo_paladium.mp4' and s['t'] > 0.5 and s['menu'] == 'none', s)
    p.screenshot(path=os.path.join(OUT, '1_palladium.png'))
    t = time.time(); seen = []
    while time.time() - t < 20:
        s = p.evaluate(ST); seen.append(s['video'])
        if not s['on'] and s['menu'] == 'block': break
        time.sleep(0.2)
    chk('после лого студии сразу главное меню, вступление при запуске не идёт', not s['on'] and s['menu'] == 'block' and 'intro.mp4' not in seen, s)
    w = p.evaluate('__w')
    chk('видео: без кнопок, с пустым постером, до первого кадра не показывалось', w['vids'] > 0 and not w['bad'] and w['early'] == 0, w)
    chk('без сохранения: первая кнопка — «Новая игра», подсвечена; «Продолжить» нет', s['btns'][0] == 'Новая игра*' and not any('Продолжить' in b for b in s['btns']) and len([b for b in s['btns'] if 'Новая' in b]) == 1, s['btns'])
    chk('в меню есть «История» и «PRO»', p.evaluate("!!document.querySelector('#mMain .b.story') && !!document.querySelector('#mMain .b.pro')"))
    time.sleep(0.8); p.screenshot(path=os.path.join(OUT, '2_menu_new.png'))
    p.mouse.click(640, 700); time.sleep(1.0)
    chk('музыка меню — m7', p.evaluate("typeof mus !== 'undefined' && !!mus.el && /m7\\.mp3/.test(mus.el.src)"))
    btn(p, 'История'); s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.3 and s['vis'] > 0.9, 15)
    chk('«История» — вступление', s['video'] == 'intro.mp4' and s['t'] > 0.3, s)
    time.sleep(1.5); a = p.evaluate(SND); chk('вступление: новый ролик (книга), звук идёт', snd_ok(a) and a['dur'] > 100, a)
    tap(p); s = wait(p, lambda s: not s['on'], 15)
    chk('касание — ролик пропущен, снова меню', not s['on'] and s['menu'] == 'block', s)

    print('--- новая игра (сохранения нет)')
    btn(p, 'Новая игра'); time.sleep(0.6); s = p.evaluate(ST)
    chk('«Новая игра» без сохранения: сразу выбор героя, без вопроса', s['sel'] == 'flex' and s['menu'] == 'none' and not p.evaluate("!!document.getElementById('mNew')"), s)
    go(p); s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.3, 15)
    chk('«В бой» — вступление (карты миров и меню нет)', s['video'] == 'intro.mp4' and s['t'] > 0.3 and not s['map'] and s['menu'] == 'none' and s['sel'] == 'none', s)
    p.screenshot(path=os.path.join(OUT, '3_intro.png'))
    tap(p); t = time.time(); gap = 0
    while time.time() - t < 10:            # между вступлением и роликом мира экран заставки не снимается (арена не мелькает)
        s = p.evaluate(ST)
        if not s['on']: gap += 1
        if s['video'] == 'world_01.mp4': break
        time.sleep(0.05)
    s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.5 and s['vis'] > 0.9, 15)
    chk('касание — сразу ролик мира 1, игра стоит, слайдов нет', s['video'] == 'world_01.mp4' and s['t'] > 0.5 and s['slides'] == 0 and s['paused'] and s['phase'] == 'rest' and not s['map'] and gap == 0, [s, gap])
    time.sleep(2.5); p.screenshot(path=os.path.join(OUT, '4_world1.png'))
    a = p.evaluate(SND); chk('ролик мира 1: звук идёт', snd_ok(a), a)
    chk('музыка игры под ролик выключена', p.evaluate("mus.v != null && mus.v <= MUS_VOL * 0.05"), p.evaluate("[mus.v, MUS_VOL]"))
    tap(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    s = p.evaluate(ST)
    chk('касание — ролик пропущен, бой мира 1 идёт, пауза снята', s['phase'] == 'fight' and not s['paused'] and not s['on'], s)
    chk('сохранение появилось', p.evaluate("!!SAVE.read()"))

    print('--- пауза → «В главное меню» → «Продолжить»')
    w0 = p.evaluate("SHOP.roundFrom")
    p.evaluate("(() => { const b = [...document.querySelectorAll('.mb')].find(b => b.textContent === 'В главное меню'); b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()")
    time.sleep(1.0); s = wait(p, lambda s: s['menu'] == 'block' and not s['splash'], 30); w = p.evaluate('__w')
    chk('«В главное меню»: меню без лого и видео', s['menu'] == 'block' and not s['on'] and w['vids'] == 0, [s, w])
    chk('есть сохранение: «Продолжить» первая и подсвечена, за ней «Новая игра»', s['btns'][:2] == ['Продолжить*', 'Новая игра'], s['btns'])
    p.screenshot(path=os.path.join(OUT, '5_menu_continue.png'))
    btn(p, 'Продолжить'); s = wait(p, lambda s: s['map'], 10)
    chk('«Продолжить»: карта миров, без лого, вступления и выбора героя', s['map'] and not s['on'] and s['sel'] == 'none' and s['menu'] == 'none', s)
    map_go(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    chk('с карты — тот же раунд, ролик мира 1 второй раз не идёт', p.evaluate("SHOP.roundFrom") == w0 and not p.evaluate(ST)['on'], [w0, p.evaluate("SHOP.roundFrom")])

    print('--- повторный запуск игры')
    p.goto(U, timeout=120000)
    s = wait(p, lambda s: s['video'] == 'logo_paladium.mp4' and s['t'] > 0.3, 60)
    chk('новый запуск: снова лого студии', s['video'] == 'logo_paladium.mp4', s)
    p.mouse.click(640, 360); s = wait(p, lambda s: not s['on'] and s['menu'] == 'block', 6)
    chk('лого студии пропускается касанием — меню с «Продолжить»', not s['on'] and s['menu'] == 'block' and s['btns'][0] == 'Продолжить*', s)

    print('--- новая игра поверх сохранения')
    btn(p, 'Новая игра'); time.sleep(0.5)
    q = p.evaluate("(() => { const m = document.getElementById('mNew'); return [getComputedStyle(m).display, m.textContent]; })()")
    chk('«Новая игра» при сохранении: вопрос «Начать заново? Прогресс будет потерян»', q[0] == 'flex' and 'Начать заново? Прогресс будет потерян' in q[1], q)
    p.screenshot(path=os.path.join(OUT, '6_confirm.png'))
    p.evaluate("document.querySelector('#mNew [data-n]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"); time.sleep(0.3)
    chk('«Отмена» — меню, сохранение цело', p.evaluate(ST)['menu'] == 'block' and p.evaluate("!!SAVE.anySave()"))
    btn(p, 'Новая игра'); time.sleep(0.4)
    p.evaluate("document.querySelector('#mNew [data-y]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
    time.sleep(1.0); s = wait(p, lambda s: s['sel'] == 'flex' and not s['splash'], 30); w = p.evaluate('__w')
    chk('«Начать заново»: сразу выбор героя — без лого, без меню; прогресс стёрт', s['sel'] == 'flex' and s['menu'] == 'none' and not s['on'] and not p.evaluate("SAVE.anySave()"), [s, w])
    go(p); s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.3, 15)
    chk('«В бой» — вступление', s['video'] == 'intro.mp4' and s['t'] > 0.3, s)
    p.keyboard.press('Escape'); s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.3, 15)
    chk('после вступления — ролик мира 1 заново', s['video'] == 'world_01.mp4' and s['t'] > 0.3, s)
    tap(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    chk('бой мира 1 с начала', p.evaluate("SHOP.roundFrom") == 1 and p.evaluate("SHOP.phase") == 'fight')

    print('--- финал')
    p.evaluate("enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = 100; SHOP.phase = 'rest'; window.__m = 0; PATHMAP.show({ mode: 'short', t0: 0, t1: 0, onMid() {}, onDone() { window.__m = 1; } })")
    s = wait(p, lambda s: s['video'] == 'finale.mp4' and s['t'] > 0.6 and s['vis'] > 0.9, 20); time.sleep(1.5); a = p.evaluate(SND)
    chk('после босса мира 10 — finale.mp4, звук идёт, слайдов нет', s['video'] == 'finale.mp4' and s['slides'] == 0 and snd_ok(a) and a['dur'] > 250, [s, a])
    p.screenshot(path=os.path.join(OUT, '7_finale.png'))
    tap(p); time.sleep(1.5)
    chk('касание — финал пропущен, игра идёт дальше (карта перехода)', not p.evaluate(ST)['on'] and p.evaluate('PATHMAP.on || window.__m === 1'))
    cx.close()

    print('--- ролики миров 2–10: настоящий вход в мир с карты (все миры открыты)')
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    p.goto(URL + '?cine=1&allworlds&fakestore=web', timeout=120000)
    s = wait(p, lambda s: s['video'] == 'logo_paladium.mp4' and s['t'] > 0.2, 60); p.mouse.click(640, 360); s = wait(p, lambda s: not s['on'] and s['menu'] == 'block', 10)
    time.sleep(0.8); btn(p, 'Новая игра'); time.sleep(0.8); go(p)
    s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.2, 15); tap(p)
    s = wait(p, lambda s: s['map'] or s['video'] == 'world_01.mp4', 15)
    if s['video'] == 'world_01.mp4': tap(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    for n in range(2, 11):
        k = 'world_%02d.mp4' % n
        if not p.evaluate(ST)['map']:          # из боя — на карту, как игрок: гибель → Междумирье → выход
            p.evaluate("hurtPlayer(1e9)"); wait(p, lambda s: p.evaluate(WIN) or p.evaluate("LIMBO.on"), 12)
            if p.evaluate(WIN): win_btn(p, 'В Междумирье')
            wait(p, lambda s: p.evaluate("LIMBO.on"), 12); time.sleep(0.5); p.evaluate("LIMBO.leave()"); wait(p, lambda s: s['map'], 12)
        time.sleep(0.8); ok_pick = p.evaluate("(n) => PATHMAP.pickAt(n)", n); time.sleep(0.8); map_go(p); time.sleep(1.5)
        if p.evaluate(WIN): win_btn(p, 'Играть')
        s = wait(p, lambda s: s['video'] == k and s['t'] > 0.6 and s['vis'] > 0.9, 25); time.sleep(1.2); a = p.evaluate(SND)
        chk('мир %d: перед первым боем идёт %s, звук есть, игра стоит' % (n, k), ok_pick and s['video'] == k and s['t'] > 0.6 and snd_ok(a) and s['paused'] and s['phase'] == 'rest', [ok_pick, s['video'], s['t'], s['phase'], a])
        if n in (2, 10): p.screenshot(path=os.path.join(OUT, '8_world%d.png' % n))
        tap(p); wait(p, lambda s: not s['on'], 8); time.sleep(0.8)
        if p.evaluate(WIN): win_btn(p, 'Играть')          # с мира 3 на сайте после ролика — окно «Дальше — с рекламой»
        try: p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused && !CINE.on", timeout=25000)
        except Exception: pass
        s = p.evaluate(ST)
        chk('мир %d: касание — ролик пропущен, первый бой мира начался (волна %d)' % (n, (n - 1) * 10 + 1), s['phase'] == 'fight' and not s['on'] and s['wave'] == (n - 1) * 10 + 1, s)
    chk('ошибок нет', not errs, errs[:3]); cx.close(); br.close()
if SRV: SRV.terminate()
print('ИТОГ:', 'всё в порядке' if ok else 'ЕСТЬ ОШИБКИ'); sys.exit(0 if ok else 1)
