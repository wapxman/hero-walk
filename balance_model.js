// Модель забега для баланса: опыт, золото, покупки и сила героя против врагов каждого мира.
// Одна и та же модель считает таблицу BALANCE.md (tools/balance_sim.py запускает её в node) и показывает цифры
// в редакторе баланса (editor/balance.html). Формулы роста врагов — BAL из data.js, кривая опыта — xpNeedP (progress.js),
// враги и предметы — balance_data.js (его пишет tools/balance_sim.py из roster.js, items.js и relics.js).
'use strict';
const BALMODEL = (() => {
  const KEYS = ['dmg', 'hp', 'mp', 'as', 'spd', 'hpr', 'mpr', 'arm', 'sk', 'cd', 'ls', 'crit'];
  function bagStats(bag, ALL) {
    const S = {}; for (const k of KEYS) S[k] = 0;
    for (const id of bag) { const st = ALL[id] && ALL[id].st; if (st) for (const k in st) S[k] += st[k]; }
    return S;
  }
  // сила героя: h = { lvl, str, agi, int, pas } (pas — сколько в сумке вещей с эффектом: прок, аура, активка)
  // формулы — SHOP.recompute (items.js); урон умений — примерно 45 % от урона атак героя 1-го уровня, растёт с уровнем умений
  function power(S, h) {
    const lvl = h.lvl, dmgMul = (1 + S.dmg) * (1 + 0.015 * (lvl - 1)) * (1 + 0.006 * h.str);
    const atk = (1 + 0.015 * h.agi) * (1 + Math.min(0.6, S.as));
    const skl = Math.min(10, 1 + (lvl - 1) / 4), skMul = (1 + 0.015 * h.int) * (1 + S.sk) * (1 + 0.12 * (skl - 1));
    const cdr = (1 - Math.min(0.45, S.cd)) * (1 - 0.03 * (skl - 1));
    const shot = 50 * dmgMul, crit = 1 + Math.min(0.4, S.crit);
    const atkDps = shot / 0.62 * atk * crit, skDps = 36 * dmgMul * skMul / cdr * crit;
    const dps = (atkDps + skDps) * (1 + 0.06 * (h.pas || 0));
    const hp = 600 + 10 * (lvl - 1) + 8 * h.str + S.hp, ls = Math.min(0.25, S.ls);
    const ehp = hp / (1 - Math.min(0.6, S.arm)) * (1 + 3 * ls) + S.hpr * 30;
    return { shot, dps, atkDps, skDps, hp, ehp, score: dps * ehp };
  }
  // ---- сумка: те же правила, что в items.js (plan / assemble / combineBag) ----
  function plan(id, bag, D) {
    const i = bag.indexOf(id); if (i >= 0) { bag.splice(i, 1); return []; }
    const it = D.items[id]; if (!it.from) return [id];
    return it.from.reduce((a, f) => a.concat(plan(f, bag, D)), []);
  }
  function assemble(id, bag, D) {
    const i = bag.indexOf(id); if (i >= 0) { bag.splice(i, 1); return; }
    const it = D.items[id]; if (it.from) for (const f of it.from) assemble(f, bag, D);
  }
  const full = (id, D, pk) => { const it = D.items[id]; return it.from ? it.from.reduce((s, x) => s + full(x, D, pk), 0) : pk(it.pr); };
  // ---- забег ----
  // o: { BAL, need, D (balance_data), waves (сколько волн, 100 — круг), build [сила, ловкость, интеллект] (доли),
  //      flasks (сколько фласок лечения уходит за раунд), lvlMax }
  function run(o) {
    const BAL = o.BAL, D = o.D, need = o.need, pk = BAL.price || (p => p), lvlMax = o.lvlMax || 200;
    const bw = o.build || [1, 1, 1], bs = bw[0] + bw[1] + bw[2];
    let lvl = 1, xp = 0, gold = 0, bag = [], n = 0;
    const rows = [], perWorld = [];
    const hero = b => { const pts = 3 * (lvl - 1); return power(bagStats(b, D.items), { lvl, str: pts * bw[0] / bs, agi: pts * bw[1] / bs, int: pts * bw[2] / bs, pas: b.filter(id => D.items[id].fx).length }); };
    const addXp = v => { xp += v; while (lvl < lvlMax && xp >= need(lvl)) { xp -= need(lvl); lvl++; } };
    const chestAvg = (() => { const c = Object.values(D.items).filter(it => it.chest); return c.reduce((s, it) => s + pk(it.pr), 0) / (c.length || 1); })();
    function shop() {
      for (let guard = 0; guard < 12; guard++) {
        let best = null; const s0 = hero(bag).score;
        for (const id in D.items) {
          const it = D.items[id]; if (it.rcp || it.relic || bag.includes(id)) continue;
          const miss = plan(id, bag.slice(), D); if (!miss.length) continue;
          let cost = miss.reduce((s, x) => s + pk(D.items[x].pr), 0);
          const nb = bag.concat(miss); if (it.from) { assemble(id, nb, D); nb.push(id); }
          while (nb.length > 6) {
            let bi = -1, bv = -1; for (let i = 0; i < nb.length; i++) { if (nb[i] === id) continue; const t = nb.slice(); t.splice(i, 1); const s = hero(t).score; if (s > bv) { bv = s; bi = i; } }
            if (bi < 0) break; cost -= Math.floor(full(nb[bi], D, pk) / 2); nb.splice(bi, 1);
          }
          if (nb.length > 6 || cost > gold) continue;
          const gain = hero(nb).score / s0 - 1; if (gain < 0.01) continue;
          const v = gain / Math.max(50, cost);
          if (!best || v > best.v) best = { v, nb, cost };
        }
        if (!best) break;
        gold -= best.cost; bag = best.nb;
      }
    }
    const kindXp = (k, n) => Math.round(k.xp * (k.elite ? BAL.ELITE.xp : 1) * BAL.xp(n));
    const kindGold = (k, n) => k.gold * BAL.KILL_GOLD * (k.elite ? BAL.ELITE.gold : 1) * BAL.gold(n) * 1.025;
    let wInc = 0, wXp = 0, wKills = 0, wCoin = 0;
    while (n < (o.waves || 100)) {
      const n0 = n + 1, a0 = BAL.at(n0), last = a0.W === 10 ? n0 : n0 + 2, R = D.worlds[a0.M - 1];
      let rGold = 0;
      for (let w = n0; w <= last; w++) {
        const a = BAL.at(w); let g = BAL.waveGold(w), x = 0, kills = 0;
        if (a.W === 10) { x += Math.round(R.boss.xp * BAL.xp(w)); g += BAL.bossGold(w); g += chestAvg * 0.5; wCoin -= chestAvg * 0.5; kills = 1; }
        else {
          const k = BAL.count(w), nr = Math.round(k * 0.25);
          for (let i = 0; i < k - nr; i++) { const e = R.mel[i % R.mel.length]; x += kindXp(e, w); g += kindGold(e, w); }
          for (let i = 0; i < nr; i++) { const e = R.rng[i % R.rng.length]; x += kindXp(e, w); g += kindGold(e, w); }
          for (let i = 0; i < BAL.elites(w); i++) { const e = R.elite[(i + w) % R.elite.length]; x += kindXp(e, w); g += kindGold(e, w); }
          kills = k + BAL.elites(w);
          if (a.W % 3 === 0) { const e = R.mini[a.W / 3 - 1]; x += kindXp(e, w); g += kindGold(e, w); kills++; }
          const ch = kills * 0.05 * (bag.length < 6 ? chestAvg * 0.5 : 80); g += ch; wCoin -= bag.length < 6 ? ch : 0;   // сундуки: часть (считаем за полцены) или 80 золота
        }
        addXp(x); rGold += g; wXp += x; wKills += kills;
      }
      n = last; gold += rGold; wInc += rGold; wCoin += rGold;
      const fp = pk(40) + pk(5) * (BAL.mw(n) - 1);
      gold = Math.max(0, gold - (o.flasks == null ? 2 : o.flasks) * fp);
      shop();
      const a = BAL.at(n), h = hero(bag);
      // рядовой мира: среднее по списку ближнего боя и стрелков (3 : 1)
      const reg = R.mel.concat(R.mel, R.mel, R.rng), avg = f => reg.reduce((s, e) => s + f(e), 0) / reg.length;
      const row = { n, C: a.C, M: a.M, W: a.W, lvl, gold: Math.round(gold), bag: bag.map(id => D.items[id].nm), bagIds: bag.slice(), shot: h.shot, dps: h.dps, hp: h.hp, ehp: h.ehp,
        regHp: avg(e => e.hp) * BAL.hp(n), regHit: avg(e => e.hit) * BAL.dmg(n), shots: avg(e => e.hp) * BAL.hp(n) / h.shot };
      if (a.W === 10) {
        const b = R.boss; row.boss = b.nm; row.bossHp = b.hp * BAL.hp(n) * BAL.bossHp(n); row.bossDps = b.dps * BAL.dmg(n) * BAL.bossDmg(n);
        row.bossT = row.bossHp / h.dps; row.dieT = h.ehp / row.bossDps; row.inc = Math.round(wInc); row.coin = Math.round(wCoin); row.xp = wXp; row.kills = wKills; row.flask = fp;
        perWorld.push(row); wInc = 0; wXp = 0; wKills = 0; wCoin = 0;
      } else {
        const m = R.mini[a.W / 3 - 1]; row.mini = m.nm; row.miniHp = m.hp * BAL.hp(n) * BAL.miniHp(n); row.miniT = row.miniHp / h.dps;
      }
      rows.push(row);
    }
    return { rows, worlds: perWorld };
  }
  return { KEYS, bagStats, power, run, full };
})();
if (typeof module !== 'undefined') module.exports = BALMODEL;
