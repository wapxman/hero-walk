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
    spawnEnemy(type || 'min'); const m = enemies[enemies.length - 1], a = rnd(0, 6.283);
    m.x = e.x + Math.cos(a) * 90; m.y = e.y + Math.sin(a) * 90 * YK; collide(m);
    fx.push({ type: 'quake', x: m.x, y: m.y, t: 0, dur: 0.6, R: 50 });
  }
}

// ---------- приёмы видов. d — расстояние до героя. Вернуть true — обычное поведение в этом кадре пропускается ----------
const MECH = {
  // зомби-девушка: рывок к герою с короткой дистанции
  zgirl(e, dt, d) {
    if (e.dash > 0) { e.dash -= dt; const [dx, dy] = dirTo(e, P.x, P.y); moveBy(e, dx, dy, e.speed * 2.6, dt); e.anim = 'run'; e.runPh += dt * 2.5; return true; }
    if (!e.act && e.mt <= 0 && d > 160 && d < 380) { e.dash = 0.45; e.mt = 4; }
  },
  // гоблин: ударил — отскочил, потом снова в атаку
  goblin(e, dt) {
    if (e.ret > 0) { e.ret -= dt; const [dx, dy] = dirTo(e, P.x, P.y); moveBy(e, -dx, -dy, e.speed * 1.2, dt); e.anim = 'run'; e.runPh += dt * 1.6; return true; }
  },
  // коп-зомби: поднимает броню — урон по нему втрое меньше
  copz(e) {
    if (e.mt <= 0) { e.mt = 7; e.arm = 2.5; tag(e, 'Броня!', '#bcd4ff'); }
  },
  // лучник: держит дистанцию, если герой подошёл вплотную
  rog(e, dt, d) {
    if (!e.act && d < 230) {
      const [dx, dy] = dirTo(e, P.x, P.y); moveBy(e, -dx, -dy, e.speed * (e.slowT > 0 ? e.slowK : 1), dt);
      e.anim = 'run'; e.runPh += dt * 1.5; return true;
    }
  },
  // маг: огненная метка под героем
  mag(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 600 && !(e.silT > 0)) { e.mt = 8; warn(P.x, P.y, 105, 1.1, 30 * e.dm); startAct(e, 'atk', 0.6, 0.5, () => {}); return true; }
  },
  // элита Паразит: прыгает на героя издалека
  parasite(e, dt, d) {
    if (!e.act && e.mt <= 0 && d > 200 && d < 560) { e.mt = 6; leapTo(e, P.x, P.y, 0.8, 105, 28 * e.dm, 'cast'); tag(e, 'Прыжок!'); return true; }
  },
  // элита Зомби-солдат: прицеливается и идёт на таран
  warzombie(e, dt, d) {
    if (e.chg) {
      const c = e.chg; c.t -= dt;
      if (c.aim) { e.anim = 'idle'; if (c.t <= 0) { c.aim = false; c.t = 0.9; } return true; }
      moveBy(e, c.dx, c.dy, e.speed * 3.4, dt); e.anim = 'run'; e.runPh += dt * 3;
      if (!c.hit && gdist(P, e) < e.rad + 40 && P.dead <= 0) {
        c.hit = true; hurtPlayer(26 * e.dm); P.x += c.dx * 120; P.y += c.dy * 120 * YK; collide(P); snd('boss_slam', 0.6, 1.2);
      }
      if (c.t <= 0) e.chg = null;
      return true;
    }
    if (!e.act && e.mt <= 0 && d > 220 && d < 650) {
      const [dx, dy] = dirTo(e, P.x, P.y); e.chg = { aim: true, t: 0.65, dx, dy }; e.mt = 7; e.row = runRow(P.x - e.x, P.y - e.y); tag(e, 'Таран!');
      return true;
    }
  },
  // элита Мремире: призывает мертвецов
  mremireh(e) {
    if (!e.act && e.mt <= 0 && !(e.silT > 0) && enemies.length < 18) {
      e.mt = 10; tag(e, 'Восстаньте!', '#c9a8ff');
      startAct(e, 'cast', 1.0, 0.6, () => raise(e, 2));
      return true;
    }
  },
  // элита Варрок: удар по земле вокруг себя
  warrok(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 200) { e.mt = 5; warn(e.x, e.y, 150, 0.75, 34 * e.dm); startAct(e, 'atk', 0.85, 2, () => {}); return true; }
  },

  // ---------- боссы миров (вдобавок к общим приёмам: удар, прыжок, землетрясение, призыв) ----------
  // Мутант: во второй фазе рёв замедляет героя рядом
  mutant(e, dt, d) {
    if (e.phase >= 2 && !e.act && e.mt <= 0 && d < 520) {
      e.mt = e.phase >= 3 ? 7 : 11; tag(e, 'РЁВ!', '#ff7a5a');
      startAct(e, 'cast', 1.1, 0.45, () => {
        if (gdist(P, e) < 520) { slowHero(0.5, 2.5); say(P.x, P.y - CH * HS(), 'замедление', '#9fd0ff'); }
        fx.push({ type: 'quake', x: e.x, y: e.y, t: 0, dur: 0.8, R: 260 }); snd('boss_roar', 1, 0.9);
      });
      return true;
    }
  },
  // Мо: ядовитые лужи вокруг героя одна за другой
  maw(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 900) {
      e.mt = e.phase >= 2 ? 7 : 10; tag(e, 'Яд!', '#9be37a');
      startAct(e, 'cast', 1.0, 0.4, () => {
        const n = e.phase >= 3 ? 5 : 3;
        for (let i = 0; i < n; i++) {
          const a = rnd(0, 6.283), r = i ? rnd(80, 220) : 0;
          warn(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, 95, 1.0 + i * 0.35, 22 * e.dm, { onHitP: () => slowHero(0.7, 1.5) });
        }
      });
      return true;
    }
  },
  // Тыквенный громила: ударная волна — три удара с растущим радиусом
  pumpkin(e, dt, d) {
    if (!e.act && e.mt <= 0 && d < 520) {
      e.mt = e.phase >= 2 ? 8 : 11; tag(e, 'Сотрясение!', '#ffb347');
      startAct(e, 'cast', 1.3, 0.3, () => { [[150, 0.6], [270, 1.0], [400, 1.45]].forEach(([R, t], i) => warn(e.x, e.y, R, t, (30 - i * 6) * e.dm, { big: i === 2 })); });
      return true;
    }
    // в последней фазе зовёт гоблинов
    if (e.phase >= 3 && !e.act && e.mt2 <= 0 && enemies.length < 14) { e.mt2 = 14; tag(e, 'Жатва!', '#ffb347'); startAct(e, 'cast', 1.0, 0.5, () => raise(e, 3, 'goblin')); return true; }
  },
  // Демон: огненный дождь; во второй фазе — кольцо огненных шаров; в третьей — появляется за спиной героя
  demon(e, dt, d) {
    if (e.act) return;
    if (e.phase >= 3 && e.mt2 <= 0 && d > 350) {
      e.mt2 = 9; const [dx, dy] = dirTo(e, P.x, P.y);
      fx.push({ type: 'quake', x: e.x, y: e.y, t: 0, dur: 0.6, R: 90 });
      e.x = P.x + dx * 150; e.y = P.y + dy * 150 * YK; collide(e);
      fx.push({ type: 'quake', x: e.x, y: e.y, t: 0, dur: 0.6, R: 90 }); tag(e, 'За спиной!', '#ff5a3a');
    }
    if (e.phase >= 2 && e.mt3 <= 0) {
      e.mt3 = 7;
      startAct(e, 'leap', 0.9, 0.55, () => { for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; fireball(e, Math.cos(a), Math.sin(a), 24 * e.dm, 420); } snd('enemy_fireball', 0.9, 0.8); });
      return true;
    }
    if (e.mt <= 0 && d < 1000) {
      e.mt = 9; tag(e, 'Огненный дождь!', '#ff8a4a');
      startAct(e, 'cast', 1.2, 0.35, () => {
        for (let i = 0; i < 6; i++) { const a = rnd(0, 6.283), r = i ? rnd(60, 260) : 0; warn(P.x + Math.cos(a) * r, P.y + Math.sin(a) * r * YK, 90, 0.9 + i * 0.22, 30 * e.dm); }
      });
      return true;
    }
  },
};
// особые попадания снарядов
const SHOT_HIT = {
  zlorp: () => { slowHero(0.65, 1.8); say(P.x, P.y - CH * HS(), 'замедление', '#9fd0ff'); },
};
KIND.war.steal = 0.6;   // вампир лечится на часть нанесённого урона
KIND.min.rise = 0.3;    // зомби иногда встаёт после смерти (один раз)

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
  const m = MECH[e.type];
  if (m && !e.kb && !(e.root > 0) && !(P.dead > 0) && !e.leap && !(e.silT > 0 && !e.boss)) {
    if (m(e, dt, gdist(P, e)) === true) return;
  }
  const ns = shots.length, hp0 = P.hp;
  _updateEnemy(e, dt);
  for (let i = ns; i < shots.length; i++) { shots[i].src = e; if (SHOT_HIT[e.type]) shots[i].onHitP = SHOT_HIT[e.type]; }
  if (P.hp < hp0) {
    if (e.k.steal) { const h = (hp0 - P.hp) * e.k.steal; e.hp = Math.min(e.max, e.hp + h); say(e.x, headY(e) + 20, '+' + Math.round(h), '#7dff8a'); }
    if (e.type === 'goblin') e.ret = 0.6;
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
