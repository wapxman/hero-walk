// Механики боссов 10 миров (ночь 19.11, DESIGN.md п.3). У каждого босса своя тяжёлая механика и свой предмет-ответ
// (relics.js). Картинки магии — vfx1/vfx2 босса от Клауди (ChatGPT); пока у босса нет своего арта, его играет
// перекрашенный заместитель (tb_*) с той же механикой.
// Использует из enemies.js: warn, startAct, tag, spellFx, leapTo, dirTo, slowHero, MECH, SPELL_FX; из relics.js: STATUS, hasRelic.
'use strict';
const BM = { zones: [], snakes: [], smoke: [] };
const vfxOf = (e, i) => e.ch.vfx && e.ch.vfx[i] ? e.ch.vfx[i].img : null;
const bossCd = e => e.phase >= 3 ? 0.65 : e.phase >= 2 ? 0.82 : 1;
// зона на земле: картинка, урон/эффект пока герой внутри (tick), тянет к центру (pull)
function gzone(o) { BM.zones.push(Object.assign({ t: 0, dur: 4, tick: 0.5, acc: 0, R: 120, a: 0 }, o)); }
// дым: облака дыма живут 8 с (SMOKE для Ока Ясности)
const SMOKE = { clearNear(x, y, R) { for (const s of BM.smoke) if (Math.hypot(s.x - x, (s.y - y) / YK) < R + s.R) s.t = Math.max(s.t, s.dur - 0.5); } };

// ---------- 1. Чёрный Рыцарь: Зеркальный щит (3 с из 10 отражает умения героя в него самого), Таран ----------
function blackknight(e, dt, d) {
  e.shT = (e.shT == null ? 4 : e.shT) - dt;
  if (e.shield > 0) { e.shield -= dt; if (e.shield <= 0) tag(e, 'щит опущен', '#ffe9a8'); }
  if (e.shT <= 0 && !e.act) {
    e.shT = 10 * bossCd(e); tag(e, 'Зеркальный щит!', '#ffd95e'); e.shieldWarn = 0.7;
    startAct(e, 'cast1', 0.9, 0.75, () => { e.shield = 3; });
    return true;
  }
  if (e.shieldWarn > 0) e.shieldWarn -= dt;
  if (!e.act && e.mt <= 0 && d > 200 && d < 620 && !(e.shield > 0)) {
    e.mt = 7 * bossCd(e); tag(e, 'Таран!', '#ffb36a');
    leapTo(e, P.x, P.y, 0.75, 120, 38 * e.dm, 'cast2');
    const img = vfxOf(e, 1), x = P.x, y = P.y;
    setTimeout(() => { if (img) spellFx({ img, x, y, R: 120, dur: 0.8 }); if (gdist(P, { x, y }) < 140) { STATUS.add('stun', 0.6); const [dx, dy] = dirTo(e, P.x, P.y); P.x += dx * 90; P.y += dy * 90 * YK; collide(P); } }, 760);
    return true;
  }
}
// урон по Рыцарю под щитом: умения отражаются в героя, остальное щит гасит. Кристалл Пронзания пробивает
let heroSpell = 0;   // > 0 — сейчас бьёт умение героя (нова, оковы, град, буря)
{
  const _c = cast; cast = function (id) { heroSpell++; try { _c(id); } finally { heroSpell--; } };
  const _h = hurtEnemy;
  hurtEnemy = function (e, dmg, col) {
    if (e.shield > 0 && e.hp > 0) {
      const spell = heroSpell > 0 || P.ult > 0 || zones.some(z => z.type === 'hail' && gdist(z, e) < z.R + e.rad);
      if (spell && P.pierce) { P.pierce = false; tag(e, 'пробито!', '#9fe8ff'); return _h(e, dmg * 1.2, col); }
      if (spell) { if (!e.refSaid || performance.now() - e.refSaid > 600) { tag(e, 'отражено!', '#ffd95e'); e.refSaid = performance.now(); } hurtPlayer(dmg * (P.dmgMul || 1)); }
      return;
    }
    _h(e, dmg, col);
  };
}

// ---------- 2. Чумной Мародёр: Дымовая завеса (обзор сужается, умения мажут), Поджог (горящая земля 4 с) ----------
function plaguelord(e, dt, d) {
  e.sm = (e.sm == null ? 3 : e.sm) - dt; e.tor = (e.tor == null ? 6 : e.tor) - dt;
  if (e.act) return;
  if (e.sm <= 0) {
    e.sm = 11 * bossCd(e); tag(e, 'Дымовая завеса!', '#c0c0c0');
    startAct(e, 'cast1', 1.0, 0.5, () => {
      const img = vfxOf(e, 0);
      for (let i = 0; i < 4; i++) { const a = rnd(0, 6.283), r = i ? rnd(120, 300) : 0; BM.smoke.push({ img, x: P.x + Math.cos(a) * r, y: P.y + Math.sin(a) * r * YK, R: 170, t: 0, dur: 8 }); }
    });
    return true;
  }
  if (e.tor <= 0 && d < 900) {
    e.tor = 6.5 * bossCd(e); tag(e, 'Поджог!', '#ff8a3a');
    startAct(e, 'cast2', 0.9, 0.55, () => warn(P.x, P.y, 120, 0.9, 20 * e.dm, { vfx: { img: vfxOf(e, 1), R: 120, dur: 0.3 }, onHitP: () => {} }));
    const x = P.x, y = P.y; setTimeout(() => gzone({ img: vfxOf(e, 1), x, y, R: 125, dur: 4, burn: 1 }), 1500);
    return true;
  }
}

// ---------- 3. Королева Змей: Змеиный рой (6 змей, укус −15 % скорости, до −60 %), Ядовитый взгляд (луч −60 % на 2 с) ----------
function serpentqueen(e, dt, d) {
  e.sw = (e.sw == null ? 3 : e.sw) - dt; e.gz = (e.gz == null ? 7 : e.gz) - dt;
  if (e.act) return;
  if (e.sw <= 0) {
    e.sw = 9 * bossCd(e); tag(e, 'Змеиный рой!', '#9be37a');
    startAct(e, 'cast1', 1.0, 0.55, () => { for (let i = 0; i < 6; i++) { const a = i / 6 * 6.283; BM.snakes.push({ img: vfxOf(e, 0), x: e.x + Math.cos(a) * 70, y: e.y + Math.sin(a) * 70 * YK, t: 0, life: 7, sp: 150 + rnd(0, 50), dm: e.dm }); } });
    return true;
  }
  if (e.gz <= 0 && d < 950) {
    e.gz = 8 * bossCd(e); tag(e, 'Ядовитый взгляд!', '#7dff6a');
    startAct(e, 'cast2', 0.9, 0.5, () => { const [dx, dy] = dirTo(e, P.x, P.y); spellFx({ img: vfxOf(e, 1), R: 70, dur: 5, mv: { dx, dy, sp: 520, dmg: 30 * e.dm, R: 90, gaze: 1 }, x: e.x + dx * 60, y: e.y + dy * 60 * YK }); });
    return true;
  }
}

// ---------- 5. Горн-Голем: Плавильный удар (каждый удар −25 % брони, до 4 стаков), Кузнечный жар (кольцо снимает броню) ----------
function forgegolem(e, dt, d) {
  e.mh = (e.mh == null ? 3 : e.mh) - dt; e.hr = (e.hr == null ? 8 : e.hr) - dt;
  if (e.act) return;
  if (e.mh <= 0 && d < 560) {
    e.mh = 5 * bossCd(e); tag(e, 'Плавильный удар!', '#ffb347');
    startAct(e, 'cast1', 0.9, 0.5, () => warn(P.x, P.y, 115, 0.8, 40 * e.dm, { vfx: { img: vfxOf(e, 0), R: 115, dur: 0.9 }, onHitP: () => STATUS.add('shred', 1, 8) }));
    return true;
  }
  if (e.hr <= 0 && d < 420) {
    e.hr = 11 * bossCd(e); tag(e, 'Кузнечный жар!', '#ff7a3a');
    startAct(e, 'cast2', 1.0, 0.5, () => { warn(e.x, e.y, 300, 0.8, 22 * e.dm, { vfx: { img: vfxOf(e, 1), R: 300, dur: 1.2 }, onHitP: () => STATUS.add('shred', 2, 8) }); });
    return true;
  }
}
// ---------- 6. Королева Вьюги: Вьюга (стаки холода, на 5-м заморозка 2 с), Ледяная темница (заморозка 1,5 с) ----------
function frostqueen(e, dt, d) {
  e.bz = (e.bz == null ? 3 : e.bz) - dt; e.pr = (e.pr == null ? 7 : e.pr) - dt;
  if (e.act) return;
  if (e.bz <= 0) {
    e.bz = 10 * bossCd(e); tag(e, 'Вьюга!', '#bfe6ff');
    startAct(e, 'cast1', 1.0, 0.5, () => gzone({ img: vfxOf(e, 0), x: e.x, y: e.y, R: 330, dur: 5, tick: 0.8, cold: 1, follow: e }));
    return true;
  }
  if (e.pr <= 0 && d < 900) {
    e.pr = 9 * bossCd(e); tag(e, 'Ледяная темница!', '#9fd8ff');
    startAct(e, 'cast2', 0.9, 0.5, () => warn(P.x, P.y, 110, 1.0, 26 * e.dm, { vfx: { img: vfxOf(e, 1), R: 110, dur: 1.6 }, onHitP: () => STATUS.add('freeze', 1.5) }));
    return true;
  }
}
// ---------- 7. Зеркальный Лорд: Отражение (копия героя с его предметами ×3), Осколки (веер) ----------
function mirrorlord(e, dt, d) {
  e.rf = (e.rf == null ? 2 : e.rf) - dt; e.sh = (e.sh == null ? 5 : e.sh) - dt;
  if (e.act) return;
  if (e.rf <= 0 && !enemies.some(x => x.type === 'mirrorcopy' && !x.dieT)) {
    e.rf = 18; tag(e, 'Отражение!', '#e6e6ff');
    startAct(e, 'cast1', 1.1, 0.6, () => spawnMirror(e));
    return true;
  }
  if (e.sh <= 0 && d < 900) {
    e.sh = 6 * bossCd(e); tag(e, 'Осколки!', '#dfe8ff');
    startAct(e, 'cast2', 0.9, 0.5, () => { const [dx, dy] = dirTo(e, P.x, P.y), a0 = Math.atan2(dy, dx); for (let i = -3; i <= 3; i++) { const a = a0 + i * 0.16; fireball(e, Math.cos(a), Math.sin(a), 22 * e.dm, 560); } if (vfxOf(e, 1)) spellFx({ img: vfxOf(e, 1), x: e.x, y: e.y, R: 120, dur: 0.6 }); });
    return true;
  }
}
// копия героя: его уровень, урон и здоровье; свойства предметов ×3. Без предметов (или с Пустым Сосудом) — пустая
function spawnMirror(e) {
  const S = typeof bagStats === 'function' ? bagStats() : {}, empty = !SHOP.bag.length || hasRelic('empty_vessel');
  spawnEnemy('mirrorcopy'); const m = enemies[enemies.length - 1];
  const k = empty ? 0 : 3;
  m.max = m.hp = Math.round((P.maxHp * (empty ? 0.6 : 1) + (S.hp || 0) * k) * (1 + (S.arm || 0) * k));
  m.dm = (empty ? 0.5 : 1) * (1 + ((S.dmg || 0) + (S.sk || 0)) * k) * (1 + 0.015 * P.lvl);
  m.k = Object.assign({}, m.k, { cd: Math.max(0.35, 1.1 / (1 + Math.min(1.2, (S.as || 0) * k))) });
  const a = rnd(0, 6.283); m.x = e.x + Math.cos(a) * 140; m.y = e.y + Math.sin(a) * 140 * YK; collide(m);
  if (vfxOf(e, 0)) spellFx({ img: vfxOf(e, 0), x: m.x, y: m.y, R: 120, dur: 1 });
  tag(m, empty ? 'пустое отражение' : 'твоё отражение ×3', empty ? '#bfe6ff' : '#ff9a9a');
}
// ---------- 4/8/9/10: Король-Жаб (яд стаками), Владыка Пепла (горение, метеоры, лава), Небесный Судья, Архимаг Бездны ----------
function toadking(e, dt, d) {
  e.ac = (e.ac == null ? 3 : e.ac) - dt; e.mr = (e.mr == null ? 8 : e.mr) - dt;
  if (e.act) return;
  if (e.ac <= 0 && d < 900) {
    e.ac = 7 * bossCd(e); tag(e, 'Кислотный плевок!', '#d4e04a');
    startAct(e, 'cast1', 1.0, 0.45, () => { const x = P.x, y = P.y; warn(x, y, 125, 1.0, 40 * e.dm, { vfx: { img: vfxOf(e, 0), R: 125, dur: 0.3 }, onHitP: () => STATUS.add('poison', 2) }); setTimeout(() => gzone({ img: vfxOf(e, 0), x, y, R: 125, dur: 5, poison: 1 }), 1000); });
    return true;
  }
  if (e.mr <= 0 && d < 400) {
    e.mr = 13 * bossCd(e); tag(e, 'Трясина!', '#8a9a5a');
    startAct(e, 'cast2', 1.0, 0.45, () => gzone({ img: vfxOf(e, 1), x: e.x, y: e.y, R: 320, dur: 4.5, slow: 0.45, poison: 1, tick: 1 }));
    return true;
  }
}
function ashlord(e, dt, d) {
  e.mt1 = (e.mt1 == null ? 3 : e.mt1) - dt; e.rg = (e.rg == null ? 7 : e.rg) - dt;
  if (e.act) return;
  if (e.mt1 <= 0 && d < 950) {
    e.mt1 = 8 * bossCd(e); tag(e, 'Метеоритный дождь!', '#ff6a2a');
    startAct(e, 'cast1', 1.0, 0.45, () => { for (let j = 0; j < 3; j++) { const a = rnd(0, 6.283), r = j ? rnd(90, 220) : 0, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r * YK; warn(x, y, 125, 1.1 + j * 0.3, 45 * e.dm, { vfx: { img: vfxOf(e, 0), R: 125, dur: 0.9 }, onHitP: () => STATUS.add('burn', 1) }); setTimeout(() => gzone({ img: vfxOf(e, 0), x, y, R: 95, dur: 4, burn: 1, a: 0.6 }), (1.2 + j * 0.3) * 1000); } });
    return true;
  }
  if (e.rg <= 0 && d < 380) {
    e.rg = 12 * bossCd(e); tag(e, 'Огненное кольцо!', '#ff5a2a');
    startAct(e, 'cast2', 1.0, 0.45, () => warn(e.x, e.y, 300, 0.9, 50 * e.dm, { vfx: { img: vfxOf(e, 1), R: 300, dur: 1.4 }, onHitP: () => STATUS.add('burn', 2) }));
    return true;
  }
}
function skyjudge(e, dt, d) {
  e.sl = (e.sl == null ? 4 : e.sl) - dt; e.lt = (e.lt == null ? 7 : e.lt) - dt;
  if (e.act) return;
  if (e.sl <= 0 && d < 950) {
    e.sl = 10 * bossCd(e); tag(e, 'Печать Безмолвия!', '#ffe27a');
    startAct(e, 'cast1', 1.0, 0.5, () => warn(P.x, P.y, 120, 0.9, 20 * e.dm, { vfx: { img: vfxOf(e, 0), R: 120, dur: 1.2 }, onHitP: () => STATUS.add('silence', 3) }));
    return true;
  }
  if (e.lt <= 0 && d < 950) {
    e.lt = 7 * bossCd(e); tag(e, 'Небесная кара!', '#fff3a0');
    startAct(e, 'cast2', 1.0, 0.45, () => { for (let j = 0; j < 4; j++) { const a = rnd(0, 6.283), r = j ? rnd(90, 240) : 0; warn(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, 105, 1.0 + j * 0.25, 40 * e.dm, { vfx: { img: vfxOf(e, 1), R: 105, dur: 0.8 }, onHitP: () => STATUS.add('stun', 0.8) }); } });
    return true;
  }
}
function voidmage(e, dt, d) {
  e.vx = (e.vx == null ? 4 : e.vx) - dt; e.rt = (e.rt == null ? 9 : e.rt) - dt;
  if (e.act) return;
  if (e.vx <= 0 && d < 950) {
    e.vx = 10 * bossCd(e); tag(e, 'Воронка Бездны!', '#c9a8ff');
    startAct(e, 'cast1', 1.0, 0.5, () => { const a = rnd(0, 6.283), x = P.x + Math.cos(a) * 160, y = P.y + Math.sin(a) * 160 * YK; gzone({ img: vfxOf(e, 0), x, y, R: 330, dur: 4.5, pull: 150, core: 60 * e.dm, tick: 0.5, spin: 1 }); });
    return true;
  }
  if (e.rt <= 0 && d < 950) {
    e.rt = 11 * bossCd(e); tag(e, 'Разлом!', '#b07aff');
    startAct(e, 'cast2', 0.9, 0.5, () => warn(P.x, P.y, 110, 0.9, 35 * e.dm, { vfx: { img: vfxOf(e, 1), R: 110, dur: 0.9 }, onHitP: () => riftTeleport() }));
    return true;
  }
}
function riftTeleport() {
  if (P.ss.imm.pull > 0) { say(P.x, P.y - CH * HS(), 'якорь держит', '#bfe6ff'); return; }
  for (let i = 0; i < 30; i++) {
    const x = rnd(WORLD_W * 0.2, WORLD_W * 0.8), y = rnd(WORLD_H * 0.25, WORLD_H * 0.75);
    let inside = false;   // точка внутри многоугольника проходимости и не в препятствии
    for (let a = 0, b = WALK.length - 1; a < WALK.length; b = a++) { const [x1, y1] = WALK[a], [x2, y2] = WALK[b]; if ((y1 > y) !== (y2 > y) && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) inside = !inside; }
    if (!inside || SOLID.some(s => Math.hypot((x - s.x) / (s.rx + 40), (y - s.y) / (s.ry + 40)) < 1)) continue;
    P.x = x; P.y = y; collide(P); break;
  }
  say(P.x, P.y - CH * HS() * 1.3, 'Разлом!', '#b07aff'); if (typeof cam !== 'undefined') cam.ready = false;
}

// ---------- копия героя — вид врага ----------
KIND.mirrorcopy = { nm: 'Отражение героя', ch: 'mirrorcopy', rng: 1, hp: 900, rad: 22, speed: 140, dmg: [28, 36], cd: 1.1, want: 480, shot: 760, pcol: '170,220,255', xp: 60, gold: 40, col: '#8aa0c0', elite: 0 };
if (GANFAUL && GANFAUL.mul) {
  const mul = {}; for (const n in GANFAUL.mul) { const a = GANFAUL.mul[n]; mul[n] = { at: a.at, n: a.n, ms: a.ms, rows: a.rows, foot: a.foot }; }
  CHARS.mirrorcopy = { lazy: 1, U: 100, top: 2.3, k: GANFAUL.k, mul, tint: 'grayscale(0.9) brightness(1.5) contrast(1.1)', at: 'mirrorcopy' };
}
KIND.mirrorcopy.sc = 1; KIND.mirrorcopy.pw = 1;

// механики — по виду босса и его заместителя
Object.assign(MECH, { b_blackknight: blackknight, tb_blackknight: blackknight, b_plaguelord: plaguelord, tb_plaguelord: plaguelord,
  b_serpentqueen: serpentqueen, tb_serpentqueen: serpentqueen, b_toadking: toadking, b_forgegolem: forgegolem, tb_forgegolem: forgegolem,
  b_frostqueen: frostqueen, tb_frostqueen: frostqueen, b_mirrorlord: mirrorlord, tb_mirrorlord: mirrorlord, b_ashlord: ashlord,
  b_skyjudge: skyjudge, tb_skyjudge: skyjudge, b_voidmage: voidmage });

// ---------- тик: зоны, змеи, дым, взгляд ----------
function bmTick(dt) {
  if (P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on)) { BM.zones.length = 0; BM.snakes.length = 0; BM.smoke.length = 0; return; }
  for (const z of BM.zones) {
    z.t += dt; if (z.follow && !z.follow.dieT) { z.x = z.follow.x; z.y = z.follow.y; }
    const dd = Math.hypot(P.x - z.x, (P.y - z.y) / YK), inside = dd < z.R;
    if (z.pull && dd > 20 && !(P.ss.imm.pull > 0)) { const k = Math.min(dd, z.pull * dt); P.x += (z.x - P.x) / dd * k; P.y += (z.y - P.y) / dd * k; collide(P); }
    if (inside && z.slow) slowHero(z.slow, 0.3);
    if ((z.acc -= dt) <= 0 && inside) {
      z.acc = z.tick;
      if (z.burn) STATUS.add('burn', 1); if (z.poison) STATUS.add('poison', 1); if (z.cold) STATUS.add('cold', 1);
      if (z.core && dd < 90) hurtPlayer(z.core);
    }
  }
  keep(BM.zones, z => z.t < z.dur);
  for (const s of BM.snakes) {
    s.t += dt; const dx = P.x - s.x, dy = (P.y - s.y) / YK, m = Math.hypot(dx, dy) || 1;
    s.x += dx / m * s.sp * dt; s.y += dy / m * s.sp * YK * dt; s.a = Math.atan2(dy, dx);
    if (m < 34) { s.t = s.life; hurtPlayer(10 * s.dm, 'poison'); P.ss.snake = Math.min(4, (P.ss.snake || 0) + 1); P.ss.snakeT = 4; }
  }
  keep(BM.snakes, s => s.t < s.life);
  if (P.ss.snakeT > 0) { P.ss.snakeT -= dt; slowHero(1 - 0.15 * P.ss.snake, 0.2); if (P.ss.snakeT <= 0) P.ss.snake = 0; }
  // дым: герой в облаке — обзор сужается, умения мажут
  P.inSmoke = false;
  for (const s of BM.smoke) { s.t += dt; if (Math.hypot(P.x - s.x, (P.y - s.y) / YK) < s.R) P.inSmoke = true; }
  keep(BM.smoke, s => s.t < s.dur);
  if (P.inSmoke && !(P.ss.noMiss > 0)) P.ss.blind = Math.max(P.ss.blind, 0.3);
  // ядовитый взгляд: летящий луч замедляет на 60 % на 2 с
  if (typeof SPELL_FX !== 'undefined') for (const f of SPELL_FX) if (f.mv && f.mv.gaze && !f.hit && Math.hypot(P.x - f.x, (P.y - f.y) / YK) < 70) { f.hit = true; f.t = f.dur; hurtPlayer(f.mv.dmg, 'poison'); slowHero(0.4, 2); say(P.x, P.y - CH * HS(), 'взгляд змеи', '#7dff6a'); }
}
function bmGround(t) {
  for (const z of BM.zones) {
    const im = z.img && spellImg(z.img); if (!im || !im.complete || !im.naturalWidth) continue;
    const a = Math.min(1, z.t / 0.3, (z.dur - z.t) / 0.6) * (z.a || 0.9), w = z.R * 2.2;
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(z.x, z.y); ctx.scale(1, YK); ctx.rotate(z.spin ? -t * 2.2 : t * 0.15); ctx.drawImage(im, -w / 2, -w / 2, w, w); ctx.restore();
  }
  for (const s of BM.snakes) {
    const im = s.img && spellImg(s.img); if (!im || !im.complete || !im.naturalWidth) continue;
    const w = 70; ctx.save(); ctx.globalAlpha = Math.min(1, (s.life - s.t) * 2); ctx.translate(s.x, s.y); ctx.scale(1, YK); ctx.rotate(s.a + Math.sin(s.t * 14) * 0.25); ctx.drawImage(im, -w / 2, -w / 2, w, w); ctx.restore();
  }
}
function bmOver(t) {
  // щит Чёрного Рыцаря: золотой шестигранник перед ним (мерцает, пока поднят; предупреждение — за 0,7 с)
  for (const e of enemies) {
    if (!(e.shield > 0 || e.shieldWarn > 0) || e.dieT) continue;
    const im = vfxOf(e, 0) && spellImg(vfxOf(e, 0)); if (!im || !im.complete || !im.naturalWidth) continue;
    const h = e.ch.top * e.ch.U * e.sc, w = h * 0.75, k = e.shield > 0 ? 0.75 + 0.2 * Math.sin(t * 12) : 0.35 + 0.35 * Math.sin(t * 25);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = k; ctx.drawImage(im, e.x - w / 2, e.y - h * 0.85, w, w); ctx.restore();
  }
  // облака дыма поверх всего
  for (const s of BM.smoke) {
    const im = s.img && spellImg(s.img); if (!im || !im.complete || !im.naturalWidth) continue;
    const a = Math.min(1, s.t / 0.6, (s.dur - s.t) / 0.8) * 0.85, w = s.R * 2.6;
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(s.x, s.y - 40); ctx.rotate(t * 0.1 + s.x); ctx.drawImage(im, -w / 2, -w / 2 * 0.8, w, w * 0.8); ctx.restore();
  }
}
// в дыму обзор сужается до круга в четверть экрана
function bmUI() {
  if (!P.inSmoke || P.ss.noMiss > 0) return;
  const sx = (P.x - cam.x) * cam.z, sy = (P.y - CH * 0.5 * HS() - cam.y) * cam.z, r = Math.min(W, H) * 0.25;
  const g = ctx.createRadialGradient(sx, sy, r * 0.7, sx, sy, r * 1.6);
  g.addColorStop(0, 'rgba(40,38,34,0)'); g.addColorStop(1, 'rgba(40,38,34,0.93)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
{
  const _cu = combatUpdate, _cg = combatGround, _co = combatOver, _ui = combatUI;
  combatUpdate = function (dt) { _cu(dt); bmTick(dt); };
  combatGround = function (t) { _cg(t); bmGround(t); };
  combatOver = function (t) { _co(t); bmOver(t); };
  combatUI = function () { bmUI(); _ui(); };
}
