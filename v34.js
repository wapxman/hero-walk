// 34 новых рядовых злодея (v96, пакет Клауди 20–21.11, VILLAINS34_FOR_KLOD.md): по одному умению у каждого.
// Виды и места — roster.js (KIND.v_*, элита el_*). Движок — sk.js: каст — лист cast1, картинка эффекта — vfx1 злодея.
// Правило залпов рядовых прежнее (BAL.RANK_SK): между умениями двух рядовых — пауза, одно и то же — не чаще раза в 5 с.
// Состояния героя видны значками ряда (status.js): сеть — root, «Разрыв» — bleed, «Тлен» — weak, метки — mark, взгляд лича — fear, стаки — curse.
'use strict';
(() => {
  const { proj, beam, line, mark, ground, groundImg, zone, MOV, S, stun, DEF, ON_HIT, dist, dirTo2, tag, HEAD } = SK;
  const channel = SK.channelFn;
  const V1 = e => (e.ch.vfx && e.ch.vfx[0] && e.ch.vfx[0].img) || null;
  const alive = e => e.dieT == null && e.hp > 0;
  const after = (t, e, fn) => MOV.push({ t: 0, dur: t, update(m) { if (!m.done && m.t >= m.dur) { m.done = 1; if (!e || alive(e)) fn(); } } });
  const near = (x, y, R) => P.dead <= 0 && Math.hypot(P.x - x, (P.y - y) / YK) < R;
  const hold = (anim, dur) => ({ anim, dur, at: 2, fn() {}, t: dur * 0.4, hit: false });
  const face = (e, dx, dy) => { e.row = runRow(dx, dy); };
  const show = (k, t, o) => { if (typeof HSTAT !== 'undefined') HSTAT.show(k, t, o); };
  const baseOf = e => e.k.base || e.type;
  const C1 = { an: 'cast1', dur: 0.8, at: 0.5 };

  // ---------- состояния героя от новых злодеев ----------
  // napalm — в луже напалма (каждый удар больнее), frost — метки стужи рыцаря, spois — метки теневого яда, rupt — «Разрыв»
  Object.assign(S, { napalm: 0, napalmDm: 0, frost: 0, frostT: 0, spois: 0, spoisT: 0, spoisDm: 0, rupt: 0, ruptDm: 0, ruptAcc: 0 });
  const WARDS = [];   // идолы «Скверного стража»: { x, y, t, dm }
  let px = P.x, py = P.y;
  MOV.push({ t: 0, dur: 1e9, update(m, dt) {
    if (P.dead > 0) { S.napalm = S.frost = S.spois = S.rupt = 0; WARDS.length = 0; px = P.x; py = P.y; return; }
    if (S.napalm > 0) S.napalm -= dt;
    if (S.frost > 0 && (S.frostT -= dt) <= 0) { S.frost = 0; show('curse', 0); }
    // теневой яд: метки взрываются через 8 с после первой
    if (S.spois > 0 && (S.spoisT -= dt) <= 0) { hurtPlayer(12 * S.spois * S.spoisDm, 'poison'); S.spois = 0; show('curse', 0); }
    // «Разрыв»: больно за каждые 100 пройденных пикселей
    const st = Math.hypot(P.x - px, (P.y - py) / YK); px = P.x; py = P.y;
    if (S.rupt > 0) { S.rupt -= dt; if (st < 400) S.ruptAcc += st; while (S.ruptAcc >= 100) { S.ruptAcc -= 100; hurtPlayer(S.ruptDm, 'bleed'); } }
    for (const w of WARDS) w.t -= dt;
    while (WARDS.length && WARDS[0].t <= 0) WARDS.shift();
  } });
  {
    const _hp = hurtPlayer;   // липкий напалм: каждый удар (не яд и не горение) больнее
    hurtPlayer = function (d, kind) { if (S.napalm > 0 && kind == null && d > 0 && P.dead <= 0) d += S.napalmDm; return _hp(d, kind); };
    const _c = cast;          // «Скверный страж»: идол бьёт героя за каждое умение рядом
    cast = function (id) {
      const c0 = P.cd[id], r = _c(id);
      if (WARDS.length && !(c0 > 0) && P.cd[id] > 0 && P.dead <= 0) for (const w of WARDS) if (dist(P, w) < 600) { hurtPlayer(w.dm, 'ward'); mark({ img: w.img, dur: 0.35, size: 80, add: 1, at: HEAD() * 0.6 }); }
      return r;
    };
  }

  // ---------- злодеи: ярость клеща, каменная форма, «Могила», тропа призрака, усиленный 4-й удар ----------
  {
    const _ue = updateEnemy;
    updateEnemy = function (e, dt) {
      if (e.grave > 0) e.grave -= dt;
      if (e.stone > 0) e.stone -= dt;
      if (e.life > 0 && (e.life -= dt) <= 0 && alive(e)) { e.hp = 0; e.dieT = 0; e.anim = 'die'; e.act = null; return; }   // призванные волки живут 15 с (без награды)
      if (e.rage > 0) { e.rage -= dt; e.slowT = 0; e.root = 0; e.atkCd -= dt * 0.4; }   // не берут замедления и путы, бьёт чаще
      let sp0 = null;
      if (e.path && (e.path.t -= dt) > 0) {   // призрак на своей теневой тропе бежит быстрее
        const p = e.path, qx = e.x - p.x, qy = (e.y - p.y) / YK, al = qx * p.dx + qy * p.dy;
        if (al > -40 && al < p.len + 40 && Math.abs(qx * p.dy - qy * p.dx) < 90) { sp0 = e.speed; e.speed *= 1.4; }
      }
      try { _ue(e, dt); } finally { if (sp0 != null) e.speed = sp0; }
      // усиленный удар: следующая атака идёт листом каста, попадание даёт эффект
      if (e.pow && e.act && e.act.anim === 'atk' && !e.act.hit && !e.act.pow) {
        const a = e.act, f = a.fn, fn = e.pow; a.pow = 1; a.anim = e.anim = 'cast1'; e.pow = null;
        a.fn = (dx, dy) => { const hp0 = P.hp; f(dx, dy); if (P.hp < hp0 && P.dead <= 0) fn(); };
      }
    };
    const _he = hurtEnemy;
    hurtEnemy = function (e, dmg, col) {
      if (e.hp <= 0) return;
      if (e.stone > 0 && !P.trueShot) dmg *= 0.15;                                   // горгулья в камне
      if (e.grave > 0) { const m = P.dmgMul || 1; if (e.hp - dmg * m < 1) { dmg = Math.max(0, (e.hp - 1) / m); if (dmg <= 0) { if (!(e.graveSaid > performance.now())) { tag(e, 'не умирает', '#c9a8ff'); e.graveSaid = performance.now() + 800; } return; } } }
      _he(e, dmg, col);
      // «Ответный вихрь» берсерка: когда его бьют
      if (baseOf(e) === 'v_abyssberserker' && alive(e) && Math.random() < 0.2 && !(e.helixAt > (P.heroT || 0))) helix(e);
    };
    const _de = drawEnemy;   // «Исчезновение» скитальца: почти не виден
    drawEnemy = function (e) { if (e.ghost > 0 && e.dieT == null) { ctx.save(); ctx.globalAlpha *= 0.22; try { _de(e); } finally { ctx.restore(); } return; } _de(e); };
  }
  function helix(e) {
    e.helixAt = (P.heroT || 0) + 1.5; tag(e, 'Ответный вихрь!', '#c98aff');
    if (!e.act && !e.skMove) startAct(e, 'cast1', 0.45, 2, () => {});
    groundImg(V1(e), e.x, e.y, 220, 0.45, { rot: 12, add: 1 });
    if (near(e.x, e.y, 220)) hurtPlayer(20 * e.dm);
  }
  // пассив «каждый 4-й удар»: три обычных удара — метки, четвёртый идёт листом каста и срабатывает
  function fourth(name, col, onStack, onProc) {
    return (e, hits) => { const n = hits % 3 || 3; if (SK.polyMark) SK.polyMark(name);   // полигон автопрогона: пассив засчитан по первому же удару-метке (четвёртого под нагрузкой можно не дождаться)
      if (onStack) onStack(e, n); if (n === 3) e.pow = () => { tag(e, name + '!', col); onProc(e); }; };
  }
  // движение злодея по прямой (таран): как у мини-боссов
  function charge(e, o) {
    let t = 0, trav = 0, ang = null, drop = 0;
    e.act = hold(o.an, 4);
    e.skMove = dt => {
      if (!alive(e)) { e.skMove = null; return; }
      t += dt;
      const [hx, hy, d] = dirTo2(e, P);
      if (ang == null || t < o.wind) { ang = Math.atan2(hy, hx); face(e, hx, hy); if (t < o.wind) return; }
      const dx = Math.cos(ang), dy = Math.sin(ang), st = o.sp * dt, x0 = e.x, y0 = e.y;
      e.x += dx * st; e.y += dy * st * YK; collide(e); trav += st; face(e, dx, dy);
      if (o.trail && (drop -= st) <= 0) { drop = 80; o.trail(e, ang); }
      const end = () => { e.skMove = null; e.act = null; };
      if (d < e.rad + 48 && P.dead <= 0) { end(); o.onHit(dx, dy, o.max - trav); }
      else if (Math.hypot(e.x - x0, (e.y - y0) / YK) < st * 0.4 || trav > o.max || t > (o.wind || 0) + (o.time || 9)) end();
    };
  }
  const pull = (x, y, t) => { if (!(P.ss.imm.pull > 0)) S.pull = { x, y, t }; };
  const sil = t => STATUS.add('silence', t);

  // ===================== Мир 1: Королевский замок =====================
  DEF.v_butcher = [Object.assign({ ph: 'Гниль', col: '#9be37a', cd: 9, can: (e, d) => d < 260,
    cast(e) { ground({ img: SK.img(V1(e)), follow: e, x: e.x, y: e.y, R: 200, dur: 4, rot: 0.3, a: 0.8 });
      zone({ follow: e, x: e.x, y: e.y, R: 200, dur: 4, tick: 1, acc: 0.5, onTick: () => hurtPlayer(10 * e.dm, 'poison'), onStay: () => slowHero(0.75, 0.2), update(z) { if (!alive(e)) z.t = z.dur; } }); } }, C1)];
  DEF.v_maskedassassin = [Object.assign({ ph: 'Метательный кинжал', col: '#c9a8ff', cd: 7, can: (e, d) => d > 140 && d < 700,
    cast(e) { snd('enemy_arrow', 0.5, 1.2); proj(e, { img: V1(e), sp: 1300, left: 700, w: 60, size: 170, onHit() { hurtPlayer(25 * e.dm); slowHero(0.6, 2); } }); } }, C1, { dur: 0.6 })];
  DEF.v_chaplain = [Object.assign({ ph: 'Импульс смерти', col: '#9be37a', cd: 10, can: (e, d) => d < 450,
    cast(e) { groundImg(V1(e), e.x, e.y, 450, 0.7, { add: 1, grow: 0.35 });
      if (near(e.x, e.y, 450)) hurtPlayer(20 * e.dm, 'poison');
      for (const o of enemies) if (alive(o) && dist(o, e) < 450 && o.hp < o.max) {   // злодеям в круге +8 % здоровья (боссам и мини-боссам — 2 %)
        const h = Math.round(o.max * (o.boss || o.mini ? 0.02 : 0.08)); o.hp = Math.min(o.max, o.hp + h); say(o.x, o.y - 70, '+' + h, '#7dff8a'); } } }, C1)];
  DEF.v_warlock = [{ ph: 'Палец смерти', col: '#ff5a5a', cd: 14, can: (e, d) => d < 650,
    cast(e) { e.act = hold('cast1', 1.25); e.skBusy = 1.2; show('mark', 1);
      const w = warn(P.x, P.y, 60, 1, 0); MOV.push({ t: 0, dur: 1, update() { w.x = P.x; w.y = P.y; } });   // перекрестие идёт за героем
      after(1, e, () => { if (P.dead > 0) return; if (dist(P, e) > 700) { tag(e, 'промах', '#c0c0c0'); return; }
        beam(e, { img: V1(e), dur: 0.35, w: 260, add: 1 }); snd('enemy_fireball', 0.6, 0.7);
        // v101: в Бездне «Палец» ещё и оглушает на 0,6 с — Сфера Линкена и Сфера лотоса, если готовы, гасят и состояние, и удар; рывок в момент удара спасает как раньше
        const ward = BAL.at(Math.max(1, wave)).M === 10 && !(P.dashI > 0) && typeof ITEMFX !== 'undefined' && ['linken', 'lotus'].some(id => ITEMFX.has(id) && !(RCD[id] > 0));
        if (BAL.at(Math.max(1, wave)).M === 10) { if (typeof ITEMFX !== 'undefined') ITEMFX.T.src = { e, at: performance.now() / 1000 }; stun(0.6); }
        if (ward) SK.say2('отражено!', '#ffd95e'); else hurtPlayer(55 * e.dm); }); } }];

  // ===================== Мир 2: Горящая деревня =====================
  DEF.v_batrider = [Object.assign({ ph: 'Липкий напалм', col: '#ff8a3a', cd: 8, can: (e, d) => d < 600,
    cast(e) { const x = P.x, y = P.y, dm = 4 * e.dm; warn(x, y, 180, 0.4, 0); snd('enemy_fireball', 0.5, 0.9);
      after(0.4, null, () => { groundImg(V1(e), x, y, 180, 6, { a: 0.9, rot: 0.05 });
        zone({ x, y, R: 180, dur: 6, onStay() { slowHero(0.8, 0.2); S.napalm = 0.25; S.napalmDm = dm; } }); }); } }, C1, { at: 0.55 })];
  DEF.v_ghoulfarmer = [Object.assign({ ph: 'Тлен', col: '#8fbf5a', cd: 9, can: (e, d) => d < 500,
    cast(e) { const x = P.x, y = P.y;
      warn(x, y, 220, 0.6, 22 * e.dm, { onHitP() { S.weak = 6; S.weakK = 0.9; if ((e.decay = (e.decay || 0) + 1) <= 3) e.dm *= 1.1; } });   // герой слабее на 10 %, селянин крепнет (до трёх раз)
      after(0.6, null, () => groundImg(V1(e), x, y, 220, 0.9)); } }, C1)];

  // ===================== Мир 4: Проклятое болото =====================
  DEF.v_slithereen = [Object.assign({ ph: 'Тёмный пакт', col: '#b07aff', cd: 8, can: (e, d) => d < 260,
    cast(e) { after(1.5, e, () => { groundImg(V1(e), e.x, e.y, 260, 0.6, { add: 1, grow: 0.2 }); e.slowT = 0; e.root = 0;
      if (near(e.x, e.y, 260)) hurtPlayer(30 * e.dm); }); } }, C1, { at: 0.3 })];

  // ===================== Мир 5: Гномьи шахты =====================
  DEF.v_tunnelmammoth = [{ ph: 'Таран бивнями', col: '#ffb36a', cd: 12, can: (e, d) => d > 200 && d < 600,
    cast(e) { charge(e, { an: 'cast1', wind: 0.6, sp: 720, max: 600, time: 1.2,
      trail(e, ang) { groundImg(V1(e), e.x, e.y, 150, 0.7, { a: 0.6, ang }); },
      onHit(dx, dy, left) { hurtPlayer(30 * e.dm); stun(0.8); pull(P.x + dx * Math.min(260, Math.max(60, left)), P.y + dy * Math.min(260, Math.max(60, left)) * YK, 0.3); snd('boss_slam', 0.6); } }); } }];
  DEF.v_orespark = [Object.assign({ ph: 'Искра-охотник', col: '#8fd0ff', cd: 7, can: (e, d) => d < 650,
    cast(e) { const a = Math.random() * 6.283, s = { x: P.x + Math.cos(a) * 130, y: P.y + Math.sin(a) * 130 * YK };
      mark({ img: V1(e), on: s, at: 50, dur: 1.5, size: 90, add: 1 });   // искра ждёт 1,5 с и бросается к герою
      after(1.5, null, () => { if (P.dead > 0) return; proj(s, { img: V1(e), sp: 900, left: 700, homing: 3, w: 70, size: 110, add: 1, src: e, onHit() { hurtPlayer(35 * e.dm); slowHero(0.7, 2); } }); }); } }, C1)];
  DEF.v_koboldtrapper = [Object.assign({ ph: 'Сеть', col: '#d8c08a', cd: 9, can: (e, d) => d > 100 && d < 450,
    cast(e) { const x = P.x, y = P.y; let hit = false;
      warn(x, y, 120, 0.5, 0, { onHitP() { hit = true; S.pin = Math.max(S.pin, 1.5); mark({ img: V1(e), dur: 1.5, at: HEAD() * 0.5, size: 150 }); } });   // попал — герой не ходит (бить может)
      after(0.5, null, () => { if (!hit) groundImg(V1(e), x, y, 110, 0.8); }); } }, C1, { at: 0.6 })];
  DEF.v_teslaguard = [Object.assign({ ph: 'Плазменное кольцо', col: '#bfe6ff', cd: 10, can: (e, d) => d < 500,
    cast(e) { const g = ground({ img: SK.img(V1(e)), follow: e, x: e.x, y: e.y, R: 20, dur: 1.8, add: 1 }); let r0 = 0, out = false, back = false;
      MOV.push({ t: 0, dur: 1.8, update(m) {   // кольцо расходится до 500 и возвращается: чем дальше от стража, тем больнее
        const r = 500 * Math.sin(Math.min(1, m.t / 1.8) * Math.PI), d = dist(P, e), up = m.t < 0.9; g.R = Math.max(20, r);
        if (alive(e) && P.dead <= 0 && ((up && !out && r0 < d && r >= d) || (!up && !back && r0 > d && r <= d && d < 500))) { if (up) out = true; else back = true; hurtPlayer((10 + 20 * Math.min(1, d / 500)) * e.dm); }
        r0 = r; } }); } }, C1)];

  // ===================== Мир 6: Ледяные вершины =====================
  DEF.v_glacierlich = [{ ph: 'Зловещий взгляд', col: '#9fd8ff', cd: 13, can: (e, d) => d > 150 && d < 600,
    cast(e) { beam(e, { img: V1(e), dur: 1.5, w: 200, add: 1 }); show('fear', 1.5);
      channel(e, 'cast1', 1.5, { breakPct: 0.1,   // герой не управляется и медленно идёт к личу; сильный урон по личу срывает взгляд
        tick(dt) { if (P.dead > 0) return; S.bind = Math.max(S.bind, 0.12); sil(0.12); const [dx, dy, m] = dirTo2(P, e); if (m > 110) { P.x += dx * 70 * dt; P.y += dy * 70 * YK * dt; collide(P); P.face = { x: dx, y: dy }; P.moving = true; } },
        stop() { S.bind = 0; show('fear', 0); } }); } }];
  DEF.v_icejelly = [Object.assign({ ph: 'Холодные ступни', col: '#9fd8ff', cd: 12, can: (e, d) => d < 650,
    cast(e) { const c = { x: P.x, y: P.y }, g = groundImg(V1(e), c.x, c.y, 95, 4.3, { a: 0.9 }); show('mark', 4);
      MOV.push({ t: 0, dur: 4, update(m) {   // не ушёл от метки дальше 600 за 4 с — вмерзает
        if (m.done) return;
        if (P.dead > 0 || dist(P, c) > 600) { m.done = 1; m.t = m.dur; g.dur = g.t + 0.3; show('mark', 0); return; }
        if (m.t >= 3.97) { m.done = 1; show('mark', 0); STATUS.add('freeze', 1.5); hurtPlayer(25 * e.dm); } } }); } }, C1)];
  const wolves = () => enemies.filter(o => o.type === 'sk_snowwolf' && alive(o)).length;
  DEF.v_snowpackalpha = [Object.assign({ ph: 'Стая', col: '#d8ecff', cd: 16, first: 4, can: (e, d) => d < 700 && wolves() <= 2,
    cast(e) { mark({ img: V1(e), on: { x: e.x, y: e.y }, at: 70, dur: 0.9, size: 220 });
      for (const k of [-1, 1]) { spawnEnemyBase('sk_snowwolf'); const m = enemies[enemies.length - 1]; m.x = e.x + k * 70; m.y = e.y + 20; collide(m); m.dm = e.dm; m.life = 15; } } }, C1, { dur: 1, at: 0.6 })];
  // «Проклятие стужи» — пассив: каждый удар рыцаря вешает метку, на 4-й — немота и замедление
  DEF.v_permafrostknight = [{ ph: 'Проклятие стужи', passive: true, poly: 1, cd: 1e9 }];
  ON_HIT.v_permafrostknight = fourth('Проклятие стужи', '#9fd8ff',
    (e, n) => { if (!e.act || !e.act.pow) { S.frost = Math.min(3, S.frost + 1); S.frostT = 6; show('curse', 6, { n: S.frost }); } },
    e => { S.frost = 0; show('curse', 0); sil(1.5); slowHero(0.7, 3); ground({ img: SK.img(V1(e)), follow: P, x: P.x, y: P.y, R: 95, dur: 1.5, add: 1 }); });

  // ===================== Мир 7: Руины Зеркального города =====================
  DEF.v_spectralblade = [Object.assign({ ph: 'Призрачный кинжал', col: '#b07aff', cd: 9, can: (e, d) => d > 150 && d < 800,
    cast(e) { const [dx, dy] = dirTo2(e, P); snd('enemy_arrow', 0.5, 0.85);
      e.path = { x: e.x, y: e.y, dx, dy, len: 900, t: 6 };   // за кинжалом — теневая тропа: по ней призрак бежит быстрее
      line(e, { img: V1(e), len: 900, w: 46, vis: 300, run: 1, dur: 6 });
      proj(e, { img: V1(e), sp: 900, left: 900, w: 60, size: 180, onHit() { hurtPlayer(25 * e.dm); slowHero(0.8, 2); } }); } }, C1, { dur: 0.6 })];
  DEF.v_mirrorweaver = [Object.assign({ ph: 'Исчезновение', col: '#d0e8ff', cd: 10, can: (e, d) => d > 120 && d < 500,
    cast(e) { const [dx, dy, d] = dirTo2(e, P), max = d + 170, sp = e.speed * 1.6; let trav = 0, t = 0, hit = false, drop = 0;
      e.ghost = 2; e.untarget = 2; e.act = null; e.anim = 'run'; face(e, dx, dy);
      e.skMove = dt => {   // 2 с бежит сквозь героя, задевая его
        t += dt; e.ghost = 2 - t; const st = sp * dt; e.runPh += dt * 1.6;
        if (trav < max) { e.x += dx * st; e.y += dy * st * YK; collide(e); trav += st; if ((drop -= st) <= 0) { drop = 70; groundImg(V1(e), e.x, e.y, 95, 0.6, { a: 0.6, add: 1, ang: Math.atan2(dy, dx) }); } }
        if (!hit && dist(P, e) < e.rad + 50 && P.dead <= 0) { hit = true; hurtPlayer(30 * e.dm); }
        if (t >= 2 || !alive(e)) { e.skMove = null; e.act = null; e.ghost = 0; e.untarget = 0; } }; } }, C1, { dur: 0.5, at: 0.85 })];
  DEF.v_darkseer = [Object.assign({ ph: 'Вакуум', col: '#8a7aff', cd: 11, can: (e, d) => d < 650,
    cast(e) { const a = Math.random() * 6.283, x = P.x + Math.cos(a) * 90, y = P.y + Math.sin(a) * 90 * YK;
      groundImg(V1(e), x, y, 300, 1, { rot: -3, a: 0.9 }); warn(x, y, 300, 0.4, 0, { onHitP() { hurtPlayer(20 * e.dm); pull(x, y, 0.3); } }); } }, C1)];
  DEF.v_gargoyle = [{ ph: 'Каменная форма', col: '#b8c0a8', cd: 13, can: (e, d) => d > 120 && d < 450,
    cast(e) { const [dx, dy] = dirTo2(P, e), x = P.x + dx * 60, y = P.y + dy * 60 * YK;
      warn(x, y, 200, 0.6, 20 * e.dm, { onHitP() { stun(1); } });
      e.leap = { x0: e.x, y0: e.y, x1: x, y1: y, t: 0, dur: 0.6 }; startAct(e, 'cast1', 0.66, 2, () => {});
      after(0.62, e, () => { groundImg(V1(e), e.x, e.y, 200, 0.8); e.stone = 2; e.skBusy = 2; e.act = hold('cast1', 3.3); tag(e, 'камень', '#b8c0a8'); }); } }];   // 2 с — камень: почти не получает урона

  // ===================== Мир 8: Огненный вулкан =====================
  DEF.v_souldemon = [Object.assign({ ph: 'Выжигание', col: '#ff5a3a', cd: 9, can: (e, d) => d < 750,
    cast(e) { const [dx, dy] = dirTo2(e, P), x0 = e.x, y0 = e.y;
      [200, 450, 700].forEach((r, i) => after(i * 0.35, null, () => { const x = x0 + dx * r, y = y0 + dy * r * YK;
        warn(x, y, 150, 0.35, 25 * e.dm); after(0.35, null, () => groundImg(V1(e), x, y, 150, 0.5, { add: 1 })); })); } }, C1)];
  DEF.v_lavatick = [Object.assign({ ph: 'Ярость', col: '#ff7a3a', cd: 12, can: (e, d) => d < 400,
    cast(e) { e.rage = 4; e.slowT = 0; e.root = 0; ground({ img: SK.img(V1(e)), follow: e, x: e.x, y: e.y, R: 70, dur: 4, rot: 3, add: 1, a: 0.85 }); } }, C1, { dur: 0.6 })];
  DEF.v_firehorn = [Object.assign({ ph: 'Раскол земли', col: '#ff8a3a', cd: 10, can: (e, d) => d < 650,
    cast(e) { const x = P.x, y = P.y; warn(x, y, 180, 0.7, 30 * e.dm, { onHitP() { stun(1); } }); after(0.7, null, () => groundImg(V1(e), x, y, 180, 1)); } }, C1)];
  // «Смертельный удар» — пассив: каждый 4-й удар критический (×2,5)
  DEF.v_lavaskeletonking = [{ ph: 'Смертельный удар', passive: true, poly: 1, cd: 1e9 }];
  ON_HIT.v_lavaskeletonking = fourth('Смертельный удар', '#ff8a3a', null,
    e => { hurtPlayer((e.k.dmg[0] + e.k.dmg[1]) / 2 * e.dm * 1.5); mark({ img: V1(e), dur: 0.35, at: HEAD() * 0.5, size: 200, add: 1 }); snd('boss_slam', 0.5, 1.2); });
  DEF.v_ashskeleton = [Object.assign({ ph: 'Огненная армия', col: '#ff9a4a', cd: 16, first: 4, can: (e, d) => d < 700,
    cast(e) { const [dx, dy] = dirTo2(e, P);
      for (const k of [-1, 0, 1]) {   // три огненных лучника в линию, 5 с стреляют в героя раз в секунду
        const s = { x: e.x - dy * 130 * k + dx * (k ? 0 : 90), y: e.y + (dx * 130 * k + dy * (k ? 0 : 90)) * YK };
        mark({ img: V1(e), on: s, at: 75, dur: 5, size: 170 });
        MOV.push({ t: 0, dur: 5, acc: 0.6 + (k + 1) * 0.2, update(m, dt) { m.acc -= dt; if (m.acc > 0 || P.dead > 0) return; m.acc += 1;
          const [ax, ay] = dirTo2(s, P); shots.push({ own: 'e', bolt: 1, col: '255,150,50', x: s.x + ax * 20, y: s.y + ay * 20 * YK, dx: ax, dy: ay, sp: 780, left: 900, dmg: 6 * e.dm, h: 80, src: e }); } });
      } } }, C1)];

  // ===================== Мир 9: Небесный храм =====================
  DEF.v_fallensunpriest = [Object.assign({ ph: 'Солнечный удар', col: '#ffd95e', cd: 11, can: (e, d) => d < 800,
    cast(e) { const s = { x: P.x, y: P.y }; warn(s.x, s.y, 175, 1.7, 45 * e.dm);
      after(1.7, null, () => mark({ img: V1(e), on: s, at: 100, dur: 0.6, size: 480, add: 1 })); } }, C1)];   // столб света сверху вниз
  // «Могила»: раненый злодей рядом (или сам змей) 3 с не может умереть
  const graveOf = e => { let b = null; for (const o of enemies) if (o !== e && alive(o) && !o.boss && !(o.grave > 0) && dist(o, e) < 500 && o.hp < o.max * 0.5 && (!b || o.hp / o.max < b.hp / b.max)) b = o; return b || (e.hp < e.max * 0.5 ? e : null); };
  DEF.v_featherserpent = [Object.assign({ ph: 'Могила', col: '#c9a8ff', cd: 18, first: 3, can: e => !!graveOf(e),
    cast(e) { const t = graveOf(e) || e; t.grave = 3; mark({ img: V1(e), on: t, at: (t.ch.ok ? t.ch.top * t.ch.U * t.sc : 120) * 0.55, dur: 3, size: 130, until: () => !alive(t) }); } }, C1)];
  DEF.v_bloodpriest = [Object.assign({ ph: 'Разрыв', col: '#ff5a5a', cd: 14, can: (e, d) => d < 500,
    cast(e) { if (P.dead > 0) return; S.rupt = 4; S.ruptDm = 6 * e.dm; S.ruptAcc = 0; show('bleed', 4);   // идёшь — больно, стоишь — нет
      mark({ img: V1(e), dur: 4, at: HEAD() * 1.2, size: 100, until: () => !(S.rupt > 0) }); } }, C1)];
  DEF.v_eclipser = [Object.assign({ ph: 'Цепенящий страх', col: '#7a8aff', cd: 15, can: (e, d) => d < 300,
    cast(e) { ground({ img: SK.img(V1(e)), follow: e, x: e.x, y: e.y, R: 300, dur: 4, rot: 0.2, a: 0.6 });
      zone({ follow: e, x: e.x, y: e.y, R: 300, dur: 4, onStay: () => sil(0.25), update(z) { if (!alive(e)) z.t = z.dur; } }); } }, C1, { dur: 0.9 })];   // внутри герой без умений

  // ===================== Мир 10: Бездна =====================
  DEF.v_abyssguard = [Object.assign({ ph: 'Сокрушение', col: '#b07aff', cd: 10, can: (e, d) => d < 230,
    cast(e) { groundImg(V1(e), e.x, e.y, 250, 0.6, { add: 1, grow: 0.2 }); snd('boss_slam', 0.6); if (near(e.x, e.y, 250)) { hurtPlayer(25 * e.dm); stun(1); } } }, C1, { at: 0.6 })];
  // «Ответный вихрь» — пассив: когда берсерка бьют (см. hurtEnemy выше)
  DEF.v_abyssberserker = [{ ph: 'Ответный вихрь', passive: true, poly: 'hurt', cd: 1e9 }];
  DEF.v_abyssscarab = [Object.assign({ ph: 'Шипы из глубины', col: '#b07aff', cd: 10, can: (e, d) => d > 120 && d < 650,
    cast(e) { snd('boss_slam', 0.5, 1.1); line(e, { img: V1(e), len: 700, w: 120, vis: 620, run: 0.35, dur: 1, onHit() { hurtPlayer(25 * e.dm); stun(1); } }); } }, C1, { at: 0.55 })];
  DEF.v_voidwyvern = [Object.assign({ ph: 'Скверна', col: '#a8e36a', cd: 12, can: (e, d) => d < 650,
    cast(e) { const x = P.x, y = P.y; warn(x, y, 250, 0.5, 0);
      after(0.5, null, () => { groundImg(V1(e), x, y, 250, 4, { a: 0.85, rot: 0.15 });
        zone({ x, y, R: 250, dur: 4, tick: 1, acc: 0.3, onTick: () => hurtPlayer(8 * e.dm, 'poison'), onStay: () => sil(0.25) }); }); } }, C1)];   // в луже — урон и без умений
  DEF.v_netherkeeper = [Object.assign({ ph: 'Скверный страж', col: '#7dff8a', cd: 18, first: 3, can: (e, d) => d < 700 && WARDS.length < 2,
    cast(e) { const w = { x: e.x + 70, y: e.y + 10, t: 8, dm: 15 * e.dm, img: V1(e) }; WARDS.push(w); mark({ img: V1(e), on: w, at: 70, dur: 8, size: 150 }); } }, C1)];
  DEF.v_shadowlord = [Object.assign({ ph: 'Теневой яд', col: '#b07aff', cd: 5, can: (e, d) => d < 850,
    cast(e) { proj(e, { img: V1(e), sp: 1000, left: 900, w: 150, size: 190, pierce: true,
      onHit() { if (!(S.spois > 0)) S.spoisT = 8; S.spois = Math.min(3, S.spois + 1); S.spoisDm = e.dm; show('curse', S.spoisT, { n: S.spois });   // 8, 16, 32×dm; через 8 с метки взрываются
        hurtPlayer(8 * Math.pow(2, S.spois - 1) * e.dm, 'poison'); } }); } }, C1)];

  // элита на листах базового злодея — те же умения и пассивы
  for (const id in KIND) { const b = KIND[id].base; if (b && !DEF[id] && DEF[b]) DEF[id] = DEF[b]; if (b && !ON_HIT[id] && ON_HIT[b]) ON_HIT[id] = ON_HIT[b]; }
  // цвет снаряда новых дальних — из roster.js (pcol); попадания без особых эффектов
})();
