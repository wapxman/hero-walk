// Новые умения 48 злодеев (пакет Клауди 20.11, SKILLS_FOR_KLOD.md; листы — chars/skills.js, эффекты — fx/sk/).
// Общие правила: умения ДОБАВЛЯЮТСЯ к прежним; первое — через 1,5–3 с после выхода, дальше по откату по очереди;
// на 66 % и 33 % здоровья — сразу следующее готовое; безмолвие и оковы злодея только откладывают каст.
// Здесь: движок (планировщик, снаряды, лучи, полосы, метки, кольца, существа, превращения, статусы героя) и умения.
'use strict';
const SK = (() => {
  const T = () => performance.now() / 1000;
  const F = (sp, key) => SKSHEETS[sp] && SKSHEETS[sp].f[key] ? SKSHEETS[sp].f[key].img : null;
  const A = (sp, key) => SKSHEETS[sp] && SKSHEETS[sp].a[key];
  const IMG = {};
  const img = src => { if (!src) return null; if (!IMG[src]) { const i = new Image(); i.src = src + V; IMG[src] = i; } return IMG[src]; };
  const ready = i => i && i.complete && i.naturalWidth > 0;
  const dirTo2 = (a, b) => { const dx = b.x - a.x, dy = (b.y - a.y) / YK, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m, m]; };
  const dist = (a, b) => Math.hypot(a.x - b.x, (a.y - b.y) / YK);
  const HEAD = () => CH * HS();

  // ---------- листы кастов к злодеям (и к перекрашенным копиям, и к элите на листах базового) ----------
  function loadAnim(c, a) {
    a.img = new Image();
    a.img.onload = () => {
      if (c.tint) { const im = a.img, cv = document.createElement('canvas'); cv.width = im.naturalWidth; cv.height = im.naturalHeight; const g = cv.getContext('2d'); g.filter = c.tint; g.drawImage(im, 0, 0); a.img = cv; }
      a.ok = true; c.ok = Object.values(c.mul).every(x => x.ok);
    };
    a.img.src = 'chars/at_' + a.at + '.webp' + V;
  }
  function attach() {
    for (const sp in SKSHEETS) {
      const anims = SKSHEETS[sp].a, base = sp === 'thornroot' ? 'th_' : 'vl_' + sp + '_';
      for (const id in CHARS) {
        const c = CHARS[id]; if (!c.mul || !c.mul.run || c.mul.run.at.indexOf(base) !== 0) continue;
        for (const key in anims) {
          const a = anims[key]; if (a.size) continue;   // существа — отдельно
          if (c.mul[key]) continue;
          c.mul[key] = { at: a.at, n: a.n, ms: a.ms, rows: a.rows, foot: a.foot };
          if (c.loading) loadAnim(c, c.mul[key]);
        }
      }
    }
  }
  // существа и превращения: свой лист, рисуется кадром из атласа
  const CRE = {};
  function cre(sp, key, k) {
    const id = sp + ':' + key; if (CRE[id]) return CRE[id];
    const a = A(sp, key); if (!a) return null;
    const o = CRE[id] = { a, ok: false, k: k || VK * ((a.size || 150) / ATLAS[a.at].cell) / 0.6 };
    const i = new Image(); i.onload = () => { o.ok = true; }; i.src = 'chars/at_' + a.at + '.webp' + V; o.img = i;
    return o;
  }
  function drawCre(o, x, y, t, row, opt) {
    if (!o || !o.ok) return;
    opt = opt || {};
    const a = o.a, n = a.n, f = opt.f != null ? opt.f : Math.floor(t * 1000 / a.ms) % n, cell = ATLAS[a.at].cell, size = cell * o.k * (opt.s || 1);
    ctx.save(); ctx.translate(x, y); if (opt.a != null) ctx.globalAlpha = opt.a; if (opt.flip) ctx.scale(-1, 1);
    if (opt.rot != null) { ctx.scale(1, YK); ctx.rotate(opt.rot); drawCell(ctx, o.img, a.at, f, 0, -size / 2, -size / 2, size); }
    else drawCell(ctx, o.img, a.at, f, a.rows === 1 ? 0 : row || 0, -size / 2, -a.foot * o.k * (opt.s || 1), size);
    ctx.restore();
  }

  // ---------- эффекты в мире ----------
  const PR = [], BEAMS = [], LINES = [], MARKS = [], RINGS = [], WALLS = [], MOV = [], GROUND = [], ZONES = [];
  // снаряд: картинка по полёту (view side) или крутится (spin); w — ширина попадания; pierce — насквозь
  function proj(e, o) {
    const [dx, dy] = dirTo2(e, P); const sx = e.x + dx * 50, sy = e.y + dy * 50 * YK;
    PR.push(Object.assign({ x: sx, y: sy, dx, dy, sp: 650, left: 900, w: 90, size: 120, t: 0, h: 60, src: e, hit: new Set() }, o));
  }
  function beam(e, o) { BEAMS.push(Object.assign({ e, t: 0, dur: 0.8, w: 70 }, o)); }
  function line(e, o) { const [dx, dy] = dirTo2(e, P); LINES.push(Object.assign({ x: e.x, y: e.y, dx, dy, len: 700, w: 110, t: 0, run: 0.5, dur: 1.2, hit: false, src: e }, o)); }
  const fill = (o, D) => { for (const k in D) if (o[k] === undefined) o[k] = D[k]; return o; };   // сам объект уходит в список — вызывающий может менять его дальше (dur, size)
  function mark(o) { MARKS.push(fill(o, { t: 0, dur: 5, s: 1 })); return o; }   // картинка на герое (front)
  function ring(o) { RINGS.push(fill(o, { t: 0, dur: 3 })); return o; }        // кольцо-стена вокруг героя: не выйти
  function ground(o) { GROUND.push(fill(o, { t: 0, dur: 1, a: 0.95, rot: 0 })); return o; }   // картинка на земле
  function zone(o) { ZONES.push(fill(o, { t: 0, dur: 3, tick: 0.5, acc: 0 })); return o; }   // зона урона/эффекта у героя
  const groundImg = (src, x, y, R, dur, extra) => ground(Object.assign({ img: img(src), x, y, R, dur }, extra || {}));

  // ---------- состояния героя (в дополнение к relics.js) ----------
  // bind — опутан (не ходит, не бьёт), pin — прикован (не ходит), hex — превращён (не бьёт, не колдует), cage/walls — стены
  P.sk = { bind: 0, pin: 0, hex: 0, hexK: 1, hexCre: null, atkSlow: 0, atkSlowK: 1, weak: 0, weakK: 1, called: 0, calledBy: null,
    pull: null, gaze: 0, poison: { n: 0, t: 0 }, hunger: 0, wounds: 0, rot: 0 };
  const S = P.sk;
  const _sLocked = STATUS.locked, _sMute = STATUS.mute;
  STATUS.locked = () => _sLocked() || S.bind > 0 || S.pin > 0 || S.called > 0;          // не ходит сам
  STATUS.noAtk = () => _sLocked() || S.bind > 0 || S.hex > 0;
  STATUS.mute = () => _sMute() || S.hex > 0;
  {
    const _sh = shoot;   // relics.js обернул shoot через STATUS.locked — теперь удары: noAtk
    shoot = function () { if (STATUS.noAtk()) return; const was = STATUS.locked; STATUS.locked = _sLocked; try { _sh(); } finally { STATUS.locked = was; } };
  }
  const say2 = (t, c) => say(P.x, P.y - HEAD() * 1.25, t, c);
  function bind(t) { S.bind = Math.max(S.bind, t); say2('опутан!', '#b9e37a'); }
  function pin(t) { S.pin = Math.max(S.pin, t); say2('прикован!', '#9a8aff'); }
  function stun(t) { STATUS.add('stun', t); }
  function hex(t, cr, k) { S.hex = Math.max(S.hex, t); S.hexCre = cr; S.hexK = k; }
  function poisonStack(dm) { S.poison.n = Math.min(5, S.poison.n + 1); S.poison.t = 4; S.poison.dm = dm; }

  // ---------- планировщик умений ----------
  // DEF[тип] = [{ cd, first?, can(e, d) → можно ли сейчас, cast(e, d) → true если начал, an — лист каста, dur, at }]
  const DEF = {};
  let rankAt = -99; const rankOf = new Map();
  function schedule(e, dt, d) {
    const L = DEF[e.type]; if (!L) return false;
    const soft = SOFT1(), keep = soft ? SOFT1_SK[e.type] : null, tn = tune1(e);   // мир 1 мягче: рядовые без умений, у мини-боссов и босса — по одному простому
    if (soft && softRank(e)) return false;
    if (!e.sk) {
      e.sk = L.map((s, i) => ({ cd: (s.first != null ? s.first : 1.5 + Math.random() * 1.5) + i * 0.6 }));
      e.skHp = 1;
    }
    for (const s of e.sk) s.cd -= dt;
    // на 66 % и 33 % здоровья — сразу следующее умение
    const f = e.hp / e.max;
    if ((e.skHp > 0.66 && f <= 0.66) || (e.skHp > 0.33 && f <= 0.33)) { let best = null; for (const s of e.sk) if (!best || s.cd < best.cd) best = s; if (best) best.cd = Math.min(best.cd, 0); }
    e.skHp = f;
    if (e.act || e.leap || e.kb || e.silT > 0 || e.root > 0 || P.dead > 0 || e.skBusy > 0) return false;
    for (let i = 0; i < L.length; i++) {
      const s = L[i], st = e.sk[i];
      if (st.cd > 0 || s.passive) continue;
      if (keep && !keep.includes(s.ph)) continue;
      if (tn && tn.off && tn.off.includes(s.ph)) continue;
      if (s.can && !s.can(e, d)) continue;
      // рядовые не колдуют все разом (v91): между умениями рядовых — пауза, одно и то же умение — не чаще раза в несколько секунд
      // (BAL.RANK_SK). Иначе толпа из десятка одинаковых врагов держала героя в оглушении и жгла без шансов увернуться.
      if (!e.boss && !e.mini && !e.elite) {
        const now = P.heroT || 0, G = BAL.RANK_SK;
        if (now - rankAt < G.gap || now - (rankOf.get(L) || -99) < G.same) continue;
        rankAt = now; rankOf.set(L, now);
      }
      st.cd = ((tn && tn.cd && tn.cd[s.ph]) || s.cd) * (e.phase >= 3 ? 0.75 : 1);
      SK.lastCast = { e, at: performance.now() / 1000 };   // кто последним начал умение (Зеркальная сфера возвращает состояние ему)
      if (s.ph) tag(e, s.ph + '!', s.col || '#ffd28a');
      if (s.pre) s.pre(e, d);   // предупреждение в момент начала замаха (v101)
      if (s.an) startAct(e, s.an, s.dur || 0.9, s.at || 0.5, () => s.cast(e, d));
      else s.cast(e, d);
      return true;
    }
    return false;
  }
  const _ue = updateEnemy;
  updateEnemy = function (e, dt) {
    if (e.skBusy > 0) e.skBusy -= dt;
    if (e.untarget > 0 && !e.ball) e.untarget -= dt;
    if (e.skMove) { e.skMove(dt); return; }   // особые движения (полёт беса, скольжение жаба, шаровая молния)
    const hp0 = P.hp, d = gdist(P, e);
    if (P.dead <= 0 && schedule(e, dt, d)) return;
    const wasAtk = e.act && (e.act.anim === 'atk' || e.act.anim === 'tr_logattack') && !e.act.hit;
    _ue(e, dt);
    // пассивы «каждый 3-й удар»: срабатывают на попадании обычного удара
    if (P.hp < hp0 && e.mel && wasAtk) { e.hits = (e.hits || 0) + 1; if (ON_HIT[e.type] && !softRank(e) && !(SOFT1() && SOFT1_SK[e.type])) ON_HIT[e.type](e, e.hits); }
  };
  const ON_HIT = {};
  // помощники
  const near = (R) => (e, d) => d < R;
  const far = (R) => (e, d) => d < R;
  function tag(e, t, c) { say(e.x, e.y - (e.ch.ok ? e.ch.top * e.ch.U * e.sc : 80) - 26, t, c || '#ffd28a'); }

  // ---------- тик эффектов ----------
  function tick(dt) {
    const now = T();
    if (P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on)) { PR.length = BEAMS.length = LINES.length = MARKS.length = RINGS.length = WALLS.length = ZONES.length = GROUND.length = 0; keepA(MOV, m => m.dur >= 1e8);   // постоянные пассивы (dur 1e9) переживают смерть героя
      for (const e of enemies) e.rust = 0; for (const k of ['bind', 'pin', 'hex', 'atkSlow', 'weak', 'called', 'gaze', 'hunger', 'wounds']) S[k] = 0; S.poison.n = 0; S.pull = null; return; }
    for (const k of ['bind', 'pin', 'hex', 'atkSlow', 'weak', 'called', 'hunger', 'wounds']) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);
    if (S.hex > 0) slowHero(S.hexK, 0.2);
    if (S.atkSlow > 0 && P.atkCd > 0) P.atkCd += dt * (1 - S.atkSlowK);   // атаки медленнее
    // яд змей: стаки урона и замедления
    if (S.poison.n > 0) { S.poison.t -= dt; if ((S.poison.acc = (S.poison.acc || 0) - dt) <= 0) { S.poison.acc = 1; hurtPlayer(4 * S.poison.dm * S.poison.n, 'poison'); } slowHero(1 - 0.05 * S.poison.n, 0.2); if (S.poison.t <= 0) S.poison.n = 0; }
    // жажда битвы: урон каждую секунду, медленнее, пока герой кого-нибудь не убьёт
    if (S.hunger > 0) { if (kills > S.hungerK) S.hunger = 0; else { slowHero(0.8, 0.2); if ((S.hungerAcc = (S.hungerAcc || 0) - dt) <= 0) { S.hungerAcc = 1; hurtPlayer(12 * S.hungerDm); } } }
    // раны упыря: медленнее (слабеет)
    if (S.wounds > 0) slowHero(1 - 0.3 * S.wounds / 5, 0.2);
    // вызов на поединок: герой сам идёт к рыцарю и бьёт его
    if (S.called > 0 && S.calledBy && S.calledBy.dieT == null) { const e = S.calledBy, [dx, dy, m] = dirTo2(P, e); if (m > e.rad + 70) { P.x += dx * 170 * dt; P.y += dy * 170 * YK * dt; collide(P); P.face = { x: dx, y: dy }; P.moving = true; } else if (P.atkCd <= 0) shoot(); }
    // подтягивание (серп, язык, крылья)
    if (S.pull) { const p = S.pull; p.t -= dt; const k = Math.min(1, dt / Math.max(0.05, p.t + dt)); P.x += (p.x - P.x) * k; P.y += (p.y - P.y) * k; collide(P); if (p.t <= 0) S.pull = null; }
    // снаряды
    for (const p of PR) {
      p.t += dt;
      if (p.homing && P.dead <= 0) { const [hx, hy] = dirTo2(p, P), a0 = Math.atan2(p.dy, p.dx), a1 = Math.atan2(hy, hx); let da = a1 - a0; while (da > Math.PI) da -= 6.283; while (da < -Math.PI) da += 6.283; const a = a0 + Math.max(-p.homing * dt, Math.min(p.homing * dt, da)); p.dx = Math.cos(a); p.dy = Math.sin(a); }
      const st = p.sp * dt; p.x += p.dx * st; p.y += p.dy * st * YK; p.left -= st;
      if (p.trail) p.trail(p, dt);
      if (!p.hit.has(P) && P.dead <= 0 && dist(p, P) < p.w / 2 + 26) { p.hit.add(P); if (p.onHit) p.onHit(p); if (!p.pierce) p.left = 0; }
      if (p.onEnemies) for (const e of enemies) if (e.dieT == null && e !== p.src && !p.hit.has(e) && dist(p, e) < p.w / 2 + e.rad) { p.hit.add(e); p.onEnemies(p, e); }
    }
    for (let i = PR.length - 1; i >= 0; i--) if (PR[i].left <= 0) { const p = PR[i]; PR.splice(i, 1); if (p.onEnd) p.onEnd(p); }
    // лучи
    for (const b of BEAMS) { b.t += dt; if (b.tick) b.tick(b, dt); if (b.e.dieT != null) b.t = b.dur; }
    keepA(BEAMS, b => b.t < b.dur);
    // полосы по земле (бегут от злодея, держатся dur)
    for (const l of LINES) {
      l.t += dt;
      const run = Math.min(1, l.t / l.run), cur = l.len * run;
      // проекция героя на полосу
      const px = P.x - l.x, py = (P.y - l.y) / YK, along = px * l.dx + py * l.dy, across = Math.abs(-px * l.dy + py * l.dx);
      const inside = along > 0 && along < cur && across < l.w / 2 + 20;
      if (inside && !l.hit && l.onHit) { l.hit = true; l.onHit(l); }
      if (inside && l.onStay) l.onStay(l, dt);
      if (l.wall && l.t > l.run) { // стена: герой не пересекает гребень
        if (Math.abs(-px * l.dy + py * l.dx) < l.w / 2 + 24 && along > 0 && along < l.len) { const sgn = (-px * l.dy + py * l.dx) >= 0 ? 1 : -1, k = (l.w / 2 + 24) * sgn; const ox = l.x + (along * l.dx) + (-l.dy) * k, oy = l.y + (along * l.dy + l.dx * k) * YK; P.x = ox; P.y = oy; }
      }
    }
    keepA(LINES, l => l.t < l.dur);
    // метки на герое
    for (const m of MARKS) { m.t += dt; if (m.tick) { m.acc = (m.acc || 0) - dt; if (m.acc <= 0) { m.acc = m.every || 1; m.tick(m); } } if (m.until && m.until()) m.t = m.dur; }
    keepA(MARKS, m => m.t < m.dur);
    // кольца-клетки: герой не выходит за R
    for (const r of RINGS) { r.t += dt; if (r.t > (r.delay || 0)) { const d0 = dist(P, r); if (d0 > r.R - 30) { const [dx, dy] = dirTo2(r, P); P.x = r.x + dx * (r.R - 30); P.y = r.y + dy * (r.R - 30) * YK; } } }
    keepA(RINGS, r => r.t < r.dur);
    // стены-круги (ледяная стена): выталкивают героя
    for (const w of WALLS) { w.t += dt; for (const c of w.pts) { const d0 = dist(P, c); if (d0 < c.r) { const [dx, dy] = dirTo2(c, P); P.x = c.x + dx * c.r; P.y = c.y + dy * c.r * YK; } } }
    keepA(WALLS, w => w.t < w.dur);
    // зоны у героя
    for (const z of ZONES) { z.t += dt; if (z.follow) { z.x = z.follow.x; z.y = z.follow.y; } const inside = dist(P, z) < z.R; z.acc -= dt; if (z.acc <= 0) { z.acc = z.tick; if (inside && z.onTick) z.onTick(z); } if (inside && z.onStay) z.onStay(z, dt); if (z.update) z.update(z, dt); }
    keepA(ZONES, z => z.t < z.dur);
    for (const g of GROUND) { g.t += dt; if (g.follow) { g.x = g.follow.x; g.y = g.follow.y; if (g.follow.hp <= 0) g.t = Math.max(g.t, g.dur - 0.01); } }   // хозяин погиб — круг под ним гаснет
    keepA(GROUND, g => g.t < g.dur);
    for (const m of MOV) { m.t += dt; m.update(m, dt); }
    keepA(MOV, m => m.t < m.dur);
  }
  function keepA(a, ok) { let j = 0; for (let i = 0; i < a.length; i++) if (ok(a[i])) a[j++] = a[i]; a.length = j; }

  // ---------- рисование ----------
  function drawImg(src, x, y, w, h, rot, a, add) {
    const i = img(src); if (!ready(i)) return;
    ctx.save(); ctx.globalAlpha = a == null ? 1 : a; if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.drawImage(i, -w / 2, -h / 2, w, h); ctx.restore();
  }
  function drawGround(t) {
    for (const g of GROUND) {
      const i = g.img; if (!ready(i)) continue;
      const a = Math.min(1, g.t / 0.2, (g.dur - g.t) / 0.4) * g.a, w = g.R * 2.2 * (g.grow ? Math.min(1, 0.3 + g.t / g.grow) : 1);
      ctx.save(); ctx.globalAlpha = Math.max(0, a); if (g.add) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(g.x, g.y); ctx.scale(1, YK); ctx.rotate(g.rot * g.t + (g.ang || 0)); ctx.drawImage(i, -w / 2, -w / 2, w, w); ctx.restore();
    }
    for (const l of LINES) {
      const i = img(l.img); if (!ready(i)) continue;
      const run = Math.min(1, l.t / l.run), len = l.len * run, a = Math.min(1, (l.dur - l.t) / 0.4);
      ctx.save(); ctx.globalAlpha = Math.max(0, a); ctx.translate(l.x, l.y); ctx.scale(1, YK); ctx.rotate(Math.atan2(l.dy, l.dx));
      const vh = l.vis || l.w * 1.8;   // vis — высота картинки на земле, если полоса занимает в ней узкую середину (листы v34)
      ctx.drawImage(i, 0, 0, i.naturalWidth * run, i.naturalHeight, 0, -vh / 2, len, vh); ctx.restore();
    }
    for (const r of RINGS) { if (r.t < (r.delay || 0)) continue; const i = img(r.img); if (!ready(i)) continue; const w = r.R * 2.4, a = Math.min(1, (r.t - (r.delay || 0)) / 0.25, (r.dur - r.t) / 0.4); ctx.save(); ctx.globalAlpha = a; ctx.translate(r.x, r.y); ctx.scale(1, YK); ctx.drawImage(i, -w / 2, -w / 2, w, w); ctx.restore(); }
    for (const w of WALLS) { const i = img(w.img); if (!ready(i)) continue; const a = Math.min(1, w.t / 0.25, (w.dur - w.t) / 0.4); ctx.save(); ctx.globalAlpha = a; ctx.translate(w.x, w.y); ctx.scale(1, YK); ctx.rotate(w.ang); const s = w.R * 2.4; ctx.drawImage(i, -s / 2, -s / 2, s, s); ctx.restore(); }
  }
  function drawOver(t) {
    for (const p of PR) {
      const y = p.y - p.h, a = Math.min(1, p.t / 0.08);
      if (p.tongue && p.tongue.dieT == null) { ctx.save(); ctx.strokeStyle = 'rgba(230,120,150,0.95)'; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.tongue.x, p.tongue.y - 110); ctx.lineTo(p.x, y); ctx.stroke(); ctx.restore(); }
      if (p.rope && p.rope.dieT == null) { ctx.save(); ctx.strokeStyle = 'rgba(120,90,50,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.rope.x, p.rope.y - 90); ctx.lineTo(p.x, y); ctx.stroke(); ctx.restore(); }
      if (p.cre) { drawCre(p.cre, p.x, p.y, t, 0, { rot: Math.atan2(p.dy, p.dx), a }); continue; }
      const lift = p.arc ? Math.sin(Math.min(1, p.t * p.sp / 600) * Math.PI) * 120 : 0;
      if (p.orb) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(p.x, y - lift, 0, p.x, y - lift, p.size); g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(' + p.orb + ',0.85)'); g.addColorStop(1, 'rgba(' + p.orb + ',0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, y - lift, p.size, 0, 6.283); ctx.fill(); ctx.restore(); continue; }
      if (lift) { drawImg(p.img, p.x, y - lift, p.size, p.size, p.spin ? t * p.spin : 0, a, p.add); continue; }
      drawImg(p.img, p.x, y, p.size, p.size, p.spin ? t * p.spin : Math.atan2(p.dy * YK, p.dx), a, p.add);
    }
    for (const b of BEAMS) {
      const i = img(b.img); if (!ready(i)) continue;
      const sx = b.e.x, sy = b.e.y - (b.from || 120), tx = P.x, ty = P.y - HEAD() * 0.5, len = Math.hypot(tx - sx, ty - sy), a = Math.min(1, b.t / 0.1, (b.dur - b.t) / 0.15);
      ctx.save(); ctx.globalAlpha = a; if (b.add) ctx.globalCompositeOperation = 'lighter';
      ctx.translate(sx, sy); ctx.rotate(Math.atan2(ty - sy, tx - sx)); const w = b.w * (1 + 0.08 * Math.sin(t * 30)); ctx.drawImage(i, 0, -w / 2, len, w); ctx.restore();
    }
    for (const m of MARKS) {
      const a = Math.min(1, m.t / 0.15, (m.dur - m.t) / 0.3), x = m.on ? m.on.x : P.x, y = (m.on ? m.on.y : P.y) - (m.at != null ? m.at : HEAD() * 1.15), s = (m.size || 110) * m.s * (1 + 0.05 * Math.sin(t * 6));
      drawImg(m.img, x, y, s, s, m.spin ? t * m.spin : 0, a, m.add);
    }
    for (const m of MOV) if (m.draw) m.draw(m, t);
  }

  // ---------- превращение героя (крыса, лягушка) и опутывание поверх героя ----------
  const _dp = drawPlayer;
  drawPlayer = function () {
    if (S.hex > 0 && S.hexCre && S.hexCre.ok && P.dead <= 0) {
      const row = typeof runRow === 'function' ? runRow(P.face.x, P.face.y) : 0;
      drawCre(S.hexCre, P.x, P.y, P.moving ? T() : 0, row, { f: P.moving ? null : 0 });
      return;
    }
    _dp();
  };

  // ---------- урон по злодеям: щиты, защита от атак, ауры ----------
  const isSpell = (e, col) => (typeof heroSpell !== 'undefined' && heroSpell > 0) || P.ult > 0 || col === '#9fe0ff' || !!(e && typeof zones !== 'undefined' && zones.some(z => z.type === 'hail' && gdist(z, e) < z.R + e.rad));   // град и урон оков — тоже умения
  const _he = hurtEnemy;
  hurtEnemy = function (e, dmg, col) {
    if (e.hp <= 0) return;
    if (e.untarget > 0) return;                                                   // Сияние Судьи
    if (!isSpell(e, col) && !P.trueShot) {
      if (e.atkImm > 0 || enemies.some(o => o.guard > 0 && o.dieT == null && dist(o, e) < 450)) { if (!e.immSaid || T() - e.immSaid > 0.7) { tag(e, 'не ранить', '#fff3c4'); e.immSaid = T(); } return; }
      if (enemies.some(o => o.rustAura && o.dieT == null && dist(o, e) < 350)) dmg *= 0.75;   // аура ржавчины голема
    }
    if (e.reflect > 0 && !P.trueShot) { e.reflect = 0; ground({ img: img(F('gembeetle', 'gb_flash')), x: e.x, y: e.y, R: 90, dur: 0.5, add: 1 }); hurtPlayer(30 * e.dm); stun(1); tag(e, 'отражено!', '#9fe8ff'); return; }
    if (e.clone) { e.hp = 0; e.dieT = 0; e.anim = 'die'; e.act = null; groundImg(F('b_mirrorlord', 'ml_clones'), e.x, e.y, 80, 0.5); return; }
    if (e.dr > 0 && !P.trueShot) dmg *= 0.6;                                                      // вызов на поединок: рыцарь в золотой броне
    if (S.weak > 0) dmg *= S.weakK;
    if (e.skChannel) { e.skChannel.taken = (e.skChannel.taken || 0) + dmg * (P.dmgMul || 1); e.skChannel.hits = (e.skChannel.hits || 0) + 1; }
    const was = e.hp, rb = e.k.reborn && !e.reborn, BIG = 1e12;
    if (rb) e.hp += BIG;                                                           // смерть не засчитывается — награды нет, пока не встанет снова
    _he(e, dmg, col);
    if (rb) { e.hp -= BIG; if (e.hp <= 0) { e.reborn = true; e.hp = 1; e.dieT = null; e.anim = 'idle'; rebirth(e); } }
  };

  // отложенное действие по игровому времени (v91; раньше умения ставили setTimeout — удар прилетал и на паузе): на паузе ждёт,
  // после гибели героя и в Междумирье не срабатывает (MOV очищается)
  const later = (fn, ms) => { MOV.push({ t: 0, dur: ms / 1000, update(m) { if (!m.done && m.t >= m.dur) { m.done = 1; fn(); } } }); };
  return { later, F, A, img, ready, dirTo2, dist, attach, cre, drawCre, proj, beam, line, mark, ring, ground, groundImg, zone, WALLS, MOV, PR, ZONES, MARKS, LINES, BEAMS, RINGS, GROUND,
    S, bind, pin, stun, hex, poisonStack, DEF, ON_HIT, schedule, tick, drawGround, drawOver, tag, HEAD, say2, near, isSpell };
  function rebirth(e) { SK._reb && SK._reb(e); }
})();
SK.attach();
{
  const _cu = combatUpdate, _cg = combatGround, _co = combatOver;
  combatUpdate = function (dt) { _cu(dt); SK.tick(dt); };
  combatGround = function (t) { _cg(t); SK.drawGround(t); };
  combatOver = function (t) { _co(t); SK.drawOver(t); };
}
// «нельзя выбрать целью»: Сияние Судьи, шаровая молния Архимага, Второе рождение арфистки
{ const _ne = nearestEnemy; nearestEnemy = function (range) { const saved = enemies.filter(e => e.untarget > 0); if (!saved.length) return _ne(range); const keep = enemies.slice(); enemies.length = 0; for (const e of keep) if (!(e.untarget > 0)) enemies.push(e); try { return _ne(range); } finally { enemies.length = 0; for (const e of keep) enemies.push(e); } }; }
