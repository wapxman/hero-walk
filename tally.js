// tally.js — статистика (v124, Создатель 27.11): итоги мира после победы над боссом, экран «Статистика» в главном меню и страница
// героя в Альма-матер (вкладка «Герои» — alma.js берёт её отсюда).
// Счёт идёт на каждого героя отдельно и «Новой игрой» не стирается (ключ hw_tally — как трофеи hw_alma). В старом серверном режиме сети
// (NETC.on) ничего не считается; в игре «Вместе» каждый считает своё.
// Что считается: бой (время, убитые, элита, мини-боссы, боссы, волны), сила (нанесённый и полученный урон, самый сильный удар, лучшая
// серия убийств без полученного урона, гибели), путь (золото собрано и потрачено, склянки, рывки, умения, пройденные миры).
// Скрытый уровень врагов (levels.js) здесь не показывается нигде — решение Создателя 24.11.
// Значки — ui/stat_icons.webp (ChatGPT; tools/stat_icons_prep.py) и общий лист ui/icons.webp. Рамки, лента, лавры, медальоны глав и
// трофеи боссов — готовые картинки игры. Кодом ничего не рисуется.
// Под автопрогоном и проверками (navigator.webdriver, бот) окно итогов не всплывает; показать его в проверке — адрес с ?tally=1.
'use strict';
const TALLY = (() => {
  const KEY = 'hw_tally', VV = typeof V === 'string' ? V : '';
  const blank = () => ({ kills: 0, elite: 0, mini: 0, boss: 0, dmg: 0, taken: 0, hit: 0, deaths: 0, time: 0, waves: 0, gold: 0, spent: 0, flasks: 0, dash: 0, streak: 0, worlds: 0, cast: { q: 0, e: 0, f: 0, r: 0 } });
  const fix = c => { const b = blank(); if (c && typeof c === 'object') { for (const k in b) if (k !== 'cast' && typeof c[k] === 'number' && isFinite(c[k]) && c[k] >= 0) b[k] = c[k]; if (c.cast) for (const k in b.cast) if (typeof c.cast[k] === 'number' && c.cast[k] >= 0) b.cast[k] = c.cast[k]; } return b; };
  const D = { v: 1, h: {}, run: null, best: {}, last: null };
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (d && typeof d === 'object') {
      for (const id in d.h || {}) D.h[id] = fix(d.h[id]);
      if (d.best && typeof d.best === 'object') D.best = d.best;
      if (d.run && typeof d.run === 'object' && d.run.hero) D.run = { hero: d.run.hero, world: d.run.world | 0, cyc: d.run.cyc | 0, full: !!d.run.full, hit0: +d.run.hit0 || 0, streak0: +d.run.streak0 || 0, c: fix(d.run.c) };
      if (d.last && typeof d.last === 'object' && d.last.hero) D.last = Object.assign({}, d.last, { c: fix(d.last.c), fresh: false });
    }
  } catch (e) {}
  let dirty = false, saveT = 0;
  function save() { dirty = false; saveT = 0; try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} }
  const online = () => !!(window.NETC && NETC.on);
  const auto = () => !!window.BOT || !!window.LEVEL_TEST || (!!navigator.webdriver && !/[?&]tally=1/.test(location.search));
  const T = id => D.h[id || HERO_ID] || (D.h[id || HERO_ID] = blank());
  let W = D.run, streak = 0;      // идущий мир и текущая серия убийств без урона
  const mine = () => W && W.hero === HERO_ID;
  function add(k, v) { if (online() || !(v > 0)) return; T()[k] += v; if (mine()) W.c[k] += v; dirty = true; }
  function top(k, v) { if (online()) return; const t = T(); if (v > t[k]) { t[k] = v; dirty = true; } if (mine() && v > W.c[k]) W.c[k] = v; }

  // ---------- счёт ----------
  {
    const _he = hurtEnemy;
    hurtEnemy = function (e) {
      const h0 = e && e.hp > 0 ? e.hp : 0, r = _he.apply(this, arguments);
      try { if (h0 > 0 && e.hp < h0) { add('dmg', h0 - Math.max(0, e.hp)); top('hit', Math.round(Math.min(h0 - e.hp, e.max || h0))); } } catch (x) {}      // удар считаем не больше запаса здоровья цели
      return r;
    };
    const _ok = SHOP.onKill;
    SHOP.onKill = function (e) {
      try { if (e && !online()) { add('kills', 1); if (e.boss && !e.clone) add('boss', 1); else if (e.mini) add('mini', 1); else if (e.elite) add('elite', 1); streak++; top('streak', streak); } } catch (x) {}
      return _ok.apply(this, arguments);
    };
    const _c = cast;
    cast = function (id) {
      const c0 = P.cd[id] > 0, m0 = P.mp, r = _c.apply(this, arguments);
      try { if (!c0 && !online() && T().cast[id] != null && (P.cd[id] > 0 || P.mp < m0)) { T().cast[id]++; if (mine()) W.c.cast[id]++; dirty = true; } } catch (x) {}
      return r;
    };
    const _use = SHOP.use;
    SHOP.use = function (id) { const n0 = SHOP.flasks[id] || 0, r = _use.apply(this, arguments); try { if ((SHOP.flasks[id] || 0) < n0) add('flasks', 1); } catch (x) {} return r; };
    const _ag = SHOP.addGold;
    SHOP.addGold = function (n) { try { add('gold', n); } catch (x) {} return _ag.apply(this, arguments); };
  }
  let ph0 = 'rest', dead0 = false, lost = false, hp0 = null, dash0 = false, sp0 = null;
  function tick(dt) {
    if (dirty && (saveT += dt) > 5) save();
    if (online() || typeof SHOP === 'undefined') return;
    const limbo = typeof LIMBO !== 'undefined' && LIMBO.on, dead = P.dead > 0, ph = SHOP.phase;
    // потрачено: по учёту золота забега (items.js: SHOP.led — предметы, реликвии, склянки, кузница)
    if (SHOP.led) { const L = SHOP.led, sp = (L.items || 0) + (L.relics || 0) + (L.flasks || 0) + (L.forge || 0); if (sp0 != null && sp > sp0) add('spent', sp - sp0); sp0 = sp; }
    if (limbo) { hp0 = null; dead0 = dead; return; }
    if (ph === 'fight' && ph0 !== 'fight' && wave > 0) {      // начался раунд: первый раунд мира открывает новый счёт мира
      const a = BAL.at(wave); lost = false;
      if (a.W === 1 || !W || W.hero !== HERO_ID || W.world !== a.M || W.cyc !== a.C) { W = D.run = { hero: HERO_ID, world: a.M, cyc: a.C, full: a.W === 1, hit0: T().hit, streak0: T().streak, c: blank() }; dirty = true; }
    }
    if (ph === 'fight') {
      if (!dead) add('time', dt);
      if (hp0 != null && P.hp < hp0 - 0.01) { add('taken', hp0 - P.hp); streak = 0; }      // весь урон, включая яд и горение
      if (typeof DASH !== 'undefined') { const d = !!DASH.on; if (d && !dash0) add('dash', 1); dash0 = d; }
    }
    hp0 = P.hp;
    if (dead && !dead0) { add('deaths', 1); streak = 0; lost = true; }
    if (ph === 'rest' && ph0 === 'fight') {
      if (!dead && !lost) { add('waves', 1); const a = BAL.at(wave); if (a.W === 10) finishWorld(a); }
      save();
    }
    ph0 = ph; dead0 = dead;
  }
  { const _cu = combatUpdate; combatUpdate = function (dt) { _cu(dt); try { tick(dt); } catch (x) {} }; }
  addEventListener('pagehide', () => { if (dirty) save(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && dirty) save(); });

  // оценка мира: S — без гибелей и урона получено меньше двух запасов здоровья; A — без гибелей; B — одна-две гибели; C — три и больше
  const RANKS = 'CBAS', RANK_NAME = { S: 'Безупречно', A: 'Без потерь', B: 'С боем', C: 'Через Междумирье' };
  function finishWorld(a) {
    if (!mine() || W.world !== a.M) return;
    add('worlds', 1);
    const c = W.c, b = (D.best[HERO_ID] = D.best[HERO_ID] || {}), prev = b[a.M] || null, t = Math.max(1, Math.round(c.time));
    const rank = c.deaths >= 3 ? 'C' : c.deaths >= 1 ? 'B' : c.taken < 2 * P.maxHp ? 'S' : 'A';
    const rec = { time: W.full && !!prev && prev.t > 0 && t < prev.t, hit: c.hit > W.hit0 && W.hit0 > 0, streak: c.streak > W.streak0 && W.streak0 > 0, first: !prev };
    b[a.M] = { t: W.full ? (prev && prev.t > 0 ? Math.min(prev.t, t) : t) : (prev ? prev.t || 0 : 0), rank: prev && RANKS.indexOf(prev.rank) > RANKS.indexOf(rank) ? prev.rank : rank, n: (prev ? prev.n || 0 : 0) + 1 };
    D.last = { hero: HERO_ID, world: a.M, cyc: a.C, full: !!W.full, c: JSON.parse(JSON.stringify(c)), rank, rec, fresh: true, d: Date.now() };
    W = D.run = null; save();
  }

  // ---------- вид ----------
  const fmt = n => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');      // 1 234 567
  const clock = s => { s = Math.round(s || 0); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
  // значок: [лист, столбец, строка]; s — лист значков статистики 4×2, i — общий лист значков игры 4×4
  const IC = { time: ['s', 0, 0], deaths: ['s', 1, 0], boss: ['s', 2, 0], worlds: ['s', 3, 0], hit: ['s', 0, 1], streak: ['s', 1, 1], dmg: ['s', 2, 1], waves: ['s', 3, 1],
    flasks: ['i', 0, 0], fav: ['i', 0, 1], dash: ['i', 1, 1], cast: ['i', 3, 1], taken: ['i', 0, 2], gold: ['i', 1, 2], spent: ['i', 2, 2], avg: ['i', 3, 2], kills: ['i', 0, 3], mini: ['i', 1, 3] };
  const icon = k => { const [sh, x, y] = IC[k] || IC.kills; return '<i class="tli" style="background-image:url(ui/' + (sh === 's' ? 'stat_icons' : 'icons') + '.webp' + VV + ');background-size:400% ' + (sh === 's' ? 200 : 400) + '%;background-position:' + (x * 100 / 3).toFixed(2) + '% ' + (sh === 's' ? y * 100 : y * 100 / 3).toFixed(2) + '%"></i>'; };
  const heroLvl = id => { if (id === HERO_ID && typeof P !== 'undefined' && P.lvl) return P.lvl; try { const d = JSON.parse(localStorage.getItem('hw_prog_' + id) || 'null'); return d && d.lvl ? d.lvl : 1; } catch (e) { return 1; } };
  const SKN = { q: 1, e: 2, f: 3, r: 4 };
  function favSkill(id, c) {
    let k = null, n = 0; for (const s in c.cast) if (c.cast[s] > n) { n = c.cast[s]; k = s; }
    const h = typeof HEROES !== 'undefined' && HEROES[id]; if (!k || !h) return '—';
    return String(h.skills[SKN[k]] || '').split(' — ')[0] || '—';
  }
  // три группы строк: [ключ значка, подпись, значение]
  function groups(id) {
    const c = T(id), casts = c.cast.q + c.cast.e + c.cast.f + c.cast.r;
    return [
      ['Сражения', [['time', 'Время в бою', clock(c.time)], ['kills', 'Убито врагов', fmt(c.kills)], ['mini', 'Мини-боссов', fmt(c.mini)], ['boss', 'Боссов', fmt(c.boss)], ['waves', 'Волн отбито', fmt(c.waves)], ['worlds', 'Миров пройдено', fmt(c.worlds)]]],
      ['Мощь', [['dmg', 'Нанесено урона', fmt(c.dmg)], ['taken', 'Получено урона', fmt(c.taken)], ['hit', 'Самый сильный удар', fmt(c.hit)], ['streak', 'Лучшая серия убийств', fmt(c.streak)], ['deaths', 'Гибелей', fmt(c.deaths)], ['fav', 'Любимое умение', favSkill(id, c)]]],
      ['Путь', [['gold', 'Золота собрано', fmt(c.gold)], ['spent', 'Золота потрачено', fmt(c.spent)], ['avg', 'Золота за волну', fmt(c.waves ? c.gold / c.waves : 0)], ['flasks', 'Склянок выпито', fmt(c.flasks)], ['cast', 'Умений применено', fmt(casts)], ['dash', 'Рывков', fmt(c.dash)]]],
    ];
  }
  const css = document.createElement('style');
  css.textContent = `
  .tli { display: inline-block; flex: none; width: 2.2em; height: 2.2em; background-repeat: no-repeat; }
  .tlBox { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; color: #fff; font-family: Georgia, 'Times New Roman', serif; text-shadow: 0 .1em .25em #000;
    user-select: none; -webkit-user-select: none; touch-action: none; }
  .tlBox .pn { position: relative; width: min(96vw, 138vh); aspect-ratio: 3 / 2; background: url(ui/panel.webp${VV}) center / 100% 100% no-repeat; font-size: calc(min(96vw, 138vh) / 62); }
  .tlBox .tt { position: absolute; left: 24%; top: 5.5%; width: 52%; height: 10.5%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.5em; color: #ffe9a8; white-space: nowrap; }
  .tlBox .cl { position: absolute; right: 2.5%; top: 6%; width: 6%; aspect-ratio: 230 / 244; background: url(ui/close.webp${VV}) center / 100% 100% no-repeat; cursor: pointer; }
  .tlBox .rw { display: flex; align-items: center; gap: .55em; background: rgba(8,16,32,.55); border-radius: .5em; padding: .22em .55em; min-width: 0; }
  .tlBox .rw span { flex: 1; min-width: 0; font-size: .86em; color: #d6deee; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tlBox .rw b { font: bold 1.02em system-ui, sans-serif; color: #fff; white-space: nowrap; }
  .tlBox .rw em { display: block; font: bold .72em system-ui, sans-serif; font-style: normal; color: #ffd23a; letter-spacing: .04em; }
  .tlBox .go { position: absolute; left: 37%; width: 26%; bottom: 9.2%; height: 10.2%; background: url(ui/btn_green.webp${VV}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
    font: bold 1.35em system-ui, sans-serif; color: #fff; cursor: pointer; }
  .tlBox .go:active { transform: scale(.96); }
  /* итоги мира */
  #tlWin { z-index: 62; background: rgba(3,6,12,.84); }
  #tlWin .lf { position: absolute; left: 6.5%; top: 19%; width: 27%; height: 60%; display: flex; flex-direction: column; align-items: center; }
  #tlWin .tr { width: 78%; aspect-ratio: 1 / 1; background: center / contain no-repeat; filter: drop-shadow(0 .4em .8em rgba(0,0,0,.7)); }
  #tlWin .who { font-size: .92em; color: #ffe9a8; text-align: center; margin-top: .1em; line-height: 1.15; }
  #tlWin .rk { position: relative; margin-top: .35em; width: 46%; aspect-ratio: 420 / 365; background: url(ui/map/laurel.webp${VV}) center / contain no-repeat; display: flex; align-items: center; justify-content: center; }
  #tlWin .rk b { font: bold 3.3em Georgia, serif; color: #ffe27a; text-shadow: 0 .06em 0 #7a4a08, 0 .12em .3em #000; transform: scale(0); transition: transform .45s cubic-bezier(.3, 1.6, .5, 1) 1s; }
  #tlWin.in .rk b { transform: scale(1); }
  #tlWin .rn { font-size: .95em; color: #e9d9a8; margin-top: -.1em; }
  #tlWin .rt { position: absolute; left: 36.5%; top: 19.5%; width: 56.5%; display: grid; grid-template-columns: 1fr 1fr; gap: .5em .7em; font-size: 1.08em; }
  #tlWin .rt .rw { padding: .38em .6em; min-height: 2.5em; box-sizing: border-box; } #tlWin .rt .tli { width: 2.3em; height: 2.3em; }
  #tlWin .rw { opacity: 0; transform: translateY(.5em); transition: opacity .3s, transform .3s; }
  #tlWin.in .rw { opacity: 1; transform: none; }
  #tlWin .nt { position: absolute; left: 36.5%; width: 56.5%; top: 72.5%; text-align: center; font-size: .8em; color: #b9c2d6; }
  /* экран «Статистика» */
  #tlScr { z-index: 75; background: #05080e url(ui/menu_bg.webp${VV}) center / cover no-repeat; }
  #tlScr::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(5,8,16,.8), rgba(2,4,9,.95)); }
  #tlScr .hr { position: absolute; left: 0; right: 0; top: 17%; display: flex; justify-content: center; gap: 1em; }
  #tlScr .hr div { width: 11.5em; height: 2.7em; background: url(ui/btn_blue.webp${VV}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold 1.05em system-ui, sans-serif;
    color: #e9f1ff; filter: brightness(.75); cursor: pointer; }
  #tlScr .hr div.on { background-image: url(ui/btn_green.webp${VV}); filter: none; color: #ffe27a; }
  #tlScr .cols { position: absolute; left: 6%; right: 6%; top: 25.5%; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0 .9em; }
  #tlScr .cols h4 { margin: 0 0 .3em; font-size: 1.05em; color: #ffe27a; text-align: center; letter-spacing: .08em; }
  #tlScr .col { display: flex; flex-direction: column; gap: .3em; min-width: 0; }
  #tlScr .rw { padding: .16em .5em; } #tlScr .tli { width: 1.9em; height: 1.9em; }
  #tlScr .ws { position: absolute; left: 6%; right: 6%; bottom: 9.5%; height: 17.5%; display: grid; grid-template-columns: repeat(10, 1fr); gap: .3em; }
  #tlScr .w { display: flex; flex-direction: column; align-items: center; min-width: 0; }
  #tlScr .w i { width: 62%; aspect-ratio: 1 / 1; background: center / contain no-repeat; }
  #tlScr .w.no i { filter: grayscale(1) brightness(.4); }
  #tlScr .w b { font: bold .78em system-ui, sans-serif; color: #ffe9a8; margin-top: .05em; white-space: nowrap; } #tlScr .w.no b { color: #6f7686; }
  #tlScr .w span { font: .68em system-ui, sans-serif; color: #c9d2e6; white-space: nowrap; }
  #mMain .b.stat { cursor: pointer; }
  /* Альма-матер: вкладка «Герои» */
  #almaBook .hc { display: flex; gap: .8em; justify-content: center; margin-top: .4em; }
  #almaBook .hc .h { width: 46%; padding: .5em .3em .4em; border-radius: .5em; text-align: center; cursor: pointer; }
  #almaBook .hc .h.sel { background: rgba(120, 70, 20, .18); box-shadow: 0 0 0 .1em rgba(120, 70, 20, .55); }
  #almaBook .hc .h i { display: block; width: 6.4em; height: 6.4em; margin: 0 auto .2em; background: center / contain no-repeat; }
  #almaBook .hc .h b { display: block; font-size: 1.05em; color: #5a1f10; } #almaBook .hc .h span { font-size: .72em; }
  #almaBook .hnote { font-size: .72em; font-style: italic; text-align: center; margin-top: 1em; opacity: .85; }
  #almaBook .r .tg { margin: .5em 0 .1em; font: bold .86em Georgia, serif; color: #5a1f10; border-bottom: .06em solid rgba(90, 31, 16, .35); }
  #almaBook .r .tl { display: flex; align-items: center; gap: .4em; font-size: .78em; margin-top: .12em; }
  #almaBook .r .tl .tli { width: 1.5em; height: 1.5em; } #almaBook .r .tl span { flex: 1; } #almaBook .r .tl b { color: #5a1f10; }`;
  document.head.appendChild(css);
  const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const tap = (e, fn) => { for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true }); e.addEventListener('pointerdown', x => { x.stopPropagation(); x.preventDefault(); fn(x); }); };
  const block = el => { for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) el.addEventListener(ev, e => e.stopPropagation()); };
  const row = (p, k, label, val, rec) => mk('div', 'rw', p, icon(k) + '<span>' + label + (rec ? '<em>новый рекорд</em>' : '') + '</span><b>' + val + '</b>');
  const bossOf = w => (typeof ROSTER !== 'undefined' && ROSTER[w] ? ROSTER[w].boss : null);
  const kindName = id => { const n = typeof KIND !== 'undefined' && KIND[id] && KIND[id].nm; return Array.isArray(n) ? n[0] : n || ''; };

  // ---------- итоги мира ----------
  let WIN = null, winDone = null;
  function summary(L, done) {
    if (!WIN) { WIN = mk('div', 'tlBox', document.body); WIN.id = 'tlWin'; block(WIN); }
    const c = L.c, boss = bossOf(L.world), nm = typeof PATHMAP !== 'undefined' && PATHMAP.NAMES ? PATHMAP.NAMES[L.world - 1] : '';
    WIN.classList.remove('in');
    WIN.innerHTML = '<div class="pn"><div class="tt">Мир ' + L.world + ' пройден</div><div class="lf"><div class="tr"></div><div class="who"></div><div class="rk"><b></b></div><div class="rn"></div></div><div class="rt"></div><div class="nt"></div><div class="go">Дальше</div></div>';
    if (boss) WIN.querySelector('.tr').style.backgroundImage = 'url(alma/t_' + boss + '.webp' + VV + ')';
    WIN.querySelector('.who').textContent = (boss ? kindName(boss) : nm) + ' повержен';
    WIN.querySelector('.rk b').textContent = L.rank; WIN.querySelector('.rn').textContent = RANK_NAME[L.rank] || '';
    const rt = WIN.querySelector('.rt');
    const rows = [['time', 'Время', clock(c.time), L.rec && L.rec.time], ['kills', 'Убито врагов', fmt(c.kills)], ['dmg', 'Нанесено урона', fmt(c.dmg)], ['taken', 'Получено урона', fmt(c.taken)],
      ['hit', 'Самый сильный удар', fmt(c.hit), L.rec && L.rec.hit], ['streak', 'Лучшая серия убийств', fmt(c.streak), L.rec && L.rec.streak], ['mini', 'Мини-боссов и боссов', fmt(c.mini + c.boss)], ['deaths', 'Гибелей', fmt(c.deaths)],
      ['gold', 'Золота собрано', fmt(c.gold)], ['flasks', 'Склянок выпито', fmt(c.flasks)]];
    rows.forEach((r, i) => { row(rt, r[0], r[1], r[2], r[3]).style.transitionDelay = (0.15 + i * 0.07) + 's'; });
    WIN.querySelector('.nt').textContent = L.full ? '' : 'Мир начат не с первой волны — время в рекорды не идёт';
    winDone = done;
    tap(WIN.querySelector('.go'), closeWin);
    WIN.style.display = 'flex'; void WIN.offsetWidth; WIN.classList.add('in');
    if (typeof STORE !== 'undefined') STORE.freeze(true);
    try { snd('coins', 0.6); } catch (e) {}
  }
  function closeWin() {
    if (!WIN || WIN.style.display !== 'flex') return;
    WIN.style.display = 'none'; if (typeof STORE !== 'undefined') STORE.freeze(false);
    const f = winDone; winDone = null; if (f) f();
  }
  addEventListener('keydown', e => { if (WIN && WIN.style.display === 'flex') { e.stopPropagation(); if (['Enter', 'Space', 'Escape'].includes(e.code) && !e.repeat) { e.preventDefault(); closeWin(); } } }, true);
  // итоги — после окна «Босс повержен» (store.js) и финала (cine.js), перед картой перехода: этот файл подключён раньше них
  if (typeof PATHMAP !== 'undefined') {
    const _show = PATHMAP.show;
    PATHMAP.show = function (o) {
      const self = this, next = () => _show.call(self, o);
      if (!o || o.mode === 'select' || o.mode === 'return' || !D.last || !D.last.fresh) return next();
      D.last.fresh = false; dirty = true;
      if (auto() || online()) return next();
      summary(D.last, next);
    };
  }

  // ---------- экран «Статистика» ----------
  let SCR = null, scrHero = null;
  function open(id) {
    if (!SCR) { SCR = mk('div', 'tlBox', document.body); SCR.id = 'tlScr'; block(SCR); }
    scrHero = id || scrHero || HERO_ID;
    if (dirty) save();
    const H = typeof HEROES !== 'undefined' ? HEROES : {}, b = D.best[scrHero] || {};
    SCR.innerHTML = '<div class="pn"><div class="tt">Статистика</div><div class="cl"></div><div class="hr"></div><div class="cols"></div><div class="ws"></div></div>';
    const hs = SCR.querySelector('.hr');
    for (const h in H) { const d = mk('div', h === scrHero ? 'on' : '', hs); d.dataset.h = h; d.innerHTML = '<span>' + H[h].name + '</span> · <span>ур.</span> ' + heroLvl(h); tap(d, () => open(h)); }
    const cols = SCR.querySelector('.cols');
    for (const [title, rows] of groups(scrHero)) { const c = mk('div', 'col', cols); mk('h4', '', c, title); for (const r of rows) row(c, r[0], r[1], r[2]); }
    const ws = SCR.querySelector('.ws');
    for (let w = 1; w <= 10; w++) {
      const r = b[w], d = mk('div', 'w' + (r ? '' : ' no'), ws); d.dataset.w = w;
      mk('i', '', d).style.backgroundImage = 'url(ui/map/m' + w + '.webp' + VV + ')';
      mk('b', '', d, r ? r.rank : '—'); mk('span', '', d, r && r.t > 0 ? clock(r.t) : '');
    }
    tap(SCR.querySelector('.cl'), close);
    SCR.style.display = 'flex';
  }
  function close() { if (SCR) SCR.style.display = 'none'; }
  // кнопка в главном меню: меню (menu.js) создаётся позже этого файла — ставим кнопку, когда страница собрана
  // v124 (Создатель 28.11): кнопка — в левом столбце меню, после «Герои» (справа она закрывала лицо лучницы на заставке; справа
  // остались только «PRO» и «История»)
  addEventListener('DOMContentLoaded', () => {
    const m = document.querySelector('#mMain'); if (!m) return;
    const col = m.querySelector('.btns'), b = mk('div', 'b stat', col || m, 'Статистика');
    if (col) { const nx = [...col.children].find(x => (x.dataset.ru || x.textContent) === 'Магазин'); if (nx) col.insertBefore(b, nx); }
    b.addEventListener('pointerdown', e => { e.stopPropagation(); open(); });
  });

  // ---------- Альма-матер: вкладка «Герои» (страницы книги даёт alma.js) ----------
  const almaUi = { sel: null };
  function almaPage(l, r) {
    const H = typeof HEROES !== 'undefined' ? HEROES : {}; if (!almaUi.sel || !H[almaUi.sel]) almaUi.sel = HERO_ID;
    if (dirty) save();
    l.innerHTML = ''; r.innerHTML = ''; r.scrollTop = 0;
    const hc = mk('div', 'hc', l);
    for (const id in H) {
      const d = mk('div', 'h' + (id === almaUi.sel ? ' sel' : ''), hc); d.dataset.h = id;
      mk('i', '', d).style.backgroundImage = 'url(' + H[id].portrait + VV + ')';
      mk('b', '', d, H[id].name); mk('span', '', d, '<span>' + H[id].role + '</span> · <span>ур.</span> ' + heroLvl(id));
      tap(d, () => { almaUi.sel = id; almaPage(l, r); });
    }
    mk('div', 'hnote', l, 'Летопись героя ведётся сама и «Новой игрой» не стирается.');
    const id = almaUi.sel, b = D.best[id] || {};
    r.dataset.id = id;
    mk('h3', '', r, H[id].name); mk('div', 'sub', r, H[id].role);
    for (const [title, rows] of groups(id)) { mk('div', 'tg', r, title); for (const x of rows) mk('div', 'tl', r, icon(x[0]) + '<span>' + x[1] + '</span><b>' + x[2] + '</b>'); }
    mk('div', 'tg', r, 'Миры');
    for (let w = 1; w <= 10; w++) if (b[w]) mk('div', 'tl', r, icon('worlds') + '<span>' + (typeof PATHMAP !== 'undefined' && PATHMAP.NAMES ? PATHMAP.NAMES[w - 1] : 'Мир ' + w) + '</span><b>' + b[w].rank + (b[w].t > 0 ? ' · ' + clock(b[w].t) : '') + '</b>');
    if (!Object.keys(b).length) mk('div', 'tl', r, '<span>Пока ни один мир не пройден</span>');
  }

  return { D, T, groups, open, close, summary, closeWin, almaPage, save, fmt, clock, RANK_NAME, get win() { return !!(WIN && WIN.style.display === 'flex'); }, get scr() { return !!(SCR && SCR.style.display === 'flex'); } };
})();
