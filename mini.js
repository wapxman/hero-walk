// 28 новых мини-боссов (пакет Клауди 20.11, MINIBOSS_FOR_KLOD.md): умения. Виды и места — combat.js (KIND.mb_*, ROSTER.mini).
// Движок — sk.js: первое умение через 1,5–3 с после выхода, дальше по откату. Каст — лист cast1 / cast2, картинка
// эффекта — vfx1 / vfx2 мини-босса (придут пакетом листов; пока их нет, мини-босс не выходит — вместо него элита).
'use strict';
(() => {
  const { img, proj, beam, line, mark, ring, ground, groundImg, zone, MOV, S, bind, pin, stun, DEF, ON_HIT, dist, dirTo2, tag, say2, HEAD } = SK;
  const channel = SK.channelFn;
  const V1 = e => (e.ch.vfx && e.ch.vfx[0] && e.ch.vfx[0].img) || null;
  const V2 = e => (e.ch.vfx && e.ch.vfx[1] && e.ch.vfx[1].img) || null;
  const alive = e => e.dieT == null && e.hp > 0;
  // отложенное действие: идёт по игровому времени (на паузе стоит), не срабатывает, если мини-босс погиб
  const after = (t, e, fn) => MOV.push({ t: 0, dur: t, update(m) { if (!m.done && m.t >= m.dur) { m.done = 1; if (!e || alive(e)) fn(); } } });
  const dot = (dm, t, kind) => MOV.push({ t: 0, dur: t, acc: 1, update(m, dt) { m.acc -= dt; if (m.acc <= 0) { m.acc += 1; hurtPlayer(dm, kind || 'poison'); } } });
  const near = (x, y, R) => P.dead <= 0 && Math.hypot(P.x - x, (P.y - y) / YK) < R;
  const push = (dx, dy, d, t) => { S.pull = { x: P.x + dx * d, y: P.y + dy * d * YK, t: t || 0.25 }; };
  const hold = (anim, dur) => ({ anim, dur, at: 2, fn() {}, t: dur * 0.4, hit: false });
  const face = (e, dx, dy) => { e.row = runRow(dx, dy); };
  const tele = (e, x, y) => { e.x = x; e.y = y; collide(e); };
  // мини-босс сам оглушён (врезался, передержал склянку)
  function selfStun(e, t) { e.act = hold('idle', t); e.skBusy = t; e.skMove = null; tag(e, 'оглушён', '#ffe27a'); after(t, e, () => { if (e.act && e.act.anim === 'idle') e.act = null; }); }
  // сколько можно пройти от героя по прямой до стены, края или препятствия (не дальше max); -1 — путь свободен
  function wallAhead(dx, dy, max) {
    const o = { x: P.x, y: P.y, rad: 22 };
    for (let d = 20; d <= max; d += 20) { const nx = o.x + dx * 20, ny = o.y + dy * 20 * YK; o.x = nx; o.y = ny; collide(o); if (Math.hypot(o.x - nx, o.y - ny) > 6) return d; }
    return -1;
  }
  // точка на полосе от (x, y) по (dx, dy): герой внутри?
  function inStrip(x, y, dx, dy, len, w) { const px = P.x - x, py = (P.y - y) / YK, al = px * dx + py * dy; return P.dead <= 0 && al > 0 && al < len && Math.abs(px * dy - py * dx) < w / 2 + 20; }
  // движение мини-босса по прямой с доворотом (тараны, комья): onHit — задел героя, onStop — упёрся или кончился путь
  function charge(e, o) {
    let t = 0, trav = 0, ang = null, drop = 0;
    e.act = hold(o.an, 4);
    e.skMove = dt => {
      if (!alive(e)) { e.skMove = null; return; }
      t += dt;
      const [hx, hy, d] = dirTo2(e, P);
      if (ang == null || t < o.wind) { ang = Math.atan2(hy, hx); face(e, hx, hy); if (t < o.wind) return; }
      if (o.turn) { let da = Math.atan2(hy, hx) - ang; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; ang += Math.max(-o.turn * dt, Math.min(o.turn * dt, da)); }
      const dx = Math.cos(ang), dy = Math.sin(ang), st = o.sp * dt, x0 = e.x, y0 = e.y;
      e.x += dx * st; e.y += dy * st * YK; collide(e); trav += st; face(e, dx, dy);
      if (o.trail && (drop -= st) <= 0) { drop = 90; o.trail(e); }
      const end = () => { e.skMove = null; e.act = null; };
      if (d < e.rad + 48 && P.dead <= 0) { end(); o.onHit(dx, dy); }
      else if (Math.hypot(e.x - x0, (e.y - y0) / YK) < st * 0.4 || trav > o.max || t > (o.wind || 0) + (o.time || 9)) { end(); if (o.onStop) o.onStop(); }
    };
  }

  // ---------- состояния героя от мини-боссов ----------
  // vuln — получает больше урона (кислота), miss — часть атак мимо (паутина), sleep — кошмар, astral — в темнице (неуязвим)
  Object.assign(S, { vuln: 0, miss: 0, sleep: 0, astral: 0 });
  MOV.push({ t: 0, dur: 1e9, update(m, dt) { for (const k of ['vuln', 'miss', 'sleep', 'astral']) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt); if (S.sleep > 0 || S.astral > 0) S.bind = Math.max(S.bind, 0.1); } });
  {
    const _hp = hurtPlayer;
    hurtPlayer = function (d, kind) {
      if (P.dead > 0) { S.vuln = S.miss = S.sleep = S.astral = 0; return _hp(d, kind); }
      if (S.astral > 0) return;                                                   // в астральной темнице герой неуязвим
      if (S.sleep > 0 && kind !== 'nightmare') { S.sleep = 0; S.bind = 0; say2('проснулся', '#c9a8ff'); }   // любой другой урон будит
      if (S.vuln > 0) d *= 1.15;
      return _hp(d, kind);
    };
    const _sh = shoot;
    shoot = function () {
      if (S.miss > 0 && Math.random() < 0.3 && P.atkCd <= 0) { P.atkCd = 0.5; say2('промах', '#c0c0c0'); return; }   // оплетён паутиной
      for (const c of COGS) if (c.t < c.dur && dist(P, c) > c.R - 70) { c.hits++; if (c.hits >= 2) { c.t = c.dur; say2('шестерня сломана', '#ffb36a'); } }
      return _sh();
    };
    const _mu = STATUS.mute; STATUS.mute = () => _mu() || S.sleep > 0 || S.astral > 0;   // во сне и в темнице умения не работают
    const _dp = drawPlayer;
    drawPlayer = function () { if (S.astral > 0 && P.dead <= 0) return; _dp(); };   // героя в темнице не видно (над ним сфера-метка)
  }
  const COGS = [];   // кольца шестерёнок гнома: ломаются двумя ударами героя у края

  // ---------- урон по мини-боссам: грани Преломления, ртутный щит, откат времени, яйцо феникса ----------
  {
    const _he = hurtEnemy;
    hurtEnemy = function (e, dmg, col) {
      if (e.hp <= 0) return;
      const now = performance.now() / 1000;
      if (e.egg) {   // Сверхновая: яйцо разбивают 5 ударами
        if (now - (e.egg.last || 0) > 0.15) { e.egg.last = now; e.egg.hits++; tag(e, 'трещина ' + e.egg.hits + '/5', '#ffd95e'); if (e.egg.hits >= 5) { e.egg = null; e.hide = 0; tag(e, 'яйцо разбито!', '#ffd95e'); return _he(e, e.max * 10, col); } }
        return;
      }
      if (e.refr > 0 && !P.trueShot) { if (now - (e.refrLast || 0) > 0.12) { e.refrLast = now; e.refr--; tag(e, e.refr ? 'грань разбита' : 'щит разбит!', '#c9a8ff'); if (!e.refr) refrOff(e); } return; }
      if (e.absorb > 0 && !P.trueShot) { const m = P.dmgMul || 1, a = Math.min(e.absorb, dmg * m); e.absorb -= a; dmg -= a / m; if (e.absorb <= 0) tag(e, 'щит разбит', '#d0d0ff'); if (dmg <= 0) return; }
      const hp0 = e.hp;
      if (e.type === 'mb_phoenix' && !e.nova) {   // один раз, на 40 % здоровья — яйцо вместо смерти
        const est = dmg * (P.dmgMul || 1);
        if (e.hp - est <= e.max * 0.4) { supernova(e); return; }
      }
      _he(e, dmg, col);
      if (e.type === 'mb_timekeeper' && e.hp > 0) { (e.log || (e.log = [])).push({ t: now, d: hp0 - e.hp }); while (e.log.length && now - e.log[0].t > 2) e.log.shift(); }
    };
  }
  function refrOff(e) { if (e.dm0) { e.dm = e.dm0; e.dm0 = 0; } e.refr = 0; }
  function supernova(e) {
    e.nova = 1; e.untarget = 0; e.hp = Math.round(e.max * 0.4); e.egg = { hits: 0 }; e.hide = 1; e.act = hold('cast2', 6.2); e.skBusy = 6.2; e.skMove = dt => { if (!e.egg) e.skMove = null; };
    tag(e, 'Сверхновая!', '#ffd95e'); say2('разбей яйцо — 5 ударов!', '#ffd95e');
    const egg = mark({ img: V2(e), on: e, at: 70, dur: 6, size: 190, add: 1, until: () => !e.egg || !alive(e) });
    MOV.push({ t: 0, dur: 6, update(m) {
      egg.size = 190 + 40 * Math.sin(m.t * 8) * (m.t / 6);
      if (!e.egg || !alive(e)) { m.t = m.dur; return; }
      if (m.t >= m.dur) {   // не успели: вспышка и возрождение
        e.egg = null; e.hide = 0; e.act = null; e.skMove = null; e.hp = Math.round(e.max * 0.5);
        groundImg(V2(e), e.x, e.y, 500, 0.9, { add: 1, grow: 0.3 });
        if (near(e.x, e.y, 500)) { hurtPlayer(120 * e.dm, 'fire'); stun(1.5); }
        tag(e, 'возродился!', '#ffd95e');
      }
    } });
  }

  // ===================== Мир 1: Королевский замок =====================
  DEF.mb_arbalest = [
    { ph: 'Шрапнель', col: '#ffb36a', cd: 10, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 900,
      cast(e) { const x = P.x, y = P.y; warn(x, y, 220, 0.8, 0);
        after(0.8, e, () => { groundImg(V1(e), x, y, 220, 3, { rot: 0.4 }); zone({ x, y, R: 220, dur: 3, tick: 1, onTick: () => hurtPlayer(14 * e.dm), onStay: () => slowHero(0.75, 0.2) }); }); } },
    { ph: 'Прицельный выстрел', col: '#ff5a5a', cd: 14, first: 6, can: (e, d) => d < 1000,
      cast(e) { beam(e, { img: V2(e), dur: 1.8, w: 16 }); mark({ img: V2(e), dur: 1.8, size: 90, spin: 2 });
        channel(e, 'cast2', 1.8, { breakPct: 0.1, breakFar: 1100, stop(broke) { if (!broke) proj(e, { img: V2(e), sp: 1600, left: 1300, w: 70, size: 110, onHit() { hurtPlayer(90 * e.dm); stun(0.6); } }); } }); } },
  ];
  DEF.mb_executioner = [
    { ph: 'Кандалы', col: '#c0c0c0', cd: 13, an: 'cast1', dur: 0.7, at: 0.55, can: (e, d) => d < 700,
      cast(e) { const m = mark({ img: V1(e), dur: 2.1, at: HEAD() * 0.5, size: 150 }); bind(2);
        channel(e, 'cast1', 2, { breakPct: 0.08, tick(dt) { m.acc2 = (m.acc2 || 0) + dt; if (m.acc2 >= 1) { m.acc2 -= 1; hurtPlayer(15 * e.dm); } }, stop() { S.bind = 0; m.dur = m.t; } }); } },
    { ph: 'Плаха', col: '#ff5a3a', cd: 12, first: 5, can: (e, d) => d < 300 && d > 60,
      cast(e) { leapTo(e, P.x, P.y, 0.35, 0, 0, 'cast2');
        after(0.4, e, () => { groundImg(V2(e), e.x, e.y, 150, 0.6, { add: 1 }); if (dist(P, e) > 150) return;
          const low = P.hp / P.maxHp < 0.3; hurtPlayer((low ? 180 : 60) * e.dm);
          if (low && e.sk && e.sk[1]) { e.sk[1].cd = 0; tag(e, 'казнь!', '#ff5a3a'); } }); } },
  ];
  DEF.mb_bannerlord = [
    { ph: 'Королевское копьё', col: '#ffd95e', cd: 12, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d < 900,
      cast(e) { proj(e, { img: V1(e), sp: 1100, left: 900, w: 100, size: 150,
        onHit(p) { hurtPlayer(60 * e.dm); const w = wallAhead(p.dx, p.dy, Math.max(60, p.left));
          const s1 = SOFT1();   // v101: в мире 1 на первом круге копьё только отталкивает — первое оглушение в игре ждёт в мире 2
          if (w > 0) { push(p.dx, p.dy, Math.max(0, w - 20), 0.2); if (!s1) { stun(1.6); say2('пригвождён!', '#ffd95e'); } } else { push(p.dx, p.dy, Math.min(p.left, 320), 0.3); if (!s1) stun(0.4); } } }); } },
    { ph: 'Рыцарский круг', col: '#ffd95e', cd: 20, first: 6, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 380,
      cast(e) { const c = { x: e.x, y: e.y, R: 420 }; ring({ img: V2(e), x: c.x, y: c.y, R: 420, dur: 5.5, delay: 0.5 });
        MOV.push({ t: 0, dur: 5.5, acc: 0, update(m, dt) { if (m.t < 0.5) return;
          for (const s of shots) if (s.own === 'p' && dist(s, c) > c.R) s.left = 0;   // снаряды героя наружу не пролетают
          m.acc -= dt; if (dist(P, c) > c.R - 70 && m.acc <= 0) { m.acc = 1; hurtPlayer(20 * e.dm); say2('копьё щитоносца', '#ffd95e'); } } }); } },
  ];

  // ===================== Мир 2: Горящая деревня =====================
  DEF.mb_plaguedoc = [
    { ph: 'Кислотный туман', col: '#9be37a', cd: 11, an: 'cast1', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
      cast(e) { const x = P.x, y = P.y; proj(e, { img: V1(e), sp: 700, left: Math.max(60, dist(P, e) - 40), w: 0, size: 70, spin: 8, arc: 1,
        onEnd() { groundImg(V1(e), x, y, 250, 5, { rot: 0.2, a: 0.85 }); zone({ x, y, R: 250, dur: 5, tick: 1, onTick: () => hurtPlayer(10 * e.dm, 'poison'), onStay: () => { S.vuln = 0.3; } }); } }); } },
    { ph: 'Нестабильная склянка', col: '#ffb36a', cd: 14, first: 6, can: (e, d) => d < 900,
      cast(e) { const T = 1.5 + Math.random() * 1.5, over = Math.random() < 0.15, k = (T - 1.5) / 1.5;
        const b = mark({ img: V2(e), on: e, at: e.ch.top * e.ch.U * e.sc * 1.05, dur: T + 0.3, size: 50 });
        channel(e, 'cast2', T + (over ? 0.3 : 0), { tick(dt, t) { b.size = 50 + 60 * t / 3; }, stop(broke) { b.dur = b.t; if (broke) return;
          if (over) { e.hp = Math.max(1, e.hp - e.max * 0.1); groundImg(V2(e), e.x, e.y, 120, 0.6, { add: 1 }); selfStun(e, 1.5); tag(e, 'передержал!', '#ffb36a'); return; }
          proj(e, { img: V2(e), sp: 750, left: 1000, w: 80, size: 80 + 40 * k, spin: 10, onHit() { hurtPlayer((30 + 60 * k) * e.dm); stun(0.5 + 1.5 * k); } }); } }); } },
  ];
  DEF.mb_firebull = [
    { ph: 'Огненный таран', col: '#ff7a3a', cd: 14, can: (e, d) => d > 260 && d < 1200,
      cast(e) { charge(e, { an: 'cast1', wind: 0.8, sp: 700, turn: 1.6, max: 1400, time: 3,
        trail: b => { groundImg(V1(e), b.x, b.y, 70, 3, { a: 0.8 }); zone({ x: b.x, y: b.y, R: 70, dur: 3, tick: 1, acc: 0.3, onTick: () => hurtPlayer(15 * e.dm, 'fire') }); },
        onHit(dx, dy) { hurtPlayer(55 * e.dm); stun(1.2); push(dx, dy, 180, 0.3); },
        onStop() { selfStun(e, 1); } }); } },
    { ph: 'Копытный раскол', col: '#ff5a2a', cd: 12, first: 5, an: 'cast2', dur: 0.9, at: 0.6, can: (e, d) => d < 1000,
      cast(e) { const [dx, dy] = dirTo2(e, P), x = e.x, y = e.y; line(e, { img: V2(e), len: 1000, w: 120, run: 0.5, dur: 2.1 });
        after(1.6, null, () => { if (inStrip(x, y, dx, dy, 1000, 120)) { hurtPlayer(50 * e.dm, 'fire'); slowHero(0.6, 3); } snd('boss_slam', 0.7, 0.9); }); } },
  ];

  // ===================== Мир 3: Осенний лес =====================
  DEF.mb_weaver = [
    { ph: 'Шёлковая бола', col: '#f0e6c8', cd: 9, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d < 800,
      cast(e) { proj(e, { img: V1(e), sp: 700, left: 900, w: 80, size: 100, spin: 9, onHit() { hurtPlayer(25 * e.dm); slowHero(0.5, 3); S.miss = 3; say2('оплетён', '#f0e6c8'); } }); } },
    { ph: 'Выводок', col: '#ffb347', cd: 18, first: 5, an: 'cast2', dur: 0.9, at: 0.6, can: () => enemies.filter(o => o.type === 'sk_spiderling' && alive(o)).length <= 4,
      cast(e) { groundImg(V2(e), e.x, e.y, 120, 0.7);
        for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.8; spawnEnemyBase('sk_spiderling'); const m = enemies[enemies.length - 1]; tele(m, e.x + Math.cos(a) * 70, e.y + Math.sin(a) * 70 * YK); m.dm = e.dm;
          after(12, m, () => { m.hp = 0; m.dieT = 0; m.anim = 'die'; m.act = null; corpses.push(m); }); } } },
  ];
  DEF.mb_moonhuntress = [
    { ph: 'Лунный луч', col: '#bfe6ff', cd: 8, an: 'cast1', dur: 0.6, at: 0.5, can: (e, d) => d < 900,
      cast(e) { const x = P.x, y = P.y; warn(x, y, 100, 0.3, 0, { onHitP() { hurtPlayer(45 * e.dm); stun(0.8); } }); after(0.3, null, () => groundImg(V1(e), x, y, 110, 0.6, { add: 1 })); } },
    { ph: 'Затмение', col: '#8aa8ff', cd: 20, first: 7, an: 'cast2', dur: 0.9, at: 0.5,
      cast(e) {
        MOV.push({ t: 0, dur: 3.4, n: 0, update(m) {
          while (m.n < 6 && m.t >= m.n * 0.5) { m.n++; const lead = P.moving ? 90 : 0, x = P.x + P.face.x * lead, y = P.y + P.face.y * lead * YK;
            warn(x, y, 95, 0.4, 30 * e.dm); after(0.4, null, () => groundImg(V1(e), x, y, 100, 0.5, { add: 1 })); } },
          draw(m) { const a = Math.min(1, m.t / 0.3, (m.dur - m.t) / 0.4) * 0.42; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = 'rgba(6,10,30,' + Math.max(0, a) + ')'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height); ctx.restore(); } }); } },
  ];

  // ===================== Мир 4: Проклятое болото =====================
  DEF.mb_drownedbride = [
    { ph: 'Плач невесты', col: '#7affd8', cd: 12, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { const [dx, dy] = dirTo2(e, P); line(e, { img: V1(e), len: 800, w: 240, run: 0.4, dur: 0.9, onHit() { hurtPlayer(55 * e.dm); push(dx, dy, 250, 0.3); } }); } },
    { ph: 'Обручальная нить', col: '#7affd8', cd: 14, first: 5, an: 'cast2', dur: 0.7, at: 0.5, can: (e, d) => d < 700,
      cast(e) { const b = { img: V2(e), dur: 4, w: 26, add: 1 }; beam(e, b);
        MOV.push({ t: 0, dur: 4, acc: 1, update(m, dt) {
          if (!alive(e) || dist(P, e) > 850 || P.dead > 0) { m.t = m.dur; b.t = b.dur; if (alive(e) && P.dead <= 0) say2('нить порвана', '#7affd8'); return; }
          slowHero(0.8, 0.2); m.acc -= dt; if (m.acc <= 0) { m.acc += 1; hurtPlayer(12 * e.dm); e.hp = Math.min(e.max, e.hp + 12 * e.dm); } } }); } },
  ];
  DEF.mb_crocodile = [
    { ph: 'Бросок из трясины', col: '#8a9a5a', cd: 11, can: (e, d) => d > 250 && d < 1000,
      cast(e) { const d0 = dist(P, e); charge(e, { an: 'cast1', wind: 1, sp: 950, turn: 0, max: Math.max(600, Math.min(1000, d0 + 150)), time: 1.3,
        onHit(dx, dy) { hurtPlayer(45 * e.dm); if (!FIRST()) stun(0.8); push(-dy, dx, 150, 0.25); }   /* v101: на первом круге у крокодила одно оглушение — «Костолом» */ }); } },
    { ph: 'Костолом', col: '#ff8a5a', cd: 16, first: 5, can: (e, d) => d < 170,
      cast(e) { stun(2.2); say2('схвачен!', '#ff8a5a'); let n = 0;
        channel(e, 'cast2', 2.2, { breakPct: 0.1, tick(dt, t) { if (n < 3 && t >= 0.5 + 0.7 * n) { n++; hurtPlayer(25 * e.dm); groundImg(V2(e), P.x, P.y, 220, 0.5); snd('boss_slam', 0.7, 1.1); } },
          stop(broke) { if (broke && P.ss) { P.ss.stun = 0; say2('вырвался!', '#b9ffcf'); } } }); } },
  ];
  DEF.mb_hydra = [
    { ph: 'Тройное дыхание', col: '#9be37a', cd: 10, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 600,
      cast(e) { line(e, { img: V1(e), len: 600, w: 260, run: 0.4, dur: 1.0, onHit() { hurtPlayer(12 * e.dm, 'fire'); dot(12 * e.dm, 4); slowHero(0.7, 3); } }); } },
    { ph: 'Ядовитая река', col: '#b9e37a', cd: 18, first: 6, an: 'cast2', dur: 0.9, at: 0.55, can: (e, d) => d < 1100,
      cast(e) { line(e, { img: V2(e), len: 1100, w: 160, run: 0.6, dur: 6.6, onStay(l, dt) { l.acc = (l.acc || 0) - dt; if (l.acc <= 0) { l.acc = 0.5; hurtPlayer(10 * e.dm, 'poison'); } } }); } },
  ];

  // ===================== Мир 5: Гномьи шахты =====================
  DEF.mb_steamdwarf = [
    { ph: 'Кольцо шестерёнок', col: '#ffb36a', cd: 16, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d < 190,
      cast(e) { const c = ring({ img: V1(e), x: e.x, y: e.y, R: 220, dur: 5 }); c.hits = 0; COGS.push(c);
        MOV.push({ t: 0, dur: 5.2, acc: 0, update(m, dt) { m.acc -= dt; if (c.t < c.dur && dist(P, c) > c.R - 45 && m.acc <= 0) { m.acc = 1; hurtPlayer(20 * e.dm); const [dx, dy] = dirTo2(P, c); push(dx, dy, 90, 0.2); }
          if (m.t >= m.dur) { const i = COGS.indexOf(c); if (i >= 0) COGS.splice(i, 1); } } }); } },
    { ph: 'Паровой крюк', col: '#ffb36a', cd: 12, first: 5, an: 'cast2', dur: 0.7, at: 0.5, can: (e, d) => d > 200 && d < 1000,
      cast(e) { proj(e, { img: V2(e), sp: 1400, left: 1000, w: 80, size: 110, rope: e,
        onHit() { let t = 0; e.act = hold('cast2', 1); e.skMove = dt => { t += dt; const [dx, dy, d] = dirTo2(e, P); if (d > e.rad + 50 && t < 1.2) { e.x += dx * 1300 * dt; e.y += dy * 1300 * YK * dt; face(e, dx, dy); return; }
          e.skMove = null; e.act = null; collide(e); if (d < e.rad + 110) { hurtPlayer(40 * e.dm); stun(1); } }; } }); } },
  ];
  DEF.mb_trollminer = [
    { ph: 'Веер кирок', col: '#9fd8ff', cd: 9, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d < 800,
      cast(e) { const [dx, dy] = dirTo2(e, P), a0 = Math.atan2(dy, dx);
        for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.131; proj(e, { img: V1(e), dx: Math.cos(a), dy: Math.sin(a), sp: 800, left: 800, w: 60, size: 90, spin: 14, onHit() { hurtPlayer(18 * e.dm); slowHero(0.7, 2); } }); } } },
    { ph: 'Боевой транс', col: '#ff5a5a', cd: 22, first: 6, an: 'cast2', dur: 0.8, at: 0.5,
      cast(e) { e.trance = 5; const sp0 = e.speed; e.speed *= 1.25; mark({ img: V2(e), on: e, at: e.ch.top * e.ch.U * e.sc * 0.5, dur: 5, size: 220, add: 1 });
        MOV.push({ t: 0, dur: 5, update(m, dt) { e.trance = Math.max(0, 5 - m.t); if (e.atkCd > 0) e.atkCd -= dt * 0.8; if (m.t >= m.dur || !alive(e)) { e.speed = sp0; e.trance = 0; } } }); } },
  ];
  ON_HIT.mb_trollminer = e => { if (e.trance > 0) e.hp = Math.min(e.max, e.hp + (e.k.dmg[0] + e.k.dmg[1]) / 2 * e.dm * 0.2); };   // вампиризм 20 % в трансе
  DEF.mb_gemscorpion = [
    { ph: 'Подкоп', col: '#ff9ad8', cd: 12, can: (e, d) => d > 180 && d < 700,
      cast(e) { const [dx, dy, d] = dirTo2(e, P), tx = P.x, ty = P.y; e.hide = 1; e.untarget = 0.9; e.skBusy = 0.9; e.act = hold('cast1', 0.9);
        line(e, { img: V1(e), len: d, w: 110, run: 0.5, dur: 1.1 });
        after(0.8, e, () => { e.hide = 0; e.act = null; tele(e, tx - dx * 70, ty - dy * 70 * YK); if (near(tx, ty, 120)) { hurtPlayer(50 * e.dm); stun(1.2); say2('подброшен!', '#ff9ad8'); } }); } },
    { ph: 'Эпицентр', col: '#ffb36a', cd: 22, first: 7, can: (e, d) => d < 650,
      cast(e) { channel(e, 'cast2', 2, { breakPct: 0.1, stop(broke) { if (broke) return;
        for (let i = 0; i < 6; i++) after(i * 0.5, e, () => { const R = 200 + 80 * i; groundImg(V2(e), e.x, e.y, R, 0.5, { grow: 0.25 }); if (near(e.x, e.y, R)) { hurtPlayer(15 * e.dm); slowHero(0.7, 1); } snd('boss_slam', 0.5, 1.2); }); } }); } },
  ];

  // ===================== Мир 6: Ледяные вершины =====================
  DEF.mb_snowfairy = [
    { ph: 'Иллюзорная сфера', col: '#bfe6ff', cd: 9, an: 'cast1', dur: 0.6, at: 0.5, can: (e, d) => d < 1000,
      cast(e) { const jump = p => { if (p.tp || !alive(e)) return; p.tp = 1; groundImg(V1(e), e.x, e.y, 70, 0.4, { add: 1 }); tele(e, p.x, p.y); };
        proj(e, { img: V1(e), orb: V1(e) ? null : '190,230,255', sp: 450, left: 1000, w: 90, size: 80, pierce: true, add: 1, onHit() { hurtPlayer(35 * e.dm, 'cold'); }, trail(p) { if (p.t >= 1.5) { jump(p); p.left = 0; } }, onEnd: jump }); } },
    { ph: 'Ледяные путы', col: '#9fd8ff', cd: 16, first: 5, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { const c = { x: P.x, y: P.y }; const g = groundImg(V2(e), c.x, c.y, 300, 4, { rot: 0.5 }); hurtPlayer(25 * e.dm, 'cold');
        MOV.push({ t: 0, dur: 4, update(m) { if (P.dead > 0) { m.t = m.dur; return; } if (dist(P, c) > 300) { m.t = m.dur; g.dur = g.t + 0.3; hurtPlayer(50 * e.dm, 'cold'); stun(1.5); say2('путы разорваны!', '#9fd8ff'); } } }); } },
  ];
  DEF.mb_walrus = [
    { ph: 'Снежный ком', col: '#e8f4ff', cd: 14, can: (e, d) => d > 250 && d < 1200,
      cast(e) { const b = mark({ img: V1(e), on: e, at: 60, dur: 4, size: 120, spin: 8, until: () => !e.skMove });
        charge(e, { an: 'cast1', wind: 0.4, sp: 600, turn: 2.2, max: 1900, time: 3, trail: () => { b.size = Math.min(260, b.size + 14); },
          onHit(dx, dy) { hurtPlayer(50 * e.dm, 'cold'); stun(1); groundImg(V1(e), e.x, e.y, 150, 0.5); } }); } },
    { ph: 'Моржовый удар', col: '#7ad0ff', cd: 12, first: 5, an: 'cast2', dur: 0.9, at: 0.65, can: (e, d) => d < 150,
      cast(e) { if (dist(P, e) > 175) return; hurtPlayer(80 * e.dm); stun(1); say2('МОРЖОВЫЙ УДАР!', '#7ad0ff'); mark({ img: V2(e), dur: 0.8, at: HEAD() * 0.6, size: 170 });
        after(1, null, () => slowHero(0.6, 2)); } },
  ];
  DEF.mb_wyvern = [
    { ph: 'Осколочный взрыв', col: '#9fd8ff', cd: 9, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d < 900,
      cast(e) { const burst = p => { if (p.done) return; p.done = 1; groundImg(V1(e), p.x, p.y, 300, 0.7, { add: 1, grow: 0.25 }); if (near(p.x, p.y, 300)) { hurtPlayer(40 * e.dm, 'cold'); slowHero(0.6, 3); } };
        proj(e, { img: V1(e), orb: V1(e) ? null : '170,220,255', sp: 700, left: Math.min(1000, dist(P, e) + 40), w: 70, size: 70, onHit: burst, onEnd: burst }); } },
    { ph: 'Зимнее проклятие', col: '#7ad0ff', cd: 18, first: 6, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 900,
      cast(e) { mark({ img: V2(e), dur: 3, at: HEAD() * 0.5, size: 190 });
        after(0.5, null, () => { if (P.dead > 0) return; STATUS.add('freeze', 2.5); after(2.5, null, () => hurtPlayer(30 * e.dm, 'cold')); }); } },
  ];

  // ===================== Мир 7: Руины Зеркального города =====================
  DEF.mb_templar = [
    { ph: 'Преломление', col: '#c9a8ff', cd: 18, an: 'cast1', dur: 0.7, at: 0.5,
      cast(e) { e.refr = 4; if (!e.dm0) { e.dm0 = e.dm; e.dm *= 1.3; }
        mark({ img: V1(e), on: e, at: e.ch.top * e.ch.U * e.sc * 0.5, dur: 8, size: 200, add: 1, until: () => !(e.refr > 0) }); after(8, e, () => refrOff(e)); } },
    { ph: 'Пси-ловушки', col: '#c9a8ff', cd: 12, first: 5, an: 'cast2', dur: 0.7, at: 0.5, can: (e, d) => d < 700,
      cast(e) { for (let i = 0; i < 3; i++) { const a = Math.random() * 6.283, r = 80 + Math.random() * 90, x = P.x + Math.cos(a) * r, y = P.y + Math.sin(a) * r * YK;
        const g = groundImg(V2(e), x, y, 70, 1.4, { rot: 2 });
        MOV.push({ t: 0, dur: 1, update(m) { if ((m.t > 0.25 && near(x, y, 60)) || m.t >= m.dur) { if (m.done) return; m.done = 1; m.t = m.dur; g.dur = g.t + 0.25;
          groundImg(V2(e), x, y, 110, 0.4, { add: 1 }); if (near(x, y, 110)) { hurtPlayer(30 * e.dm); slowHero(0.5, 2); } } } }); } } },
  ];
  DEF.mb_mercury = [
    { ph: 'Астральный шаг', col: '#d0d0ff', cd: 10, can: (e, d) => d > 120 && d < 560,
      cast(e) { const [dx, dy, d] = dirTo2(e, P), len = Math.min(700, d + 150); let trav = 0, hitH = false; line(e, { img: V1(e), len, w: 90, run: 0.25, dur: 0.8 }); e.act = hold('cast1', 1);
        e.skMove = dt => { const st = 1900 * dt; e.x += dx * st; e.y += dy * st * YK; trav += st; face(e, dx, dy); if (dist(P, e) < 95) hitH = true;
          if (trav < len && alive(e)) return; e.skMove = null; e.act = null; collide(e); if (!hitH) return;
          mark({ img: V1(e), dur: 1.2, at: HEAD() * 0.5, size: 110 }); after(1.2, null, () => { if (P.dead > 0) return; hurtPlayer(50 * e.dm); slowHero(0.5, 2); }); }; } },
    { ph: 'Резонансный импульс', col: '#d0d0ff', cd: 14, first: 5, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 450,
      cast(e) { groundImg(V2(e), e.x, e.y, 450, 0.7, { add: 1, grow: 0.3 }); if (near(e.x, e.y, 450)) hurtPlayer(35 * e.dm);
        e.absorb = Math.min(e.max * 0.5, 150 * Math.max(1, wave)); tag(e, 'ртутный щит', '#d0d0ff'); after(5, e, () => { e.absorb = 0; }); } },
  ];
  DEF.mb_timekeeper = [
    { ph: 'Шаг во времени', col: '#7ab8ff', cd: 10, an: 'cast1', dur: 0.5, at: 0.5, can: (e, d) => d > 150 && d < 700,
      cast(e) { const [dx, dy] = dirTo2(e, P), x0 = e.x, y0 = e.y; tele(e, P.x - dx * 85, P.y - dy * 85 * YK); line({ x: x0, y: y0 }, { img: V1(e), len: Math.hypot(e.x - x0, (e.y - y0) / YK), w: 80, run: 0.15, dur: 0.6 });
        if (dist(P, e) < 150) hurtPlayer(30 * e.dm);
        const now = performance.now() / 1000, back = (e.log || []).filter(l => now - l.t <= 2).reduce((s, l) => s + l.d, 0); e.log = [];
        if (back > 0) { e.hp = Math.min(e.max, e.hp + back); tag(e, 'время вспять +' + Math.round(back), '#7ab8ff'); } } },
    { ph: 'Хроносфера', col: '#7ab8ff', cd: 24, first: 7, an: 'cast2', dur: 0.9, at: 0.65, can: (e, d) => d < 600,
      cast(e) { const c = { x: P.x, y: P.y, R: 300 }, frozen = []; groundImg(V2(e), c.x, c.y, 300, 3, { rot: 0.3, a: 0.8 }); if (P.dead <= 0) { stun(3); say2('время остановлено', '#7ab8ff'); }
        MOV.push({ t: 0, dur: 3, update(m) {   // снаряды в куполе замирают
          for (const L of [shots, SK.PR]) for (const s of L) if (s.fz == null && s.sp > 0 && dist(s, c) < c.R) { s.fz = s.sp; s.sp = 0; frozen.push(s); }
          if (m.t >= m.dur) for (const s of frozen) { s.sp = s.fz; s.fz = null; } } }); } },
  ];

  // ===================== Мир 8: Огненный вулкан =====================
  DEF.mb_lavaturtle = [
    { ph: 'Поцелуи вулкана', col: '#ff7a3a', cd: 16, an: 'cast1', dur: 0.9, at: 0.5,
      cast(e) { for (let i = 0; i < 6; i++) after(i * 0.5, e, () => { const x = P.x + rnd(-70, 70), y = P.y + rnd(-50, 50);
        warn(x, y, 120, 0.8, 25 * e.dm); after(0.8, null, () => { groundImg(V1(e), x, y, 120, 2, { a: 0.85 }); zone({ x, y, R: 120, dur: 2, tick: 1, acc: 0.5, onTick: () => hurtPlayer(10 * e.dm, 'fire') }); }); }); } },
    { ph: 'Огненный залп', col: '#ff5a2a', cd: 8, first: 4, an: 'cast2', dur: 0.8, at: 0.55, can: (e, d) => { if (d >= 450) return false; const [dx, dy] = dirTo2(e, P); e.aim = Math.atan2(dy, dx); return true; },
      cast(e) { const [dx, dy, d] = dirTo2(e, P); let da = Math.atan2(dy, dx) - e.aim; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283;
        groundImg(V2(e), e.x + Math.cos(e.aim) * 220, e.y + Math.sin(e.aim) * 220 * YK, 240, 0.5, { ang: e.aim, add: 1 });
        if (d < 450 && Math.abs(da) < 0.53 && P.dead <= 0) { hurtPlayer(45 * e.dm, 'fire'); if (d < 200) slowHero(0.5, 1.5); } } },
  ];
  DEF.mb_embermonk = [
    { ph: 'Огненные цепи', col: '#ff7a3a', cd: 12, an: 'cast1', dur: 0.6, at: 0.5, can: (e, d) => d < 400,
      cast(e) { if (dist(P, e) > 430) return; pin(2); dot(15 * e.dm, 2, 'fire'); beam(e, { img: V1(e), dur: 2, w: 30, add: 1 }); } },
    { ph: 'Ловкость рук', col: '#ffb347', cd: 10, first: 5, can: (e, d) => d < 600,
      cast(e) { const c = { x: P.x, y: P.y }; e.hide = 1; e.untarget = 0.95; e.skBusy = 0.95; e.act = hold('cast2', 0.95);
        for (let i = 0; i < 3; i++) after(0.2 + i * 0.25, e, () => { const a = Math.random() * 6.283; groundImg(V2(e), c.x + Math.cos(a) * 60, c.y + Math.sin(a) * 60 * YK, 130, 0.35, { ang: a, add: 1 }); if (near(c.x, c.y, 250)) hurtPlayer(20 * e.dm, 'fire'); });
        after(0.95, e, () => { e.hide = 0; e.act = null; const [dx, dy] = dirTo2(P, e); tele(e, P.x + dx * 80, P.y + dy * 80 * YK); }); } },
  ];
  DEF.mb_phoenix = [
    { ph: 'Пике', col: '#ffb347', cd: 12, can: (e, d) => d > 150 && d < 700,
      cast(e) { const [dx, dy] = dirTo2(e, P); let trav = 0, hitH = false; line(e, { img: V1(e), len: 800, w: 110, run: 0.9, dur: 3.9, onStay(l, dt) { l.acc = (l.acc || 0) - dt; if (l.acc <= 0) { l.acc = 1; hurtPlayer(15 * e.dm, 'fire'); } } });
        e.act = hold('cast1', 1.2); e.untarget = 1;
        e.skMove = dt => { const st = 900 * dt; e.x += dx * st; e.y += dy * st * YK; trav += st; face(e, dx, dy);
          if (!hitH && dist(P, e) < 95) { hitH = true; hurtPlayer(40 * e.dm, 'fire'); slowHero(0.7, 2); }
          if (trav >= 800 || !alive(e)) { e.skMove = null; e.act = null; e.untarget = 0; collide(e); } }; } },
    // «Сверхновая» — пассив: один раз, на 40 % здоровья (см. hurtEnemy выше)
  ];

  // ===================== Мир 9: Небесный храм =====================
  DEF.mb_windarcher = [
    { ph: 'Сковывающий выстрел', col: '#b9e37a', cd: 11, an: 'cast1', dur: 0.6, at: 0.5, can: (e, d) => d < 900,
      cast(e) { proj(e, { img: V1(e), sp: 1000, left: 1000, w: 70, size: 110, rope: e,
        onHit(p) { hurtPlayer(30 * e.dm); if (wallAhead(p.dx, p.dy, 400) > 0) { pin(2); say2('привязан!', '#b9e37a'); } else stun(0.6); } }); } },
    { ph: 'Мощный выстрел', col: '#e8ffb0', cd: 10, first: 5, can: (e, d) => d < 1300,
      cast(e) { const [dx, dy] = dirTo2(e, P); face(e, dx, dy); const w = { x: e.x, y: e.y }; line(w, { img: V2(e), dx, dy, len: 1300, w: 100, run: 0.2, dur: 1.2 });
        channel(e, 'cast2', 1.2, { stop(broke) { if (!broke) proj(e, { img: V2(e), dx, dy, sp: 1900, left: 1300, w: 100, size: 170, pierce: true, onHit() { hurtPlayer(70 * e.dm); } }); } }); } },
  ];
  DEF.mb_dawnsmith = [
    { ph: 'Звёздный молот', col: '#ffd95e', cd: 12, an: 'cast1', dur: 0.7, at: 0.5, can: (e, d) => d > 200 && d < 900,
      cast(e) { const len = Math.min(900, dist(P, e) + 220);
        line(e, { img: V1(e), len, w: 90, run: len / 900, dur: len / 900 + 3, onStay(l, dt) { l.acc = (l.acc || 0) - dt; if (l.acc <= 0) { l.acc = 1; hurtPlayer(12 * e.dm, 'fire'); } } });
        proj(e, { img: V1(e), sp: 900, left: len, w: 90, size: 130, spin: 12, pierce: true, onHit() { hurtPlayer(35 * e.dm); },
          onEnd(p) { if (!alive(e)) return; leapTo(e, p.x, p.y, 0.5, 0, 0, 'cast1'); } }); } },
    { ph: 'Звездолом', col: '#ffb347', cd: 12, first: 5, can: (e, d) => d < 220,
      cast(e) { e.act = hold('cast2', 1.35); e.skBusy = 1.35;
        for (let i = 0; i < 3; i++) after(0.2 + i * 0.35, e, () => { groundImg(V2(e), e.x, e.y, 200, 0.3, { ang: i * 2.1 }); if (near(e.x, e.y, 200)) hurtPlayer(20 * e.dm); });
        after(1.3, e, () => { e.act = null; groundImg(V2(e), e.x, e.y, 260, 0.6, { add: 1, grow: 0.2 }); snd('boss_slam', 0.8); if (near(e.x, e.y, 260)) { hurtPlayer(40 * e.dm, 'fire'); stun(1); } }); } },
  ];
  DEF.mb_sphinx = [
    { ph: 'Рёв сфинкса', col: '#ffd95e', cd: 16, an: 'cast1', dur: 0.9, at: 0.55, can: (e, d) => d < 700,
      cast(e) { line(e, { img: V1(e), len: 700, w: 200, run: 0.3, dur: 0.8, onHit() { hurtPlayer(50 * e.dm); stun(1.5); } }); } },
    { ph: 'Звездопад', col: '#bfe6ff', cd: 12, first: 5, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 600,
      cast(e) { for (let w = 0; w < 2; w++) after(w * 0.8, e, () => {
        const star = (x, y) => { warn(x, y, 100, 0.5, 30 * e.dm); after(0.5, null, () => groundImg(V2(e), x, y, 100, 0.5, { add: 1 })); };
        star(P.x, P.y); for (let i = 0; i < 4; i++) { const a = Math.random() * 6.283, r = 150 + Math.random() * 450; star(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * YK); } }); } },
  ];

  // ===================== Мир 10: Бездна =====================
  DEF.mb_dreameater = [
    { ph: 'Кошмар', col: '#c9a8ff', cd: 16, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { if (P.dead > 0) return; S.sleep = 2.5; S.bind = Math.max(S.bind, 0.1); say2('кошмар…', '#c9a8ff'); mark({ img: V1(e), dur: 2.5, at: HEAD() * 0.6, size: 170, until: () => !(S.sleep > 0) });
        MOV.push({ t: 0, dur: 2.5, acc: 1, update(m, dt) { if (!(S.sleep > 0)) { m.t = m.dur; return; } m.acc -= dt; if (m.acc <= 0) { m.acc += 1; hurtPlayer(8 * e.dm, 'nightmare'); } } }); } },
    { ph: 'Высасывание разума', col: '#b07aff', cd: 10, first: 5, an: 'cast2', dur: 0.7, at: 0.5, can: (e, d) => d < 700,
      cast(e) { if (dist(P, e) > 800 || P.dead > 0) return; beam(e, { img: V2(e), dur: 0.5, w: 34, add: 1 }); hurtPlayer(45 * e.dm); e.hp = Math.min(e.max, e.hp + 45 * e.dm); } },
  ];
  DEF.mb_obsidian = [
    { ph: 'Астральная темница', col: '#b07aff', cd: 18, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { if (P.dead > 0) return; S.astral = 2.5; say2('в темнице', '#b07aff'); mark({ img: V1(e), dur: 2.5, at: HEAD() * 0.5, size: 180, spin: 1.5 });
        after(2.5, null, () => { S.astral = 0; S.bind = 0; groundImg(V1(e), P.x, P.y, 200, 0.5, { add: 1 }); if (P.dead <= 0) hurtPlayer(50 * e.dm); }); } },
    { ph: 'Тайная сфера', col: '#c9a8ff', cd: 10, first: 4, an: 'cast2', dur: 0.6, at: 0.5,
      cast(e) { e.arc = 3; tag(e, '3 усиленных выстрела', '#c9a8ff'); } },
  ];
  SK.SHOT_HIT.mb_obsidian = e => () => { if (!(e.arc > 0)) return; e.arc--; hurtPlayer(25 * e.dm); groundImg(V2(e), P.x, P.y, 120, 0.4, { add: 1 }); };
  DEF.mb_gatekeeper = [
    { ph: 'Огненный шторм', col: '#9be37a', cd: 14, an: 'cast1', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { const x = P.x, y = P.y; groundImg(V1(e), x, y, 300, 3.2, { rot: 0.3, a: 0.85 }); warn(x, y, 300, 0.5, 0);
        for (let i = 0; i < 6; i++) after(0.5 + i * 0.5, e, () => { if (near(x, y, 300)) { hurtPlayer(15 * e.dm, 'fire'); dot(5 * e.dm, 2, 'fire'); } }); } },
    { ph: 'Яма злобы', col: '#8a5aff', cd: 18, first: 6, an: 'cast2', dur: 0.8, at: 0.5, can: (e, d) => d < 800,
      cast(e) { const x = P.x, y = P.y; groundImg(V2(e), x, y, 280, 6, { rot: 0.15, a: 0.9 });
        for (let i = 0; i < 3; i++) after(0.3 + i * 2, e, () => { if (near(x, y, 280)) { pin(1); hurtPlayer(20 * e.dm); } }); } },
  ];
})();
