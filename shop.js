// Волны по кнопке, золото, магазин, фласки, предметы и дроп.
// Вся графика здесь — картинки из папки ui (нарисованы в ChatGPT); кодом выводится только текст.
// Использует из combat.js: P, enemies, wave, spawnWave, say, gdist, rnd, pick, YK, CH, ctx, V.
'use strict';

const ICON = { heal: 0, frost: 1, swift: 2, power: 3, orb: 4, boots: 5, heart: 6, ring: 7, shield: 8,
  coin: 9, pouch: 10, chest: 11, swords: 12, skull: 13, bag: 14, lock: 15 };
const FLASKS = [
  { id: 'heal', name: 'Фласка лечения', desc: '+280 здоровья', price: 30, key: '1' },
  { id: 'frost', name: 'Фласка холода', desc: 'сброс перезарядки', price: 55, key: '2' },
  { id: 'swift', name: 'Фласка скорости', desc: '+45% бега на 8 с', price: 35, key: '3' },
  { id: 'power', name: 'Эликсир силы', desc: '+50% урона на 10 с', price: 60, key: '4' },
];
const ITEMS = [
  { id: 'orb', name: 'Ледяная сфера', desc: '+20% урона', price: 110 },
  { id: 'boots', name: 'Крылатые сапоги', desc: '+10% скорости', price: 90 },
  { id: 'heart', name: 'Рубиновое сердце', desc: '+150 здоровья', price: 100 },
  { id: 'ring', name: 'Сапфировое кольцо', desc: '−12% перезарядки', price: 120 },
  { id: 'shield', name: 'Рунный щит', desc: '−12% урона по герою', price: 110 },
];
const MAXLVL = 3;
const KILL_GOLD = { min: 6, war: 13, mag: 11, rog: 11, boss: 90 };
const BASE_HP = 600;

const SHOP = {
  gold: 0, flasks: { heal: 1, frost: 0, swift: 0, power: 0 }, items: {}, buffs: { swift: 0, power: 0 },
  drops: [], phase: 'rest', restT: 0, open: false, el: {},

  // ----- модификаторы героя от предметов и фласок -----
  recompute() {
    const L = id => SHOP.items[id] || 0, b = SHOP.buffs;
    P.dmgMul = (1 + 0.2 * L('orb')) * (b.power > 0 ? 1.5 : 1) * CFG.units.hero.power;
    P.spdMul = (1 + 0.1 * L('boots')) * (b.swift > 0 ? 1.45 : 1);
    P.cdMul = Math.pow(0.88, L('ring'));
    P.armMul = Math.pow(0.88, L('shield'));
    const mh = Math.round(BASE_HP * CFG.units.hero.hp) + 150 * L('heart');
    if (mh !== P.maxHp) { P.hp = Math.min(mh, P.hp + Math.max(0, mh - P.maxHp)); P.maxHp = mh; }
  },
  itemPrice(it) { return Math.round(it.price * (1 + 0.6 * (SHOP.items[it.id] || 0))); },

  // ----- волны -----
  startWave() {
    if (SHOP.phase !== 'rest' || P.dead > 0) return;
    SHOP.closeShop(); spawnWave(); SHOP.phase = 'fight'; SHOP.refresh();
    snd('wave_horn', 0.8);
  },
  tick(dt) {
    for (const k in SHOP.buffs) if (SHOP.buffs[k] > 0) { SHOP.buffs[k] -= dt; if (SHOP.buffs[k] <= 0) { SHOP.buffs[k] = 0; SHOP.recompute(); } }
    if (SHOP.phase === 'fight' && !enemies.length) {
      SHOP.phase = 'rest'; SHOP.restT = 1.3;
      const bonus = 20 + 6 * wave; SHOP.addGold(bonus);
      say(P.x, P.y - CH * HS() * 1.35, 'Волна ' + wave + ' отбита  +' + bonus, '#ffe9a8');
      SHOP.refresh();
    }
    if (SHOP.restT > 0) { SHOP.restT -= dt; if (SHOP.restT <= 0 && SHOP.phase === 'rest' && wave > 0 && P.dead <= 0) SHOP.openShop(); }
    // дроп: монеты сами летят к герою, остальное подбирается касанием
    for (const d of SHOP.drops) {
      d.t += dt;
      const dist = gdist(P, d);
      if (P.dead > 0) continue;
      if (d.kind === 'coin' && dist < 260 && d.t > 0.35) {
        const k = Math.min(1, 620 * dt / (dist || 1)); d.x += (P.x - d.x) * k; d.y += (P.y - d.y) * k;
      }
      if (dist < 46 && d.t > 0.3) { d.gone = true; SHOP.pick(d); }
    }
    for (let i = SHOP.drops.length - 1; i >= 0; i--) if (SHOP.drops[i].gone || SHOP.drops[i].t > 45) SHOP.drops.splice(i, 1);
    SHOP.pad();
    SHOP.hud();
  },
  onKill(e) {
    const g = Math.round((KILL_GOLD[e.type] || 8) * rnd(0.85, 1.2));
    SHOP.drop('coin', null, e.x, e.y, g);
    if (e.boss) SHOP.drop('chest', null, e.x + 40, e.y + 10);
    else if (Math.random() < 0.05) SHOP.drop('chest', null, e.x + rnd(-30, 30), e.y + rnd(-10, 20));
    else if (Math.random() < 0.1) SHOP.drop('flask', Math.random() < 0.6 ? 'heal' : pick(['frost', 'swift', 'power']), e.x + rnd(-30, 30), e.y + rnd(-10, 20));
  },
  drop(kind, id, x, y, amount) {
    const d = { kind, id, x, y, t: 0, amount, icon: kind === 'coin' ? ICON.coin : kind === 'chest' ? ICON.chest : ICON[id] };
    d.draw = () => SHOP.drawDrop(d);
    SHOP.drops.push(d);
  },
  drawDrop(d) {
    if (!SHOP.icons.complete || !SHOP.icons.naturalWidth) return;
    const s = d.kind === 'coin' ? 34 : d.kind === 'chest' ? 64 : 46, c = SHOP.icons.naturalWidth / 4;
    const hop = d.t < 0.35 ? Math.sin(d.t / 0.35 * Math.PI) * 26 : 0, bob = Math.sin(d.t * 3 + d.x) * 3;
    if (d.t > 40) ctx.globalAlpha = Math.max(0, (45 - d.t) / 5);
    ctx.drawImage(SHOP.icons, (d.icon % 4) * c, Math.floor(d.icon / 4) * c, c, c, d.x - s / 2, d.y - s * 0.85 - hop + bob, s, s);
    ctx.globalAlpha = 1;
  },
  pick(d) {
    if (d.kind === 'coin') {
      SHOP.addGold(d.amount); say(P.x + rnd(-10, 10), P.y - CH * HS() * 0.9, '+' + d.amount, '#ffd95e');
      snd('coins', 0.25, 1.3);   // тихий звон, когда монеты долетели до героя
    }
    else if (d.kind === 'flask') { SHOP.flasks[d.id]++; say(P.x, P.y - CH * HS() * 1.1, FLASKS.find(f => f.id === d.id).name, '#bfe6ff'); }
    else {
      snd('coins', 0.6, 0.85);
      const free = ITEMS.filter(it => (SHOP.items[it.id] || 0) < MAXLVL);
      if (!free.length) { SHOP.addGold(80); say(P.x, P.y - CH * HS() * 1.1, 'Сундук: +80 золота', '#ffd95e'); }
      else { const it = pick(free); SHOP.items[it.id] = (SHOP.items[it.id] || 0) + 1; SHOP.recompute(); say(P.x, P.y - CH * HS() * 1.1, 'Сундук: ' + it.name, '#c9a8ff'); }
    }
    SHOP.refresh();
  },
  addGold(n) { SHOP.gold += n; SHOP.refresh(); },

  // ----- фласки -----
  use(id) {
    if (P.dead > 0 || !SHOP.flasks[id]) return;
    if (id === 'heal') { if (P.hp >= P.maxHp) return; P.hp = Math.min(P.maxHp, P.hp + 280); say(P.x, P.y - CH * HS() * 1.1, '+280', '#7dff8a'); }
    else if (id === 'frost') { for (const k in P.cd) P.cd[k] = 0; say(P.x, P.y - CH * HS() * 1.1, 'Скиллы готовы', '#bfe6ff'); }
    else if (id === 'swift') { SHOP.buffs.swift = 8; say(P.x, P.y - CH * HS() * 1.1, 'Скорость!', '#a8ffb5'); }
    else if (id === 'power') { SHOP.buffs.power = 10; say(P.x, P.y - CH * HS() * 1.1, 'Сила!', '#ffd95e'); }
    SHOP.flasks[id]--; SHOP.recompute(); SHOP.refresh();
    snd('flask', 0.7);
  },

  // ----- покупки -----
  buy(kind, id) {
    if (kind === 'flask') {
      const f = FLASKS.find(x => x.id === id);
      if (SHOP.gold < f.price) return;
      SHOP.gold -= f.price; SHOP.flasks[id]++;
    } else {
      const it = ITEMS.find(x => x.id === id), lvl = SHOP.items[id] || 0, pr = SHOP.itemPrice(it);
      if (lvl >= MAXLVL || SHOP.gold < pr) return;
      SHOP.gold -= pr; SHOP.items[id] = lvl + 1; SHOP.recompute();
    }
    snd('coins', 0.45, 0.9);
    SHOP.refresh();
  },
  openShop() { if (SHOP.phase !== 'rest') return; SHOP.open = true; SHOP.refresh(); },
  closeShop() { SHOP.open = false; SHOP.refresh(); },

  // ----- геймпад: Start — волна, Select — магазин, крестовина — фласки -----
  padPrev: {},
  pad() {
    const gp = PADS[0];   // опрос геймпадов — один раз за кадр в index.html
    if (!gp) return;
    const map = { 9: () => SHOP.startWave(), 8: () => (SHOP.open ? SHOP.closeShop() : SHOP.openShop()),
      12: () => SHOP.use('heal'), 13: () => SHOP.use('frost'), 15: () => SHOP.use('swift'), 14: () => SHOP.use('power') };
    for (const b in map) {
      const on = gp.buttons[b] && gp.buttons[b].pressed;
      if (on && !SHOP.padPrev[b]) map[b]();
      SHOP.padPrev[b] = on;
    }
  },
};

// ---------- интерфейс (DOM поверх игры; все фоны — картинки) ----------
(function buildUI() {
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  SHOP.icons = new Image(); SHOP.icons.src = 'ui/icons.webp' + V;
  // заранее подгружаем фоны магазина, чтобы при первом открытии он не появлялся по частям
  for (const n of ['panel', 'btn_green', 'btn_blue', 'close', 'slot', 'plate', 'wave', 'shop']) { const im = new Image(); im.src = 'ui/' + n + '.webp' + V; (SHOP.pre = SHOP.pre || []).push(im); }
  const css = document.createElement('style');
  css.textContent = `
  .sh, .sh * { box-sizing: border-box; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  .sh { position: fixed; z-index: 6; color: #fff; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
  .ic { background-image: ${U('icons')}; background-size: 400% 400%; background-repeat: no-repeat; }
  .bg { background-size: 100% 100%; background-repeat: no-repeat; background-position: center; }
  .tap { cursor: pointer; touch-action: manipulation; }
  #shGold { top: 44px; left: 8px; width: 150px; height: 30px; background-image: ${U('plate')}; display: flex; align-items: center; justify-content: center; gap: 6px; font: bold 15px system-ui; color: #ffe27a; }
  #shGold .ic { width: 20px; height: 20px; }
  #shBar { left: 50%; bottom: 8px; transform: translateX(-50%); display: flex; gap: 4px; align-items: flex-end; }
  .slot { position: relative; width: 50px; height: 54px; background-image: ${U('slot')}; }
  .slot .ic { position: absolute; left: 17%; top: 17%; width: 66%; height: 66%; }
  .slot b { position: absolute; right: 7px; bottom: 5px; font: bold 13px system-ui; }
  .slot i { position: absolute; left: 7px; top: 4px; font: 11px system-ui; font-style: normal; opacity: .85; }
  .slot.off .ic { opacity: .3; filter: grayscale(1); }
  .slot.buff { filter: drop-shadow(0 0 6px #7fe0ff); }
  .slot.item { width: 40px; height: 43px; }
  #shWave { left: 50%; top: max(34px, 5vh); transform: translateX(-50%); display: none; flex-direction: column; align-items: center; }
  #shWave .row { display: flex; gap: 14px; align-items: center; }
  #shWave .wb { height: min(105px, 19vh); aspect-ratio: 325 / 371; background-image: ${U('wave')}; animation: shPulse 1.6s ease-in-out infinite; }
  #shWave .sb { height: min(68px, 13vh); aspect-ratio: 329 / 363; background-image: ${U('shop')}; }
  #shWave span { font: bold min(16px, 3.6vh) system-ui; margin-top: 1px; }
  @keyframes shPulse { 50% { transform: scale(1.07); } }
  #shBack { inset: 0; z-index: 8; display: none; align-items: center; justify-content: center; }
  #shPanel { position: relative; width: min(96vw, 138vh); aspect-ratio: 3 / 2; background-image: ${U('panel')}; font-size: calc(min(96vw, 138vh) / 62); }
  #shTitle { position: absolute; left: 28%; top: 5.5%; width: 44%; height: 10.5%; display: flex; align-items: center; justify-content: center; gap: .6em; font-weight: bold; font-size: 1.5em; }
  #shTitle .ic { width: 1.3em; height: 1.3em; }
  #shTitle em { font-style: normal; color: #ffe27a; }
  #shGrid { position: absolute; left: 7%; top: 20%; width: 86%; height: 56%; display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: 1fr 1fr; gap: 2% 1.5%; }
  .offer { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 0; }
  .offer .slot { width: 4.4em; height: 4.7em; flex: none; }
  .offer .nm { font-size: .92em; font-weight: bold; margin-top: .15em; white-space: nowrap; }
  .offer .ds { font-size: .78em; opacity: .85; white-space: nowrap; }
  .offer .pr { margin-top: .2em; width: 6.6em; height: 2.2em; background-image: ${U('btn_green')}; display: flex; align-items: center; justify-content: center; gap: .3em; font-weight: bold; font-size: 1em; color: #ffe27a; }
  .offer .pr .ic { width: 1.1em; height: 1.1em; }
  .offer.no .pr { filter: grayscale(1) brightness(.7); }
  #shGo { position: absolute; left: 34%; bottom: 9.5%; width: 32%; height: 10.5%; background-image: ${U('btn_blue')}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.35em; }
  #shClose { position: absolute; right: 2.5%; top: 6%; width: 6%; aspect-ratio: 230 / 244; background-image: ${U('close')}; }
  `;
  document.head.appendChild(css);
  const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; (parent || document.body).appendChild(e); return e; };
  const pos = i => 'background-position:' + (i % 4) * 100 / 3 + '% ' + Math.floor(i / 4) * 100 / 3 + '%';
  const icon = i => '<span class="ic" style="' + pos(i) + ';display:block"></span>';
  // нажатие не должно доходить до игры (иначе герой выстрелит или включится стик)
  const tap = (e, fn) => {
    e.classList.add('tap');
    for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    e.addEventListener('pointerdown', x => { x.stopPropagation(); fn(); });
  };
  const E = SHOP.el;
  E.gold = mk('div', 'sh bg', null, icon(ICON.coin) + '<span>0</span>'); E.gold.id = 'shGold';
  E.bar = mk('div', 'sh'); E.bar.id = 'shBar';
  E.fl = {};
  for (const f of FLASKS) {
    const s = mk('div', 'slot bg', E.bar, icon(ICON[f.id]) + '<i>' + f.key + '</i><b>0</b>');
    s.title = f.name + ': ' + f.desc; tap(s, () => SHOP.use(f.id)); E.fl[f.id] = s;
  }
  E.items = mk('div', '', E.bar); E.items.style.cssText = 'display:flex;gap:3px;margin-left:8px';
  E.wave = mk('div', 'sh'); E.wave.id = 'shWave';
  const row = mk('div', 'row', E.wave);
  tap(mk('div', 'wb bg', row), () => SHOP.startWave());
  tap(mk('div', 'sb bg', row), () => SHOP.openShop());
  E.waveTxt = mk('span', '', E.wave);
  E.back = mk('div', 'sh'); E.back.id = 'shBack';
  for (const ev of ['touchstart', 'mousedown', 'pointerdown']) E.back.addEventListener(ev, x => x.stopPropagation(), { passive: true });
  const p = mk('div', 'bg', E.back); p.id = 'shPanel';
  E.title = mk('div', '', p, 'Магазин ' + icon(ICON.coin) + '<em>0</em>'); E.title.id = 'shTitle';
  const grid = mk('div', '', p); grid.id = 'shGrid';
  E.offers = [];
  const addOffer = (kind, o) => {
    const d = mk('div', 'offer', grid, '<div class="slot bg">' + icon(ICON[o.id]) + '<b></b></div><div class="nm">' + o.name + '</div><div class="ds">' + o.desc + '</div><div class="pr bg">' + icon(ICON.coin) + '<span></span></div>');
    tap(d, () => SHOP.buy(kind, o.id)); E.offers.push({ d, kind, o });
  };
  for (const f of FLASKS) addOffer('flask', f);
  mk('div', 'offer', grid);                       // пустая пятая клетка в ряду фласок
  for (const it of ITEMS) addOffer('item', it);
  E.go = mk('div', 'bg', p); E.go.id = 'shGo'; tap(E.go, () => SHOP.startWave());
  E.close = mk('div', 'bg', p); E.close.id = 'shClose'; tap(E.close, () => SHOP.closeShop());

  const ROM = ['', 'I', 'II', 'III'];
  SHOP.refresh = () => {
    E.gold.lastChild.textContent = SHOP.gold;
    E.title.querySelector('em').textContent = SHOP.gold;
    for (const f of FLASKS) { const s = E.fl[f.id], n = SHOP.flasks[f.id]; s.querySelector('b').textContent = n; s.classList.toggle('off', !n); }
    // ячейки предметов перестраиваем, только когда набор поменялся (refresh зовётся на каждую монету)
    const ih = ITEMS.filter(it => SHOP.items[it.id]).map(it => '<div class="slot item bg" title="' + it.name + ': ' + it.desc + '">' + icon(ICON[it.id]) + '<b>' + ROM[SHOP.items[it.id]] + '</b></div>').join('');
    if (ih !== E.itemsHtml) { E.items.innerHTML = ih; E.itemsHtml = ih; }
    const rest = SHOP.phase === 'rest';
    E.wave.style.display = rest && !SHOP.open ? 'flex' : 'none';
    E.waveTxt.textContent = 'Начать волну ' + (wave + 1);
    E.go.textContent = 'В бой — волна ' + (wave + 1);
    E.back.style.display = SHOP.open ? 'flex' : 'none';
    for (const { d, kind, o } of E.offers) {
      const lvl = kind === 'item' ? SHOP.items[o.id] || 0 : SHOP.flasks[o.id], max = kind === 'item' && lvl >= MAXLVL;
      const pr = kind === 'item' ? SHOP.itemPrice(o) : o.price;
      d.querySelector('.slot b').textContent = kind === 'item' ? ROM[lvl] : lvl ? '×' + lvl : '';
      d.querySelector('.pr span').textContent = max ? 'макс.' : pr;
      d.classList.toggle('no', max || SHOP.gold < pr);
    }
  };
  // подсветка действующих фласок обновляется каждый кадр
  SHOP.hud = () => {
    E.fl.swift.classList.toggle('buff', SHOP.buffs.swift > 0);
    E.fl.power.classList.toggle('buff', SHOP.buffs.power > 0);
  };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'KeyG') SHOP.startWave();
    if (e.code === 'KeyB') SHOP.open ? SHOP.closeShop() : SHOP.openShop();
    if (e.code === 'Escape') SHOP.closeShop();
    const f = FLASKS.find(x => 'Digit' + x.key === e.code);
    if (f) SHOP.use(f.id);
  });
  SHOP.recompute(); SHOP.refresh();
})();
