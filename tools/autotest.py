"""Автопрогон «вся игра за минуты». Одна команда, без ручных действий:  python tools/autotest.py
Открывает текущую сборку в headless Chrome (все миры открыты, время ускорено ботом tools/balance_bot.js), по вкладке на мир:
  1) бот проходит 10 волн мира — с мини-боссами и боссом; герой на входе — как в модели баланса (уровень, сумка, золото);
  2) полигон умений: каждый злодей, мини-босс и босс мира должен применить все свои умения с надписью;
  3) отдельная вкладка: сохранение и загрузка, покупка и сборка предметов, проверка файлов (листы, звуки, иконки).
Ловит ошибки JS, зависания, незагруженные файлы, медленные кадры; сверяет уровень и золото в конце мира с моделью баланса.
Отчёт и снимки боя (по одному на мир) — tests/report_<версия>/. Код выхода 0 — зелёный, 1 — красный (APK не собирать).
Сервер игры поднимает сам (порт 8766). Параметры: --worlds 1,2,3  --par 5  --keep (не закрывать сервер)"""
import sys, os, json, time, asyncio, argparse, subprocess, re, threading, http.server, socketserver, functools
sys.stdout.reconfigure(encoding='utf-8')
from playwright.async_api import async_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--worlds', default='1,2,3,4,5,6,7,8,9,10'); ap.add_argument('--par', type=int, default=5); ap.add_argument('--port', type=int, default=8766)
ap.add_argument('--armor', type=float, default=0.3); ap.add_argument('--skip-skills', action='store_true')
A = ap.parse_args()
WORLDS = [int(x) for x in A.worlds.split(',')]
VER = re.search(r"const V = '\?v=(\d+)'", open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()).group(1)
OUT = os.path.join(ROOT, 'tests', 'report_v' + VER); os.makedirs(OUT, exist_ok=True)
URL = f'http://localhost:{A.port}/'

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
class S(socketserver.ThreadingMixIn, http.server.HTTPServer): daemon_threads = True; allow_reuse_address = True; request_queue_size = 256   # очередь по умолчанию (5) при 10 вкладках давала отказы в соединении
srv = S(('127.0.0.1', A.port), functools.partial(H, directory=ROOT)); threading.Thread(target=srv.serve_forever, daemon=True).start()

# модель баланса: с чем герой приходит в каждый мир и что должно получиться в конце
M = json.loads(subprocess.run([sys.executable, os.path.join(ROOT, 'tools', 'balance_sim.py'), '--json'], capture_output=True, text=True, encoding='utf-8', cwd=ROOT).stdout)
MW = M['r']['worlds']   # строки «у босса мира» по порядку (круг 1 — первые 10)
RED, YEL, INFO = [], [], []
def red(w, t): RED.append((w, t)); print('  КРАСНОЕ', w, t, flush=True)
def yel(w, t): YEL.append((w, t))

def watch(page, tag, bag):
    page.on('pageerror', lambda e: bag['js'].append(str(e)[:300]))
    page.on('console', lambda m: bag['js'].append('console.error: ' + m.text[:300]) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
    page.on('requestfailed', lambda r: bag['net'].append(r.url.split('?')[0].replace(URL, '') + ' — ' + str(r.failure)[:60]) if 'ERR_ABORTED' not in str(r.failure) else None)
    page.on('response', lambda r: bag['net'].append(r.url.split('?')[0].replace(URL, '') + ' — ' + str(r.status)) if r.status >= 400 else None)

async def boot(ctx, q, bag):
    p = await ctx.new_page(); watch(p, q, bag)
    await p.goto(URL + '?v=%d&%s' % (int(time.time()), q), timeout=120000); await p.wait_for_function('window.COMBAT_READY === true', timeout=120000)   # с запасом: под нагрузкой (--par 10) страница грузится дольше 30 с; await asyncio.sleep(2.5)
    return p

async def world(br, w, res):
    bag = {'js': [], 'net': []}; r = res[w] = {'bag': bag, 'w': w}
    ctx = await br.new_context(viewport={'width': 960, 'height': 540})
    try:
        p = await boot(ctx, 'mode=play&allworlds', bag)
        await p.mouse.click(480, 270)
        await p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))"); await asyncio.sleep(1.5)
        await p.add_script_tag(path=os.path.join(ROOT, 'balance_model.js')); await p.add_script_tag(path=os.path.join(ROOT, 'tools', 'balance_bot.js'))
        # герой на входе в мир — как в модели в конце прошлого мира
        st = MW[w - 2] if w > 1 else {'lvl': 1, 'gold': 0, 'bagIds': []}
        await p.evaluate("""a => { const [w, lvl, gold, bag, armor] = a;
          P.lvl = lvl; P.xp = 0; P.stp = 3 * (lvl - 1); P.sp = lvl - 1; SHOP.gold = gold; SHOP.bag = bag.filter(id => ALL[id]); combineBag();
          wave = (w - 1) * 10; BOT.maxWave = w * 10; BOT.opt.armor = armor; SHOP.recompute(); P.hp = P.maxHp; }""", [w, st['lvl'], st['gold'], st['bagIds'], A.armor])
        t0 = time.time(); shot = False
        while True:
            s = await asyncio.wait_for(p.evaluate('BOT.run(1500)'), 180)
            if not shot and s['phase'] == 'fight' and s['wave'] % 10 >= 4 and await p.evaluate('enemies.filter(e => e.hp > 0).length >= 5 && !LIMBO.on'):
                await p.screenshot(path=os.path.join(OUT, 'world_%02d.png' % w)); shot = True
            if s['done']: break
            if time.time() - t0 > 900: red(w, 'бот не дошёл до конца мира за 15 минут (волна %d)' % s['wave']); break
        if not shot: await p.screenshot(path=os.path.join(OUT, 'world_%02d.png' % w))
        r['run'] = await p.evaluate("({ rounds: BOT.rounds, deaths: BOT.deaths, stuck: BOT.stuck, hang: BOT.hang, perf: BOT.perf, buys: BOT.buys, made: Object.keys(BOT.made), seen: BOT.seen, casts: BOT.casts, lvl: P.lvl, gold: SHOP.gold, bag: SHOP.bag.map(id => ALL[id].nm), wave, sec: 0 })")
        r['run']['sec'] = round(time.time() - t0)
        # полигон умений
        r['skills'] = []
        if not A.skip_skills:
            types = await p.evaluate("w => { const R = ROSTER[w]; return [...new Set([...R.mel, ...R.rng, ...R.elite])].map(t => [t, 0]).concat(R.mini.map(t => [t, 1]), [[R.boss, 0]]); }", w)
            await p.evaluate("w => { wave = (w - 1) * 10 + 8; if (WORLD !== w) applyWorld(w); }", w)
            for t, mini in types:
                try: r['skills'].append(await asyncio.wait_for(p.evaluate('a => BOT.skills(a[0], a[1], 150)', [t, mini]), 480))
                except Exception as ex: r['skills'].append({'type': t, 'want': [], 'miss': [], 'err': ['полигон: ' + str(ex)[:200]]})
        r['names'] = await p.evaluate("Object.fromEntries(Object.keys(KIND).map(k => [k, Array.isArray(KIND[k].nm) ? KIND[k].nm[0] : KIND[k].nm]))")
    except Exception as ex:
        red(w, 'прогон мира оборвался: ' + str(ex)[:300])
    finally:
        await ctx.close()
    print('мир', w, 'готов', flush=True)

async def extra(br, res):
    """сохранение и загрузка, покупка и сборка предметов, файлы"""
    bag = {'js': [], 'net': []}; r = res['x'] = {'bag': bag}
    ctx = await br.new_context(viewport={'width': 960, 'height': 540})
    try:
        async def start():
            p = await boot(ctx, 'allworlds', bag)
            await p.add_script_tag(path=os.path.join(ROOT, 'balance_model.js')); await p.add_script_tag(path=os.path.join(ROOT, 'tools', 'balance_bot.js'))
            await p.evaluate("(() => { const m = [...document.querySelectorAll('#mMain .b')].find(b => /Играть|Продолжить|Новая игра/.test(b.textContent)); m.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); })()"); await asyncio.sleep(1)
            if await p.evaluate("getComputedStyle(document.getElementById('hSel')).display") != 'none': await p.evaluate("document.querySelector('#hSel .go').dispatchEvent(new PointerEvent('pointerdown'))")
            await asyncio.sleep(1.5); return p
        p = await boot(ctx, 'allworlds', bag)
        await p.evaluate("() => { for (const k of Object.keys(localStorage)) if (/^hw_(run|prog|mapt)_/.test(k)) localStorage.removeItem(k); }"); await p.close()
        p = await start()
        await p.evaluate('BOT.opt.armor = 0.3; BOT.maxWave = 3')
        for i in range(40):
            s = await asyncio.wait_for(p.evaluate('BOT.run(1500)'), 180)
            if s['done']: break
        # предметы: части собираются в предмет; предмет со свитком докупается целиком
        r['items'] = await p.evaluate("""() => { const o = {}; SHOP.gold += 20000; const b0 = SHOP.bag.slice(); SHOP.bag = [];
          buyItem('sword'); buyItem('sword'); o.combine = SHOP.bag.join(',');                 // два меча -> Клинок воина
          SHOP.bag = []; o.scroll = buyItem('sange') && SHOP.bag.join(',');                   // предмет со свитком рецепта
          SHOP.bag = ['fang', 'blink', 'reaver', 'hyper', 'demonedge', 'mystic', 'fang', 'blink', 'reaver', 'hyper', 'demonedge', 'mystic'].slice(0, BAG_MAX); const g = SHOP.gold; o.full = BAG_MAX === 12 && buyItem('fang') === false && SHOP.bag.length === BAG_MAX; o.fullGold = SHOP.gold === g;   // полная сумка (v119: 12 мест): тринадцатая вещь не покупается
          SHOP.bag = ['blade']; const g2 = SHOP.gold; sellItem(0); o.sell = SHOP.gold - g2 === Math.floor(fullPrice('blade') / 2);
          SHOP.bag = ['blade', 'bracer', 'sange']; SHOP.gold = 777; SHOP.flasks.heal = 3; SHOP.flasks.mana = 2; SHOP.recompute(); SHOP.refresh(); SAVE.save(); return o; }   // это и сохраняем""")
        a = await p.evaluate("({ wave, gold: SHOP.gold, bag: SHOP.bag.slice(), lvl: P.lvl, heal: SHOP.flasks.heal, st: P.st, hp: Math.round(P.hp), saved: SAVE.read() })")
        await p.close()
        p = await start()   # «Продолжить» после перезапуска
        b = await p.evaluate("({ wave: SHOP.phase === 'fight' ? SHOP.roundFrom - 1 : wave, gold: SHOP.gold, bag: SHOP.bag.slice(), lvl: P.lvl, heal: SHOP.flasks.heal, st: P.st, hp: Math.round(P.hp), btn: 0 })")
        r['save'] = {'before': a, 'after': b}
        # файлы: звуки боссов, листы живых элементов, арены, иконки
        r['files'] = await p.evaluate("""async () => { const L = [], bad = [];
          for (const t in BOSSVO) { const v = BOSSVO[t]; if (v.g) L.push('sfx/bv/' + t + '_g.mp3'); (v.l || []).forEach((x, i) => L.push('sfx/bv/' + t + '_l' + (i + 1) + '.mp3')); for (const k in v.s) L.push('sfx/bv/' + t + '_s' + v.s[k] + '.mp3'); }
          for (const id in LOCFX.defs) L.push('ui/locfx/' + id + '.webp');
          for (const w of WORLDS) L.push(w.ground); for (const m in ARENAS) for (const a of ARENAS[m]) L.push(a);
          for (const id in RELICS) L.push('ui/relics/' + id + '.webp'); L.push('ui/items.webp', 'ui/icons.webp', 'ui/map/map.webp');
          for (const id in ALL) if (typeof ALL[id].img === 'string') L.push(ALL[id].img); L.push('fx/fx_ward_block.webp', 'fx/fx_lotus_reflect.webp'); for (const n in SFX_SETS) for (let i = 1; i <= SFX_SETS[n]; i++) L.push('sfx/' + n + '_' + i + '.mp3');   // картинки новых предметов (v100)
          for (const d of HSTAT.DEF) L.push('ui/status/' + d[0] + '.webp'); L.push('ui/status/star.webp', 'ui/status/dash.webp', 'manifest.json', 'ui/app/icon-180.png', 'ui/app/icon-192.png', 'ui/app/icon-512.png');
          await Promise.all(L.map(async u => { try { const x = await fetch(u, { method: 'HEAD' }); if (!x.ok) bad.push(u + ' — ' + x.status); else if (+x.headers.get('content-length') < 300) bad.push(u + ' — пустой файл'); } catch (e) { bad.push(u + ' — ' + e); } }));
          return { n: L.length, bad }; }""")
        # значки состояний: всё наложили разом — в ряду 8 плохих и хорошие, после снятия ряд пуст
        r['stat'] = await p.evaluate("""async () => { const hp = P.hp; P.hp = P.maxHp = 1e6; STATUS.add('stun', 3); STATUS.add('silence', 3); STATUS.add('blind', 3); STATUS.add('freeze', 3);
          for (const k of ['poison', 'burn', 'cold', 'shred']) STATUS.add(k, 2); slowHero(0.6, 3); slowHero(0, 1); P.ss.spd = 2; P.ss.noMiss = 2; P.ss.imm.sil = 1; P.ss.rshield = 1e9; P.ss.rshT = 2; HSTAT.show('fear', 2);
          combatUpdate(0.02); const on = HSTAT.list(); STATUS.clear(); P.slowT = 0; P.slowK = 1; HSTAT.show('fear', 0);
          combatUpdate(0.02); return { on, off: HSTAT.list() }; }""")
        # рывок: сдвигает героя на 250, во время рывка урон не проходит, перезарядка идёт; под оглушением — нельзя
        r['dash'] = await p.evaluate("""() => { const o = {}; P.dead = 0; P.hp = P.maxHp = 1e6; P.cd.dash = 0; P.face = { x: 1, y: 0 }; stick.active = false; const x0 = P.x;
          o.go = cast('dash') === true; for (let i = 0; i < 4; i++) combatUpdate(0.02); const hp = P.hp; hurtPlayer(500); o.inv = P.hp === hp;
          for (let i = 0; i < 20; i++) combatUpdate(0.02); o.dx = Math.round(Math.abs(P.x - x0)); o.cd = P.cd.dash > 4;
          P.cd.dash = 0; STATUS.add('stun', 2); o.stun = cast('dash') === false && !!DASH.why(); STATUS.clear(); P.cd.dash = 0; return o; }""")
        r['ver'] = await p.evaluate("({ v: V, lvlMax: LVL_MAX, k: BAL.K })")
    except Exception as ex:
        red('общее', 'проверка сохранения/предметов/файлов оборвалась: ' + str(ex)[:300])
    finally:
        await ctx.close()
    print('сохранение, предметы, файлы — готово', flush=True)

async def main():
    res = {}
    async with async_playwright() as pw:
        br = await pw.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        sem = asyncio.Semaphore(A.par)
        async def one(w):
            async with sem: await world(br, w, res)
        await asyncio.gather(extra(br, res), *[one(w) for w in WORLDS])
        await br.close()
    return res

t00 = time.time(); res = asyncio.run(main()); srv.shutdown()
# ---------- разбор ----------
L = ['# Автопрогон v' + VER, '', time.strftime('%d.%m.%Y %H:%M') + f' · миры: {A.worlds} · время прогона {round(time.time() - t00)} с · «броня испытателя» ×{A.armor} (бот не игрок: сложность эта проверка не меряет)', '']
tab = ['| Мир | Волн | Смертей | Застрял | Уровень: вход → выход (модель) | Золото за мир (модель) | Покупок | Кадр ср./макс., мс | Умения | Время, с |', '|---|---|---|---|---|---|---|---|---|---|']
for w in WORLDS:
    r = res.get(w) or {}; run = r.get('run'); bag = r.get('bag', {'js': [], 'net': []})
    for e in sorted(set(bag['js'])): red(w, 'ошибка JS: ' + e)
    for e in sorted(set(bag['net'])): red(w, 'не загрузился файл: ' + e)
    if not run: continue
    m = MW[w - 1]; lvl0 = MW[w - 2]['lvl'] if w > 1 else 1
    if run['wave'] < w * 10: red(w, f"пройдено волн до {run['wave']} из {w * 10}")
    for h in run['hang']: red(w, f"зависание: волна {h['wave']} не кончалась 12 игровых минут (остались: {', '.join(sorted(set(h['left']))) or 'никого'}, в очереди {h['queue']}; {h.get('why', '')})")
    if run['stuck']: yel(w, f"бот не смог пройти {run['stuck']} раунд(а) даже с бронёй ×{A.armor} — пропущены")
    if abs(run['lvl'] - m['lvl']) > 3: red(w, f"уровень в конце мира {run['lvl']}, по модели {m['lvl']}")
    inc = sum(x['gold1'] - x['gold'] for x in run['rounds'])
    if not run['stuck'] and abs(inc - m['coin']) > 0.35 * m['coin']: red(w, f"золото за мир {inc}, по модели {m['coin']} (без сундуков)")
    perf = run['perf']; avg = perf['sum'] / max(1, perf['n'])
    if avg > 25: red(w, f"кадр в среднем {avg:.0f} мс (медленнее 40 кадров/с даже без телефона)")
    elif perf['slow'] / max(1, perf['n']) > 0.03: yel(w, f"{100 * perf['slow'] / perf['n']:.1f} % кадров дольше 50 мс (макс. {perf['max']:.0f} мс)")
    R = None
    need = set()
    miss = []; nsk = 0
    for s in r.get('skills', []):
        nm = r['names'].get(s['type'], s['type']); nsk += len(s['want'])
        for e in s['err']: red(w, f"полигон, {nm}: {e}")
        if s['miss']: miss.append(f"{nm}: {', '.join(s['miss'])}")
    for x in miss: red(w, 'умение не применено — ' + x)
    kinds = {k for k in run['seen']}
    tab.append(f"| {w} | {run['wave'] - (w - 1) * 10} | {run['deaths']} | {run['stuck']} | {lvl0} → {run['lvl']} ({m['lvl']}) | {inc} ({m['coin']}) | {run['buys']} | {avg:.1f} / {perf['max']:.0f} | {nsk - sum(len(s['miss']) for s in r.get('skills', []))} из {nsk} | {run['sec']} |")
x = res.get('x') or {}
for e in sorted(set(x.get('bag', {}).get('js', []))): red('общее', 'ошибка JS: ' + e)
for e in sorted(set(x.get('bag', {}).get('net', []))): red('общее', 'не загрузился файл: ' + e)
if 'save' in x:
    a, b = x['save']['before'], x['save']['after']
    for k in ('wave', 'gold', 'bag', 'lvl', 'heal', 'st'):
        if a[k] != b[k]: red('общее', f"сохранение: {k} до перезапуска {a[k]}, после {b[k]}")
    if not a['saved']: red('общее', 'сохранение: запись в хранилище пуста')
    L.append(f"Сохранение и загрузка: волна {a['wave']}, уровень {a['lvl']}, золото {a['gold']}, сумка {len(a['bag'])} — после перезапуска " + ('то же самое.' if all(a[k] == b[k] for k in ('wave', 'gold', 'bag', 'lvl', 'heal', 'st')) else 'ОТЛИЧАЕТСЯ.'))
if 'items' in x:
    it = x['items']
    if it['combine'] != 'blade': red('общее', 'предметы: два Меча ученика не собрались в Клинок воина (в сумке: %s)' % it['combine'])
    if it['scroll'] != 'sange': red('общее', 'предметы: Клинок Силы со свитком не купился целиком (в сумке: %s)' % it['scroll'])
    if not it['full'] or not it['fullGold']: red('общее', 'предметы: полная сумка — лишняя часть купилась или золото списалось неверно')
    if not it['sell']: red('общее', 'предметы: продажа не за полцены')
    L.append('Предметы: части собираются, свиток докупается, полная сумка не переполняется, продажа за полцены — ' + ('в порядке.' if it['combine'] == 'blade' and it['scroll'] == 'sange' and it['full'] and it['fullGold'] and it['sell'] else 'ЕСТЬ ОШИБКИ.'))
if 'stat' in x:
    st = x['stat']; want = 'stun,freeze,root,silence,blind,poison,burn,cold,shield,haste,immune,clarity'
    if ','.join(st['on']) != want: red('общее', 'значки состояний: в ряду %s, а должно быть %s' % (','.join(st['on']), want))
    if st['off']: red('общее', 'значки состояний: после снятия остались ' + ','.join(st['off']))
    L.append('Значки состояний: всё наложено разом — в ряду ' + str(len(st['on'])) + ' значков в нужном порядке, после снятия ряд пуст' + ('.' if ','.join(st['on']) == want and not st['off'] else ' — НЕТ.'))
if 'dash' in x:
    d = x['dash']; ok = d['go'] and d['inv'] and d['cd'] and d['stun'] and d['dx'] > 60
    if not ok: red('общее', 'рывок: ' + json.dumps(d))
    L.append('Рывок: герой сдвинулся на %d, урон во время рывка не прошёл, перезарядка пошла, под оглушением нельзя' % d['dx'] + ('.' if ok else ' — НЕТ.'))
if 'files' in x:
    for e in x['files']['bad']: red('общее', 'файл: ' + e)
    L.append(f"Файлы (звуки боссов, живые элементы, арены, иконки): проверено {x['files']['n']}, плохих {len(x['files']['bad'])}.")
made = sorted({i for w in WORLDS for i in (res.get(w, {}).get('run') or {}).get('made', [])})
if WORLDS and not made: red('общее', 'бот за весь прогон не собрал ни одного предмета')
L.append(f"Собранные ботом предметы: {len(made)}.")
w10 = (res.get(10) or {}).get('run')
if w10: L.append(f"Уровень в конце мира 10: {w10['lvl']} (цель — около 100).")
L += ['', '## Итог: ' + ('ЗЕЛЁНЫЙ — можно собирать APK' if not RED else f'КРАСНЫЙ — {len(RED)} проблем(ы), APK не собирать'), '']
if RED: L += ['### Что сломалось'] + [f"- мир {w}: {t}" if isinstance(w, int) else f"- {w}: {t}" for w, t in RED] + ['']
if YEL: L += ['### На заметку'] + [f"- мир {w}: {t}" if isinstance(w, int) else f"- {w}: {t}" for w, t in YEL] + ['']
L += ['## По мирам', ''] + tab + ['', 'Снимки боя: ' + ', '.join('world_%02d.png' % w for w in WORLDS)]
open(os.path.join(OUT, 'report.md'), 'w', encoding='utf-8').write('\n'.join(L) + '\n')
json.dump({k: v for k, v in res.items()}, open(os.path.join(OUT, 'report.json'), 'w', encoding='utf-8'), ensure_ascii=False, default=str)
print('\n'.join(L)); print('\nОтчёт:', os.path.join(OUT, 'report.md'))
sys.exit(1 if RED else 0)
