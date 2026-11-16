// Бой: выстрелы, скилы, враги, звук. Графика намеренно простая, без спрайтов.
// Использует из index.html: ctx, W, H, P, CH, GS, SRC_W, OBJ, collide, V.
'use strict';

const YK = 0.72;                       // сжатие по вертикали из-за наклона камеры
function gdist(a, b) { return Math.hypot(a.x - b.x, (a.y - b.y) / YK); }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------- звук ----------
const SFX = ['cm5_shot_v1', 'cm5_shot_v2', 'cm5_shot_v3', 'cm_ice_hit_small', 'cm_ice_hit_mid', 'cm_ice_hit_big',
  'cm3_nova', 'cm3_frostbite', 'cm_ice_hail', 'cm3_ult', 'cm_ult_purga',
  'em_shot_v1', 'em_shot_v2', 'em_shot_v3', 'em_slam', 'em_rockburst', 'em_quake_ult', 'gen_nova'];
const SND = {};
let AC = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  AC = new C();
  const load = (path, n) => fetch(path + V).then(r => { if (!r.ok) throw 0; return r.arrayBuffer(); })
    .then(b => AC.decodeAudioData(b, buf => { SND[n] = buf; }, () => {})).catch(() => {});
  for (const n of SFX) load('sfx/' + n + '.mp3', n);
  // Локальный набор (папка sfx_dota есть только на компьютере разработчика, в репозиторий не входит).
  // Если он найден, игра берёт звуки героини из него.
  fetch('sfx_dota/shot1.mp3' + V, { method: 'HEAD' }).then(r => {
    if (!r.ok) return;
    DOTA_ON = true;
    for (const n of DOTA) load('sfx_dota/' + n + '.mp3', 'd_' + n);
  }).catch(() => {});
  musicStart();
}
let DOTA_ON = false;
const DOTA = ['pre1', 'pre2', 'shot1', 'shot2', 'hit1', 'hit2', 'hit3', 'nova', 'ff', 'ff1', 'ff2', 'ff3', 'death',
  'step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step7'];
const D_HITS = ['d_hit1', 'd_hit2', 'd_hit3'], D_FF = ['d_ff1', 'd_ff2', 'd_ff3'];
const D_STEPS = ['d_step1', 'd_step2', 'd_step3', 'd_step4', 'd_step5', 'd_step6', 'd_step7'];
let stepT = 0;
for (const ev of ['touchstart', 'touchend', 'pointerup', 'click', 'mousedown', 'keydown']) addEventListener(ev, audioInit, { passive: true });
function play(n, vol, rate) {
  if (!AC || AC.state !== 'running' || !SND[n]) return;
  const s = AC.createBufferSource(); s.buffer = SND[n]; s.playbackRate.value = rate || 1;
  const g = AC.createGain(); g.gain.value = vol == null ? 1 : vol;
  s.connect(g); g.connect(AC.destination); s.start();
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
  mus.g.gain.cancelScheduledValues(AC.currentTime); mus.g.gain.value = 0;
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
  const duck = P.dead > 0 ? 0.35 : P.ult > 0 ? 0.55 : 1;
  mus.g.gain.setTargetAtTime(MUS_VOL * k * duck, AC.currentTime, 0.12);
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (e.code === 'KeyM') musicToggle();
  if (e.code === 'KeyN' && mus.on) musicNext();
});

const SHOTS = ['cm5_shot_v1', 'cm5_shot_v2', 'cm5_shot_v3'];
const HITS = ['cm_ice_hit_small', 'cm_ice_hit_mid'];
const ESHOTS = ['em_shot_v1', 'em_shot_v2', 'em_shot_v3'];

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
  const gps = navigator.getGamepads ? navigator.getGamepads() : [];
  held.pad = false;
  for (const g of gps) {
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
  say(e.x + rnd(-14, 14), e.y - e.rad * 2.2, Math.round(dmg), col || '#bfe6ff');
  if (e.hp <= 0) {
    kills++;
    e.dieT = 0; e.anim = 'die'; e.act = null; corpses.push(e);
    if (typeof SHOP !== 'undefined') SHOP.onKill(e);
    play('em_rockburst', e.boss ? 0.6 : 0.3, e.boss ? 0.8 : 1.4);
  }
}
function slow(e, k, t) { e.slowK = Math.min(e.slowT > 0 ? e.slowK : 1, k); e.slowT = Math.max(e.slowT, t); }
function shoot() {
  const t = nearestEnemy(RANGE);
  let dx = P.face.x, dy = P.face.y;
  if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
  shots.push({ own: 'p', x: P.x + dx * 26, y: P.y + dy * 26 * YK, dx, dy, sp: 980, tgt: t, left: 700, dmg: rnd(44, 56), h: CH * 0.55 });
  P.atkCd = 0.62; P.cast = 0.16;
  P.act = { anim: 'atk', t: 0, dur: 0.36, row: t ? runRow(t.x - P.x, t.y - P.y) : null };
  if (DOTA_ON) { play(pick(['d_pre1', 'd_pre2']), 0.45); play(pick(['d_shot1', 'd_shot2']), 0.8); }
  else play(pick(SHOTS), 0.7, rnd(0.94, 1.06));
}
function cast(id) {
  if (P.dead > 0 || P.cd[id] > 0) return;
  if (id === 'q') {
    const c = aimPoint(320), R = 215;
    fx.push({ type: 'nova', x: c.x, y: c.y, t: 0, dur: 0.95, R });
    for (const e of enemies) if (gdist(c, e) < R + e.rad) { hurtEnemy(e, 95); slow(e, 0.45, 3.5); }
    play(SND.gen_nova ? 'gen_nova' : DOTA_ON ? 'd_nova' : 'cm3_nova', 0.9);   // gen_nova — сгенерирован в Higgsfield
  } else if (id === 'e') {
    const t = nearestEnemy(RANGE);
    if (!t) { say(P.x, P.y - CH, 'нет цели', '#ffd28a'); return; }
    t.root = 2.8; t.dot = 45; hurtEnemy(t, 40);
    fx.push({ type: 'chains', e: t, x: t.x, y: t.y, t: 0, dur: 3.25, h: t.ch.top * t.ch.U });
    play('cm3_frostbite', 0.9);
  } else if (id === 'f') {
    const c = aimPoint(340);
    zones.push({ type: 'hail', x: c.x, y: c.y, R: 250, t: 3.2, tick: 0 });
    play('cm_ice_hail', 0.9);
  } else if (id === 'r') {
    P.ult = DOTA_ON ? 10 : 5; P.ultTick = 0;   // оригинальный звук поля длится дольше
    if (DOTA_ON) play('d_ff', 0.9); else { play('cm3_ult', 0.9); play('cm_ult_purga', 0.55); }
  }
  P.cd[id] = CDMAX[id] * (P.cdMul || 1); P.cast = 0.3;
  P.act = { anim: 'cast', t: 0, dur: 0.7, row: null };
}
function hurtPlayer(d) {
  if (P.dead > 0) return;
  d *= P.armMul || 1;
  P.hp -= d; P.hurt = 0.25;
  say(P.x + rnd(-12, 12), P.y - CH * 1.05, '-' + Math.round(d), '#ff8a7a');
  if (P.hp <= 0) { P.hp = 0; P.dead = 3; P.ult = 0; held.touch = held.mouse = false; play('d_death', 0.6); }
}
// ледяной осколок, падающий с неба: через delay бьёт по кругу
function shard(x, y, R, dmg, sk, st) {
  fx.push({ type: 'shard', x, y, t: 0, dur: 0.28, R, dmg, sk, st });
}

// ---------- враги ----------
// Спрайты отрендерены из 3D-моделей: 5 направлений в строках (вниз, вниз-влево, влево, вверх-влево, вверх),
// остальные три получаются зеркалом. AN: [первая колонка, число кадров].
const COS_EL = Math.cos(35 * Math.PI / 180);
const AN = { run: [0, 8], atk: [8, 6], die: [14, 5], idle: [19, 1], cast: [20, 5] };
const HERO_AN = { idle: [0, 4], run: [4, 8], atk: [12, 5], cast: [17, 6], die: [23, 5] };
// U — сколько единиц мира приходится на метр модели; top — высота полоски здоровья в метрах
const CHARS = {
  hero: { cell: 288, ortho: 3.0, zc: 0.9, U: 118, top: 1.5, an: HERO_AN },
  zombie: { cell: 256, ortho: 3.0, zc: 0.9, U: 104, top: 1.5 },
  vampire: { cell: 256, ortho: 3.0, zc: 0.9, U: 114, top: 1.5 },
  mage: { cell: 256, ortho: 3.0, zc: 0.9, U: 108, top: 1.65 },
  archer: { cell: 256, ortho: 3.0, zc: 0.9, U: 104, top: 1.5 },
  boss: { cell: 320, ortho: 4.0, zc: 1.15, U: 122, top: 1.95 },
};
for (const k in CHARS) { const im = CHARS[k].img = new Image(); im.onload = () => { CHARS[k].ok = true; }; im.src = 'chars/mx_' + k + '.webp' + V; }
// один кадр персонажа: row — направление 0..7 (0 вниз, дальше по часовой), три правых получаются зеркалом
function drawSprite(c, anim, fi, row, flash) {
  const a = (c.an || AN)[anim] || (c.an || AN).idle;
  fi = Math.max(0, Math.min(a[1] - 1, fi));
  let flip = false;
  if (row > 4) { row = 8 - row; flip = true; }
  const size = c.ortho * c.U, ay = 0.5 + c.zc * COS_EL / c.ortho;
  ctx.save();
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(c.img, (a[0] + fi) * c.cell, row * c.cell, c.cell, c.cell, -size / 2, -ay * size, size, size);
  if (flash) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.75;
    ctx.drawImage(c.img, (a[0] + fi) * c.cell, row * c.cell, c.cell, c.cell, -size / 2, -ay * size, size, size);
  }
  ctx.restore();
}
// героиня из Mixamo; адрес с #lira возвращает прежнюю Лиру
function drawHero() {
  const c = CHARS.hero;
  if (!c.ok || location.hash.indexOf('lira') >= 0) return false;
  let anim = 'idle', fi = Math.floor(P.heroT * 3) % 4, row = runRow(P.face.x, P.face.y);
  if (P.dead > 0) { anim = 'die'; fi = Math.floor((3 - P.dead) / 0.6 * 5); }
  else if (P.act) { anim = P.act.anim; fi = Math.floor(P.act.t / P.act.dur * c.an[anim][1]); if (P.act.row != null) row = P.act.row; }
  else if (P.moving) { anim = 'run'; fi = Math.floor(P.heroT * (P.running ? 8.5 : 7)) % 8; }
  ctx.save(); ctx.translate(P.x, P.y);
  if (P.dead > 0) ctx.globalAlpha = Math.min(1, P.dead / 0.8);
  drawSprite(c, anim, fi, row, P.hurt > 0.17);
  ctx.restore();
  return true;
}
// виды врагов: mel — ближний бой, rng — стрелок
const KIND = {
  min: { ch: 'zombie', mel: 1, hp: 120, rad: 20, speed: 150, dmg: [8, 11], cd: 0.9, reach: 62, col: '#8a4534' },
  war: { ch: 'vampire', mel: 1, hp: 300, rad: 26, speed: 112, dmg: [17, 22], cd: 1.3, reach: 72, col: '#7a3a2c' },
  mag: { ch: 'mage', rng: 1, hp: 150, rad: 22, speed: 100, dmg: [16, 21], cd: 2.0, want: 430, shot: 520, col: '#6a4590' },
  rog: { ch: 'archer', rng: 1, hp: 120, rad: 21, speed: 125, dmg: [11, 14], cd: 1.4, want: 500, shot: 820, bolt: 1, col: '#3f6a55' },
  boss: { ch: 'boss', boss: 1, hp: 1000, rad: 46, speed: 85, col: '#565a66' },
};
const corpses = [];
function spawnEnemy(type) {
  const k = KIND[type];
  const e = {
    type, k, ch: CHARS[k.ch], boss: !!k.boss, mel: !!k.mel, rng: !!k.rng,
    x: (SRC_W - 430) * GS + rnd(-60, 60), y: 745 * GS + rnd(-150, 150),
    hp: Math.round(k.hp * (1 + 0.1 * Math.max(0, wave - 1))), rad: k.rad, speed: k.speed, col: k.col, eye: k.boss ? '#ffb347' : '#ffe27a',
    slowT: 0, slowK: 1, root: 0, dot: 0, atkCd: rnd(0.3, 1.2), flash: 0, bob: rnd(0, 6), slamCd: 2, quakeCd: 7,
    anim: 'run', animT: rnd(0, 1), runPh: rnd(0, 1), row: 2, act: null,
  };
  e.max = e.hp;
  e.draw = () => drawEnemy(e);
  enemies.push(e);
}
function spawnWave() {
  wave++;
  const nm = Math.min(2 + wave, 6);
  for (let i = 0; i < nm; i++) spawnEnemy(wave >= 2 && i % 3 === 2 ? 'war' : 'min');
  const nr = Math.min(1 + Math.floor(wave / 2), 3);
  for (let i = 0; i < nr; i++) spawnEnemy((i + wave) % 2 ? 'mag' : 'rog');
  if (wave % 3 === 0) spawnEnemy('boss');
  say(P.x, P.y - CH * 1.3, 'Волна ' + wave, '#ffe9a8');
}
// действие с замахом: анимация длится dur, удар срабатывает в момент at (доля от dur)
function startAct(e, anim, dur, at, fn) { e.act = { anim, dur, at, fn, t: 0, hit: false }; e.anim = anim; e.animT = 0; }
function updateEnemy(e, dt) {
  e.bob += dt * 7; e.flash -= dt; e.atkCd -= dt; e.slamCd -= dt; e.quakeCd -= dt; e.animT += dt;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.root > 0) { e.root -= dt; e.act = null; e.anim = 'idle'; hurtTick(e, e.dot * dt); return; }
  const k = e.k, sk = e.slowT > 0 ? e.slowK : 1;
  let dx = (P.x - e.x), dy = (P.y - e.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  if (e.act) {
    const a = e.act; a.t += dt * (0.5 + 0.5 * sk);
    if (!a.hit && a.t >= a.dur * a.at) { a.hit = true; a.fn(dx, dy); }
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
      play(pick(ESHOTS), 0.22, 1.5);
      if (gdist(P, e) < k.reach + 34) hurtPlayer(rnd(k.dmg[0], k.dmg[1]));
    });
  }
  if (e.rng && d < k.want + 40 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    startAct(e, 'atk', 0.55, 0.5, (ax, ay) => {
      shots.push({ own: 'e', bolt: k.bolt, x: e.x + ax * 20, y: e.y + ay * 20 * YK, dx: ax, dy: ay, sp: k.shot, left: k.want + 150,
        dmg: rnd(k.dmg[0], k.dmg[1]), h: e.ch.U * 0.75 });
      play(pick(ESHOTS), k.bolt ? 0.3 : 0.4, k.bolt ? 1.5 : rnd(0.95, 1.05));
    });
  }
  if (e.boss) {
    if (e.quakeCd <= 0) {
      e.quakeCd = 13;
      startAct(e, 'cast', 1.3, 0.25, () => {
        fx.push({ type: 'tele', x: P.x, y: P.y, t: 0, dur: 1.7, R: 290, dmg: 130, big: true });
        play('em_quake_ult', 0.8);
      });
    } else if (d < 150 && e.slamCd <= 0) {
      e.slamCd = 2.8;
      fx.push({ type: 'tele', x: e.x, y: e.y, t: 0, dur: 0.75, R: 150, dmg: 50, snd: 'em_slam' });
      startAct(e, 'atk', 1.0, 2, () => {});
    }
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
    if (P.moving && stepT <= 0) { play(pick(D_STEPS), P.running ? 0.3 : 0.18); stepT = P.running ? 0.33 : 0.55; }
    if ((held.key || held.touch || held.mouse || held.pad) && P.atkCd <= 0) shoot();
    if (P.ult > 0) {
      P.ult -= dt; P.ultTick -= dt;
      while (P.ultTick <= 0) {
        P.ultTick += 0.11;
        const a = rnd(0, 6.283), r = rnd(90, 400);
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
        if (e.hp > 0 && gdist(s, e) < e.rad + 16) {
          hurtEnemy(e, s.dmg); slow(e, 0.8, 1); s.left = 0;
          fx.push({ type: 'spark', hit: 1, x: e.x, y: e.y - e.ch.top * e.ch.U * 0.5, t: 0, dur: 0.4, R: 34 });
          play(pick(DOTA_ON ? D_HITS : HITS), 0.45, rnd(0.95, 1.1));
          break;
        }
      }
    } else if (P.dead <= 0 && gdist(s, P) < 30) {
      hurtPlayer(s.dmg); s.left = 0;
      fx.push({ type: 'spark', x: P.x, y: P.y - CH * 0.5, t: 0, dur: 0.25, R: 30, rock: true });
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
      fx.push({ type: 'spark', hail: 1, x: f.x, y: f.y, t: 0, dur: 0.5, R: f.R });
      if (hit || Math.random() < 0.18) {
        const set = !DOTA_ON ? HITS.concat(['cm_ice_hit_big']) : f.st === 2 ? D_FF : D_HITS;
        play(pick(set), hit ? 0.3 : 0.14, rnd(0.9, 1.15));
      }
    }
    if (f.type === 'tele') {
      if (P.dead <= 0 && gdist(f, P) < f.R) hurtPlayer(f.dmg);
      fx.push({ type: 'quake', x: f.x, y: f.y, t: 0, dur: 0.4, R: f.R });
      if (f.snd) play(f.snd, 0.7);
    }
  }
  for (const t of texts) { t.t += dt; t.y -= 46 * dt; }
  const keep = (arr, ok) => { for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1); };
  for (const c of corpses) c.dieT += dt;
  keep(corpses, c => c.dieT < 2.2);
  keep(enemies, e => e.hp > 0);
  keep(shots, s => s.left > 0);
  keep(zones, z => z.t > 0);
  keep(fx, f => f.t < f.dur);
  keep(texts, t => t.t < 0.9);
}

// ---------- графика скиллов ----------
// Листы нарисованы в ChatGPT: сетка кадров, фон переведён в прозрачность. g — число кадров по стороне.
const FXS = { nova: { g: 4 }, chains: { g: 4 }, hail: { g: 4 }, storm: { g: 4 }, bolt: { g: 2 }, hit: { g: 4 } };
for (const k in FXS) { const im = FXS[k].img = new Image(); im.onload = () => { FXS[k].ok = true; }; im.src = 'fx/' + k + '.webp' + V; }
// кадр fi листа k: прямоугольник w x h, точка (ax, ay) кадра (доли 0..1) ставится в (x, y)
function fxDraw(k, fi, x, y, w, h, ax, ay, alpha) {
  const F = FXS[k], n = F.g * F.g, c = F.img.width / F.g;
  fi = Math.max(0, Math.min(n - 1, Math.floor(fi)));
  if (alpha != null) ctx.globalAlpha = alpha;
  ctx.drawImage(F.img, (fi % F.g) * c, Math.floor(fi / F.g) * c, c, c, x - w * ax, y - h * ay, w, h);
  if (alpha != null) ctx.globalAlpha = 1;
}

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
    if (FXS.storm.ok) fxDraw('storm', (t * 12) % 16, P.x, P.y, 880, 1230, 0.5, 0.5, Math.min(1, P.ult) * 0.9);
    else { const a = Math.min(1, P.ult) * 0.22; disc(P.x, P.y, 410, 'rgba(150,200,255,' + a + ')', 'rgba(210,235,255,' + a * 2.2 + ')', 4); }
  }
  for (const z of zones) {
    if (FXS.storm.ok) fxDraw('storm', (t * 9 + 5) % 16, z.x, z.y, z.R * 2.15, z.R * 3.0, 0.5, 0.5, Math.min(1, z.t) * 0.7);
    else { const a = Math.min(1, z.t) * 0.2; disc(z.x, z.y, z.R, 'rgba(130,180,255,' + a + ')', 'rgba(200,225,255,' + a * 2.5 + ')', 3); }
  }
  for (const f of fx) {
    const k = f.t / f.dur;
    if (f.type === 'nova') {
      if (!FXS.nova.ok) disc(f.x, f.y, f.R * Math.min(1, k * 2.2), 'rgba(140,215,255,' + 0.45 * (1 - k) + ')', 'rgba(230,248,255,' + (1 - k) + ')', 6);
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
  const h = c.ok ? c.top * c.U : r * 2.2;
  ctx.save(); ctx.translate(e.x, e.y);
  if (dead) ctx.globalAlpha = Math.max(0, Math.min(1, (2.2 - e.dieT) / 0.9));
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.4, 0, 0, 7); ctx.fillStyle = 'rgba(8,20,6,0.45)'; ctx.fill();
  if (!dead && e.slowT > 0) { ctx.beginPath(); ctx.ellipse(0, 0, r * 1.25, r * 0.5, 0, 0, 7); ctx.fillStyle = 'rgba(140,210,255,0.35)'; ctx.fill(); }
  if (c.ok) {
    const n = ((c.an || AN)[e.anim] || AN.idle)[1];
    let fi = 0;
    if (dead) fi = Math.floor(e.dieT / 0.6 * n);
    else if (e.act) fi = Math.floor(e.act.t / e.act.dur * n);
    else if (e.anim === 'run') fi = Math.floor(e.runPh * n) % n;
    drawSprite(c, e.anim, fi, e.row, e.flash > 0 && !dead);
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
  if (s.own === 'p' && FXS.bolt.ok) {
    ctx.save(); ctx.translate(s.x, y); ctx.rotate(Math.atan2(s.dy * YK, s.dx));
    fxDraw('bolt', (s.left / 40) % 4, 0, 0, 175, 175, 0.9, 0.5);
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
function combatEntities() {
  const out = enemies.concat(corpses);
  if (typeof SHOP !== 'undefined') for (const d of SHOP.drops) out.push(d);
  for (const s of shots) { if (!s.draw) s.draw = () => drawShot(s); out.push(s); }
  for (const f of fx) {
    if (f.type === 'nova' && FXS.nova.ok) {
      if (!f.draw) f.draw = () => fxDraw('nova', f.t / f.dur * 16, f.x, f.y, f.R * 2.25, f.R * 2.9, 0.5, 0.56);
      out.push(f); continue;
    }
    if (f.type === 'chains' && FXS.chains.ok) {
      if (!f.draw) f.draw = () => {
        // рост, удержание по кругу, затем раскол; если враг погиб раньше — сразу раскол
        if (f.e.hp <= 0 && f.t < f.dur - 0.45) f.t = f.dur - 0.45;
        const left = f.dur - f.t, fi = f.t < 0.35 ? f.t / 0.35 * 5 : left < 0.45 ? 12 + (0.45 - left) / 0.45 * 4 : 5 + ((f.t - 0.35) * 7) % 7;
        const sz = f.h * 1.75;
        fxDraw('chains', fi, f.e.x, f.e.y + 2, sz, sz, 0.5, 0.86);
      };
      f.y = f.e.y + 2; out.push(f); continue;
    }
    if (f.type === 'spark' && f.hail && FXS.hail.ok) {
      if (!f.draw) f.draw = () => fxDraw('hail', 6 + f.t / f.dur * 10, f.x, f.y, f.R * 3.4, f.R * 3.4, 0.5, 0.87);
      out.push(f); continue;
    }
    if (f.type !== 'shard') continue;
    if (FXS.hail.ok) {
      if (!f.draw) f.draw = () => fxDraw('hail', f.t / f.dur * 6, f.x, f.y, f.R * 3.4, f.R * 3.4, 0.5, 0.87);
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
const SNOW = [];
for (let i = 0; i < 90; i++) SNOW.push({ a: Math.random() * 6.283, r: Math.random(), s: 0.6 + Math.random(), h: Math.random() });
// поверх мира: вспышки, снег бури, цифры урона
function combatOver(t) {
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const f of fx) {
    if (f.type !== 'spark' && f.type !== 'puff') continue;
    if (f.hail && FXS.hail.ok) continue;
    if (f.hit && FXS.hit.ok) {
      ctx.globalCompositeOperation = 'source-over';
      fxDraw('hit', f.t / f.dur * 16, f.x, f.y, 190, 190, 0.5, 0.5);
      ctx.globalCompositeOperation = 'lighter';
      continue;
    }
    const k = f.t / f.dur, R = f.R * (0.5 + k), col = f.rock ? '255,190,120' : f.type === 'puff' ? '255,230,200' : '190,230,255';
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, R);
    g.addColorStop(0, 'rgba(' + col + ',' + 0.8 * (1 - k) + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, 7); ctx.fill();
  }
  if (P.cast > 0 && P.dead <= 0) {
    const y = P.y - CH * 0.78, g = ctx.createRadialGradient(P.x, y, 0, P.x, y, 60);
    g.addColorStop(0, 'rgba(170,225,255,' + Math.min(0.9, P.cast * 5) + ')'); g.addColorStop(1, 'rgba(170,225,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(P.x, y, 60, 0, 7); ctx.fill();
  }
  if (P.ult > 0 && !FXS.storm.ok) {
    ctx.fillStyle = 'rgba(235,245,255,' + Math.min(1, P.ult) * 0.8 + ')';
    for (const s of SNOW) {
      const a = s.a + t * 1.6 * s.s, r = 60 + s.r * 360, hh = ((s.h + t * 0.5 * s.s) % 1) * 260;
      ctx.beginPath(); ctx.arc(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK - hh, 2.2 + s.s * 1.6, 0, 7); ctx.fill();
    }
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
    const bw = 96, by = P.y - CH * 1.12;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(P.x - bw / 2 - 1, by - 1, bw + 2, 10);
    ctx.fillStyle = P.hurt > 0 ? '#ffffff' : '#57d46a'; ctx.fillRect(P.x - bw / 2, by, bw * P.hp / P.maxHp, 8);
  }
}
// интерфейс в координатах экрана
function combatUI() {
  layoutButtons();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const b of BTN) {
    const cd = b.id === 'atk' ? 0 : P.cd[b.id], on = b.id === 'r' && P.ult > 0;
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
  if (P.dead > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('Возрождение через ' + Math.ceil(P.dead), W / 2, H / 2);
  }
  musicUpdate();
  const el = document.getElementById('snd');
  if (el) {
    const n = Object.keys(SND).length, on = AC && AC.state === 'running';
    const txt = !on ? '🔇 коснитесь экрана, чтобы включить звук'
      : '🔊 звук: ' + (DOTA_ON ? 'Дота' : 'синтез') + ', загружено ' + n;
    if (el.textContent !== txt) { el.textContent = txt; el.style.color = on ? '#9df0a6' : '#ffd28a'; }
  }
}
var COMBAT_READY = true;
