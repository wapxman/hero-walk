// Бой: выстрелы, скилы, враги, звук. Графика намеренно простая, без спрайтов.
// Использует из index.html: ctx, W, H, P, CH, OBJ, collide, V; из data.js: HERO_SPAWN, ENEMY_SPAWN.
'use strict';

const YK = 0.72;                       // сжатие по вертикали из-за наклона камеры
function gdist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) / YK); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- звук ----------
// Все звуки свои, сделаны в Higgsfield: выстрел — shot 1/2 Бахтиёра, остальное — Seed Audio по референсам.
// Набор = имя и число вариантов: sfx/hit_1.mp3, sfx/hit_2.mp3 …; snd('hit') играет случайный вариант.
const SFX_SETS = {
  hero_shot: 2, hit: 2, step: 7, nova: 2, chains: 1, hail: 2, storm: 1, hero_death: 2, coins: 2,
  enemy_melee: 2, enemy_arrow: 2, enemy_fireball: 2, enemy_death: 2, boss_slam: 2, boss_roar: 2,
  wave_horn: 1, flask: 1, item_click: 3,   // item_click (v101, Клауди): 1 — сухой «чик», 2 — с магическим подъёмом, 3 — с металлическим звоном
};
// минимальный промежуток между повторами, сек: частые звуки в гуще боя не сливаются в кашу
const SND_GAP = { hit: 0.05, step: 0.1, coins: 0.08, enemy_melee: 0.06, enemy_arrow: 0.05, enemy_fireball: 0.05, enemy_death: 0.05 };
const SND = {}, sndLast = {}, sndAt = {};
let AC = null;
function audioInit() {
  if (AC) {   // iPhone: первое событие касания ещё не даёт права на звук — добираем на следующем
    if (AC.state !== 'running') AC.resume();
    if (mus.el && mus.on && mus.el.paused && !document.hidden) mus.el.play().catch(() => {});
    return;
  }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  AC = new C();
  for (const name in SFX_SETS) for (let i = 1; i <= SFX_SETS[name]; i++) {
    const n = name + '_' + i;
    fetch('sfx/' + n + '.mp3' + V).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
      .then(b => AC.decodeAudioData(b, buf => { SND[n] = buf; }, () => {})).catch(() => {});
  }
  musicStart();
}
let stepT = 0;
for (const ev of ['touchstart', 'touchend', 'pointerup', 'click', 'mousedown', 'keydown']) addEventListener(ev, audioInit, { passive: true });
function play(n, vol, rate) {
  if (!AC || AC.state !== 'running' || !SND[n]) return;
  const s = AC.createBufferSource(); s.buffer = SND[n]; s.playbackRate.value = rate || 1;
  const g = AC.createGain(); g.gain.value = vol == null ? 1 : vol;
  s.connect(g); g.connect(AC.destination); s.start();
}
// случайный вариант из набора, не повторяя предыдущий
function snd(name, vol, rate) {
  if (!AC || AC.state !== 'running') return;
  const gap = SND_GAP[name];
  if (gap && AC.currentTime - (sndAt[name] || -1) < gap) return;
  const k = SFX_SETS[name];
  if (!k) return;
  let i = 1 + Math.floor(Math.random() * k);
  if (k > 1 && i === sndLast[name]) i = i % k + 1;
  sndLast[name] = i; sndAt[name] = AC.currentTime;
  play(name + '_' + i, vol, rate);
}

// ---------- музыка ----------
// Длинные треки не декодируются в память целиком (5 минут стерео — около 100 МБ), а идут потоком
// через один <audio>, подключённый к своему регулятору громкости. Один элемент, а не два:
// на iPhone играть разрешено только тому элементу, который запущен касанием.
// Файлы заранее выровнены по громкости (−16 LUFS), поэтому треки не скачут друг относительно друга.
const MUSIC = [['m1', 'Ertaga bor izimiz'], ['m2', 'Ton nom dans le mien'], ['m3', "Jusqu'au dernier feu"],
  ['m4', 'Un seul serment'], ['m5', 'The Final Stand'], ['m6', 'Ton nom dans le mien II'], ['m7', "Jusqu'au dernier feu II"]];
const MUS_VOL = 0.3, MUS_FADE = 2.5;   // музыка тише эффектов; плавный вход и выход, сек
const mus = { el: null, g: null, i: 0, on: true, fails: 0, btn: null, nextBtn: null };
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
function musicStart() {
  if (mus.el || !AC) return;
  mus.on = store('hw_mus_on') !== '0';
  mus.i = (parseInt(store('hw_mus_i'), 10) || 0) % MUSIC.length;
  const el = mus.el = new Audio();
  el.preload = 'auto';
  mus.g = AC.createGain(); mus.g.gain.value = 0;
  AC.createMediaElementSource(el).connect(mus.g); mus.g.connect(AC.destination);
  el.addEventListener('ended', () => musicNext());
  el.addEventListener('playing', () => { mus.fails = 0; });
  el.addEventListener('error', () => { if (++mus.fails < MUSIC.length) musicNext(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) el.pause(); else if (mus.on) el.play().catch(() => {});
  });
  musicLoad();
}
function musicLabel() { if (typeof SHOP !== 'undefined' && SHOP.pauseLabels) SHOP.pauseLabels(); }
function musicLoad() {
  mus.el.src = 'music/' + MUSIC[mus.i][0] + '.mp3' + V;
  mus.g.gain.cancelScheduledValues(AC.currentTime); mus.g.gain.value = 0; mus.v = 0;
  if (mus.on) mus.el.play().catch(() => {});
  store('hw_mus_i', mus.i);
  musicLabel();
}
function musicNext() { if (!mus.el) return; mus.i = (mus.i + 1) % MUSIC.length; musicLoad(); }
function musicToggle() {
  if (!mus.el) return;
  mus.on = !mus.on; store('hw_mus_on', mus.on ? '1' : '0');
  if (mus.on) mus.el.play().catch(() => {}); else mus.el.pause();
  musicLabel();
}
// каждый кадр: плавный вход/выход трека и приглушение под бурю и гибель
function musicUpdate() {
  if (!mus.el || !mus.on || AC.state !== 'running') return;
  const el = mus.el, t = el.currentTime, d = el.duration;
  let k = Math.min(1, t / MUS_FADE);
  if (d > 0 && isFinite(d)) k = Math.min(k, Math.max(0, (d - t) / MUS_FADE));
  const duck = P.dead > 0 ? 0.35 : P.ult > 0 ? 0.55 : 1, v = MUS_VOL * k * duck;
  // раньше новое событие громкости ставилось в каждом кадре; теперь — только при заметном изменении
  if (mus.v != null && Math.abs(v - mus.v) < 0.004) return;
  mus.v = v; mus.g.gain.setTargetAtTime(v, AC.currentTime, 0.12);
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyM') musicToggle();
  if (e.code === 'KeyN' && mus.on) musicNext();
});


// ---------- состояние героини ----------
const SPAWN = HERO_SPAWN;
// мана: скиллы стоят маны, она сама восстанавливается; уровень растёт от опыта за победы
Object.assign(P, { mp: 420, maxMp: 420, lvl: 1, xp: 0 });
const MANA = { q: 60, e: 50, f: 80, r: 150 }, MP_REGEN = 11;
const skLv = id => (P.skLv && P.skLv[id]) || 1;
let skDmg = id => (1 + 0.12 * (skLv(id) - 1)) * (P.skMul || 1);
let skCd = id => 1 - 0.03 * (skLv(id) - 1);
const KILL_XP = { min: 8, war: 18, mag: 14, rog: 14, boss: 150 };   // новые виды — поле xp в KIND
const xpNeed = l => 40 + 35 * l;
function gainXp(n) {
  P.xp += n;
  while (P.xp >= xpNeed(P.lvl)) {
    P.xp -= xpNeed(P.lvl); P.lvl++;
    if (typeof SHOP !== 'undefined') SHOP.recompute();
    P.mp = P.maxMp;   // здоровье — только прибавка к максимуму
    say(P.x, P.y - CH * 1.45 * HS(), 'Уровень ' + P.lvl + '!', '#ffe27a');
  }
}
Object.assign(P, { hp: 600, maxHp: 600, dead: 0, face: { x: 1, y: 0 }, atkCd: 0, cast: 0, ult: 0, ultTick: 0, hurt: 0,
  cd: { q: 0, e: 0, f: 0, r: 0 } });
const CDMAX = { q: 6, e: 9, f: 12, r: 28 };
let RANGE = 600;
let kills = 0, wave = 0, waveT = 1.5;

const enemies = [], shots = [], fx = [], texts = [], zones = [];
function say(x, y, txt, col) { texts.push({ x, y, txt, col: col || '#fff', t: 0 }); }

// ---------- кнопки ----------
const BTN = [
  { id: 'atk', label: 'Огонь', key: 'Пробел', col: '150,200,255' },
  { id: 'q', label: 'Нова', key: 'Q', col: '120,210,255' },
  { id: 'e', label: 'Оковы', key: 'E', col: '170,230,255' },
  { id: 'f', label: 'Град', key: 'F', col: '140,180,255' },
  { id: 'r', label: 'Буря', key: 'R', col: '200,160,255' },
];
// места кнопок сняты с референса (экран высотой 576): отступ от правого нижнего угла и радиус
const BTN_POS = { atk: [140, 101, 66], q: [287, 88, 41], e: [267, 180, 41], r: [192, 240, 39], f: [102, 222, 39] };
function layoutButtons() {
  const u = Math.min(H, W * 0.56) / 576;
  for (const b of BTN) { const p = BTN_POS[b.id]; b.x = W - SAFE.r - p[0] * u; b.y = H - p[1] * u; b.r = p[2] * u; }
}
function buttonAt(x, y) {
  layoutButtons();
  for (const b of BTN) if (Math.hypot(x - b.x, y - b.y) < b.r * 1.25) return b;
  return null;
}
const held = { key: false, touch: false, mouse: false, pad: false };
const touchBtn = {};
// вызывается из обработчика касаний в index.html; true — касание попало в кнопку
function touchButtonDown(t) {
  const b = buttonAt(t.clientX, t.clientY);
  if (!b) return false;
  touchBtn[t.identifier] = b.id;
  if (b.id === 'atk') held.touch = true; else cast(b.id);
  return true;
}
function touchButtonUp(t) {
  const id = touchBtn[t.identifier];
  if (!id) return false;
  delete touchBtn[t.identifier];
  if (id === 'atk') held.touch = false;
  return true;
}
addEventListener('mousedown', e => {
  const b = buttonAt(e.clientX, e.clientY);
  if (!b) return;
  if (b.id === 'atk') held.mouse = true; else cast(b.id);
});
addEventListener('mouseup', () => { held.mouse = false; });
addEventListener('keydown', e => {
  if (e.code === 'Space' || e.code === 'KeyJ') { held.key = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyQ') cast('q');
  if (e.code === 'KeyE') cast('e');
  if (e.code === 'KeyF') cast('f');
  if (e.code === 'KeyR') cast('r');
});
addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'KeyJ') held.key = false; });
addEventListener('blur', () => { held.key = held.mouse = held.touch = false; });   // окно потеряло фокус — огонь не залипает
// геймпад: A / R1 / R2 — огонь, X — нова, Y — оковы, B — град, L1 — буря
const padPrev = {};
function padButtons() {
  held.pad = false;
  for (const g of PADS) {
    if (!g) continue;
    const on = i => !!(g.buttons[i] && g.buttons[i].pressed);
    if (on(0) || on(5) || on(7)) held.pad = true;
    const map = { 2: 'q', 3: 'e', 1: 'f', 4: 'r' };
    for (const i in map) {
      const d = on(i);
      if (d && !padPrev[i]) cast(map[i]);
      padPrev[i] = d;
    }
    return;
  }
}

// ---------- действия героини ----------
function nearestEnemy(range) {
  let best = null, bd = range;
  for (const e of enemies) { const d = gdist(P, e); if (d < bd) { bd = d; best = e; } }
  return best;
}
function aimPoint(d) {
  const t = nearestEnemy(RANGE);
  return t ? { x: t.x, y: t.y } : { x: P.x + P.face.x * d, y: P.y + P.face.y * d * YK };
}
// метка «удар атакой» (предметы v87): atk — сейчас бьёт снаряд обычной атаки героя; proc — урон эффекта предмета; noLs — без вампиризма
const HIT = { atk: false, proc: false, noLs: false };
function hurtEnemy(e, dmg, col) {
  if (e.hp <= 0) return;
  dmg *= P.dmgMul || 1;
  e.hp -= dmg; e.flash = 0.08;
  say(e.x + rnd(-14, 14), e.y - (e.ch.ok ? e.ch.top * e.ch.U * e.sc * 0.8 : e.rad * 2.2), Math.round(dmg), col || '#bfe6ff');
  if (e.hp <= 0) {
    kills++; gainXp((e.k.xp || KILL_XP[e.type] || 8) * (e.elite ? BAL.ELITE.xp : 1));
    e.dieT = 0; e.anim = 'die'; e.act = null; corpses.push(e);
    if (typeof SHOP !== 'undefined') SHOP.onKill(e);
    snd('enemy_death', e.boss ? 1 : 0.45, e.boss ? 0.75 : rnd(0.92, 1.1));
    snd('coins', e.boss ? 0.85 : 0.55);   // звон золота, выпавшего с врага
  }
}
function slow(e, k, t) { e.slowK = Math.min(e.slowT > 0 ? e.slowK : 1, k); e.slowT = Math.max(e.slowT, t); }
function shoot() {
  const t = nearestEnemy(RANGE);
  let dx = P.face.x, dy = P.face.y;
  if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
  shots.push({ own: 'p', x: P.x + dx * 26 * HS(), y: P.y + dy * 26 * YK * HS(), dx, dy, sp: 980, tgt: t, left: 700, dmg: rnd(44, 56), h: CH * 0.55 * HS(), sc: HS() });
  P.atkCd = 0.62; P.cast = 0.16;
  P.act = { anim: 'atk', t: 0, dur: HERO.mul ? Math.min(mulDur(HERO, 'atk'), P.atkCd * 0.95) : 0.36, row: t ? runRow(t.x - P.x, t.y - P.y) : null };
  snd('hero_shot', 0.8);
}
// размер героя из редактора: скиллы и выстрелы растут вместе с ним (и картинка, и зона поражения)
const HS = () => (CFG.units.hero.scale || 1);
function cast(id) {
  if (P.dead > 0 || P.cd[id] > 0 || (typeof SHOP !== 'undefined' && SHOP.paused)) return;
  if (P.mp < MANA[id]) { if (!P.noMana || P.noMana < performance.now()) { say(P.x, P.y - CH * HS(), 'мало маны', '#8ab8ff'); P.noMana = performance.now() + 700; } return; }
  if (id === 'q') {
    const c = aimPoint(320 * HS()), R = 215 * HS();
    fx.push({ type: 'nova', x: c.x, y: c.y, t: 0, dur: 0.95, R });
    for (const e of enemies) if (gdist(c, e) < R + e.rad) { hurtEnemy(e, 95 * skDmg('q')); slow(e, 0.45, 3.5); }
    snd('nova', 0.9);
  } else if (id === 'e') {
    const t = nearestEnemy(RANGE);
    if (!t) { say(P.x, P.y - CH * HS(), 'нет цели', '#ffd28a'); return; }
    t.root = 2.8 + 0.1 * (skLv('e') - 1); t.dot = 45 * skDmg('e'); hurtEnemy(t, 40 * skDmg('e'));
    fx.push({ type: 'chains', e: t, x: t.x, y: t.y, t: 0, dur: 3.25, h: t.ch.top * t.ch.U * t.sc });
    snd('chains', 0.85);
  } else if (id === 'f') {
    const c = aimPoint(340 * HS());
    zones.push({ type: 'hail', x: c.x, y: c.y, R: 250 * HS(), t: 3.2, tick: 0, mul: skDmg('f') });
    snd('hail', 0.8);
  } else if (id === 'r') {
    const agh = typeof ITEMFX !== 'undefined' && ITEMFX.pas('agh');   // Скипетр Аганима: Буря дольше и сильнее
    P.ult = 5 + 0.2 * (skLv('r') - 1) + (agh ? agh.t : 0); P.ultTick = 0; P.ultMul = skDmg('r') * (agh ? agh.k : 1);   // звук бури длится те же 5 секунд
    snd('storm', 0.85);
  }
  P.cd[id] = CDMAX[id] * (P.cdMul || 1) * skCd(id); P.cast = 0.3; P.mp -= MANA[id];
  const an = MAGE_AN[id];   // Q — нова, E — оковы, F — град, R — буря
  P.act = { anim: an, t: 0, dur: HERO.mul ? mulDur(HERO, an) : 0.7, row: null };
}
const MAGE_AN = { q: 'nova', e: 'chains', f: 'hail', r: 'storm' };
function hurtPlayer(d) {
  if (P.dead > 0) return;
  d *= P.armMul || 1;
  P.hp -= d; P.hurt = 0.25;
  say(P.x + rnd(-12, 12), P.y - CH * 1.05 * HS(), '-' + Math.round(d), '#ff8a7a');
  if (P.hp <= 0) { P.hp = 0; P.dead = P.deadMax = typeof LIMBO !== 'undefined' && !(window.NETC && NETC.on) ? 2.2 : 3; P.ult = 0; held.touch = held.mouse = false; snd('hero_death', 0.75); }
}
// ледяной осколок, падающий с неба: через delay бьёт по кругу
function shard(x, y, R, dmg, sk, st) {
  fx.push({ type: 'shard', x, y, t: 0, dur: 0.28, R: R * HS(), dmg, sk, st, sc: HS() });
}

// ---------- враги ----------
// Спрайты отрендерены из 3D-моделей: 5 направлений в строках (вниз, вниз-вправо, вправо, вверх-вправо, вверх),
// три левых получаются зеркалом. AN: [первая колонка, число кадров].
const COS_EL = Math.cos(35 * Math.PI / 180);
const AN = { run: [0, 8], atk: [8, 6], die: [14, 5], idle: [19, 1], cast: [20, 5] };
// U — сколько единиц мира приходится на метр модели; top — высота полоски здоровья в метрах
const VAN = Object.assign({ leap: [25, 6] }, AN);   // раскладка листов злодеев: + прыжок
const CHARS = {
  // Шипокорень — лесной голем из ChatGPT (v49): листы без потерь, ходьба и удар — 8 направлений, стойка — 3, смерть — 1
  thornroot: { lazy: 1, U: 100, top: 2.45, k: 1.14, mul: {
    idle: { at: 'th_idle', n: 4, ms: 230, rows: 3, foot: 230 }, run: { at: 'th_walk', n: 6, ms: 115, rows: 8, foot: 230 },
    atk: { at: 'th_attack', n: 6, ms: 105, rows: 8, foot: 294 }, die: { at: 'th_death', n: 6, ms: 170, rows: 1, foot: 294 } } },
};
// лист персонажа: у старых — сразу, у злодеев — по первому требованию (needChar)
function needChar(c) {
  if (c && c.mul && !c.hero) return loadMul(c);
  if (!c || c.hero || c.img) return;
  const im = c.img = new Image(); im.onload = () => { c.ok = true; }; im.src = 'chars/at_' + c.at + '.webp' + V;
}
// злодеи и боссы из ChatGPT (chars/villains.js, tools/villains_prep.py): рост из roster.py в пикселях листа,
// VK — единиц мира на пиксель, как у Шипокорня (212 px -> ~240), так что все они в одном масштабе с героем
const VK = 1.14;
if (typeof VILLAINS !== 'undefined') for (const id in VILLAINS) { const v = VILLAINS[id]; CHARS[id] = { lazy: 1, U: 100, top: v.size * VK / 100, k: VK, mul: v.mul, vfx: v.vfx }; }
for (const k in CHARS) { CHARS[k].at = k; if (!CHARS[k].lazy) needChar(CHARS[k]); }
// Ganfaul в общей таблице: рисуется своими листами (HERO), размеры — как у остальных
CHARS.ganfaul = { hero: true, U: 118, top: 1.5, get ok() { return HERO.ok; } };

// ---------- персонажи из ChatGPT: каждая анимация — свой лист (атлас без потерь chars/at_<at>.webp) ----------
// 8 рядов — направления как у runRow (0 вниз, 1 вниз-влево … 6 вправо, 7 вниз-вправо), левые уже нарисованы, не зеркалим.
// rows 1 — один ряд (смерть, лицом вниз-вправо; для левых сторон зеркалим), rows 3 — вниз, вниз-влево, вниз-вправо.
// k — единиц мира на пиксель кадра, foot — линия ног в клетке, ms — длительность кадра (meta.json художника).
function loadMul(c) {
  if (c.loading) return; c.loading = true;
  for (const id in c.mul) {
    const a = c.mul[id]; if (a.img) continue;
    a.img = new Image();
    a.img.onload = () => {
      if (c.tint) {   // перекрашенный злодей: один раз рисуем лист через фильтр в свой холст
        const im = a.img, cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight;
        const g = cv.getContext('2d'); g.filter = c.tint; g.drawImage(im, 0, 0); a.img = cv;
      }
      a.ok = true; c.ok = Object.values(c.mul).every(x => x.ok);
    };
    a.img.src = 'chars/at_' + a.at + '.webp' + V;
  }
}
const SKILL_AN = { nova: 1, chains: 1, hail: 1, storm: 1 };
function mulAnim(c, anim) {
  const M = c.mul;
  return M[anim] || ((anim === 'cast' || anim === 'leap') && (M.cast1 || M.nova || M.atk)) || (SKILL_AN[anim] && (M.cast || M.atk)) || M.idle;
}
const mulDur = (c, anim) => { const a = mulAnim(c, anim); return a.n * a.ms / 1000; };
function drawMulti(c, anim, fi, row, flash) {
  const a = mulAnim(c, anim);
  if (!a.ok) return;
  const A = ATLAS[a.at];
  fi = Math.max(0, Math.min(a.n - 1, fi | 0));
  let r = row, flip = false;
  if (a.rows === 1) { r = 0; flip = row >= 1 && row <= 3; }
  else if (a.rows === 3) r = row === 0 || row === 4 ? 0 : row <= 3 ? 1 : 2;
  const size = A.cell * c.k;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  drawCell(ctx, a.img, a.at, fi, r, -size / 2, -a.foot * c.k, size);
  if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; drawCell(ctx, a.img, a.at, fi, r, -size / 2, -a.foot * c.k, size); }
  ctx.restore();
}
// число кадров анимации героя (новый Ganfaul — листы mul, лучница — прежние листы an)
function heroFrames(H, anim) { return H.mul ? mulAnim(H, anim).n : (H.an[anim] || (SKILL_AN[anim] && H.an.cast) || H.an.idle).n; }
// сколько кадров в анимации у данного персонажа (у обычных листов каста нет — вместо него атака)
function animOf(c, anim) {
  if (c.hero) return anim;
  if (anim === 'leap') return c.leap ? 'leap' : c.cast ? 'cast' : 'atk';
  return anim === 'cast' && !c.cast ? 'atk' : anim;
}
function frames(c, anim) {
  if (c.hero) return heroFrames(HERO, anim);
  if (c.mul) return mulAnim(c, anim).n;
  const A = c.an || AN; return (A[animOf(c, anim)] || A.idle)[1];
}
// один кадр персонажа: row — направление 0..7 (0 вниз, 2 влево, 4 вверх, 6 вправо)
function drawSprite(c, anim, fi, row, flash) {
  if (c.hero) return drawHeroSprite(anim, fi, row, flash);
  if (c.mul) return drawMulti(c, anim, fi, row, flash);
  anim = animOf(c, anim);
  const a = (c.an || AN)[anim] || (c.an || AN).idle;
  fi = Math.max(0, Math.min(a[1] - 1, fi));
  // в листах ряды 1–3 смотрят ВПРАВО (вниз-вправо, вправо, вверх-вправо); левые направления — их зеркало
  const flip = row >= 1 && row <= 3;
  if (row > 4) row = 8 - row;
  // ob — анимации, снятые с другим охватом камеры (прыжок и падение шире)
  const ort = (c.ob && c.ob[anim]) || c.ortho, size = ort * c.U, ay = 0.5 + c.zc * COS_EL / ort;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  drawCell(ctx, c.img, c.at, a[0] + fi, row, -size / 2, -ay * size, size);
  if (flash) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75;
    drawCell(ctx, c.img, c.at, a[0] + fi, row, -size / 2, -ay * size, size);
  }
  ctx.restore();
}
// Герой: три листа по 400 px на кадр. s — лист, i — первый кадр в полосе направления, n — число кадров,
// o — сколько метров модели охватывает кадр (стойка и бег сняты крупно, падение — шире).
let HERO = { pre: 'hero_', U: 118, zc: 0.9, cell: 400,
  sheets: { a: { wrap: 6, rows: 2 }, b: { wrap: 6, rows: 2 }, d: { wrap: 5, rows: 1 } },
  an: { idle: { s: 'a', i: 0, n: 4, o: 2.4 }, run: { s: 'a', i: 4, n: 8, o: 2.4 }, atk: { s: 'b', i: 0, n: 5, o: 2.4 },
    cast: { s: 'b', i: 5, n: 6, o: 2.6 }, die: { s: 'd', i: 0, n: 5, o: 3.0 } } };
// Ganfaul (v49): спрайты ChatGPT — стойка 4 кадра, бег 6, атака и скиллы по 6, смерть 6 в одном ряду.
// Рост — как у прежней модели (k подобран по высоте фигуры). Каждому скиллу — своя анимация.
const GF_ROW = (at, n, ms, rows) => ({ at: 'gf_' + at, n, ms, rows: rows || 8, foot: 344 });
const GANFAUL = { k: 0.8173, mul: { idle: GF_ROW('idle', 4, 230), run: GF_ROW('run', 6, 95), atk: GF_ROW('attack', 6, 85),
  nova: GF_ROW('nova', 6, 95), chains: GF_ROW('chains', 6, 95), hail: GF_ROW('hail', 6, 110), storm: GF_ROW('storm', 6, 120), die: GF_ROW('death', 6, 170, 1),
  runshoot: GF_ROW('runshoot', 6, 95), runrel: GF_ROW('runrel', 6, 100) } };   // v103: бег со стрельбой и замах на бегу — как у Эйры (drawHero)
// листы героя грузятся только у выбранного героя (heroes.js вызывает loadHero)
function loadHero(H) {
  if (H.mul) return loadMul(H);
  if (H.loading) return; H.loading = true;
  for (const k in H.sheets) {
    const S = H.sheets[k]; S.img = new Image();
    S.img.onload = () => { S.ok = true; H.ok = Object.values(H.sheets).every(x => x.ok); };
    S.img.src = 'chars/at_' + H.pre + k + '.webp' + V;
  }
}
const MAGE = HERO = GANFAUL;   // прежние листы hero_a/b/d больше не нужны
function drawHeroSprite(anim, fi, row, flash) {
  if (HERO.mul) return drawMulti(HERO, anim, fi, row, flash);
  const a = HERO.an[anim] || (SKILL_AN[anim] && HERO.an.cast) || HERO.an.idle, S = HERO.sheets[a.s];
  fi = a.i + Math.max(0, Math.min(a.n - 1, fi));
  const flip = row >= 1 && row <= 3;            // ряды 1–3 листа смотрят вправо, левые — зеркало
  if (row > 4) row = 8 - row;
  const gx = fi % S.wrap, gy = row * S.rows + Math.floor(fi / S.wrap), nm = HERO.pre + a.s;
  const size = a.o * HERO.U, ay = 0.5 + HERO.zc * COS_EL / a.o;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  drawCell(ctx, S.img, nm, gx, gy, -size / 2, -ay * size, size);
  if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; drawCell(ctx, S.img, nm, gx, gy, -size / 2, -ay * size, size); }
  ctx.restore();
}
// герой: персонаж и размер берутся из настроек редактора; адрес с #lira возвращает прежнюю Лиру
function drawHero() {
  const u = CFG.units.hero, c = HERO !== MAGE ? CHARS.ganfaul : CHARS[u.char] || CHARS.ganfaul;
  if (!c.ok || location.hash.indexOf('lira') >= 0) return false;
  const M = c.hero && HERO.mul, ms = a => mulAnim(HERO, a).ms / 1000;   // у новых листов — темп кадров художника
  let anim = 'idle', fi = Math.floor(P.heroT / (M ? ms('idle') : 1 / 3)) % frames(c, 'idle'), row = runRow(P.face.x, P.face.y);
  if (P.dead > 0) { anim = 'die'; const dd = Math.max(0, (P.deadMax || 3) - P.dead); fi = M ? Math.floor(dd / ms('die')) : Math.floor(dd / 0.6 * frames(c, 'die')); }
  else if (P.act) { anim = P.act.anim; fi = Math.floor(P.act.t / P.act.dur * frames(c, anim)); if (P.act.row != null) row = P.act.row; }
  // v101, бег со стрельбой (есть лист runshoot — пока только у Эйры): на бегу вместо стоячей атаки — ноги бегут в такт обычному бегу,
  // лук смотрит на цель; бежит от цели — кадры идут назад (бег спиной вперёд). Между выстрелами, пока атака зажата, лук не опускается.
  const RS = M && HERO.mul.runshoot && P.dead <= 0 && P.moving;
  if (RS && ((P.act && P.act.anim === 'atk') || (!P.act && P.rsUntil > P.heroT && (held.key || held.touch || held.mouse || held.pad)))) {
    if (P.act) { P.rsUntil = P.heroT + 0.7; if (P.act.row != null) P.rsRow = P.act.row; else P.rsRow = row; }
    anim = 'runshoot'; row = P.rsRow != null ? P.rsRow : row;
    if (P.act && P.act !== P.rsAct) { P.rsAct = P.act; P.rsShot = P.heroT; }   // стрела вылетает в начале выстрела
    fi = Math.floor(P.heroT / ms('run') * (P.running ? 1 : 0.8)) % frames(c, 'runshoot');
    const v = inputVector(), ang = (90 + 45 * row) * Math.PI / 180;
    if (v.m > 0.12 && (v.ax * Math.cos(ang) + v.ay * Math.sin(ang)) / v.m < -0.3) fi = frames(c, 'runshoot') - 1 - fi;   // спиной вперёд: лук всё время на цель
    // v102: бежит к цели или вбок — лист с полным выстрелом (runrel): кадр 0 в момент вылета стрелы, дальше рука к колчану, стрела,
    // натяг; последние кадры (натяг) держатся до следующего выстрела
    else if (HERO.mul.runrel) { anim = 'runrel'; fi = Math.max(0, Math.min(frames(c, 'runrel') - 1, Math.floor((P.heroT - (P.rsShot || 0)) / ms('runrel')))); }
  }
  else if (P.act || P.dead > 0) {}
  else if (P.moving) { anim = 'run'; fi = M ? Math.floor(P.heroT / ms('run') * (P.running ? 1 : 0.8)) % frames(c, 'run') : Math.floor(P.heroT * (P.running ? 9.5 : 7.5)) % 8; }
  ctx.save(); ctx.translate(P.x, P.y); ctx.scale(u.scale, u.scale);
  if (P.dead > 0) ctx.globalAlpha = Math.min(1, P.dead / 0.8);
  drawSprite(c, anim, fi, row, P.hurt > 0.17);
  ctx.restore();
  return true;
}
// виды врагов KIND, варианты VARIANT, мини-боссы и миры ROSTER — в roster.js (подключается перед этим файлом)
const rosterOf = n => ROSTER[BAL.at(n).M] || ROSTER[1];

// листы перекрашенных злодеев: своя копия анимаций, картинка перекрашивается фильтром при загрузке (loadMul)
for (const id in VARIANT) {
  const k = KIND[id], c0 = CHARS[k.chBase];
  if (!c0 || !c0.mul) continue;
  const mul = {}; for (const n in c0.mul) { const a = c0.mul[n]; mul[n] = { at: a.at, n: a.n, ms: a.ms, rows: a.rows, foot: a.foot }; }
  CHARS[id] = { lazy: 1, U: c0.U, top: c0.top, k: c0.k, mul, vfx: c0.vfx, tint: k.tint, at: id };
}
// настройки редактора: персонаж, размер и множители скорости, силы, здоровья
for (const id in KIND) {
  const u = CFG.units[id], k = KIND[id];
  k.sc = k.sz || 1; k.pw = 1;
  if (!u) continue;
  if (CHARS[u.char]) k.ch = u.char;
  k.sc = u.scale; k.pw = u.power; k.hp *= u.hp; k.speed *= u.speed; k.rad *= Math.sqrt(u.scale);
}
const corpses = [];
function spawnEnemy(type) {
  if (ROUND.mini === type && ROUND.queue.length === 0) { ROUND.mini = null; spawnEnemyBase(type); const e = enemies[enemies.length - 1];
    // мини-босс: своё здоровье и урон (BAL.MINI, BAL.miniHp) — без множителей элиты, иначе его умения били вдвое сильнее задуманного
    e.mini = true; e.hp = e.max = Math.round(e.k.hp * BAL.hp(wave) * BAL.miniHp(wave)); e.dm = BAL.dmg(wave) * e.k.pw * BAL.MINI.dmg;
    if (!/^mb_/.test(e.k.ch)) { e.sc *= 1.2; e.rad *= 1.15; }
    else { e.sc /= BAL.ELITE.size; e.rad /= BAL.ELITE.size; }   // у новых мини-боссов (листы mb_*) рост задан художником — без прибавки элиты и ×1,2
    const nm = Array.isArray(e.k.nm) ? e.k.nm[0] : e.k.nm || 'Мини-босс';
    say(P.x, P.y - CH * 1.4 * HS(), 'Мини-босс: ' + nm, '#ffb36a');
    if (!(typeof BOSSVO !== 'undefined' && BOSSVO[type] && BOSSVO[type].g)) snd('boss_roar', 0.7, 1.2);   // у мини-босса свой крик (bossvo.js)
    return; }
  spawnEnemyBase(type);
}
function spawnEnemyBase(type) {
  const k = KIND[type], el = !!k.elite;
  needChar(CHARS[k.ch]);
  const e = {
    type, k, ch: CHARS[k.ch], boss: !!k.boss, elite: el, mel: !!k.mel, rng: !!k.rng,
    x: ENEMY_SPAWN.x + rnd(-90, 90), y: ENEMY_SPAWN.y + rnd(-30, 90),   // выходят из красного портала
    // рост от волны к волне и от мира к миру — BAL в data.js
    hp: Math.round(k.hp * BAL.hp(wave)), dm: BAL.dmg(wave) * k.pw, sc: k.sc,
    rad: k.rad, speed: k.speed * BAL.speed(wave), col: k.col, eye: k.boss ? '#ffb347' : '#ffe27a',
    slowT: 0, slowK: 1, root: 0, dot: 0, atkCd: rnd(0.3, 1.2), flash: 0, bob: rnd(0, 6), slamCd: 2, quakeCd: 7, leapCd: 4, summonCd: 9, jump: 0,
    anim: 'run', animT: rnd(0, 1), runPh: rnd(0, 1), row: 2, act: null,
  };
  if (k.boss) { e.hp = Math.round(e.hp * BAL.bossHp(wave)); e.dm *= BAL.bossDmg(wave); const tn = typeof tune1 === 'function' && tune1(e); if (tn && tn.dm) e.dm *= tn.dm; }
  else if (!el && typeof SOFT1 === 'function' && SOFT1()) e.dm *= 0.8;   // v101: рядовые мира 1 на первом круге бьют слабее — они учат рывку, а не убивают
  if (el) { e.hp = Math.round(e.hp * BAL.ELITE.hp); e.dm *= BAL.ELITE.dmg; e.sc *= BAL.ELITE.size; e.rad *= BAL.ELITE.size; }
  e.max = e.hp;
  e.draw = () => drawEnemy(e);
  enemies.push(e);
}
// ---------- раунды ----------
// Раунд — несколько волн подряд без перерыва на магазин: волны 1–3, 4–6, 7–9 мира, 10-я — босс мира один.
// Враги не появляются все сразу: выходят группами по 1–3 из разных входов карты (SPAWNS), на арене одновременно
// не больше MAX_ALIVE. Следующая волна раунда начинается, когда очередь пуста и живых осталось двое-трое.
const ROUND = { queue: [], relT: 0, nextT: 0, endW: 0 };
const MAX_ALIVE = 16;
function roundEnd(n) { const W = BAL.at(n).W; return W >= 10 ? n : n + 2 - (W - 1) % 3; }
function spawnWave() { ROUND.endW = roundEnd(wave + 1); nextWave(); }
function nextWave() {
  wave++; ROUND.nextT = 0; ROUND.relT = 0.4;
  const a = BAL.at(wave), R = rosterOf(wave), q = [];
  ROUND.fin = a.W === 10 && R.final ? R.final : null; ROUND.finT = 0;
  if (ROUND.fin) needChar(CHARS[KIND[ROUND.fin].ch]);
  if (a.W === 10) q.push(R.boss);
  else {
    // правки состава по плану миров (v101): только вне сети; F1 — номер мира на первом круге, иначе 0
    const off = !(window.NETC && NETC.on), F1 = typeof FIRST === 'function' && FIRST() ? a.M : 0;
    const n = Math.round(BAL.count(wave) * (F1 === 7 && a.W >= 4 ? 1.15 : 1));   // мир 7: волны 4–9 чуть плотнее
    const nr = Math.round(n * (a.M === 1 && a.C === 1 ? 0.15 : F1 === 6 && a.W >= 4 ? 0.35 : 0.25));   // в мире 1 стрелков меньше: больше простых ближних, которые берут в кольцо (v99)
    let RNG = R.rng;
    if (F1 === 6 && a.W >= 4) RNG = ['yeti', 'v_glacierlich', 'yeti', 'v_glacierlich', 'v_icejelly'];   // мир 6: чаще Йети и Лич ледника
    if (off && a.M === 10 && KIND.v_warlock) RNG = R.rng.concat('v_warlock');                         // мир 10: чернокнижник замка, ушедший в Бездну («Палец смерти»)
    for (let i = 0; i < n - nr; i++) q.push(R.mel[(wave === 1 && i < 6 ? 0 : i) % R.mel.length]);
    for (let i = 0; i < nr; i++) q.push(RNG[i % RNG.length]);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    // элита выходит ближе к концу волны, когда рядовые уже потрёпаны
    const ne = BAL.elites(wave) + (F1 === 10 && a.W >= 7 ? 1 : 0);   // мир 10: в волнах 7–9 элиты больше
    for (let i = 0; i < ne; i++) q.splice(Math.floor(q.length * (0.55 + 0.3 * i)), 0, R.elite[(i + wave) % R.elite.length]);
    // мини-босс в конце каждой части мира (волны 3, 6, 9) — выходит последним
    ROUND.mini = a.W % 3 === 0 ? miniOf(R, a.W) : null;
    if (ROUND.mini) q.push(ROUND.mini);
  }
  ROUND.queue = q;
  for (const t of new Set(q)) needChar(CHARS[KIND[t].ch]);   // листы злодеев этой волны — заранее
  const boss = a.W === 10, last = wave === ROUND.endW;
  say(P.x, P.y - CH * 1.3 * HS(), boss ? 'Волна ' + wave + ' — БОСС МИРА' : 'Волна ' + wave + (last ? '' : '  · дальше без передышки'), boss ? '#ff9a6a' : '#ffe9a8');
  if (wave > 1 && !boss) snd('wave_horn', 0.5, 1.1);
}
let spawnRR = 0;
function pickSpawn() {
  if (typeof SOFT1 === 'function' && SOFT1() && SPAWNS.length > 1) return SPAWNS[spawnRR++ % SPAWNS.length];   // v101: в мире 1 враги заходят со всех сторон по очереди — берут в кольцо
  let s = 0; for (const p of SPAWNS) s += p.w;
  let r = Math.random() * s;
  for (const p of SPAWNS) { r -= p.w; if (r <= 0) return p; }
  return SPAWNS[0];
}
// Мир 4 на первом круге (v101): на арене одновременно не больше двух злодеев с оглушением или превращением и не больше одной
// Жабьей ведьмы — иначе контроль шёл цепочкой (225 из 707 смертей бота в 100 прогонах). Лишние ведьма и элита
// ждут своей очереди (не дольше 10 с), состав волны не меняется. Мини-босс остаётся последним в очереди.
const HARD4 = { toadwitch: 1, el_drowned: 1, el_witch: 1, mb_crocodile: 1 };
function takeSpawn() {
  const q = ROUND.queue;
  if (typeof FIRST === 'function' && FIRST(4) && HARD4[q[0]]) {
    let hard = 0, witch = 0; for (const e of enemies) if (e.dieT == null && e.hp > 0 && HARD4[e.type]) { hard++; if (e.type === 'toadwitch') witch++; }
    const ok = t => !HARD4[t] || (hard < 2 && !(t === 'toadwitch' && witch));
    if (!ok(q[0])) {
      const i = q.findIndex(ok);   // вперёд выходит первый, кому можно; если таких нет — ждём, пока место освободится
      if (i > 0 && !(ROUND.mini && i === q.length - 1)) q.unshift(q.splice(i, 1)[0]); else if ((ROUND.hold = (ROUND.hold || 0) + 1) < 8) return null;
    }
  }
  ROUND.hold = 0; return q.shift();
}
// выпуск врагов из очереди и переход к следующей волне раунда
function runTick(dt) {
  if (ROUND.queue.length) {
    ROUND.relT -= dt;
    if (ROUND.relT <= 0 && enemies.length < MAX_ALIVE) {
      const sp = pickSpawn(), n = Math.min(ROUND.queue.length, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < n; i++) {
        const t = takeSpawn(); if (!t) break;
        spawnEnemy(t); const e = enemies[enemies.length - 1];
        e.x = sp.x + rnd(-70, 70); e.y = sp.y + rnd(-40, 40); collide(e);
      }
      ROUND.relT = rnd(0.9, 1.8) * (enemies.length > 10 ? 1.4 : 1);
    }
  } else if (wave < ROUND.endW) {
    let alive = 0; for (const e of enemies) if (!e.dieT) alive++;
    if (alive <= 3 && (ROUND.nextT += dt) > 2.2) nextWave();
  } else if (ROUND.fin && !enemies.some(e => !e.dieT) && (ROUND.finT += dt) > 2.5) {
    // Владыка Пепла пал — из Бездны выходит финальный босс
    ROUND.queue.push(ROUND.fin); ROUND.fin = null; ROUND.relT = 0.3;
    say(P.x, P.y - CH * 1.3 * HS(), 'ФИНАЛ — Архимаг Бездны!', '#c9a8ff'); snd('wave_horn', 0.6, 0.8);
  }
}
const roundActive = () => ROUND.queue.length > 0 || wave < ROUND.endW || !!ROUND.fin;
// действие с замахом: анимация длится dur, удар срабатывает в момент at (доля от dur)
function startAct(e, anim, dur, at, fn) { e.act = { anim, dur, at, fn, t: 0, hit: false }; e.anim = anim; e.animT = 0; }
function updateEnemy(e, dt) {
  e.bob += dt * 7; e.flash -= dt; e.atkCd -= dt; e.slamCd -= dt; e.quakeCd -= dt; e.leapCd -= dt; e.summonCd -= dt; e.animT += dt;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.silT > 0) e.silT -= dt;
  if (e.kb) {
    const q = Math.min(dt, e.kb.t); e.x += e.kb.vx * q; e.y += e.kb.vy * q; e.kb.t -= dt; collide(e);
    e.act = null; e.leap = null; e.jump = 0; e.anim = 'idle';
    if (e.kb.t <= 0) e.kb = null;
    return;
  }
  if (e.root > 0) {
    if (e.leap) { e.leap = null; collide(e); }   // пойман в прыжке: остаётся на месте, но не внутри камня
    e.root -= dt; e.act = null; e.jump = 0; e.anim = 'idle'; hurtTick(e, e.dot * dt); if (e.root <= 0 && e.acc > 0 && e.hp > 0) { hurtEnemy(e, e.acc, '#9fe0ff'); e.acc = 0; } return;   // остаток урона оков не теряется
  }
  const k = e.k, sk = e.slowT > 0 ? e.slowK : 1;
  let dx = (P.x - e.x), dy = (P.y - e.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  if (e.act) {
    const a = e.act; a.t += dt * (0.5 + 0.5 * sk);
    if (!a.hit && a.t >= a.dur * a.at) { a.hit = true; a.fn(dx, dy); }
    if (e.leap) {
      // прыжок босса: летит по дуге в отмеченную точку
      const L = e.leap; L.t += dt; const q = Math.min(1, L.t / L.dur);
      e.x = L.x0 + (L.x1 - L.x0) * q; e.y = L.y0 + (L.y1 - L.y0) * q; e.jump = Math.sin(Math.PI * q) * 150;
      if (q >= 1) { e.leap = null; e.jump = 0; collide(e); }
    }
    if (a.t >= a.dur) { e.act = null; e.anim = 'idle'; }
    return;
  }
  if (P.dead > 0) { e.anim = 'idle'; return; }
  // поворот с запасом: враг меняет направление, только когда цель ушла от текущего больше чем на 30 градусов
  const ang = Math.atan2(P.y - e.y, P.x - e.x) * 180 / Math.PI;
  if (Math.abs(((ang - (e.row * 45 + 90) + 540) % 360) - 180) > 30) e.row = runRow(P.x - e.x, P.y - e.y);
  const d = gdist(P, e), sp = e.speed * sk;
  const want = e.rng ? k.want : e.boss ? 105 : k.reach - 10;
  if (d > want) {
    // обход препятствий: если герой не виден напрямую, идём по сетке проходимости (navDir в worlds.js)
    const nv = typeof navDir === 'function' ? navDir(e) : null, mx = nv ? nv[0] : dx, my = nv ? nv[1] : dy;
    e.x += mx * sp * dt; e.y += my * sp * YK * dt; collide(e); e.anim = 'run';
    // темп шагов привязан к скорости: один цикл бега покрывает около 2,3 метра модели
    e.runPh += dt * Math.max(0.8 * sk, Math.min(1.5, sp / (2.3 * e.ch.U)));
  }
  else e.anim = 'idle';
  if (e.mel && d < k.reach + 12 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    startAct(e, 'atk', 0.5, 0.55, () => {
      if (gdist(P, e) < k.reach + 34 && P.dead <= 0) {
        const hd = rnd(k.dmg[0], k.dmg[1]) * e.dm;
        if (typeof ITEMFX !== 'undefined' && ITEMFX.evade()) say(P.x, P.y - CH * HS(), 'уклон', '#d0e8ff');   // Бабочка
        else { hurtPlayer(hd);
        if (k.leech) { e.hp = Math.min(e.max, e.hp + hd * k.leech); say(e.x, e.y - 60, '+' + Math.round(hd * k.leech), '#e05a6a'); } }   // Пиявец пьёт кровь
        snd('enemy_melee', 0.5, rnd(0.9, 1.1));
      }
    });
  }
  if (e.rng && !(e.silT > 0) && d < k.want + 40 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    startAct(e, 'atk', 0.55, 0.5, (ax, ay) => {
      const a0 = Math.atan2(ay, ax), nf = k.fan || 1;
      for (let i = 0; i < nf; i++) {
        const a = a0 + (i - (nf - 1) / 2) * 0.2, dx = Math.cos(a), dy = Math.sin(a);
        shots.push({ own: 'e', bolt: k.bolt, col: k.pcol, x: e.x + dx * 20, y: e.y + dy * 20 * YK, dx, dy, sp: k.shot, left: k.want + 150,
          dmg: rnd(k.dmg[0], k.dmg[1]) * e.dm, h: e.ch.U * 0.75 * e.sc * (e.ch.mul ? e.ch.top / 1.6 : 1) });
      }
      snd(k.bolt ? 'enemy_arrow' : 'enemy_fireball', 0.45, rnd(0.95, 1.05));
    });
  }
  if (e.boss && !(e.silT > 0) && !k.spells) bossSkills(e, d);   // у боссов с магией — свои заклинания (enemies.js)
}
// Скиллы босса: удар по земле вблизи, прыжок на героя издалека, землетрясение под героем, призыв свиты.
// Ниже 40% здоровья впадает в ярость: быстрее двигается и чаще применяет скиллы.
function bossSkills(e, d) {
  if (!e.rage && e.hp < e.max * 0.4) {
    e.rage = true; e.speed *= 1.35;
    say(e.x, e.y - e.ch.top * e.ch.U * e.sc - 30, 'ЯРОСТЬ!', '#ff5a3a');
    snd('boss_roar', 1);
  }
  const cdk = e.rage ? 0.65 : 1;
  if (e.summonCd <= 0 && enemies.length < 14) {
    e.summonCd = 17 * cdk;
    startAct(e, 'cast', 1.2, 0.55, () => {
      for (let i = 0; i < 3; i++) {
        spawnEnemy(rosterOf(wave).mel[0]); const m = enemies[enemies.length - 1], a = rnd(0, 6.283);
        m.x = e.x + Math.cos(a) * 110; m.y = e.y + Math.sin(a) * 110 * YK; collide(m);
        fx.push({ type: 'quake', x: m.x, y: m.y, t: 0, dur: 0.6, R: 60 });
      }
      say(e.x, e.y - e.ch.top * e.ch.U * e.sc - 30, 'Ко мне!', '#ffb36a');
      snd('boss_roar', 0.8, 1.12);
    });
  } else if (e.quakeCd <= 0) {
    e.quakeCd = 12 * cdk;
    startAct(e, 'cast', 1.3, 0.25, () => {
      fx.push({ type: 'tele', x: P.x, y: P.y, t: 0, dur: 1.6, R: 290, dmg: 120 * e.dm, big: true });
    });
  } else if (d > 300 && d < 900 && e.leapCd <= 0) {
    e.leapCd = 8 * cdk;
    const tx = P.x, ty = P.y;
    fx.push({ type: 'tele', x: tx, y: ty, t: 0, dur: 0.95, R: 175, dmg: 70 * e.dm });
    e.leap = { x0: e.x, y0: e.y, x1: tx, y1: ty, t: 0, dur: 0.95 };
    startAct(e, 'leap', 1.0, 2, () => {});
  } else if (d < 150 && e.slamCd <= 0) {
    e.slamCd = 2.6 * cdk;
    fx.push({ type: 'tele', x: e.x, y: e.y, t: 0, dur: 0.75, R: 155, dmg: 55 * e.dm });
    startAct(e, 'atk', 1.0, 2, () => {});
  }
}
// урон «по времени» без цифры на каждый кадр
function hurtTick(e, dmg) {
  e.acc = (e.acc || 0) + dmg;
  if (e.acc >= 15) { hurtEnemy(e, e.acc, '#9fe0ff'); e.acc = 0; }
}

// ---------- обновление ----------
function combatUpdate(dt) {
  padButtons();
  for (const k in P.cd) if (P.cd[k] > 0) P.cd[k] = Math.max(0, P.cd[k] - dt);
  P.atkCd -= dt; P.cast -= dt; P.hurt -= dt; P.heroT = (P.heroT || 0) + dt;
  if (P.slowT > 0) P.slowT -= dt;
  if (P.act) { P.act.t += dt; if (P.act.t >= P.act.dur || P.dead > 0) P.act = null; }
  if (P.dead > 0) {
    P.dead -= dt;
    // смерть офлайн — в Междумирье (limbo.js); в онлайне возрождает сервер
    if (P.dead <= 0) { P.dead = 0; if (typeof LIMBO !== 'undefined' && !(window.NETC && NETC.on)) LIMBO.enter(); else { P.hp = P.maxHp; P.mp = P.maxMp; P.x = SPAWN.x; P.y = SPAWN.y; } }
  } else {
    // своего восстановления здоровья нет (v87): только фласки, предметы, победа над боссом мира и Междумирье
    P.mp = Math.min(P.maxMp, P.mp + (P.mpRegen || MP_REGEN) * (SHOP.phase === 'rest' ? 3 : 1) * dt);   // между волнами мана копится втрое быстрее
    stepT -= dt;
    if (P.moving && stepT <= 0) { snd('step', P.running ? 0.22 : 0.14, rnd(0.94, 1.06)); stepT = P.running ? 0.33 : 0.55; }
    if ((held.key || held.touch || held.mouse || held.pad) && P.atkCd <= 0) shoot();
    if (P.ult > 0) {
      P.ult -= dt; P.ultTick -= dt;
      while (P.ultTick <= 0) {
        P.ultTick += 0.11;
        const a = rnd(0, 6.283), r = rnd(90, 400) * HS();
        shard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, 100, 60 * (P.ultMul || 1), 0.4, 2);
      }
    }
  }
  // волну запускает игрок кнопкой; магазин, золото и дроп живут в shop.js
  if (SHOP.phase === 'fight' && !(P.dead > 0)) runTick(dt);
  if (typeof SHOP !== 'undefined') SHOP.tick(dt);

  for (const e of enemies) if (e.hp > 0) updateEnemy(e, dt);   // убитый в этом кадре не делает лишний шаг (иначе затирал анимацию смерти)
  // враги не слипаются
  for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
    const a = enemies[i], b = enemies[j];
    let dx = b.x - a.x, dy = (b.y - a.y) / YK; const d = Math.hypot(dx, dy) || 0.01, need = a.rad + b.rad;
    if (d < need) { const p = (need - d) / 2 / d; a.x -= dx * p; a.y -= dy * p * YK; b.x += dx * p; b.y += dy * p * YK; }
  }

  for (const s of shots) {
    if (s.tgt && s.tgt.hp > 0) {
      let dx = s.tgt.x - s.x, dy = (s.tgt.y - s.y) / YK; const m = Math.hypot(dx, dy) || 1;
      s.dx = dx / m; s.dy = dy / m;
    }
    const step = s.sp * dt;
    s.x += s.dx * step; s.y += s.dy * step * YK; s.left -= step;
    if (s.ghost) {   // «Вместе»: выстрел напарника или чужого злодея — только картинка, гаснет у цели
      if (s.ghost === 1) { for (const e of enemies) if (e.hp > 0 && gdist(s, e) < e.rad + 16) { s.left = 0; break; } }
      else if (typeof TEAM !== 'undefined' && TEAM.pv.on && Math.hypot(s.x - TEAM.pv.x, (s.y - TEAM.pv.y) / YK) < 30 * HS()) s.left = 0;
      continue;
    }
    if (s.own === 'p') {
      for (const e of enemies) {
        if (e.hp > 0 && e !== s.hitE && gdist(s, e) < e.rad + 16 * (s.sc || 1)) {
          // пронзающая стрела Эйры (Меткость): не смотрит на щиты и броню, летит насквозь и бьёт ещё одного врага
          if (s.trueShot) P.trueShot = true;
          HIT.atk = !s.sk && !s.ill;   // снаряд обычной атаки героя: полный вампиризм и проки предметов
          try { hurtEnemy(e, s.dmg); } finally { P.trueShot = false; HIT.atk = false; }
          if (!s.arrow) slow(e, 0.8, 1);
          if (s.pierce && !s.hitE) { s.hitE = e; s.tgt = null; } else s.left = 0;
          if (s.onHit) s.onHit(e);
          fx.push({ type: 'spark', hit: 1, hit3: s.arrow, x: e.x, y: e.y - e.ch.top * e.ch.U * e.sc * 0.5, t: 0, dur: 0.4, R: 34 * (s.sc || 1), sc: s.sc || 1 });
          snd(s.arrow ? 'archer_hit' : 'hit', 0.45, rnd(0.95, 1.1));
          break;
        }
      }
    } else if (P.dead <= 0 && gdist(s, P) < 30 * HS() && typeof ITEMFX !== 'undefined' && ITEMFX.evade()) {
      s.left = 0; say(P.x, P.y - CH * HS(), 'уклон', '#d0e8ff');   // Бабочка: снаряд мимо
    } else if (P.dead <= 0 && gdist(s, P) < 30 * HS()) {
      hurtPlayer(s.dmg); s.left = 0;
      if (s.onHitP) s.onHitP(s);
      snd('enemy_melee', 0.3, 1.2);
      fx.push({ type: 'spark', x: P.x, y: P.y - CH * 0.5 * HS(), t: 0, dur: 0.25, R: 30, rock: true });
    }
  }
  for (const z of zones) {
    z.t -= dt; z.tick -= dt;
    while (z.tick <= 0) {
      z.tick += 0.13;
      const a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * z.R;
      shard(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * YK, 80, 24 * (z.mul || 1), 0.65, 1);
    }
  }
  for (const f of fx) {
    f.t += dt;
    if (f.t < f.dur || f.done) continue;
    f.done = true;
    if (f.type === 'shard') {
      let hit = false;
      for (const e of enemies) if (gdist(f, e) < f.R + e.rad) { hurtEnemy(e, f.dmg); slow(e, f.sk, f.st); hit = true; }
      fx.push({ type: 'spark', hail: 1, x: f.x, y: f.y, t: 0, dur: 0.5, R: f.R, sc: f.sc });
      if (hit || Math.random() < 0.18) snd('hit', hit ? 0.22 : 0.1, rnd(0.85, 1.2));
    }
    if (f.type === 'tele') {
      if (P.dead <= 0 && gdist(f, P) < f.R) { if (f.dmg) hurtPlayer(f.dmg); if (f.onHitP) f.onHitP(f); }
      if (f.vfx) spellFx(Object.assign({ x: f.x, y: f.y }, f.vfx));
      else fx.push({ type: 'quake', x: f.x, y: f.y, t: 0, dur: 0.75, R: f.R });
      snd('boss_slam', f.big ? 0.95 : 0.75, f.big ? 0.85 : 1);
    }
  }
  for (const t of texts) { t.t += dt; t.y -= 46 * dt; }
  for (const c of corpses) c.dieT += dt;
  keep(corpses, c => c.dieT < 2.2);
  keep(enemies, e => e.hp > 0);
  keep(shots, s => s.left > 0);
  keep(zones, z => z.t > 0);
  keep(fx, f => f.t < f.dur);
  keep(texts, t => t.t < 0.9);
}
// оставить в массиве только то, что прошло проверку, без нового массива и без splice
function keep(arr, ok) { let j = 0; for (let i = 0; i < arr.length; i++) if (ok(arr[i])) arr[j++] = arr[i]; arr.length = j; }

// ---------- графика скиллов ----------
// Листы нарисованы в ChatGPT: сетка кадров, фон переведён в прозрачность. g — число кадров по стороне.
// Из листов остались только предупреждение и удар босса; скиллы героя рисуются картинками FX2 ниже.
const FXS = { bwarn: { g: 4 }, bslam: { g: 4 } };
for (const k in FXS) { const im = FXS[k].img = new Image(); im.onload = () => { FXS[k].ok = true; }; im.src = 'fx/' + k + '.webp' + V; }
// кадр fi листа k: прямоугольник w x h, точка (ax, ay) кадра (доли 0..1) ставится в (x, y)
function fxDraw(k, fi, x, y, w, h, ax, ay, alpha) {
  const F = FXS[k], n = F.g * F.g, c = F.img.width / F.g;
  fi = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(F.img, (fi % F.g) * c, Math.floor(fi / F.g) * c, c, c, x - w * ax, y - h * ay, w, h);
  if (alpha != null) ctx.globalAlpha = 1;
}

// Эффекты версии 2: одна большая картинка из ChatGPT на эффект, движение делает код.
// «Земляные» картинки нарисованы строго сверху: их кладём на землю, сжимая по вертикали (YK), и можем вращать.
const FX2 = {};
for (const k of ['bolt', 'hit', 'nova', 'chains', 'icicle', 'shatter', 'storm']) {
  const im = new Image(); FX2[k] = { img: im }; im.onload = () => { FX2[k].ok = true; }; im.src = 'fx/fx2_' + k + '.webp' + V;
}
const fx2ok = k => FX2[k] && FX2[k].ok;
// картинка k размером w x h, точка (ax, ay) — в (x, y); rot — поворот, ground — положить на землю
function fx2(k, x, y, w, h, ax, ay, alpha, rot, ground) {
  const im = FX2[k].img;
  ctx.save(); ctx.translate(x, y);
  if (ground) ctx.scale(1, YK);
  if (rot) ctx.rotate(rot);
  if (alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(im, -w * ax, -h * ay, w, h);
  ctx.restore();
}
const easeOut = k => 1 - (1 - k) * (1 - k);
// круговая аура на земле (буря героя и ледяные зоны)
function stormDraw(x, y, R, t, alpha) {
  fx2('storm', x, y, R * 2.2, R * 2.2, 0.5, 0.5, alpha * 0.55, t * 0.9, true);
  fx2('storm', x, y, R * 1.3, R * 1.3, 0.5, 0.5, alpha * 0.22, -t * 1.4 + 1, true);
}
// иконки кнопок: лист 3x2
let SK_ICONS = new Image(); SK_ICONS.src = 'ui/sk_icons.webp' + V;
const SK_CELL = { atk: 0, q: 1, e: 2, f: 3, r: 4 };
const TOUCH_UI = 'ontouchstart' in window;   // на телефоне подписи клавиш не нужны

// ---------- рисование ----------
function disc(x, y, R, fill, stroke, lw) {
  ctx.beginPath(); ctx.ellipse(x, y, R, R * YK, 0, 0, 7);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke(); }
}
// всё, что лежит на земле: зоны, предупреждения, кольца
function combatGround(t) {
  if (window.heroGround) heroGround(t);
  const tg = P.dead > 0 ? null : nearestEnemy(RANGE);
  if (tg) disc(tg.x, tg.y, tg.rad * 1.35, null, 'rgba(160,220,255,0.75)', 2.5);
  if (P.ult > 0) {
    if (fx2ok('storm')) stormDraw(P.x, P.y, 420 * HS(), t, Math.min(1, P.ult) * 0.95);
    else { const a = Math.min(1, P.ult) * 0.22; disc(P.x, P.y, 410 * HS(), 'rgba(150,200,255,' + a + ')', 'rgba(210,235,255,' + a * 2.2 + ')', 4); }
  }
  for (const z of zones) {
    if (fx2ok('storm')) stormDraw(z.x, z.y, z.R, t + 2, Math.min(1, z.t) * 0.75);
    else { const a = Math.min(1, z.t) * 0.2; disc(z.x, z.y, z.R, 'rgba(130,180,255,' + a + ')', 'rgba(200,225,255,' + a * 2.5 + ')', 3); }
  }
  for (const f of fx) {
    const k = f.t / f.dur;
    if (f.type === 'nova') {
      if (!fx2ok('nova')) disc(f.x, f.y, f.R * Math.min(1, k * 2.2), 'rgba(140,215,255,' + 0.45 * (1 - k) + ')', 'rgba(230,248,255,' + (1 - k) + ')', 6);
    } else if (f.type === 'tele' && FXS.bwarn.ok) {
      fxDraw('bwarn', (f.t * 14) % 16, f.x, f.y, f.R * 2.2, f.R * 2.6, 0.5, 0.52, 0.55 + 0.45 * k);
    } else if (f.type === 'quake' && FXS.bslam.ok) {
      /* рисуется вместе с объектами по глубине */
    } else if (f.type === 'tele') {
      disc(f.x, f.y, f.R, 'rgba(255,90,40,' + (0.12 + 0.2 * k) + ')', 'rgba(255,170,90,0.9)', 3);
      disc(f.x, f.y, f.R * k, null, 'rgba(255,220,150,0.8)', 2);
    } else if (f.type === 'quake') {
      disc(f.x, f.y, f.R * (0.8 + 0.3 * k), 'rgba(190,130,70,' + 0.5 * (1 - k) + ')', 'rgba(255,220,170,' + (1 - k) + ')', 5);
    } else if (f.type === 'shard') {
      disc(f.x, f.y, f.R * 0.5, 'rgba(40,70,120,' + 0.25 * k + ')');
    }
  }
}
function drawEnemyOval(e) {
  const r = e.rad, h = r * 2.2, bob = e.root > 0 ? 0 : Math.sin(e.bob) * 3;
  ctx.beginPath(); ctx.ellipse(0, -h * 0.5 + bob, r, h * 0.5, 0, 0, 7);
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.col; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  const ex = Math.sign(P.x - e.x) * r * 0.22;
  ctx.fillStyle = e.eye;
  ctx.beginPath(); ctx.arc(-r * 0.34 + ex, -h * 0.64 + bob, r * 0.15, 0, 7); ctx.arc(r * 0.34 + ex, -h * 0.64 + bob, r * 0.15, 0, 7); ctx.fill();
}
function drawEnemy(e) {
  const r = e.rad, c = e.ch, dead = e.dieT != null;
  const h = c.ok ? c.top * c.U * e.sc : r * 2.2;
  ctx.save(); ctx.translate(e.x, e.y);
  if (dead) ctx.globalAlpha = Math.max(0, Math.min(1, (2.2 - e.dieT) / 0.9));
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.4, 0, 0, 7); ctx.fillStyle = 'rgba(8,20,6,0.45)'; ctx.fill();
  if (!dead && e.slowT > 0) { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.5, 0, 0, 7); ctx.fillStyle = 'rgba(140,210,255,0.35)'; ctx.fill(); }
  if (c.ok) {
    const n = frames(c, e.anim);
    let fi = 0;
    if (dead) fi = Math.floor(e.dieT / 0.6 * n);
    else if (e.act) fi = Math.floor(e.act.t / e.act.dur * n);
    else if (e.anim === 'run') fi = Math.floor(e.runPh * n) % n;
    ctx.save(); ctx.translate(0, -(e.jump || 0)); ctx.scale(e.sc, e.sc);
    drawSprite(c, e.anim, fi, e.row, e.flash > 0 && !dead);
    ctx.restore();
  } else if (!dead) drawEnemyOval(e);
  if (dead) { ctx.restore(); return; }
  if (e.root > 0) {
    const ih = h * 0.8;
    ctx.fillStyle = 'rgba(190,235,255,0.55)'; ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.lineTo(-r * 0.8, -ih * 0.7); ctx.lineTo(-r * 0.2, -ih * 0.35); ctx.lineTo(r * 0.1, -ih * 0.9);
    ctx.lineTo(r * 0.7, -ih * 0.4); ctx.lineTo(r * 1.2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  // полоска здоровья: у рядовых узкая красная, у элиты — длиннее, золотая и с именем, у босса — табличка вверху экрана
  const bw = e.boss ? 110 : e.elite ? 96 : r * 2.2, bh = e.elite ? 8 : 6, by = -h - 12;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw / 2 - 1, by - 1, bw + 2, bh + 2);
  ctx.fillStyle = e.elite ? '#f2c14e' : '#e0503f'; ctx.fillRect(-bw / 2, by, bw * Math.max(0, e.hp / e.max), bh);
  if (e.elite && e.k.nm) {
    ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(e.k.nm, 0, by - 5); ctx.fillStyle = '#ffe08a'; ctx.fillText(e.k.nm, 0, by - 5);
  }
  ctx.restore();
}
function drawShot(s) {
  const y = s.y - s.h;
  if (s.bolt) {
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x - s.dx * 34, y - s.dy * 34 * YK); ctx.stroke();
    ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x - s.dx * 34, y - s.dy * 34 * YK); ctx.stroke();
    ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.arc(s.x, y, 4, 0, 7); ctx.fill();
    return;
  }
  if (s.own === 'p' && fx2ok('bolt')) {
    const fl = 1 + 0.06 * Math.sin(s.left / 9);
    ctx.save(); ctx.translate(s.x, y); ctx.rotate(Math.atan2(s.dy * YK, s.dx));
    const bs = 230 * fl * (s.sc || 1);
    fx2('bolt', 0, 0, bs, bs, 0.95, 0.5);
    ctx.restore();
    return;
  }
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const col = s.own === 'p' ? '150,215,255' : s.col || '255,170,90';
  const g = ctx.createRadialGradient(s.x, y, 0, s.x, y, 26);
  g.addColorStop(0, 'rgba(' + col + ',0.95)'); g.addColorStop(1, 'rgba(' + col + ',0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, y, 26, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(' + col + ',0.5)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x - s.dx * 44, y - s.dy * 44 * YK); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = s.own === 'p' ? '#f2fbff' : s.col ? 'rgb(' + s.col + ')' : '#6b5a4c';
  ctx.beginPath(); ctx.arc(s.x, y, s.own === 'p' ? 7 : 10, 0, 7); ctx.fill();
}
// то, что сортируется по глубине вместе с объектами арены
const ENT = [];
function combatEntities() {
  const out = ENT; out.length = 0;
  for (const e of enemies) out.push(e);
  for (const e of corpses) out.push(e);
  if (typeof SHOP !== 'undefined') for (const d of SHOP.drops) out.push(d);
  for (const s of shots) { if (!s.draw) s.draw = () => drawShot(s); out.push(s); }
  for (const f of fx) {
    if (f.type === 'nova' && fx2ok('nova')) {
      if (!f.draw) f.draw = () => {
        const k = f.t / f.dur, s = 0.2 + 0.95 * easeOut(Math.min(1, k * 1.6));
        fx2('nova', f.x, f.y, f.R * 2.3 * s, f.R * 2.3 * s, 0.5, 0.5, k < 0.55 ? 1 : (1 - k) / 0.45, k * 0.6, true);
      };
      out.push(f); continue;
    }
    if (f.type === 'quake' && FXS.bslam.ok) {
      if (!f.draw) f.draw = () => fxDraw('bslam', f.t / f.dur * 16, f.x, f.y, f.R * 2.35, f.R * 3.3, 0.5, 0.6);
      out.push(f); continue;
    }
    if (f.type === 'chains' && fx2ok('chains')) {
      if (!f.draw) f.draw = () => {
        // лёд растёт снизу вверх, держится и мерцает, в конце раскалывается и тает
        if (f.e.hp <= 0 && f.t < f.dur - 0.4) f.t = f.dur - 0.4;
        const left = f.dur - f.t, g = Math.min(1, f.t / 0.3), end = left < 0.4 ? 1 - left / 0.4 : 0;
        const sz = f.h * 1.6 * (1 + end * 0.15), im = FX2.chains.img, iw = im.width, ih = im.height;
        ctx.save(); ctx.globalAlpha = (end ? 1 - end : 0.88 + 0.12 * Math.sin(f.t * 7));
        const vis = ih * (0.12 + 0.88 * g);
        ctx.drawImage(im, 0, ih - vis, iw, vis, f.e.x - sz / 2, f.e.y + 2 + sz * 0.1 - sz * vis / ih, sz, sz * vis / ih);
        ctx.restore();
      };
      f.y = f.e.y + 2; out.push(f); continue;
    }
    if (f.type === 'spark' && f.hail && fx2ok('shatter')) {
      if (!f.draw) f.draw = () => {
        const k = f.t / f.dur, s = 0.35 + 0.8 * easeOut(Math.min(1, k * 2));
        fx2('shatter', f.x, f.y, f.R * 2.1 * s, f.R * 2.1 * s, 0.5, 0.5, 0.85 * (1 - k * k), f.x * 0.01, true);
      };
      out.push(f); continue;
    }
    if (f.type !== 'shard') continue;
    if (fx2ok('icicle')) {
      if (!f.draw) f.draw = () => {
        const k = f.t / f.dur, sc = f.sc || 1, y = f.y - (1 - k * k) * 460 * sc;
        fx2('icicle', f.x, y, 240 * sc, 240 * sc, 0.5, 0.97, Math.min(1, k * 4));
      };
      out.push(f); continue;
    }
    if (!f.draw) f.draw = () => {
      const k = f.t / f.dur, y = f.y - (1 - k) * 420;
      ctx.fillStyle = 'rgba(215,240,255,0.95)'; ctx.strokeStyle = 'rgba(120,180,255,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x, y); ctx.lineTo(f.x - 9, y - 30); ctx.lineTo(f.x, y - 58); ctx.lineTo(f.x + 9, y - 30); ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    out.push(f);
  }
  return out;
}
// поверх мира: вспышки, снег бури, цифры урона
function combatOver(t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of fx) {
    if (f.type !== 'spark' && f.type !== 'puff') continue;
    if (f.hail && fx2ok('shatter')) continue;
    if (f.hit3 && typeof FX3 !== 'undefined' && FX3.hit.ok) {
      const k = f.t / f.dur, s = 0.45 + 0.75 * easeOut(k);
      fx3('hit', f.x, f.y, 180 * s * (f.sc || 1), 180 * s * (f.sc || 1), 0.5, 0.5, 1 - k, f.x * 0.03);
      continue;
    }
    if (f.hit && fx2ok('hit')) {
      const k = f.t / f.dur, s = 0.45 + 0.75 * easeOut(k);
      ctx.globalCompositeOperation = 'source-over';
      fx2('hit', f.x, f.y, 200 * s * (f.sc || 1), 200 * s * (f.sc || 1), 0.5, 0.5, 1 - k, f.x * 0.03);
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    if (!(f.t >= 0) || !(f.R > 0)) continue;   // вспышка с задержкой (t < 0) или без радиуса: раньше отрицательный радиус ронял кадр (бой с Зеркальным Лордом)
    const k = f.t / f.dur, R = f.R * (0.5 + k), col = f.rock ? '255,190,120' : f.type === 'puff' ? '255,230,200' : '190,230,255';
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
    g.addColorStop(0, 'rgba(' + col + ',' + 0.8 * (1 - k) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill();
  }
  if (window.heroOver) heroOver(t);
  if (P.cast > 0 && P.dead <= 0) {
    const hs = HS(), y = P.y - CH * 0.78 * hs, g = ctx.createRadialGradient(P.x, y, 0, P.x, y, 60 * hs);
    g.addColorStop(0, 'rgba(170,225,255,' + Math.min(0.9, P.cast * 5) + ')'); g.addColorStop(1, 'rgba(170,225,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, y, 60 * hs, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.font = 'bold 24px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const x of texts) {
    ctx.globalAlpha = Math.max(0, 1 - x.t / 0.9);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(x.txt, x.x, x.y);
    ctx.fillStyle = x.col; ctx.fillText(x.txt, x.x, x.y);
  }
  ctx.globalAlpha = 1;
  // полоска здоровья над героиней
  if (P.dead <= 0) {
    const bw = 96, by = P.y - CH * 1.12 * HS();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(P.x - bw / 2 - 1, by - 1, bw + 2, 10);
    ctx.fillStyle = P.hurt > 0 ? '#ffffff' : '#57d46a'; ctx.fillRect(P.x - bw / 2, by, bw * P.hp / P.maxHp, 8);
  }
}
const SND_EL = document.getElementById('snd');
const BOSS_PLATE = new Image(); BOSS_PLATE.src = 'ui/plate.webp' + V;
// интерфейс в координатах экрана
function combatUI() {
  layoutButtons();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of BTN) {
    const cd = b.id === 'atk' ? 0 : P.cd[b.id], on = b.id === 'r' && P.ult > 0;
    if (SK_ICONS.complete && SK_ICONS.naturalWidth) {
      // иконка из ChatGPT: медальон занимает почти всю ячейку листа 3x2
      const c = SK_ICONS.naturalWidth / 3, i = SK_CELL[b.id], d = b.r * 2.25;
      if (on) { ctx.save(); ctx.shadowColor = 'rgba(150,220,255,0.95)'; ctx.shadowBlur = 24; }
      ctx.drawImage(SK_ICONS, (i % 3) * c, Math.floor(i / 3) * c, c, c, b.x - d / 2, b.y - d / 2, d, d);
      if (on) ctx.restore();
      if (window.heroButton && heroButton(b)) continue;
      if (cd <= 0 && b.id !== 'atk' && P.mp < MANA[b.id]) {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, 7); ctx.fillStyle = 'rgba(10,30,90,0.55)'; ctx.fill();
      }
      if (cd > 0) {
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(b.x, b.y);
        ctx.arc(b.x, b.y, b.r * 0.8, -Math.PI / 2, -Math.PI / 2 + 6.283 * cd / CDMAX[b.id]); ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = '#fff';
        ctx.font = 'bold ' + Math.round(b.r * 0.62) + 'px system-ui, sans-serif';
        ctx.strokeText(Math.ceil(cd), b.x, b.y); ctx.fillText(Math.ceil(cd), b.x, b.y);
      } else if (!TOUCH_UI) {
        ctx.font = 'bold ' + Math.round(b.r * 0.3) + 'px system-ui, sans-serif';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.fillStyle = '#fff';
        ctx.strokeText(b.key, b.x, b.y + b.r * 0.98); ctx.fillText(b.key, b.x, b.y + b.r * 0.98);
      }
      continue;
    }
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7);
    ctx.fillStyle = 'rgba(12,22,36,0.55)'; ctx.fill();
    ctx.fillStyle = 'rgba(' + b.col + ',' + (cd > 0 ? 0.12 : on ? 0.6 : 0.34) + ')'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(' + b.col + ',' + (cd > 0 ? 0.35 : 0.95) + ')'; ctx.stroke();
    if (cd > 0) {
      ctx.beginPath(); ctx.moveTo(b.x, b.y);
      ctx.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + 6.283 * cd / CDMAX[b.id]); ctx.closePath();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(b.r * 0.62) + 'px system-ui, sans-serif';
      ctx.fillText(Math.ceil(cd), b.x, b.y);
    } else {
      ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.round(b.r * 0.36) + 'px system-ui, sans-serif';
      ctx.fillText(b.label, b.x, b.y - b.r * 0.1);
      ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.font = Math.round(b.r * 0.27) + 'px system-ui, sans-serif';
      ctx.fillText(b.key, b.x, b.y + b.r * 0.38);
    }
  }
  ctx.textBaseline = 'alphabetic';
  const boss = enemies.find(e => e.boss);
  // табличка с именем босса — первые 4 с после появления (потом плавно уходит), дальше только тонкая полоска здоровья
  if (boss && boss.plateT == null) boss.plateT = performance.now();
  const plateA = boss ? Math.max(0, Math.min(1, (5 - (performance.now() - boss.plateT) / 1000))) : 0;
  if (boss && plateA < 1) {
    const sw = Math.min(300, W * 0.3), sx = W / 2 - sw / 2, sy = H * 0.115;
    ctx.globalAlpha = 1 - plateA;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx - 2, sy - 2, sw + 4, 10);
    ctx.fillStyle = boss.rage ? '#ff5a2a' : '#c8372c'; ctx.fillRect(sx, sy, sw * Math.max(0, boss.hp / boss.max), 6);
    ctx.globalAlpha = 1;
  }
  if (boss && plateA > 0 && BOSS_PLATE.complete && BOSS_PLATE.naturalWidth) {
    ctx.save(); ctx.globalAlpha = plateA;
    const bw = Math.min(460, W * 0.42), bh = bw * 136 / 728, bx = W / 2 - bw / 2, by = H * 0.105;
    ctx.fillStyle = boss.rage ? '#ff5a2a' : '#c8372c';
    ctx.fillRect(bx + bw * 0.085, by + bh * 0.3, bw * 0.83 * Math.max(0, boss.hp / boss.max), bh * 0.4);
    ctx.drawImage(BOSS_PLATE, bx, by, bw, bh);
    ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    const bn = boss.k.nm || ['Варрок', 'вожак орды'];
    const nm = boss.rage ? bn[0] + ' в ярости' : bn[0] + ', ' + bn[1];
    ctx.strokeText(nm, W / 2, by + bh * 0.62); ctx.fillText(nm, W / 2, by + bh * 0.62);
    ctx.restore();
  }
  if (P.dead > 0 && typeof LIMBO !== 'undefined' && !(window.NETC && NETC.on)) {
    // офлайн: свет уносит героя в Междумирье (limbo.js) — без счётчика
    ctx.fillStyle = '#fff3d0'; ctx.textAlign = 'center'; ctx.font = 'bold 26px Georgia, serif'; ctx.globalAlpha = Math.min(1, (2.2 - P.dead) * 1.5);
    ctx.fillText('Свет уносит тебя…', W / 2, H * 0.3); ctx.globalAlpha = 1;
  } else if (P.dead > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Возрождение через ' + Math.ceil(P.dead), W / 2, H / 2);
  }
  musicUpdate();
  const el = SND_EL;
  if (el) {
    const n = Object.keys(SND).length, on = AC && AC.state === 'running';
    const txt = !on ? '🔇 коснитесь экрана, чтобы включить звук'
      : '🔊 звук, загружено ' + n;
    if (el.textContent !== txt) { el.textContent = txt; el.style.color = on ? '#9df0a6' : '#ffd28a'; }
  }
}
var COMBAT_READY = true;
