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
// только для проверки: TEST_WAVE — с какой волны начинает новая комната, TEST_HP — множитель здоровья врагов
const TEST_WAVE = +(process.env.TEST_WAVE || 0), TEST_HP = +(process.env.TEST_HP || 1);

// ---------- карта из data.js (та же, что у игры) ----------
const box = { location: { port: '', pathname: '/' }, localStorage: { getItem: () => null, setItem() {} }, console };
vm.createContext(box);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8') +
  '\n;this.D = { WALK, DEFAULT_OBJ, HERO_SPAWN, ENEMY_SPAWN, SPAWNS, WORLDS, AK, BAL };', box);
const D = box.D, BAL = D.BAL;
// виды врагов и кто выходит в каком мире — та же таблица, что в одиночной игре (combat.js), без копии
const CS = fs.readFileSync(path.join(__dirname, '..', 'combat.js'), 'utf8');
vm.runInContext(CS.slice(CS.indexOf('const KIND = {'), CS.indexOf('const rosterOf')) + '\n;this.K = { KIND, ROSTER };', box);
const KIND = box.K.KIND, ROSTER = box.K.ROSTER;
const XP0 = { min: 8, war: 18, mag: 14, rog: 14, boss: 150 };
const { TICK, DT, YK, EV } = NET;
// ---------- карты миров (data.js WORLDS; мир 1 — арена по умолчанию) ----------
const A = D.AK;
const MAPS = [null];
for (let m = 1; m <= D.WORLDS.length; m++) {
  const w = D.WORLDS[m - 1];
  const M = !w.walk
    ? { walk: D.WALK, solid: NET.solidsOf(D.DEFAULT_OBJ), hero: D.HERO_SPAWN, portal: D.ENEMY_SPAWN, spawns: D.SPAWNS, W: 1536 * A, H: 1024 * A }
    : { walk: w.walk.map(p => [p[0] * A, p[1] * A]), solid: w.solid.map(c => ({ x: c[0] * A, y: c[1] * A, rx: c[2] * A, ry: c[3] * A })),
      hero: { x: w.hero[0] * A, y: w.hero[1] * A }, portal: { x: w.portal[0] * A, y: w.portal[1] * A },
      spawns: w.spawns.map(s => ({ x: s[0] * A, y: s[1] * A, w: s[2] })), W: (w.size ? w.size[0] : 1536) * A, H: (w.size ? w.size[1] : 1024) * A };
  M.nav = buildNav(M);
  MAPS.push(M);
}
NET.useMap(MAPS[1].walk, MAPS[1].solid);
// сетка проходимости для обхода препятствий (как NAV в worlds.js)
function buildNav(M) {
  const S = 56, w = Math.ceil(M.W / S), h = Math.ceil(M.H / S), ok = new Uint8Array(w * h);
  NET.useMap(M.walk, M.solid);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = (i + 0.5) * S, y = (j + 0.5) * S;
    ok[j * w + i] = NET.inWalk(x, y) && !M.solid.some(o => ((x - o.x) / (o.rx + 22)) ** 2 + ((y - o.y) / (o.ry + 17)) ** 2 < 1) ? 1 : 0;
  }
  return { S, w, h, ok };
}
const rnd = (a, b) => a + Math.random() * (b - a);
const gdist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) / YK);

// ---------- герои ----------
const HERO = {
  mage: { hp: 600, range: 600, cd: { q: 6, e: 9, f: 12, r: 28 }, mana: { q: 60, e: 50, f: 80, r: 150 }, atkCd: 0.62 },
  archer: { hp: 520, range: 720, cd: { q: 9, e: 6, f: 15, r: 0 }, mana: { q: 70, e: 60, f: 90, r: 0 }, atkCd: 0.6 },
};
const PVP_DMG = 0.5;   // в дуэли урон по герою вдвое меньше, чтобы бой не кончался за секунды
const SHOT_KIND = { ice: 1, arrow: 2, fire: 3, bolt: 4 };
const SKILL = { nova: 1, chains: 2, hail: 3, storm: 4, gust: 5, shield: 6, volley: 7 };

function runRow(ax, ay) { const deg = Math.atan2(ay, ax) * 180 / Math.PI; return ((Math.round((deg - 90) / 45) % 8) + 8) % 8; }

// ---------- комнаты ----------
const rooms = new Map();
let nextRoom = 1;
function makeRoom(mode, code) {
  const r = { code: code || String(1000 + (nextRoom++ % 9000)), mode, max: mode === 'duel' ? 2 : 4, clients: new Set(), ents: new Map(),
    shots: [], zones: [], shards: [], tick: 0, wave: TEST_WAVE, phase: 0, nextId: 1, hist: [], events: [],
    world: 1, map: MAPS[1], pzones: [], orbs: [], queue: [], relT: 0, nextT: 0, endW: 0, roundFrom: 0, worldT: 0, dist: null, distT: 0, duelT: 0 };
  if (mode === 'coop' && TEST_WAVE) { r.world = BAL.at(TEST_WAVE + 1).M; r.map = MAPS[r.world]; }
  rooms.set(r.code, r);
  return r;
}
const newId = r => { r.nextId = (r.nextId % 60000) + 1; return r.nextId; };
const ev = (r, ...e) => r.events.push(e);
const hostile = (a, b) => a.team !== b.team;
const alive = e => e.hp > 0 && !(e.dead > 0);

// ---------- герой игрока ----------
// характеристики: уровень, очки и предметы сумки (it — сумма предметов и действующие фласки, как SHOP.recompute)
function heroStats(p) {
  const s = p.prog, st = s.st, h = HERO[p.kind], it = s.it;
  p.dmgMul = (1 + it.dmg) * (it.pow ? 1.5 : 1) * (1 + 0.015 * (s.lvl - 1)) * (1 + 0.006 * st.str);
  p.spdMul = (1 + it.spd) * (it.swift ? 1.45 : 1) * (1 + 0.006 * st.agi);
  p.atkSpd = (1 + 0.015 * st.agi) * (1 + Math.min(0.6, it.as)); p.skMul = (1 + 0.015 * st.int) * (1 + it.sk);
  p.mpRegen = 11 + 0.35 * st.int + it.mpr; p.hpReg = 5 + it.hpr;
  p.ls = it.ls; p.crit = Math.min(0.4, it.crit); p.cdMul = 1 - Math.min(0.45, it.cd); p.armMul = 1 - Math.min(0.6, it.arm);
  const mh = h.hp + it.hp + 10 * (s.lvl - 1) + 8 * st.str, mm = 420 + 12 * st.int + it.mp;
  if (p.max && mh > p.max) p.hp += mh - p.max;
  if (p.maxMp && mm > p.maxMp) p.mp += mm - p.maxMp;
  p.max = mh; p.maxMp = mm; p.hp = Math.min(p.hp == null ? mh : p.hp, mh); p.mp = Math.min(p.mp == null ? mm : p.mp, mm);
}
const skLv = (p, id) => p.prog.sk[id] || 1;
const skDmg = (p, id) => (1 + 0.12 * (skLv(p, id) - 1)) * p.skMul;
const skCd = (p, id) => 1 - 0.03 * (skLv(p, id) - 1);
function cleanProg(m) {
  const n = (v, lo, hi, d) => (typeof v === 'number' && v >= lo && v <= hi ? Math.floor(v) : d);
  const st = m.st || {}, sk = m.sk || {};
  const it = m.it || {}, f = (v, hi) => (typeof v === 'number' && v >= 0 ? Math.min(v, hi) : 0);
  return { lvl: n(m.lvl, 1, 100, 1), st: { str: n(st.str, 0, 300, 0), agi: n(st.agi, 0, 300, 0), int: n(st.int, 0, 300, 0) },
    sk: { q: n(sk.q, 1, 10, 1), e: n(sk.e, 1, 10, 1), f: n(sk.f, 1, 10, 1), r: n(sk.r, 1, 10, 1) },
    // предметы: значения ограничены сверху (6 ячеек сумки), чтобы чужой клиент не прислал бессмертие
    it: { dmg: f(it.dmg, 2), hp: f(it.hp, 2500), mp: f(it.mp, 1500), as: f(it.as, 1), spd: f(it.spd, 0.6), hpr: f(it.hpr, 40), mpr: f(it.mpr, 30),
      arm: f(it.arm, 0.8), sk: f(it.sk, 2), cd: f(it.cd, 0.6), ls: f(it.ls, 0.4), crit: f(it.crit, 0.6), pow: it.pow ? 1 : 0, swift: it.swift ? 1 : 0 } };
}
function spawnPoint(r, team) {
  const s = r.mode === 'duel' && team === 2 ? r.map.portal : r.map.hero;
  NET.useMap(r.map.walk, r.map.solid);
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
  if (src && src.player) { dmg *= src.dmgMul; if (src.crit && Math.random() < src.crit) { dmg *= 2; col = 3; } }
  if (e.player && src && src.player) dmg *= PVP_DMG;
  if (e.player) dmg *= e.armMul || 1;
  if (!e.player && e.arm > 0) dmg *= 0.35;    // коп-зомби под бронёй
  // зомби иногда встаёт после смерти (один раз)
  if (!e.player && e.k.rise && !e.risen && e.hp - dmg <= 0 && Math.random() < e.k.rise) { e.risen = true; e.hp = Math.round(e.max * 0.35); say(r, e, 12); return; }
  const hp0 = e.hp;
  if (e.shieldT > 0 && e.shield > 0) {
    const a = Math.min(e.shield, dmg); e.shield -= a; dmg -= a;
    if (e.shield <= 0) { e.shieldT = 0; ev(r, EV.SAY, e.id, 1); }
    if (dmg <= 0) return;
  }
  e.hp -= dmg;
  ev(r, EV.DMG, e.id, dmg, col || 0);
  const dealt = hp0 - Math.max(0, e.hp);
  if (src && src.player && src.ls && alive(src)) src.hp = Math.min(src.max, src.hp + dealt * src.ls);   // вампиризм от предметов
  if (e.player && src && !src.player) {
    if (src.k.steal && alive(src)) src.hp = Math.min(src.max, src.hp + dealt * src.k.steal);
  }
  if (e.hp <= 0) {
    e.hp = 0;
    ev(r, EV.DIE, e.id, src ? src.id : 0);
    if (e.player) {
      e.dead = 3; e.ult = 0; e.focus = 0; e.shield = 0; e.shieldT = 0;
      if (src && src.player) { src.kills++; ev(r, EV.LVL, 80 + 10 * src.prog.lvl, src.id); }   // дуэль: опыт победителю
    } else {
      e.dieT = 0;
      // опыт за врага — всем игрокам комнаты (общий опыт в кооперативе), растёт с волной
      const xp = Math.round((e.k.xp || XP0[e.kind] || 8) * BAL.xp(r.wave) * (e.elite ? BAL.ELITE.xp : 1));
      ev(r, EV.LVL, xp, 0);
    }
  }
}
const say = (r, e, i) => ev(r, EV.SAY, e.id, 10 + i);
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
      if (s.slowHit && e.player) { slow(e, s.slowHit, s.slowHit > 0.7 ? 1.2 : 1.8); if (s.slowHit < 0.7) ev(r, EV.SAY, e.id, 10 + 13); }
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
  p.cd[id] = h.cd[id] * skCd(p, id) * (p.cdMul || 1); p.mp -= h.mana[id]; p.castT = 0.5;
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
// Как в одиночной игре: рост по BAL, элита и боссы миров, раунды по 3 волны, 10-я — босс мира, затем следующий мир.
const nPlayers = r => Math.max(1, [...r.clients].length);
function spawnEnemy(r, type, x, y) {
  const k = KIND[type], np = nPlayers(r);
  const e = { id: newId(r), kind: type, team: 2, k, boss: !!k.boss, elite: !!k.elite, x: x != null ? x : r.map.portal.x + rnd(-90, 90), y: y != null ? y : r.map.portal.y + rnd(-30, 90),
    hp: Math.round(k.hp * BAL.hp(r.wave) * (1 + 0.35 * (np - 1)) * TEST_HP), dm: BAL.dmg(r.wave), rad: k.rad * (k.sz || 1), speed: k.speed * BAL.speed(r.wave), row: 2,
    slowT: 0, slowK: 1, root: 0, silT: 0, atkCd: rnd(0.3, 1.2), slamCd: 2, quakeCd: 7, leapCd: 4, summonCd: 9, jump: 0, act: null,
    mt: rnd(1.5, 4), mt2: 0, mt3: 0, phase: 1 };
  if (k.boss && type !== 'boss') { e.hp = Math.round(e.hp * BAL.bossHp(r.wave)); e.dm *= BAL.bossDmg(r.wave); }
  if (e.elite) { e.hp = Math.round(e.hp * BAL.ELITE.hp); e.dm *= BAL.ELITE.dmg; e.rad *= BAL.ELITE.size; }
  e.max = e.hp; NET.collide(e);
  r.ents.set(e.id, e);
  return e;
}
const roundEnd = n => { const W = BAL.at(n).W; return W >= 10 ? n : n + 2 - (W - 1) % 3; };
const aliveFoes = r => { let n = 0; for (const e of r.ents.values()) if (!e.player && e.hp > 0) n++; return n; };
function startRound(r) { r.endW = roundEnd(r.wave + 1); r.roundFrom = r.wave + 1; r.phase = 1; nextWave(r); }
function nextWave(r) {
  r.wave++; r.nextT = 0; r.relT = 0.4;
  const a = BAL.at(r.wave), R = ROSTER[a.M] || ROSTER[1], q = [];
  r.fin = a.W === 10 && R.final ? R.final : null; r.finT = 0;     // финальный босс после босса мира
  if (a.W === 10) q.push(R.boss);
  else {
    const n = Math.round(BAL.count(r.wave) * (1 + 0.5 * (nPlayers(r) - 1))), nr = Math.round(n * 0.25);
    for (let i = 0; i < n - nr; i++) q.push(R.mel[(r.wave === 1 && i < 6 ? 0 : i) % R.mel.length]);
    for (let i = 0; i < nr; i++) q.push(R.rng[i % R.rng.length]);
    for (let i = q.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [q[i], q[j]] = [q[j], q[i]]; }
    for (let i = 0; i < BAL.elites(r.wave); i++) q.splice(Math.floor(q.length * (0.55 + 0.3 * i)), 0, R.elite[(i + r.wave) % R.elite.length]);
    if (a.W === 5 && R.mini) q.splice(Math.floor(q.length * 0.6), 0, R.mini);
  }
  r.queue = q;
  ev(r, EV.WAVE_START, r.wave, a.W === 10 ? 1 : 0, r.wave === r.endW ? 1 : 0);
}
function pickSpawn(r) {
  const L = r.map.spawns; let s = 0; for (const p of L) s += p.w;
  let x = Math.random() * s;
  for (const p of L) { x -= p.w; if (x <= 0) return p; }
  return L[0];
}
// выпуск врагов группами из входов карты, переход к следующей волне, конец раунда и смена мира
function runRound(r) {
  if (r.phase !== 1) return;
  const alive = aliveFoes(r);
  if (r.queue.length) {
    r.relT -= DT;
    if (r.relT <= 0 && alive < 16 + 4 * (nPlayers(r) - 1)) {
      const sp = pickSpawn(r), n = Math.min(r.queue.length, 1 + Math.floor(Math.random() * 3));
      for (let i = 0; i < n; i++) spawnEnemy(r, r.queue.shift(), sp.x + rnd(-70, 70), sp.y + rnd(-40, 40));
      r.relT = rnd(0.9, 1.8) * (alive > 10 ? 1.4 : 1);
    }
  } else if (r.wave < r.endW) {
    if (alive <= 3 && (r.nextT += DT) > 2.2) nextWave(r);
  } else if (!alive && r.fin) {
    if ((r.finT += DT) > 2.5) { r.queue.push(r.fin); r.fin = null; r.relT = 0.3; }
  } else if (!alive) {
    let gold = 0; for (let n = r.roundFrom; n <= r.wave; n++) gold += BAL.waveGold(n);
    r.phase = 0; ev(r, EV.WAVE_END, r.wave, Math.round(gold), BAL.at(r.wave).W === 10 ? 1 : 0);
    if (BAL.at(r.wave).W === 10) r.worldT = 3.2;    // мир пройден: через 3 с — следующий
  }
}
function setWorld(r, m) {
  r.world = m; r.map = MAPS[m]; r.dist = null;
  r.shots = []; r.zones = []; r.shards = []; r.pzones = []; r.orbs = [];
  for (const p of r.ents.values()) if (p.player) { const s = spawnPoint(r, p.team); p.x = NET.qpos(s.x); p.y = NET.qpos(s.y); p.kb = null; }
  const a = BAL.at(r.wave + 1);
  ev(r, EV.WORLD, m, a.C);
}

// ---------- обход препятствий: расстояния по сетке от ближайшего героя ----------
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function navCell(N, x, y) { return Math.max(0, Math.min(N.h - 1, Math.floor(y / N.S))) * N.w + Math.max(0, Math.min(N.w - 1, Math.floor(x / N.S))); }
function navNear(N, c) {
  if (N.ok[c]) return c;
  const ci = c % N.w, cj = (c / N.w) | 0;
  for (let k = 1; k < 4; k++) for (let j = cj - k; j <= cj + k; j++) for (let i = ci - k; i <= ci + k; i++)
    if (i >= 0 && j >= 0 && i < N.w && j < N.h && N.ok[j * N.w + i]) return j * N.w + i;
  return c;
}
function navField(r) {
  const N = r.map.nav;
  if ((r.distT -= DT) > 0 && r.dist) return;
  r.distT = 0.3;
  if (!r.dist || r.dist.length !== N.ok.length) r.dist = new Int32Array(N.ok.length);
  const d = r.dist, q = new Int32Array(N.ok.length); let qh = 0, qt = 0;
  d.fill(1e9);
  for (const p of r.ents.values()) if (p.player && alive(p)) { const c = navNear(N, navCell(N, p.x, p.y)); if (d[c]) { d[c] = 0; q[qt++] = c; } }
  while (qh < qt) {
    const c = q[qh++], ci = c % N.w, cj = (c / N.w) | 0, nd = d[c] + 1;
    for (let k = 0; k < 8; k++) {
      const i = ci + NB[k][0], j = cj + NB[k][1];
      if (i < 0 || j < 0 || i >= N.w || j >= N.h) continue;
      const n = j * N.w + i;
      if (!N.ok[n] || d[n] <= nd) continue;
      if (k >= 4 && (!N.ok[cj * N.w + i] || !N.ok[j * N.w + ci])) continue;
      d[n] = nd; q[qt++] = n;
    }
  }
}
function navDir(r, e, tg) {
  const N = r.map.nav;
  if ((e.navT = (e.navT || 0) - DT) > 0) return e.navV;
  e.navT = 0.2; e.navV = null;
  const L = Math.hypot(tg.x - e.x, tg.y - e.y), n = Math.ceil(L / (N.S * 0.5));
  let clear = true;
  for (let k = 1; k < n && clear; k++) if (!N.ok[navCell(N, e.x + (tg.x - e.x) * k / n, e.y + (tg.y - e.y) * k / n)]) clear = false;
  if (clear || !r.dist) return null;
  let c = navNear(N, navCell(N, e.x, e.y));
  for (let s = 0; s < 3; s++) {
    const ci = c % N.w, cj = (c / N.w) | 0; let best = c;
    for (const [a, b] of NB) { const i = ci + a, j = cj + b; if (i >= 0 && j >= 0 && i < N.w && j < N.h && r.dist[j * N.w + i] < r.dist[best]) best = j * N.w + i; }
    if (best === c) break; c = best;
  }
  if (r.dist[c] >= 1e9) return null;
  const dx = ((c % N.w) + 0.5) * N.S - e.x, dy = ((((c / N.w) | 0) + 0.5) * N.S - e.y) / YK, m = Math.hypot(dx, dy);
  if (m < 1) return null;
  e.navV = [dx / m, dy / m]; return e.navV;
}

function act(e, dur, at, fn, cast) { e.act = { dur, at, fn, t: 0, hit: false, cast: !!cast }; }
// предупреждение на земле: через dur по кругу R бьёт dmg (o.slow — ещё и замедляет)
function tele(r, x, y, R, dur, dmg, big, o) { r.zones.push(Object.assign({ tele: true, x, y, R, t: dur, dmg, big }, o)); ev(r, EV.TELE, x, y, R, dur * 100, big ? 1 : 0); }
const dirTo = (e, x, y) => { const dx = x - e.x, dy = (y - e.y) / YK, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m, m]; };
function moveBy(e, dx, dy, sp) { e.x += dx * sp * DT; e.y += dy * sp * YK * DT; NET.collide(e); e.moving = true; }
function leapTo(r, e, x, y, dur, R, dmg) { tele(r, x, y, R, dur, dmg); e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, dur }; act(e, dur + 0.05, 2, () => {}, true); }
function raise(r, e, n, type) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, 6.283), m = spawnEnemy(r, type || (ROSTER[r.world] || ROSTER[1]).mel[0], e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90 * YK);
    ev(r, EV.QUAKE, m.x, m.y, 50);
  }
}
function fireball(r, e, dx, dy, dmg, sp) { shoot(r, e, 'fire', dx, dy, null, dmg, sp || 480, 900); }
// приёмы видов (enemies.js MECH): вернуть true — обычное поведение в этом тике пропускается
const MECH = {
  scarecrow(r, e, d) {
    if (!e.act && e.mt <= 0 && d < 150) { e.mt = 5; tele(r, e.x, e.y, 135, 0.6, 24 * e.dm); act(e, 0.7, 2, () => {}); return true; }
  },
  autumnbear(r, e, d, tg) {
    if (!e.act && e.mt <= 0 && d < 220) {
      e.mt = 6; const [dx, dy] = dirTo(e, tg.x, tg.y);
      tele(r, e.x + dx * 85, e.y + dy * 85 * YK, 120, 0.8, 32 * e.dm); act(e, 0.9, 2, () => {}); return true;
    }
  },
  bogghoul(r, e, d, tg) {
    if (e.dash > 0) { e.dash -= DT; const [dx, dy] = dirTo(e, tg.x, tg.y); moveBy(e, dx, dy, e.speed * 2.4); return true; }
    if (!e.act && e.mt <= 0 && d > 150 && d < 360) { e.dash = 0.45; e.mt = 4.5; }
  },
  drownedknight(r, e, d, tg) {
    if (!e.act && e.mt <= 0 && d < 230) {
      e.mt = 6.5; const [dx, dy] = dirTo(e, tg.x, tg.y);
      tele(r, e.x + dx * 95, e.y + dy * 95 * YK, 115, 0.85, 34 * e.dm); act(e, 0.95, 2, () => {}); return true;
    }
  },
  salamander(r, e) { if (e.mt <= 0) { e.mt = 7; e.arm = 2.5; } },
  hollowarcher(r, e, d, tg) {
    if (!e.act && d < 230) { const [dx, dy] = dirTo(e, tg.x, tg.y); moveBy(e, -dx, -dy, e.speed * (e.slowT > 0 ? e.slowK : 1)); return true; }
  },
  shadowwolf(r, e, d, tg) {
    if (!e.act && e.mt <= 0 && d > 170 && d < 420) { e.mt = 5; leapTo(r, e, tg.x, tg.y, 0.55, 80, 16 * e.dm); return true; }
  },
  boarbrute(r, e, d) {
    if (!e.act && e.mt <= 0 && d < 210) { e.mt = 6; tele(r, e.x, e.y, 160, 0.8, 30 * e.dm); act(e, 0.9, 2, () => {}); return true; }
  },
  thornroot(r, e, d, tg) {
    if (!e.act && e.mt <= 0 && d > 140 && d < 620) {
      e.mt = 7; say(r, e, 14);
      act(e, 0.9, 0.5, () => tele(r, tg.x, tg.y, 120, 1.0, 26 * e.dm, false, { slow: 0.35 }));
      return true;
    }
  },
};
// магия боссов ChatGPT (KIND.<босс>.spells, как spellBoss в enemies.js): метка, урон, картинка эффекта у клиентов (EV.VFX)
function castSpell(r, e, s, i, tg) {
  const kid = NET.KINDS.indexOf(e.kind), dm = e.dm, o = R => ({ vfx: [kid, i], vR: R, vt: s.t || 1.2 });
  if (s.how === 'target') tele(r, tg.x, tg.y, s.R, s.warn, s.dmg * dm, false, Object.assign(o(s.R), s.eff === 'root' ? { root: s.t } : s.eff === 'poison' ? { pois: { dmg: (s.pdmg || s.dmg) * dm, tick: s.tick, t: s.t } } : {}));
  else if (s.how === 'self') tele(r, e.x, e.y, s.R, s.warn, (s.hit || 0) * dm, false, Object.assign(o(s.R), s.eff === 'poison' || s.eff === 'slow' ? { pois: { dmg: s.dmg * dm, tick: s.tick, t: s.t, slow: s.slow } } : {}));
  else if (s.how === 'multi') for (let j = 0; j < 3; j++) { const a = rnd(0, 6.283), rr = j ? rnd(90, 220) : 0; tele(r, tg.x + Math.cos(a) * rr, tg.y + Math.sin(a) * rr * YK, s.R, s.warn + j * 0.3, s.dmg * dm, false, Object.assign(o(s.R), { vt: 0.9 })); }
  else if (s.how === 'moving') {
    const [dx, dy] = dirTo(e, tg.x, tg.y), b = { x: e.x + dx * 60, y: e.y + dy * 60 * YK, dx, dy, t: 6, dmg: s.dmg * dm, R: s.R, kid, i, sp: s.sp || 330 };
    r.orbs.push(b); ev(r, EV.VFX, kid, i, b.x, b.y, s.R * 0.6, 600, dx * 1000, dy * 1000);
  }
}
function spellBoss(r, e, d, tg) {
  const S = e.k.spells;
  if (!e.scd) e.scd = S.map(s => rnd(2.5, s.cd * 0.6));
  const cdk = e.phase >= 3 ? 0.6 : e.phase >= 2 ? 0.8 : 1;
  for (let i = 0; i < S.length; i++) e.scd[i] -= DT;
  if (e.act) return;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (e.scd[i] > 0 || (s.how === 'self' ? d > s.R + 60 : d > 950)) continue;
    e.scd[i] = s.cd * cdk; say(r, e, s.ph);
    act(e, 1.0, 0.45, t => castSpell(r, e, s, i, t || tg), true);
    return true;
  }
  if (e.phase >= 3 && e.mt2 <= 0 && r.ents.size < 22) { e.mt2 = 14; act(e, 1.0, 0.5, () => raise(r, e, 2, (ROSTER[r.world] || ROSTER[1]).mel[0]), true); return true; }
}
MECH.werefox = MECH.bogghoul; MECH.magmahound = MECH.bogghoul; MECH.fireimp = MECH.shadowwolf; MECH.porcelainmaid = MECH.scarecrow; MECH.gembeetle = MECH.bogghoul; MECH.glassdancer = MECH.scarecrow;
MECH.dwarfbomber = (r, e, d, tg) => {
  if (!e.act && d < 230) return MECH.hollowarcher(r, e, d, tg);
  if (!e.act && e.mt <= 0 && d < 560) { e.mt = 6; act(e, 0.7, 0.6, () => tele(r, tg.x, tg.y, 105, 1.0, 28 * e.dm)); return true; }
};
for (const t in KIND) if (KIND[t].base && MECH[KIND[t].base]) MECH[t] = MECH[KIND[t].base];   // элита — приёмы своего злодея
function updateEnemy(r, e) {
  e.atkCd -= DT; e.slamCd -= DT; e.quakeCd -= DT; e.leapCd -= DT; e.summonCd -= DT; e.mt -= DT; e.mt2 -= DT; e.mt3 -= DT;
  if (e.arm > 0) e.arm -= DT;
  if (e.slowT > 0) e.slowT -= DT;
  if (e.silT > 0) e.silT -= DT;
  e.moving = false;
  if (e.kb) { const q = Math.min(DT, e.kb.t); e.x += e.kb.vx * q; e.y += e.kb.vy * q; e.kb.t -= DT; NET.collide(e); if (e.kb.t <= 0) e.kb = null; return; }
  if (e.root > 0) { e.root -= DT; e.act = null; if (e.leap) { e.leap = null; e.jump = 0; NET.collide(e); } if (e.dot) { e.dotAcc = (e.dotAcc || 0) + e.dot * DT; if (e.dotAcc >= 15) { hurt(r, e, e.dotAcc, e.dotSrc, 1); e.dotAcc = 0; } } return; }
  const sk = e.slowT > 0 ? e.slowK : 1;
  if (e.boss) {
    // фазы босса: ниже 60 % — новые приёмы, ниже 25 % — все сразу и чаще
    const ph = e.hp < e.max * 0.25 ? 3 : e.hp < e.max * 0.6 ? 2 : 1;
    if (ph > e.phase) { e.mt = Math.min(e.mt, 1); say(r, e, ph === 2 ? 10 : 11); e.phase = ph; }
  }
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
  const m = MECH[e.kind] || (e.k.spells && spellBoss);
  if (m && !(e.silT > 0 && !e.boss) && m(r, e, bd, tg) === true) return;
  const ang = Math.atan2(tg.y - e.y, tg.x - e.x) * 180 / Math.PI;
  if (Math.abs(((ang - (e.row * 45 + 90) + 540) % 360) - 180) > 30) e.row = runRow(tg.x - e.x, tg.y - e.y);
  const k = e.k, d = bd, sp = e.speed * sk;
  let dx = tg.x - e.x, dy = (tg.y - e.y) / YK; const mm = Math.hypot(dx, dy) || 1; dx /= mm; dy /= mm;
  const want = k.rng ? k.want : e.boss ? 105 : k.reach - 10;
  if (d > want) {
    const nv = navDir(r, e, tg), mx = nv ? nv[0] : dx, my = nv ? nv[1] : dy;
    e.x += mx * sp * DT; e.y += my * sp * YK * DT; NET.collide(e); e.moving = true;
  }
  if (k.mel && d < k.reach + 12 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    act(e, 0.5, 0.55, t => {
      if (!t || !alive(t) || gdist(t, e) >= k.reach + 34) return;
      const hd = rnd(k.dmg[0], k.dmg[1]) * e.dm; hurt(r, t, hd, e);
      if (k.leech) e.hp = Math.min(e.max, e.hp + hd * k.leech);   // Пиявец пьёт кровь
    });
  }
  if (k.rng && !(e.silT > 0) && d < k.want + 40 && e.atkCd <= 0) {
    e.atkCd = k.cd;
    act(e, 0.55, 0.5, t => {
      if (!t) return;
      let ax = t.x - e.x, ay = (t.y - e.y) / YK; const q = Math.hypot(ax, ay) || 1;
      const a0 = Math.atan2(ay / q, ax / q), nf = k.fan || 1;
      for (let i = 0; i < nf; i++) {
        const a = a0 + (i - (nf - 1) / 2) * 0.2;
        const s = shoot(r, e, k.bolt ? 'bolt' : 'fire', Math.cos(a), Math.sin(a), null, rnd(k.dmg[0], k.dmg[1]) * e.dm, k.shot, k.want + 150);
        if (k.slowShot) s.slowHit = 0.75;
      }
    });
  }
  if (e.boss && !(e.silT > 0) && !k.spells) {
    if (!e.rage && e.hp < e.max * 0.4) { e.rage = true; e.speed *= 1.35; ev(r, EV.SAY, e.id, 2); }
    const cdk = e.rage ? 0.65 : 1, R = ROSTER[r.world] || ROSTER[1];
    if (e.summonCd <= 0 && r.ents.size < 22) {
      e.summonCd = 17 * cdk;
      act(e, 1.2, 0.55, () => { raise(r, e, 3, R.mel[0]); ev(r, EV.SAY, e.id, 3); }, true);
    } else if (e.quakeCd <= 0) {
      e.quakeCd = 12 * cdk;
      act(e, 1.3, 0.25, t => { if (t) tele(r, t.x, t.y, 290, 1.6, 120 * e.dm, true); }, true);
    } else if (d > 300 && d < 900 && e.leapCd <= 0) {
      e.leapCd = 8 * cdk;
      leapTo(r, e, tg.x, tg.y, 0.95, 175, 70 * e.dm);
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
  NET.useMap(r.map.walk, r.map.solid);     // у комнаты своя карта (мир)
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
      if ((pressed & NET.B_WAVE) && r.mode === 'coop' && r.phase === 0 && r.worldT <= 0) startRound(r);
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
      // кооператив: погибший уходит в своё Междумирье (сцена на клиенте) и возвращается, когда войдёт в портал ('back')
      if (p.dead <= 0 && r.mode === 'coop' && !p.back) { p.dead = 1e9; p.limbo = true; }
      else if (p.dead <= 0) { p.back = false; p.limbo = false; const s = spawnPoint(r, p.team); p.dead = 0; p.x = NET.qpos(s.x); p.y = NET.qpos(s.y); p.hp = p.max; p.mp = p.maxMp; ev(r, EV.SAY, p.id, 4); }
      continue;
    }
    p.hp = Math.min(p.max, p.hp + (p.hpReg || 5) * DT);
    p.mp = Math.min(p.maxMp, p.mp + p.mpRegen * (r.mode === 'coop' && r.phase === 0 ? 3 : 1) * DT);
    if ((p.btn & NET.B_ATK) && p.atkCd <= 0) attack(r, p);
    if (p.ult > 0) {
      p.ult -= DT; p.ultTick -= DT;
      while (p.ultTick <= 0) { p.ultTick += 0.11; const a = rnd(0, 6.283), rr = rnd(90, 400); shard(r, p, p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr * YK, 100, 60 * p.ultMul, 0.4, 2); }
    }
  }
  const everyoneAway = r.mode === 'coop' && [...r.clients].length && [...r.clients].every(x => x.player && x.player.limbo);
  if (r.mode === 'coop' && !everyoneAway) { runRound(r); navField(r); }
  if (r.worldT > 0 && (r.worldT -= DT) <= 0) setWorld(r, BAL.at(r.wave + 1).M);
  // дуэль: опыт идёт со временем, чтобы было что прокачивать между схватками
  if (r.mode === 'duel' && (r.duelT += DT) >= 4) { r.duelT = 0; ev(r, EV.LVL, 12, 0); }
  if (!everyoneAway) for (const e of r.ents.values()) if (!e.player && alive(e)) updateEnemy(r, e);
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
      if (z.t <= 0) {
        for (const p of r.ents.values()) if (p.player && alive(p) && gdist(z, p) < z.R) {
          if (z.dmg) hurt(r, p, z.dmg, null);
          if (z.slow) slow(p, z.slow === true || z.slow === 1 ? 0.7 : z.slow, z.slow < 1 ? 2.2 : 1.5);
          if (z.root) { slow(p, 0.02, z.root); ev(r, EV.SAY, p.id, 10 + 16); }
        }
        if (z.vfx) ev(r, EV.VFX, z.vfx[0], z.vfx[1], z.x, z.y, z.vR, z.vt * 100, 0, 0); else ev(r, EV.QUAKE, z.x, z.y, z.R);
        if (z.pois) r.pzones.push({ x: z.x, y: z.y, R: z.R, t: z.pois.t, tick: z.pois.tick, acc: 0, dmg: z.pois.dmg, slow: z.pois.slow });
      }
      continue;
    }
    z.tick -= DT;
    while (z.tick <= 0) { z.tick += 0.13; const a = rnd(0, 6.283), rr = Math.sqrt(Math.random()) * z.R; shard(r, z.owner, z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * YK, 80, 24 * z.mul, 0.65, 1); }
  }
  r.zones = r.zones.filter(z => z.t > 0);
  // ядовитые зоны: жгут героев внутри каждые tick секунд
  for (const z of r.pzones) {
    z.t -= DT; const tk = (z.acc -= DT) <= 0; if (tk) z.acc = z.tick;
    for (const p of r.ents.values()) if (p.player && alive(p) && gdist(z, p) < z.R) { if (tk) hurt(r, p, z.dmg, null); if (z.slow) slow(p, z.slow, 0.35); }
  }
  r.pzones = r.pzones.filter(z => z.t > 0);
  // летящие сферы боссов: взрыв у героя или в конце пути
  for (const b of r.orbs) {
    b.t -= DT; b.x += b.dx * b.sp * DT; b.y += b.dy * b.sp * YK * DT;
    let hit = b.t <= 0;
    for (const p of r.ents.values()) if (p.player && alive(p) && gdist(b, p) < b.R * 0.6 + 20) hit = true;
    if (hit) { b.t = 0; for (const p of r.ents.values()) if (p.player && alive(p) && gdist(b, p) < b.R) hurt(r, p, b.dmg, null); ev(r, EV.VFX, b.kid, b.i, b.x, b.y, b.R, 90, 0, 0); }
  }
  r.orbs = r.orbs.filter(b => b.t > 0);
  for (const s of r.shards) {
    s.t -= DT;
    if (s.t > 0) continue;
    if (alive(s.owner) || s.owner.player) for (const e of targetsOf(r, s.owner)) if (gdist(s, e) < s.R + (e.rad || 22)) { hurt(r, e, s.dmg, s.owner, 1); slow(e, s.sk, s.st); }
  }
  r.shards = r.shards.filter(s => s.t > 0);
  // погибшие враги исчезают через 2,2 с (клиент успевает показать падение)
  for (const e of [...r.ents.values()]) if (!e.player && e.hp <= 0) { e.dieT += DT; if (e.dieT > 2.2) r.ents.delete(e.id); }
  recordHistory(r);
  // рассылка: флаги и доп. поле, затем снимок каждому клиенту (дельта к тому, что он уже знает) и события
  for (const e of r.ents.values()) {
    e.flags = (e.dead > 0 || e.hp <= 0 ? NET.F_DEAD : 0) | (e.root > 0 ? NET.F_ROOT : 0) | (e.silT > 0 ? NET.F_SIL : 0) | (e.slowT > 0 ? NET.F_SLOW : 0) |
      (e.shieldT > 0 ? NET.F_SHIELD : 0) | ((e.castT > 0 || (e.act && e.act.cast)) ? NET.F_CAST : 0) | ((e.atkT > 0 || (e.act && !e.act.cast)) ? NET.F_ATK : 0) | (e.rage ? NET.F_RAGE : 0);
    e.ex = e.player ? (e.focus & 15) | ((e.kills & 255) << 8) | (e.ult > 0 ? 16 : 0) | (e.moving ? 32 : 0) | (e.running ? 64 : 0) : Math.min(1023, Math.round(e.jump || 0)) | (e.moving ? 1024 : 0) | (e.elite ? 2048 : 0);
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
      if (m.proto !== NET.PROTO) {
        // старый или новый клиент: понятная ошибка вместо странного поведения в общей комнате
        return c.ws.send(JSON.stringify({ t: 'error', code: 'proto', server: NET.PROTO, client: m.proto || 0,
          msg: (m.proto || 0) < NET.PROTO ? 'Обновите приложение — у соперника новая версия' : 'На сервере старая версия игры, попробуйте позже' }));
      }
      const mode = m.mode === 'duel' ? 'duel' : 'coop';
      let r = m.room ? rooms.get(String(m.room)) : null;
      if (r && (r.mode !== mode || r.clients.size >= r.max)) return c.ws.send(JSON.stringify({ t: 'error', msg: r.mode !== mode ? 'комната другого режима' : 'комната заполнена' }));
      if (!r && !m.room) r = [...rooms.values()].find(x => x.mode === mode && x.clients.size < x.max && !x.private);
      if (!r) { r = makeRoom(mode, m.room ? String(m.room) : null); r.private = !!m.room; }
      const p = addPlayer(r, c, m.hero, m.prog);
      p.name = String(m.name || 'Игрок').slice(0, 16);
      c.room = r; c.player = p; c.base = new Map(); r.clients.add(c);
      c.ws.send(JSON.stringify({ t: 'joined', id: p.id, room: r.code, mode, team: p.team, tick: r.tick, rate: TICK, world: r.world,
        players: [...r.clients].map(x => ({ id: x.player.id, name: x.player.name, hero: x.player.kind })) }));
      for (const x of r.clients) if (x !== c) x.ws.send(JSON.stringify({ t: 'peer', id: p.id, name: p.name, hero: p.kind }));
      log('join', r.code, mode, p.name, p.kind, 'игроков', r.clients.size);
    } else if (m.t === 'prog' && c.player) {
      c.player.prog = cleanProg(m.prog || {}); heroStats(c.player);
    } else if (m.t === 'back' && c.player && c.player.limbo) {
      // возврат из Междумирья. Если все были там — текущая волна начинается заново
      const r = c.room, all = [...r.clients].every(x => x.player && x.player.limbo);
      c.player.back = true; c.player.dead = 0.001;
      if (all && r.mode === 'coop' && r.phase === 1) {
        for (const [id, e] of r.ents) if (!e.player) r.ents.delete(id);
        r.shots = []; r.zones = []; r.pzones = []; r.orbs = []; r.queue = [];
        r.wave = Math.max(0, r.wave - 1); r.endW = Math.max(r.endW, roundEnd(r.wave + 1)); nextWave(r);
      }
    } else if (m.t === 'use' && c.player && alive(c.player)) {
      const p = c.player, now = Date.now();
      if (now - (p.useAt || 0) < 400) return;      // не чаще 2,5 раза в секунду
      p.useAt = now;
      if (m.id === 'heal') { const h = Math.min(280, p.max - p.hp); p.hp += h; ev(c.room, EV.HEAL, p.id, h, 0); }
      else if (m.id === 'mana') { const h = Math.min(220, p.maxMp - p.mp); p.mp += h; ev(c.room, EV.HEAL, p.id, h, 1); }
      else if (m.id === 'frost') { for (const k in p.cd) p.cd[k] = 0; }
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
