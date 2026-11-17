// Общие данные игры и редактора: размеры мира, вырезки объектов, карта по умолчанию,
// список персонажей и настройки, которые редактор сохраняет, а игра читает при запуске.
'use strict';

// ---------- мир ----------
const GS = 1.4;                          // во сколько раз растянута картинка земли
const SRC_W = 2048, SRC_H = 1536;        // земля: левая половина + её зеркало
const WORLD_W = SRC_W * GS, WORLD_H = SRC_H * GS;

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
// (эллипс вокруг опоры) или c — несколько эллипсов [dx, dy, rx, ry], red — команда красных.
// Координаты задаются в пикселях исходной картинки земли и растягиваются на GS.
function O(s, x, y, k, o) { return Object.assign({ s, x: x * GS, y: y * GS, k: k || 1, ay: 0.93, a: 1 }, o || {}); }
const DEFAULT_OBJ = [];
// базы и всё, что зеркалится: слева синие, справа красные
function both(s, x, y, k, o) {
  DEFAULT_OBJ.push(O(s, x, y, k, o));
  DEFAULT_OBJ.push(O(s, SRC_W - x, y, k, Object.assign({}, o, { f: true, red: true })));
}
both('shrine', 150, 790, 0.72, { ay: 0.7, r: [185, 92] });
both('tower', 318, 440, 0.85, { ay: 0.9, r: [72, 38] });
both('ban1', 300, 1045, 0.65, { r: [18, 10] });
both('braz1', 560, 612, 0.5, { r: [36, 20] });
both('braz2', 560, 912, 0.5, { r: [36, 20] });
// центр
DEFAULT_OBJ.push(O('obelisk', 1024, 802, 0.8, { ay: 0.9, r: [76, 42] }));
DEFAULT_OBJ.push(O('column', 590, 548, 0.8, { r: [46, 26] }));
DEFAULT_OBJ.push(O('columnB', 1458, 548, 0.8, { r: [46, 26] }));
DEFAULT_OBJ.push(O('columnB', 590, 1040, 0.8, { r: [46, 26], f: true }));
DEFAULT_OBJ.push(O('column', 1458, 1040, 0.8, { r: [46, 26] }));
DEFAULT_OBJ.push(O('statue', 1024, 345, 0.8, { r: [78, 44] }));
DEFAULT_OBJ.push(O('arch', 1024, 1335, 0.85, { c: [[-152, 0, 50, 28], [152, 0, 50, 28]] }));
DEFAULT_OBJ.push(O('lan1', 842, 1082, 0.42, { r: [22, 13] }));
DEFAULT_OBJ.push(O('lan2', 1208, 1082, 0.42, { r: [22, 13] }));
DEFAULT_OBJ.push(O('lan2', 850, 498, 0.42, { r: [22, 13] }));
DEFAULT_OBJ.push(O('lan1', 1200, 498, 0.42, { r: [22, 13] }));
// деревья — расставлены несимметрично, чтобы зеркальность земли не бросалась в глаза
DEFAULT_OBJ.push(O('tree1', 350, 330, 1, { r: [55, 30] }));
DEFAULT_OBJ.push(O('tree3', 730, 268, 1, { r: [55, 30] }));
DEFAULT_OBJ.push(O('tree2', 1340, 262, 1, { r: [50, 28] }));
DEFAULT_OBJ.push(O('tree1', 1730, 345, 1, { r: [55, 30], f: true }));
DEFAULT_OBJ.push(O('tree3', 560, 1352, 0.9, { r: [50, 28], f: true }));
DEFAULT_OBJ.push(O('tree2', 1565, 1345, 0.9, { r: [48, 26] }));
// камни, руины, мелочь
DEFAULT_OBJ.push(O('rock1', 470, 470, 0.7, { r: [100, 45] }));
DEFAULT_OBJ.push(O('rock2', 1610, 500, 0.7, { r: [72, 34] }));
DEFAULT_OBJ.push(O('rock3', 820, 1292, 0.8, { r: [52, 24] }));
DEFAULT_OBJ.push(O('wall1', 760, 1152, 0.75, { r: [128, 40] }));
DEFAULT_OBJ.push(O('wall2', 1320, 455, 0.75, { r: [98, 40] }));
DEFAULT_OBJ.push(O('log', 1150, 1218, 0.7, { r: [92, 30] }));
DEFAULT_OBJ.push(O('stump1', 880, 440, 0.55, { r: [72, 36] }));
DEFAULT_OBJ.push(O('stump2', 1650, 1130, 0.6, { r: [52, 28] }));
DEFAULT_OBJ.push(O('fountain', 1425, 1195, 0.8, { ay: 0.85, r: [108, 50] }));
DEFAULT_OBJ.push(O('chest', 700, 420, 0.4, { r: [46, 24] }));
DEFAULT_OBJ.push(O('cryG', 640, 1232, 0.5, { r: [34, 20] }));
DEFAULT_OBJ.push(O('cryS', 700, 1258, 0.6, { r: [16, 10] }));
DEFAULT_OBJ.push(O('cryG', 1500, 335, 0.45, { r: [30, 18], f: true }));
DEFAULT_OBJ.push(O('bush1', 215, 1190, 0.7, { r: [62, 30] }));
DEFAULT_OBJ.push(O('bush2', 1850, 1205, 0.6, { r: [78, 30] }));
DEFAULT_OBJ.push(O('bush3', 1838, 400, 0.7, { r: [62, 30] }));
DEFAULT_OBJ.push(O('bush4', 1185, 325, 0.55, { r: [62, 28] }));
DEFAULT_OBJ.push(O('bush2', 862, 305, 0.5, { r: [62, 26], f: true }));
DEFAULT_OBJ.push(O('flW', 420, 1130, 0.45, { soft: true }));
DEFAULT_OBJ.push(O('flP', 1700, 985, 0.45, { soft: true }));
DEFAULT_OBJ.push(O('flY', 1160, 425, 0.45, { soft: true }));
DEFAULT_OBJ.push(O('flP', 330, 640, 0.4, { soft: true }));
DEFAULT_OBJ.push(O('flW', 1290, 1300, 0.45, { soft: true, f: true }));
DEFAULT_OBJ.push(O('flY', 950, 1215, 0.4, { soft: true }));
// плоские плиты — лежат на земле, под всеми
const FLAT = [O('slabs', 1024, 1262, 0.7, { ay: 0.5 }), O('slabs', 430, 965, 0.6, { ay: 0.5, f: true }), O('slabs', 1640, 640, 0.5, { ay: 0.5 })];
// передний план — всегда поверх
const FRONT = [
  O('crown1', 120, 1500, 1.43, { ay: 0.5 }), O('crown3', 1930, 1500, 1.43, { ay: 0.5 }), O('crown2', 1024, 1575, 1.30, { ay: 0.5 }),
  O('fern1', 520, 1500, 1.17, { ay: 0.5 }), O('fern2', 1490, 1495, 1.17, { ay: 0.5 }),
  O('branch1', 560, 55, 1.17, { ay: 0.5 }), O('branch2', 1500, 65, 1.17, { ay: 0.5 }),
  O('crown3', 60, 80, 1.17, { ay: 0.5 }), O('crown1', 1990, 70, 1.17, { ay: 0.5, f: true }),
  O('vine', 1975, 1000, 1.04, { ay: 0.5 }),
];

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

// ---------- настройки редактора ----------
// Хранятся в браузере (localStorage). scale, speed, power, hp — множители к значениям по умолчанию.
// map — список объектов карты или null, если карта не менялась.
const CFG_KEY = 'hw_config_v1';
function defaultCfg() {
  const units = {};
  for (const u of UNIT_LIST) units[u.id] = { char: u.char, scale: 1, speed: 1, power: 1, hp: 1 };
  return { v: 1, units, map: null };
}
function normCfg(c) {
  const d = defaultCfg();
  if (!c || typeof c !== 'object') return d;
  for (const u of UNIT_LIST) {
    const s = (c.units && c.units[u.id]) || {}, t = d.units[u.id];
    if (CHAR_LIST.some(x => x.id === s.char)) t.char = s.char;
    for (const k of ['scale', 'speed', 'power', 'hp']) if (typeof s[k] === 'number' && s[k] > 0.05 && s[k] < 20) t[k] = s[k];
  }
  if (Array.isArray(c.map)) {
    d.map = c.map.filter(o => o && SPR[o.s] && isFinite(o.x) && isFinite(o.y)).map(o => {
      const r = { s: o.s, x: +o.x, y: +o.y, k: +o.k || 1, ay: typeof o.ay === 'number' ? o.ay : 0.93 };
      if (o.f) r.f = true;
      if (o.red) r.red = true;
      if (o.soft) r.soft = true;
      if (Array.isArray(o.r)) r.r = [+o.r[0] || 0, +o.r[1] || 0];
      if (Array.isArray(o.c)) r.c = o.c.map(e => e.map(Number));
      return r;
    });
  }
  return d;
}
function loadCfg() {
  try { return normCfg(JSON.parse(localStorage.getItem(CFG_KEY))); } catch (e) { return defaultCfg(); }
}
function saveCfg(c) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); return true; } catch (e) { return false; }
}
