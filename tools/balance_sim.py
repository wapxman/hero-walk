"""Баланс Duel Arena: таблица забега по 10 мирам (и второй круг) на настоящих данных игры.
1) собирает balance_data.js — враги миров (roster.js: KIND, ROSTER) и предметы (items.js, relics.js);
2) запускает модель balance_model.js в node с формулами BAL (data.js) и кривой опыта BAL.need (data.js);
3) печатает таблицы в Markdown (их копия — в BALANCE.md).
Запуск из корня проекта: python tools/balance_sim.py [--k hp=1,dmg=1,xp=1,gold=1,price=1,all=1] [--build 1,1,1] [--flasks 2]"""
import sys, os, json, subprocess, argparse
sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ap = argparse.ArgumentParser(); ap.add_argument('--k', default=''); ap.add_argument('--build', default='1,1,1'); ap.add_argument('--flasks', type=float, default=2); ap.add_argument('--json', action='store_true')
A = ap.parse_args()
K = {k: float(v) for k, v in (x.split('=') for x in A.k.split(',') if x)}
JS = r"""
const fs = require('fs'), path = require('path'), ROOT = process.argv[1], OPT = JSON.parse(process.argv[2]);
const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const cut = (s, a, b) => { s = s.slice(s.indexOf(a)); return s.slice(0, s.indexOf(b) + b.length); };
const VILLAINS = undefined;
let combat = rd('roster.js').replace("'use strict';", '');
const SHOP = {}, window = {};
let items = rd('items.js'); items = items.slice(items.indexOf('const PARTS = {'), items.indexOf('const ALL = '));
let rel = rd('relics.js'); rel = cut(rel, 'const RELICS = {', '\n};');
const P = { ss: { imm: {} } };
eval(cut(rd('data.js'), 'const BAL = {', '\n};') + '\n' + combat + '\n' + items + '\n' + rel + '\n' + rd('progress.js').match(/const xpNeedP = .*/)[0] +
  ';Object.assign(globalThis, { BAL, KIND, ROSTER, miniOf, PARTS, RECIPES, RELICS, xpNeedP });');
// ---- balance_data.js ----
const avg = a => (a[0] + a[1]) / 2;
function kind(id) {
  const k = KIND[id], nm = Array.isArray(k.nm) ? k.nm[0] : k.nm;
  const o = { id, nm, hp: k.hp, xp: k.xp || 8, gold: k.gold || 8, hit: avg(k.dmg), dps: +(avg(k.dmg) * (k.fan || 1) / k.cd).toFixed(1) };
  if (k.elite) o.elite = 1; if (k.rng) o.rng = 1;
  if (k.boss) {   // урон босса в секунду: удары (60 % времени) + умения (половина попаданий; зона — 2 с из своего времени)
    let d = avg(k.dmg) / k.cd * 0.6;
    for (const s of k.spells || []) d += 0.5 * ((s.hit || 0) + (s.tick ? (s.pdmg || s.dmg) * 2 / s.tick : s.dmg) * (s.how === 'multi' ? 3 : 1)) / s.cd;
    o.dps = +d.toFixed(1);
  }
  return o;
}
const worlds = []; for (let m = 1; m <= 10; m++) { const R = ROSTER[m]; worlds.push({ mel: R.mel.map(kind), rng: R.rng.map(kind), elite: R.elite.map(kind), mini: [3, 6, 9].map(W => kind(miniOf(R, W))), boss: kind(R.boss) }); }
const its = {};
for (const id in PARTS) { const p = PARTS[id]; its[id] = { nm: p.nm, pr: p.pr, st: p.st }; if (p.rcp) its[id].rcp = 1; else if (p.pr <= 700 && id !== 'fang') its[id].chest = 1; if (p.act || p.pas) its[id].fx = 1; }
for (const id in RECIPES) { const r = RECIPES[id]; its[id] = { nm: r.nm, from: r.from, st: r.st }; if (r.act || r.pas) its[id].fx = 1; }
for (const id in RELICS) { const r = RELICS[id]; its[id] = { nm: r.nm, pr: r.pr, st: r.st || {}, relic: 1, boss: r.boss }; }
const D = { worlds, items: its };
fs.writeFileSync(path.join(ROOT, 'balance_data.js'), '// Создано tools/balance_sim.py из roster.js, items.js и relics.js: враги миров и предметы для модели баланса.\nconst BAL_DATA = ' + JSON.stringify(D) + ';\n');
// ---- модель ----
const M = require(path.join(ROOT, 'balance_model.js'));
if (BAL.tune) BAL.tune(OPT.k);
const r = M.run({ BAL, D, need: xpNeedP, waves: 200, build: OPT.build, flasks: OPT.flasks, lvlMax: 200 });
const prices = {}; for (const id in its) if (!its[id].rcp) prices[its[id].nm] = M.full(id, D, BAL.price || (p => p));
console.log(JSON.stringify({ r, prices, K: BAL.K || null, need: [1, 10, 25, 50, 75, 100, 150, 199].map(l => [l, xpNeedP(l)]) }));
"""
opt = {'k': K, 'build': [float(x) for x in A.build.split(',')], 'flasks': A.flasks}
p = subprocess.run(['node', '-e', JS, ROOT, json.dumps(opt)], capture_output=True, text=True, encoding='utf-8', cwd=ROOT)
if p.returncode: print(p.stderr); sys.exit(1)
R = json.loads(p.stdout)
if A.json: print(json.dumps(R, ensure_ascii=False)); sys.exit(0)
f0 = lambda v: f"{v:,.0f}".replace(',', ' ')
print(f"Множители: {R['K']}; очки характеристик (сила : ловкость : интеллект) = {A.build}; фласок лечения за раунд: {A.flasks}\n")
print('Опыт до следующего уровня: ' + ', '.join(f"{l} → {f0(x)}" for l, x in R['need']) + '\n')
print('| Мир | Босс | Уровень | Доход за мир | Выстрел | Урон/с | HP героя | Выстрелов на рядового | Удар рядового | Мини-босс (3-й) падает за | Босс падает за | Босс убьёт стоящего героя за | Фласка |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
rows = R['r']['rows']
for w in R['r']['worlds']:
    mini = next(x for x in rows if x['n'] == w['n'] - 1)
    print(f"| {'К2 · ' if w['C'] == 2 else ''}{w['M']} | {w['boss']} | {w['lvl']} | {f0(w['inc'])} | {w['shot']:.0f} | {f0(w['dps'])} | {f0(w['hp'])} | {w['shots']:.1f} | {w['regHit']:.0f} | {mini['miniT']:.0f} с | {w['bossT']:.0f} с | {w['dieT']:.0f} с | {w['flask']} |")
print('\nСумка к боссу каждого мира (круг 1):')
for w in R['r']['worlds'][:10]: print(f"- мир {w['M']}: {', '.join(w['bag'])} · в запасе {f0(w['gold'])}")
print('\nЦены предметов: ' + ', '.join(f"{k} {v}" for k, v in sorted(R['prices'].items(), key=lambda x: x[1])))
