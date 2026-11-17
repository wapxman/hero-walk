// Бой: выстрелы, скилы, враги, звук. Графика намеренно простая, без спрайтов.
// Использует из index.html: ctx, W, H, P, CH, GS, SRC_W, OBJ, collide, V.
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
  wave_horn: 1, flask: 1,
};
// минимальный промежуток между повторами, сек: частые звуки в гуще боя не сливаются в кашу
const SND_GAP = { hit: 0.05, step: 0.1, coins: 0.08, enemy_melee: 0.06, enemy_arrow: 0.05, enemy_fireball: 0.05, enemy_death: 0.05 };
const SND = {}, sndLast = {}, sndAt = {};
let AC = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
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
  const mk = (txt, right, fn) => {
    const b = document.createElement('button');
    b.textContent = txt;
    b.style.cssText = 'position:fixed;top:36px;right:' + right + 'px;z-index:5;font:13px system-ui,sans-serif;color:#fff;' +
      'background:rgba(12,22,36,.6);border:1px solid rgba(255,255,255,.35);border-radius:14px;padding:5px 10px;max-width:60vw;' +
      'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;touch-action:manipulation';
    for (const ev of ['touchstart', 'mousedown']) b.addEventListener(ev, e => e.stopPropagation(), { passive: true });
    b.addEventListener('pointerdown', e => { e.stopPropagation(); fn(); b.blur(); });
    document.body.appendChild(b);
    return b;
  };
  mus.nextBtn = mk('⏭', 12, () => musicNext());
  mus.btn = mk('', 54, () => musicToggle());
  musicLoad();
}
function musicLabel() {
  if (mus.btn) mus.btn.textContent = mus.on ? '♪ ' + MUSIC[mus.i][1] : '♪ музыка выкл';
  if (mus.nextBtn) mus.nextBtn.style.display = mus.on ? '' : 'none';
}
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
const SPAWN = { x: 440 * GS, y: 745 * GS };
Object.assign(P, { hp: 600, maxHp: 600, dead: 0, face: { x: 1, y: 0 }, atkCd: 0, cast: 0, ult: 0, ultTick: 0, hurt: 0,
  cd: { q: 0, e: 0, f: 0, r: 0 } });
const CDMAX = { q: 6, e: 9, f: 12, r: 28 };
const RANGE = 600;
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
function layoutButtons() {
  const R = Math.max(30, Math.min(48, H * 0.115));
  const cx = W - R * 1.7, cy = H - R * 1.7, D = R * 2.35;
  const at = (a, d) => ({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  const pos = { atk: { x: cx, y: cy, r: R }, q: at(Math.PI, D), e: at(Math.PI * 1.25, D), f: at(Math.PI * 1.5, D), r: at(Math.PI * 1.25, D * 1.95) };
  for (const b of BTN) { const p = pos[b.id]; b.x = p.x; b.y = p.y; b.r = p.r || R * 0.72; }
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
function hurtEnemy(e, dmg, col) {
  if (e.hp <= 0) return;
  dmg *= P.dmgMul || 1;
  e.hp -= dmg; e.flash = 0.08;
  say(e.x + rnd(-14, 14), e.y - (e.ch.ok ? e.ch.top * e.ch.U * e.sc * 0.8 : e.rad * 2.2), Math.round(dmg), col || '#bfe6ff');
  if (e.hp <= 0) {
    kills++;
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
  P.act = { anim: 'atk', t: 0, dur: 0.36, row: t ? runRow(t.x - P.x, t.y - P.y) : null };
  snd('hero_shot', 0.8);
}
// размер героя из редактора: скиллы и выстрелы растут вместе с ним (и картинка, и зона поражения)
const HS = () => (CFG.units.hero.scale || 1);
function cast(id) {
  if (P.dead > 0 || P.cd[id] > 0) return;
  if (id === 'q') {
    const c = aimPoint(320 * HS()), R = 215 * HS();
    fx.push({ type: 'nova', x: c.x, y: c.y, t: 0, dur: 0.95, R });
    for (const e of enemies) if (gdist(c, e) < R + e.rad) { hurtEnemy(e, 95); slow(e, 0.45, 3.5); }
    snd('nova', 0.9);
  } else if (id === 'e') {
    const t = nearestEnemy(RANGE);
    if (!t) { say(P.x, P.y - CH * HS(), 'нет цели', '#ffd28a'); return; }
    t.root = 2.8; t.dot = 45; hurtEnemy(t, 40);
    fx.push({ type: 'chains', e: t, x: t.x, y: t.y, t: 0, dur: 3.25, h: t.ch.top * t.ch.U * t.sc });
    snd('chains', 0.85);
  } else if (id === 'f') {
    const c = aimPoint(340 * HS());
    zones.push({ type: 'hail', x: c.x, y: c.y, R: 250 * HS(), t: 3.2, tick: 0 });
    snd('hail', 0.8);
  } else if (id === 'r') {
    P.ult = 5; P.ultTick = 0;   // звук бури длится те же 5 секунд
    snd('storm', 0.85);
  }
  P.cd[id] = CDMAX[id] * (P.cdMul || 1); P.cast = 0.3;
  P.act = { anim: 'cast', t: 0, dur: 0.7, row: null };
}
function hurtPlayer(d) {
  if (P.dead > 0) return;
  d *= P.armMul || 1;
  P.hp -= d; P.hurt = 0.25;
  say(P.x + rnd(-12, 12), P.y - CH * 1.05 * HS(), '-' + Math.round(d), '#ff8a7a');
  if (P.hp <= 0) { P.hp = 0; P.dead = 3; P.ult = 0; held.touch = held.mouse = false; snd('hero_death', 0.75); }
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
const CHARS = {
  zombie: { cell: 256, ortho: 3.0, zc: 0.9, U: 104, top: 1.5 },
  vampire: { cell: 256, ortho: 3.0, zc: 0.9, U: 114, top: 1.5 },
  mage: { cell: 256, ortho: 3.0, zc: 0.9, U: 108, top: 1.65 },
  archer: { cell: 256, ortho: 3.0, zc: 0.9, U: 104, top: 1.5 },
  boss: { cell: 320, ortho: 4.0, zc: 1.15, U: 122, top: 1.95 },
};
for (const k in CHARS) { const im = CHARS[k].img = new Image(); CHARS[k].at = k; im.onload = () => { CHARS[k].ok = true; }; im.src = 'chars/at_' + k + '.webp' + V; }
// Ganfaul в общей таблице: рисуется своими листами (HERO), размеры — как у остальных
CHARS.ganfaul = { hero: true, U: 118, top: 1.5, get ok() { return HERO.ok; } };
// сколько кадров в анимации у данного персонажа (у обычных листов каста нет — вместо него атака)
function animOf(c, anim) {
  if (c.hero) return anim;
  return anim === 'cast' && c !== CHARS.boss ? 'atk' : anim;
}
function frames(c, anim) {
  if (c.hero) return (HERO.an[anim] || HERO.an.idle).n;
  return (AN[animOf(c, anim)] || AN.idle)[1];
}
// один кадр персонажа: row — направление 0..7 (0 вниз, 2 влево, 4 вверх, 6 вправо)
function drawSprite(c, anim, fi, row, flash) {
  if (c.hero) return drawHeroSprite(anim, fi, row, flash);
  anim = animOf(c, anim);
  const a = (c.an || AN)[anim] || (c.an || AN).idle;
  fi = Math.max(0, Math.min(a[1] - 1, fi));
  // в листах ряды 1–3 смотрят ВПРАВО (вниз-вправо, вправо, вверх-вправо); левые направления — их зеркало
  const flip = row >= 1 && row <= 3;
  if (row > 4) row = 8 - row;
  const size = c.ortho * c.U, ay = 0.5 + c.zc * COS_EL / c.ortho;
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
const HERO = { U: 118, zc: 0.9, cell: 400,
  sheets: { a: { wrap: 6, rows: 2 }, b: { wrap: 6, rows: 2 }, d: { wrap: 5, rows: 1 } },
  an: { idle: { s: 'a', i: 0, n: 4, o: 2.4 }, run: { s: 'a', i: 4, n: 8, o: 2.4 }, atk: { s: 'b', i: 0, n: 5, o: 2.4 },
    cast: { s: 'b', i: 5, n: 6, o: 2.6 }, die: { s: 'd', i: 0, n: 5, o: 3.0 } } };
for (const k in HERO.sheets) {
  const S = HERO.sheets[k]; S.img = new Image();
  S.img.onload = () => { S.ok = true; HERO.ok = Object.values(HERO.sheets).every(x => x.ok); };
  S.img.src = 'chars/at_hero_' + k + '.webp' + V;
}
function drawHeroSprite(anim, fi, row, flash) {
  const a = HERO.an[anim] || HERO.an.idle, S = HERO.sheets[a.s];
  fi = a.i + Math.max(0, Math.min(a.n - 1, fi));
  const flip = row >= 1 && row <= 3;            // ряды 1–3 листа смотрят вправо, левые — зеркало
  if (row > 4) row = 8 - row;
  const gx = fi % S.wrap, gy = row * S.rows + Math.floor(fi / S.wrap), nm = 'hero_' + a.s;
  const size = a.o * HERO.U, ay = 0.5 + HERO.zc * COS_EL / a.o;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  drawCell(ctx, S.img, nm, gx, gy, -size / 2, -ay * size, size);
  if (flash) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; drawCell(ctx, S.img, nm, gx, gy, -size / 2, -ay * size, size); }
  ctx.restore();
}
// герой: персонаж и размер берутся из настроек редактора; адрес с #lira возвращает прежнюю Лиру
function drawHero() {
  const u = CFG.units.hero, c = CHARS[u.char] || CHARS.ganfaul;
  if (!c.ok || location.hash.indexOf('lira') >= 0) return false;
  let anim = 'idle', fi = Math.floor(P.heroT * 3) % frames(c, 'idle'), row = runRow(P.face.x, P.face.y);
  if (P.dead > 0) { anim = 'die'; fi = Math.floor((3 - P.dead) / 0.6 * frames(c, 'die')); }
  else if (P.act) { anim = P.act.anim; fi = Math.floor(P.act.t / P.act.dur * frames(c, anim)); if (P.act.row != null) row = P.act.row; }
  else if (P.moving) { anim = 'run'; fi = Math.floor(P.heroT * (P.running ? 9.5 : 7.5)) % 8; }
  ctx.save(); ctx.translate(P.x, P.y); ctx.scale(u.scale, u.scale);
  if (P.dead > 0) ctx.globalAlpha = Math.min(1, P.dead / 0.8);
  drawSprite(c, anim, fi, row, P.hurt > 0.17);
  ctx.restore();
  return true;
}
// виды врагов: mel — ближний бой, rng — стрелок
const KIND = {
  min: { ch: 'zombie', mel: 1, hp: 120, rad: 20, speed: 150, dmg: [9, 13], cd: 0.9, reach: 62, col: '#8a4534' },
  war: { ch: 'vampire', mel: 1, hp: 300, rad: 26, speed: 112, dmg: [20, 26], cd: 1.25, reach: 72, col: '#7a3a2c' },
  mag: { ch: 'mage', rng: 1, hp: 150, rad: 22, speed: 100, dmg: [18, 24], cd: 1.9, want: 430, shot: 520, col: '#6a4590' },
  rog: { ch: 'archer', rng: 1, hp: 120, rad: 21, speed: 125, dmg: [13, 16], cd: 1.35, want: 500, shot: 820, bolt: 1, col: '#3f6a55' },
  boss: { ch: 'boss', boss: 1, hp: 1500, rad: 46, speed: 92, col: '#565a66' },
};
// настройки редактора: персонаж, размер и множители скорости, силы, здоровья
for (const id in KIND) {
  const u = CFG.units[id], k = KIND[id];
  if (!u) continue;
  if (CHARS[u.char]) k.ch = u.char;
  k.sc = u.scale; k.pw = u.power; k.hp *= u.hp; k.speed *= u.speed; k.rad *= Math.sqrt(u.scale);
}
const corpses = [];
function spawnEnemy(type) {
  const k = KIND[type];
  const e = {
    type, k, ch: CHARS[k.ch], boss: !!k.boss, mel: !!k.mel, rng: !!k.rng,
    x: (SRC_W - 430) * GS + rnd(-60, 60), y: 745 * GS + rnd(-150, 150),
    // рост от волны к волне: здоровье +14%, урон +8%, скорость +2% (не больше +25%)
    hp: Math.round(k.hp * (1 + 0.14 * Math.max(0, wave - 1))), dm: (1 + 0.08 * Math.max(0, wave - 1)) * k.pw, sc: k.sc,
    rad: k.rad, speed: k.speed * (1 + Math.min(0.25, 0.02 * Math.max(0, wave - 1))), col: k.col, eye: k.boss ? '#ffb347' : '#ffe27a',
    slowT: 0, slowK: 1, root: 0, dot: 0, atkCd: rnd(0.3, 1.2), flash: 0, bob: rnd(0, 6), slamCd: 2, quakeCd: 7, leapCd: 4, summonCd: 9, jump: 0,
    anim: 'run', animT: rnd(0, 1), runPh: rnd(0, 1), row: 2, act: null,
  };
  e.max = e.hp;
  e.draw = () => drawEnemy(e);
  enemies.push(e);
}
function spawnWave() {
  wave++;
  const bossWave = wave % 3 === 0;
  // на волне босса свиты меньше: главный противник — он сам
  const nm = Math.round(Math.min(3 + wave, 9) * (bossWave ? 0.5 : 1));
  for (let i = 0; i < nm; i++) spawnEnemy(wave >= 2 && i % 3 === 2 ? 'war' : 'min');
  const nr = Math.round(Math.min(1 + Math.floor(wave / 2), 4) * (bossWave ? 0.5 : 1));
  for (let i = 0; i < nr; i++) spawnEnemy((i + wave) % 2 ? 'mag' : 'rog');
  if (bossWave) spawnEnemy('boss');
  say(P.x, P.y - CH * 1.3 * HS(), bossWave ? 'Волна ' + wave + ' — БОСС' : 'Волна ' + wave, bossWave ? '#ff9a6a' : '#ffe9a8');
}
// действие с замахом: анимация длится dur, удар срабатывает в момент at (доля от dur)
function startAct(e, anim, dur, at, fn) { e.act = { anim, dur, at, fn, t: 0, hit: false }; e.anim = anim; e.animT = 0; }
function updateEnemy(e, dt) {
  e.bob += dt * 7; e.flash -= dt; e.atkCd -= dt; e.slamCd -= dt; e.quakeCd -= dt; e.leapCd -= dt; e.summonCd -= dt; e.animT += dt;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.root > 0) {
    if (e.leap) { e.leap = null; collide(e); }   // пойман в прыжке: остаётся на месте, но не внутри камня
    e.root -= dt; e.act = null; e.jump = 0; e.anim = 'idle'; hurtTick(e, e.dot * dt); return;
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
    e.x += dx * sp * dt; e.y += dy * sp * YK * dt; collide(e); e.anim = 'run';
    // темп шагов привязан к скорости: один цикл бега покрывает около 2,3 метра модели
    e.runPh += dt * Math.max(0.8 * sk, Math.min(1.5, sp / (2.3 * e.ch.U)));
  }
  else e.anim = 'idle';
  if (e.mel && d < k.reach + 12 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    startAct(e, 'atk', 0.5, 0.55, () => {
      if (gdist(P, e) < k.reach + 34 && P.dead <= 0) {
        hurtPlayer(rnd(k.dmg[0], k.dmg[1]) * e.dm);
        snd('enemy_melee', 0.5, rnd(0.9, 1.1));
      }
    });
  }
  if (e.rng && d < k.want + 40 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    startAct(e, 'atk', 0.55, 0.5, (ax, ay) => {
      shots.push({ own: 'e', bolt: k.bolt, x: e.x + ax * 20, y: e.y + ay * 20 * YK, dx: ax, dy: ay, sp: k.shot, left: k.want + 150,
        dmg: rnd(k.dmg[0], k.dmg[1]) * e.dm, h: e.ch.U * 0.75 * e.sc });
      snd(k.bolt ? 'enemy_arrow' : 'enemy_fireball', 0.45, rnd(0.95, 1.05));
    });
  }
  if (e.boss) bossSkills(e, d);
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
        spawnEnemy('min'); const m = enemies[enemies.length - 1], a = rnd(0, 6.283);
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
    startAct(e, 'atk', 1.0, 2, () => {});
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
  if (P.act) { P.act.t += dt; if (P.act.t >= P.act.dur || P.dead > 0) P.act = null; }
  if (P.dead > 0) {
    P.dead -= dt;
    if (P.dead <= 0) { P.dead = 0; P.hp = P.maxHp; P.x = SPAWN.x; P.y = SPAWN.y; }
  } else {
    P.hp = Math.min(P.maxHp, P.hp + 5 * dt);
    stepT -= dt;
    if (P.moving && stepT <= 0) { snd('step', P.running ? 0.22 : 0.14, rnd(0.94, 1.06)); stepT = P.running ? 0.33 : 0.55; }
    if ((held.key || held.touch || held.mouse || held.pad) && P.atkCd <= 0) shoot();
    if (P.ult > 0) {
      P.ult -= dt; P.ultTick -= dt;
      while (P.ultTick <= 0) {
        P.ultTick += 0.11;
        const a = rnd(0, 6.283), r = rnd(90, 400) * HS();
        shard(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, 100, 60, 0.4, 2);
      }
    }
  }
  // волну запускает игрок кнопкой; магазин, золото и дроп живут в shop.js
  if (typeof SHOP !== 'undefined') SHOP.tick(dt);

  for (const e of enemies) updateEnemy(e, dt);
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
    if (s.own === 'p') {
      for (const e of enemies) {
        if (e.hp > 0 && gdist(s, e) < e.rad + 16 * (s.sc || 1)) {
          hurtEnemy(e, s.dmg); slow(e, 0.8, 1); s.left = 0;
          fx.push({ type: 'spark', hit: 1, x: e.x, y: e.y - e.ch.top * e.ch.U * e.sc * 0.5, t: 0, dur: 0.4, R: 34 * (s.sc || 1), sc: s.sc || 1 });
          snd('hit', 0.45, rnd(0.95, 1.1));
          break;
        }
      }
    } else if (P.dead <= 0 && gdist(s, P) < 30 * HS()) {
      hurtPlayer(s.dmg); s.left = 0;
      snd('enemy_melee', 0.3, 1.2);
      fx.push({ type: 'spark', x: P.x, y: P.y - CH * 0.5 * HS(), t: 0, dur: 0.25, R: 30, rock: true });
    }
  }
  for (const z of zones) {
    z.t -= dt; z.tick -= dt;
    while (z.tick <= 0) {
      z.tick += 0.13;
      const a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * z.R;
      shard(z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * YK, 80, 24, 0.65, 1);
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
      if (P.dead <= 0 && gdist(f, P) < f.R) hurtPlayer(f.dmg);
      fx.push({ type: 'quake', x: f.x, y: f.y, t: 0, dur: 0.75, R: f.R });
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
const SK_ICONS = new Image(); SK_ICONS.src = 'ui/sk_icons.webp' + V;
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
  const bw = e.boss ? 110 : r * 2.2, by = -h - 12;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw / 2 - 1, by - 1, bw + 2, 8);
  ctx.fillStyle = '#e0503f'; ctx.fillRect(-bw / 2, by, bw * Math.max(0, e.hp / e.max), 6);
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
  const col = s.own === 'p' ? '150,215,255' : '255,170,90';
  const g = ctx.createRadialGradient(s.x, y, 0, s.x, y, 26);
  g.addColorStop(0, 'rgba(' + col + ',0.95)'); g.addColorStop(1, 'rgba(' + col + ',0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, y, 26, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(' + col + ',0.5)'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(s.x, y); ctx.lineTo(s.x - s.dx * 44, y - s.dy * 44 * YK); ctx.stroke();
  ctx.restore();
  ctx.fillStyle = s.own === 'p' ? '#f2fbff' : '#6b5a4c';
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
    if (f.hit && fx2ok('hit')) {
      const k = f.t / f.dur, s = 0.45 + 0.75 * easeOut(k);
      ctx.globalCompositeOperation = 'source-over';
      fx2('hit', f.x, f.y, 200 * s * (f.sc || 1), 200 * s * (f.sc || 1), 0.5, 0.5, 1 - k, f.x * 0.03);
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    const k = f.t / f.dur, R = f.R * (0.5 + k), col = f.rock ? '255,190,120' : f.type === 'puff' ? '255,230,200' : '190,230,255';
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
    g.addColorStop(0, 'rgba(' + col + ',' + 0.8 * (1 - k) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill();
  }
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
  ctx.font = 'bold 15px system-ui, sans-serif'; ctx.textAlign = 'right';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.fillStyle = '#fff';
  const info = 'Волна ' + wave + ' · Побеждено ' + kills;
  ctx.strokeText(info, W - 14, 26); ctx.fillText(info, W - 14, 26);
  const boss = enemies.find(e => e.boss);
  if (boss && BOSS_PLATE.complete && BOSS_PLATE.naturalWidth) {
    const bw = Math.min(460, W * 0.5), bh = bw * 136 / 728, bx = W / 2 - bw / 2, by = 8;
    ctx.fillStyle = boss.rage ? '#ff5a2a' : '#c8372c';
    ctx.fillRect(bx + bw * 0.085, by + bh * 0.3, bw * 0.83 * Math.max(0, boss.hp / boss.max), bh * 0.4);
    ctx.drawImage(BOSS_PLATE, bx, by, bw, bh);
    ctx.textAlign = 'center'; ctx.font = 'bold 14px system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
    const nm = boss.rage ? 'Варрок в ярости' : 'Варрок, вожак орды';
    ctx.strokeText(nm, W / 2, by + bh * 0.62); ctx.fillText(nm, W / 2, by + bh * 0.62);
  }
  if (P.dead > 0) {
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
