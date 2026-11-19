// Механики врагов: у каждого вида свой приём, у боссов миров — свои способности и фазы по здоровью.
// Подключается после combat.js и оборачивает updateEnemy / hurtEnemy. Рисунков кодом нет: предупреждения
// и удары — картинки ChatGPT из fx, огненные шары — снаряды врагов-магов.
// Использует из combat.js: enemies, shots, fx, P, KIND, startAct, spawnEnemy, hurtPlayer, say, snd, gdist, rnd, YK, collide.
'use strict';

const dirTo = (e, x, y) => { const dx = x - e.x, dy = (y - e.y) / YK, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m, m]; };
const headY = e => e.y - (e.ch.ok ? e.ch.top * e.ch.U * e.sc : 80) - 26;
function tag(e, t, c) { say(e.x, headY(e), t, c || '#ffb36a'); }
function slowHero(k, t) { P.slowK = Math.min(P.slowT > 0 ? P.slowK : 1, k); P.slowT = Math.max(P.slowT || 0, t); }
function warn(x, y, R, dur, dmg, o) { const f = Object.assign({ type: 'tele', x, y, t: 0, dur, R, dmg }, o); fx.push(f); return f; }
function fireball(e, dx, dy, dmg, sp) {
  shots.push({ own: 'e', x: e.x + dx * 30, y: e.y + dy * 30 * YK, dx, dy, sp: sp || 480, left: 900, dmg, h: e.ch.U * 0.9 * e.sc, src: e });
}
function moveBy(e, dx, dy, sp, dt) { e.x += dx * sp * dt; e.y += dy * sp * YK * dt; collide(e); }
function leapTo(e, x, y, dur, R, dmg, anim) {
  warn(x, y, R, dur, dmg);
  e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, dur };
  startAct(e, anim || 'leap', dur + 0.05, 2, () => {});
}
function raise(e, n, type) {
  for (let i = 0; i < n; i++) {
    spawnEnemy(type || rosterOf(wave).mel[0]); const m = enemies[enemies.length - 1], a = rnd(0, 6.283);
    m.x = e.x + Math.cos(a) * 90; m.y = e.y + Math.sin(a) * 90 * YK; collide(m);
    fx.push({ type: 'quake', x: m.x, y: m.y, t: 0, dur: 0.6, R: 50 });
  }
}

// ---------- магия боссов ChatGPT: картинка эффекта на земле (вид сверху, сжата по вертикали, как земля) ----------
// how: target — метка под героем, self — кольцо вокруг босса, multi — три удара вокруг героя, moving — летит от босса.
// Эффект может держаться t секунд: poison — жжёт героя внутри каждые tick секунд.
const SPELL_FX = [], SPELL_IMG = {};
function spellImg(src) { if (!SPELL_IMG[src]) { const im = new Image(); im.src = src + V; SPELL_IMG[src] = im; } return SPELL_IMG[src]; }
function spellFx(o) { SPELL_FX.push(Object.assign({ t: 0, dur: 1.2, tickT: 0 }, o)); }
function castSpell(e, s, i) {
  const img = e.ch.vfx && e.ch.vfx[i] ? e.ch.vfx[i].img : null, dm = e.dm;
  const v = (R, t) => ({ img, R, dur: t || 1.2, rot: s.how === 'self' ? 0.25 : 0 });
  if (s.how === 'target') {
    warn(P.x, P.y, s.R, s.warn, s.dmg * dm, { vfx: Object.assign(v(s.R, s.t), s.eff === 'poison' ? { pdmg: (s.pdmg || s.dmg) * dm, tick: s.tick } : {}), onHitP: () => { if (s.eff === 'root') { slowHero(0.02, s.t); say(P.x, P.y - CH * HS(), 'корни держат!', '#b9e37a'); } } });
  } else if (s.how === 'self') {
    warn(e.x, e.y, s.R, s.warn, (s.hit || 0) * dm, { vfx: Object.assign(v(s.R, s.t), s.eff === 'poison' || s.eff === 'slow' ? { pdmg: s.dmg * dm, tick: s.tick, slow: s.slow } : {}) });
  } else if (s.how === 'multi') {
    for (let j = 0; j < 3; j++) { const a = rnd(0, 6.283), r = j ? rnd(90, 220) : 0; warn(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, s.R, s.warn + j * 0.3, s.dmg * dm, { vfx: v(s.R, 0.9) }); }
  } else if (s.how === 'moving') {
    const [dx, dy] = dirTo(e, P.x, P.y);
    spellFx({ img, R: s.R * 0.6, dur: 6, mv: { dx, dy, sp: s.sp || 330, dmg: s.dmg * dm, R: s.R }, x: e.x + dx * 60, y: e.y + dy * 60 * YK });
  }
}
// приёмы боссов с магией: заклинания по очереди, по фазам чаще; в последней фазе зовёт свиту
function spellBoss(e, dt, d) {
  const S = e.k.spells;
  if (!e.scd) e.scd = S.map(s => rnd(2.5, s.cd * 0.6));
  const cdk = e.phase >= 3 ? 0.6 : e.phase >= 2 ? 0.8 : 1;
  for (let i = 0; i < S.length; i++) e.scd[i] -= dt;
  if (e.act) return;
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    if (e.scd[i] > 0 || (s.how === 'self' ? d > s.R + 60 : d > 950)) continue;
    e.scd[i] = s.cd * cdk; tag(e, s.nm + '!', '#b9e37a');
    startAct(e, s.an || 'cast', 1.0, 0.45, () => castSpell(e, s, i));
    return true;
  }
  if (e.phase >= 3 && e.mt2 <= 0 && enemies.length < 14) { e.mt2 = 14; startAct(e, 'cast', 1.0, 0.5, () => raise(e, 2, rosterOf(wave).mel[0])); return true; }
}
const _cuS = combatUpdate;
combatUpdate = function (dt) {
  _cuS(dt);
  for (const f of SPELL_FX) {
    f.t += dt;
    if (f.mv) {   // летящая сфера: взрыв у героя или в конце пути (в онлайне — только картинка, урон считает сервер)
      f.x += f.mv.dx * f.mv.sp * dt; f.y += f.mv.dy * f.mv.sp * YK * dt;
      if (!f.mv.vis && P.dead <= 0 && gdist(f, P) < f.R + 20) { f.t = f.dur; warn(f.x, f.y, f.mv.R, 0.01, f.mv.dmg, { vfx: { img: f.img, R: f.mv.R, dur: 0.9 } }); }
    }
    if (f.pdmg && P.dead <= 0 && (f.tickT -= dt) <= 0) { f.tickT = f.tick; if (gdist(f, P) < f.R) hurtPlayer(f.pdmg); }
    if (f.slow && P.dead <= 0 && gdist(f, P) < f.R) slowHero(f.slow, 0.35);   // трясина: вязнешь, пока стоишь в ней
  }
  keep(SPELL_FX, f => f.t < f.dur);
};
const _cgS = combatGround;
combatGround = function (t) {
  _cgS(t);
  for (const f of SPELL_FX) {
    const im = f.img && spellImg(f.img);
    if (!im || !im.complete || !im.naturalWidth) continue;
    const a = Math.min(1, f.t / 0.15, (f.dur - f.t) / 0.4), w = f.R * 2.3;
    ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(f.x, f.y); ctx.scale(1, YK); ctx.rotate(f.mv && f.mv.gaze ? Math.atan2(f.mv.dy, f.mv.dx) : f.t * (f.rot || 0) + (f.mv ? f.t * 3 : 0));   // луч-змей летит головой вперёд
    ctx.drawImage(im, -w / 2, -w / 2, w, w);
    ctx.restore();
  }
};

// ---------- приёмы видов. d — расстояние до героя. Вернуть true — обычное поведение в этом кадре пропускается ----------
const MECH = {
  // Теневой волк: подкрадывается и прыгает с укусом
  shadowwolf(e, dt, d) {
    if (!e.act && e.mt <= 0 && d > 170 && d < 420) { e.mt = 5; leapTo(e, P.x, P.y, 0.55, 80, 16 * e.dm, 'atk'); return true; }
  },
  // Кабан-громила: удар дубиной так, что трясётся земля
  boarbrute(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 210) { e.mt = 6; warn(e.x, e.y, 160, 0.8, 30 * e.dm); startAct(e, 'atk', 0.9, 2, () => {}); return true; }
  },
  // Болотный упырь: налетает рывком и рвёт когтями
  bogghoul(e, dt, d) {
    if (e.dash > 0) { e.dash -= dt; const [dx, dy] = dirTo(e, P.x, P.y); moveBy(e, dx, dy, e.speed * 2.4, dt); e.anim = 'run'; e.runPh += dt * 2.5; return true; }
    if (!e.act && e.mt <= 0 && d > 150 && d < 360) { e.dash = 0.45; e.mt = 4.5; }
  },
  // Утопленник: двуручный меч сверху — метка перед ним, удар с брызгами
  drownedknight(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 230) {
      e.mt = 6.5; const [dx, dy] = dirTo(e, P.x, P.y);
      warn(e.x + dx * 95, e.y + dy * 95 * YK, 115, 0.85, 34 * e.dm); startAct(e, 'atk', 0.95, 2, () => {}); return true;
    }
  },
  // Пугало-жнец: дёргается и режет серпом по кругу
  scarecrow(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 150) { e.mt = 5; warn(e.x, e.y, 135, 0.6, 24 * e.dm); startAct(e, 'atk', 0.7, 2, () => {}); return true; }
  },
  // Осенний медведь: встаёт на дыбы и бьёт лапами — метка перед ним
  autumnbear(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 220) {
      e.mt = 6; const [dx, dy] = dirTo(e, P.x, P.y);
      warn(e.x + dx * 85, e.y + dy * 85 * YK, 120, 0.8, 32 * e.dm); startAct(e, 'atk', 0.9, 2, () => {}); return true;
    }
  },
  // Саламандра-воин: закрывается щитом — урон по ней втрое меньше
  salamander(e) {
    if (e.mt <= 0) { e.mt = 7; e.arm = 2.5; tag(e, 'Щит!', '#ffb36a'); }
  },
  // Пустой лучник: держит дистанцию, если герой подошёл вплотную
  hollowarcher(e, dt, d) {
    if (!e.act && d < 230) {
      const [dx, dy] = dirTo(e, P.x, P.y); moveBy(e, -dx, -dy, e.speed * (e.slowT > 0 ? e.slowK : 1), dt);
      e.anim = 'run'; e.runPh += dt * 1.5; return true;
    }
  },
  // элита Шипокорень: корни из-под земли под героем — урон и сильное замедление
  thornroot(e, dt, d) {
    if (!e.act && e.mt <= 0 && d > 140 && d < 620) {
      e.mt = 7; tag(e, 'Корни!', '#b9e37a');
      startAct(e, 'atk', 0.9, 0.5, () => warn(P.x, P.y, 120, 1.0, 26 * e.dm, { onHitP: () => slowHero(0.35, 2.2) }));
      return true;
    }
  },
};
// особые попадания снарядов
const SHOT_HIT = {
  sporeshaman: () => { slowHero(0.75, 1.2); },   // ядовитые споры
};

const _updateEnemy = updateEnemy;
updateEnemy = function (e, dt) {
  e.mt = (e.mt == null ? rnd(1.5, 4) : e.mt) - dt; e.mt2 = (e.mt2 || 0) - dt; e.mt3 = (e.mt3 || 0) - dt;
  if (e.arm > 0) e.arm -= dt;
  if (e.boss) {
    // фазы босса: ниже 60 % здоровья открываются новые приёмы, ниже 25 % — все сразу и чаще
    const ph = e.hp < e.max * 0.25 ? 3 : e.hp < e.max * 0.6 ? 2 : 1;
    if (ph > (e.phase || 1)) { e.mt = Math.min(e.mt, 1); tag(e, ph === 2 ? 'Вторая фаза' : 'Последняя фаза', '#ff9a6a'); }
    e.phase = Math.max(e.phase || 1, ph);
  }
  const m = MECH[e.type] || (e.k.spells && spellBoss);
  if (m && !e.kb && !(e.root > 0) && !(P.dead > 0) && !e.leap && !(e.silT > 0 && !e.boss)) {
    if (m(e, dt, gdist(P, e)) === true) return;
  }
  const ns = shots.length, hp0 = P.hp;
  _updateEnemy(e, dt);
  for (let i = ns; i < shots.length; i++) { shots[i].src = e; if (SHOT_HIT[e.type]) shots[i].onHitP = SHOT_HIT[e.type]; }
  if (P.hp < hp0) {
    if (e.k.steal) { const h = (hp0 - P.hp) * e.k.steal; e.hp = Math.min(e.max, e.hp + h); say(e.x, headY(e) + 20, '+' + Math.round(h), '#7dff8a'); }
  }
};
const _hurtEnemy = hurtEnemy;
hurtEnemy = function (e, dmg, col) {
  if (e.arm > 0) dmg *= 0.35;
  if (e.k.rise && !e.risen && e.hp > 0 && e.hp - dmg * (P.dmgMul || 1) <= 0 && Math.random() < e.k.rise) {
    e.risen = true; e.hp = Math.round(e.max * 0.35); e.flash = 0.15; tag(e, 'Встаёт!', '#c9ff9a'); return;
  }
  _hurtEnemy(e, dmg, col);
};

// похожие приёмы: Лис и Магмовый пёс — рывок, как у упыря; Огненный бес прыгает, как волк
MECH.werefox = MECH.bogghoul; MECH.magmahound = MECH.bogghoul; MECH.fireimp = MECH.shadowwolf; MECH.porcelainmaid = MECH.scarecrow; MECH.gembeetle = MECH.bogghoul; MECH.glassdancer = MECH.scarecrow; MECH.frostlynx = MECH.shadowwolf; MECH.marblegriffin = MECH.shadowwolf; MECH.prismkeeper = MECH.hollowarcher;   // барс и грифон прыгают, хранитель держит дистанцию   // плясунья кружится, стеклянные ленты режут вокруг
// Гном-подрывник: отходит, если герой близко, и бросает бомбу — метка под героем, взрыв
MECH.dwarfbomber = function (e, dt, d) {
  if (!e.act && d < 230) return MECH.hollowarcher(e, dt, d);
  if (!e.act && e.mt <= 0 && d < 560) { e.mt = 6; startAct(e, 'atk', 0.7, 0.6, () => warn(P.x, P.y, 105, 1.0, 28 * e.dm)); return true; }
};   // фрейлина кружится со стальным веером
// элита — приёмы своего злодея
for (const t in KIND) if (KIND[t].base && MECH[KIND[t].base]) MECH[t] = MECH[KIND[t].base];
