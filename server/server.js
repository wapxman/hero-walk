// Игровой сервер Duel Arena: авторитетный мир с фиксированным тиком 30 Гц.
// Клиенты присылают только ввод (стик и кнопки) с номером; сервер двигает всех, считает бой и рассылает
// двоичные дельта-снимки и события. Комнаты: «duel» — 1 на 1, «coop» — до 4 игроков против волн.
// Запуск: node server/server.js [порт]   (переменные LAG=мс JITTER=мс — искусственная задержка сети для проверки)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { WebSocketServer } = require('ws');
const NET = require('../net/shared.js');

const PORT = +(process.argv[2] || process.env.PORT || 8790);
const LAG = +(process.env.LAG || 0), JITTER = +(process.env.JITTER || 0);

// ---------- карта из data.js (та же, что у игры) ----------
const box = { location: { port: '', pathname: '/' }, localStorage: { getItem: () => null, setItem() {} }, console };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8') +
  '\n;this.D = { WALK, DEFAULT_OBJ, HERO_SPAWN, ENEMY_SPAWN };', box);
const D = box.D;
NET.setMap(D.WALK, D.DEFAULT_OBJ);
const { TICK, DT, YK, EV } = NET;
const rnd = (a, b) => a + Math.random() * (b - a);
const gdist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) / YK);

// ---------- герои ----------
const HERO = {
  mage: { hp: 600, range: 600, cd: { q: 6, e: 9, f: 12, r: 28 }, mana: { q: 60, e: 50, f: 80, r: 150 }, atkCd: 0.62 },
  archer: { hp: 520, range: 720, cd: { q: 9, e: 6, f: 15, r: 0 }, mana: { q: 70, e: 60, f: 90, r: 0 }, atkCd: 0.6 },
};
const PVP_DMG = 0.5;   // в дуэли урон по герою вдвое меньше, чтобы бой не кончался за секунды
// враги — как в одиночной игре (combat.js KIND)
const KIND = {
  min: { mel: 1, hp: 120, rad: 20, speed: 150, dmg: [9, 13], cd: 0.9, reach: 62, xp: 8 },
  war: { mel: 1, hp: 300, rad: 26, speed: 112, dmg: [20, 26], cd: 1.25, reach: 72, xp: 18 },
  mag: { rng: 1, hp: 150, rad: 22, speed: 100, dmg: [18, 24], cd: 1.9, want: 430, shot: 520, xp: 14 },
  rog: { rng: 1, hp: 120, rad: 21, speed: 125, dmg: [13, 16], cd: 1.35, want: 500, shot: 820, bolt: 1, xp: 14 },
  boss: { boss: 1, hp: 1500, rad: 46, speed: 92, xp: 120 },
};
const SHOT_KIND = { ice: 1, arrow: 2, fire: 3, bolt: 4 };
const SKILL = { nova: 1, chains: 2, hail: 3, storm: 4, gust: 5, shield: 6, volley: 7 };

function runRow(ax, ay) { const deg = Math.atan2(ay, ax) * 180 / Math.PI; return ((Math.round((deg - 90) / 45) % 8) + 8) % 8; }

// ---------- комнаты ----------
const rooms = new Map();
let nextRoom = 1;
function makeRoom(mode, code) {
  const r = { code: code || String(1000 + (nextRoom++ % 9000)), mode, max: mode === 'duel' ? 2 : 4, clients: new Set(), ents: new Map(),
    shots: [], zones: [], shards: [], tick: 0, wave: 0, phase: 0, nextId: 1, hist: [], events: [] };
  rooms.set(r.code, r);
  return r;
}
const newId = r => { r.nextId = (r.nextId % 60000) + 1; return r.nextId; };
const ev = (r, ...e) => r.events.push(e);
const hostile = (a, b) => a.team !== b.team;
const alive = e => e.hp > 0 && !(e.dead > 0);

// ---------- герой игрока ----------
function heroStats(p) {
  const s = p.prog, st = s.st, h = HERO[p.kind];
  p.dmgMul = (1 + 0.015 * (s.lvl - 1)) * (1 + 0.006 * st.str);
  p.spdMul = 1 + 0.006 * st.agi; p.atkSpd = 1 + 0.015 * st.agi; p.skMul = 1 + 0.015 * st.int;
  p.mpRegen = 11 + 0.35 * st.int;
  const mh = h.hp + 10 * (s.lvl - 1) + 8 * st.str, mm = 420 + 12 * st.int;
  if (p.max && mh > p.max) p.hp += mh - p.max;
  p.max = mh; p.maxMp = mm; p.hp = Math.min(p.hp == null ? mh : p.hp, mh); p.mp = Math.min(p.mp == null ? mm : p.mp, mm);
}
const skLv = (p, id) => p.prog.sk[id] || 1;
const skDmg = (p, id) => (1 + 0.12 * (skLv(p, id) - 1)) * p.skMul;
const skCd = (p, id) => 1 - 0.03 * (skLv(p, id) - 1);
function cleanProg(m) {
  const n = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? Math.floor(v) : d);
  const st = m.st || {}, sk = m.sk || {};
  return { lvl: n(m.lvl, 1, 100, 1), st: { str: n(st.str, 0, 300, 0), agi: n(st.agi, 0, 300, 0), int: n(st.int, 0, 300, 0) },
    sk: { q: n(sk.q, 1, 10, 1), e: n(sk.e, 1, 10, 1), f: n(sk.f, 1, 10, 1), r: n(sk.r, 1, 10, 1) } };
}
function spawnPoint(r, team) {
  const s = r.mode === 'duel' && team === 2 ? D.ENEMY_SPAWN : D.HERO_SPAWN;
  const p = { x: s.x + rnd(-40, 40), y: s.y + rnd(-25, 25) };
  NET.collide(p);
  return p;
}
function addPlayer(r, c, hero, prog) {
  const team = r.mode === 'duel' ? (r.clients.size === 0 ? 1 : 2) : 1;
  const sp = spawnPoint(r, team);
  const p = { id: newId(r), player: true, kind: HERO[hero] ? hero : 'mage', team, x: NET.qpos(sp.x), y: NET.qpos(sp.y), face: { x: team === 2 ? -1 : 1, y: 0 },
    row: 0, rad: 22, cd: { q: 0, e: 0, f: 0, r: 0 }, atkCd: 0, dead: 0, slowT: 0, slowK: 1, root: 0, silT: 0, ult: 0, ultTick: 0, focus: 0, focusT: 0,
    shield: 0, shieldT: 0, kills: 0, inputs: [], seq: 0, btn: 0, castT: 0, atkT: 0, spdNow: 1, prog: cleanProg(prog || {}), client: c };
  heroStats(p);
  r.ents.set(p.id, p);
  return p;
}

// ---------- урон ----------
function hurt(r, e, dmg, src, col) {
  if (!alive(e)) return;
  if (src && src.player) dmg *= src.dmgMul;
  if (e.player && src && src.player) dmg *= PVP_DMG;
  if (e.shieldT > 0 && e.shield > 0) {
    const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a;
    if (e.shield <= 0) { e.shieldT = 0; ev(r, EV.SAY, e.id, 1); }
    if (dmg <= 0) return;
  }
  e.hp -= dmg;
  ev(r, EV.DMG, e.id, dmg, col || 0);
  if (e.hp <= 0) {
    e.hp = 0;
    ev(r, EV.DIE, e.id, src ? src.id : 0);
    if (e.player) { e.dead = 3; e.ult = 0; e.focus = 0; e.shield = 0; e.shieldT = 0; if (src && src.player) src.kills++; }
    else {
      e.dieT = 0;
      // опыт за врага — всем игрокам комнаты (общий опыт в кооперативе), растёт с волной
      const xp = Math.round((KIND[e.kind].xp || 8) * (1 + 0.08 * Math.max(0, r.wave - 1)));
      ev(r, EV.LVL, xp);
    }
  }
}
function slow(e, k, t) { e.slowK = Math.min(e.slowT > 0 ? e.slowK : 1, k); e.slowT = Math.max(e.slowT, t); }
function targetsOf(r, p) { const out = []; for (const e of r.ents.values()) if (hostile(p, e) && alive(e)) out.push(e); return out; }
function nearest(r, p, range) {
  let best = null, bd = range;
  for (const e of targetsOf(r, p)) { const d = gdist(p, e); if (d < bd) { bd = d; best = e; } }
  return best;
}

// ---------- снаряды и компенсация лага ----------
// Позиции всех сущностей за последнюю секунду: попадание снаряда игрока проверяется по тому, где цели были
// на экране у стрелка (сейчас минус половина пинга минус задержка интерполяции 100 мс).
const HIST = 32;
function recordHistory(r) {
  const m = new Map();
  for (const e of r.ents.values()) m.set(e.id, { x: e.x, y: e.y });
  r.hist[r.tick % HIST] = m;
}
function posAt(r, e, rewind) {
  if (!rewind) return e;
  const h = r.hist[(r.tick - rewind + HIST * 4) % HIST];
  return (h && h.get(e.id)) || e;
}
function rewindOf(p) { return p && p.player ? Math.max(0, Math.min(20, Math.round(((p.rtt || 0) / 2 + (p.interp || 100)) / (1000 / TICK)))) : 0; }
function shoot(r, owner, kind, dx, dy, tgt, dmg, sp, left, h) {
  const s = { id: newId(r), owner, team: owner.team, kind, x: owner.x + dx * 26, y: owner.y + dy * 26 * YK, dx, dy, sp, left, tgt, dmg, rew: rewindOf(owner) };
  r.shots.push(s);
  ev(r, EV.SHOT, s.id, owner.id, SHOT_KIND[kind], s.x, s.y, dx * 1000, dy * 1000, sp, tgt ? tgt.id : -1, h || 0);
  // снаряд игрока догоняет то время, которое его ввод шёл до сервера (стрелок видел выстрел сразу)
  if (owner.player && owner.rtt) { const ahead = Math.min(6, Math.round(owner.rtt / 2 / (1000 / TICK))); for (let i = 0; i < ahead && s.left > 0; i++) stepShot(r, s); }
  return s;
}
function stepShot(r, s) {
  if (s.tgt && alive(s.tgt)) {
    const tp = posAt(r, s.tgt, s.rew);
    let dx = tp.x - s.x, dy = (tp.y - s.y) / YK; const m = Math.hypot(dx, dy) || 1; s.dx = dx / m; s.dy = dy / m;
  }
  const step = s.sp * DT;
  s.x += s.dx * step; s.y += s.dy * step * YK; s.left -= step;
  for (const e of r.ents.values()) {
    if (e.team === s.team || !alive(e)) continue;
    const tp = posAt(r, e, s.rew);
    if (Math.hypot(tp.x - s.x, (tp.y - s.y) / YK) < (e.rad || 22) + 16) {
      s.left = 0;
      ev(r, EV.HIT, s.id, e.id, e.x, e.y);
      hurt(r, e, s.dmg, s.owner, s.kind === 'arrow' ? 2 : 1);
      if (s.kind === 'ice') slow(e, 0.8, 1);
      if (s.kind === 'arrow' && s.owner.player) { s.owner.focus = Math.min(10, s.owner.focus + 1); s.owner.focusT = 3; }
      return;
    }
  }
}

// ---------- скиллы героев ----------
function cast(r, p, id) {
  const h = HERO[p.kind];
  if (!alive(p) || p.cd[id] > 0 || p.silT > 0 || (p.kind === 'archer' && id === 'r')) return;
  if (p.mp < h.mana[id]) return;
  const aim = d => { const t = nearest(r, p, h.range); return t ? { x: t.x, y: t.y } : { x: p.x + p.face.x * d, y: p.y + p.face.y * d * YK }; };
  if (p.kind === 'mage') {
    if (id === 'q') {
      const c = aim(320), R = 215;
      ev(r, EV.CAST, p.id, SKILL.nova, c.x, c.y, R);
      for (const e of targetsOf(r, p)) if (gdist(c, e) < R + (e.rad || 22)) { hurt(r, e, 95 * skDmg(p, 'q'), p, 1); slow(e, 0.45, 3.5); }
    } else if (id === 'e') {
      const t = nearest(r, p, h.range);
      if (!t) return;
      t.root = 2.8 + 0.1 * (skLv(p, 'e') - 1); t.dot = 45 * skDmg(p, 'e'); t.dotSrc = p; t.leap = null; t.jump = 0;
      ev(r, EV.CAST, p.id, SKILL.chains, t.id, t.root * 100);
      hurt(r, t, 40 * skDmg(p, 'e'), p, 1);
    } else if (id === 'f') {
      const c = aim(340);
      r.zones.push({ owner: p, x: c.x, y: c.y, R: 250, t: 3.2, tick: 0, mul: skDmg(p, 'f') });
      ev(r, EV.CAST, p.id, SKILL.hail, c.x, c.y, 250);
    } else if (id === 'r') {
      p.ult = 5 + 0.2 * (skLv(p, 'r') - 1); p.ultTick = 0; p.ultMul = skDmg(p, 'r');
      ev(r, EV.CAST, p.id, SKILL.storm, p.ult * 100);
    }
  } else {
    const fk = 1 + (0.05 + 0.006 * (skLv(p, 'r') - 1)) * p.focus;
    if (id === 'q') {
      const R = 290;
      ev(r, EV.CAST, p.id, SKILL.gust, p.x, p.y, R);
      for (const e of targetsOf(r, p)) {
        const d = gdist(p, e);
        if (d > R + (e.rad || 22)) continue;
        hurt(r, e, 70 * fk * skDmg(p, 'q'), p, 2);
        let dx = e.x - p.x, dy = (e.y - p.y) / YK; const m = Math.hypot(dx, dy) || 1;
        const push = (e.boss ? 120 : 280) * (1 - 0.5 * d / (R + (e.rad || 22))), t = 0.28;
        e.kb = { vx: dx / m * push / t, vy: dy / m * push / t * YK, t }; e.silT = 3.5 + 0.15 * (skLv(p, 'q') - 1);
        e.act = null; e.leap = null; e.jump = 0;
      }
    } else if (id === 'e') {
      const t = nearest(r, p, h.range * 1.1);
      let dx = p.face.x, dy = p.face.y;
      if (t) { dx = t.x - p.x; dy = (t.y - p.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
      const a0 = Math.atan2(dy, dx);
      ev(r, EV.CAST, p.id, SKILL.volley, p.x, p.y, 0);
      for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.2; shoot(r, p, 'arrow', Math.cos(a), Math.sin(a), null, rnd(52, 64) * fk * skDmg(p, 'e'), 1300, h.range * (1 + 0.03 * p.focus) + 120); }
    } else if (id === 'f') {
      p.shield = Math.round((260 + 6 * (p.prog.lvl - 1)) * skDmg(p, 'f')); p.shieldT = 6;
      ev(r, EV.CAST, p.id, SKILL.shield, 600);
    }
  }
  p.cd[id] = h.cd[id] * skCd(p, id); p.mp -= h.mana[id]; p.castT = 0.5;
}
function attack(r, p) {
  const h = HERO[p.kind], range = p.kind === 'archer' ? h.range * (1 + 0.03 * p.focus) : h.range;
  const t = nearest(r, p, range);
  let dx = p.face.x, dy = p.face.y;
  if (t) { dx = t.x - p.x; dy = (t.y - p.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; p.row = runRow(t.x - p.x, t.y - p.y); }
  if (p.kind === 'archer') {
    const fk = 1 + (0.05 + 0.006 * (skLv(p, 'r') - 1)) * p.focus;
    shoot(r, p, 'arrow', dx, dy, t, rnd(40, 52) * fk, 1300, range + 120);
    p.atkCd = h.atkCd / (1 + 0.04 * p.focus) / p.atkSpd;
  } else {
    shoot(r, p, 'ice', dx, dy, t, rnd(44, 56), 980, 700);
    p.atkCd = h.atkCd / p.atkSpd;
  }
  p.atkT = 0.36;
}
function shard(r, owner, x, y, R, dmg, sk, st) { r.shards.push({ owner, x, y, R, dmg, sk, st, t: 0.28 }); ev(r, EV.SHARD, x, y, R); }

// ---------- враги (кооператив) ----------
function spawnEnemy(r, type, x, y) {
  const k = KIND[type], w = Math.max(0, r.wave - 1);
  const e = { id: newId(r), kind: type, team: 2, k, boss: !!k.boss, x: x != null ? x : D.ENEMY_SPAWN.x + rnd(-90, 90), y: y != null ? y : D.ENEMY_SPAWN.y + rnd(-30, 90),
    hp: Math.round(k.hp * (1 + 0.14 * w)), dm: 1 + 0.08 * w, rad: k.rad, speed: k.speed * (1 + Math.min(0.25, 0.02 * w)), row: 2,
    slowT: 0, slowK: 1, root: 0, silT: 0, atkCd: rnd(0.3, 1.2), slamCd: 2, quakeCd: 7, leapCd: 4, summonCd: 9, jump: 0, act: null };
  e.max = e.hp; NET.collide(e);
  r.ents.set(e.id, e);
}
function spawnWave(r) {
  r.wave++; r.phase = 1;
  const bossWave = r.wave % 3 === 0, np = Math.max(1, [...r.clients].length), more = 1 + 0.5 * (np - 1);
  const nm = Math.round(Math.min(3 + r.wave, 9) * (bossWave ? 0.5 : 1) * more);
  for (let i = 0; i < nm; i++) spawnEnemy(r, r.wave >= 2 && i % 3 === 2 ? 'war' : 'min');
  const nr = Math.round(Math.min(1 + Math.floor(r.wave / 2), 4) * (bossWave ? 0.5 : 1) * more);
  for (let i = 0; i < nr; i++) spawnEnemy(r, (i + r.wave) % 2 ? 'mag' : 'rog');
  if (bossWave) spawnEnemy(r, 'boss');
  ev(r, EV.WAVE_START, r.wave, bossWave ? 1 : 0);
}
function act(e, dur, at, fn, cast) { e.act = { dur, at, fn, t: 0, hit: false, cast: !!cast }; }
function tele(r, x, y, R, dur, dmg, big) { r.zones.push({ tele: true, x, y, R, t: dur, dmg, big }); ev(r, EV.TELE, x, y, R, dur * 100, big ? 1 : 0); }
function updateEnemy(r, e) {
  e.atkCd -= DT; e.slamCd -= DT; e.quakeCd -= DT; e.leapCd -= DT; e.summonCd -= DT;
  if (e.slowT > 0) e.slowT -= DT;
  if (e.silT > 0) e.silT -= DT;
  if (e.kb) { const q = Math.min(DT, e.kb.t); e.x += e.kb.vx * q; e.y += e.kb.vy * q; e.kb.t -= DT; NET.collide(e); if (e.kb.t <= 0) e.kb = null; return; }
  if (e.root > 0) { e.root -= DT; e.act = null; if (e.dot) { e.dotAcc = (e.dotAcc || 0) + e.dot * DT; if (e.dotAcc >= 15) { hurt(r, e, e.dotAcc, e.dotSrc, 1); e.dotAcc = 0; } } return; }
  const sk = e.slowT > 0 ? e.slowK : 1;
  // цель — ближайший живой герой
  let tg = null, bd = 1e9;
  for (const p of r.ents.values()) if (p.player && alive(p)) { const d = gdist(p, e); if (d < bd) { bd = d; tg = p; } }
  if (e.act) {
    const a = e.act; a.t += DT * (0.5 + 0.5 * sk);
    if (!a.hit && a.t >= a.dur * a.at) { a.hit = true; a.fn(tg); }
    if (e.leap) {
      const L = e.leap; L.t += DT; const q = Math.min(1, L.t / L.dur);
      e.x = L.x0 + (L.x1 - L.x0) * q; e.y = L.y0 + (L.y1 - L.y0) * q; e.jump = Math.sin(Math.PI * q) * 150;
      if (q >= 1) { e.leap = null; e.jump = 0; NET.collide(e); }
    }
    if (a.t >= a.dur) e.act = null;
    return;
  }
  if (!tg) return;
  const ang = Math.atan2(tg.y - e.y, tg.x - e.x) * 180 / Math.PI;
  if (Math.abs(((ang - (e.row * 45 + 90) + 540) % 360) - 180) > 30) e.row = runRow(tg.x - e.x, tg.y - e.y);
  const k = e.k, d = bd, sp = e.speed * sk;
  let dx = tg.x - e.x, dy = (tg.y - e.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  const want = k.rng ? k.want : e.boss ? 105 : k.reach - 10;
  e.moving = d > want;
  if (e.moving) { e.x += dx * sp * DT; e.y += dy * sp * YK * DT; NET.collide(e); }
  if (k.mel && d < k.reach + 12 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    act(e, 0.5, 0.55, t => { if (t && alive(t) && gdist(t, e) < k.reach + 34) hurt(r, t, rnd(k.dmg[0], k.dmg[1]) * e.dm, e); });
  }
  if (k.rng && !(e.silT > 0) && d < k.want + 40 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    act(e, 0.55, 0.5, t => {
      if (!t) return;
      let ax = t.x - e.x, ay = (t.y - e.y) / YK; const mm = Math.hypot(ax, ay) || 1;
      shoot(r, e, k.bolt ? 'bolt' : 'fire', ax / mm, ay / mm, null, rnd(k.dmg[0], k.dmg[1]) * e.dm, k.shot, k.want + 150);
    });
  }
  if (e.boss && !(e.silT > 0)) {
    if (!e.rage && e.hp < e.max * 0.4) { e.rage = true; e.speed *= 1.35; ev(r, EV.SAY, e.id, 2); }
    const cdk = e.rage ? 0.65 : 1;
    if (e.summonCd <= 0 && r.ents.size < 18) {
      e.summonCd = 17 * cdk;
      act(e, 1.2, 0.55, () => { for (let i = 0; i < 3; i++) { const a = rnd(0, 6.283); spawnEnemy(r, 'min', e.x + Math.cos(a) * 110, e.y + Math.sin(a) * 110 * YK); } ev(r, EV.SAY, e.id, 3); }, true);
    } else if (e.quakeCd <= 0) {
      e.quakeCd = 12 * cdk;
      act(e, 1.3, 0.25, t => { if (t) tele(r, t.x, t.y, 290, 1.6, 120 * e.dm, true); }, true);
    } else if (d > 300 && d < 900 && e.leapCd <= 0) {
      e.leapCd = 8 * cdk;
      tele(r, tg.x, tg.y, 175, 0.95, 70 * e.dm);
      e.leap = { x0: e.x, y0: e.y, x1: tg.x, y1: tg.y, t: 0, dur: 0.95 };
      act(e, 1.0, 2, () => {});
    } else if (d < 150 && e.slamCd <= 0) {
      e.slamCd = 2.6 * cdk;
      tele(r, e.x, e.y, 155, 0.75, 55 * e.dm);
      act(e, 1.0, 2, () => {});
    }
  }
}

// ---------- тик комнаты ----------
function step(r) {
  r.tick++;
  const players = [...r.ents.values()].filter(e => e.player);
  for (const p of players) {
    // ввод: каждый принятый пакет — один тик движения клиента; не больше 4 за тик сервера (защита от ускорения)
    let n = 0;
    while (p.inputs.length && n < 4) {
      const inp = p.inputs.shift(); n++;
      p.seq = inp.seq;
      if (alive(p)) {
        const sp = p.spdNow;
        NET.move(p, inp.ax, inp.ay, sp);
        if (p.moving) p.row = runRow(p.face.x, p.face.y);
      }
      const pressed = inp.btn & ~p.btn;
      p.btn = inp.btn;
      if (pressed & NET.B_Q) cast(r, p, 'q');
      if (pressed & NET.B_E) cast(r, p, 'e');
      if (pressed & NET.B_F) cast(r, p, 'f');
      if (pressed & NET.B_R) cast(r, p, 'r');
      if ((pressed & NET.B_WAVE) && r.mode === 'coop' && r.phase === 0) spawnWave(r);
    }
    for (const k in p.cd) if (p.cd[k] > 0) p.cd[k] = Math.max(0, p.cd[k] - DT);
    // скорость, с которой герой идёт сейчас (её же получает клиент для предсказания)
    p.spdNow = p.root > 0 || p.kb || !alive(p) ? 0 : Math.round((p.ult > 0 ? 0.55 : 1) * (p.slowT > 0 ? p.slowK : 1) * p.spdMul * 100) / 100;
    p.atkCd -= DT; p.castT -= DT; p.atkT -= DT;
    if (p.slowT > 0) p.slowT -= DT;
    if (p.silT > 0) p.silT -= DT;
    if (p.root > 0) p.root -= DT;
    if (p.kb) { const q = Math.min(DT, p.kb.t); p.x += p.kb.vx * q; p.y += p.kb.vy * q; p.kb.t -= DT; NET.collide(p); p.x = NET.qpos(p.x); p.y = NET.qpos(p.y); if (p.kb.t <= 0) p.kb = null; }
    if (p.shieldT > 0) { p.shieldT -= DT; if (p.shieldT <= 0) p.shield = 0; }
    if (p.focus > 0) { p.focusT -= DT; if (p.focusT <= 0) { p.focus--; p.focusT = 0.5; } }
    if (p.dead > 0) {
      p.dead -= DT;
      if (p.dead <= 0) { const s = spawnPoint(r, p.team); p.dead = 0; p.x = NET.qpos(s.x); p.y = NET.qpos(s.y); p.hp = p.max; p.mp = p.maxMp; ev(r, EV.SAY, p.id, 4); }
      continue;
    }
    p.hp = Math.min(p.max, p.hp + 5 * DT);
    p.mp = Math.min(p.maxMp, p.mp + p.mpRegen * (r.mode === 'coop' && r.phase === 0 ? 3 : 1) * DT);
    if ((p.btn & NET.B_ATK) && p.atkCd <= 0) attack(r, p);
    if (p.ult > 0) {
      p.ult -= DT; p.ultTick -= DT;
      while (p.ultTick <= 0) { p.ultTick += 0.11; const a = rnd(0, 6.283), rr = rnd(90, 400); shard(r, p, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * YK, 100, 60 * p.ultMul, 0.4, 2); }
    }
  }
  for (const e of r.ents.values()) if (!e.player && alive(e)) updateEnemy(r, e);
  // враги не слипаются
  const en = [...r.ents.values()].filter(e => !e.player && alive(e));
  for (let i = 0; i < en.length; i++) for (let j = i + 1; j < en.length; j++) {
    const a = en[i], b = en[j]; let dx = b.x - a.x, dy = (b.y - a.y) / YK; const d = Math.hypot(dx, dy) || 0.01, need = a.rad + b.rad;
    if (d < need) { const q = (need - d) / 2 / d; a.x -= dx * q; a.y -= dy * q * YK; b.x += dx * q; b.y += dy * q * YK; }
  }
  for (const s of r.shots) stepShot(r, s);
  r.shots = r.shots.filter(s => s.left > 0);
  for (const z of r.zones) {
    z.t -= DT;
    if (z.tele) {
      if (z.t <= 0) { for (const p of r.ents.values()) if (p.player && alive(p) && gdist(z, p) < z.R) hurt(r, p, z.dmg, null); ev(r, EV.QUAKE, z.x, z.y, z.R); }
      continue;
    }
    z.tick -= DT;
    while (z.tick <= 0) { z.tick += 0.13; const a = rnd(0, 6.283), rr = Math.sqrt(Math.random()) * z.R; shard(r, z.owner, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * YK, 80, 24 * z.mul, 0.65, 1); }
  }
  r.zones = r.zones.filter(z => z.t > 0);
  for (const s of r.shards) {
    s.t -= DT;
    if (s.t > 0) continue;
    if (alive(s.owner) || s.owner.player) for (const e of targetsOf(r, s.owner)) if (gdist(s, e) < s.R + (e.rad || 22)) { hurt(r, e, s.dmg, s.owner, 1); slow(e, s.sk, s.st); }
  }
  r.shards = r.shards.filter(s => s.t > 0);
  // погибшие враги исчезают через 2,2 с (клиент успевает показать падение)
  for (const e of [...r.ents.values()]) if (!e.player && e.hp <= 0) { e.dieT += DT; if (e.dieT > 2.2) r.ents.delete(e.id); }
  if (r.mode === 'coop' && r.phase === 1 && ![...r.ents.values()].some(e => !e.player && e.hp > 0)) {
    r.phase = 0; ev(r, EV.WAVE_END, r.wave, 20 + 6 * r.wave);
  }
  recordHistory(r);
  // рассылка: флаги и доп. поле, затем снимок каждому клиенту (дельта к тому, что он уже знает) и события
  for (const e of r.ents.values()) {
    e.flags = (e.dead > 0 || e.hp <= 0 ? NET.F_DEAD : 0) | (e.root > 0 ? NET.F_ROOT : 0) | (e.silT > 0 ? NET.F_SIL : 0) | (e.slowT > 0 ? NET.F_SLOW : 0) |
      (e.shieldT > 0 ? NET.F_SHIELD : 0) | ((e.castT > 0 || (e.act && e.act.cast)) ? NET.F_CAST : 0) | ((e.atkT > 0 || (e.act && !e.act.cast)) ? NET.F_ATK : 0) | (e.rage ? NET.F_RAGE : 0);
    e.ex = e.player ? (e.focus & 15) | ((e.kills & 255) << 8) | (e.ult > 0 ? 16 : 0) | (e.moving ? 32 : 0) | (e.running ? 64 : 0) : Math.round(e.jump || 0) | (e.moving ? 1024 : 0);
  }
  const ents = [...r.ents.values()];
  const evBuf = r.events.length ? NET.encEvents(r.events) : null;
  r.events = [];
  for (const c of r.clients) {
    const p = c.player;
    send(c, NET.encSnap(r.tick, p ? p.seq : 0, r.wave, r.phase, ents, c.base));
    if (evBuf) send(c, evBuf);
  }
}

// ---------- сеть ----------
function send(c, data) {
  if (c.ws.readyState !== 1) return;
  if (!LAG && !JITTER) return c.ws.send(data);
  const at = Math.max(c.outAt || 0, Date.now() + LAG + Math.random() * JITTER);   // порядок пакетов сохраняется, как в TCP
  c.outAt = at;
  setTimeout(() => { if (c.ws.readyState === 1) c.ws.send(data); }, at - Date.now());
}
function onMessage(c, data, isBin) {
  if (!isBin) {
    let m; try { m = JSON.parse(data.toString()); } catch (e) { return; }
    if (m.t === 'join') {
      leave(c);
      const mode = m.mode === 'duel' ? 'duel' : 'coop';
      let r = m.room ? rooms.get(String(m.room)) : null;
      if (r && (r.mode !== mode || r.clients.size >= r.max)) return c.ws.send(JSON.stringify({ t: 'error', msg: r.mode !== mode ? 'комната другого режима' : 'комната заполнена' }));
      if (!r && !m.room) r = [...rooms.values()].find(x => x.mode === mode && x.clients.size < x.max && !x.private);
      if (!r) { r = makeRoom(mode, m.room ? String(m.room) : null); r.private = !!m.room; }
      const p = addPlayer(r, c, m.hero, m.prog);
      p.name = String(m.name || 'Игрок').slice(0, 16);
      c.room = r; c.player = p; c.base = new Map(); r.clients.add(c);
      c.ws.send(JSON.stringify({ t: 'joined', id: p.id, room: r.code, mode, team: p.team, tick: r.tick, rate: TICK,
        players: [...r.clients].map(x => ({ id: x.player.id, name: x.player.name, hero: x.player.kind })) }));
      for (const x of r.clients) if (x !== c) x.ws.send(JSON.stringify({ t: 'peer', id: p.id, name: p.name, hero: p.kind }));
      log('join', r.code, mode, p.name, p.kind, 'игроков', r.clients.size);
    } else if (m.t === 'prog' && c.player) {
      c.player.prog = cleanProg(m.prog || {}); heroStats(c.player);
    }
    return;
  }
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength), t = v.getUint8(0);
  if (t === NET.C_INPUT && c.player && data.byteLength >= 6) {
    if (c.player.inputs.length < 30) c.player.inputs.push({ seq: v.getUint16(1), ax: v.getInt8(3), ay: v.getInt8(4), btn: v.getUint8(5) });
  } else if (t === NET.C_PING && data.byteLength >= 9) {
    // клиент сообщает свой пинг в следующем пакете; сервер просто отражает время
    const b = new ArrayBuffer(9), o = new DataView(b); o.setUint8(0, NET.S_PONG); o.setFloat64(1, v.getFloat64(1)); send(c, b);
  } else if (t === 3 && c.player && data.byteLength >= 3) {
    c.player.rtt = v.getUint16(1);     // пинг клиента, мс — для компенсации лага
    if (data.byteLength >= 5) c.player.interp = v.getUint16(3);   // на сколько мс в прошлом клиент показывает чужих
  }
}
function leave(c) {
  const r = c.room;
  if (!r) return;
  r.clients.delete(c); if (c.player) r.ents.delete(c.player.id);
  for (const x of r.clients) x.ws.send(JSON.stringify({ t: 'left', id: c.player && c.player.id }));
  c.room = null; c.player = null;
  if (!r.clients.size) rooms.delete(r.code);
}
function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }

// TLS: при TLS_CERT и TLS_KEY сервер работает как wss:// (сайт и APK открыты по https и к ws:// подключаться не могут).
// Новый сертификат подхватывается на лету: файл перечитывается раз в час, перезапуск не нужен.
let httpServer = null;
if (process.env.TLS_CERT && process.env.TLS_KEY) {
  const https = require('https');
  const ctx = () => ({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) });
  httpServer = https.createServer(ctx(), (req, res) => { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); res.end('Duel Arena game server: ok'); });
  let stamp = 0;
  setInterval(() => {
    try { const m = fs.statSync(process.env.TLS_CERT).mtimeMs; if (stamp && m !== stamp) { httpServer.setSecureContext(ctx()); log('сертификат обновлён'); } stamp = m; } catch (e) {}
  }, 3600e3);
  httpServer.listen(PORT);
}
const wss = httpServer ? new WebSocketServer({ server: httpServer, perMessageDeflate: false, maxPayload: 4096 })
  : new WebSocketServer({ port: PORT, perMessageDeflate: false, maxPayload: 4096 });
wss.on('connection', ws => {
  const c = { ws, room: null, player: null };
  ws.binaryType = 'nodebuffer';
  ws.on('message', (data, isBin) => {
    if (!LAG && !JITTER) return onMessage(c, data, isBin);
    const at = Math.max(c.inAt || 0, Date.now() + LAG + Math.random() * JITTER); c.inAt = at;
    setTimeout(() => onMessage(c, data, isBin), at - Date.now());
  });
  ws.on('close', () => leave(c));
  ws.on('error', () => leave(c));
});
// фиксированный тик: накапливаем время и делаем столько шагов, сколько прошло (без дрейфа)
let last = process.hrtime.bigint(), acc = 0;
setInterval(() => {
  const now = process.hrtime.bigint(); acc += Number(now - last) / 1e9; last = now;
  let n = 0;
  while (acc >= DT && n < 5) { for (const r of rooms.values()) step(r); acc -= DT; n++; }
  if (acc > 0.5) acc = 0;
}, 5);
log('Duel Arena server: порт', PORT, httpServer ? 'wss' : 'ws', LAG || JITTER ? 'искусственная задержка ' + LAG + '±' + JITTER + ' мс' : '');
