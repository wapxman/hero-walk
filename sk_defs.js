// Умения злодеев по пакету Клауди 20.11 (SKILLS_FOR_KLOD.md). Движок — sk.js.
// Порядок: Королева Колючек и Королева Змей (жалобы Создателя), дальше по мирам 1 → 10.
'use strict';
(() => {
  const { F, img, proj, beam, line, mark, ring, ground, groundImg, zone, MOV, S, bind, pin, stun, hex, poisonStack, DEF, ON_HIT, dist, dirTo2, tag, cre, drawCre } = SK;
  const now = () => performance.now() / 1000;
  // замедление, которое слабеет до нуля за t секунд (k — начальная доля скорости)
  function fadingSlow(k, t) { MOV.push({ t: 0, dur: t, update: m => slowHero(k + (1 - k) * (m.t / m.dur), 0.15) }); }
  // яд по времени: dm в секунду, t секунд
  function dot(dm, t, kind) { MOV.push({ t: 0, dur: t, acc: 1, update: (m, dt) => { m.acc -= dt; if (m.acc <= 0) { m.acc = 1; hurtPlayer(dm, kind || 'poison'); } } }); }
  // призыв злодея-существа рядом с героем/злодеем (ходит и бьёт как обычный враг)
  function summon(type, x, y) { spawnEnemyBase(type); const m = enemies[enemies.length - 1]; m.x = x; m.y = y; collide(m); return m; }
  // лист существа как персонаж (для призванных злодеев)
  function creChar(id, anims, top) {
    const mul = {}; for (const k in anims) { const a = anims[k]; if (a) mul[k] = { at: a.at, n: a.n, ms: a.ms, rows: a.rows, foot: a.foot }; }
    CHARS[id] = { lazy: 1, U: 100, top: top || 1.6, k: VK, mul, at: id };
  }

  // ===================== Королева Колючек (mb_thornqueen) — мини-босс мира 3 =====================
  // старые «Корни» (метка) и «Ядовитый сад» (вокруг себя) заменены на Overgrowth и Venomous Gale
  KIND.mb_thornqueen.spells = []; MECH.mb_thornqueen = () => false;
  DEF.mb_thornqueen = [
    { ph: 'Корни', col: '#b9e37a', cd: 11, first: 1.6, an: 'cast1', dur: 0.8, at: 0.45,
      cast(e) {   // мгновенно, без метки: круг 520 — опутан 2 с, 25×dm в секунду
        groundImg('fx/vfx_b_thornqueen_1.webp', e.x, e.y, 520, 2.2, { rot: 0.1 });
        if (dist(P, e) < 520) {
          bind(2); dot(25 * e.dm, 2, 'nature');
          mark({ img: F('b_thornqueen', 'tq_wrap'), dur: 2, at: SK.HEAD() * 0.55, size: SK.HEAD() * 1.15 });
        }
      } },
    { ph: 'Ядовитый сад', col: '#9be37a', cd: 9, first: 3.2, an: 'tq_gale_cast', dur: 0.9, at: 0.55,
      cast(e) {   // шквал летит в героя с любой дистанции
        proj(e, { img: F('b_thornqueen', 'tq_gale'), sp: 650, left: 1400, w: 110, size: 170,
          onHit(p) { hurtPlayer(40 * e.dm, 'poison'); dot(12 * e.dm, 4); fadingSlow(0.5, 4); garden(p.x, p.y, e); },
          onEnd(p) { if (!p.hit.has(P)) garden(p.x, p.y, e); } });
      } },
  ];
  function garden(x, y, e) {   // кольцо ядовитых цветов на 3 с, внутри 15×dm/с
    groundImg('fx/vfx_b_thornqueen_2.webp', x, y, 130, 3, { rot: 0.2 });
    zone({ x, y, R: 130, dur: 3, tick: 1, onTick: () => hurtPlayer(15 * e.dm, 'poison') });
  }

  // ===================== Королева Змей (b_serpentqueen) — босс мира 3, теперь дальний бой =====================
  // прежние рой/взгляд (bossmech.js) заменены; пустой MECH — чтобы не включились общие умения боссов (призыв, прыжок)
  MECH.b_serpentqueen = MECH.tb_serpentqueen = () => false;
  Object.assign(KIND.b_serpentqueen, { mel: 0, rng: 1, want: 450, shot: 700, cd: 1.3, pcol: '120,230,90', spells: [] });
  {
    const c = CHARS.b_serpentqueen;   // выстрел из посоха — свой лист на 8 направлений
    const sh = SKSHEETS.b_serpentqueen && SKSHEETS.b_serpentqueen.a.sq_shoot;
    if (c && sh) c.mul.atk = { at: sh.at, n: sh.n, ms: sh.ms, rows: sh.rows, foot: sh.foot };
    if (c && c.loading && c.mul.atk && !c.mul.atk.img) { const a = c.mul.atk; a.img = new Image(); a.img.onload = () => { a.ok = true; c.ok = Object.values(c.mul).every(x => x.ok); }; a.img.src = 'chars/at_' + a.at + '.webp' + V; }
  }
  // её снаряд — sq_bolt по полёту; каждое попадание — стак яда (Ядовитый укус) и брызги sq_venom
  const VENOM = (e, n) => () => { poisonStack(e.dm); mark({ img: F('b_serpentqueen', 'sq_venom'), dur: 0.6, at: SK.HEAD() * 0.5, size: 90 }); };
  SK.SHOT_IMG = { b_serpentqueen: F('b_serpentqueen', 'sq_bolt') };
  SK.SHOT_HIT = { b_serpentqueen: e => VENOM(e) };
  // змея роя: ползёт к герою головой вперёд
  const SNAKE = cre('b_serpentqueen', 'sq_snake');
  function snake(e, i) {
    const a = i / 6 * 6.283, sp = 150 + Math.random() * 50;
    MOV.push({ t: 0, dur: 7, x: e.x + Math.cos(a) * 70, y: e.y + Math.sin(a) * 70 * YK, ang: a,
      update(m, dt) {
        if (m.done) return;
        const [dx, dy, d] = dirTo2(m, P); m.ang = Math.atan2(dy, dx); m.x += dx * sp * dt; m.y += dy * sp * YK * dt;
        if (d < 36 && P.dead <= 0) { m.done = true; m.t = m.dur; hurtPlayer(12 * e.dm, 'poison'); S.snake = Math.min(4, (S.snake || 0) + 1); S.snakeT = 4; }
      },
      draw(m, t) { drawCre(SNAKE, m.x, m.y, t, 0, { rot: m.ang, a: Math.min(1, m.t * 4, (m.dur - m.t) * 2) }); } });
  }
  MOV.push({ t: 0, dur: 1e9, update(m, dt) { if (S.snakeT > 0) { S.snakeT -= dt; slowHero(1 - 0.15 * S.snake, 0.2); if (S.snakeT <= 0) S.snake = 0; } } });
  // идол: стоит, поворачивается к герою и плюётся ядом; герой может разбить
  const IDOL = SKSHEETS.b_serpentqueen && SKSHEETS.b_serpentqueen.a.sq_idol;
  if (IDOL) {
    creChar('sk_idol', { idle: IDOL, run: IDOL, atk: IDOL, die: IDOL }, 1.6);
    KIND.sk_idol = { nm: 'Змеиный идол', ch: 'sk_idol', hp: 300, rad: 30, speed: 0, dmg: [0, 0], cd: 99, reach: 0, xp: 5, gold: 3, col: '#3a5a1a', sc: 1, pw: 1 };
  }
  MECH.sk_idol = function (e, dt) {
    e.life = (e.life == null ? 15 : e.life) - dt;
    if (e.life <= 0) { e.hp = 0; e.dieT = 0; e.anim = 'die'; return true; }
    e.row = runRow(P.x - e.x, P.y - e.y); e.anim = 'idle';
    if ((e.spit = (e.spit == null ? 1.2 : e.spit) - dt) <= 0) {
      e.spit = 1.2;
      SK.proj(e, { img: F('b_serpentqueen', 'sq_spit'), sp: 650, left: 1000, w: 60, size: 80, onHit: () => { hurtPlayer(14 * e.dm, 'poison'); poisonStack(e.dm); } });
    }
    return true;
  };
  DEF.b_serpentqueen = [
    { ph: 'Змеиный рой', col: '#9be37a', cd: 9, first: 1.6, an: 'cast1', dur: 1.0, at: 0.55, cast(e) { for (let i = 0; i < 6; i++) snake(e, i); } },
    { ph: 'Ядовитый взгляд', col: '#7dff6a', cd: 8, first: 3.4, an: 'cast2', dur: 0.9, at: 0.4, can: (e, d) => d < 900,
      cast(e) {   // прямой луч из глаз до героя 0,8 с
        beam(e, { img: F('b_serpentqueen', 'sq_gaze'), dur: 0.8, w: 60, from: e.ch.top * e.ch.U * e.sc * 0.85 });
        hurtPlayer(30 * e.dm, 'poison'); slowHero(0.4, 2); SK.say2('взгляд змеи', '#7dff6a');
      } },
    { ph: 'Бросок гадюки', col: '#c9ff7a', cd: 11, first: 5, an: 'sq_strike_cast', dur: 0.8, at: 0.55,
      cast(e) {
        proj(e, { img: F('b_serpentqueen', 'sq_strike'), sp: 750, left: 1100, w: 80, size: 150,
          onHit() { hurtPlayer(40 * e.dm, 'poison'); slowHero(0.4, 3); S.atkSlow = 3; S.atkSlowK = 0.4; dot(10 * e.dm, 3); } });
      } },
    { ph: 'Змеиный идол', col: '#9be37a', cd: 20, first: 7, an: 'sq_ward_cast', dur: 0.9, at: 0.6, can: () => !!KIND.sk_idol && !enemies.some(o => o.type === 'sk_idol' && o.dieT == null),
      cast(e) { const m = summon('sk_idol', (e.x + P.x) / 2, (e.y + P.y) / 2); m.dm = e.dm; m.life = 15; } },
  ];

  // ===================== Мир 1: Королевский замок =====================
  // Чёрный Рыцарь: + Багровая кара, Вызов на поединок, Жажда битвы, Призрачная конница (щит и таран — как были)
  const HORSE = cre('b_blackknight', 'bk_horse');
  DEF.b_blackknight = [
    { ph: 'Багровая кара', col: '#ff5a5a', cd: 10, first: 2, an: 'bk_chaos_cast', dur: 0.8, at: 0.55,
      cast(e) { proj(e, { img: F('b_blackknight', 'bk_chaos'), sp: 600, left: 1200, w: 90, size: 130,
        onHit() { const k = Math.random(); hurtPlayer((30 + 60 * k) * e.dm); stun(1 + 1.5 * Math.random()); } }); } },
    { ph: 'Вызов на поединок', col: '#ffd95e', cd: 14, first: 4.5, an: 'bk_call_cast', dur: 0.9, at: 0.5,
      cast(e) {   // круг 520: 2 с герой сам идёт к рыцарю и бьёт его; рыцарь 3 с в золотой броне (−40 % урона)
        groundImg(F('b_blackknight', 'bk_call'), e.x, e.y, 520, 1.2, { grow: 0.5 });
        e.dr = 3; MOV.push({ t: 0, dur: 3, update: (m, dt) => { e.dr = Math.max(0, e.dr - dt); } });
        if (dist(P, e) < 520) { S.called = 2; S.calledBy = e; SK.say2('вызван!', '#ffd95e'); }
      } },
    { ph: 'Жажда битвы', col: '#ff6a5a', cd: 12, first: 7, an: 'bk_hunger_cast', dur: 0.8, at: 0.5,
      cast(e) { S.hunger = 8; S.hungerK = kills; S.hungerDm = e.dm; mark({ img: F('b_blackknight', 'bk_hunger'), dur: 8, size: 90, until: () => S.hunger <= 0 }); } },
    { ph: 'Призрачная конница', col: '#ff9a7a', cd: 16, first: 9.5, an: 'bk_horn_cast', dur: 0.9, at: 0.5,
      cast(e) {   // через 0,6 с — полосы-предупреждения, ещё через 0,6 с поперёк арены через героя проносятся 3 коня
        const dir = Math.random() < 0.5 ? 1 : -1, y0 = P.y;
        MOV.push({ t: 0, dur: 3.2, hits: false,
          update(m) {
            if (!m.horses && m.t > 1.2) m.horses = [-1, 0, 1].map(i => ({ y: y0 + i * 70, x: dir > 0 ? cam.x - 200 : cam.x + cam.vw + 200 }));
            if (m.horses) for (const h of m.horses) { h.x += dir * 900 / 60; if (!h.hit && Math.abs(h.x - P.x) < 70 && Math.abs(h.y - P.y) < 50 && P.dead <= 0) { h.hit = true; hurtPlayer(45 * e.dm); slowHero(0.6, 2); } }
          },
          draw(m, t) {
            if (m.t > 0.6 && !m.horses) { ctx.save(); ctx.globalAlpha = 0.25 + 0.15 * Math.sin(t * 20); ctx.fillStyle = '#ff2a2a'; for (const i of [-1, 0, 1]) ctx.fillRect(cam.x - 100, y0 + i * 70 - 22, cam.vw + 200, 44); ctx.restore(); }
            if (m.horses) for (const h of m.horses) { SK.groundImg && 0; drawCre(HORSE, h.x, h.y + 10, t, 0, { flip: dir < 0, a: 0.85 }); }
          } });
      } },
  ];
  // Фарфоровая фрейлина: Золотые разряды — 4 удара золотой молнии по герою
  DEF.porcelainmaid = [
    { ph: 'Золотые разряды', col: '#ffe27a', cd: 10, an: 'pm_cast', dur: 0.8, at: 0.5, can: (e, d) => d < 600,
      cast(e) { for (let i = 0; i < 4; i++) setTimeout(() => { if (P.dead > 0 || e.dieT != null) return; mark({ img: F('porcelainmaid', 'pm_bolt'), dur: 0.35, at: SK.HEAD() * 0.9, size: 200, add: 1 }); hurtPlayer(16 * e.dm); slowHero(Math.max(0.4, 0.85 - 0.15 * i), 2); }, 400 * i); } },
  ];
  // Безумный шут: Клетка шута — кольцо огней вокруг героя, 3 с не выйти
  DEF.jester = [
    { ph: 'Клетка шута', col: '#ffd95e', cd: 13, an: 'js_cast', dur: 0.8, at: 0.5, can: (e, d) => d < 700,
      cast(e) { ring({ img: F('jester', 'js_ring'), x: P.x, y: P.y, R: 170, dur: 3.4, delay: 0.4 }); } },
  ];

  // ===================== Мир 2: Горящая деревня (и мир 8 — бес, пёс, культисты, призрак) =====================
  // общие помощники: канал (держит каст, прерывается уроном), призыв голема
  function channel(e, an, dur, o) {   // o: { tick(dt), stop(), breakPct, breakHits, breakFar }
    const ch = { t: 0, taken: 0, hits: 0 };
    e.skChannel = ch; e.act = { anim: an, dur: dur + 0.2, at: 2, fn: () => {}, t: 0, hit: false }; e.anim = an;
    MOV.push({ t: 0, dur, update(m, dt) {
      const broke = e.dieT != null || (o.breakPct && ch.taken >= e.max * o.breakPct) || (o.breakHits && ch.hits >= o.breakHits) || (o.breakFar && dist(P, e) > o.breakFar) || P.dead > 0;
      if (broke) { m.t = m.dur; e.act = null; e.skChannel = null; if (o.stop) o.stop(true); if (e.dieT == null) tag(e, 'прервано', '#bfe6ff'); return; }
      if (e.act) e.act.t = Math.min(e.act.dur * 0.6, e.act.t);   // держим кадры середины каста
      if (o.tick) o.tick(dt, m.t);
      if (m.t + dt >= m.dur) { e.skChannel = null; e.act = null; if (o.stop) o.stop(false); }
    } });
  }
  function golemChar(id, sp, pre, top) {
    const a = SKSHEETS[sp] && SKSHEETS[sp].a; if (!a || !a[pre + 'walk']) return false;
    creChar(id, { run: a[pre + 'walk'], idle: a[pre + 'walk'], atk: a[pre + 'attack'], die: a[pre + 'death'] }, top);
    return true;
  }
  if (golemChar('sk_golem', 'b_plaguelord', 'golem_', 2.4)) KIND.sk_golem = { nm: 'Угольный голем', ch: 'sk_golem', mel: 1, hp: 600, rad: 34, speed: 110, dmg: [26, 34], cd: 1.4, reach: 90, xp: 10, gold: 6, col: '#4a3a2a', sc: 1, pw: 1, life: 20 };
  MECH.sk_golem = MECH.sk_golem_void = function (e, dt) { e.life = (e.life == null ? e.k.life : e.life) - dt; if (e.life <= 0) { e.hp = 0; e.dieT = 0; e.anim = 'die'; e.act = null; return true; } };
  function golemDrop(e, kind, fall, dmg, st) {
    const x = e.x + (P.x - e.x) * 0.6, y = e.y + (P.y - e.y) * 0.6;
    setTimeout(() => {
      if (e.dieT != null) return;
      groundImg(fall, x, y, 150, 1.0);
      if (Math.hypot(P.x - x, (P.y - y) / YK) < 170) { hurtPlayer(dmg * e.dm); stun(st); }
      const g = summon(kind, x, y); g.dm = e.dm;
    }, 400);
  }
  const RAT = cre('b_plaguelord', 'pl_rat', VK * 0.9);
  DEF.b_plaguelord = [
    { ph: 'Угольный голем', col: '#ffb36a', cd: 25, first: 2.5, an: 'pl_golem_cast', dur: 0.9, at: 0.5, can: () => KIND.sk_golem && !enemies.some(o => o.type === 'sk_golem' && o.dieT == null),
      cast(e) { golemDrop(e, 'sk_golem', F('b_plaguelord', 'pl_golem_fall'), 40, 1.2); } },
    { ph: 'Чумной туман', col: '#9be37a', cd: 13, first: 5, can: (e, d) => d < 900,
      cast(e) {   // канал до 4 с: под героем растёт облако, в нём всё медленнее; урон ≥8 % HP прерывает
        const z = { img: img(F('b_plaguelord', 'pl_fog')), x: P.x, y: P.y, R: 260, dur: 4.2, grow: 3.5, a: 0.85 };
        ground(z);
        channel(e, 'pl_fog_cast', 4, { breakPct: 0.08,
          tick(dt, t) { if (dist(P, z) < 260 * Math.min(1, 0.3 + t / 3.5)) { slowHero(0.8 - 0.4 * t / 4, 0.2); if ((z.acc = (z.acc || 0) - dt) <= 0) { z.acc = 1; hurtPlayer(8 * e.dm, 'poison'); } } },
          stop() { z.dur = z.t + 0.4; } });
      } },
    { ph: 'Чёрное слово', col: '#c9a8ff', cd: 10, first: 7, an: 'pl_word_cast', dur: 0.8, at: 0.5,
      cast(e) {   // раненому злодею рядом — лечит, иначе жжёт героя
        const ally = enemies.find(o => o.dieT == null && o !== e && o.hp < o.max * 0.5 && dist(o, e) < 700);
        if (ally) mark({ img: F('b_plaguelord', 'pl_word'), on: ally, at: ally.ch.top * ally.ch.U * ally.sc + 30, dur: 5, size: 80, every: 1, tick: () => { ally.hp = Math.min(ally.max, ally.hp + 20 * e.dm); } });
        else mark({ img: F('b_plaguelord', 'pl_word'), dur: 5, size: 90, every: 1, tick: () => hurtPlayer(14 * e.dm) });
      } },
    { ph: 'Крысиное проклятие', col: '#9be37a', cd: 15, first: 9.5, an: 'pl_hex_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 800,
      cast(e) { const puff = () => mark({ img: F('b_plaguelord', 'pl_hex_puff'), dur: 0.6, at: SK.HEAD() * 0.5, size: 170 }); puff(); hex(3, RAT, 0.9); SK.say2('ты — крыса!', '#9be37a'); setTimeout(puff, 3000); } },
  ];
  // Жнец Урожая (мини-босс): + Соломенные колья — полоса к герою, подбрасывает и оглушает
  DEF.mb_reaper = [
    { ph: 'Соломенные колья', col: '#ffb347', cd: 11, first: 2, an: 'rp_stakes_cast', dur: 0.9, at: 0.5, can: (e, d) => d < 750,
      cast(e) { line(e, { img: F('b_reaper', 'rp_stakes'), len: 700, w: 110, run: 0.5, dur: 1.3, onHit() { hurtPlayer(50 * e.dm); stun(1.2); SK.say2('подброшен!', '#ffb347'); } }); } },
  ];
  // Огненный бес: Огненный след — 2,5 с носится кругами вокруг героя, оставляя полосу огня
  DEF.fireimp = [
    { ph: 'Огненный след', col: '#ff8a3a', cd: 12, can: (e, d) => d < 500,
      cast(e) {
        let a = Math.atan2((e.y - P.y) / YK, e.x - P.x), drop = 0, flyT = 0;
        e.act = { anim: 'fi_cast', dur: 2.6, at: 2, fn: () => {}, t: 0, hit: false }; e.anim = 'fi_cast';
        e.skMove = dt => {
          if (!e.act) e.act = { anim: 'fi_cast', dur: 2.6, at: 2, fn: () => {}, t: 0, hit: false };
          e.act.t = Math.min(e.act.t + dt, 1.0); a += dt * e.speed * 2.2 / 190;
          const x = P.x + Math.cos(a) * 190, y = P.y + Math.sin(a) * 190 * YK; e.row = runRow(x - e.x, y - e.y); e.x = x; e.y = y;
          if ((drop -= dt) <= 0) { drop = 0.1; groundImg(F('fireimp', 'fi_trail'), e.x, e.y, 45, 3, { ang: a + 1.57 }); zone({ x: e.x, y: e.y, R: 45, dur: 3, tick: 1, onTick: () => hurtPlayer(10 * e.dm, 'fire') }); }
          if ((flyT += dt) > 2.5 || e.dieT != null) { e.skMove = null; e.act = null; }
        };
      } },
  ];
  // Магмовый пёс: каждый 3-й укус — оглушение 0,6 с и горение
  ON_HIT.magmahound = (e, n) => { if (n % 3) return; stun(0.6); dot(6 * e.dm, 3, 'fire'); mark({ img: F('magmahound', 'mh_bite'), dur: 0.6, at: SK.HEAD() * 0.5, size: 110 }); };
  // Пепельный культист: Высасывание силы — красная нить, герой медленнее, культист лечится
  const DRAIN = { ph: 'Высасывание силы', col: '#ff5a5a', cd: 12, first: 2.5, can: (e, d) => d < 600,
    cast(e) {
      const b = { img: F('ashcultist', 'ac_drain'), dur: 3, w: 46, from: e.ch.top * e.ch.U * e.sc * 0.55 };
      SK.beam(e, b);
      const B = SK.BEAMS[SK.BEAMS.length - 1];
      channel(e, 'ac_drain_cast', 3, { breakHits: 2, breakFar: 700,
        tick(dt) { slowHero(0.7, 0.2); if ((B.acc = (B.acc || 0) - dt) <= 0) { B.acc = 1; hurtPlayer(10 * e.dm); e.hp = Math.min(e.max, e.hp + 10 * e.dm); } },
        stop() { B.dur = B.t; } });
    } };
  DEF.ashcultist = [DRAIN];
  // Верховный культист: Огненный змей (волна насквозь) + Высасывание силы
  DEF.el_cultist = [
    { ph: 'Огненный змей', col: '#ff7a3a', cd: 9, first: 2, an: 'ac_wave_cast', dur: 0.8, at: 0.55,
      cast(e) { proj(e, { img: F('ashcultist', 'ac_wave'), sp: 900, left: 800, w: 140, size: 220, pierce: true, onHit: () => hurtPlayer(55 * e.dm, 'fire') }); } },
    Object.assign({}, DRAIN, { first: 5 }),
  ];
  // Пепельный призрак: Пепельные мотыльки — стая сквозь героя
  DEF.cinderwraith = [
    { ph: 'Пепельные мотыльки', col: '#ffb36a', cd: 9, an: 'cw_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
      cast(e) { proj(e, { img: F('cinderwraith', 'cw_swarm'), sp: 700, left: 900, w: 130, size: 180, pierce: true, onHit: () => hurtPlayer(35 * e.dm, 'fire') }); } },
  ];

  // ===================== Мир 3: Осенний лес =====================
  // Шипокорень: Цепкие лозы (полоса замедляет и ранит) и Бревно (5 ударов деревом)
  DEF.thornroot = [
    { ph: 'Цепкие лозы', col: '#b9e37a', cd: 10, first: 2, an: 'tr_grasp_cast', dur: 0.8, at: 0.5, can: (e, d) => d < 650,
      cast(e) { line(e, { img: F('thornroot', 'tr_grasp'), len: 600, w: 110, run: 0.6, dur: 3.6, onStay(l, dt) { slowHero(0.55, 0.2); l.acc = (l.acc || 0) - dt; if (l.acc <= 0) { l.acc = 1; hurtPlayer(12 * e.dm, 'nature'); } } }); } },
    { ph: 'Бревно', col: '#d9b37a', cd: 18, first: 5, an: 'tr_grab_cast', dur: 0.9, at: 0.6, can: (e, d) => d < 400,
      cast(e) { e.logs = 5; } },
  ];
  ON_HIT.thornroot = e => { if (e.logs > 0) { e.logs--; hurtPlayer(rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm * 0.5); mark({ img: F('thornroot', 'tr_splinter'), dur: 0.5, at: SK.HEAD() * 0.5, size: 130 }); if (!e.logs) tag(e, 'бревно сломалось', '#d9b37a'); } };
  { const _sa = startAct; startAct = function (e, anim, dur, at, fn) { if (anim === 'atk' && e.logs > 0 && e.ch.mul && e.ch.mul.tr_logattack) anim = 'tr_logattack'; return _sa(e, anim, dur, at, fn); }; }
  // Осенний медведь: Прыжок-удар (волна листьев: урон и замедление вокруг)
  const BEARLEAP = { ph: 'Прыжок-удар', col: '#ffb347', cd: 9, first: 2, an: 'ab_shock_cast', dur: 0.6, at: 0.1, can: (e, d) => d < 400 && d > 120,
    cast(e) {
      const x = P.x, y = P.y; leapTo(e, x, y, 0.5, 0, 0, 'ab_shock_cast');
      setTimeout(() => { if (e.dieT != null) return; groundImg(F('autumnbear', 'ab_shock'), e.x, e.y, 220, 0.9); if (dist(P, e) < 220) { hurtPlayer(40 * e.dm); slowHero(0.6, 2); } }, 520);
    } };
  DEF.autumnbear = [BEARLEAP];
  // Матёрый медведь: Прыжок-удар + Ярость (3 удара вдвое быстрее, красное свечение)
  DEF.el_bear = [BEARLEAP, { ph: 'Ярость', col: '#ff5a3a', cd: 12, first: 5, an: 'ab_roar_cast', dur: 0.9, at: 0.6,
    cast(e) { let hits = 3; const h0 = e.hits || 0; mark({ img: F('autumnbear', 'ab_rage'), on: e, at: e.ch.top * e.ch.U * e.sc * 0.5, dur: 4, size: 220, add: 1, until: () => (e.hits || 0) - h0 >= hits });
      MOV.push({ t: 0, dur: 4, update: () => { if ((e.hits || 0) - h0 < hits) e.atkCd = Math.min(e.atkCd, e.k.cd * 0.5); } }); } }];
  // Теневой волк: Прыжок из тени — прикован 2 с
  DEF.shadowwolf = [{ ph: 'Прыжок из тени', col: '#9a8aff', cd: 10, first: 2, an: 'sw_cast', dur: 0.5, at: 0.1, first: 0.8, can: (e, d) => d < 420,
    cast(e) { leapTo(e, P.x, P.y, 0.5, 0, 0, 'sw_cast');
      setTimeout(() => { if (e.dieT != null || dist(P, e) > 110) return; hurtPlayer(30 * e.dm); pin(2); groundImg(F('shadowwolf', 'sw_pin'), P.x, P.y, 90, 2); }, 520); } }];
  // Лис-оборотень: Удар в спину — исчезает в дыму и появляется за спиной героя
  DEF.werefox = [{ ph: 'Удар в спину', col: '#ffa04a', cd: 9, first: 2, can: (e, d) => d < 650,
    cast(e) {
      const puff = (x, y) => mark({ img: F('werefox', 'wf_puff'), on: { x, y }, at: 60, dur: 0.6, size: 150 });
      puff(e.x, e.y); e.skBusy = 0.35; const old = e.sc; e.hide = 1;
      setTimeout(() => {
        if (e.dieT != null) return;
        const fx = P.face ? P.face.x : 1, fy = P.face ? P.face.y : 0; e.x = P.x - fx * 70; e.y = P.y - fy * 70 * YK; collide(e); puff(e.x, e.y); e.hide = 0;
        e.row = runRow(P.x - e.x, P.y - e.y);
        startAct(e, 'atk', 0.45, 0.4, () => { if (dist(P, e) < 130) { hurtPlayer(rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm * 1.8); slowHero(0.7, 1.5); } });
      }, 300);
    } }];
  // Гнилая дриада: Гнилой шар — скачет между героем и злодеями до 5 раз
  DEF.rotdryad = [{ ph: 'Гнилой шар', col: '#b9e37a', cd: 12, first: 2.5, an: 'rd_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 800,
    cast(e) { bounce(e, F('rotdryad', 'rd_orb'), 600, 5, n => { hurtPlayer(20 * e.dm * (1 + 0.15 * n)); slowHero(0.7, 2); }); } }];
  // шар, который скачет герой → злодей рядом → герой …; hitHero(n) — попадание в героя
  function bounce(e, src, sp, max, hitHero, spin) {
    const o = { x: e.x, y: e.y - 60, tgt: P, n: 0, t: 0, dur: 30, back: false };
    MOV.push(Object.assign(o, {
      update(m, dt) {
        const tx = m.tgt.x, ty = m.tgt.y - 60, dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy);
        if (d < 30) {
          if (m.tgt === P) { hitHero(m.n); m.n++; }
          if (m.n >= max) { m.t = m.dur; return; }
          const next = m.tgt === P ? enemies.find(o2 => o2.dieT == null && Math.hypot(o2.x - P.x, (o2.y - P.y) / YK) < 500 && o2 !== e) || e : P;
          if (next === e && m.tgt !== P && m.tgt === e) { m.t = m.dur; return; }
          m.tgt = next; return;
        }
        const st = Math.min(d, sp * dt); m.x += dx / d * st; m.y += dy / d * st;
      },
      draw(m, t) { const i = SK.img(src); if (!SK.ready(i)) return; ctx.save(); ctx.translate(m.x, m.y); if (spin) ctx.rotate(t * spin); ctx.drawImage(i, -45, -45, 90, 90); ctx.restore(); } }));
  }
  SK.bounce = bounce;
  // Кабан-громила: Топот — метка вокруг, затем ударная волна с оглушением
  DEF.boarbrute = [{ ph: 'Топот', col: '#ffb36a', cd: 10, first: 2, an: 'bb_cast', dur: 1.0, at: 0.65, can: (e, d) => d < 260,
    cast(e) { groundImg(F('boarbrute', 'bb_wave'), e.x, e.y, 260, 0.9, { grow: 0.4 }); if (dist(P, e) < 260) { hurtPlayer(35 * e.dm); stun(1.2); } } }];
  // Пугало-жнец: Серп на верёвке — зацепил, тянет к себе
  DEF.scarecrow = [{ ph: 'Серп на верёвке', col: '#d9b37a', cd: 12, first: 2, an: 'sc_cast', dur: 0.7, at: 0.5, first: 0.8, can: (e, d) => d < 700,
    cast(e) { proj(e, { img: F('scarecrow', 'sc_sickle'), sp: 900, left: 700, w: 80, size: 110, spin: 14, rope: e,
      onHit() { hurtPlayer(30 * e.dm); S.pull = { x: e.x + (P.x > e.x ? 70 : -70), y: e.y, t: 0.5 }; } }); } }];
  // Грибной шаман: каждый 3-й выстрел — спора-пиявка (замедление, корень 0,4 с, злодеи рядом лечатся)
  SK.SHOT_HIT.sporeshaman = e => () => {
    e.shotN = (e.shotN || 0) + 1; if (e.shotN % 3) return;
    pin(0.4);
    mark({ img: F('sporeshaman', 'ss_seed'), dur: 3, at: SK.HEAD() * 0.6, size: 80, every: 1, tick() { hurtPlayer(6 * e.dm, 'nature'); for (const o of enemies) if (o.dieT == null && dist(o, P) < 300) o.hp = Math.min(o.max, o.hp + 6 * e.dm); } });
  };
  // Колючий бес: Колючий залп — иглы во все стороны, каждый следующий больнее
  DEF.thornimp = [{ ph: 'Колючий залп', col: '#b9e37a', cd: 6, first: 1.5, an: 'ti_cast', dur: 0.6, at: 0.5, can: (e, d) => d < 360,
    cast(e) { const t = now(); e.tiN = t - (e.tiT || -99) < 10 ? (e.tiN || 0) + 1 : 0; e.tiT = t; groundImg(F('thornimp', 'ti_burst'), e.x, e.y, 360, 0.7, { add: 1 }); if (dist(P, e) < 360) hurtPlayer((20 + 8 * e.tiN) * e.dm); } }];
  // Ворона-гарпия: Чёрное перо — самонаводящийся вихрь перьев
  DEF.crowharpy = [{ ph: 'Чёрное перо', col: '#a08ac0', cd: 10, first: 2, an: 'ch_cast', dur: 0.7, at: 0.5, can: (e, d) => d < 900,
    cast(e) { proj(e, { img: F('crowharpy', 'ch_feathers'), sp: 500, left: 1500, w: 80, size: 120, spin: 8, homing: 2.2, onHit() { hurtPlayer(30 * e.dm); slowHero(0.65, 2.5); } }); } }];
  // Пустой лучник: горящие стрелы (+12×dm огня)
  SK.SHOT_IMG.hollowarcher = F('hollowarcher', 'ha_arrow');
  SK.SHOT_HIT.hollowarcher = e => () => hurtPlayer(12 * e.dm, 'fire');

  // ===================== Мир 4: Проклятое болото =====================
  // Король-Жаб: + Язык-крюк, Болотный рывок, Тяжёлый скипетр (пассив), Щупальца трясины
  DEF.b_toadking = [
    { ph: 'Язык-крюк', col: '#ff9ac0', cd: 13, first: 2, an: 'tk_tongue_cast', dur: 0.7, at: 0.5, can: (e, d) => d < 750 && d > 160,
      cast(e) { proj(e, { img: F('b_toadking', 'tk_tongue'), sp: 1100, left: 750, w: 70, size: 110, tongue: e,
        onHit() { hurtPlayer(40 * e.dm); S.pull = { x: e.x + (P.x > e.x ? 90 : -90), y: e.y, t: 0.5 }; } }); } },
    { ph: 'Болотный рывок', col: '#8a9a5a', cd: 14, first: 6, an: 'tk_slide_cast', dur: 0.5, at: 0.2, can: (e, d) => d > 450,
      cast(e) {   // 3 с скользит на брюхе к герою ×2,2, сквозь всех, за ним брызги
        let t = 0, drop = 0;
        e.skMove = dt => {
          t += dt; if (!e.act) e.act = { anim: 'tk_slide_cast', dur: 3.2, at: 2, fn: () => {}, t: 0.3, hit: false };
          e.act.t = Math.min(e.act.t + dt, 0.6);
          const [dx, dy, d] = dirTo2(e, P), sp = e.speed * 2.2;
          if (d > 60) { e.x += dx * sp * dt; e.y += dy * sp * YK * dt; e.row = runRow(dx, dy); }
          if ((drop -= dt) <= 0) { drop = 0.12; groundImg(F('b_toadking', 'tk_splash'), e.x, e.y, 70, 1.4); }
          if (t > 3 || d < 90 || e.dieT != null) { e.skMove = null; e.act = null; }
        };
      } },
    { ph: 'Щупальца трясины', col: '#8a9a5a', cd: 18, first: 9, an: 'tk_slam_cast', dur: 1.0, at: 0.6, can: (e, d) => d < 480,
      cast(e) { groundImg(F('b_toadking', 'tk_tentacles'), e.x, e.y, 480, 1.4, { grow: 0.3 }); if (dist(P, e) < 480) { hurtPlayer(50 * e.dm); stun(1.8); SK.say2('подброшен!', '#8a9a5a'); } } },
  ];
  ON_HIT.b_toadking = (e, n) => { if (n % 3) return; hurtPlayer(30 * e.dm); stun(1); mark({ img: F('b_toadking', 'tk_bash'), dur: 0.6, at: SK.HEAD() * 0.5, size: 150 }); };
  // Утопленник: Водяной столб — пузыри под героем, через 0,8 с столб воды
  const TORRENT = { ph: 'Водяной столб', col: '#7ad0ff', cd: 10, first: 2, an: 'dk_torrent_cast', dur: 0.8, at: 0.5, can: (e, d) => d < 700,
    cast(e) { const x = P.x, y = P.y; warn(x, y, 140, 0.8, 0);
      setTimeout(() => { if (e.dieT != null) return; groundImg(F('drownedknight', 'dk_torrent'), x, y, 140, 1.1); if (Math.hypot(P.x - x, (P.y - y) / YK) < 150) { hurtPlayer(45 * e.dm); stun(1); setTimeout(() => slowHero(0.65, 2), 1000); } }, 800); } };
  DEF.drownedknight = [TORRENT];
  DEF.el_drowned = [TORRENT];
  // Утопленник-капитан: каждый 3-й удар — дуга волны (урон ×1,5)
  ON_HIT.el_drowned = (e, n) => { if (n % 3) return; const [dx, dy] = dirTo2(e, P); groundImg(F('drownedknight', 'dk_wave'), e.x + dx * 120, e.y + dy * 120 * YK, 260, 0.8, { ang: Math.atan2(dy, dx) }); hurtPlayer(rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm * 0.5); };
  // Жабья ведьма: Жабье проклятие — герой 2,5 с лягушка
  const FROG = cre('toadwitch', 'tw_frog', VK * 0.9);
  const TOADHEX = { ph: 'Жабье проклятие', col: '#b9e37a', cd: 16, first: 2.5, an: 'tw_hex_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 750,
    cast(e) { const puff = () => mark({ img: F('toadwitch', 'tw_puff'), dur: 0.6, at: SK.HEAD() * 0.5, size: 170 }); puff(); hex(2.5, FROG, 0.8); SK.say2('ты — лягушка!', '#b9e37a'); setTimeout(puff, 2500); } };
  DEF.toadwitch = [TOADHEX];
  // Жабья матрона: Ядовитый пузырь и Прыгучая горлянка
  DEF.el_witch = [
    { ph: 'Ядовитый пузырь', col: '#9be37a', cd: 10, first: 2, an: 'tw_bubble_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
      cast(e) { proj(e, { img: F('toadwitch', 'tw_bubble'), sp: 550, left: 1000, w: 90, size: 130, onHit() { hurtPlayer(30 * e.dm, 'poison'); dot(8 * e.dm, 4); fadingSlow(0.5, 4); } }); } },
    { ph: 'Прыгучая горлянка', col: '#ffd95e', cd: 14, first: 5, an: 'tw_gourd_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 800,
      cast(e) { SK.bounce(e, F('toadwitch', 'tw_gourd'), 650, 4, () => { hurtPlayer(20 * e.dm); stun(0.6); }, 10); } },
  ];
  // Болотный упырь: Рваные раны — герой медленнее, злодеи лечатся от ударов по нему
  DEF.bogghoul = [{ ph: 'Рваные раны', col: '#ff5a5a', cd: 12, first: 2, an: 'bg_cast', dur: 0.7, at: 0.6, can: (e, d) => d < 140,
    cast(e) { if (dist(P, e) > 160) return; S.wounds = 5; mark({ img: F('bogghoul', 'bg_wounds'), dur: 5, at: SK.HEAD() * 0.55, size: 110, until: () => S.wounds <= 0 }); } }];
  // злодеи, бьющие героя с ранами, лечатся на 30 % нанесённого урона
  { const _hp = hurtPlayer; hurtPlayer = function (d, kind) { const hp0 = P.hp; _hp(d, kind); if (SK.S.wounds > 0 && !kind) { const near2 = enemies.find(o => o.dieT == null && SK.dist(o, P) < 160); if (near2) near2.hp = Math.min(near2.max, near2.hp + (hp0 - P.hp) * 0.3); } }; }
  // Пиявец: Слизь-разряд — 4 с герой бьёт слабее
  DEF.leechworm = [{ ph: 'Слизь-разряд', col: '#c9a8ff', cd: 9, first: 2, an: 'lw_cast', dur: 0.7, at: 0.55, can: (e, d) => d < 800,
    cast(e) { proj(e, { img: F('leechworm', 'lw_bolt'), sp: 650, left: 900, w: 80, size: 110, onHit() { hurtPlayer(30 * e.dm); S.weak = 4; S.weakK = 0.7; SK.say2('слабость', '#c9a8ff'); } }); } }];
  // Фонарщик: Грозовой огонёк — туча над героем, молнии каждые 0,8 с
  DEF.wisplantern = [{ ph: 'Грозовой огонёк', col: '#7affd8', cd: 15, first: 2.5, an: 'wl_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
    cast(e) { mark({ img: F('wisplantern', 'wl_cloud'), dur: 6, at: SK.HEAD() * 1.7, size: 200, every: 0.8, tick() { hurtPlayer(12 * e.dm); } }); } }];

  // ===================== Мир 5: Гномьи шахты =====================
  // Горн-Голем: + Огненный разлом (стена), Аура ржавчины (пассив), Закалка, Дух горна
  DEF.b_forgegolem = [
    { ph: 'Огненный разлом', col: '#ff7a3a', cd: 14, first: 2, an: 'fg_slam_cast', dur: 0.9, at: 0.55, can: (e, d) => d < 750,
      cast(e) { line(e, { img: F('b_forgegolem', 'fg_fissure'), len: 700, w: 120, run: 0.35, dur: 6.3, wall: true, onHit() { hurtPlayer(45 * e.dm, 'fire'); stun(1); } }); } },
    { ph: 'Закалка', col: '#fff3c4', cd: 18, first: 6, an: 'cast2', dur: 0.8, at: 0.5,
      cast(e) {   // 5 с: не оглушить, не замедлить, лечится 2 % HP/с
        mark({ img: F('b_forgegolem', 'fg_temper'), on: e, at: e.ch.top * e.ch.U * e.sc * 0.5, dur: 5, size: 300, add: 1 });
        MOV.push({ t: 0, dur: 5, update(m, dt) { e.slowT = 0; e.root = 0; e.silT = 0; e.hp = Math.min(e.max, e.hp + e.max * 0.02 * dt); } });
      } },
    { ph: 'Дух горна', col: '#ffb36a', cd: 30, first: 10, an: 'fg_spirit_cast', dur: 0.9, at: 0.6,
      cast(e) { e.guard = 5; mark({ img: F('b_forgegolem', 'fg_spirit'), on: e, at: e.ch.top * e.ch.U * e.sc * 1.1, dur: 5, size: 520, add: 0 });
        MOV.push({ t: 0, dur: 5, update(m, dt) { e.guard = Math.max(0, e.guard - dt); } }); } },
  ];
  // аура ржавчины: тусклое кольцо вокруг голема, удары героя рядом слабее (sk.js: rustAura)
  MOV.push({ t: 0, dur: 1e9, update() { for (const e of enemies) if (e.type === 'b_forgegolem' && e.dieT == null && !e.rust) { e.rust = 1; e.rustAura = 1; SK.ground({ img: SK.img(F('b_forgegolem', 'fg_rust')), x: e.x, y: e.y, R: 350, dur: 1e9, a: 0.45, follow: e, rot: 0.05 }); } } });
  // Самоцветный жук: Кристальный панцирь — следующий удар героя отражается в него самого
  DEF.gembeetle = [{ ph: 'Кристальный панцирь', col: '#9fe8ff', cd: 12, first: 2, an: 'gb_cast', dur: 2.0, at: 0.1, can: (e, d) => d < 500,
    cast(e) { e.reflect = 2.4; MOV.push({ t: 0, dur: 2.4, update: (m, dt) => { if (e.reflect > 0) e.reflect = Math.max(0, e.reflect - dt); } }); } }];
  // Гном-подрывник: Мина — видна, до 3 сразу; герой рядом — через 0,6 с взрыв
  const MINES = [];
  DEF.dwarfbomber = [{ ph: 'Мина', col: '#ffb36a', cd: 8, first: 2, an: 'db_cast', dur: 0.7, at: 0.6,
    cast(e) {
      if (MINES.filter(m => m.src === e && m.t < m.dur).length >= 3) return;
      const x = e.x + (P.x - e.x) * 0.5, y = e.y + (P.y - e.y) * 0.5;
      const mn = { src: e, x, y, t: 0, dur: 20, fuse: -1 };
      MINES.push(mn);
      MOV.push({ t: 0, dur: 20, update(m, dt) {
        mn.t = m.t;
        if (mn.fuse < 0 && Math.hypot(P.x - x, (P.y - y) / YK) < 90) mn.fuse = 0.6;
        if (mn.fuse > 0 && (mn.fuse -= dt) <= 0) { m.t = m.dur; mn.t = mn.dur; groundImg(F('dwarfbomber', 'db_boom'), x, y, 160, 0.8, { add: 1 }); if (Math.hypot(P.x - x, (P.y - y) / YK) < 160) hurtPlayer(60 * e.dm, 'fire'); snd('boss_slam', 0.6, 1.3); }
      }, draw(m, t) { const i = SK.img(F('dwarfbomber', 'db_mine')); if (!SK.ready(i)) return; const w = 70 * (mn.fuse > 0 ? 1 + 0.2 * Math.sin(t * 40) : 1); ctx.save(); ctx.translate(x, y); ctx.scale(1, YK); ctx.drawImage(i, -w / 2, -w / 2, w, w); ctx.restore(); } });
    } }];
  // ===================== Мир 6: Ледяные вершины =====================
  // Королева Вьюги: + Снежный скачок (телепорт, иней, безмолвие), Ледяной взрыв
  DEF.b_frostqueen = [
    { ph: 'Снежный скачок', col: '#bfe6ff', cd: 12, first: 2, an: 'fq_rift_cast', dur: 0.7, at: 0.6, can: (e, d) => d < 600 && d > 160,
      cast(e) { const [dx, dy] = dirTo2(P, e); e.x = P.x + dx * 130; e.y = P.y + dy * 130 * YK; collide(e);
        groundImg(F('b_frostqueen', 'fq_rift'), e.x, e.y, 200, 1.0, { add: 1 }); if (dist(P, e) < 220) { hurtPlayer(30 * e.dm, 'cold'); STATUS.add('silence', 2); } } },
    { ph: 'Ледяной взрыв', col: '#9fd8ff', cd: 9, first: 4.5, an: 'fq_blast_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
      cast(e) { proj(e, { orb: '170,220,255', sp: 650, left: 1000, w: 70, size: 60,
        onHit(p) { groundImg(F('b_frostqueen', 'fq_blast'), P.x, P.y, 220, 0.8, { add: 1 }); hurtPlayer(45 * e.dm, 'cold'); slowHero(0.5, 3); S.atkSlow = 3; S.atkSlowK = 0.5; } }); } },
  ];
  // Хрустальный барс: Ледяная стена — ком катится к герою, в конце стена полукругом на 4 с
  DEF.frostlynx = [{ ph: 'Ледяная стена', col: '#bfe6ff', cd: 12, first: 2, an: 'fl_cast', dur: 0.7, at: 0.5, can: (e, d) => d < 700,
    cast(e) { proj(e, { orb: '220,240,255', sp: 700, left: 900, w: 70, size: 55,
      onHit() { hurtPlayer(25 * e.dm, 'cold'); },
      onEnd(p) { iceWall(p.x, p.y, Math.atan2(p.dy, p.dx)); } }); } }];
  function iceWall(x, y, ang) {   // полукруг R 180 за точкой удара, непроходим
    const pts = []; for (let i = -3; i <= 3; i++) { const a = ang + i * 0.45; pts.push({ x: x + Math.cos(a) * 180, y: y + Math.sin(a) * 180 * YK, r: 55 }); }
    SK.WALLS.push({ img: F('frostlynx', 'fl_wall'), x: x + Math.cos(ang) * 120, y: y + Math.sin(ang) * 120 * YK, R: 180, ang: ang + Math.PI / 2, pts, t: 0, dur: 4 });
  }
  // Йети-камнемёт: Морозная глыба — оглушение, потом холод
  DEF.yeti = [{ ph: 'Морозная глыба', col: '#9fd8ff', cd: 10, first: 2, an: 'yt_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
    cast(e) { proj(e, { img: F('yeti', 'yt_ice'), sp: 520, left: 1000, w: 90, size: 130, spin: 5, arc: 1, onHit() { hurtPlayer(30 * e.dm, 'cold'); stun(1); dot(8 * e.dm, 3, 'cold'); slowHero(0.7, 4); } }); } }];

  // ===================== Мир 7: Руины Зеркального города =====================
  // Зеркальный Лорд: + Зеркальные двойники, Шаг сквозь зеркало, Танец рапиры (крит), Обмен отражений
  DEF.b_mirrorlord = [
    { ph: 'Шаг сквозь зеркало', col: '#e6e6ff', cd: 8, first: 2, can: (e, d) => d < 700 && d > 140,
      cast(e) { const fx = (m) => mark({ img: F('b_mirrorlord', 'ml_blink'), on: { x: m.x, y: m.y }, at: 80, dur: 0.5, size: 200, add: 1 }); fx(e);
        const f = P.face || { x: 1, y: 0 }; e.x = P.x - f.x * 90; e.y = P.y - f.y * 90 * YK; collide(e); fx(e); e.row = runRow(P.x - e.x, P.y - e.y);
        startAct(e, 'atk', 0.5, 0.45, () => { if (dist(P, e) < 150) hurtPlayer(rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm); }); } },
    { ph: 'Зеркальные двойники', col: '#bfe6ff', cd: 20, first: 4.5,
      cast(e) { for (const s of [-1, 1]) { const c = summon('ml_clone', e.x + s * 140, e.y); c.clone = true; c.hp = c.max = 1; c.dm = e.dm * 0.25; c.cloneT = 8; mark({ img: F('b_mirrorlord', 'ml_clones'), on: { x: c.x, y: c.y }, at: 80, dur: 0.5, size: 200, add: 1 }); } } },
    { ph: 'Обмен отражений', col: '#e6e6ff', cd: 40, first: 9, an: 'ml_sunder_cast', dur: 0.9, at: 0.6, can: () => P.hp / P.maxHp > 0.4,
      cast(e) { if (P.hp / P.maxHp <= e.hp / e.max) return;
        SK.beam(e, { img: F('b_mirrorlord', 'ml_sunder'), dur: 0.6, w: 70, from: e.ch.top * e.ch.U * e.sc * 0.6 });
        const ph = Math.max(0.25, e.hp / e.max), pe = Math.max(0.25, P.hp / P.maxHp); P.hp = Math.max(1, P.maxHp * ph); e.hp = e.max * pe; SK.say2('здоровье поменялось!', '#e6e6ff'); } },
  ];
  KIND.ml_clone = Object.assign({}, KIND.b_mirrorlord, { nm: 'Двойник', boss: 0, spells: [], xp: 0, gold: 0 }); MECH.ml_clone = () => false;
  // двойники: живут 8 с, полупрозрачные; бьются с одного удара (sk.js: e.clone)
  MOV.push({ t: 0, dur: 1e9, update(m, dt) { for (const e of enemies) if (e.clone && e.dieT == null && (e.cloneT -= dt) <= 0) { e.hp = 0; e.dieT = 0; e.anim = 'die'; } } });
  { const _de = drawEnemy; drawEnemy = function (e) { if (e.clone) { ctx.save(); ctx.globalAlpha = 0.55; ctx.filter = 'hue-rotate(160deg) brightness(1.2)'; _de(e); ctx.restore(); return; } _de(e); }; }
  // танец рапиры: 25 % крит ×2 с росчерком и крупной цифрой
  ON_HIT.b_mirrorlord = e => { if (Math.random() < 0.25) { const d = rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm; hurtPlayer(d); mark({ img: F('b_mirrorlord', 'ml_crit'), dur: 0.5, at: SK.HEAD() * 0.6, size: 160, add: 1 }); say(P.x + 30, P.y - SK.HEAD() * 1.5, 'КРИТ ' + Math.round(d * 2), '#ffe27a'); } };
  // Витражная плясунья: Витражный вихрь — 2,5 с кружится к герою, режет вокруг, её не остановить
  DEF.glassdancer = [{ ph: 'Витражный вихрь', col: '#bfe6ff', cd: 12, first: 2, can: (e, d) => d < 500,
    cast(e) { let t = 0, acc = 0; ground({ img: SK.img(F('glassdancer', 'gd_whirl')), x: e.x, y: e.y, R: 180, dur: 2.5, follow: e, rot: 6, add: 1 });
      e.skMove = dt => { t += dt; if (!e.act) e.act = { anim: 'gd_cast', dur: 2.6, at: 2, fn: () => {}, t: 0, hit: false }; e.act.t = (e.act.t + dt) % e.act.dur; e.slowT = 0; e.root = 0;
        const [dx, dy, d] = dirTo2(e, P); if (d > 60) { e.x += dx * e.speed * 1.2 * dt; e.y += dy * e.speed * 1.2 * YK * dt; collide(e); }
        if ((acc -= dt) <= 0) { acc = 0.4; if (d < 180) hurtPlayer(15 * e.dm); }
        if (t > 2.5 || e.dieT != null) { e.skMove = null; e.act = null; } }; } }];
  // Хранитель призмы: Луч призмы — канал до 2 с, потом широкая волна; удар по нему прерывает
  DEF.prismkeeper = [{ ph: 'Луч призмы', col: '#e6f4ff', cd: 11, first: 2, can: (e, d) => d < 900,
    cast(e) { let held = 0; const glow = { img: F('prismkeeper', 'pk_wave'), on: e, at: e.ch.top * e.ch.U * e.sc * 0.6, dur: 2.1, size: 60, add: 1 }; mark(glow);
      const fire = () => { glow.dur = 0; proj(e, { img: F('prismkeeper', 'pk_wave'), sp: 800, left: 900, w: 160, size: 240, pierce: true, onHit: () => hurtPlayer((20 + 25 * held) * e.dm) }); };
      MOV.push({ t: 0, dur: 2.1, update(m, dt) { held = m.t; glow.size = 60 + 70 * m.t; } });
      SK.channelFn(e, 'pk_cast', 2, { breakHits: 1, stop: fire }); } }];
  // ===================== Мир 8: Огненный вулкан (бес, пёс, культисты, призрак — как в мире 2) =====================
  // Владыка Пепла: + Пепельная мгла, Выжженная земля, Удар магмой (пассив), Рок
  DEF.b_ashlord = [
    { ph: 'Пепельная мгла', col: '#8a8a8a', cd: 9, first: 2, an: 'al_void_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 900,
      cast(e) { proj(e, { img: F('b_ashlord', 'al_void'), sp: 650, left: 1000, w: 90, size: 140, onHit() { hurtPlayer(40 * e.dm); stun(0.8); slowHero(0.5, 3); } }); } },
    { ph: 'Выжженная земля', col: '#ff6a2a', cd: 20, first: 5, an: 'cast2', dur: 0.8, at: 0.5,
      cast(e) { ground({ img: SK.img(F('b_ashlord', 'al_scorch')), x: e.x, y: e.y, R: 300, dur: 10, follow: e, a: 0.8, rot: 0.1 });
        zone({ x: e.x, y: e.y, R: 300, dur: 10, tick: 1, follow: e, onTick: () => hurtPlayer(10 * e.dm, 'fire'), update(z, dt) { e.hp = Math.min(e.max, e.hp + e.max * 0.01 * dt); } }); } },
    { ph: 'Рок', col: '#ff3a1a', cd: 25, first: 8, an: 'al_doom_cast', dur: 0.9, at: 0.6, can: (e, d) => d < 900,
      cast(e) { P.ss.rshield = 0; if (typeof P.shield === 'number') P.shield = 0; STATUS.add('silence', 6);
        mark({ img: F('b_ashlord', 'al_doom'), dur: 6, size: 130, every: 1, tick: () => hurtPlayer(15 * e.dm, 'fire') }); } },
  ];
  ON_HIT.b_ashlord = (e, n) => { if (n % 3) return; hurtPlayer(35 * e.dm, 'fire'); stun(1); mark({ img: F('b_ashlord', 'al_bash'), dur: 0.6, at: SK.HEAD() * 0.5, size: 150 }); };
  // Саламандра-воин: Обсидиановая клетка
  DEF.salamander = [{ ph: 'Обсидиановая клетка', col: '#ff8a3a', cd: 14, first: 2.5, an: 'sl_cage_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 700,
    cast(e) { ring({ img: F('salamander', 'sl_cage'), x: P.x, y: P.y, R: 150, dur: 3 }); hurtPlayer(20 * e.dm); } }];
  // Саламандра-вожак: Огненное дыхание и Удар щитом
  DEF.el_salamander = [
    { ph: 'Огненное дыхание', col: '#ff6a2a', cd: 10, first: 2, an: 'sl_breath_cast', dur: 0.8, at: 0.5, can: (e, d) => d < 420,
      cast(e) { const [dx, dy] = dirTo2(e, P); groundImg(F('salamander', 'sl_breath'), e.x + dx * 210, e.y + dy * 210 * YK, 210, 0.9, { ang: Math.atan2(dy, dx), add: 1 });
        if (dist(P, e) < 420) { hurtPlayer(40 * e.dm, 'fire'); dot(8 * e.dm, 3, 'fire'); S.weak = 5; S.weakK = 0.75; } } },
    { ph: 'Удар щитом', col: '#ffd28a', cd: 9, first: 4, an: 'sl_bash_cast', dur: 0.7, at: 0.55, can: (e, d) => d < 140,
      cast(e) { if (dist(P, e) > 160) return; hurtPlayer(35 * e.dm); stun(1.5); mark({ img: F('salamander', 'sl_bash'), dur: 0.6, at: SK.HEAD() * 0.5, size: 150 }); } },
  ];
  // ===================== Мир 9: Небесный храм =====================
  // Небесный Судья: + Страж из света, Сияние, Неприкосновенный (пассив), Ангел-хранитель
  const SJ = SKSHEETS.b_skyjudge && SKSHEETS.b_skyjudge.a;
  if (SJ && SJ.spirit_float) {
    creChar('sk_spirit', { run: SJ.spirit_float, idle: SJ.spirit_float, atk: SJ.spirit_attack, die: SJ.spirit_float }, 1.8);
    KIND.sk_spirit = { nm: 'Страж из света', ch: 'sk_spirit', rng: 1, hp: 400, rad: 26, speed: 60, dmg: [20, 20], cd: 1.5, want: 520, shot: 640, pcol: '255,240,180', xp: 10, gold: 6, col: '#fff3c4', sc: 1, pw: 1, life: 20 };
    MECH.sk_spirit = MECH.sk_golem;
    SK.SHOT_IMG.sk_spirit = F('b_skyjudge', 'sj_bolt');
  }
  DEF.b_skyjudge = [
    { ph: 'Страж из света', col: '#fff3c4', cd: 25, first: 2, an: 'sj_spirit_cast', dur: 0.9, at: 0.6, can: () => KIND.sk_spirit && !enemies.some(o => o.type === 'sk_spirit' && o.dieT == null),
      cast(e) { const g = summon('sk_spirit', e.x - 120, e.y - 40); g.dm = e.dm; } },
    { ph: 'Сияние', col: '#fff3c4', cd: 16, first: 5,
      cast(e) { e.untarget = 4; e.nextX2 = 1; mark({ img: F('b_skyjudge', 'sj_realm'), on: e, at: e.ch.top * e.ch.U * e.sc * 0.55, dur: 4, size: 320, add: 1, until: () => !(e.untarget > 0) });
        MOV.push({ t: 0, dur: 4, update(m, dt) { e.untarget = Math.max(0, e.untarget - dt); if (e.act && e.act.anim === 'atk') e.untarget = 0; } }); } },
    { ph: 'Ангел-хранитель', col: '#fff3c4', cd: 30, first: 9, an: 'sj_angel_cast', dur: 0.9, at: 0.6,
      cast(e) { e.guard = 5; mark({ img: F('b_skyjudge', 'sj_angel'), on: e, at: e.ch.top * e.ch.U * e.sc * 1.1, dur: 5, size: 520 });
        MOV.push({ t: 0, dur: 5, update(m, dt) { e.guard = Math.max(0, e.guard - dt); } }); } },
  ];
  ON_HIT.b_skyjudge = e => { if (e.nextX2) { e.nextX2 = 0; hurtPlayer(rnd(e.k.dmg[0], e.k.dmg[1]) * e.dm); } };
  // неприкосновенный: рядом с Судьёй герой бьёт на 40 % медленнее, на руках ленты
  MOV.push({ t: 0, dur: 1e9, update(m, dt) { const j = enemies.find(o => o.type === 'b_skyjudge' && o.dieT == null && SK.dist(o, P) < 500); if (j) { S.atkSlow = Math.max(S.atkSlow, 0.2); S.atkSlowK = 0.6; if (!S.ribbon || S.ribbon.t >= S.ribbon.dur) { S.ribbon = { img: F('b_skyjudge', 'sj_ribbons'), dur: 0.6, at: SK.HEAD() * 0.55, size: 120 }; mark(S.ribbon); } } } });
  // Мраморный грифон: Волна крыльев — тянет героя к грифону и замедляет
  DEF.marblegriffin = [{ ph: 'Волна крыльев', col: '#ffe9a8', cd: 10, first: 2, an: 'mg_cast', dur: 0.8, at: 0.55, can: (e, d) => d < 700,
    cast(e) { line(e, { img: F('marblegriffin', 'mg_wave'), len: 700, w: 150, run: 0.5, dur: 1.0, onHit() { hurtPlayer(30 * e.dm); const [dx, dy] = dirTo2(P, e); S.pull = { x: P.x + dx * 120, y: P.y + dy * 120 * YK, t: 0.35 }; slowHero(0.6, 1.5); } }); } }];
  // Небесная арфистка: Второе рождение — один раз встаёт снова в столбе света
  KIND.skyharpist.reborn = 1;
  SK._reb = e => {
    if (e.type !== 'skyharpist') return;
    e.skBusy = 2.2; e.untarget = 2.2; e.act = { anim: 'die', dur: 2.2, at: 2, fn: () => {}, t: 0, hit: false }; e.anim = 'die';
    mark({ img: F('skyharpist', 'sh_pillar'), on: e, at: 140, dur: 2.2, size: 300, add: 1 });
    const i = corpses.indexOf(e); if (i >= 0) corpses.splice(i, 1);
    MOV.push({ t: 0, dur: 2.1, update(m) { if (SK.dist(e, P) < 300) slowHero(0.7, 0.2); e.act && (e.act.t = 2.2 - m.t); e.untarget = 2.2 - m.t; if (m.t + 1 / 60 >= m.dur) { e.hp = e.max; e.untarget = 0; e.act = null; e.anim = 'idle'; tag(e, 'Второе рождение!', '#fff3c4'); } } });
  };
  // ===================== Мир 10: Бездна =====================
  // Архимаг Бездны: + Тёмное исцеление, Голем Бездны, Шаровая молния, Безмолвие Бездны
  if (golemChar('sk_golem_void', 'b_voidmage', 'golem_void_', 2.4)) KIND.sk_golem_void = { nm: 'Голем Бездны', ch: 'sk_golem_void', mel: 1, hp: 800, rad: 34, speed: 110, dmg: [30, 38], cd: 1.4, reach: 90, xp: 12, gold: 8, col: '#3a1a5a', sc: 1, pw: 1, life: 25 };
  DEF.b_voidmage = [
    { ph: 'Шаровая молния', col: '#c9a8ff', cd: 12, first: 2, an: 'vm_ball_cast', dur: 0.6, at: 0.6, can: (e, d) => d < 900,
      cast(e) { const [dx, dy, d] = dirTo2(e, P), tx = P.x + dx * 200, ty = P.y + dy * 200 * YK; let hit = false; e.untarget = 9; e.ball = 1;
        e.skMove = dt => { const [ux, uy, dd] = dirTo2(e, { x: tx, y: ty }), st = 1100 * dt; if (dd < st) { e.x = tx; e.y = ty; collide(e); e.skMove = null; e.untarget = 0; e.ball = 0; return; }
          e.x += ux * st; e.y += uy * st * YK; if (!hit && SK.dist(e, P) < 120) { hit = true; hurtPlayer(40 * e.dm); } }; } },
    { ph: 'Голем Бездны', col: '#c9a8ff', cd: 30, first: 4.5, an: 'vm_star_cast', dur: 0.9, at: 0.55, can: () => KIND.sk_golem_void && !enemies.some(o => o.type === 'sk_golem_void' && o.dieT == null),
      cast(e) { golemDrop(e, 'sk_golem_void', F('b_voidmage', 'vm_fall'), 50, 1.5); } },
    { ph: 'Тёмное исцеление', col: '#b07aff', cd: 18, first: 8,
      cast(e) { const z = { img: SK.img(F('b_voidmage', 'vm_heal')), x: e.x, y: e.y, R: 400, dur: 4.1, a: 0.8, rot: 0.3 }; ground(z);
        channel(e, 'vm_heal_cast', 4, { breakPct: 0.05, tick(dt) { for (const o of enemies) if (o.dieT == null && SK.dist(o, e) < 400) o.hp = Math.min(o.max, o.hp + o.max * 0.03 * dt); }, stop() { z.dur = z.t + 0.4; } }); } },
    { ph: 'Безмолвие Бездны', col: '#b07aff', cd: 30, first: 12, an: 'vm_silence_cast', dur: 0.9, at: 0.6,
      cast(e) { groundImg(F('b_voidmage', 'vm_silence'), e.x, e.y, 1400, 1.2, { grow: 0.6 }); STATUS.add('silence', 4); } },
  ];
  // шаровая молния: вместо листа — шар vm_ball
  { const _de2 = drawEnemy; drawEnemy = function (e) { if (e.ball) { const i = SK.img(F('b_voidmage', 'vm_ball')); if (SK.ready(i)) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.translate(e.x, e.y - 90); ctx.rotate(performance.now() / 120); ctx.drawImage(i, -90, -90, 180, 180); ctx.restore(); } return; } _de2(e); }; }
  SK.channelFn = channel;
})();

// снаряды злодеев: своя картинка и эффект попадания (Королева Змей и другие)
{
  const _ds = drawShot;
  drawShot = function (s) {
    const src = s.src && SK.SHOT_IMG && SK.SHOT_IMG[s.src.type];
    if (s.own === 'e' && src) { const i = SK.img(src); if (SK.ready(i)) { ctx.save(); ctx.translate(s.x, s.y - s.h); ctx.rotate(Math.atan2(s.dy * YK, s.dx)); ctx.drawImage(i, -55, -55, 110, 110); ctx.restore(); return; } }
    _ds(s);
  };
  const _ue = updateEnemy;
  updateEnemy = function (e, dt) {
    const n = shots.length; _ue(e, dt);
    const h = SK.SHOT_HIT && SK.SHOT_HIT[e.type];
    if (h) for (let i = n; i < shots.length; i++) { const s = shots[i], prev = s.onHitP, add = h(e); s.onHitP = function (x) { if (prev) prev(x); add(x); }; }
  };
}
// элита и перекрашенные копии ходят на листах базового злодея и колдуют его умения (если своих нет)
for (const id in KIND) { const b = KIND[id].base; if (b && !SK.DEF[id] && SK.DEF[b]) SK.DEF[id] = SK.DEF[b]; }
