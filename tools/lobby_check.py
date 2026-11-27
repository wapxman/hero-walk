# -*- coding: utf-8 -*-
"""Онлайн: зал ожидания игры вдвоём (v124). Два настоящих клиента и местный сервер игры.
Проверяет: в «Онлайн» нет ни одиночной игры, ни дуэли; выбор героя → «Далее» → зал; «Искать напарника» — игрок появляется в списке у
другого; «Играть» по строке списка — оба в одной комнате, игра началась; «Отмена» убирает из списка; «Комната для друга» даёт код,
«Войти по коду» (экранные цифры) — вход; неверный код — понятная ошибка, а не пустая комната.
Сервер игры (порт 8792) и сервер страниц (порт 8775) поднимает и останавливает сам (только свои процессы).
Запуск: python tools/lobby_check.py      снимки — tests/lobby/. Код выхода 1 — красный."""
import sys, os, time, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); WEB = 8775; GAME = 8792
BASE = 'http://127.0.0.1:%d/index.html?server=ws://127.0.0.1:%d' % (WEB, GAME)
OUT = os.path.join(ROOT, 'tests', 'lobby'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  ок   ' if ok else '  НЕТ  ') + name + ((' — ' + str(extra)[:300]) if extra and not ok else ''))
    if not ok: bad.append(name)
ST = """(() => { const L = document.getElementById('tmLobby'), on = !!L && getComputedStyle(L).display !== 'none', q = s => L ? [...L.querySelectorAll(s)] : [];
  const disp = id => document.getElementById(id) ? getComputedStyle(document.getElementById(id)).display : 'none';
  return { lobby: on, st: window.LOBBY ? LOBBY.st : '', rows: q('.rw').map(r => r.querySelector('b').textContent + ' | ' + r.querySelector('span').textContent), rooms: q('.rw').map(r => r.dataset.room),
    btns: q('.bt').map(b => b.textContent), big: q('.big').map(b => b.textContent).join(), err: q('.err').map(b => b.textContent).join(), empty: q('.no').map(b => b.textContent).join(),
    team: TEAM.on, host: TEAM.host, peer: TEAM.peer ? TEAM.peer.name : '', map: PATHMAP.on, sel: disp('hSel'), menu: disp('mMain'), wave, phase: SHOP.phase, en: enemies.length, nick: localStorage.getItem('hw_nick') }; })()"""
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))"
web = subprocess.Popen([sys.executable, '-m', 'http.server', str(WEB), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
game = subprocess.Popen(['node', os.path.join(ROOT, 'server', 'server.js'), str(GAME)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=ROOT)
try:
    time.sleep(2.0)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        def client(hero='mage'):
            cx = br.new_context(viewport={'width': 915, 'height': 412}); p = cx.new_page(); p.errs = []; p.cx = cx
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            cx.add_init_script("if (!sessionStorage.getItem('__i')) { sessionStorage.setItem('__i', '1'); localStorage.clear(); localStorage.setItem('hw_lang', 'ru'); }")
            p.goto(BASE, timeout=120000)
            p.wait_for_function("document.getElementById('mMain') && getComputedStyle(document.getElementById('mMain')).display === 'block'", timeout=60000); time.sleep(1.2)
            p.evaluate("[...document.querySelectorAll('#mMain .btns .b')].find(b => (b.dataset.ru || b.textContent) === 'Онлайн')." + PD); time.sleep(0.8)
            if hero == 'archer': p.evaluate("document.querySelectorAll('#hSel .card')[1]." + PD); time.sleep(0.4)
            return p
        st = lambda p: p.evaluate(ST)
        def wait(p, cond, sec=15):
            t0 = time.time(); s = st(p)
            while time.time() - t0 < sec:
                s = st(p)
                if cond(s): return s
                time.sleep(0.25)
            return s
        go = lambda p: p.evaluate("document.querySelector('#hSel .go')." + PD)
        btn = lambda p, t: p.evaluate("(t) => { const b = [...document.querySelectorAll('#tmLobby .bt')].find(b => (b.dataset.ru || b.textContent) === t); if (b) b." + PD + "; return !!b; }", t)
        key = lambda p, k: p.evaluate("(k) => document.querySelector('#tmLobby .k[data-k=\"' + k + '\"]')." + PD, k)

        print('1. вход в зал')
        A = client('mage')
        s = A.evaluate("({ go: (document.querySelector('#hSel .go').dataset.ru || document.querySelector('#hSel .go').textContent), modes: getComputedStyle(document.querySelector('#hSel .modes')).display, plaque: document.querySelector('#hSel .pl').textContent, kind: window.SEL_KIND })")
        chk('«Онлайн»: выбор героя, кнопка «ДАЛЕЕ», кнопок «Одиночная / Дуэль» на экране нет', s['go'] == 'ДАЛЕЕ' and s['modes'] == 'none' and s['kind'] == 'online', s)
        go(A); s = wait(A, lambda s: s['lobby'] and s['st'] == 'idle'); A.screenshot(path=os.path.join(OUT, '1_empty.png'))
        chk('«Далее» — зал ожидания, игра не началась', s['lobby'] and s['st'] == 'idle' and not s['team'] and not s['map'] and s['phase'] == 'rest', s)
        chk('в зале три действия: искать напарника, комната для друга, войти по коду', s['btns'][:3] == ['Искать напарника', 'Комната для друга', 'Войти по коду'], s['btns'])
        s = wait(A, lambda s: 'никто не ищет' in s['empty'], 6); chk('список пуст — понятная надпись, не пустой экран', 'Пока никто не ищет напарника' in s['empty'], s['empty'])

        print('2. «Искать напарника» → виден другому → «Играть»')
        btn(A, 'Искать напарника'); s = wait(A, lambda s: s['st'] == 'wait'); A.screenshot(path=os.path.join(OUT, '2_waiting.png'))
        chk('ведущий встал в список и ждёт, игра не началась', s['st'] == 'wait' and s['lobby'] and not s['team'], s)
        B = client('archer'); go(B); s = wait(B, lambda s: s['lobby'] and len(s['rows']) == 1, 10); B.screenshot(path=os.path.join(OUT, '3_list.png'))
        chk('второй игрок видит в списке первого: имя, герой, уровень, мир', len(s['rows']) == 1 and 'Ganfaul' in s['rows'][0] and 'ур. 1' in s['rows'][0] and 'мир 1' in s['rows'][0] and s['rows'][0].startswith(st(A)['nick']), s['rows'])
        B.evaluate("document.querySelector('#tmLobby .rw .pl')." + PD)
        a = wait(A, lambda s: s['team'] and not s['lobby'], 10); b = wait(B, lambda s: s['team'] and not s['lobby'], 10)
        chk('«Играть» — оба в одной комнате: первый ведущий, второй ведомый, зал закрыт', a['team'] and a['host'] and b['team'] and not b['host'] and not a['lobby'] and not b['lobby'] and a['peer'] and b['peer'], [a, b])
        a = wait(A, lambda s: s['map'], 10); chk('у ведущего открылась карта миров (выбор главы)', a['map'], a)
        A.keyboard.press('Enter'); time.sleep(1.0)
        A.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        a = wait(A, lambda s: s['phase'] == 'fight', 20); b = wait(B, lambda s: s['phase'] == 'fight' and s['en'] > 0, 20)
        A.screenshot(path=os.path.join(OUT, '4_game_A.png')); B.screenshot(path=os.path.join(OUT, '4_game_B.png'))
        chk('бой идёт у обоих на одной волне', a['phase'] == 'fight' and b['phase'] == 'fight' and a['wave'] == b['wave'] == 1 and b['en'] > 0, [a, b])
        chk('без ошибок', not A.errs and not B.errs, [A.errs, B.errs]); A.cx.close(); B.cx.close()

        print('3. «Отмена» убирает из списка')
        A = client(); go(A); wait(A, lambda s: s['st'] == 'idle'); btn(A, 'Искать напарника'); wait(A, lambda s: s['st'] == 'wait')
        B = client(); go(B); s = wait(B, lambda s: len(s['rows']) == 1, 10); chk('ждущий виден в списке', len(s['rows']) == 1, s)
        btn(A, 'Отмена'); a = wait(A, lambda s: s['st'] == 'idle'); s = wait(B, lambda s: len(s['rows']) == 0, 8)
        chk('после «Отмена» игрок снова в зале, а из списка у другого пропал', a['st'] == 'idle' and len(s['rows']) == 0, [a['st'], s['rows']])

        print('4. комната для друга и вход по коду')
        btn(A, 'Комната для друга'); a = wait(A, lambda s: s['st'] == 'friend' and s['big'].isdigit()); A.screenshot(path=os.path.join(OUT, '5_friend_code.png'))
        code = a['big']; chk('«Комната для друга» показывает код из четырёх цифр', len(code) == 4 and code.isdigit(), a)
        time.sleep(3.0); s = st(B); chk('закрытая комната в общем списке не видна', len(s['rows']) == 0, s['rows'])
        btn(B, 'Войти по коду'); wait(B, lambda s: s['st'] == 'code')
        wrong = '%04d' % ((int(code) + 1111) % 10000)
        for k in wrong: key(B, k)
        B.screenshot(path=os.path.join(OUT, '6_keypad.png')); key(B, 'OK')
        s = wait(B, lambda s: s['err'] != '', 8); chk('неверный код — «комнаты с таким кодом нет», игрок остаётся в зале', 'комнаты с таким кодом нет' in s['err'] and s['lobby'] and not s['team'], s)
        btn(B, 'Войти по коду'); wait(B, lambda s: s['st'] == 'code')
        for k in code: key(B, k)
        key(B, 'OK')
        a = wait(A, lambda s: s['team'] and not s['lobby'], 10); b = wait(B, lambda s: s['team'] and not s['lobby'], 10)
        chk('верный код — оба в комнате друга, зал закрыт', a['team'] and a['host'] and b['team'] and not b['host'], [a, b])
        chk('без ошибок', not A.errs and not B.errs, [A.errs, B.errs]); A.cx.close(); B.cx.close()

        print('5. «Назад» из зала')
        A = client(); go(A); wait(A, lambda s: s['st'] == 'idle')
        A.evaluate("document.querySelector('#tmLobby .back')." + PD); s = wait(A, lambda s: not s['lobby'])
        chk('«Назад» — снова выбор героя, игра не началась', not s['lobby'] and s['sel'] == 'flex' and not s['team'], s); A.cx.close()
        br.close()
finally:
    game.terminate(); web.terminate()
print('ГОТОВО: всё чисто' if not bad else 'КРАСНОЕ: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
