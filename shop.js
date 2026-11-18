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
  { id: 'mana', name: 'Фласка маны', desc: '+220 маны', price: 30, key: '5' },
];
ICON.mana = 'mana';   // своя картинка ui/i_mana.webp, а не клетка общего листа иконок
const MANA_ICON = new Image(); MANA_ICON.src = 'ui/i_mana.webp' + V;
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
  gold: 0, flasks: { heal: 1, frost: 0, swift: 0, power: 0, mana: 0 }, items: {}, buffs: { swift: 0, power: 0 },
  drops: [], phase: 'rest', restT: 0, open: false, el: {},

  // ----- модификаторы героя от предметов и фласок -----
  recompute() {
    const L = id => SHOP.items[id] || 0, b = SHOP.buffs;
    // уровень героя: +1,5% урона и +10 здоровья за каждый (до 100); сила, ловкость и интеллект — из progress.js
    const st = P.st || {}, str = st.str || 0, agi = st.agi || 0, int = st.int || 0;
    P.dmgMul = (1 + 0.2 * L('orb')) * (b.power > 0 ? 1.5 : 1) * CFG.units.hero.power * (1 + 0.015 * (P.lvl - 1)) * (1 + 0.006 * str);
    P.spdMul = (1 + 0.1 * L('boots')) * (b.swift > 0 ? 1.45 : 1) * (1 + 0.006 * agi);
    P.atkSpd = 1 + 0.015 * agi;
    P.skMul = 1 + 0.015 * int;
    P.mpRegen = 11 + 0.35 * int;
    const mm = 420 + 12 * int;
    if (mm !== P.maxMp) { P.mp = Math.min(mm, P.mp + Math.max(0, mm - P.maxMp)); P.maxMp = mm; }
    P.cdMul = Math.pow(0.88, L('ring'));
    P.armMul = Math.pow(0.88, L('shield'));
    const mh = Math.round((P.baseHp || BASE_HP) * CFG.units.hero.hp) + 150 * L('heart') + 10 * (P.lvl - 1) + 8 * str;
    if (mh !== P.maxHp) { P.hp = Math.min(mh, P.hp + Math.max(0, mh - P.maxHp)); P.maxHp = mh; }
  },
  itemPrice(it) { return Math.round(it.price * (1 + 0.6 * (SHOP.items[it.id] || 0))); },

  // ----- волны -----
  startWave() {
    if (SHOP.phase !== 'rest' || P.dead > 0) return;
    SHOP.roundFrom = wave + 1;
    SHOP.closeShop(); spawnWave(); SHOP.phase = 'fight'; SHOP.refresh();
    snd('wave_horn', 0.8);
  },
  tick(dt) {
    for (const k in SHOP.buffs) if (SHOP.buffs[k] > 0) { SHOP.buffs[k] -= dt; if (SHOP.buffs[k] <= 0) { SHOP.buffs[k] = 0; SHOP.recompute(); } }
    if (SHOP.phase === 'fight' && !enemies.length && !(typeof roundActive === 'function' && roundActive())) {
      SHOP.phase = 'rest'; SHOP.restT = 1.3;
      // награда — за каждую волну раунда
      let bonus = 0; for (let w = SHOP.roundFrom || wave; w <= wave; w++) bonus += BAL.waveGold(w);
      SHOP.addGold(bonus);
      say(P.x, P.y - CH * HS() * 1.35, 'Раунд отбит  +' + bonus, '#ffe9a8');
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
    const g = e.boss ? Math.round(BAL.bossGold(wave)) : Math.max(1, Math.round((e.k.gold || KILL_GOLD[e.type] || 8) * BAL.KILL_GOLD * (e.elite ? BAL.ELITE.gold : 1) * BAL.gold(wave) * rnd(0.85, 1.2)));
    SHOP.drop('coin', null, e.x, e.y, g);
    if (e.boss) SHOP.drop('chest', null, e.x + 40, e.y + 10);
    else if (Math.random() < 0.05) SHOP.drop('chest', null, e.x + rnd(-30, 30), e.y + rnd(-10, 20));
    else if (Math.random() < 0.1) SHOP.drop('flask', Math.random() < 0.6 ? 'heal' : pick(['frost', 'swift', 'power', 'mana', 'mana']), e.x + rnd(-30, 30), e.y + rnd(-10, 20));
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
    if (d.icon === 'mana') { if (MANA_ICON.complete) ctx.drawImage(MANA_ICON, d.x - s / 2, d.y - s * 0.85 - hop + bob, s, s); }
    else ctx.drawImage(SHOP.icons, (d.icon % 4) * c, Math.floor(d.icon / 4) * c, c, c, d.x - s / 2, d.y - s * 0.85 - hop + bob, s, s);
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
    else if (id === 'mana') { if (P.mp >= P.maxMp) return; P.mp = Math.min(P.maxMp, P.mp + 220); say(P.x, P.y - CH * HS() * 1.1, '+220 маны', '#8ab8ff'); }
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
  openShop() {
    if (SHOP.phase !== 'rest') { say(P.x, P.y - CH * HS() * 1.3, 'Магазин — между волнами', '#ffd28a'); return; }
    SHOP.open = true; SHOP.refresh();
  },
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
  for (const n of ['panel', 'btn_green', 'btn_blue', 'close', 'slot', 'plate', 'h_portrait', 'h_badge', 'h_barframe', 'h_hp', 'h_mp',
    'h_plaque', 'h_button', 'h_gold', 'h_bag', 'h_pause', 'h_slot', 'h_round']) { const im = new Image(); im.src = 'ui/' + n + '.webp' + V; (SHOP.pre = SHOP.pre || []).push(im); }
  const css = document.createElement('style');
  css.textContent = `
  .sh, .sh * { box-sizing: border-box; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  .sh { position: fixed; z-index: 6; color: #fff; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
  .ic { background-image: ${U('icons')}; background-size: 400% 400%; background-repeat: no-repeat; }
  .bg { background-size: 100% 100%; background-repeat: no-repeat; background-position: center; }
  .tap { cursor: pointer; touch-action: manipulation; }
  /* HUD v3 по референсу: все рамки и кнопки — картинки ui/h_*.webp из ChatGPT; размеры — в долях высоты экрана */
  #hHero { top: calc(1.2vh + env(safe-area-inset-top)); left: calc(1.5vh + env(safe-area-inset-left)); width: 52vh; height: 15vh; pointer-events: none; }
  #hHero .pt { position: absolute; left: 0; top: 0; width: 14vh; height: 14vh; background-image: ${U('h_portrait')}; }
  #hHero .lv { position: absolute; left: 9.6vh; top: 9.4vh; width: 5.2vh; height: 5.2vh; background-image: ${U('h_badge')}; display: flex; align-items: center; justify-content: center; font: bold 2.5vh system-ui; }
  #hHero .bar { position: absolute; left: 13.2vh; width: 37vh; height: 4.6vh; background-image: ${U('h_barframe')}; }
  #hHero .bar.hp { top: 1.6vh; } #hHero .bar.mp { top: 6.6vh; }
  #hHero .bar .f { position: absolute; left: 9%; right: 9%; top: 31%; bottom: 25%; }
  #hHero .bar.hp .f { background-image: ${U('h_hp')}; } #hHero .bar.mp .f { background-image: ${U('h_mp')}; }
  #hHero .bar span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: bold 2.1vh system-ui; }
  #hWave { top: calc(1vh + env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: .4vh; }
  #hWave .pl { width: 30vh; height: 7.9vh; background-image: ${U('h_plaque')}; display: flex; align-items: center; justify-content: center; font: bold 3.1vh system-ui; letter-spacing: .08em; }
  #hWave .go { width: 33vh; height: 8.8vh; background-image: ${U('h_button')}; display: flex; align-items: center; justify-content: center; font: bold 2.9vh system-ui; color: #ffe9a8; letter-spacing: .05em; animation: shPulse 1.6s ease-in-out infinite; }
  @keyframes shPulse { 50% { transform: scale(1.05); } }
  #hTopR { top: calc(1.4vh + env(safe-area-inset-top)); right: calc(1.5vh + env(safe-area-inset-right)); display: flex; gap: 1.2vh; align-items: center; }
  #hTopR .gd { position: relative; width: 24vh; height: 8.3vh; background-image: ${U('h_gold')}; }
  #hTopR .gd span { position: absolute; left: 34%; right: 8%; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; font: bold 3vh system-ui; color: #ffe9a8; }
  #hTopR .sq { width: 8.4vh; height: 8.9vh; }
  #hInv { bottom: calc(2.4vh + env(safe-area-inset-bottom)); left: 50%; transform: translateX(-60%); display: flex; gap: 1vh; align-items: center; }
  .hs { position: relative; width: 9.4vh; height: 9.2vh; background-image: ${U('h_slot')}; }
  .hs .ic { position: absolute; left: 17%; top: 17%; width: 66%; height: 66%; }
  .hs b { position: absolute; right: .7vh; bottom: .4vh; font: bold 2.2vh system-ui; }
  .hs.buff { filter: drop-shadow(0 0 .9vh #7fe0ff); }
  #hFlask { position: relative; width: 10.4vh; height: 10.4vh; margin-left: 1.6vh; background-image: ${U('h_round')}; }
  #hFlask .ic { position: absolute; left: 18%; top: 16%; width: 64%; height: 64%; }
  #hFlask.off .ic { opacity: .35; filter: grayscale(1); }
  #hFlask b { position: absolute; right: -1vh; bottom: -.6vh; width: 4.6vh; height: 4.6vh; background-image: ${U('h_badge')}; display: flex; align-items: center; justify-content: center; font: bold 2.2vh system-ui; }
  #hPause { inset: 0; z-index: 9; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1.6vh; background: rgba(4, 8, 16, .55); }
  #hPause .pl { width: 40vh; height: 10.5vh; background-image: ${U('h_plaque')}; display: flex; align-items: center; justify-content: center; font: bold 4vh system-ui; letter-spacing: .1em; }
  #hPause .mb { width: 46vh; height: 12vh; background-image: ${U('h_button')}; display: flex; align-items: center; justify-content: center; font: bold 3.2vh system-ui; color: #ffe9a8; }
  #hPause .tip { font: 2.2vh system-ui; opacity: .85; max-width: 90vw; text-align: center; }
  /* ячейки товаров в магазине */
  .slot { position: relative; width: 50px; height: 54px; background-image: ${U('slot')}; }
  .slot .ic { position: absolute; left: 17%; top: 17%; width: 66%; height: 66%; }
  .slot b { position: absolute; right: 7px; bottom: 5px; font: bold 13px system-ui; }
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
  const icon = i => i === 'mana' ? '<span class="ic" style="background:' + U('i_mana') + ' center / 100% 100% no-repeat;display:block"></span>'
    : '<span class="ic" style="' + pos(i) + ';display:block"></span>';
  SHOP.iconHtml = icon;
  // нажатие не должно доходить до игры (иначе герой выстрелит или включится стик)
  const tap = (e, fn) => {
    e.classList.add('tap');
    for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    e.addEventListener('pointerdown', x => { x.stopPropagation(); fn(); });
  };
  const E = SHOP.el;
  // герой: портрет, уровень, здоровье и мана
  E.hero = mk('div', 'sh'); E.hero.id = 'hHero';
  mk('div', 'pt bg', E.hero);
  E.hpBar = mk('div', 'bar hp bg', E.hero, '<div class="f bg"></div><span></span>');
  E.mpBar = mk('div', 'bar mp bg', E.hero, '<div class="f bg"></div><span></span>');
  E.lv = mk('div', 'lv bg', E.hero);
  // волна: табличка и кнопка «Начать волну»
  E.wave = mk('div', 'sh'); E.wave.id = 'hWave';
  E.waveTxt = mk('div', 'pl bg', E.wave);
  E.waveGo = mk('div', 'go bg', E.wave, 'НАЧАТЬ ВОЛНУ'); tap(E.waveGo, () => SHOP.startWave());
  // справа сверху: золото, сумка (магазин), пауза
  const tr = mk('div', 'sh'); tr.id = 'hTopR';
  E.gold = mk('div', 'gd bg', tr, '<span>0</span>');
  tap(mk('div', 'sq bg', tr), () => SHOP.open ? SHOP.closeShop() : SHOP.openShop());
  tr.lastChild.style.backgroundImage = U('h_bag');
  tap(mk('div', 'sq bg', tr), () => SHOP.togglePause());
  tr.lastChild.style.backgroundImage = U('h_pause');
  // снизу: 6 ячеек сумки (фласки холода, скорости, силы и предметы) и фласка лечения
  E.inv = mk('div', 'sh'); E.inv.id = 'hInv';
  E.slots = [];
  for (let i = 0; i < 6; i++) { const c = mk('div', 'hs bg', E.inv); tap(c, () => { if (c.use) SHOP.use(c.use); }); E.slots.push(c); }
  E.flask = mk('div', 'bg', E.inv, icon(ICON.heal) + '<b class="bg">0</b>'); E.flask.id = 'hFlask';
  E.flask.title = 'Фласка лечения: +280 здоровья (клавиша 1)'; tap(E.flask, () => SHOP.use('heal'));
  // пауза: продолжить, музыка, редактор
  E.pause = mk('div', 'sh'); E.pause.id = 'hPause';
  for (const ev of ['touchstart', 'mousedown', 'pointerdown']) E.pause.addEventListener(ev, x => x.stopPropagation(), { passive: true });
  mk('div', 'pl bg', E.pause, 'ПАУЗА');
  tap(mk('div', 'mb bg', E.pause, 'Продолжить'), () => SHOP.togglePause());
  E.musBtn = mk('div', 'mb bg', E.pause); tap(E.musBtn, () => { musicToggle(); SHOP.pauseLabels(); });
  E.musNext = mk('div', 'mb bg', E.pause, 'Следующий трек'); tap(E.musNext, () => { musicNext(); SHOP.pauseLabels(); });
  if (location.host !== 'duelarena.app') tap(mk('div', 'mb bg', E.pause, 'Редактор'), () => { location.href = 'editor/'; });
  E.tip = mk('div', 'tip', E.pause, 'ontouchstart' in window ? '' : 'WASD — движение, пробел — огонь, Q E F R — скиллы, 1–4 — фласки, Enter — волна, B — магазин, P — пауза, M — музыка');
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
  for (const it of ITEMS) addOffer('item', it);
  E.go = mk('div', 'bg', p); E.go.id = 'shGo'; tap(E.go, () => SHOP.startWave());
  E.close = mk('div', 'bg', p); E.close.id = 'shClose'; tap(E.close, () => SHOP.closeShop());

  const ROM = ['', 'I', 'II', 'III'];
  SHOP.refresh = () => {
    E.gold.lastChild.textContent = SHOP.gold;
    E.title.querySelector('em').textContent = SHOP.gold;
    const nh = SHOP.flasks.heal;
    E.flask.lastChild.textContent = nh; E.flask.classList.toggle('off', !nh);
    // сумка: сначала фласки (кроме лечения), потом предметы; ячейку перерисовываем, только если она поменялась
    const inv = [];
    for (const f of FLASKS) if (f.id !== 'heal' && SHOP.flasks[f.id]) inv.push({ ic: ICON[f.id], n: SHOP.flasks[f.id], use: f.id, t: f.name + ': ' + f.desc + ' (клавиша ' + f.key + ')' });
    for (const it of ITEMS) if (SHOP.items[it.id]) inv.push({ ic: ICON[it.id], n: ROM[SHOP.items[it.id]], t: it.name + ': ' + it.desc });
    E.slots.forEach((c, i) => {
      const x = inv[i], h = x ? icon(x.ic) + '<b>' + x.n + '</b>' : '';
      if (c.h !== h) { c.innerHTML = h; c.h = h; }
      c.use = x && x.use; c.title = x ? x.t : '';
    });
    const rest = SHOP.phase === 'rest';
    E.waveGo.style.display = rest && !SHOP.open ? 'flex' : 'none';
    E.waveTxt.textContent = 'ВОЛНА ' + (rest ? wave + 1 : wave);
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
  // каждый кадр: полоски, уровень и подсветка действующих фласок; DOM трогаем, только если число поменялось
  const hud = {};
  const setBar = (bar, k, v, max) => {
    const key = Math.round(v) + '/' + Math.round(max);
    if (hud[k] === key) return;
    hud[k] = key;
    bar.firstChild.style.clipPath = 'inset(0 ' + (100 - 100 * Math.max(0, v) / max).toFixed(1) + '% 0 0)';
    bar.lastChild.textContent = Math.round(Math.max(0, v)) + ' / ' + Math.round(max);
  };
  SHOP.hud = () => {
    setBar(E.hpBar, 'hp', P.hp, P.maxHp);
    setBar(E.mpBar, 'mp', P.mp, P.maxMp);
    if (hud.lv !== P.lvl) { hud.lv = P.lvl; E.lv.textContent = P.lvl; }
    for (const c of E.slots) c.classList.toggle('buff', !!(c.use && SHOP.buffs[c.use] > 0));
  };
  SHOP.paused = false;
  SHOP.pauseLabels = () => {
    E.musBtn.textContent = 'Музыка: ' + (typeof mus === 'undefined' || mus.on ? 'вкл' : 'выкл');
    E.musNext.style.display = typeof mus !== 'undefined' && mus.on ? 'flex' : 'none';
  };
  SHOP.togglePause = () => {
    SHOP.paused = !SHOP.paused;
    held.touch = held.mouse = held.key = false;
    SHOP.pauseLabels();
    E.pause.style.display = SHOP.paused ? 'flex' : 'none';
  };
  addEventListener('keydown', e => {
    if (e.repeat) return;
    if (e.code === 'Enter' || e.code === 'KeyG') SHOP.startWave();
    if (e.code === 'KeyB') SHOP.open ? SHOP.closeShop() : SHOP.openShop();
    if (e.code === 'Escape') { if (SHOP.open) SHOP.closeShop(); else SHOP.togglePause(); }
    if (e.code === 'KeyP') SHOP.togglePause();
    const f = FLASKS.find(x => 'Digit' + x.key === e.code);
    if (f) SHOP.use(f.id);
  });
  SHOP.recompute(); SHOP.refresh();
})();
