# -*- coding: utf-8 -*-
"""Проверка заставок и порядка экранов (v113, v116 — ролики книги) в настоящей странице (нужен обычный Chrome — в нём есть H.264):
python tools/cine_check.py [адрес]      без адреса сервер страниц поднимает сам (порт 8773) и сам останавливает;  снимки — tests/cine/.
v116: вступление, ролики всех 10 миров и финал — идут, со звуком, после ролика мир стартует.
v121: запуск — лого студии → лого игры → (первый раз) выбор языка → «PALLADIUM представляет» → пролог → меню; «Новая игра» пролог не показывает;
касание по экрану ролик НЕ закрывает — только кнопка «Продолжить» сверху. Код выхода 1 — если что-то не прошло."""
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
def tap(p):      # v121: выход из ролика — только кнопкой «Продолжить» сверху
    time.sleep(0.9); p.evaluate("(() => { const b = document.querySelector('#cine .skip'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); })()")
def touch(p, name):      # касания по экрану (в трёх местах) ролик не закрывают; кнопка «Продолжить» на месте
    time.sleep(0.9); v0 = p.evaluate(ST)
    for x, y in ((500, 420), (640, 360), (200, 600)): p.mouse.click(x, y); time.sleep(0.5)
    time.sleep(0.8); v1 = p.evaluate(ST); b = p.evaluate("(() => { const b = document.querySelector('#cine .skip'); return b ? b.textContent : ''; })()")
    chk(name + ': касания по экрану ролик не закрывают, сверху кнопка «Продолжить»', v1['on'] and v1['video'] == v0['video'] and v1['t'] > v0['t'] and b == 'Продолжить', [v0['video'], v0['t'], v1['video'], v1['t'], b])
BOOT = "(() => { const c = document.getElementById('cine'), q = s => !!(c && c.querySelector(s)); const pr = c && c.querySelector('.pres.on'); return { lg: q('.lg.on'), pick: !!document.getElementById('lgPick'), pres: pr ? pr.textContent : '' }; })()"
def boot(p, first, shots=False):
    """Запуск игры до главного меню. Возвращает порядок, в котором появлялись экраны, и звук пролога."""
    seq = []; snd = None; t0 = time.time(); touched = False
    def see(k):
        if k not in seq: seq.append(k); return True
        return False
    while time.time() - t0 < 90:
        try: s = p.evaluate(ST); b = p.evaluate(BOOT)
        except Exception: time.sleep(0.2); continue
        if s['menu'] == 'block' and not s['on']: see('menu'); break
        if s['video'] == 'logo_paladium.mp4' and s['t'] > 0.4:
            if see('studio'):
                if shots: p.screenshot(path=os.path.join(OUT, '1_palladium.png'))
                chk('запуск: первым идёт лого студии, меню ещё не видно', s['menu'] == 'none', s)
                p.mouse.click(640, 360)                    # лого студии касанием пропускается
        elif s['video'] == 'intro.mp4' and s['t'] > 0.5 and s['vis'] > 0.9:
            if see('intro'):
                time.sleep(1.5); snd = p.evaluate(SND)
                if shots: p.screenshot(path=os.path.join(OUT, '1d_intro.png'))
                if first: touch(p, 'пролог при запуске')
                tap(p)
        elif b['pick'] and 'pick' not in seq:
            time.sleep(0.9); see('pick')
            if shots: p.screenshot(path=os.path.join(OUT, '1b_language.png'))
            p.evaluate("document.querySelector('#lgPick [data-l=ru]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))")
        elif b['pres'] and not any(x.startswith('pres') for x in seq):
            see('pres:' + b['pres']); time.sleep(1.0)
            if shots: p.screenshot(path=os.path.join(OUT, '1c_presents.png'))
        elif b['lg'] and 'studio' in seq: see('game')
        time.sleep(0.1)
    return seq, snd
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
def soft_go(p):      # «Продолжить» на карте, если кнопка сейчас видна (без ожидания)
    p.evaluate("(() => { const b = document.getElementById('pmGo'); if (b && getComputedStyle(b).display !== 'none') for (const t of ['pointerdown', 'pointerup', 'click']) b.dispatchEvent(new PointerEvent(t, { bubbles: true })); })()"); time.sleep(0.8)
LIST = "(() => { const b = document.getElementById('cineList'); return { on: !!b && getComputedStyle(b).display === 'flex', open: b ? [...b.querySelectorAll('.it:not(.no)')].map(x => x.dataset.k) : [] }; })()"
def story(p, k): p.evaluate("(k) => document.querySelector('#cineList .it[data-k=\"' + k + '\"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))", k)
def story_close(p): p.evaluate("document.querySelector('#cineList .x').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
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
    seq, a = boot(p, True, True); s = p.evaluate(ST)
    chk('первый запуск: лого студии → лого игры → выбор языка → «PALLADIUM представляет» → пролог → меню', seq == ['studio', 'game', 'pick', 'pres:PALLADIUMпредставляет', 'intro', 'menu'], seq)
    chk('пролог при запуске: звук идёт', snd_ok(a) and a['dur'] > 100, a)
    chk('язык после выбора запомнен (русский)', p.evaluate("LANG.cur === 'ru' && LANG.chosen && localStorage.getItem('hw_lang') === 'ru'"))
    w = p.evaluate('__w')
    chk('видео: без кнопок, с пустым постером, до первого кадра не показывалось', w['vids'] > 0 and not w['bad'] and w['early'] == 0, w)
    chk('без сохранения: первая кнопка — «Новая игра», подсвечена; «Продолжить» нет', s['btns'][0] == 'Новая игра*' and not any('Продолжить' in b for b in s['btns']) and len([b for b in s['btns'] if 'Новая' in b]) == 1, s['btns'])
    chk('в меню есть «История» и «PRO»', p.evaluate("!!document.querySelector('#mMain .b.story') && !!document.querySelector('#mMain .b.pro')"))
    time.sleep(0.8); p.screenshot(path=os.path.join(OUT, '2_menu_new.png'))
    p.mouse.click(640, 700); time.sleep(1.0)
    chk('музыка меню — m7', p.evaluate("typeof mus !== 'undefined' && !!mus.el && /m7\\.mp3/.test(mus.el.src)"))
    btn(p, 'История'); time.sleep(0.6); L = p.evaluate(LIST)
    chk('«История» — список роликов; до игры открыт только пролог', L['on'] and L['open'] == ['intro'], L); p.screenshot(path=os.path.join(OUT, '2b_story_list.png'))
    story(p, 'intro'); s = wait(p, lambda s: s['video'] == 'intro.mp4' and s['t'] > 0.3 and s['vis'] > 0.9, 15)
    chk('«Пролог» из списка — идёт intro.mp4', s['video'] == 'intro.mp4' and s['t'] > 0.3, s)
    time.sleep(1.5); a = p.evaluate(SND); chk('вступление: новый ролик (книга), звук идёт', snd_ok(a) and a['dur'] > 100, a)
    touch(p, 'пролог из «Истории»')
    tap(p); s = wait(p, lambda s: not s['on'], 15)
    chk('«Продолжить» — ролик закрыт, снова список «Истории»', not s['on'] and p.evaluate(LIST)['on'], s)
    story_close(p); time.sleep(0.4); chk('«Назад» — главное меню', not p.evaluate(LIST)['on'] and p.evaluate(ST)['menu'] == 'block')

    print('--- новая игра (сохранения нет)')
    btn(p, 'Новая игра'); time.sleep(0.6); s = p.evaluate(ST)
    chk('«Новая игра» без сохранения: сразу выбор героя, без вопроса', s['sel'] == 'flex' and s['menu'] == 'none' and not p.evaluate("!!document.getElementById('mNew')"), s)
    go(p); t = time.time(); vid = 0
    while time.time() - t < 15:
        s = p.evaluate(ST); vid += 1 if s['on'] else 0
        if s['map']: break
        time.sleep(0.1)
    chk('«В бой» — сразу карта миров, пролог в новой игре не идёт', s['map'] and not s['on'] and vid == 0 and s['phase'] == 'rest' and s['wave'] == 0, [s, vid])
    time.sleep(1.2); p.screenshot(path=os.path.join(OUT, '3b_map.png')); again = 0; t = time.time()
    while time.time() - t < 3: again += 1 if p.evaluate(ST)['on'] else 0; time.sleep(0.1)
    chk('на карте ролики сами не идут', again == 0, again)
    map_go(p); t = time.time(); gap = 0
    while time.time() - t < 10:            # между картой и роликом мира арена не мелькает: ролик встаёт сразу
        s = p.evaluate(ST)
        if s['video'] == 'world_01.mp4': break
        if not s['on'] and not s['map']: gap += 1
        time.sleep(0.05)
    s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.5 and s['vis'] > 0.9, 15)
    chk('мир 1 выбран на карте — сразу ролик мира 1, игра стоит', s['video'] == 'world_01.mp4' and s['t'] > 0.5 and s['slides'] == 0 and s['paused'] and s['phase'] == 'rest' and not s['map'] and gap <= 1, [s, gap])
    touch(p, 'ролик мира 1')
    time.sleep(2.5); p.screenshot(path=os.path.join(OUT, '4_world1.png'))
    a = p.evaluate(SND); chk('ролик мира 1: звук идёт', snd_ok(a), a)
    chk('музыка игры под ролик выключена', p.evaluate("mus.v != null && mus.v <= MUS_VOL * 0.05"), p.evaluate("[mus.v, MUS_VOL]"))
    tap(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    s = p.evaluate(ST)
    chk('«Продолжить» — ролик закрыт, первая арена мира 1: бой идёт, пауза снята', s['phase'] == 'fight' and not s['paused'] and not s['on'] and s['wave'] == 1, s)
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
    chk('«Продолжить» с сохранения: тот же раунд, ни пролог, ни ролик мира 1 второй раз не идут', p.evaluate("SHOP.roundFrom") == w0 and not p.evaluate(ST)['on'], [w0, p.evaluate("SHOP.roundFrom")])

    print('--- повторный запуск игры')
    p.goto(U, timeout=120000)
    seq, a = boot(p, False); s = p.evaluate(ST)
    chk('новый запуск: снова лого студии, лого игры, «PALLADIUM представляет» и пролог; язык второй раз не спрашивают', seq == ['studio', 'game', 'pres:PALLADIUMпредставляет', 'intro', 'menu'], seq)
    chk('после пролога — меню с «Продолжить»', not s['on'] and s['menu'] == 'block' and s['btns'][0] == 'Продолжить*', s)
    btn(p, 'История'); time.sleep(0.6); L = p.evaluate(LIST)
    chk('«История»: открыты пролог и мир 1, остальные закрыты', L['on'] and L['open'] == ['intro', 'world_01'], L)
    story(p, 'world_01'); s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.3, 15)
    chk('ролик мира 1 можно пересмотреть из «Истории»', s['video'] == 'world_01.mp4', s)
    tap(p); wait(p, lambda s: not s['on'], 10); story_close(p); time.sleep(0.4)

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
    go(p); s = wait(p, lambda s: s['map'] or s['on'], 15)
    chk('«В бой» — карта миров, без пролога', s['map'] and not s['on'], s)
    time.sleep(1.0); map_go(p)
    s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.3, 15)
    chk('новая игра заново: карта → ролик мира 1 снова идёт', s['video'] == 'world_01.mp4' and s['t'] > 0.3, s)
    tap(p); p.wait_for_function("SHOP.phase === 'fight' && !SHOP.paused", timeout=20000)
    chk('бой мира 1 с начала', p.evaluate("SHOP.roundFrom") == 1 and p.evaluate("SHOP.phase") == 'fight')

    print('--- вход в мир 2 после босса мира 1 (v117): ролик — сразу за картой перехода; пропуск → арена → «Начать волну» → ролика нет')
    seen_vid = set(); t0 = time.time()
    while time.time() - t0 < 240:
        s = p.evaluate(ST)
        if s['on']: seen_vid.add(s['video']); break
        if p.evaluate(WIN): win_btn(p, 'Дальше')
        elif s['wave'] >= 10 and s['phase'] == 'rest': pass                     # босс убит — ждём карту перехода и ролик
        elif s['phase'] == 'fight': p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)")
        elif s['map']: soft_go(p)
        elif s['phase'] == 'rest': p.evaluate("SHOP.startWave()")
        time.sleep(0.4)
    s = wait(p, lambda s: s['video'] == 'world_02.mp4' and s['t'] > 0.6 and s['vis'] > 0.9, 30)
    chk('босс мира 1 убит → карта перехода → ролик мира 2 (до арены, без нажатия «Начать волну»)', s['video'] == 'world_02.mp4' and s['t'] > 0.6 and s['wave'] == 10 and s['phase'] == 'rest' and s['paused'], s)
    tap(p); s = wait(p, lambda s: not s['on'] and not s['cine'], 10); time.sleep(1.5); s = p.evaluate(ST)
    chk('«Продолжить» — ролик закрыт, герой на арене мира 2, бой ещё не начат', not s['on'] and s['phase'] == 'rest' and s['wave'] == 10 and p.evaluate('WORLD') == 2, s)
    again = 0
    p.evaluate("SHOP.closeShop && SHOP.open && SHOP.closeShop()"); time.sleep(0.3)
    p.evaluate("document.querySelector('.go.bg').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
    t0 = time.time()
    while time.time() - t0 < 6:
        s = p.evaluate(ST); again += 1 if (s['on'] or s['cine']) else 0
        if s['map']: soft_go(p)
        time.sleep(0.1)
    s = p.evaluate(ST)
    chk('«Начать волну» на арене — ролика нет, первый бой мира 2 идёт', again == 0 and s['phase'] == 'fight' and s['wave'] == 11, [again, s])
    for i in range(60):
        p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); time.sleep(0.4)
        if p.evaluate(ST)['phase'] == 'rest': break
    time.sleep(2.5); again = 0; p.evaluate("SHOP.closeShop && SHOP.open && SHOP.closeShop()"); time.sleep(0.3); p.evaluate("document.querySelector('.go.bg').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
    t0 = time.time()
    while time.time() - t0 < 6:
        s = p.evaluate(ST); again += 1 if (s['on'] or s['cine']) else 0
        if s['map']: soft_go(p)
        time.sleep(0.1)
    s = p.evaluate(ST)
    chk('следующая «Начать волну» — ролика тоже нет, бой идёт', again == 0 and s['phase'] == 'fight' and s['wave'] > 11, [again, s])
    p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); time.sleep(1)

    print('--- финал')
    p.evaluate("enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = 100; SHOP.phase = 'rest'; window.__m = 0; PATHMAP.show({ mode: 'short', t0: 0, t1: 0, onMid() {}, onDone() { window.__m = 1; } })")
    s = wait(p, lambda s: s['video'] == 'finale.mp4' and s['t'] > 0.6 and s['vis'] > 0.9, 20); time.sleep(1.5); a = p.evaluate(SND)
    chk('после босса мира 10 — finale.mp4, звук идёт, слайдов нет', s['video'] == 'finale.mp4' and s['slides'] == 0 and snd_ok(a) and a['dur'] > 250, [s, a])
    p.screenshot(path=os.path.join(OUT, '7_finale.png'))
    touch(p, 'финал')
    tap(p); time.sleep(1.5)
    chk('«Продолжить» — финал закрыт, игра идёт дальше (карта перехода)', not p.evaluate(ST)['on'] and p.evaluate('PATHMAP.on || window.__m === 1'))
    cx.close()

    print('--- ролики миров 2–10: настоящий вход в мир с карты (все миры открыты)')
    cx = br.new_context(viewport={'width': 1280, 'height': 720}); p = cx.new_page(); p.on('pageerror', lambda e: errs.append(str(e)[:200]))
    p.goto(URL + '?cine=1&allworlds&fakestore=web', timeout=120000)
    boot(p, False)
    time.sleep(0.8); btn(p, 'Новая игра'); time.sleep(0.8); go(p)
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
        chk('мир %d: «Продолжить» — ролик закрыт, первый бой мира начался (волна %d)' % (n, (n - 1) * 10 + 1), s['phase'] == 'fight' and not s['on'] and s['wave'] == (n - 1) * 10 + 1, s)
    print('--- повторный вход в открытый мир, победа над боссом мира 10, «История»')
    def to_map():
        p.evaluate("hurtPlayer(1e9)"); wait(p, lambda s: p.evaluate(WIN) or p.evaluate("LIMBO.on"), 12)
        if p.evaluate(WIN): win_btn(p, 'В Междумирье')
        wait(p, lambda s: p.evaluate("LIMBO.on"), 12); time.sleep(0.5); p.evaluate("LIMBO.leave()"); wait(p, lambda s: s['map'], 12); time.sleep(0.8)
    to_map(); again = 0; t0 = time.time()
    while time.time() - t0 < 2.5: again += 1 if p.evaluate(ST)['on'] else 0; time.sleep(0.1)
    p.evaluate("PATHMAP.pickAt(2)"); time.sleep(0.8); map_go(p); t0 = time.time()
    while time.time() - t0 < 5:
        again += 1 if p.evaluate(ST)['on'] else 0
        if p.evaluate(WIN): win_btn(p, 'Играть')
        time.sleep(0.1)
    s = p.evaluate(ST)
    chk('возврат на карту и повторный вход в мир 2 — ролика нет, бой идёт', again == 0 and s['phase'] == 'fight' and s['wave'] == 11, [again, s])
    to_map(); p.evaluate("PATHMAP.pickAt(10, 2)"); time.sleep(0.8); map_go(p); time.sleep(1.5)
    if p.evaluate(WIN): win_btn(p, 'Играть')
    p.wait_for_function("SHOP.phase === 'fight' && wave === 100 && enemies.some(e => e.boss)", timeout=25000)
    chk('перед боссом мира 10 ролик не идёт (мир уже открыт), финал ещё закрыт', not p.evaluate(ST)['on'] and not [x for x in p.evaluate("CINE.unlocked()") if x['k'] == 'finale'][0]['open'])
    t0 = time.time(); s = p.evaluate(ST)
    while time.time() - t0 < 60 and s['video'] != 'finale.mp4':
        p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)"); time.sleep(0.4); s = p.evaluate(ST)
    s = wait(p, lambda s: s['video'] == 'finale.mp4' and s['t'] > 0.6 and s['vis'] > 0.9, 20)
    chk('босс мира 10 убит (волна 100) — сразу финал finale.mp4, до окон и карты', s['video'] == 'finale.mp4' and s['t'] > 0.6 and not s['map'] and not p.evaluate(WIN), s)
    tap(p); wait(p, lambda s: not s['on'], 10); time.sleep(1.0)
    u = p.evaluate("CINE.unlocked().filter(x => x.open).map(x => x.k)")
    chk('«История»: открыты пролог, миры 2–10 (в них входили) и финал; мир 1 закрыт (в него не входили)', u == ['intro'] + ['world_%02d' % i for i in range(2, 11)] + ['finale'], u)
    chk('ошибок нет', not errs, errs[:3]); cx.close(); br.close()
if SRV: SRV.terminate()
print('ИТОГ:', 'всё в порядке' if ok else 'ЕСТЬ ОШИБКИ'); sys.exit(0 if ok else 1)
