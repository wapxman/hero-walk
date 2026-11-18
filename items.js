// Магазин v2: 12 частей и 30 предметов, которые собираются из 2–3 вещей — как в Доте, но без отдельного рецепта.
// Покупаешь части; как только в сумке лежат все части предмета, они сами собираются в него. Предмет можно купить
// и сразу: докупаются только недостающие части. В магазине у каждого предмета видно дерево сборки.
// Иконки — ui/items.webp (4 столбца × 12 строк по 128 px, нарисованы в ChatGPT). Цены и статы — BALANCE.md.
'use strict';

// st: dmg — урон, hp — здоровье, mp — мана, as — скорость атаки, spd — бег, hpr — здоровье/с, mpr — мана/с,
// arm — снижение входящего урона, sk — сила умений, cd — сокращение перезарядки, ls — вампиризм, crit — шанс крита (×2)
const PARTS = {
  sword: { nm: 'Меч ученика', ic: 0, pr: 300, st: { dmg: 0.08 } },
  bracer: { nm: 'Кожаный наруч', ic: 1, pr: 240, st: { hp: 60 } },
  crystal: { nm: 'Кристалл маны', ic: 2, pr: 220, st: { mp: 60 } },
  feather: { nm: 'Перо ветра', ic: 3, pr: 260, st: { as: 0.06 } },
  boots: { nm: 'Сапоги путника', ic: 4, pr: 200, st: { spd: 0.06 } },
  lifestone: { nm: 'Камень жизни', ic: 5, pr: 280, st: { hpr: 2 } },
  rune: { nm: 'Руна мудрости', ic: 6, pr: 260, st: { mpr: 1 } },
  plate: { nm: 'Железная пластина', ic: 7, pr: 300, st: { arm: 0.05 } },
  lens: { nm: 'Линза фокуса', ic: 8, pr: 280, st: { sk: 0.06 } },
  hourglass: { nm: 'Песочные часы', ic: 9, pr: 320, st: { cd: 0.04 } },
  fang: { nm: 'Клык упыря', ic: 10, pr: 340, st: { ls: 0.04 } },
  clover: { nm: 'Осколок удачи', ic: 11, pr: 320, st: { crit: 0.05 } },
};
// предметы: from — из чего собирается (части или другие предметы); бонус предмета больше суммы его частей
const RECIPES = {
  blade: { nm: 'Клинок воина', ic: 12, from: ['sword', 'sword'], st: { dmg: 0.2 } },
  cuirass: { nm: 'Кираса', ic: 13, from: ['bracer', 'plate'], st: { hp: 150, arm: 0.1 } },
  staff: { nm: 'Посох мага', ic: 14, from: ['crystal', 'lens'], st: { mp: 120, sk: 0.14 } },
  windbow: { nm: 'Лук ветров', ic: 15, from: ['feather', 'feather'], st: { as: 0.15 } },
  wboots: { nm: 'Крылатые сапоги', ic: 16, from: ['boots', 'feather'], st: { spd: 0.12, as: 0.08 } },
  amulet: { nm: 'Амулет здоровья', ic: 17, from: ['lifestone', 'bracer'], st: { hp: 120, hpr: 4 } },
  diadem: { nm: 'Венец мудреца', ic: 18, from: ['rune', 'crystal'], st: { mp: 100, mpr: 2.5 } },
  charm: { nm: 'Оберег часов', ic: 19, from: ['hourglass', 'rune'], st: { cd: 0.1, mpr: 1.5 } },
  vdagger: { nm: 'Кинжал вампира', ic: 20, from: ['fang', 'sword'], st: { dmg: 0.1, ls: 0.09 } },
  coin: { nm: 'Счастливая монета', ic: 21, from: ['clover', 'feather'], st: { crit: 0.1, as: 0.06 } },
  tshield: { nm: 'Щит стража', ic: 22, from: ['plate', 'plate'], st: { arm: 0.16 } },
  iceorb: { nm: 'Ледяная сфера', ic: 23, from: ['lens', 'sword'], st: { dmg: 0.12, sk: 0.12 } },
  tring: { nm: 'Кольцо времени', ic: 24, from: ['hourglass', 'crystal'], st: { cd: 0.08, mp: 80 } },
  eboots: { nm: 'Сапоги стойкости', ic: 25, from: ['boots', 'bracer'], st: { spd: 0.1, hp: 100 } },
  rring: { nm: 'Кольцо исцеления', ic: 26, from: ['lifestone', 'rune'], st: { hpr: 3, mpr: 1.5 } },
  bblade: { nm: 'Кровавый клинок', ic: 27, from: ['blade', 'fang'], st: { dmg: 0.32, ls: 0.1 } },
  titan: { nm: 'Доспех титана', ic: 28, from: ['cuirass', 'tshield'], st: { hp: 250, arm: 0.28 } },
  archstaff: { nm: 'Посох архимага', ic: 29, from: ['staff', 'diadem'], st: { mp: 260, sk: 0.25, mpr: 3 } },
  stormbow: { nm: 'Буревестник', ic: 30, from: ['windbow', 'feather', 'clover'], st: { as: 0.28, crit: 0.1 } },
  sboots: { nm: 'Сапоги бури', ic: 31, from: ['wboots', 'boots'], st: { spd: 0.22, as: 0.12 } },
  heart: { nm: 'Сердце горы', ic: 32, from: ['amulet', 'lifestone', 'bracer'], st: { hp: 350, hpr: 7 } },
  chrono: { nm: 'Хрономант', ic: 33, from: ['charm', 'hourglass', 'lens'], st: { cd: 0.2, sk: 0.15 } },
  reaper: { nm: 'Жнец душ', ic: 34, from: ['vdagger', 'clover'], st: { dmg: 0.18, ls: 0.12, crit: 0.1 } },
  dragoneye: { nm: 'Глаз дракона', ic: 35, from: ['coin', 'sword', 'clover'], st: { crit: 0.22, dmg: 0.12 } },
  icecrown: { nm: 'Ледяной венец', ic: 36, from: ['iceorb', 'diadem'], st: { dmg: 0.22, sk: 0.22, mp: 120 } },
  bastion: { nm: 'Бастион', ic: 37, from: ['tshield', 'amulet'], st: { arm: 0.2, hp: 250, hpr: 4 } },
  eternal: { nm: 'Вечные часы', ic: 38, from: ['tring', 'charm'], st: { cd: 0.22, mp: 150, mpr: 2 } },
  runner: { nm: 'Скороход', ic: 39, from: ['eboots', 'feather'], st: { spd: 0.16, hp: 150, as: 0.08 } },
  spring: { nm: 'Источник', ic: 40, from: ['rring', 'lifestone', 'rune'], st: { hpr: 6, mpr: 3.5 } },
  divine: { nm: 'Божественный клинок', ic: 41, from: ['bblade', 'dragoneye'], st: { dmg: 0.5, crit: 0.25, ls: 0.12 } },
};
const ALL = Object.assign({}, PARTS, RECIPES);
const BAG_MAX = 6;
const STAT_TXT = { dmg: ['урон', '%'], hp: ['здоровье', ''], mp: ['мана', ''], as: ['скорость атаки', '%'], spd: ['бег', '%'],
  hpr: ['здоровье/с', ''], mpr: ['мана/с', ''], arm: ['защита', '%'], sk: ['сила умений', '%'], cd: ['перезарядка', '%', '−'],
  ls: ['вампиризм', '%'], crit: ['крит ×2', '%'] };
function statText(st) {
  return Object.entries(st).map(([k, v]) => { const t = STAT_TXT[k]; return (t[2] || '+') + (t[1] ? Math.round(v * 100) : v) + t[1] + ' ' + t[0]; }).join(', ');
}
// полная цена предмета — сумма всех его частей
const fullPrice = id => PARTS[id] ? PARTS[id].pr : RECIPES[id].from.reduce((s, x) => s + fullPrice(x), 0);
// в какие предметы входит вещь
const USED_IN = {};
for (const id in RECIPES) for (const f of RECIPES[id].from) (USED_IN[f] = USED_IN[f] || []).includes(id) || USED_IN[f].push(id);

SHOP.bag = [];
// собрать всё, что можно: повторяем, пока что-то собирается
function combineBag() {
  let did = true, made = [];
  while (did) {
    did = false;
    for (const id in RECIPES) {
      const need = RECIPES[id].from.slice(), left = SHOP.bag.slice();
      let ok = true;
      for (const f of need) { const i = left.indexOf(f); if (i < 0) { ok = false; break; } left.splice(i, 1); }
      if (ok) { SHOP.bag = left.concat(id); made.push(id); did = true; break; }
    }
  }
  return made;
}
// чего не хватает для предмета: берём из сумки то, что уже есть (готовые подпредметы и части), остальное — части к покупке
function plan(id, bag) {
  const i = bag.indexOf(id);
  if (i >= 0) { bag.splice(i, 1); return []; }
  if (PARTS[id]) return [id];
  return RECIPES[id].from.reduce((acc, f) => acc.concat(plan(f, bag)), []);
}
// забрать из сумки всё, из чего собирается предмет (рекурсивно)
function assemble(id, bag) {
  const i = bag.indexOf(id);
  if (i >= 0) { bag.splice(i, 1); return; }
  if (RECIPES[id]) for (const f of RECIPES[id].from) assemble(f, bag);
}
function buyItem(id) {
  // часть можно купить всегда (хоть вторую такую же), предмет — только недостающими частями
  const bag = SHOP.bag.slice(), miss = PARTS[id] ? [id] : plan(id, bag), cost = miss.reduce((s, x) => s + PARTS[x].pr, 0);
  if (!miss.length || SHOP.gold < cost) return false;
  // поместится ли: сумка после покупки и сборки не больше 6 ячеек. Сначала собираем именно выбранный предмет
  // (чтобы части не ушли в другой), потом — всё, что ещё собирается.
  const save = SHOP.bag, nb = save.concat(miss); if (RECIPES[id]) { assemble(id, nb); nb.push(id); } SHOP.bag = nb; combineBag();
  if (SHOP.bag.length > BAG_MAX) { SHOP.bag = save; say(P.x, P.y - CH * HS() * 1.2, 'Сумка полна', '#ffb36a'); return false; }
  SHOP.gold -= cost;
  if (RECIPES[id] && SHOP.bag.includes(id)) say(P.x, P.y - CH * HS() * 1.2, 'Собрано: ' + RECIPES[id].nm, '#c9a8ff');
  snd('coins', 0.45, 0.9); SHOP.recompute(); SHOP.refresh();
  return true;
}
function sellItem(i) {
  const id = SHOP.bag[i]; if (!id) return;
  SHOP.bag.splice(i, 1); SHOP.gold += Math.floor(fullPrice(id) / 2);
  snd('coins', 0.35, 1.1); SHOP.recompute(); SHOP.refresh();
}
function bagStats() {
  const S = { dmg: 0, hp: 0, mp: 0, as: 0, spd: 0, hpr: 0, mpr: 0, arm: 0, sk: 0, cd: 0, ls: 0, crit: 0 };
  for (const id of SHOP.bag) for (const k in ALL[id].st) S[k] += ALL[id].st[k];
  return S;
}

// характеристики героя: уровень, очки, предметы сумки, действующие фласки
SHOP.recompute = function () {
  const b = SHOP.buffs, S = bagStats();
  const st = P.st || {}, str = st.str || 0, agi = st.agi || 0, int = st.int || 0;
  P.dmgMul = (1 + S.dmg) * (b.power > 0 ? 1.5 : 1) * CFG.units.hero.power * (1 + 0.015 * (P.lvl - 1)) * (1 + 0.006 * str);
  P.spdMul = (1 + S.spd) * (b.swift > 0 ? 1.45 : 1) * (1 + 0.006 * agi);
  P.atkSpd = (1 + 0.015 * agi) * (1 + Math.min(0.6, S.as));   // предметы — не больше +60 % к атаке
  P.skMul = (1 + 0.015 * int) * (1 + S.sk);
  P.mpRegen = 11 + 0.35 * int + S.mpr;
  P.hpRegX = S.hpr; P.ls = S.ls; P.crit = Math.min(0.4, S.crit);
  const mm = 420 + 12 * int + S.mp;
  if (mm !== P.maxMp) { P.mp = Math.min(mm, P.mp + Math.max(0, mm - P.maxMp)); P.maxMp = mm; }
  P.cdMul = 1 - Math.min(0.45, S.cd);
  P.armMul = 1 - Math.min(0.6, S.arm);
  const mh = Math.round((P.baseHp || BASE_HP) * CFG.units.hero.hp) + S.hp + 10 * (P.lvl - 1) + 8 * str;
  if (mh !== P.maxHp) { P.hp = Math.min(mh, P.hp + Math.max(0, mh - P.maxHp)); P.maxHp = mh; }
};
// крит и вампиризм на каждом ударе героя
const _hurtE2 = hurtEnemy;
hurtEnemy = function (e, dmg, col) {
  if (e.hp <= 0) return;
  if (P.crit && Math.random() < P.crit) { dmg *= 2; col = '#ffd23a'; }
  const hp0 = e.hp;
  _hurtE2(e, dmg, col);
  if (P.ls && P.dead <= 0) P.hp = Math.min(P.maxHp, P.hp + Math.max(0, hp0 - Math.max(0, e.hp)) * P.ls);
};
// реген здоровья от предметов
const _shopTick2 = SHOP.tick;
SHOP.tick = function (dt) { if (P.hpRegX && P.dead <= 0) P.hp = Math.min(P.maxHp, P.hp + P.hpRegX * dt); _shopTick2(dt); };
// сундук: случайная часть (или золото, если сумка полна)
SHOP.pick = (function (orig) {
  return function (d) {
    if (d.kind !== 'chest') return orig(d);
    snd('coins', 0.6, 0.85);
    const ids = Object.keys(PARTS), id = ids[Math.floor(Math.random() * ids.length)], save = SHOP.bag;
    SHOP.bag = save.concat(id); combineBag();
    if (SHOP.bag.length > BAG_MAX) { SHOP.bag = save; SHOP.addGold(80); say(P.x, P.y - CH * HS() * 1.1, 'Сундук: +80 золота', '#ffd95e'); }
    else say(P.x, P.y - CH * HS() * 1.1, 'Сундук: ' + PARTS[id].nm, '#c9a8ff');
    SHOP.recompute(); SHOP.refresh();
  };
})(SHOP.pick);

// ---------- окно магазина ----------
(function () {
  const V2 = typeof V === 'string' ? V : '';
  const U = n => 'url(ui/' + n + '.webp' + V2 + ')';
  const IT = i => '<span class="it" style="background-position:' + (i % 4) * 100 / 3 + '% ' + Math.floor(i / 4) * 100 / 11 + '%"></span>';
  const css = document.createElement('style');
  css.textContent = `
  .it { display: block; background-image: ${U('items')}; background-size: 400% 1200%; background-repeat: no-repeat; }
  #shTabs { position: absolute; left: 7%; top: 17.5%; display: flex; gap: .6em; }
  #shTabs div { width: 8.5em; height: 2.6em; background-image: ${U('btn_blue')}; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: .95em; filter: brightness(.75); }
  #shTabs div.on { background-image: ${U('btn_green')}; filter: none; color: #ffe27a; }
  #shList { position: absolute; left: 6.5%; top: 25%; width: 52%; height: 50%; display: grid; grid-template-columns: repeat(8, 1fr); grid-auto-rows: 4.45em; gap: .3em; overflow-y: auto; align-content: start; }
  .ci { position: relative; background-image: ${U('slot')}; background-size: 100% 100%; }
  .ci .it, .ci .ic { position: absolute; left: 14%; top: 13%; width: 72%; height: 72%; }
  .ci b { position: absolute; left: 0; right: 0; bottom: -.1em; text-align: center; font-size: .72em; color: #ffe27a; }
  .ci.sel { filter: drop-shadow(0 0 .45em #7fe0ff); }
  .ci.no b { color: #b9a07a; }
  .ci.own::after { content: '✓'; position: absolute; right: .25em; top: .1em; color: #8dff9a; font-weight: bold; font-size: .9em; }
  #shInfo { position: absolute; left: 61%; top: 17.5%; width: 33%; height: 60%; display: flex; flex-direction: column; align-items: center; text-align: center; }
  #shInfo .nm { font-size: 1.25em; font-weight: bold; color: #ffe27a; }
  #shInfo .ds { font-size: .82em; opacity: .92; margin: .2em 0 .4em; min-height: 2.2em; }
  .tree { display: flex; flex-direction: column; align-items: center; gap: .15em; }
  .tree .row { display: flex; gap: .5em; justify-content: center; }
  .tree .ci { width: 3.5em; height: 3.8em; }
  .tree .ci.big { width: 4.6em; height: 5em; }
  .tree .ar { width: 1.3em; height: 2em; background: ${U('arrow')} center / contain no-repeat; }
  .tree .sub { display: flex; flex-direction: column; align-items: center; }
  .tree .sub .row .ci { width: 2.6em; height: 2.8em; }
  #shInfo .inn { font-size: .78em; opacity: .85; margin-top: .4em; }
  #shInfo .use { display: flex; gap: .35em; flex-wrap: wrap; justify-content: center; margin-top: .2em; }
  #shInfo .use .ci { width: 2.8em; height: 3em; }
  #shBuy { margin-top: auto; width: 13em; height: 3em; background-image: ${U('btn_green')}; display: flex; align-items: center; justify-content: center; gap: .3em; font-weight: bold; color: #ffe27a; }
  #shBuy .ic { width: 1.1em; height: 1.1em; }
  #shBuy.no { filter: grayscale(1) brightness(.7); }
  #shBag { position: absolute; left: 6.5%; bottom: 9.5%; display: flex; gap: .35em; align-items: center; }
  #shBag .ci { width: 3.6em; height: 3.9em; }
  #shBag span { font-size: .8em; opacity: .8; margin-right: .3em; }
  .hs .it { position: absolute; left: 17%; top: 17%; width: 66%; height: 66%; }
  #shGo { left: auto !important; right: 6% !important; width: 26% !important; }
  `;
  document.head.appendChild(css);
  const E = SHOP.el, panel = E.back.querySelector('#shPanel');
  // прежняя сетка товаров больше не нужна
  panel.querySelector('#shGrid').remove();
  E.offers.length = 0;
  const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; parent.appendChild(e); return e; };
  const tap = (e, fn) => {
    e.classList.add('tap');
    for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    e.addEventListener('pointerdown', x => { x.stopPropagation(); fn(); });
  };
  const ui = { tab: 'items', sel: 'blade', selBag: -1 };
  const tabs = mk('div', '', panel); tabs.id = 'shTabs';
  const TABS = [['items', 'Предметы'], ['parts', 'Части'], ['flasks', 'Фласки']];
  const tabEls = TABS.map(([k, t]) => { const d = mk('div', 'bg', tabs, t); tap(d, () => { ui.tab = k; ui.sel = k === 'items' ? 'blade' : k === 'parts' ? 'sword' : 'f:heal'; ui.selBag = -1; draw(); }); return d; });
  const list = mk('div', '', panel); list.id = 'shList';
  const info = mk('div', '', panel); info.id = 'shInfo';
  const bagRow = mk('div', '', panel); bagRow.id = 'shBag';
  const cell = (id, extra) => {
    const it = ALL[id], d = document.createElement('div');
    d.className = 'ci ' + (extra || ''); d.innerHTML = IT(it.ic) + (extra && extra.includes('pr') ? '<b>' + fullPrice(id) + '</b>' : '');
    d.title = it.nm; return d;
  };
  function tree(id, depth) {
    const box = document.createElement('div'); box.className = depth ? 'sub' : 'tree';
    const top = cell(id, depth ? '' : 'big'); box.appendChild(top);
    if (RECIPES[id]) {
      box.appendChild(mk('div', 'ar', box));
      const row = mk('div', 'row', box), bag = SHOP.bag.slice();
      for (const f of RECIPES[id].from) {
        const sub = depth < 1 && RECIPES[f] ? tree(f, depth + 1) : cell(f);
        const own = bag.indexOf(f); if (own >= 0) { bag.splice(own, 1); (sub.classList.contains('ci') ? sub : sub.firstChild).classList.add('own'); }
        const c = sub.classList.contains('ci') ? sub : sub.firstChild; tap(c, () => { ui.sel = f; ui.selBag = -1; draw(); });
        row.appendChild(sub);
      }
    }
    return box;
  }
  function draw() {
    tabEls.forEach((d, i) => d.classList.toggle('on', TABS[i][0] === ui.tab));
    list.innerHTML = '';
    if (ui.tab === 'flasks') {
      for (const f of FLASKS) {
        const d = mk('div', 'ci', list, SHOP.iconHtml(ICON[f.id]) + '<b>' + f.price + '</b>');
        d.classList.toggle('sel', ui.sel === 'f:' + f.id); d.classList.toggle('no', SHOP.gold < f.price);
        tap(d, () => { ui.sel = 'f:' + f.id; draw(); });
      }
    } else {
      for (const id of Object.keys(ui.tab === 'items' ? RECIPES : PARTS)) {
        const d = cell(id, 'pr'); list.appendChild(d);
        d.classList.toggle('sel', ui.sel === id); d.classList.toggle('own', SHOP.bag.includes(id));
        tap(d, () => { ui.sel = id; ui.selBag = -1; draw(); });
      }
    }
    // справа: описание, дерево сборки и кнопка
    info.innerHTML = '';
    let cost = 0, can = false, label = '';
    if (ui.sel.startsWith('f:')) {
      const f = FLASKS.find(x => 'f:' + x.id === ui.sel);
      mk('div', 'nm', info, f.name); mk('div', 'ds', info, f.desc + ' · у вас: ' + SHOP.flasks[f.id]);
      const t = mk('div', 'tree', info); mk('div', 'ci big', t, SHOP.iconHtml(ICON[f.id]));
      cost = f.price; can = SHOP.gold >= cost; label = 'Купить';
    } else {
      const id = ui.sel, it = ALL[id];
      mk('div', 'nm', info, it.nm); mk('div', 'ds', info, statText(it.st));
      info.appendChild(tree(id, 0));
      if (USED_IN[id]) {
        mk('div', 'inn', info, 'Входит в:');
        const u = mk('div', 'use', info);
        for (const r of USED_IN[id]) { const c = cell(r); tap(c, () => { ui.sel = r; draw(); }); u.appendChild(c); }
      }
      if (ui.selBag >= 0) { cost = Math.floor(fullPrice(id) / 2); can = true; label = 'Продать за'; }
      else { const miss = PARTS[id] ? [id] : plan(id, SHOP.bag.slice()); cost = miss.reduce((s, x) => s + PARTS[x].pr, 0); can = miss.length > 0 && SHOP.gold >= cost; label = miss.length ? (cost < fullPrice(id) ? 'Докупить' : 'Купить') : 'Уже есть'; }
    }
    const b = mk('div', 'bg', info, label + ' ' + SHOP.iconHtml(ICON.coin) + ' ' + cost); b.id = 'shBuy'; b.classList.toggle('no', !can);
    tap(b, () => {
      if (ui.sel.startsWith('f:')) SHOP.buy('flask', ui.sel.slice(2));
      else if (ui.selBag >= 0) { sellItem(ui.selBag); ui.selBag = -1; }
      else buyItem(ui.sel);
      draw();
    });
    // сумка
    bagRow.innerHTML = '<span>Сумка</span>';
    for (let i = 0; i < BAG_MAX; i++) {
      const id = SHOP.bag[i], d = id ? cell(id) : mk('div', 'ci', bagRow);
      if (id) { bagRow.appendChild(d); d.classList.toggle('sel', ui.selBag === i); tap(d, () => { ui.sel = id; ui.selBag = i; ui.tab = RECIPES[id] ? 'items' : 'parts'; draw(); }); }
    }
  }
  SHOP.drawShop = draw;
  // перерисовка окна вместе с остальным интерфейсом магазина
  const _refresh = SHOP.refresh;
  SHOP.refresh = function () {
    _refresh();
    if (SHOP.open) draw();
    // ячейки внизу экрана: предметы сумки, потом фласки (кроме лечения)
    const inv = SHOP.bag.map(id => ({ h: IT(ALL[id].ic), t: ALL[id].nm + ': ' + statText(ALL[id].st) }));
    for (const f of FLASKS) if (f.id !== 'heal' && SHOP.flasks[f.id] && inv.length < 6) inv.push({ h: SHOP.iconHtml(ICON[f.id]) + '<b>' + SHOP.flasks[f.id] + '</b>', use: f.id, t: f.name });
    E.slots.forEach((c, i) => {
      const x = inv[i], h = x ? x.h : '';
      if (c.h !== h) { c.innerHTML = h; c.h = h; }
      c.use = x && x.use; c.title = x ? x.t : '';
    });
  };
  // старые предметы с уровнями больше не продаются
  SHOP.items = {};
  SHOP.recompute(); SHOP.refresh();
})();
