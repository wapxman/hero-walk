"""Модель забега для баланса магазина: золото по раундам, жадная закупка предметов (items.js), сила героя
против рядовых и боссов в каждом мире. usage: python tools/balance_run.py [множитель_цен]"""
import sys, re, json
sys.stdout.reconfigure(encoding='utf-8')
PM = float(sys.argv[1]) if len(sys.argv) > 1 else 1.0
GM = float(sys.argv[2]) if len(sys.argv) > 2 else 0.4   # множитель золота за убийства
src = open('items.js', encoding='utf-8').read()
def grab(name):
    body = src[src.index('const ' + name + ' = {'):]; body = body[:body.index('\n};') + 3]
    items = {}
    for m in re.finditer(r"^\s+(\w+): \{ nm: '([^']+)', ic: \d+, (?:pr: (\d+), )?(?:from: \[([^\]]+)\], )?st: \{ ([^}]*) \}", body, re.M):
        st = {k: float(v) for k, v in re.findall(r"(\w+): ([\d.]+)", m.group(5))}
        items[m.group(1)] = {'nm': m.group(2), 'pr': int(m.group(3)) if m.group(3) else None,
                             'from': [x.strip(" '") for x in m.group(4).split(',')] if m.group(4) else None, 'st': st}
    return items
PARTS, RECIPES = grab('PARTS'), grab('RECIPES'); ALL = {**PARTS, **RECIPES}
def full(i): return round(PARTS[i]['pr'] * PM) if i in PARTS else sum(full(x) for x in RECIPES[i]['from'])
def need(l): return round(30 + 20 * l + 0.5 * l * l)
def at(n): m = (n - 1) % 40; return (n - 1) // 40 + 1, m // 10 + 1, m % 10 + 1
def mw(n): C, M, W = at(n); return M + 4 * (C - 1)
def wk(n, k1, k2): m = mw(n); return k1 ** (min(m, 4) - 1) * k2 ** max(0, m - 4)
def hpm(n): return 1.07 ** (at(n)[2] - 1) * wk(n, 1.35, 1.12)
def dmm(n): return 1.055 ** (at(n)[2] - 1) * wk(n, 1.28, 1.1)
def xpm(n): return 1.05 ** (at(n)[2] - 1) * 1.2 ** (mw(n) - 1)
def gom(n): return 1.04 ** (at(n)[2] - 1) * wk(n, 1.25, 1.1)
def count(n): C, M, W = at(n); return 12 + 3 * (W - 1) + 4 * (M - 1)
def elites(n): W = at(n)[2]; return 0 if W < 4 else 1 if W < 7 else 2
def stats(bag):
    S = dict.fromkeys(['dmg', 'hp', 'mp', 'as', 'spd', 'hpr', 'mpr', 'arm', 'sk', 'cd', 'ls', 'crit'], 0.0)
    for i in bag:
        for k, v in ALL[i]['st'].items(): S[k] += v
    return S
def hero(L, bag):
    S = stats(bag); s = 3 * (L - 1) * 0.3; a = 3 * (L - 1) * 0.3
    dmg = 50 * (1 + S['dmg']) * (1 + 0.015 * (L - 1)) * (1 + 0.006 * s)
    dps = dmg * (1 + min(.4, S['crit'])) * (1 / 0.62) * (1 + 0.015 * a) * (1 + min(.6, S['as'])) * (1.45 + S['sk'] * 0.45)   # умения ≈ +45 %
    hp = 600 + 10 * (L - 1) + 8 * s + S['hp']
    ehp = hp / (1 - min(.6, S['arm'])) + (5 + S['hpr']) * 20 + dps * S['ls'] * 20
    return dmg, dps, hp, ehp
def score(bag, L): d = hero(L, bag); return d[1] * d[3]
gold, lvl, xp, bag, n, rows = 0, 1, 0, [], 0, []
def add_xp(v):
    global lvl, xp
    xp += v
    while lvl < 100 and xp >= need(lvl): xp -= need(lvl); lvl += 1
def shop():
    """жадно: покупаем то, что сильнее всего поднимает силу за потраченное золото"""
    global gold, bag
    while True:
        best = None
        for i in ALL:
            if i in bag: continue
            have = list(bag); cost = 0
            def plan(x):
                nonlocal cost
                if x in have: have.remove(x); return
                if x in PARTS: cost += round(PARTS[x]['pr'] * PM); return
                for f in RECIPES[x]['from']: plan(f)
            plan(i)
            nb = have + [i]
            if len(nb) > 6 or cost > gold - 60 or cost == 0: continue      # 60 — на фласки
            gain = (score(nb, lvl) / score(bag, lvl) - 1) / cost
            if not best or gain > best[0]: best = (gain, i, nb, cost)
        if not best or best[0] <= 0: break
        gold -= best[3]; bag = best[2]
for rnd in range(56):           # 4 мира по 4 раунда (3+3+3+босс) + круг 2
    n0 = n + 1; C, M, W = at(n0)
    last = n0 if W == 10 else n0 + 2
    for w in range(n0, last + 1):
        C, M, W = at(w)
        if W == 10: add_xp(150 * xpm(w) / 1.05 ** 9); gold += 100 * wk(w, 1.5, 1.1)
        else:
            k = count(w); add_xp((0.6 * 8 + 0.2 * 18 + 0.2 * 14) * k * xpm(w) + elites(w) * 3 * 13 * xpm(w))
            gold += GM * (8.0 * k * gom(w) + elites(w) * 4 * 10 * gom(w)) + 20 + 6 * W + 10 * (M - 1)
    n = last
    gold -= 40          # фласки
    shop()
    C, M, W = at(n)
    if (W == 10 or (M == 1 and C == 1 and W in (3, 9))) and C <= 2:
        dmg, dps, hp, ehp = hero(lvl, bag)
        zhp, zdm = 120 * hpm(n), 11 * dmm(n)
        bhp, bdps = 1500 * hpm(n) * 1.45 * wk(n, 1.68, 1.1), 45 * dmm(n) * wk(n, 1.17, 1.05) / 2.2 * 1.6
        rows.append(f"| {'К2 · ' if C == 2 else ''}М{M} / В{W} | {lvl} | {round(gold)} | {len(bag)}: {', '.join(ALL[i]['nm'] for i in bag)} | {round(dmg)} | {round(dps)} | {round(hp)} | {zhp / dmg:.1f} | {bhp / dps:.0f} с | {ehp / bdps:.0f} с |")
print(f"Множитель цен: {PM}, золота за убийства: {GM}")
print("| Мир / волна | Уровень | Золото в запасе | Сумка | Выстрел | Урон/с | HP | Выстрелов на зомби | Босс падает за | Босс убьёт героя за |")
print("|---|---|---|---|---|---|---|---|---|---|")
print('\n'.join(rows))
print('\nЦены предметов:', ', '.join(f"{RECIPES[i]['nm']} {full(i)}" for i in RECIPES))
