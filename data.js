// Общие данные игры и редактора: размеры мира, вырезки объектов, карта по умолчанию,
// список персонажей и настройки, которые редактор сохраняет, а игра читает при запуске.
'use strict';

// ---------- мир ----------
// Арена v3 — одна картинка из ChatGPT (arena/arena2.webp, 1536x1024 пикселей), растянутая на мир в AK раз.
// Все координаты карты ниже заданы в пикселях этой картинки и умножаются на AK.
const AK = 1.5625;
const WORLD_W = 1536 * AK, WORLD_H = 1024 * AK;
const GROUND = 'arena/arena2.webp';
const MAP_V = 3;                         // версия карты: сохранённые в редакторе карты прежних арен не подходят
const ak = a => a.map(p => [p[0] * AK, p[1] * AK]);
// где можно ходить: многоугольник по краю поляны (ручей сверху, деревья и кусты по краям)
const WALK = ak([[95, 440], [150, 330], [260, 250], [420, 215], [600, 205], [800, 205], [1000, 210], [1150, 232],
  [1168, 300], [1152, 420], [1172, 548], [1420, 566], [1450, 640], [1402, 760], [1372, 850], [1150, 874], [800, 880],
  [450, 884], [180, 858], [100, 760], [70, 600]]);
const HERO_SPAWN = { x: 500 * AK, y: 565 * AK };        // у зелёного обелиска — наша база
const ENEMY_SPAWN = { x: 1300 * AK, y: 592 * AK };      // перед красным порталом — отсюда идут враги

// Вырезки на листах: [лист, x, y, ширина, высота]
const SPR = {
  tree1: ['s2', 20, 23, 490, 454], tree2: ['s2', 551, 22, 400, 454], tree3: ['s2', 976, 33, 541, 429],
  column: ['s2', 98, 518, 173, 469], columnB: ['s2', 392, 575, 171, 411],
  statue: ['s2', 666, 501, 236, 483], arch: ['s2', 989, 536, 477, 433],
  bush1: ['s3', 70, 44, 248, 204], bush2: ['s3', 405, 52, 361, 190], bush3: ['s3', 833, 26, 253, 238], bush4: ['s3', 1163, 28, 322, 219],
  rock1: ['s3', 30, 286, 345, 228], rock2: ['s3', 474, 329, 248, 166], rock3: ['s3', 849, 374, 162, 99],
  stump1: ['s3', 1134, 289, 372, 226], stump2: ['s3', 53, 571, 258, 185], log: ['s3', 406, 581, 307, 170],
  flW: ['s3', 832, 571, 212, 167], flP: ['s3', 1217, 560, 221, 178], flY: ['s3', 53, 812, 205, 165],
  wall1: ['s3', 349, 808, 379, 174], wall2: ['s3', 795, 796, 296, 188], slabs: ['s3', 1160, 815, 326, 158],
  shrine: ['s4', 114, 17, 590, 479], tower: ['s4', 953, 29, 328, 451],
  obelisk: ['s4', 209, 521, 311, 459], gate: ['s4', 705, 543, 731, 436],
  braz1: ['s5', 133, 26, 201, 308], braz2: ['s5', 499, 23, 206, 311],
  ban1: ['s5', 851, 22, 195, 312], ban2: ['s5', 1214, 22, 195, 318],
  fountain: ['s5', 100, 375, 312, 282], cryG: ['s5', 556, 365, 195, 293], cryB: ['s5', 938, 434, 131, 201], cryS: ['s5', 1258, 494, 88, 135],
  lan1: ['s5', 194, 687, 167, 286], lan2: ['s5', 624, 690, 184, 287], chest: ['s5', 1020, 721, 302, 247],
  crown1: ['s6', 41, 27, 411, 342], crown2: ['s6', 491, 31, 549, 333], crown3: ['s6', 1088, 28, 404, 340],
  branch1: ['s6', 72, 393, 680, 244], branch2: ['s6', 859, 376, 535, 294],
  fern1: ['s6', 43, 680, 521, 302], fern2: ['s6', 633, 642, 370, 339], vine: ['s6', 1071, 655, 418, 326],
};

// Объект: s — вырезка, x/y — точка опоры на земле, k — масштаб, f — отразить,
// ay — где на спрайте находится точка опоры (доля высоты), r — препятствие [rx, ry]
// (эллипс вокруг опоры) или c — несколько эллипсов [dx, dy, rx, ry], red — команда красных,
// baked — предмет уже нарисован на земле, вырезка нужна только чтобы закрывать тех, кто зашёл за него.
// Обелиск и портал вырезаны из картинки арены по контуру (tools/cut_arena.py), лист c2.
SPR.obelisk2 = ['c2', 0, 0, 213, 270];
SPR.portal2 = ['c2', 217, 0, 321, 368];
const DEFAULT_OBJ = [
  { s: 'obelisk2', x: 346.5 * AK, y: 480 * AK, k: AK, ay: 0.759, a: 1, baked: true, r: [105 * AK, 58 * AK] },
  { s: 'portal2', x: 1335.5 * AK, y: 470 * AK, k: AK, ay: 0.796, a: 1, baked: true, r: [160 * AK, 62 * AK] },
];
// плоские предметы под всеми и передний план поверх всех: на арене v3 они нарисованы прямо на земле
const FLAT = [];
const FRONT = [];
// старые листы предметов (s2–s6) грузятся, только если в редакторе на карту добавили что-то из них
const SHEET_FILES = { s2: 'arena/s2.webp', s3: 'arena/s3.webp', s4: 'arena/s4.webp', s5: 'arena/s5.webp', s6: 'arena/s6.webp', c2: 'arena/arena2_cut.webp' };

// ---------- персонажи ----------
// Листы персонажей (папка chars). У героя Ganfaul свой формат из трёх листов, у остальных — один лист.
const CHAR_LIST = [
  { id: 'ganfaul', name: 'Ganfaul — маг в доспехе' },
  { id: 'zombie', name: 'Skeletonzombie — зомби-скелет' },
  { id: 'vampire', name: 'Vampire — вампир с когтями' },
  { id: 'mage', name: 'Nightshade — демоница' },
  { id: 'archer', name: 'Erika — лучница' },
  { id: 'boss', name: 'Warrok — рогатый громила' },
];
// Кого можно настраивать: герой и пять видов врагов. char — персонаж по умолчанию.
const UNIT_LIST = [
  { id: 'hero', name: 'Герой', char: 'ganfaul' },
  { id: 'min', name: 'Слабый ближник', char: 'zombie' },
  { id: 'war', name: 'Сильный ближник', char: 'vampire' },
  { id: 'mag', name: 'Маг-стрелок', char: 'mage' },
  { id: 'rog', name: 'Лучник', char: 'archer' },
  { id: 'boss', name: 'Босс', char: 'boss' },
];

// Листы персонажей упакованы в атласы (chars/at_*.webp, координаты кадров — chars/atlas.js):
// пустые поля вокруг кадров обрезаны, поэтому в памяти они втрое меньше исходных листов.
// Рисует кадр (gx, gy) исходного листа name так, будто вся его клетка занимает квадрат size в точке (dx, dy).
function drawCell(g, img, name, gx, gy, dx, dy, size) {
  const A = ATLAS[name], f = A.f[gy * A.gc + gx];
  if (!f) return;
  const k = size / A.cell;
  g.drawImage(img, f[0], f[1], f[2], f[3], dx + f[4] * k, dy + f[5] * k, f[2] * k, f[3] * k);
}

// ---------- настройки редактора ----------
// Хранятся в браузере (localStorage). scale, speed, power, hp — множители к значениям по умолчанию.
// map — список объектов карты или null, если карта не менялась.
const CFG_KEY = 'hw_config_v1';
function defaultCfg() {
  const units = {};
  for (const u of UNIT_LIST) units[u.id] = { char: u.char, scale: 1, speed: 1, power: 1, hp: 1 };
  // cam — отдаление камеры в игре: 1 — ближе всего, 2 — вдвое дальше; 1.65 подобрал Бахтиёр в редакторе 17.11
  return { v: 1, units, map: null, mv: MAP_V, cam: 1.65 };
}
function normCfg(c) {
  const d = defaultCfg();
  if (!c || typeof c !== 'object') return d;
  for (const u of UNIT_LIST) {
    const s = (c.units && c.units[u.id]) || {}, t = d.units[u.id];
    if (CHAR_LIST.some(x => x.id === s.char)) t.char = s.char;
    for (const k of ['scale', 'speed', 'power', 'hp']) if (typeof s[k] === 'number' && s[k] > 0.05 && s[k] < 20) t[k] = s[k];
  }
  if (Array.isArray(c.map) && c.mv === MAP_V) {
    d.map = c.map.filter(o => o && SPR[o.s] && isFinite(o.x) && isFinite(o.y)).map(o => {
      const r = { s: o.s, x: +o.x, y: +o.y, k: +o.k || 1, ay: typeof o.ay === 'number' ? o.ay : 0.93 };
      if (o.f) r.f = true;
      if (o.red) r.red = true;
      if (o.soft) r.soft = true;
      if (o.baked) r.baked = true;
      if (Array.isArray(o.r)) r.r = [+o.r[0] || 0, +o.r[1] || 0];
      if (Array.isArray(o.c)) r.c = o.c.filter(Array.isArray).map(e => e.map(Number));
      return r;
    });
  }
  if (typeof c.cam === 'number' && c.cam >= 0.5 && c.cam <= 3) d.cam = c.cam;
  return d;
}
// Режим разработки: на локальном сервере (порт 8765) настройки ещё и лежат в файле dev_cfg.json,
// чтобы редактор на компьютере и игра в эмуляторе или на телефоне видели одно и то же.
const DEV_SYNC = location.port === '8765';
// ---------- рост сложности (таблица и пояснения — BALANCE.md, расчёт — tools/balance_sim.py) ----------
// Сквозной номер волны n раскладывается на круг C (повторное прохождение), мир M (1–4) и волну в мире W (1–10).
// Враги растут умеренной экспонентой: по волнам медленно, скачком — при переходе в новый мир и на новом круге.
const BAL = {
  WAVES: 10, WORLDS: 4,
  ELITE: { hp: 3.5, dmg: 1.7, size: 1.3, xp: 3, gold: 4 },   // элита против рядового того же вида
  BOSS: { size: 2.5 },
  at(n) {
    n = Math.max(1, n | 0); const per = BAL.WAVES * BAL.WORLDS, m = (n - 1) % per;
    return { C: 1 + Math.floor((n - 1) / per), M: 1 + Math.floor(m / BAL.WAVES), W: 1 + m % BAL.WAVES };
  },
  hp(n) { const a = BAL.at(n); return Math.pow(1.07, a.W - 1) * Math.pow(1.35, a.M - 1) * Math.pow(1.8, a.C - 1); },
  dmg(n) { const a = BAL.at(n); return Math.pow(1.055, a.W - 1) * Math.pow(1.28, a.M - 1) * Math.pow(1.5, a.C - 1); },
  xp(n) { const a = BAL.at(n); return Math.pow(1.05, a.W - 1) * Math.pow(1.2, a.M - 1) * Math.pow(1.3, a.C - 1); },
  gold(n) { const a = BAL.at(n); return Math.pow(1.04, a.W - 1) * Math.pow(1.25, a.M - 1); },
  speed(n) { return 1 + Math.min(0.25, 0.02 * (BAL.at(n).W - 1)); },
  count(n) { const a = BAL.at(n); return 12 + 3 * (a.W - 1) + 4 * (a.M - 1); },      // врагов в обычной волне
  elites(n) { const W = BAL.at(n).W; return W < 4 ? 0 : W < 7 ? 1 : 2; },
  waveGold(n) { const a = BAL.at(n); return 20 + 6 * a.W + 10 * (a.M - 1); },        // награда за отбитую волну
  bossGold(n) { return 100 * Math.pow(1.5, BAL.at(n).M - 1); },
};

function devText() {
  try {
    const x = new XMLHttpRequest();
    x.open('GET', '/dev_cfg.json?' + Date.now(), false); x.send();
    return x.status === 200 ? x.responseText : null;
  } catch (e) { return null; }
}
function loadCfg() {
  if (DEV_SYNC) { const t = devText(); if (t) try { return normCfg(JSON.parse(t)); } catch (e) {} }
  try { return normCfg(JSON.parse(localStorage.getItem(CFG_KEY))); } catch (e) { return defaultCfg(); }
}
function saveCfg(c) {
  if (DEV_SYNC) try { fetch('/dev_cfg', { method: 'POST', body: JSON.stringify(c) }); } catch (e) {}
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
}
// игра в режиме разработки сама перезапускается, когда в редакторе что-то сохранили
if (DEV_SYNC && !/\/editor\//.test(location.pathname)) {
  let last = devText();
  setInterval(() => {
    fetch('/dev_cfg.json?' + Date.now()).then(r => r.ok ? r.text() : null).then(t => {
      if (t && t !== last) location.reload();
    }).catch(() => {});
  }, 1500);
}
