# -*- coding: utf-8 -*-
"""Переходы без чужой локации (v124, баг Создателя 27.11: после ролика мира на 0,8 с была видна стартовая арена мира 1).
Каждый кадр страницы записывается: чем закрыт экран (ролик, карта, затемнение арены, меню…) и какая арена сейчас под ним
нарисована (картинка земли, волна, золото). Ошибка — кадр, где экран уже открыт, а на нём не та арена или не то сохранение,
к которым переход в итоге пришёл (то есть «мелькнула» чужая локация).
Сценарии: «Продолжить» в новый мир с роликом и без; новая игра; босс убит → новый мир; следующая арена мира; гибель →
Междумирье → назад; переигрывание пройденной главы; выход в меню и снова «Продолжить».
Нужен обычный Chrome (в нём есть кодек роликов). Сервер страниц поднимает сам (порт 8774) и сам останавливает.
Запуск: python tools/trans_check.py [--only 1,4] [--shots]      снимки и журнал кадров — tests/trans/. Код выхода 1 — красный."""
import sys, os, time, json, subprocess, argparse
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser(); ap.add_argument('--only', default=''); ap.add_argument('--shots', action='store_true'); A = ap.parse_args()
ONLY = set(int(x) for x in A.only.split(',') if x)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8774; BASE = 'http://127.0.0.1:%d/index.html' % PORT
OUT = os.path.join(ROOT, 'tests', 'trans'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  ок   ' if ok else '  НЕТ  ') + name + ((' — ' + str(extra)[:300]) if extra and not ok else ''))
    if not ok: bad.append(name)

PROBE = r"""
window.__P = { rec: false, fr: [] };
addEventListener('DOMContentLoaded', () => {
  const op = e => e ? +getComputedStyle(e).opacity : 0, shown = e => !!e && getComputedStyle(e).display !== 'none';
  let cov8 = null, fade20 = null;
  const find = () => { for (const d of document.body.children) { if (d.tagName !== 'DIV' || d.id) continue; const z = d.style.zIndex; if (z === '8' && !cov8) cov8 = d; if (z === '20' && !fade20) fade20 = d; } };
  const tick = () => {
    requestAnimationFrame(tick);
    if (!__P.rec || typeof SHOP === 'undefined' || typeof img === 'undefined') return;
    if (!cov8 || !fade20) find();
    const c = document.getElementById('cine'), m = document.getElementById('pathmap'), sp = document.getElementById('mSplash'), w = document.getElementById('stWin');
    let cov = '';
    if (shown(c) && op(c) > 0.9 && getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)') cov = 'cine';
    else if (shown(m)) cov = 'map';
    else if (shown(cov8) && op(cov8) > 0.9) cov = 'cover';
    else if (fade20 && op(fade20) > 0.9) cov = 'fade';
    else if (shown(document.getElementById('mMain'))) cov = 'menu';
    else if (shown(document.getElementById('hSel'))) cov = 'sel';
    else if (sp && op(sp) > 0.9) cov = 'splash';
    else if (typeof LIMBO !== 'undefined' && LIMBO.on) cov = 'limbo';
    const g = ((img.ground && img.ground.src) || '').split('?')[0].split('/').slice(-2).join('/');
    __P.fr.push([Math.round(performance.now()), cov, g, wave, SHOP.phase, Math.floor(SHOP.gold), SHOP.bag.filter(Boolean).length]);
  };
  tick();
});
"""
ST = """(() => { const c = document.getElementById('cine'), v = c && c.querySelector('video'), on = !!c && c.style.display === 'block';
  const disp = id => document.getElementById(id) ? getComputedStyle(document.getElementById(id)).display : 'none';
  const w = document.getElementById('stWin');
  return { cine: on, video: on && v ? v.src.split('/').pop().split('?')[0] : '', t: on && v ? v.currentTime : 0, menu: disp('mMain'), sel: disp('hSel'), map: typeof PATHMAP !== 'undefined' && PATHMAP.on,
    go: disp('pmGo'), phase: SHOP.phase, wave, limbo: typeof LIMBO !== 'undefined' && LIMBO.on, dead: P.dead > 0, world: WORLD, win: w && getComputedStyle(w).display === 'flex' ? w.textContent.slice(0, 60) : '',
    ground: ((img.ground && img.ground.src) || '').split('?')[0].split('/').slice(-2).join('/'), gold: Math.floor(SHOP.gold), cover: typeof ARENA_COVER !== 'undefined' && ARENA_COVER.busy }; })()"""
SEEN = lambda upto: json.dumps({('world_%02d' % n): 1 for n in range(1, upto + 1)})
def save(wave, best=None, gold=1367, bag=('sword', 'boots', 'ring')):
    return json.dumps({'v': 1, 'wave': wave, 'best': wave if best is None else best, 'hp': 900, 'mp': 300, 'gold': gold, 'bag': list(bag), 'flasks': {'heal': 2}, 'lv': 1, 't': int(time.time() * 1000)})

srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        br = pw.chromium.launch(channel='chrome', args=['--autoplay-policy=no-user-gesture-required'])
        def page(store, q='cine=1'):
            cx = br.new_context(viewport={'width': 1280, 'height': 576}); p = cx.new_page(); p.errs = []; p.cx = cx
            p.on('pageerror', lambda e: p.errs.append(str(e)[:300]))
            cx.add_init_script("if (!sessionStorage.getItem('__init')) { sessionStorage.setItem('__init', '1'); localStorage.clear(); const d = %s; for (const k in d) localStorage.setItem(k, d[k]); }" % json.dumps(store))
            cx.add_init_script(PROBE)
            p.goto(BASE + '?' + q, timeout=120000)
            return p
        st = lambda p: p.evaluate(ST)
        def wait(p, cond, sec=30, step=0.2):
            t0 = time.time(); s = None
            while time.time() - t0 < sec:
                try:
                    s = st(p)
                    if cond(s): return s
                except Exception: pass
                time.sleep(step)
            return s or st(p)
        def to_menu(p):      # запуск: все заставки пропускаем, ждём главное меню
            t0 = time.time()
            while time.time() - t0 < 90:
                try:
                    s = st(p)
                    if s['menu'] == 'block' and not s['cine']: return s
                    p.evaluate("typeof CINE !== 'undefined' && CINE.skip && CINE.skip()"); p.mouse.click(640, 300)
                except Exception: pass
                time.sleep(0.35)
            return st(p)
        first_btn = lambda p: p.evaluate("[...document.querySelectorAll('#mMain .btns .b')][0].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))")
        hero_go = lambda p: p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
        map_go = lambda p: p.evaluate("for (const t of ['pointerdown', 'pointerup', 'click']) document.getElementById('pmGo').dispatchEvent(new PointerEvent(t, { bubbles: true }))")
        skip = lambda p: p.evaluate("(() => { const b = document.querySelector('#cine .skip'); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); })()")
        win = lambda p, t: p.evaluate("(t) => { const b = [...document.querySelectorAll('#stWin .bt')].find(b => b.textContent.indexOf(t) === 0); if (b) b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }", t)
        rec = lambda p, on: p.evaluate("(on) => { if (on) __P.fr.length = 0; __P.rec = on; }", on)
        def frames(p): return p.evaluate("__P.fr")
        def analyze(name, fr, n):
            """После первого закрытого кадра открытый экран обязан показывать итоговую арену и итоговое сохранение."""
            json.dump(fr, open(os.path.join(OUT, '%d_frames.json' % n), 'w'))
            if len(fr) < 10: chk(name + ': кадры записаны', False, len(fr)); return
            fin = fr[-1]; seen = False; flash = []; open_fin = 0
            for f in fr:
                if f[1]: seen = True; continue
                if not seen: continue
                if f[2] != fin[2] or abs(f[3] - fin[3]) > 1 or abs(f[5] - fin[5]) > 400 or f[6] != fin[6]: flash.append(f)
                else: open_fin += 1
            covs = []
            for f in fr:
                if not covs or covs[-1] != (f[1] or 'арена'): covs.append(f[1] or 'арена')
            dur = (flash[-1][0] - flash[0][0] + 17) if flash else 0
            print('     кадров %d, порядок: %s; итог: %s, волна %d, золото %d' % (len(fr), ' → '.join(covs), fin[2], fin[3], fin[5]))
            chk(name + ': чужая локация не мелькает', not flash, 'кадров с чужой локацией: %d (≈ %d мс), например %s' % (len(flash), dur, flash[:1]))
            chk(name + ': переход дошёл до открытой арены', open_fin > 5 and not fin[1], fin)
        def shot(p, n, k):
            if A.shots: p.screenshot(path=os.path.join(OUT, '%d_%s.png' % (n, k)))
        def run(n, title, fn):
            if ONLY and n not in ONLY: return
            print('%d. %s' % (n, title))
            try: fn(n, title)
            except Exception as e: chk(title + ': сценарий выполнен', False, repr(e)[:300])

        # 1. «Продолжить» → карта → новый мир с роликом (тот самый баг): сохранение на входе в мир 5, ролик мира 5 ещё не видели
        def s1(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(40), 'hw_cine': SEEN(4), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); s = wait(p, lambda s: s['map'] and s['go'] != 'none', 30); chk(title + ': карта открылась', s['map'], s)
            time.sleep(0.8); map_go(p)
            s = wait(p, lambda s: s['video'] == 'world_05.mp4' and s['t'] > 0.8, 40); chk(title + ': идёт ролик мира 5', s['video'] == 'world_05.mp4', s)
            rec(p, True); time.sleep(0.3); skip(p)
            for k, d in (('a', 0.15), ('b', 0.25), ('c', 0.3), ('d', 0.4)): time.sleep(d); shot(p, n, k)
            s = wait(p, lambda s: not s['cine'] and not s['cover'] and s['world'] == 5, 30)
            if s['win']: win(p, 'Играть')
            time.sleep(4); rec(p, False); analyze(title, frames(p), n); shot(p, n, 'z')
            s = st(p); chk(title + ': мир 5, сохранение на месте', s['world'] == 5 and s['wave'] in (40, 41) and s['gold'] >= 1300, s); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(1, '«Продолжить» в новый мир с роликом', s1)

        # 2. то же без ролика (мир уже открыт)
        def s2(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(40), 'hw_cine': SEEN(10), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); s = wait(p, lambda s: s['map'] and s['go'] != 'none', 30); chk(title + ': карта открылась', s['map'], s)
            time.sleep(0.8); rec(p, True); map_go(p)
            s = wait(p, lambda s: not s['map'] and not s['cover'] and s['world'] == 5, 30)
            if s['win']: win(p, 'Играть')
            time.sleep(4); rec(p, False); analyze(title, frames(p), n); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(2, '«Продолжить» в мир без ролика', s2)

        # 3. новая игра: выбор героя → карта → ролик мира 1 → первая арена
        def s3(n, title):
            p = page({'hw_lang': 'ru'})
            to_menu(p); first_btn(p); s = wait(p, lambda s: s['sel'] == 'flex', 20); chk(title + ': выбор героя', s['sel'] == 'flex', s)
            time.sleep(0.5); hero_go(p); s = wait(p, lambda s: s['map'] and s['go'] != 'none', 30); chk(title + ': карта открылась', s['map'], s)
            time.sleep(0.8); map_go(p)
            s = wait(p, lambda s: s['video'] == 'world_01.mp4' and s['t'] > 0.8, 40); chk(title + ': идёт ролик мира 1', s['video'] == 'world_01.mp4', s)
            rec(p, True); time.sleep(0.3); skip(p)
            wait(p, lambda s: not s['cine'] and not s['cover'], 30); time.sleep(4); rec(p, False); analyze(title, frames(p), n); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(3, 'новая игра: ролик мира 1 → первая арена', s3)

        # 4. босс мира 1 убит → карта перехода → ролик мира 2 → арена мира 2
        def s4(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(9), 'hw_cine': SEEN(1), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8); map_go(p)
            s = wait(p, lambda s: s['phase'] == 'fight' and s['wave'] == 10, 40); chk(title + ': бой с боссом мира 1 начался', s['phase'] == 'fight' and s['wave'] == 10, s)
            time.sleep(2.5); rec(p, True); t0 = time.time()
            while time.time() - t0 < 60:
                s = st(p)
                if s['video'] == 'world_02.mp4' and s['t'] > 0.8: break
                if s['win']: win(p, 'Забрать'); win(p, 'Дальше'); win(p, 'Продолжить')
                if s['phase'] == 'fight': p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)")
                time.sleep(0.4)
            chk(title + ': после босса — ролик мира 2', s['video'] == 'world_02.mp4', s)
            time.sleep(0.3); skip(p); wait(p, lambda s: not s['cine'] and not s['cover'] and not s['map'], 30); time.sleep(4); rec(p, False)
            analyze(title, frames(p), n); s = st(p); chk(title + ': мир 2', s['world'] == 2, s); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(4, 'босс убит → новый мир', s4)

        # 5. следующая арена того же мира: сохранение после волны 3 → «Продолжить» → арена 2 мира 1
        def s5(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(3), 'hw_cine': SEEN(10), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8); rec(p, True); map_go(p)
            wait(p, lambda s: not s['map'] and not s['cover'] and s['phase'] == 'fight', 30); time.sleep(3); rec(p, False)
            analyze(title + ' (вход на арену 2)', frames(p), n)
            p.evaluate("window.__god = setInterval(() => { P.hp = P.maxHp; }, 30)")      # герой проверки слабый — чтобы не погиб до конца раунда
            # раунд отбит → «Начать волну» → карта → следующая арена
            t0 = time.time()
            while time.time() - t0 < 40:
                s = st(p)
                if s['phase'] == 'rest' and s['wave'] >= 6: break
                if s['phase'] == 'fight': p.evaluate("for (const e of enemies.slice()) hurtEnemy(e, 1e9)")
                time.sleep(0.3)
            time.sleep(2.5); rec(p, True); p.evaluate("SHOP.startWave()"); s = wait(p, lambda s: s['map'] and s['go'] != 'none', 20); chk(title + ': после раунда — карта', s['map'], s)
            time.sleep(0.8); map_go(p); wait(p, lambda s: not s['map'] and not s['cover'] and s['phase'] == 'fight', 30); time.sleep(3); rec(p, False)
            analyze(title + ' (переход на арену 3)', frames(p), n)
            chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(5, 'следующая арена того же мира', s5)

        # 6. гибель → Междумирье → портал → назад на арену
        def s6(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(23), 'hw_cine': SEEN(10), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8); map_go(p)
            s = wait(p, lambda s: s['phase'] == 'fight', 30)
            if s['win']: win(p, 'Играть'); wait(p, lambda s: s['phase'] == 'fight', 20)
            time.sleep(2); g0 = st(p)['ground']; rec(p, True); p.evaluate("hurtPlayer(1e9)")
            s = wait(p, lambda s: s['win'] or s['limbo'], 20)
            if s['win']: win(p, 'В Междумирье')
            s = wait(p, lambda s: s['limbo'], 20); chk(title + ': герой в Междумирье', s['limbo'], s); time.sleep(2.5)
            p.evaluate("LIMBO.leave()")
            s = wait(p, lambda s: not s['limbo'], 25); chk(title + ': вернулся из Междумирья', not s['limbo'], s)
            s = wait(p, lambda s: s['map'] and s['go'] != 'none', 20); chk(title + ': после возвращения — карта (бой начинается с неё)', s['map'], s)
            time.sleep(0.8); map_go(p); wait(p, lambda s: not s['map'] and not s['cover'] and s['phase'] == 'fight', 30); time.sleep(3); rec(p, False); analyze(title, frames(p), n)
            s = st(p); chk(title + ': та же арена мира 3', s['world'] == 3 and s['ground'] == g0, [g0, s]); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(6, 'гибель → Междумирье → назад', s6)

        # 7. переигрывание пройденной главы: сохранение в мире 5, на карте выбираем главу 2
        def s7(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(40), 'hw_cine': SEEN(10), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8)
            chk(title + ': глава 2 выбирается на карте', p.evaluate("PATHMAP.pickAt(2)")); time.sleep(0.9); rec(p, True); map_go(p)
            wait(p, lambda s: not s['map'] and not s['cover'] and s['world'] == 2, 30); time.sleep(4); rec(p, False); analyze(title, frames(p), n)
            s = st(p); chk(title + ': мир 2', s['world'] == 2, s); chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(7, 'переигрывание пройденной главы', s7)

        # 8. пауза → «В главное меню» → снова «Продолжить» (страница перезагружается)
        def s8(n, title):
            p = page({'hw_lang': 'ru', 'hw_run_mage': save(40), 'hw_cine': SEEN(10), 'hw_hero': 'mage'})
            to_menu(p); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8); map_go(p)
            s = wait(p, lambda s: not s['map'] and not s['cover'] and s['world'] == 5, 30)
            if s['win']: win(p, 'Играть')
            time.sleep(3)
            p.evaluate("(() => { const b = [...document.querySelectorAll('.mb')].find(b => (b.dataset.ru || b.textContent) === 'В главное меню'); for (const t of ['pointerdown', 'pointerup', 'click']) b.dispatchEvent(new PointerEvent(t, { bubbles: true })); })()")
            time.sleep(1.5); s = wait(p, lambda s: s['menu'] == 'block' and not s['cine'], 40); chk(title + ': снова главное меню', s['menu'] == 'block', s)
            time.sleep(1.0); first_btn(p); wait(p, lambda s: s['map'] and s['go'] != 'none', 30); time.sleep(0.8); rec(p, True); map_go(p)
            wait(p, lambda s: not s['map'] and not s['cover'] and s['world'] == 5, 30); time.sleep(4); rec(p, False); analyze(title, frames(p), n)
            chk(title + ': без ошибок', not p.errs, p.errs); p.cx.close()
        run(8, 'выход в меню и снова «Продолжить»', s8)
        br.close()
finally:
    srv.terminate()
print('ГОТОВО: всё чисто' if not bad else 'КРАСНОЕ: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
