"""Таблица баланса (BALANCE.md): враги по мирам и волнам, ожидаемый уровень и сила героя.
Формулы те же, что в data.js (BAL). Запуск: python tools/balance_sim.py > BALANCE_table.txt"""
import sys
sys.stdout.reconfigure(encoding='utf-8')
XP_KILL = {'min': 8, 'war': 18, 'mag': 14, 'rog': 14}
MIX = {'min': .6, 'war': .2, 'mag': .1, 'rog': .1}
GOLD = {'min': 6, 'war': 13, 'mag': 11, 'rog': 11}
def need(l): return round(30 + 20 * l + 0.5 * l * l)
def hpm(W, M, C=1): return 1.07 ** (W - 1) * 1.35 ** (M - 1) * 1.8 ** (C - 1)
def dmm(W, M, C=1): return 1.055 ** (W - 1) * 1.28 ** (M - 1) * 1.5 ** (C - 1)
def xpm(W, M, C=1): return 1.05 ** (W - 1) * 1.20 ** (M - 1) * 1.3 ** (C - 1)
def gom(W, M): return 1.04 ** (W - 1) * 1.25 ** (M - 1)
def count(W, M): return 12 + 3 * (W - 1) + 4 * (M - 1)
def elites(W): return 0 if W < 4 else 1 if W < 7 else 2
st = {'lvl': 1, 'xp': 0, 'gold': 0}
def add(n):
    st['xp'] += n
    while st['lvl'] < 100 and st['xp'] >= need(st['lvl']): st['xp'] -= need(st['lvl']); st['lvl'] += 1
def hero(L, gold):
    stat = 3 * (L - 1); s = stat * 0.3
    shop = min(1 + gold / 9000, 2.2)           # примерно: магазин — до ×2,2 к урону к концу 4-го мира
    hp = 600 + 10 * (L - 1) + 8 * s + min(gold / 25, 700)
    dmg = 50 * (1 + 0.015 * (L - 1)) * (1 + 0.006 * s) * shop
    return round(hp), round(dmg)
print('| Мир / волна | Рядовой (зомби) HP / удар | Элита HP / удар | Босс HP / удар | Уровень героя | HP героя | Выстрел героя |')
print('|---|---|---|---|---|---|---|')
for C in (1, 2):
    for M in range(1, 5):
        for W in range(1, 11):
            if W < 10:
                base = sum(XP_KILL[k] * MIX[k] for k in MIX)
                add(base * count(W, M) * xpm(W, M, C) + elites(W) * 3 * 8 * xpm(W, M, C))
                st['gold'] += sum(GOLD[k] * MIX[k] for k in MIX) * count(W, M) * gom(W, M) + elites(W) * 4 * 6 * gom(W, M) + 20 + 6 * W + 10 * (M - 1)
            else:
                add(150 * 1.2 ** (M - 1) * 1.3 ** (C - 1)); st['gold'] += 100 * 1.5 ** (M - 1)
            show = (C == 1 and ((M == 1 and W in (1, 5, 9)) or W == 10)) or (C == 2 and M in (1, 4) and W == 10)
            if not show: continue
            Wr = min(W, 9)
            z = f"{round(120 * hpm(Wr, M, C))} / {round(11 * dmm(Wr, M, C))}"
            el = f"{round(120 * 3.5 * hpm(Wr, M, C))} / {round(11 * 1.7 * dmm(Wr, M, C))}" if Wr >= 4 else '—'
            b = f"{round(1500 * hpm(10, M, C))} / {round(45 * dmm(10, M, C))}" if W == 10 else '—'
            h = hero(st['lvl'], st['gold'] if C == 1 else 21000)
            name = (f"Круг 2 · " if C == 2 else '') + f"М{M} / В{W}"
            print(f"| {name} | {z} | {el} | {b} | {st['lvl']} | {h[0]} | {h[1]} |")
