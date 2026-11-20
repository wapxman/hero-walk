// Бот для проверки баланса (tools/balance_bot.py вставляет этот файл в страницу игры).
// Сам проходит одиночный забег в ускоренном времени: отходит от ближнего боя, стреляет, жмёт умения, пьёт фласки,
// между раундами покупает то, что сильнее всего поднимает силу героя за золото. Пишет по каждому раунду: время, урон
// по герою, выпитые фласки, смерти, уровень, золото, сумку. Это не игрок: он не уворачивается от умений, поэтому
// его цифры — нижняя оценка («если играть невнимательно»).
'use strict';
(() => {
  const realNow = performance.now.bind(performance);
  let VT = performance.now();
  performance.now = () => VT;
  window.requestAnimationFrame = () => 0;           // кадры крутим сами
  // карту «Путь героев» бот не смотрит: переход между мирами делает сам, а выбор главы (обычный запуск с сохранением) — сразу «Продолжить»
  if (typeof PATHMAP !== 'undefined') PATHMAP.show = o => { if (o && o.onPick) o.onPick(Math.min(10, BAL.at(wave + 1).M)); };
  SHOP.paused = false;
  const B = window.BOT = { rounds: [], cur: null, deaths: 0, stuck: 0, done: false, maxWave: 100, opt: { flaskAt: 0.5, flasks: 5, build: [1, 1, 1], armor: 1 },
    perf: { n: 0, sum: 0, max: 0, slow: 0 }, buys: 0, made: {}, casts: {}, seen: {}, hang: [] };
  // armor < 1 — «броня испытателя» для автопрогона: бот должен дойти до конца, сложность проверяется отдельно
  { const f = hurtPlayer; hurtPlayer = function (d, k) { return f(d * B.opt.armor, k); }; }
  // какие умения объявлены («Имя!» над злодеем) и какие виды врагов выходили
  { const f = say; say = function (x, y, t, c) { if (typeof t === 'string' && t.length > 2 && t.endsWith('!')) B.casts[t.slice(0, -1)] = (B.casts[t.slice(0, -1)] || 0) + 1; return f(x, y, t, c); }; }
  { const f = spawnEnemyBase; spawnEnemyBase = function (type) { B.seen[type] = (B.seen[type] || 0) + 1; return f(type); }; }
  { const f = buyItem; buyItem = function (id) { const r = f(id); if (r) { B.buys++; for (const x of SHOP.bag) if (RECIPES[x]) B.made[x] = 1; } return r; }; }
  const live = e => e.hp > 0 && e.dieT == null;
  // ---- учёт ----
  let dealt = 0, taken = 0, flasks = 0, hpPrev = P.hp, kills0 = 0;
  { const f = hurtEnemy; hurtEnemy = function (e, d, c) { const h0 = e.hp; const r = f(e, d, c); if (e.hp < h0) dealt += h0 - Math.max(0, e.hp); return r; }; }
  { const f = SHOP.use; SHOP.use = function (id) { const n0 = SHOP.flasks.heal; const r = f.apply(this, arguments); if (id === 'heal' && SHOP.flasks.heal < n0) flasks++; return r; }; }
  // ---- сила героя по сумке (та же оценка, что в balance_model.js) ----
  const power = bag => BALMODEL.power(BALMODEL.bagStats(bag, ALL), { lvl: P.lvl, str: P.st.str, agi: P.st.agi, int: P.st.int, pas: bag.filter(id => ALL[id] && (ALL[id].pas || ALL[id].act)).length });
  const price = id => fullPrice(id);
  function tryBuy(reserve) {
    let best = null; const s0 = power(SHOP.bag).score;
    for (const id in ALL) {
      const it = ALL[id]; if (it.rcp || it.relic || SHOP.bag.includes(id)) continue;
      const bag = SHOP.bag.slice(), miss = PARTS[id] ? [id] : plan(id, bag); if (!miss.length) continue;
      let cost = miss.reduce((s, x) => s + PARTS[x].pr, 0);
      let nb = SHOP.bag.concat(miss); if (RECIPES[id]) { assemble(id, nb); nb.push(id); }
      const sell = [];
      while (nb.length > BAG_MAX) {   // сумка полна — продаём то, без чего сила падает меньше всего
        let bi = -1, bs = -1; for (let i = 0; i < nb.length; i++) { if (nb[i] === id) continue; const t = nb.slice(); t.splice(i, 1); const s = power(t).score; if (s > bs) { bs = s; bi = i; } }
        if (bi < 0) break; sell.push(nb[bi]); cost -= Math.floor(price(nb[bi]) / 2); nb.splice(bi, 1);
      }
      if (nb.length > BAG_MAX || cost > SHOP.gold - reserve) continue;
      const gain = power(nb).score / s0 - 1; if (gain < 0.01) continue;
      const v = gain / Math.max(50, cost);
      if (!best || v > best.v) best = { v, id, sell };
    }
    if (!best) return false;
    for (const s of best.sell) { const i = SHOP.bag.indexOf(s); if (i >= 0) sellItem(i); }
    return buyItem(best.id);
  }
  function shop() {
    // очки: характеристики поровну (или по opt.build), умения по кругу
    const bw = B.opt.build, ids = ['str', 'agi', 'int'];
    while (P.stp > 0) { let k = 0, bv = 1e9; for (let i = 0; i < 3; i++) { if (!bw[i]) continue; const v = P.st[ids[i]] / bw[i]; if (v < bv) { bv = v; k = i; } } P.stp--; P.st[ids[k]]++; }
    while (P.sp > 0) { const k = SK_IDS.filter(k => P.skLv[k] < SK_MAX).sort((a, b) => P.skLv[a] - P.skLv[b])[0]; if (!k) break; P.sp--; P.skLv[k]++; }
    SHOP.recompute();
    const want = Math.min(HEAL.max, B.opt.flasks + Math.floor(BAL.mw(wave + 1) / 3)), fp = SHOP.flaskPrice(FLASKS[0]);
    while (SHOP.flasks.heal < want && SHOP.gold >= fp) { SHOP.gold -= fp; SHOP.flasks.heal++; }
    for (let i = 0; i < 12 && tryBuy(0); i++);
    SHOP.recompute();
  }
  function begin() {
    const a = BAL.at(wave + 1);
    if (WORLD !== a.M) applyWorld(a.M);
    shop();
    dealt = taken = flasks = 0; hpPrev = P.hp; kills0 = kills;
    B.cur = { n0: wave + 1, M: a.M, C: a.C, W: a.W, t: 0, deaths: 0, lvl: P.lvl, gold: SHOP.gold, hp0: Math.round(P.hp), maxHp: P.maxHp, bag: SHOP.bag.map(id => ALL[id].nm), dmgMul: +P.dmgMul.toFixed(2), atkSpd: +P.atkSpd.toFixed(2), skMul: +P.skMul.toFixed(2) };
    SHOP.startWave();
  }
  function end() {
    const c = B.cur; if (!c) return;
    Object.assign(c, { n1: wave, dealt: Math.round(dealt), taken: Math.round(taken), flasks, kills: kills - kills0, hpEnd: Math.round(P.hp), lvl1: P.lvl, gold1: SHOP.gold });
    B.rounds.push(c); B.cur = null;
  }
  // ---- поведение в бою ----
  let mvx = 0, mvy = 0, wv0 = -1, wvT = 0;
  function ai(dt) {
    const E = enemies.filter(live);
    let ax = 0, ay = 0, near = null, nd = 1e9;
    for (const e of E) { const d = gdist(P, e); if (d < nd) { nd = d; near = e; } }
    // как игрок: всё время в движении. Из 16 направлений берём то, где через шаг меньше врагов ближнего боя, меток
    // на земле и летящих в героя снарядов; при прочих равных — кружим вокруг ближайшего врага на расстоянии выстрела
    const zones = fx.filter(f => f.type === 'tele' && f.t < f.dur);   // метки удара на земле (урон может прийти отдельно, после метки)
    const inc = shots.filter(q => q.own === 'e' && q.left > 0 && Math.hypot(q.x - P.x, (q.y - P.y) / YK) < 520);
    const risk = (x, y) => {
      let r = 0;
      for (const e of E) { const d = Math.hypot(x - e.x, (y - e.y) / YK); r += (e.mel ? 1 : 0.1) * (e.boss || e.mini ? 2.5 : 1) / Math.pow(Math.max(40, d) / 100, 2); }
      for (const f of zones) if (Math.hypot(x - f.x, (y - f.y) / YK) < f.R + 50) r += 6;
      for (const q of inc) { const rx = x - q.x, ry = (y - q.y) / YK, al = rx * q.dx + ry * q.dy; if (al > -20 && al < 420 && Math.abs(rx * q.dy - ry * q.dx) < 60) r += 3; }
      return r;
    };
    if (near) {
      let bs = -1e9; const tx = (near.x - P.x) / (nd || 1), ty = (near.y - P.y) / YK / (nd || 1), far = near.mel ? 470 : 380, want = nd > far ? 1.6 : nd < far - 140 ? -1 : 0;   // к стрелку подходим ближе: он сам держит расстояние
      for (let i = 0; i < 16; i++) {
        const an = i * 0.3927, dx = Math.cos(an), dy = Math.sin(an);
        let sc = 0, ok = true;
        for (const st of [110, 260]) { const x = P.x + dx * st, y = P.y + dy * st * YK; if (!inWalk(x, y) || SOLID.some(o => { const u = (x - o.x) / (o.rx + 30), v = (y - o.y) / (o.ry + 30); return u * u + v * v < 1; })) { ok = false; break; } sc -= risk(x, y); }
        if (!ok) sc = -1e6 + sc;
        sc += 0.3 * (dx * mvx + dy * mvy);                        // не дёргаться
        sc += 0.25 * want * (dx * tx + dy * ty);                  // держать расстояние выстрела
        sc += 0.12 * Math.abs(dx * ty - dy * tx);                 // кружить, а не стоять
        if (sc > bs) { bs = sc; ax = dx; ay = dy; }
      }
      mvx = ax; mvy = ay;
    }
    const m = Math.hypot(ax, ay);
    stick.active = m > 0.01; stick.dx = m ? ax / m : 0; stick.dy = m ? ay / m : 0;
    // рывок: снаряд вот-вот попадёт (или метка на земле под ногами) — уходим рывком туда, куда и шли
    if (B.opt.dash !== false && typeof DASH !== 'undefined' && P.cd.dash <= 0 && m > 0.01 && P.dead <= 0) {
      const hit = inc.some(q => { const rx = P.x - q.x, ry = (P.y - q.y) / YK, al = rx * q.dx + ry * q.dy; return al > 0 && al < 170 && Math.abs(rx * q.dy - ry * q.dx) < 45; })
        || zones.some(f => f.dur - f.t < 0.3 && Math.hypot(P.x - f.x, (P.y - f.y) / YK) < f.R);
      if (hit && cast('dash')) B.dashes = (B.dashes || 0) + 1;
    }
    held.key = !!near && nd < RANGE + 60;
    if (near && P.dead <= 0 && !STATUS.mute()) {
      for (const id of SK_IDS) {
        if (P.cd[id] > 0 || P.mp < MANA[id]) continue;
        if (id === 'r' && !(E.length >= 5 || E.some(e => e.boss || e.mini))) continue;
        if (nd < 520) cast(id);
      }
    }
    if (P.dead <= 0 && P.hp < B.opt.flaskAt * P.maxHp && SHOP.flasks.heal > 0) SHOP.use('heal');
  }
  // ---- полигон умений: один злодей с огромным здоровьем против неуязвимого героя, пока не применит все умения ----
  // names — умения с надписью из SK.DEF[type] (пассивные и без надписи не считаются). Меняем расстояние и здоровье злодея,
  // чтобы сработали условия («издалека», «вблизи», «на 66 % и 33 % здоровья»).
  B.skills = function (type, mini, secs) {
    const D0 = SK.DEF[type] || [], L = D0.filter(s => s.ph && (!s.passive || s.poly)).map(s => s.ph), err = [], poke = D0.some(s => s.poly === 'hurt');   // poly — пассив, который полигон тоже должен увидеть ('hurt' — срабатывает, когда злодея бьют)
    for (const e of enemies) e.hp = 0; enemies.length = 0; shots.length = 0; fx.length = 0; ROUND.queue.length = 0; ROUND.fin = null; ROUND.endW = wave;
    SHOP.phase = 'fight'; P.dead = 0; STATUS.clear(); P.maxHp = 1e9; P.hp = 1e9;
    if (mini) { ROUND.mini = type; spawnEnemy(type); } else { ROUND.mini = null; spawnEnemyBase(type); }
    const e = enemies[enemies.length - 1]; e.hp = e.max = 1e9; B.casts = {};
    const D = [320, 620, 160, 900, 420]; let t = 0, k = -1;
    stick.active = false; held.key = false;
    while (t < secs && L.some(n => !B.casts[n])) {
      const kk = Math.floor(t / 8) % D.length;
      if (kk !== k && !e.skMove && !e.act) { k = kk; e.x = P.x + D[k]; e.y = P.y; collide(e); if (k === 2) e.hp = e.max * 0.6; if (k === 4) e.hp = e.max * 0.3; }
      VT += 1000 / 30; t += 1 / 30; ROUND.queue.length = 0;
      if (poke && Math.floor(t * 4) !== Math.floor((t - 1 / 30) * 4) && e.hp > 0) hurtEnemy(e, 1);
      try { frame(VT); } catch (x) { err.push(String(x && x.stack || x).slice(0, 300)); if (err.length > 2) break; }
      P.maxHp = 1e9; if (P.dead <= 0) P.hp = 1e9; if (e.hp <= 0 || e.dieT != null) break;
      if (LIMBO.on) { LIMBO.leave(); break; }
    }
    const miss = L.filter(n => !B.casts[n]);
    for (const o of enemies) o.hp = 0; enemies.length = 0; ROUND.queue.length = 0; STATUS.clear(); SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.recompute(); P.hp = P.maxHp;
    return { type, want: L, miss, t: Math.round(t), err };
  };
  B.run = function (frames) {
    for (let i = 0; i < frames && !B.done; i++) {
      VT += 1000 / 30;
      if (LIMBO.on) { B.deaths++; if (B.cur) { B.cur.deaths++; if (B.cur.deaths >= 6) { B.cur.stuck = 1; B.stuck++; } } hpPrev = P.maxHp;
        const stuck = B.cur && B.cur.stuck; LIMBO.leave();
        if (stuck) { for (const e of enemies) e.hp = 0; enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = ROUND.endW; } }
      else if (SHOP.phase === 'rest' && P.dead <= 0 && !(SHOP.restT > 0.05)) {
        for (const d of SHOP.drops) if (!d.gone) { d.gone = true; SHOP.pick(d); }   // после раунда игрок обходит поле и собирает выпавшее
        end();
        if (wave >= B.maxWave) { B.done = true; break; }
        begin();
      } else if (SHOP.phase === 'fight') {
        ai(1 / 30); if (B.cur) B.cur.t += 1 / 30;
        // зависание: волна не кончается 12 игровых минут — записываем и идём дальше
        if (wave !== wv0) { wv0 = wave; wvT = 0; } else if ((wvT += 1 / 30) > 720) { B.hang.push({ wave, left: enemies.filter(live).map(e => e.type), queue: ROUND.queue.length }); wvT = 0; for (const e of enemies) e.hp = 0; enemies.length = 0; ROUND.queue.length = 0; ROUND.fin = null; wave = ROUND.endW; }
      }
      const r0 = realNow(); frame(VT); const ms = realNow() - r0; B.perf.n++; B.perf.sum += ms; if (ms > B.perf.max) B.perf.max = ms; if (ms > 50) B.perf.slow++;
      if (P.hp < hpPrev) { taken += hpPrev - P.hp; if (B.cur && enemies.some(e => (e.mini || e.boss) && e.hp > 0)) B.cur.takenBoss = (B.cur.takenBoss || 0) + hpPrev - P.hp; } hpPrev = P.hp;
      if (B.cur && SHOP.phase === 'fight' && enemies.some(e => (e.mini || e.boss) && e.hp > 0)) B.cur.tBoss = (B.cur.tBoss || 0) + 1 / 30;
    }
    return { wave, done: B.done, rounds: B.rounds.length, deaths: B.deaths, lvl: P.lvl, phase: SHOP.phase };
  };
})();
