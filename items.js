// Магазин v3 (v87, ITEMS_FOR_KLOD.md): 22 части и 54 предмета в 2–3 уровня сборки — по рецептам, со свитками рецептов.
// Покупаешь части; как только в сумке лежат все части предмета (и свиток, если он нужен), они сами собираются в него.
// Предмет можно купить и сразу: докупаются только недостающие части и свиток. В магазине у каждого предмета — дерево сборки.
// Эффекты предметов (pas — пассивка/прок/аура, act — активка) — itemfx.js; статы st — прежние 12 ключей (bagStats не менялся).
// Иконки — ui/items.webp (4 столбца × 20 строк по 128 px, нарисованы в ChatGPT). Цены и статы — BALANCE.md.
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
  fang: { nm: 'Клык упыря', ic: 10, pr: 1500, st: { ls: 0.0211 } },
  clover: { nm: 'Осколок удачи', ic: 11, pr: 320, st: { crit: 0.05 } },
  // ---- новые части (v87): дешёвые (до 700) падают из сундука, большие — только в магазине ----
  claymore: { nm: 'Двуручный меч', ic: 48, pr: 550, st: { dmg: 0.14 } },
  ogreaxe: { nm: 'Секира лесоруба', ic: 49, pr: 600, st: { hp: 100, dmg: 0.05 } },
  alacrity: { nm: 'Лёгкий клинок', ic: 50, pr: 550, st: { as: 0.1, spd: 0.03 } },
  wizard: { nm: 'Посох ученика', ic: 51, pr: 600, st: { sk: 0.1, mp: 50 } },
  vitality: { nm: 'Рубин жизни', ic: 47, pr: 700, st: { hp: 180 } },
  demonedge: { nm: 'Клинок Бездны', ic: 52, pr: 1800, st: { dmg: 0.3 } },
  hyper: { nm: 'Грозовой самоцвет', ic: 53, pr: 1500, st: { as: 0.2 } },
  reaver: { nm: 'Секира великана', ic: 54, pr: 1800, st: { hp: 400 } },
  mystic: { nm: 'Посох звездочёта', ic: 55, pr: 1800, st: { sk: 0.25 } },
  blink: { nm: 'Кинжал мгновения', ic: 56, pr: 2250, st: {}, ds: 'Прыжок: перенос на 450, перезарядка 14 с', act: { cd: 14, kind: 'blink', dist: 450 } },
};
// предметы: from — из чего собирается (части или другие предметы); бонус предмета больше суммы его частей
// v99: свитки больших предметов (были от 2400) подешевели на 20 % — живому игроку они были не по карману до конца игры
const RECIPES = {
  blade: { nm: 'Клинок воина', ic: 12, from: ['sword', 'sword'], st: { dmg: 0.2 } },
  cuirass: { nm: 'Кираса', ic: 13, from: ['bracer', 'plate'], st: { hp: 150, arm: 0.1 } },
  staff: { nm: 'Посох мага', ic: 14, from: ['crystal', 'lens'], st: { mp: 120, sk: 0.14 } },
  windbow: { nm: 'Лук ветров', ic: 15, from: ['feather', 'feather'], st: { as: 0.15 } },
  wboots: { nm: 'Крылатые сапоги', ic: 16, from: ['boots', 'feather'], st: { spd: 0.12, as: 0.08 } },
  amulet: { nm: 'Амулет здоровья', ic: 17, from: ['lifestone', 'bracer'], st: { hp: 120, hpr: 4 } },
  diadem: { nm: 'Венец мудреца', ic: 18, from: ['rune', 'crystal'], st: { mp: 100, mpr: 2.5 } },
  charm: { nm: 'Оберег часов', ic: 19, from: ['hourglass', 'rune'], st: { cd: 0.1, mpr: 1.5 } },
  vdagger: { nm: 'Кинжал вампира', ic: 20, from: ['fang', 'sword'], st: { dmg: 0.1, ls: 0.038 }, rc: 1800 },
  coin: { nm: 'Счастливая монета', ic: 21, from: ['clover', 'feather'], st: { crit: 0.1, as: 0.06 } },
  tshield: { nm: 'Щит стража', ic: 22, from: ['plate', 'plate'], st: { arm: 0.16 } },
  iceorb: { nm: 'Ледяная сфера', ic: 23, from: ['lens', 'sword'], st: { dmg: 0.12, sk: 0.12 } },
  tring: { nm: 'Кольцо времени', ic: 24, from: ['hourglass', 'crystal'], st: { cd: 0.08, mp: 80 } },
  eboots: { nm: 'Сапоги стойкости', ic: 25, from: ['boots', 'bracer'], st: { spd: 0.1, hp: 100 } },
  rring: { nm: 'Кольцо исцеления', ic: 26, from: ['lifestone', 'rune'], st: { hpr: 3, mpr: 1.5 } },
  bblade: { nm: 'Кровавый клинок', ic: 27, from: ['blade', 'fang'], st: { dmg: 0.32, ls: 0.0423 }, rc: 3900 },
  titan: { nm: 'Доспех титана', ic: 28, from: ['cuirass', 'tshield'], st: { hp: 250, arm: 0.28 } },
  archstaff: { nm: 'Посох архимага', ic: 29, from: ['staff', 'diadem'], st: { mp: 260, sk: 0.25, mpr: 3 } },
  stormbow: { nm: 'Буревестник', ic: 30, from: ['windbow', 'feather', 'clover'], st: { as: 0.28, crit: 0.1 } },
  sboots: { nm: 'Сапоги бури', ic: 31, from: ['wboots', 'boots'], st: { spd: 0.22, as: 0.12 } },
  heart: { nm: 'Сердце горы', ic: 32, from: ['amulet', 'lifestone', 'bracer'], st: { hp: 350, hpr: 7 } },
  chrono: { nm: 'Хрономант', ic: 33, from: ['charm', 'hourglass', 'lens'], st: { cd: 0.2, sk: 0.15 } },
  reaper: { nm: 'Жнец душ', ic: 34, from: ['vdagger', 'clover'], st: { dmg: 0.18, ls: 0.0507, crit: 0.1 }, rc: 2450 },
  dragoneye: { nm: 'Глаз дракона', ic: 35, from: ['coin', 'sword', 'clover'], st: { crit: 0.22, dmg: 0.12 } },
  icecrown: { nm: 'Ледяной венец', ic: 36, from: ['iceorb', 'diadem'], st: { dmg: 0.22, sk: 0.22, mp: 120 } },
  bastion: { nm: 'Бастион', ic: 37, from: ['tshield', 'amulet'], st: { arm: 0.2, hp: 250, hpr: 4 } },
  eternal: { nm: 'Вечные часы', ic: 38, from: ['tring', 'charm'], st: { cd: 0.22, mp: 150, mpr: 2 } },
  runner: { nm: 'Скороход', ic: 39, from: ['eboots', 'feather'], st: { spd: 0.16, hp: 150, as: 0.08 } },
  spring: { nm: 'Источник', ic: 40, from: ['rring', 'lifestone', 'rune'], st: { hpr: 6, mpr: 3.5 } },
  divine: { nm: 'Клинок древних королей', ic: 41, from: ['bblade', 'dragoneye'], st: { dmg: 0.5, crit: 0.25, ls: 0.0507 }, rc: 3850 },  // ---- новые предметы (v87): у каждого свой свиток рецепта (rc) ----
  sange: { nm: 'Клинок Силы', ic: 57, from: ['ogreaxe', 'bracer'], st: { hp: 220, dmg: 0.07 }, rc: 360 },
  yasha: { nm: 'Клинок Ветра', ic: 58, from: ['alacrity', 'boots'], st: { as: 0.15, spd: 0.1 }, rc: 450 },
  kaya: { nm: 'Клинок Чар', ic: 59, from: ['wizard', 'lens'], st: { sk: 0.2, mp: 100, mpr: 1 }, rc: 320 },
  medallion: { nm: 'Знак охотника', ic: 46, from: ['plate', 'rune'], st: { arm: 0.06, mpr: 1.5 }, rc: 340, ds: 'Метка: цель получает +20 % урона 6 с, перезарядка 20 с', act: { cd: 20, kind: 'medal', amp: 0.2, t: 6, R: 600 } },
  midas: { nm: 'Золотая длань', ic: 60, from: ['feather'], st: { as: 0.1 }, rc: 1940, ds: 'Превращение: раз в 45 с убивает рядового врага, + золото', act: { cd: 45, kind: 'midas', gold: 45, R: 600 } },
  basher: { nm: 'Шипастая палица', ic: 61, from: ['claymore', 'ogreaxe'], st: { dmg: 0.16, hp: 100 }, rc: 700, ds: 'Оглушение: 12 % — 0,8 с и +30 урона', pas: { bash: { ch: 0.12, t: 0.8, dmg: 30, icd: 1 } } },
  maelstrom: { nm: 'Молот грозы', ic: 62, from: ['claymore', 'alacrity'], st: { dmg: 0.12, as: 0.12 }, rc: 1300, ds: 'Цепная молния: 25 % — 35 урона 4 целям', pas: { chain: { ch: 0.25, dmg: 35, n: 4, R: 350 } } },
  mekansm: { nm: 'Шестерня лекаря', ic: 63, from: ['amulet', 'plate'], st: { hp: 120, hpr: 4, arm: 0.06 }, rc: 980, ds: 'Восстановление: +200 и 8 % здоровья, перезарядка 45 с', act: { cd: 45, kind: 'heal', hp: 200, pct: 0.08 } },
  force: { nm: 'Посох порыва', ic: 64, from: ['wizard', 'lifestone'], st: { sk: 0.08, mp: 60, hpr: 3 }, rc: 1320, ds: 'Толчок: рывок на 500, перезарядка 18 с', act: { cd: 18, kind: 'force', dist: 500, t: 0.25 } },
  sny: { nm: 'Сила и Ветер', ic: 65, from: ['sange', 'yasha'], st: { hp: 300, dmg: 0.12, as: 0.22, spd: 0.12 }, rc: 800 },
  desolator: { nm: 'Клинок порчи', ic: 66, from: ['claymore', 'claymore'], st: { dmg: 0.35 }, rc: 1900, ds: 'Порча: удар — цель получает +15 % урона 6 с', pas: { cor: { amp: 0.15, t: 6 } } },
  aeon: { nm: 'Оберег рубежа', ic: 67, from: ['vitality', 'crystal'], st: { hp: 250, mp: 120 }, rc: 2080, ds: 'Последний рубеж: ниже 30 % здоровья — 2,5 с неуязвимости, перезарядка 70 с', pas: { aeon: { below: 0.3, t: 2.5, spd: 2.5 }, cd: 70 } },
  bkb: { nm: 'Жезл древнего короля', ic: 68, from: ['ogreaxe', 'claymore'], st: { hp: 120, dmg: 0.14 }, rc: 2300, ds: 'Несокрушимость: 5 с без состояний и −30 % урона, перезарядка 30 с', act: { cd: 30, kind: 'bkb', t: 5, taken: 0.7 } },   // v99: 50 → 30 с
  linken: { nm: 'Сфера оберега', ic: 69, from: ['rring', 'vitality', 'wizard'], st: { hp: 250, mp: 100, sk: 0.1, hpr: 5, mpr: 2.5 }, rc: 2350, ds: 'Щит от чар: раз в 15 с снимает первое жёсткое состояние', pas: { linken: { imm: 0.5 }, cd: 15 } },
  abyssal: { nm: 'Клинок глубин', ic: 70, from: ['basher', 'vitality'], st: { dmg: 0.22, hp: 300 }, rc: 1650, ds: 'Оглушение 15 % — 1 с и +40; Пролом: 2 с и 150 урона, перезарядка 25 с', pas: { bash: { ch: 0.15, t: 1, dmg: 40, icd: 1 } }, act: { cd: 25, kind: 'abyss', t: 2, dmg: 150, R: 500 } },
  manta: { nm: 'Зеркало двойников', ic: 71, from: ['yasha', 'vitality'], st: { as: 0.2, spd: 0.12, dmg: 0.1, hp: 150 }, rc: 2100, ds: 'Иллюзии: снимает состояния, 2 копии на 8 с, перезарядка 40 с', act: { cd: 40, kind: 'manta', t: 8, n: 2, k: 0.3, off: 70 } },
  shiva: { nm: 'Панцирь вьюги', ic: 72, from: ['tshield', 'mystic'], st: { arm: 0.18, sk: 0.15, mp: 150 }, rc: 1900, ds: 'Аура: враги рядом на 15 % медленнее. Ледяная волна (сама, когда рядом трое врагов или сильный): 90 урона, замедление вдвое на 4 с, раз в 25 с', pas: { aura: { R: 450, slow: 0.85 } }, act: { cd: 25, kind: 'shiva', R: 500, dmg: 90, slow: 0.5, st: 4 } },
  agh: { nm: 'Скипетр древних', ic: 73, from: ['wizard', 'ogreaxe', 'alacrity'], st: { hp: 150, mp: 150, sk: 0.1, as: 0.1 }, rc: 1950, ds: 'Скипетр: Буря на 2 с дольше и +30 % урона; Верный глаз лучницы: +15 % пронзающих стрел', pas: { agh: { t: 2, k: 1.3, pierce: 0.15 } } },
  radiance: { nm: 'Солнечный клинок', ic: 74, from: ['demonedge', 'claymore'], st: { dmg: 0.35 }, rc: 2100, ds: 'Ожог: враги в 320 получают 25 урона в секунду', pas: { aura: { R: 320, burn: 25 } } },
  vajra: { nm: 'Ваджра', ic: 75, from: ['maelstrom', 'hyper'], st: { dmg: 0.18, as: 0.3 }, rc: 1600, ds: 'Цепная молния 30 % — 40 урона 5 целям; Громовой щит 8 с, перезарядка 30 с', pas: { chain: { ch: 0.3, dmg: 40, n: 5, R: 350 } }, act: { cd: 30, kind: 'storm', t: 8, every: 0.6, dmg: 40, R: 400 } },
  butterfly: { nm: 'Крыло ветра', ic: 76, from: ['hyper', 'claymore'], st: { dmg: 0.25, as: 0.3, spd: 0.08 }, rc: 3150, ds: 'Уклонение 25 % от ударов и снарядов', pas: { eva: 0.25 } },
  tarrasque: { nm: 'Сердце великана', ic: 77, from: ['reaver', 'vitality'], st: { hp: 650, hpr: 4 }, rc: 2800, ds: 'Кровь титана: 5 с без урона — +2 % здоровья в секунду, но только до 70 % здоровья', pas: { calm: { after: 5, pct: 0.02, cap: 0.7 } } },
  octarine: { nm: 'Радужное ядро', ic: 78, from: ['mystic', 'vitality', 'crystal'], st: { sk: 0.2, cd: 0.18, hp: 250, mp: 250 }, rc: 5800, ds: 'Вампиризм умений 4,2 %', pas: { spl: 0.0423 } },
  // ---- v99: два дорогих предмета (иконки и эффекты рисует Клауди — night_19_11/items3; пока стоят иконки Линки и Радужного ядра) ----
  lotus: { nm: 'Зеркальная сфера', ic: 69, img: 'ui/item_lotus.webp', from: ['linken', 'tshield'], st: { hp: 350, mp: 150, arm: 0.12, sk: 0.12, hpr: 6, mpr: 3 }, rc: 3500,
    ds: 'Отражение: раз в 15 с жёсткое состояние снимается и возвращается злодею (боссу — вдвое короче)', pas: { lotus: { imm: 0.5 }, cd: 15 } },
  bloodstone: { nm: 'Багровый самоцвет', ic: 78, img: 'ui/item_bloodstone.webp', from: ['octarine', 'vitality'], st: { sk: 0.3, cd: 0.2, hp: 400, mp: 350, mpr: 3 }, rc: 4000,
    ds: 'Вампиризм умений 8,5 %. Кровавый обряд (сам, при здоровье ниже половины): 5 с вампиризм вдвое, раз в 40 с', pas: { spl: 0.0845 }, act: { cd: 40, kind: 'rite', t: 5, k: 2 } },
  satanic: { nm: 'Маска упыря', ic: 79, from: ['vdagger', 'reaver', 'claymore'], st: { dmg: 0.28, hp: 450, ls: 0.0634 }, rc: 8050, ds: 'Кровавая жажда: +21 % вампиризма на 5 с, перезарядка 35 с', act: { cd: 35, kind: 'unholy', t: 5, ls: 0.211, cap: 0.32 } },
};
// множитель цен из редактора баланса (BAL.price; при 1 цены — как записаны выше)
for (const id in PARTS) PARTS[id].pr = BAL.price(PARTS[id].pr);
for (const id in RECIPES) if (RECIPES[id].rc) RECIPES[id].rc = BAL.price(RECIPES[id].rc);
// свитки рецептов (по рецептам): свиток — тоже «часть», без него предмет не соберётся; в сундуке и во вкладке «Части» их нет
for (const id in RECIPES) {
  const r = RECIPES[id]; if (!r.rc) continue;
  const k = 'rc_' + id;
  PARTS[k] = { nm: 'Рецепт: ' + r.nm, ic: 44, pr: r.rc, st: {}, rcp: 1, ds: 'свиток рецепта — без него «' + r.nm + '» не соберётся' };
  r.from = r.from.concat(k);
}
const ALL = Object.assign({}, PARTS, RECIPES);
// когда какая склянка пьётся сама (flasks.js) — подписи в лавке и подсказки
const FLASK_AUTO = { heal: 'Только вручную — кнопкой внизу экрана.', swift: 'Пьётся сама, когда здоровья меньше 30 %.', mana: 'Пьётся сама, когда маны меньше 25 %.',
  frost: 'Пьётся сама, когда трое врагов вплотную и умение на перезарядке.', power: 'Пьётся сама, когда здоровья больше 70 % и рядом босс, мини-босс или четверо врагов.' };
const BAG_MAX = 12;   // v119: 12 маленьких слотов (было 6)
const STAT_TXT = { dmg: ['урон', '%'], hp: ['здоровье', ''], mp: ['мана', ''], as: ['скорость атаки', '%'], spd: ['бег', '%'],
  hpr: ['здоровье/с', ''], mpr: ['мана/с', ''], arm: ['защита', '%'], sk: ['сила умений', '%'], cd: ['перезарядка', '%', '−'],
  ls: ['вампиризм', '%'], crit: ['крит ×2', '%'] };      // доли вампиризма после v120 дробные (3,25 %; 5,85 %…) — в подписи округляются
// описание вещи: статы и короткий текст эффекта (в онлайне эффекты молчат)
function itemText(it) {
  const a = statText(it.st), d = it.ds ? it.ds + (it.rcp || !(window.NETC && NETC.on) ? '' : ' (эффект — только в одиночной игре)') : '';
  return a && d ? a + '; ' + d : a || d;
}
function statText(st) {
  return Object.entries(st).map(([k, v]) => { const t = STAT_TXT[k]; return (t[2] || '+') + (t[1] ? (k === 'ls' ? String(Math.round(v * 1000) / 10).replace('.', ',') : Math.round(v * 100)) : v) + t[1] + ' ' + t[0]; }).join(', ');
}
// полная цена предмета — сумма всех его частей
const fullPrice = id => PARTS[id] ? PARTS[id].pr : ALL[id] && ALL[id].relic ? ALL[id].pr : RECIPES[id].from.reduce((s, x) => s + fullPrice(x), 0);
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
  // предмет-ответ на босса (relics.js) покупается целиком, без частей
  if (ALL[id] && ALL[id].relic) {
    const r = ALL[id];
    if (SHOP.bag.includes(id) || SHOP.gold < r.pr) return false;
    if (SHOP.bag.length >= BAG_MAX) { say(P.x, P.y - CH * HS() * 1.2, 'Сумка полна', '#ffb36a'); return false; }
    SHOP.gold -= r.pr; SHOP.bag.push(id); say(P.x, P.y - CH * HS() * 1.2, r.nm, '#ffe27a');
    snd('coins', 0.6, 0.8); SHOP.recompute(); SHOP.refresh(); return true;
  }
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

// характеристики героя: уровень, очки, предметы сумки, действующие склянки
SHOP.recompute = function () {
  const b = SHOP.buffs, S = bagStats();
  const st = P.st || {}, str = st.str || 0, agi = st.agi || 0, int = st.int || 0;
  P.dmgMul = (1 + S.dmg) * (b.power > 0 ? 1.5 : 1) * CFG.units.hero.power * (1 + 0.015 * (P.lvl - 1)) * (1 + 0.006 * str);
  P.spdMul = (1 + S.spd) * (b.swift > 0 ? 1.45 : 1) * (1 + 0.006 * agi);
  P.atkSpd = (1 + 0.015 * agi) * (1 + Math.min(0.6, S.as));   // предметы — не больше +60 % к атаке
  P.skMul = (1 + 0.015 * int) * (1 + S.sk);
  P.mpRegen = MP_REGEN + 0.12 * int + S.mpr;   // v119: мана копится втрое медленнее (было 11 + 0,35 за очко интеллекта) — её приходится беречь
  P.hpRegX = S.hpr; P.ls = Math.min(0.105, S.ls); P.crit = Math.min(0.4, S.crit);   // вампиризм — не больше 10,5 % (v120 и v121: дважды −35 %, было 25 %)
  P.spl = 0; for (const id of SHOP.bag) { const p = ALL[id] && ALL[id].pas; if (p && p.spl > P.spl) P.spl = p.spl; }   // вампиризм умений: Радужное ядро 4,2 %, Багровый самоцвет 8,5 % (берётся больший)
  const mm = 420 + 12 * int + S.mp;
  if (mm !== P.maxMp) { P.mp = Math.min(mm, P.mp + Math.max(0, mm - P.maxMp)); P.maxMp = mm; }
  P.cdMul = 1 - Math.min(0.45, S.cd);
  P.armMul = 1 - Math.min(0.6, S.arm);
  const mh = Math.round((P.baseHp || BASE_HP) * CFG.units.hero.hp) + S.hp + 10 * (P.lvl - 1) + 8 * str;
  if (mh !== P.maxHp) { P.hp = Math.min(mh, P.hp + Math.max(0, mh - P.maxHp)); P.maxHp = mh; }
};
// крит, усиления урона по цели, вампиризм и проки предметов на каждом ударе героя (ITEMS_FOR_KLOD.md, C2):
// с удара атакой вампиризм полный, со всего остального (умения, зоны, проки, иллюзии) — ×0,3
const _hurtE2 = hurtEnemy;
hurtEnemy = function (e, dmg, col) {
  if (e.hp <= 0) return;
  const col0 = col;                                                         // цвет до крита: по нему SK.isSpell узнаёт урон оков
  if (P.crit && Math.random() < P.crit) { dmg *= 2; col = '#ffd23a'; }
  if (typeof ITEMFX !== 'undefined') dmg *= ITEMFX.amp(e);                 // Медальон +20 %, Порча +15 %
  const hp0 = e.hp, atk = HIT.atk;
  _hurtE2(e, dmg, col);
  const dealt = Math.max(0, hp0 - Math.max(0, e.hp));
  if (dealt > 0 && P.dead <= 0 && !HIT.noLs) {
    const ls = typeof ITEMFX !== 'undefined' && ITEMFX.T.unholy > 0 ? Math.min(ALL.satanic.act.cap, P.ls + ALL.satanic.act.ls) : P.ls;   // Маска упыря
    let heal = dealt * ls * (atk ? 1 : 0.3);                                  // не атака — ×0,3
    if (!atk && P.spl && typeof SK !== 'undefined' && SK.isSpell(e, col0)) heal += dealt * P.spl * (typeof ITEMFX !== 'undefined' && ITEMFX.T.rite > 0 ? ALL.bloodstone.act.k : 1);   // Радужное ядро, Багровый самоцвет (в обряд — вдвое)
    if (heal > 0) P.hp = Math.min(P.maxHp, P.hp + heal);
  }
  if (atk && dealt > 0 && !HIT.proc && typeof ITEMFX !== 'undefined') ITEMFX.onAtk(e);   // проки
};
// ---------- учёт золота (v99): куда уходят деньги игрока ----------
// earn — получено (волны, монеты, сундуки, Золотая длань), items — предметы и части, relics — предметы против боссов, flasks — склянки,
// forge — кузница Междумирья, sold — выручено продажей. Показывается в меню паузы, хранится в сохранении забега (save.js).
SHOP.led = { earn: 0, items: 0, relics: 0, flasks: 0, forge: 0, sold: 0 };
{
  const _add = SHOP.addGold; SHOP.addGold = function (n) { if (n > 0) SHOP.led.earn += n; return _add.apply(this, arguments); };
  const _bi = buyItem; buyItem = function (id) { const g = SHOP.gold, r = _bi(id); if (SHOP.gold < g) SHOP.led[ALL[id] && ALL[id].relic ? 'relics' : 'items'] += g - SHOP.gold; return r; };
  const _sb = SHOP.buy; SHOP.buy = function (kind) { const g = SHOP.gold, r = _sb.apply(this, arguments); if (SHOP.gold < g) SHOP.led[kind === 'flask' ? 'flasks' : 'items'] += g - SHOP.gold; return r; };
  const _si = sellItem; sellItem = function (i) { const g = SHOP.gold, r = _si(i); if (SHOP.gold > g) SHOP.led.sold += SHOP.gold - g; return r; };
  if (SHOP.el && SHOP.el.pause) {
    const d = document.createElement('div'); d.className = 'tip'; d.style.cssText = 'position:absolute;left:calc(2vw + var(--sal, 0px));top:17vh;text-align:left;font-size:2.7vh;line-height:1.55;color:#ffe9a8;text-shadow:0 .2vh .4vh #000'; SHOP.el.pause.appendChild(d);   // слева вверху: внизу строку не было видно под кнопками
    const _rf = SHOP.refresh; SHOP.refresh = function () { const r = _rf.apply(this, arguments), L = SHOP.led, f = n => Math.round(n).toLocaleString('ru-RU');
      d.innerHTML = '<b>Золото за забег</b><br>получено: ' + f(L.earn + L.sold) + '<br>предметы: ' + f(L.items + L.relics) + '<br>склянки: ' + f(L.flasks) + '<br>кузница: ' + f(L.forge); return r; };
  }
}
// реген здоровья от предметов
const _shopTick2 = SHOP.tick;
SHOP.tick = function (dt) { if (P.hpRegX && P.dead <= 0) P.hp = Math.min(P.maxHp, P.hp + P.hpRegX * dt); _shopTick2(dt); };
// сундук: случайная дешёвая часть (или золото, если сумка полна); свитков, Клыка и больших частей в сундуке не бывает
const CHEST = Object.keys(PARTS).filter(id => !PARTS[id].rcp && PARTS[id].pr <= 700 && id !== 'fang');
SHOP.pick = (function (orig) {
  return function (d) {
    if (d.kind !== 'chest') return orig(d);
    snd('coins', 0.6, 0.85);
    const ids = CHEST, id = ids[Math.floor(Math.random() * ids.length)], save = SHOP.bag;
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
  const IT_ROWS = 20;   // ui/items.webp: 4 столбца × 20 строк (клетки 0–79)
  const IT = i => typeof i === 'string' ? '<span class="it" style="background:url(' + i + V2 + ') center / 100% 100% no-repeat"></span>'
    : '<span class="it" style="background-position:' + (i % 4) * 100 / 3 + '% ' + Math.floor(i / 4) * 100 / (IT_ROWS - 1) + '%"></span>';
  const ICN = it => IT(it.img || it.ic);
  SHOP.itemIcon = ICN;      // v122: картинка предмета для справочника (alma.js)
  const css = document.createElement('style');
  css.textContent = `
  .it { display: block; background-image: ${U('items')}; background-size: 400% ${IT_ROWS * 100}%; background-repeat: no-repeat; }
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
  #shInfo .ds { font-size: .82em; opacity: .92; margin: .2em 0 .4em; min-height: 2.2em; flex-shrink: 0; }
  .tree { display: flex; flex-direction: column; align-items: center; gap: .15em; }
  .tree .row { display: flex; gap: .5em; justify-content: center; }
  .tree .ci { width: 3.5em; height: 3.8em; }
  .tree .ci.big { width: 4.6em; height: 5em; }
  .tree .ar { width: 1.3em; height: 1.45em; background: ${U('arrow')} center / contain no-repeat; }
  .tree .sub { display: flex; flex-direction: column; align-items: center; }
  .tree .sub .row .ci { width: 2.6em; height: 2.8em; }
  #shInfo .inn { font-size: .78em; opacity: .85; margin-top: .15em; }
  #shInfo .use { display: flex; gap: .35em; flex-wrap: wrap; justify-content: center; margin-top: .2em; }
  #shInfo .use .ci { width: 2.3em; height: 2.5em; }
  #shInfo > .bg, #shInfo .tree, #shInfo .use { flex-shrink: 0; }   /* кнопку «Купить» и дерево не сплющивать, когда строк много */
  #shBuy { margin-top: auto; width: 13em; height: 3em; background-image: ${U('btn_green')}; display: flex; align-items: center; justify-content: center; gap: .3em; font-weight: bold; color: #ffe27a; }
  #shBuy .ic { width: 1.1em; height: 1.1em; }
  #shBuy.no { filter: grayscale(1) brightness(.7); }
  #shList .fnote { grid-column: 1 / -1; font-size: .8em; line-height: 1.35; opacity: .9; padding: .2em .3em .5em; }
  #shInfo .ds.auto { color: #bfe6ff; min-height: 0; }
  #hFl { grid-column: 8; grid-row: 1 / span 2; align-self: center; display: grid; grid-template-columns: repeat(2, 5.7vh); grid-auto-rows: 5.6vh; gap: .4vh; margin-left: 1vh; }
  #hFl .hs { width: 5.7vh; height: 5.6vh; } #hFl .hs.off { opacity: .32; } #hFl .hs b { font-size: 1.7vh; right: .3vh; bottom: .1vh; }
  /* v121: сумка в лавке — как слоты в бою: два ряда по шесть, того же размера */
  #shBag { position: absolute; left: 6.5%; bottom: 6.5%; display: grid; grid-template-columns: repeat(6, 8.2vh); grid-auto-rows: 8vh; gap: .5vh .6vh; }
  #shBag .ci { width: 8.2vh; height: 8vh; }
  #shBag > span { display: none; }
  #shList { height: 43% !important; }
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
  const TABS = [['items', 'Предметы'], ['parts', 'Части'], ['relics', 'Против боссов'], ['flasks', 'Склянки']];
  const tabEls = TABS.map(([k, t]) => { const d = mk('div', 'bg', tabs, t); tap(d, () => { ui.tab = k; ui.sel = k === 'items' ? 'blade' : k === 'parts' ? 'sword' : k === 'relics' ? 'pierce_crystal' : 'f:heal'; ui.selBag = -1; draw(); }); return d; });
  const list = mk('div', '', panel); list.id = 'shList';
  const info = mk('div', '', panel); info.id = 'shInfo';
  const bagRow = mk('div', '', panel); bagRow.id = 'shBag';
  const cell = (id, extra) => {
    const it = ALL[id], d = document.createElement('div');
    d.className = 'ci ' + (extra || ''); d.innerHTML = ICN(it) + (extra && extra.includes('pr') ? '<b>' + fullPrice(id) + '</b>' : '');
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
      mk('div', 'fnote', list, 'Склянки, кроме лечения, пьются сами в нужный момент. Пока одна действует, вторая такая же не тратится. Каждой — не больше ' + FLASK_MAX + '.');
      for (const f of FLASKS) {
        const d = mk('div', 'ci', list, SHOP.iconHtml(ICON[f.id]) + '<b>' + SHOP.flaskPrice(f) + '</b>');
        d.classList.toggle('sel', ui.sel === 'f:' + f.id); d.classList.toggle('no', SHOP.gold < SHOP.flaskPrice(f));
        tap(d, () => { ui.sel = 'f:' + f.id; draw(); });
      }
    } else {
      const ids = ui.tab === 'relics' ? Object.keys(RELICS) : Object.keys(ui.tab === 'items' ? RECIPES : PARTS).filter(id => !ALL[id].rcp).sort((a, b) => fullPrice(a) - fullPrice(b));
      for (const id of ids) {
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
      mk('div', 'nm', info, f.name); mk('div', 'ds', info, f.id === 'heal' ? '+' + SHOP.healAmt() + ' здоровья (150 + 20 %), раз в секунду · у вас: ' + SHOP.flasks.heal + ' / ' + FLASK_MAX : f.desc + ' · у вас: ' + SHOP.flasks[f.id] + ' / ' + FLASK_MAX);
      mk('div', 'ds auto', info, FLASK_AUTO[f.id]);
      const t = mk('div', 'tree', info); mk('div', 'ci big', t, SHOP.iconHtml(ICON[f.id]));
      cost = SHOP.flaskPrice(f); can = SHOP.gold >= cost && !(f.id === 'heal' && SHOP.flasks.heal >= 10); label = 'Купить';
    } else {
      const id = ui.sel, it = ALL[id];
      mk('div', 'nm', info, it.nm); { const ds = mk('div', 'ds', info, it.relic ? (statText(it.st) ? statText(it.st) + '; ' : '') + it.ds + ' · против: ' + it.boss : itemText(it)); if (ds.textContent.length > 110) ds.style.fontSize = '.72em'; }   // длинное описание — мельче, иначе наезжает на картинку
      info.appendChild(tree(id, 0));
      if (USED_IN[id]) {
        mk('div', 'inn', info, 'Входит в:');
        const u = mk('div', 'use', info);
        for (const r of USED_IN[id]) { const c = cell(r); tap(c, () => { ui.sel = r; ui.selBag = -1; draw(); }); u.appendChild(c); }
      }
      if (ui.selBag >= 0) { cost = Math.floor(fullPrice(id) / 2); can = true; label = 'Продать за'; }
      else if (it.relic) { cost = it.pr; const own = SHOP.bag.includes(id); can = !own && SHOP.gold >= cost; label = own ? 'Уже есть' : 'Купить'; }
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
      if (id) { bagRow.appendChild(d); d.classList.toggle('sel', ui.selBag === i); tap(d, () => { ui.sel = id; ui.selBag = i; ui.tab = RECIPES[id] ? 'items' : ALL[id].relic ? 'relics' : 'parts'; draw(); }); }
    }
  }
  SHOP.drawShop = draw;
  // ряд склянок рядом со слотами предметов (v121)
  const FL = {};
  { const box = mk('div', '', E.inv); box.id = 'hFl';
    for (const f of FLASKS) if (f.id !== 'heal') { const c = mk('div', 'hs bg', box); tap(c, () => SHOP.use(f.id)); FL[f.id] = c; } }
  { const _hud = SHOP.hud; SHOP.hud = function () { _hud(); for (const id in FL) FL[id].classList.toggle('buff', SHOP.buffs[id] > 0); }; }
  // перерисовка окна вместе с остальным интерфейсом магазина
  const _refresh = SHOP.refresh;
  SHOP.refresh = function () {
    _refresh();
    if (SHOP.open) draw();
    // ячейки внизу экрана: предметы сумки, потом склянки (кроме лечения)
    const inv = SHOP.bag.map(id => ({ h: ICN(ALL[id]), t: ALL[id].nm + ': ' + (ALL[id].relic ? ALL[id].ds || statText(ALL[id].st) : itemText(ALL[id])), use: ALL[id].act ? 'it:' + id : null }));   // вещи с активкой жмутся
    // v121: склянки больше не занимают слоты предметов — у них свой ряд справа (холод, скорость, сила, мана); лечение — большая кнопка
    for (const f of FLASKS) { const c = FL[f.id]; if (!c) continue; const n = SHOP.flasks[f.id] || 0, h = SHOP.iconHtml(ICON[f.id]) + '<b>' + n + '</b>'; if (c.h !== h) { c.innerHTML = h; c.h = h; } c.classList.toggle('off', !n); c.title = f.name + ' — ' + FLASK_AUTO[f.id]; }
    E.slots.slice(0, BAG_MAX).forEach((c, i) => {
      const x = inv[i], h = x ? x.h : '';
      if (c.h !== h) { c.innerHTML = h; c.h = h; }
      c.use = x && x.use; c.title = x ? x.t : '';
    });
  };
  // старые предметы с уровнями больше не продаются
  SHOP.items = {};
  SHOP.recompute(); SHOP.refresh();
})();
