// Междумирье v2 (v122, задание Клауди 25.11): Альма-матер и Зал трофеев.
//   Альма-матер — справочник в раскрытой книге: боссы, мини-боссы, враги, предметы (со склянками). Запись открывается, когда герой
//   впервые встретил врага (тот вышел на арену) или получил предмет; до этого — тёмный силуэт и «???».
//   Зал трофеев — витрина побед: 10 постаментов (трофей босса встаёт после победы), 30 медальонов мини-боссов, рекорды.
//   Трофеи ничего не дают — ни статов, ни золота.
// Картинки — Клауди/ChatGPT (alma/: book, hall, t_<id босса>; фон площади — limbo/bg). Портреты врагов — кадр стойки из их же листов
// (chars/at_*_idle), силуэт — тот же кадр, затемнённый стилем. Игра ничего не дорисовывает; рамки и плашки — готовые ui/*.
// Тексты боссов и мини-боссов — alma/texts.js (tools/alma_prep.py из alma_texts.json), остальное — из данных игры (KIND, ALL, FLASKS).
// Память — ключ hw_alma (общая для всех героев, «Новая игра» её не стирает; в приложении дублируется, как все hw_*):
//   seen {id врага: 1}, items {id предмета | 'f:'+id склянки: 1}, boss {id: {d дата, hero, sec — первая победа, best — лучшее время}},
//   mini {id: 1}, rec {wave, crit, ws {мир: сек}, nd {мир: 1}}, run {w, t, deaths} — идущий мир (для «самого быстрого» и «без смертей»).
// Мир на время считается, только если начат с первой волны; время — боевое (отдых и лавка не идут в счёт).
// Экраны открывает limbo.js (подошёл к месту), как кузницу и лавку. Файл подключён ДО dmgshow.js: тот забирает цифры критов себе.
'use strict';
const ALMA = (() => {
  const KEY = 'hw_alma', CRIT = '#ffd23a';
  const T = typeof ALMA_TEXTS !== 'undefined' ? ALMA_TEXTS : { bosses: [], minibosses: [] };
  const BOSS = {}, MINI = {}; T.bosses.forEach(b => { BOSS[b.id] = b; }); T.minibosses.forEach(b => { MINI[b.id] = b; });
  let D = { seen: {}, items: {}, boss: {}, mini: {}, rec: { wave: 0, crit: 0, ws: {}, nd: {} }, run: null };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && typeof d === 'object') { D = Object.assign(D, d); D.rec = Object.assign({ wave: 0, crit: 0, ws: {}, nd: {} }, d.rec || {}); for (const k of ['seen', 'items', 'boss', 'mini']) D[k] = D[k] || {}; } } catch (e) {}
  let dirty = false, saveT = 0;
  const save = () => { dirty = false; try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) {} };
  const touch = () => { dirty = true; };
  addEventListener('pagehide', () => { if (dirty) save(); });
  const online = () => !!(window.NETC && NETC.on);
  const baseOf = t => (KIND[t] && KIND[t].base) || t;
  const worldOf = w => (Math.ceil(w / 10) - 1) % 10 + 1;
  const heroName = () => (typeof HEROES !== 'undefined' && HEROES[HERO_ID] ? HEROES[HERO_ID].name : '');

  // ---------- что запоминаем ----------
  function meet(type) { const id = baseOf(type); if (!D.seen[id]) { D.seen[id] = 1; touch(); } }
  function killed(e) {
    const id = baseOf(e.type), sec = Math.max(1, Math.round(e.almaT || 0));
    if (MINI[id]) { if (!D.mini[id]) { D.mini[id] = 1; touch(); } return; }
    const b = BOSS[id]; if (!b) return;
    const r = D.boss[id];
    if (!r) D.boss[id] = { d: Date.now(), hero: heroName(), sec, best: sec }; else if (sec < (r.best || 1e9)) r.best = sec;
    const run = D.run;
    if (run && run.w === b.world) {
      const t = Math.round(run.t); if (!D.rec.ws[b.world] || t < D.rec.ws[b.world]) D.rec.ws[b.world] = t;
      if (!run.deaths) D.rec.nd[b.world] = 1;
    }
    D.run = null; touch(); save();
  }
  let phase0 = 'rest', dead0 = false;
  function track(dt) {
    if (dirty && (saveT += dt) > 3) { saveT = 0; save(); }
    if (online() || typeof SHOP === 'undefined') return;
    const limbo = typeof LIMBO !== 'undefined' && LIMBO.on, dead = P.dead > 0, ph = SHOP.phase;
    for (const e of enemies) if ((e.boss || e.mini) && e.hp > 0) e.almaT = (e.almaT || 0) + dt;
    if (!limbo) {
      if (ph === 'fight' && phase0 !== 'fight' && (wave - 1) % 10 === 0 && wave > 0) { D.run = { w: worldOf(wave), t: 0, deaths: 0 }; touch(); }
      if (ph === 'fight' && D.run && !dead) D.run.t += dt;
      if (dead && !dead0 && D.run) { D.run.deaths++; touch(); }
      if (ph === 'rest' && phase0 === 'fight' && !dead && wave > (D.rec.wave || 0)) { D.rec.wave = wave; touch(); }
      phase0 = ph;
    }
    dead0 = dead;
  }
  {
    const _sb = spawnEnemyBase; spawnEnemyBase = function (type) { const r = _sb.apply(this, arguments); try { const e = enemies[enemies.length - 1]; if (e) meet(e.type); } catch (x) {} return r; };
    const _he = hurtEnemy;
    hurtEnemy = function (e) {
      const was = e && e.hp > 0, n0 = texts.length, r = _he.apply(this, arguments);
      try {
        for (let i = n0; i < texts.length; i++) { const t = texts[i]; if (t.col === CRIT && /^\d+$/.test(String(t.txt)) && +t.txt > (D.rec.crit || 0) && !online()) { D.rec.crit = +t.txt; touch(); } }
        if (was && e.hp <= 0 && !e.clone && (e.boss || e.mini) && !online()) killed(e);
      } catch (x) {}
      return r;
    };
    const _cu = combatUpdate; combatUpdate = function (dt) { _cu(dt); try { track(dt); } catch (x) {} };
    const _rc = SHOP.recompute; SHOP.recompute = function () {
      const r = _rc.apply(this, arguments);
      try { for (const id of SHOP.bag) if (!D.items[id]) { D.items[id] = 1; touch(); } for (const id in SHOP.flasks) if (SHOP.flasks[id] > 0 && !D.items['f:' + id]) { D.items['f:' + id] = 1; touch(); } } catch (x) {}
      return r;
    };
  }

  // ---------- портрет врага: кадр стойки из его листа ----------
  const PIM = {}, PCV = {};
  function portrait(type, S, mode) {
    const key = type + '|' + S + '|' + mode; if (PCV[key]) return PCV[key];
    const cv = PCV[key] = document.createElement('canvas'); cv.width = cv.height = S;
    const k = KIND[type], c = k && (CHARS[k.chBase || k.ch] || CHARS[k.ch]); if (!c || !c.mul) return cv;
    const a = c.mul.idle || c.mul.run, A = a && ATLAS[a.at]; if (!A) return cv;
    const draw = img => {
      const g = cv.getContext('2d'), vs = Math.max(40, c.top * 100 / c.k);      // рост фигуры в пикселях листа
      g.clearRect(0, 0, S, S);
      if (mode === 'head') { const sc = S / (vs * 0.62); drawCell(g, img, a.at, 0, 0, S / 2 - A.cell * sc / 2, S * 0.05 - (a.foot - vs) * sc, A.cell * sc); }
      else { const sc = S * 0.92 / vs; drawCell(g, img, a.at, 0, 0, S / 2 - A.cell * sc / 2, S * 0.97 - a.foot * sc, A.cell * sc); }
    };
    if (a.ok && a.img) { draw(a.img); return cv; }
    let im = PIM[a.at]; if (!im) { im = PIM[a.at] = new Image(); im.src = 'chars/at_' + a.at + '.webp' + V; }
    const go = () => { draw(im); delete PIM[a.at]; };      // лист больше не нужен — портрет остался в маленьком холсте
    if (im.complete && im.naturalWidth) go(); else im.addEventListener('load', go);
    return cv;
  }

  // ---------- общее для двух экранов ----------
  const U = n => 'url(' + n + '.webp' + V + ')';
  const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
  const tap = (e, fn) => e.addEventListener('pointerdown', x => { x.stopPropagation(); x.preventDefault(); fn(x); });
  const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const css = document.createElement('style');
  css.textContent = `
  .alma { position: fixed; inset: 0; z-index: 9; display: none; align-items: center; justify-content: center; background: #07060c; user-select: none; -webkit-user-select: none; touch-action: none; }
  .alma .bx { position: relative; aspect-ratio: 1672 / 941; width: min(100vw, calc(100vh * 1672 / 941)); background: center / 100% 100% no-repeat; font: 2.2em Georgia, serif; }
  .alma .x { position: absolute; right: 1.2%; top: 1.6%; width: 4.6%; aspect-ratio: 230 / 244; background: ${U('ui/close')} center / 100% 100% no-repeat; cursor: pointer; z-index: 3; }
  .alma .lock { filter: brightness(0); opacity: .62; }
  /* книга */
  #almaBook .tabs { position: absolute; left: 0; right: 0; top: 1.4%; display: flex; justify-content: center; gap: .9em; }
  #almaBook .tabs div { width: 8.6em; height: 2.3em; background: ${U('ui/btn_blue')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold .95em system-ui, sans-serif; color: #e9f1ff; filter: brightness(.8); cursor: pointer; }
  #almaBook .tabs div.on { background-image: ${U('ui/btn_green')}; filter: none; color: #ffe27a; }
  #almaBook .pg { position: absolute; top: 15.2%; height: 58.6%; color: #3a2412; }
  #almaBook .pg.l { left: 14.4%; width: 31.6%; }
  #almaBook .pg.r { left: 53.8%; width: 32.6%; overflow-y: auto; overflow-x: hidden; touch-action: pan-y; }
  #almaBook .grid { display: grid; grid-template-columns: repeat(5, 1fr); grid-auto-rows: 5.55em; gap: .25em .3em; }
  #almaBook .c { position: relative; display: flex; flex-direction: column; align-items: center; border-radius: .4em; cursor: pointer; }
  #almaBook .c.sel { background: rgba(120, 70, 20, .18); box-shadow: 0 0 0 .1em rgba(120, 70, 20, .55); }
  #almaBook .c canvas, #almaBook .c .ci { width: 4.1em; height: 4.1em; }
  #almaBook .c .nm { font-size: .6em; line-height: 1.05; text-align: center; max-height: 2.2em; overflow: hidden; margin-top: .1em; }
  #almaBook .pager { position: absolute; left: 0; right: 0; bottom: -4.6em; display: flex; align-items: center; justify-content: center; gap: 1.2em; font-size: .8em; }
  #almaBook .pager .ar { width: 2.6em; height: 2.6em; background: ${U('ui/arrow')} center / contain no-repeat; cursor: pointer; }
  #almaBook .pager .ar.p { transform: scaleX(-1); }
  #almaBook .pager .ar.no { opacity: .25; pointer-events: none; }
  #almaBook .r h3 { margin: 0; font: bold 1.35em Georgia, serif; color: #5a1f10; }
  #almaBook .r .sub { font-style: italic; font-size: .92em; margin-top: .15em; }
  #almaBook .r .ln { font-size: .86em; margin-top: .3em; }
  #almaBook .r .ln b { color: #5a1f10; }
  #almaBook .r .pic { float: right; width: 8.6em; height: 8.6em; margin: 0 0 .2em .5em; }
  #almaBook .r .pic.ci { width: 5em; height: 5em; }
  #almaBook .r p { font-size: .85em; line-height: 1.27; margin: .55em 0 0; text-align: justify; }
  #almaBook .r .sk { clear: both; font-size: .85em; margin-top: .6em; }
  #almaBook .r .sk i { display: block; font-style: normal; padding-left: .9em; text-indent: -.9em; margin-top: .12em; }
  #almaBook .r .rc { display: flex; flex-wrap: wrap; gap: .3em .7em; margin-top: .3em; align-items: center; }
  #almaBook .r .rc .ci { width: 2.4em; height: 2.4em; flex: none; }
  #almaBook .r .rc span { display: flex; align-items: center; gap: .3em; }
  /* зал */
  #almaHall .tr { position: absolute; transform: translateX(-50%); cursor: pointer; }
  #almaHall .tr img { height: 100%; display: block; pointer-events: none; }
  #almaHall .tr.win img { filter: drop-shadow(0 0 .5em rgba(255, 220, 140, .55)); }
  #almaHall .md { position: absolute; left: 50%; bottom: 1.6%; transform: translateX(-50%); padding: .5em .8em .45em; border-radius: .6em; background: rgba(10, 6, 22, .62); border: .08em solid rgba(201, 162, 74, .55); }
  #almaHall .md .ti { font: bold .62em system-ui, sans-serif; color: #e8d6a8; text-align: center; margin-bottom: .3em; letter-spacing: .08em; }
  #almaHall .md .rw { display: grid; grid-template-columns: repeat(15, 2.75em); gap: .25em .3em; }
  #almaHall .m { position: relative; width: 2.75em; height: 2.75em; border-radius: 50%; background: #1a1428; box-shadow: 0 0 0 .12em #c9a24a, 0 0 0 .2em #3a2a10; overflow: hidden; cursor: pointer; }
  #almaHall .m canvas { width: 100%; height: 100%; display: block; }
  #almaHall .m.no { box-shadow: 0 0 0 .12em #5b5266, 0 0 0 .2em #17131f; }
  #almaHall .rb { position: absolute; left: 1.4%; top: 2%; width: 11em; height: 3.1em; background: ${U('ui/h_button')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold .86em Georgia, serif; color: #fff; text-shadow: 0 .1em .2em #000; cursor: pointer; z-index: 3; }
  #almaHall .ttl { position: absolute; left: 0; right: 0; top: 2.6%; text-align: center; font: bold 1.5em Georgia, serif; color: #ffe9a8; text-shadow: 0 0 .5em #000, 0 .1em .2em #000; pointer-events: none; }
  #almaHall .card { position: absolute; left: 50%; top: 47%; transform: translate(-50%, -50%); width: 30em; padding: 3.3em 3.8em 3em; background: ${U('ui/panel')} center / 100% 100% no-repeat; color: #f3e6c4; display: none; z-index: 4; font-size: .92em; }
  #almaHall .card h3 { margin: 0 0 .5em; font: bold 1.3em Georgia, serif; color: #ffe27a; text-align: center; }
  #almaHall .card .ln { display: flex; justify-content: space-between; gap: 1em; margin-top: .42em; font-size: .86em; }
  #almaHall .card .ln b { color: #ffe9a8; text-align: right; }
  #almaHall .card .nt { margin-top: .9em; font-size: .72em; opacity: .75; text-align: center; font-style: italic; }
  #almaHall .card .cx { position: absolute; right: 3%; top: 5%; width: 7%; aspect-ratio: 230 / 244; background: ${U('ui/close')} center / 100% 100% no-repeat; cursor: pointer; }
  `;
  document.head.appendChild(css);
  function screen(id, bg) {
    const el = mk('div', 'alma', document.body); el.id = id;
    const bx = mk('div', 'bx', el); bx.style.backgroundImage = U(bg);
    for (const ev of ['touchstart', 'mousedown', 'pointerdown', 'pointerup', 'click', 'wheel']) el.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    const fit = () => { bx.style.fontSize = bx.clientHeight * 0.022 + 'px'; };
    addEventListener('resize', () => { if (el.style.display === 'flex') fit(); });
    tap(mk('div', 'x', bx), close);
    return { el, bx, fit };
  }
  let BK = null, HL = null, cur = null;
  function close() { if (BK) BK.el.style.display = 'none'; if (HL) HL.el.style.display = 'none'; cur = null; for (const k in PIM) delete PIM[k]; }

  // ---------- Альма-матер ----------
  const TABS = [['boss', 'Боссы'], ['mini', 'Мини-боссы'], ['foe', 'Враги'], ['item', 'Предметы']];
  const PER = 20, ui = { tab: 'boss', page: 0, sel: null };
  const LISTS = {};
  function list(tab) {
    if (LISTS[tab]) return LISTS[tab];
    let L = [];
    if (tab === 'boss') L = T.bosses.map(b => ({ k: 'b', id: b.id }));
    else if (tab === 'mini') L = T.minibosses.map(b => ({ k: 'm', id: b.id }));
    else if (tab === 'foe') { const seen = {}; for (let w = 1; w <= 10; w++) { const R = ROSTER[w]; if (!R) continue; for (const [arr, el] of [[R.mel, 0], [R.rng, 0], [R.elite, 1]]) for (const id of arr || []) if (!seen[id] && KIND[id]) { seen[id] = 1; L.push({ k: 'e', id, w, el }); } } }
    else { for (const id of Object.keys(PARTS).concat(Object.keys(RECIPES))) L.push({ k: 'i', id }); if (typeof RELICS !== 'undefined') for (const id in RELICS) L.push({ k: 'i', id }); for (const f of FLASKS) L.push({ k: 'f', id: f.id }); }
    return (LISTS[tab] = L);
  }
  const isOpen = e => e.k === 'i' ? !!D.items[e.id] : e.k === 'f' ? !!D.items['f:' + e.id] : !!D.seen[e.id];
  const kindName = id => { const n = KIND[id] && KIND[id].nm; return Array.isArray(n) ? n[0] : n || id; };
  const nameOf = e => e.k === 'b' ? BOSS[e.id].name : e.k === 'm' ? MINI[e.id].name : e.k === 'e' ? kindName(e.id) : e.k === 'f' ? FLASKS.find(f => f.id === e.id).name : ALL[e.id].nm;
  const iconOf = e => e.k === 'f' ? SHOP.iconHtml(ICON[e.id]) : SHOP.itemIcon(ALL[e.id]);
  function pic(e, S, cls) {
    if (e.k === 'i' || e.k === 'f') { const d = document.createElement('div'); d.className = 'ci ' + (cls || ''); d.innerHTML = iconOf(e); return d; }
    const cv = portrait(e.id, S, 'full'); cv.className = cls || ''; return cv;
  }
  function openBook() {
    if (!BK) {
      BK = screen('almaBook', 'alma/book');
      BK.tabs = mk('div', 'tabs', BK.bx); BK.tabEls = TABS.map(([id, nm]) => { const d = mk('div', '', BK.tabs, nm); tap(d, () => { ui.tab = id; ui.page = 0; ui.sel = null; drawBook(); }); return d; });
      BK.l = mk('div', 'pg l', BK.bx); BK.r = mk('div', 'pg r', BK.bx);
    }
    close(); BK.el.style.display = 'flex'; cur = 'book'; BK.fit(); drawBook();
  }
  function drawBook() {
    const L = list(ui.tab), pages = Math.max(1, Math.ceil(L.length / PER)); ui.page = Math.max(0, Math.min(pages - 1, ui.page));
    BK.tabEls.forEach((d, i) => d.classList.toggle('on', TABS[i][0] === ui.tab));
    const part = L.slice(ui.page * PER, ui.page * PER + PER);
    if (!ui.sel || !part.includes(ui.sel)) ui.sel = part.find(isOpen) || part[0] || null;
    BK.l.innerHTML = ''; const g = mk('div', 'grid', BK.l);
    for (const e of part) {
      const o = isOpen(e), c = mk('div', 'c' + (e === ui.sel ? ' sel' : ''), g); c.dataset.id = e.id; c.dataset.open = o ? 1 : 0;
      const p = pic(e, 96); if (!o) p.classList.add('lock'); else p.classList.remove('lock'); c.appendChild(p);
      mk('div', 'nm', c, o ? esc(nameOf(e)) : '???');
      tap(c, () => { ui.sel = e; drawBook(); });
    }
    const pg = mk('div', 'pager', BK.l), a = mk('div', 'ar p' + (ui.page > 0 ? '' : ' no'), pg);
    mk('div', 'cnt', pg, '<span>Открыто</span> <b>' + L.filter(isOpen).length + '</b> <span>из</span> <b>' + L.length + '</b> · <span>стр.</span> ' + (ui.page + 1) + '/' + pages);
    const b = mk('div', 'ar n' + (ui.page < pages - 1 ? '' : ' no'), pg);
    tap(a, () => { ui.page--; ui.sel = null; drawBook(); }); tap(b, () => { ui.page++; ui.sel = null; drawBook(); });
    drawEntry();
  }
  const ln = (p, label, val) => mk('div', 'ln', p, '<span>' + label + '</span>: <b>' + val + '</b>');
  const world = (p, w) => mk('div', 'ln', p, '<span>Мир</span> <b>' + w + '</b> · <span>' + esc(WORLDS[w - 1] ? WORLDS[w - 1].name : '') + '</span>');
  function drawEntry() {
    const R = BK.r, e = ui.sel; R.innerHTML = ''; R.scrollTop = 0; if (!e) return;
    R.dataset.id = e.id;
    if (!isOpen(e)) {
      const p = pic(e, 220, 'pic lock'); R.appendChild(p);
      mk('h3', '', R, '???');
      mk('p', '', R, e.k === 'i' || e.k === 'f' ? 'Запись откроется, когда герой получит этот предмет.' : 'Запись откроется, когда герой встретит этого врага в бою.');
      return;
    }
    const p = pic(e, 220, 'pic'); p.classList.remove('lock'); R.appendChild(p);
    if (e.k === 'b' || e.k === 'm') {
      const t = e.k === 'b' ? BOSS[e.id] : MINI[e.id], k = KIND[e.id];
      mk('h3', '', R, esc(t.name));
      if (t.title) mk('div', 'sub', R, esc(t.title));
      if (t.game_name) ln(R, 'В бою', '<span>' + esc(t.game_name) + '</span>');
      world(R, t.world);
      if (k) stats(R, k);
      mk('p', '', R, esc(t.lore));
      const s = mk('div', 'sk', R, '<b><span>Умения</span>:</b>'); for (const x of t.skills || []) mk('i', '', s, '• <span>' + esc(x) + '</span>');
    } else if (e.k === 'e') {
      const k = KIND[e.id], n = k.nm;
      mk('h3', '', R, esc(kindName(e.id)));
      if (Array.isArray(n) && n[1]) mk('div', 'sub', R, esc(n[1]));
      ln(R, 'Тип', '<span>' + (e.el ? 'Элита' : k.rng ? 'Стрелок' : 'Ближний бой') + '</span>');
      world(R, e.w); stats(R, k);
    } else if (e.k === 'f') {
      const f = FLASKS.find(x => x.id === e.id);
      mk('h3', '', R, esc(f.name)); mk('div', 'sub', R, 'Склянка');
      mk('p', '', R, esc(f.desc)); if (typeof FLASK_AUTO !== 'undefined' && FLASK_AUTO[f.id]) mk('p', '', R, esc(FLASK_AUTO[f.id]));
    } else {
      const it = ALL[e.id];
      mk('h3', '', R, esc(it.nm)); mk('div', 'sub', R, it.relic ? 'Реликвия' : RECIPES[e.id] ? 'Предмет' : 'Часть предмета');
      const tx = it.relic ? ((statText(it.st) ? statText(it.st) + '; ' : '') + it.ds) : itemText(it); if (tx) mk('p', '', R, esc(tx));
      if (it.relic && it.boss) ln(R, 'Против босса', '<span>' + esc(it.boss) + '</span>');
      ln(R, 'Цена', (it.relic ? it.pr : fullPrice(e.id)) + ' <span>золота</span>');
      if (RECIPES[e.id] && RECIPES[e.id].from) {
        const s = mk('div', 'sk', R, '<b><span>Собирается из</span>:</b>'), rc = mk('div', 'rc', s);
        for (const id of RECIPES[e.id].from) { const o = !!D.items[id], x = mk('span', '', rc); const ic = mk('div', 'ci' + (o ? '' : ' lock'), x, SHOP.itemIcon(ALL[id])); mk('span', '', x, o ? esc(ALL[id].nm) : '???'); }
      }
    }
  }
  function stats(R, k) { const d = k.dmg || []; mk('div', 'ln', R, '<span>Здоровье</span> <b>' + k.hp + '</b> · <span>Урон</span> <b>' + (d.length > 1 && d[0] !== d[1] ? d[0] + '–' + d[1] : d[0] || 0) + '</b> <span>(в начале пути)</span>'); }

  // ---------- Зал трофеев ----------
  // постаменты на картинке зала (в долях её ширины и высоты): верхний ряд — миры 1–5, нижний — 6–10
  const PED = [[0.2213, 0.497], [0.3648, 0.497], [0.5012, 0.497], [0.6388, 0.497], [0.7793, 0.497], [0.1812, 0.682], [0.3415, 0.682], [0.5012, 0.682], [0.6609, 0.682], [0.8212, 0.682]];
  const TRH = [5.5, 6.9];      // высота трофея на дальнем и ближнем ряду (в em экрана)
  const date = ms => { const d = new Date(ms), z = n => (n < 10 ? '0' : '') + n; return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear(); };
  const mmss = s => Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  function openHall() {
    if (!HL) {
      HL = screen('almaHall', 'alma/hall');
      mk('div', 'ttl', HL.bx, 'Зал трофеев');
      HL.box = mk('div', '', HL.bx);
      tap(mk('div', 'rb', HL.bx, 'Рекорды'), records);
      HL.card = mk('div', 'card', HL.bx);
    }
    close(); HL.el.style.display = 'flex'; cur = 'hall'; HL.fit(); HL.card.style.display = 'none'; drawHall();
  }
  function drawHall() {
    const B = HL.box; B.innerHTML = '';
    T.bosses.forEach((b, i) => {
      const p = PED[b.world - 1] || PED[i], win = !!D.boss[b.id], h = TRH[b.world > 5 ? 1 : 0];
      const d = mk('div', 'tr' + (win ? ' win' : ''), B); d.dataset.id = b.id; d.dataset.win = win ? 1 : 0;
      d.style.cssText = 'left:' + p[0] * 100 + '%;bottom:' + (1 - p[1]) * 100 + '%;height:' + h + 'em';
      const im = mk('img', win ? '' : 'lock', d); im.alt = ''; im.draggable = false; im.src = 'alma/t_' + b.id + '.webp' + V;
      tap(d, () => trophyCard(b));
    });
    const md = mk('div', 'md', B); mk('div', 'ti', md, '<span>Мини-боссы</span> · <b>' + T.minibosses.filter(m => D.mini[m.id]).length + '</b> / ' + T.minibosses.length);
    const rw = mk('div', 'rw', md);
    for (const m of T.minibosses) {
      const win = !!D.mini[m.id], d = mk('div', 'm' + (win ? '' : ' no'), rw); d.dataset.id = m.id; d.dataset.win = win ? 1 : 0;
      const cv = portrait(m.id, 96, 'head'); cv.className = win ? '' : 'lock'; d.appendChild(cv);
      tap(d, () => miniCard(m));
    }
  }
  function card(title, rows, note) {
    const C = HL.card; C.innerHTML = ''; mk('h3', '', C, title);
    for (const [a, b] of rows) mk('div', 'ln', C, '<span>' + a + '</span><b>' + b + '</b>');
    if (note) mk('div', 'nt', C, note);
    tap(mk('div', 'cx', C), () => { C.style.display = 'none'; }); C.style.display = 'block';
  }
  const S = t => '<span>' + esc(t) + '</span>';
  function trophyCard(b) {
    const r = D.boss[b.id], met = !!D.seen[b.id];
    const rows = [['Мир', b.world + ' · ' + S(b.world_name)], ['Босс', met || r ? S(b.name) : '???']];
    if (met || r) rows.push(['В бою', S(b.game_name)]);
    if (r) { rows.push(['Побеждён', date(r.d)], ['Герой', S(r.hero || '—')], ['Бой', r.sec + ' ' + S('с')]); if (r.best && r.best < r.sec) rows.push(['Лучшее время', r.best + ' ' + S('с')]); }
    card(r ? S(b.trophy) : '???', rows, r ? '' : 'Трофей появится на постаменте после победы над боссом.'); HL.card.dataset.id = b.id;
  }
  function miniCard(m) {
    const win = !!D.mini[m.id], met = !!D.seen[m.id];
    card(met || win ? S(m.name) : '???', [['Мир', m.world + ' · ' + S(m.world_name)], ['Мини-босс', S(win ? 'побеждён' : met ? 'встречен, не побеждён' : 'ещё не встречен')]], ''); HL.card.dataset.id = m.id;
  }
  function records() {
    const r = D.rec, ws = Object.keys(r.ws || {}).map(Number).sort((a, b) => r.ws[a] - r.ws[b]), nd = Object.keys(r.nd || {}).map(Number).sort((a, b) => a - b), w = r.wave || 0;
    card(S('Рекорды'), [
      ['Лучшая волна', w ? w + ' (' + S('мир') + ' ' + worldOf(w) + ')' : '—'],
      ['Самый быстрый мир', ws.length ? S('мир') + ' ' + ws[0] + ' — ' + mmss(r.ws[ws[0]]) : '—'],
      ['Самый сильный крит', r.crit ? String(r.crit) : '—'],
      ['Миров без смертей', nd.length + ' ' + S('из') + ' 10' + (nd.length ? ' (' + nd.join(', ') + ')' : '')],
      ['Боссов побеждено', Object.keys(D.boss).length + ' ' + S('из') + ' ' + T.bosses.length],
      ['Мини-боссов побеждено', Object.keys(D.mini).length + ' ' + S('из') + ' ' + T.minibosses.length],
    ], 'Трофеи не дают бонусов — это витрина побед.'); HL.card.dataset.id = 'rec';
  }
  return { openBook, openHall, close, D: () => D, save, list, isOpen, portrait, get cur() { return cur; }, ui };
})();
