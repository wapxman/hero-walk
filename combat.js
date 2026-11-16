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
  'em_shot_v1', 'em_shot_v2', 'em_shot_v3', 'em_slam', 'em_rockburst', 'em_quake_ult'];
const SND = {};
let AC = null;
function audioInit() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  const C = window.AudioContext || window.webkitAudioContext;
  if (!C) return;
  AC = new C();
  for (const n of SFX) {
    fetch('sfx/' + n + '.mp3' + V).then(r => r.arrayBuffer())
      .then(b => AC.decodeAudioData(b, buf => { SND[n] = buf; }, () => {})).catch(() => {});
  }
}
for (const ev of ['touchstart', 'touchend', 'mousedown', 'keydown']) addEventListener(ev, audioInit, { passive: true });
function play(n, vol, rate) {
  if (!AC || AC.state !== 'running' || !SND[n]) return;
  const s = AC.createBufferSource(); s.buffer = SND[n]; s.playbackRate.value = rate || 1;
  const g = AC.createGain(); g.gain.value = vol == null ? 1 : vol;
  s.connect(g); g.connect(AC.destination); s.start();
}
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
  e.hp -= dmg; e.flash = 0.08;
  say(e.x + rnd(-14, 14), e.y - e.rad * 2.2, Math.round(dmg), col || '#bfe6ff');
  if (e.hp <= 0) {
    kills++;
    fx.push({ type: 'puff', x: e.x, y: e.y, t: 0, dur: 0.45, R: e.rad * 1.6 });
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
  play(pick(SHOTS), 0.7, rnd(0.94, 1.06));
}
function cast(id) {
  if (P.dead > 0 || P.cd[id] > 0) return;
  if (id === 'q') {
    const c = aimPoint(320), R = 215;
    fx.push({ type: 'nova', x: c.x, y: c.y, t: 0, dur: 0.7, R });
    for (const e of enemies) if (gdist(c, e) < R + e.rad) { hurtEnemy(e, 95); slow(e, 0.45, 3.5); }
    play('cm3_nova', 0.9);
  } else if (id === 'e') {
    const t = nearestEnemy(RANGE);
    if (!t) { say(P.x, P.y - CH, 'нет цели', '#ffd28a'); return; }
    t.root = 2.8; t.dot = 45; hurtEnemy(t, 40);
    play('cm3_frostbite', 0.9);
  } else if (id === 'f') {
    const c = aimPoint(340);
    zones.push({ type: 'hail', x: c.x, y: c.y, R: 250, t: 3.2, tick: 0 });
    play('cm_ice_hail', 0.9);
  } else if (id === 'r') {
    P.ult = 5; P.ultTick = 0;
    play('cm3_ult', 0.9); play('cm_ult_purga', 0.55);
  }
  P.cd[id] = CDMAX[id]; P.cast = 0.3;
}
function hurtPlayer(d) {
  if (P.dead > 0) return;
  P.hp -= d; P.hurt = 0.25;
  say(P.x + rnd(-12, 12), P.y - CH * 1.05, '-' + Math.round(d), '#ff8a7a');
  if (P.hp <= 0) { P.hp = 0; P.dead = 3; P.ult = 0; held.touch = held.mouse = false; }
}
// ледяной осколок, падающий с неба: через delay бьёт по кругу
function shard(x, y, R, dmg, sk, st) {
  fx.push({ type: 'shard', x, y, t: 0, dur: 0.28, R, dmg, sk, st });
}

// ---------- враги ----------
function spawnEnemy(type) {
  const boss = type === 'boss', rng = type === 'rng';
  const e = {
    type, boss, x: (SRC_W - 430) * GS + rnd(-60, 60), y: 745 * GS + rnd(-150, 150),
    hp: boss ? 950 : rng ? 150 : 230, rad: boss ? 46 : rng ? 22 : 26,
    speed: boss ? 85 : rng ? 105 : 125,
    col: boss ? '#565a66' : rng ? '#6a4590' : '#8a4534', eye: boss ? '#ffb347' : '#ffe27a',
    slowT: 0, slowK: 1, root: 0, dot: 0, atkCd: rnd(0.3, 1.2), flash: 0, bob: rnd(0, 6), slamCd: 2, quakeCd: 7,
  };
  e.max = e.hp;
  e.draw = () => drawEnemy(e);
  enemies.push(e);
}
function spawnWave() {
  wave++;
  if (enemies.length >= 12) return;
  for (let i = 0; i < Math.min(2 + wave, 5); i++) spawnEnemy('mel');
  for (let i = 0; i < Math.min(1 + Math.floor(wave / 2), 3); i++) spawnEnemy('rng');
  if (wave % 3 === 0) spawnEnemy('boss');
  say(P.x, P.y - CH * 1.3, 'Волна ' + wave, '#ffe9a8');
}
function updateEnemy(e, dt) {
  e.bob += dt * 7; e.flash -= dt; e.atkCd -= dt; e.slamCd -= dt; e.quakeCd -= dt;
  if (e.slowT > 0) e.slowT -= dt;
  if (e.root > 0) { e.root -= dt; hurtTick(e, e.dot * dt); return; }
  if (P.dead > 0) return;
  const d = gdist(P, e), sp = e.speed * (e.slowT > 0 ? e.slowK : 1);
  let dx = (P.x - e.x), dy = (P.y - e.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  const want = e.type === 'rng' ? 430 : e.boss ? 105 : 54;
  if (d > want) { e.x += dx * sp * dt; e.y += dy * sp * YK * dt; collide(e); }
  if (e.type === 'mel' && d < 70 && e.atkCd <= 0) { hurtPlayer(rnd(12, 16)); e.atkCd = 1; play(pick(ESHOTS), 0.22, 1.5); }
  if (e.type === 'rng' && d < 470 && e.atkCd <= 0) {
    shots.push({ own: 'e', x: e.x, y: e.y, dx, dy, sp: 520, left: 560, dmg: rnd(16, 21), h: e.rad * 1.4 });
    e.atkCd = 1.9; play(pick(ESHOTS), 0.4, rnd(0.95, 1.05));
  }
  if (e.boss) {
    if (d < 150 && e.slamCd <= 0) {
      fx.push({ type: 'tele', x: e.x, y: e.y, t: 0, dur: 0.75, R: 150, dmg: 50, snd: 'em_slam' });
      e.slamCd = 2.6;
    }
    if (e.quakeCd <= 0) {
      fx.push({ type: 'tele', x: P.x, y: P.y, t: 0, dur: 1.7, R: 290, dmg: 130, big: true });
      e.quakeCd = 13; play('em_quake_ult', 0.8);
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
  P.atkCd -= dt; P.cast -= dt; P.hurt -= dt;
  if (P.dead > 0) {
    P.dead -= dt;
    if (P.dead <= 0) { P.dead = 0; P.hp = P.maxHp; P.x = SPAWN.x; P.y = SPAWN.y; }
  } else {
    P.hp = Math.min(P.maxHp, P.hp + 5 * dt);
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
  waveT -= dt;
  if (waveT <= 0) { spawnWave(); waveT = 14; }
  if (!enemies.length && waveT > 3) waveT = 3;

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
          fx.push({ type: 'spark', x: e.x, y: e.y - e.rad, t: 0, dur: 0.25, R: 34 });
          play(pick(HITS), 0.45, rnd(0.95, 1.1));
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
      fx.push({ type: 'spark', x: f.x, y: f.y, t: 0, dur: 0.3, R: f.R * 0.6 });
      if (hit || Math.random() < 0.18) play(pick(HITS.concat(['cm_ice_hit_big'])), hit ? 0.3 : 0.14, rnd(0.9, 1.15));
    }
    if (f.type === 'tele') {
      if (P.dead <= 0 && gdist(f, P) < f.R) hurtPlayer(f.dmg);
      fx.push({ type: 'quake', x: f.x, y: f.y, t: 0, dur: 0.4, R: f.R });
      if (f.snd) play(f.snd, 0.7);
    }
  }
  for (const t of texts) { t.t += dt; t.y -= 46 * dt; }
  const keep = (arr, ok) => { for (let i = arr.length - 1; i >= 0; i--) if (!ok(arr[i])) arr.splice(i, 1); };
  keep(enemies, e => e.hp > 0);
  keep(shots, s => s.left > 0);
  keep(zones, z => z.t > 0);
  keep(fx, f => f.t < f.dur);
  keep(texts, t => t.t < 0.9);
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
    const a = Math.min(1, P.ult) * 0.22;
    disc(P.x, P.y, 410, 'rgba(150,200,255,' + a + ')', 'rgba(210,235,255,' + a * 2.2 + ')', 4);
  }
  for (const z of zones) {
    const a = Math.min(1, z.t) * 0.2;
    disc(z.x, z.y, z.R, 'rgba(130,180,255,' + a + ')', 'rgba(200,225,255,' + a * 2.5 + ')', 3);
  }
  for (const f of fx) {
    const k = f.t / f.dur;
    if (f.type === 'nova') {
      disc(f.x, f.y, f.R * Math.min(1, k * 2.2), 'rgba(140,215,255,' + 0.45 * (1 - k) + ')', 'rgba(230,248,255,' + (1 - k) + ')', 6);
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
function drawEnemy(e) {
  const r = e.rad, h = r * 2.2, bob = e.root > 0 ? 0 : Math.sin(e.bob) * 3;
  ctx.save(); ctx.translate(e.x, e.y);
  ctx.beginPath(); ctx.ellipse(0, 0, r * 1.05, r * 0.4, 0, 0, 7); ctx.fillStyle = 'rgba(8,20,6,0.45)'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, -h * 0.5 + bob, r, h * 0.5, 0, 0, 7);
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : e.col; ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.stroke();
  if (e.slowT > 0 || e.root > 0) { ctx.fillStyle = 'rgba(140,210,255,0.4)'; ctx.fill(); }
  const ex = Math.sign(P.x - e.x) * r * 0.22;
  ctx.fillStyle = e.eye;
  ctx.beginPath(); ctx.arc(-r * 0.34 + ex, -h * 0.64 + bob, r * 0.15, 0, 7); ctx.arc(r * 0.34 + ex, -h * 0.64 + bob, r * 0.15, 0, 7); ctx.fill();
  if (e.type === 'rng') { ctx.fillStyle = '#b9a58f'; ctx.beginPath(); ctx.arc(ex * 3, -h * 1.02 + bob, r * 0.3, 0, 7); ctx.fill(); }
  if (e.boss) { ctx.fillStyle = '#3a3d47'; ctx.fillRect(-r * 0.8, -h * 1.02 + bob, r * 0.35, r * 0.3); ctx.fillRect(r * 0.45, -h * 1.02 + bob, r * 0.35, r * 0.3); }
  if (e.root > 0) {
    ctx.fillStyle = 'rgba(190,235,255,0.6)'; ctx.strokeStyle = 'rgba(240,250,255,0.9)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r * 1.2, 0); ctx.lineTo(-r * 0.8, -h * 0.7); ctx.lineTo(-r * 0.2, -h * 0.35); ctx.lineTo(r * 0.1, -h * 0.9);
    ctx.lineTo(r * 0.7, -h * 0.4); ctx.lineTo(r * 1.2, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  const bw = r * 2.2, by = -h - 16;
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(-bw / 2 - 1, by - 1, bw + 2, 8);
  ctx.fillStyle = '#e0503f'; ctx.fillRect(-bw / 2, by, bw * Math.max(0, e.hp / e.max), 6);
  ctx.restore();
}
function drawShot(s) {
  const y = s.y - s.h;
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
  const out = enemies.slice();
  for (const s of shots) { if (!s.draw) s.draw = () => drawShot(s); out.push(s); }
  for (const f of fx) {
    if (f.type !== 'shard') continue;
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
  if (P.ult > 0) {
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
  const el = document.getElementById('snd');
  if (el) el.style.display = (AC && AC.state === 'running') ? 'none' : 'inline';
}
var COMBAT_READY = true;
