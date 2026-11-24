# -*- coding: utf-8 -*-
"""Эффекты героев работают и видны (v119): у обоих героев обычный удар, четыре умения и рывок. Для каждого: умение применилось
(мана и перезарядка), подействовало (урон по мишени или своё действие) и на экране что-то появилось (сравнение кадров с покоем).
Умения злодеев, мини-боссов и боссов проверяет полигон автопрогона (tools/autotest.py, столбец «Умения»), предметы —
tools/audit/items_test.py. Снимки — tests/fx/. Сервер поднимает сам (порт 8780). Код выхода 1 — если что-то не прошло."""
import sys, os, time, io, subprocess
sys.stdout.reconfigure(encoding='utf-8', line_buffering=True)
from playwright.sync_api import sync_playwright
from PIL import Image, ImageChops
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); PORT = 8780
OUT = os.path.join(ROOT, 'tests', 'fx'); os.makedirs(OUT, exist_ok=True)
bad = []
def chk(name, ok, extra=''):
    print(('  да   ' if ok else '  НЕТ  ') + name + (('  ' + str(extra)[:300]) if extra and not ok else ''))
    if not ok: bad.append(name)
PD = "dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))"
CLIP = {'x': 240, 'y': 60, 'width': 800, 'height': 420}      # середина экрана: герой и мишень, без кнопок и полосок
def frame(p): return Image.open(io.BytesIO(p.screenshot(clip=CLIP))).convert('RGB')
def diff(a, b):
    d = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 40 else 0); return d.histogram()[255] / (d.width * d.height)
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', '--directory', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    with sync_playwright() as pw:
        b = pw.chromium.launch(); p = b.new_page(viewport={'width': 1280, 'height': 600}); errs = []; p.on('pageerror', lambda e: errs.append(str(e)[:300]))
        p.goto('http://127.0.0.1:%d/index.html?levels' % PORT, timeout=120000); p.wait_for_function("typeof LEVEL !== 'undefined' && !!document.getElementById('lvPick')", timeout=120000); time.sleep(1)
        p.evaluate("[...document.querySelectorAll('#lvPick .b')][0]." + PD); time.sleep(1)
        p.wait_for_function("typeof LEVEL !== 'undefined' && getComputedStyle(document.getElementById('hSel')).display === 'flex'", timeout=120000); time.sleep(1.5)
        p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); p.wait_for_function("SHOP.phase === 'fight' && enemies.length > 0", timeout=30000); time.sleep(1)
        RESET = ("enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = 199; ROUND.mini = null; shots.length = 0; fx.length = 0; zones.length = 0; window.HARD_OFF = 1; SHOP.phase = 'fight'; P.dead = 0; STATUS.clear(); "
                 "P.hp = P.maxHp = 1e6; P.mp = P.maxMp; P.ult = 0; for (const k in P.cd) P.cd[k] = 0; P.atkCd = 0; P.act = null; "
                 "for (let i = 0; i < 3; i++) { spawnEnemyBase('v_butcher'); const e = enemies[i]; e.x = P.x + 210 + 40 * i; e.y = P.y + (i - 1) * 70; e.speed = 0; e.atkCd = 1e9; e.skBusy = 1e9; e.sk = []; e.hp = e.max = 1e7; } P.face = { x: 1, y: 0 }; 1")
        ST = "({ mp: P.mp, cd: Object.assign({}, P.cd), hp: enemies.reduce((a, e) => a + e.hp, 0), n: shots.length + fx.length + zones.length + SK.PR.length, ult: P.ult || 0, act: P.act && P.act.anim, x: P.x, dashI: P.dashI || 0, st: enemies.map(e => (e.root > 0 ? 'root ' : '') + (e.slowT > 0 ? 'slow ' : '') + (e.silT > 0 ? 'sil' : '')).join('|') })"
        for hero in ('mage', 'archer'):
            p.evaluate("(h) => { setHero(h); for (const k of ['q', 'e', 'f', 'r', 'dash']) P.skLv[k] = 1; SHOP.recompute(); }", hero); time.sleep(2.5)
            nm = p.evaluate("HEROES[HERO_ID].name"); sk = p.evaluate("HEROES[HERO_ID].skills.map(s => s.split(' — ')[0])"); print(nm)
            p.evaluate(RESET); time.sleep(0.8); a0 = frame(p); time.sleep(0.5); a1 = frame(p); idle = diff(a0, a1)
            for i, k in enumerate(['atk', 'q', 'e', 'f', 'r', 'dash']):
                title = 'Рывок' if k == 'dash' else sk[i]
                passive = hero == 'archer' and k == 'r'
                p.evaluate(RESET); time.sleep(0.7); s0 = p.evaluate(ST); base = frame(p)
                if passive:
                    p.evaluate("enemies.forEach(e => { e.x = P.x + 760; }); 1"); time.sleep(0.6)      # «Верный глаз» действует, когда рядом с лучницей нет врагов
                    s = p.evaluate("({ on: markK() > 1, k: markK(), range: markRange(), mark: !!P.mark, lv: P.skLv.r })")
                    chk('%s: «%s» — пассивное умение, действует (урон ×%.2f, дальность ×%.2f)' % (nm, title, s['k'], s['range']), s['on'], s); continue
                ok_cast = p.evaluate("(k) => { if (k === 'atk') { shoot(); return true; } return cast(k) !== false; }", k)
                mx = 0; seen = set(); hp_min = s0['hp']; mp_min = s0['mp']; st_seen = ''; moved = 0; best = None
                for j in range(14):
                    time.sleep(0.12); f = frame(p); d = diff(base, f)
                    if d > mx: mx = d; best = f
                    s = p.evaluate(ST); hp_min = min(hp_min, s['hp']); mp_min = min(mp_min, s['mp']); st_seen = st_seen or s['st'].replace('|', ''); moved = max(moved, abs(s['x'] - s0['x']))
                    if s['n'] > s0['n']: seen.add('объекты')
                    if s['act']: seen.add(s['act'])
                    if s['ult'] > 0: seen.add('буря')
                s1 = p.evaluate(ST)
                if best: best.save(os.path.join(OUT, '%s_%s.png' % (hero, k)))
                used = (k == 'atk') or s1['cd'].get(k, 0) > 0
                mana = k in ('atk', 'dash') or mp_min < s0['mp'] - 1
                effect = hp_min < s0['hp'] - 0.5 or bool(st_seen) or (k == 'dash' and moved > 150) or s1['ult'] > 0 or 'объекты' in seen or len(seen) > 0
                visible = mx > idle + 0.012
                chk('%s: «%s» — применяется, действует, виден на экране (изменилось %.1f %% кадра, в покое %.1f %%)' % (nm, title, mx * 100, idle * 100),
                    ok_cast and used and mana and effect and visible, { 'мана': round(s0['mp'] - mp_min), 'cast': ok_cast, 'cd': s1['cd'].get(k), 'урон': round(s0['hp'] - hp_min), 'состояния': st_seen, 'сдвиг': round(moved), 'виден': round(mx, 4), 'покой': round(idle, 4), 'видел': sorted(seen) })
        chk('ошибок страницы нет', not errs, errs[:3]); b.close()
finally:
    srv.terminate()
print('ИТОГ:', 'все проверки прошли' if not bad else 'НЕ ПРОШЛО: ' + '; '.join(bad))
sys.exit(1 if bad else 0)
