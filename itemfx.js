// itemfx.js — эффекты предметов (v87, ITEMS_FOR_KLOD.md, разд. B): проки, ауры, активки. Только одиночная игра.
// Перезарядки — в общем RCD (relics.js): кольцо и вспышку ячейки рисуют relicRings / relicFlash.
'use strict';
const ITEMFX = (() => {
  // ward — короткая полная защита после Сферы оберега и Зеркальной сферы, rite — Кровавый обряд, linkenF/lotusF — вспышка значка сработавшего предмета, src — кто наложил жёсткое состояние
  const T = { bkb: 0, aeon: 0, manta: 0, storm: 0, stormT: 0, unholy: 0, calm: 0, bashAt: 0, dash: null, ward: 0, rite: 0, linkenF: 0, lotusF: 0, src: null };
  const ZAPS = [], GLOWS = [];   // молнии { pts, t, dur } и вспышки { x, y, col, t, dur } — рисует combatOver
  const now = () => performance.now() / 1000;
  const off = () => !!(window.NETC && NETC.on) || P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on);
  const has = id => SHOP.bag.includes(id);
  // сильнейший эффект вида k в сумке (по шансу ch)
  const pas = k => { let r = null; for (const id of SHOP.bag) { const p = ALL[id] && ALL[id].pas && ALL[id].pas[k]; if (p != null && (r == null || (p.ch || 0) > (r.ch || 0))) r = p; } return r; };
  const live = e => e.hp > 0 && e.dieT == null && !(e.untarget > 0);
  const rank = e => (e.boss || e.k.boss) ? 3 : e.mini ? 2 : e.elite ? 1 : 0;   // босс > мини-босс > элита > рядовой
  const inR = (R, f) => enemies.filter(e => live(e) && gdist(P, e) < R + e.rad && (!f || f(e)));
  const top = (R, min) => inR(R, e => rank(e) >= min).sort((a, b) => rank(b) - rank(a) || gdist(P, a) - gdist(P, b))[0];
  const tagE = (e, t, c) => say(e.x, e.y - (e.ch && e.ch.ok ? e.ch.top * e.ch.U * e.sc : 80) - 20, t, c);
  const sayP = (t, c) => say(P.x, P.y - CH * HS() * 1.45, t, c);
  // картинки вспышек (v100, рисовал ChatGPT): щит Линки и отражение Лотоса
  const FXI = {}; for (const k of ['linken_block', 'lotus_reflect']) { const im = new Image(); FXI[k] = im; im.src = 'fx/fx_' + (k === 'linken_block' ? 'ward_block' : k) + '.webp' + (typeof V === 'string' ? V : ''); }
  const flashAt = (x, y, col) => GLOWS.push({ x, y, col, t: 0, dur: 0.3 });
  // жёсткие состояния: их ловят Аватар, Сфера оберега и Мантия
  const rooted = () => P.slowT > 0 && P.slowK <= 0.05 ? P.slowT : 0;   // «Обездвижен» замедлением до нуля (корни боссов)
  const hard = () => { const s = P.ss, k = SK.S; return s.stun > 0 || s.freeze > 0 || s.silence > 0 || s.blind > 0 || k.bind > 0 || k.pin > 0 || k.hex > 0 || k.called > 0 || !!k.pull || k.sleep > 0 || rooted() > 0; };
  // снять плохие состояния; баффы (imm, rshield, noMiss, spd, щит лучницы) не трогаем; MOV-эффекты sk_defs короткие — остаются
  function purge() {
    const s = P.ss; for (const n of ['poison', 'burn', 'cold', 'shred']) s[n].n = 0; s.freeze = s.stun = s.silence = s.blind = 0;
    const k = SK.S; for (const n of ['bind', 'pin', 'hex', 'atkSlow', 'weak', 'called', 'gaze', 'hunger', 'wounds', 'sleep', 'miss', 'vuln']) k[n] = 0;
    k.poison.n = 0; k.pull = null; k.calledBy = null; P.slowT = 0; P.slowK = 1;
    for (const n of ['napalm', 'frost', 'spois', 'rupt']) if (k[n] != null) k[n] = 0;   // состояния от злодеев v34
    if (typeof HSTAT !== 'undefined') for (const n of ['mark', 'fear', 'curse', 'bleed']) HSTAT.show(n, 0);
  }
  const immune = t => { const im = P.ss.imm; for (const n in im) im[n] = Math.max(im[n], t); };
  // урон эффекта: не атака и без проков
  function proc(e, dmg, col) { const a = HIT.atk, p = HIT.proc; HIT.atk = false; HIT.proc = true; try { hurtEnemy(e, dmg, col); } finally { HIT.atk = a; HIT.proc = p; } }
  function stun(e, t) { const r = rank(e); if (r === 3) { slow(e, 0.5, t); return; } e.stunT = Math.max(e.stunT || 0, r ? t / 2 : t); tagE(e, 'оглушён', '#ffe27a'); }
  // ---------- проки: зовёт items.js после урона от удара атакой ----------
  function onAtk(e) {
    if (off()) return;
    const b = pas('bash'); if (b && now() - T.bashAt >= b.icd && Math.random() < b.ch) { T.bashAt = now(); proc(e, b.dmg, '#ffe27a'); if (e.hp > 0) stun(e, b.t); }
    const c = pas('chain'); if (c && Math.random() < c.ch) chain(e, c);
    const d = pas('cor'); if (d && e.hp > 0) { e.corT = d.t; e.corA = d.amp; }
  }
  function chain(e0, c) {
    const hit = [e0], pts = [{ x: e0.x, y: e0.y }]; proc(e0, c.dmg, '#bfe6ff');
    for (let cur = e0; hit.length < c.n;) {
      let nx = null, bd = c.R; for (const e of enemies) if (live(e) && !hit.includes(e)) { const d = gdist(cur, e); if (d < bd) { bd = d; nx = e; } }
      if (!nx) break; hit.push(nx); pts.push({ x: nx.x, y: nx.y }); proc(nx, c.dmg, '#bfe6ff'); cur = nx;
    }
    ZAPS.push({ pts, t: 0, dur: 0.2 }); snd('hit', 0.25, 1.4);
  }
  const amp = e => (e.medT > 0 ? 1 + e.medA : 1) * (e.corT > 0 ? 1 + e.corA : 1);   // Медальон, Порча
  const evade = () => { if (off()) return false; let ch = 0; for (const id of SHOP.bag) { const p = ALL[id] && ALL[id].pas; if (p && p.eva > ch) ch = p.eva; } return Math.random() < ch; };
  // ---------- активки ----------
  const away = () => { const t = nearestEnemy(600); if (!t) return [P.face.x, P.face.y]; const dx = P.x - t.x, dy = (P.y - t.y) / YK, m = Math.hypot(dx, dy) || 1; return [dx / m, dy / m]; };
  const ACT = {   // false — некого бить, перезарядка не тратится
    blink(a, auto) { const [dx, dy] = auto ? away() : [P.face.x, P.face.y]; flashAt(P.x, P.y, '170,140,255'); P.x += dx * a.dist; P.y += dy * a.dist * YK; collide(P); flashAt(P.x, P.y, '170,140,255'); },
    force(a, auto) { const [dx, dy] = auto ? away() : [P.face.x, P.face.y]; T.dash = { vx: dx * a.dist / a.t, vy: dy * a.dist / a.t, t: a.t }; },
    medal(a, auto) { const t = top(a.R, auto ? 1 : 0); if (!t) return false; t.medT = a.t; t.medA = a.amp; tagE(t, 'метка', '#dfe8ff'); },
    midas(a) {
      const t = inR(a.R, e => rank(e) === 0 && !(e.k.rise && !e.risen) && !(e.k.reborn && !e.reborn)).sort((x, y) => gdist(P, x) - gdist(P, y))[0];
      if (!t) return false;
      const g = Math.round(a.gold * BAL.gold(Math.max(1, wave)) * (typeof LEVEL !== 'undefined' ? LEVEL.rk() : 1));
      HIT.noLs = true; proc(t, t.hp / ((P.dmgMul || 1) * 0.35) + 1, '#ffd95e'); HIT.noLs = false;   // наверняка (броня копа ×0,35)
      SHOP.addGold(g); gainXp(t.k.xp || 8); tagE(t, 'Золото +' + g, '#ffd95e'); snd('coins', 0.7, 1.2);
    },
    heal(a) { if (P.hp >= P.maxHp) return false; const h = Math.round(a.hp + a.pct * P.maxHp); P.hp = Math.min(P.maxHp, P.hp + h); say(P.x, P.y - CH * HS() * 1.1, '+' + h, '#7dff8a'); flashAt(P.x, P.y, '125,255,138'); },
    bkb(a) { T.bkb = a.t; purge(); sayP('Несокрушимость!', '#ffd95e'); },
    abyss(a, auto) { const t = top(a.R, auto ? 1 : 0); if (!t) return false; proc(t, a.dmg, '#c9a8ff'); if (t.hp > 0) stun(t, a.t); fx.push({ type: 'quake', x: t.x, y: t.y, t: 0, dur: 0.75, R: 120 }); tagE(t, 'Пролом!', '#c9a8ff'); snd('boss_slam', 0.5, 1.2); },
    manta(a) { purge(); T.manta = a.t; sayP('Иллюзии!', '#bfe6ff'); },
    shiva(a) { fx.push({ type: 'nova', x: P.x, y: P.y, t: 0, dur: 0.95, R: a.R }); for (const e of inR(a.R)) { proc(e, a.dmg, '#bfe6ff'); slow(e, a.slow, a.st); } snd('nova', 0.7); },
    storm(a) { T.storm = a.t; T.stormT = 0; },
    unholy(a) { T.unholy = a.t; sayP('Кровавая жажда!', '#ff4a4a'); },
    rite(a) { T.rite = a.t; sayP('Кровавый обряд!', '#ff4a4a'); flashAt(P.x, P.y, '255,60,60'); },
  };
  const AUTO = {   // когда срабатывают сами: только в бою, лечение Механизма — и между раундами
    blink: () => P.hp < 0.35 * P.maxHp && (inR(250).length >= 2 || inR(250, e => rank(e) === 3).length > 0),
    force: () => P.hp < 0.5 * P.maxHp && inR(160).length > 0,
    medal: () => !!top(600, 1),
    midas: () => true,
    heal: () => P.hp < 0.45 * P.maxHp,
    bkb: () => hard(),
    abyss: () => !!top(500, 1),
    manta: () => hard() || P.slowT > 0 || inR(500).length >= 5 || inR(600, e => rank(e) === 3).length > 0,
    shiva: () => inR(450).length >= 3 || inR(450, e => rank(e) >= 1).length > 0,   // v99: раньше ждала пятерых вплотную — у дальнего героя почти не срабатывала
    storm: () => inR(450).length >= 4 || inR(600, e => rank(e) === 3).length > 0,
    unholy: () => P.hp < 0.35 * P.maxHp && inR(600).length > 0,
    rite: () => P.hp < 0.5 * P.maxHp && inR(600).length > 0,
  };
  // звук срабатывания предмета (v101): магия — 2, железо, щиты и оружие — 3, остальное — 1
  const CLICK = { bkb: 2, manta: 2, rite: 2, unholy: 2, blink: 2, shiva: 2, lotus: 2, aeon: 2, abyss: 3, storm: 3, medal: 3, linken: 3 };
  const click = k => { if (typeof play === 'function') play('item_click_' + (CLICK[k] || 1), 1); };
  function use(id, manual) {
    const it = ALL[id], a = it && it.act;
    if (!a || off() || (RCD[id] || 0) > 0 || (manual && SHOP.paused)) return;
    if (ACT[a.kind](a, !manual) === false) return;
    RCD[id] = a.cd; relicFlash(id); click(a.kind);
  }
  // ---------- каждый кадр ----------
  function tick(dt) {
    for (const k of ['bkb', 'aeon', 'manta', 'storm', 'unholy', 'ward', 'rite', 'linkenF', 'lotusF']) if (T[k] > 0) T[k] = Math.max(0, T[k] - dt);
    for (const id of new Set(SHOP.bag)) { const it = ALL[id]; if (it && !it.relic && RCD[id] > 0) RCD[id] = Math.max(0, RCD[id] - dt); }
    for (const L of [ZAPS, GLOWS]) { for (const z of L) z.t += dt; for (let i = L.length - 1; i >= 0; i--) if (L[i].t > L[i].dur) L.splice(i, 1); }
    if (off()) { T.dash = null; return; }
    T.calm += dt;
    if (T.dash) { const d = T.dash, q = Math.min(dt, d.t); P.x += d.vx * q; P.y += d.vy * q * YK; collide(P); if ((d.t -= dt) <= 0) T.dash = null; }
    if (T.bkb > 0 || T.ward > 0) { purge(); immune(0.2); }
    // Зеркальная сфера: первое жёсткое состояние снимается и возвращается тому, кто его наложил (боссу и мини-боссу — на половину времени)
    if (has('lotus') && !(RCD.lotus > 0) && hard()) {
      const s = P.ss, k = SK.S, im = Math.max(s.stun, s.freeze, k.bind, k.pin, k.sleep || 0, rooted()), si = Math.max(s.silence, k.hex);
      const e = T.src && now() - T.src.at < 4 && live(T.src.e) ? T.src.e : SK.lastCast && now() - SK.lastCast.at < 4 && live(SK.lastCast.e) ? SK.lastCast.e : null;
      purge(); T.ward = ALL.lotus.pas.lotus.imm; immune(T.ward); RCD.lotus = ALL.lotus.pas.cd; relicFlash('lotus'); click('lotus'); T.lotusF = 1.5; T.src = null;
      GLOWS.push({ x: P.x, y: P.y, col: '255,150,210', t: 0, dur: 0.6, R: 150, im: 'lotus_reflect', hero: 1 });
      if (e) { const h = rank(e) >= 2 ? 0.5 : 1;
        if (im > 0) e.stunT = Math.max(e.stunT || 0, Math.max(0.3, im * h)); if (si > 0) e.silT = Math.max(e.silT || 0, si * h); if (!(im > 0) && !(si > 0)) e.stunT = Math.max(e.stunT || 0, 0.5 * h);
        ZAPS.push({ pts: [{ x: P.x, y: P.y - CH * HS() * 0.6 }, { x: e.x, y: e.y }], t: 0, dur: 0.35 }); GLOWS.push({ x: e.x, y: e.y, col: '255,150,210', t: 0, dur: 0.5, R: 90, im: 'lotus_reflect', S: 150 }); tagE(e, 'отражено!', '#ffb0e0'); snd('hit', 0.3, 1.5); }
    }
    // Сфера оберега: первое жёсткое состояние снимается; вокруг героя — золотая вспышка щита (картинку рисует Клауди)
    if (has('linken') && !(RCD.linken > 0) && hard()) { purge(); T.ward = ALL.linken.pas.linken.imm; immune(T.ward); RCD.linken = ALL.linken.pas.cd; relicFlash('linken'); T.linkenF = 1.5;
      GLOWS.push({ x: P.x, y: P.y, col: '255,215,120', t: 0, dur: 0.7, R: 150, im: 'linken_block', hero: 1 }); click('linken'); }
    const cm = pas('calm');   // Сердце великана: 5 с без урона — +2 % здоровья в секунду
    if (cm && T.calm >= cm.after && P.hp < P.maxHp) { const h = cm.pct * P.maxHp * dt; P.hp = Math.min(P.maxHp, P.hp + h); T.calmAcc = (T.calmAcc || 0) + h; if ((T.calmT = (T.calmT || 0) + dt) >= 1) { say(P.x, P.y - CH * HS() * 1.1, '+' + Math.round(T.calmAcc), '#7dff8a'); T.calmT = 0; T.calmAcc = 0; } }
    for (const id of new Set(SHOP.bag)) {
      const au = ALL[id] && ALL[id].pas && ALL[id].pas.aura; if (!au) continue;
      for (const e of inR(au.R)) {
        if (au.slow) slow(e, au.slow, 0.2);
        if (au.burn && (e.burnAcc = (e.burnAcc || 0) + au.burn * dt) >= 12) { const v = e.burnAcc; e.burnAcc = 0; proc(e, v, '#ffb36a'); }
      }
    }
    if (T.storm > 0 && (T.stormT -= dt) <= 0) {
      const a = ALL.vajra.act, L = inR(a.R); T.stormT = a.every;
      if (L.length) { const e = L[Math.floor(Math.random() * L.length)]; proc(e, a.dmg, '#bfe6ff'); ZAPS.push({ pts: [{ x: P.x, y: P.y - CH * HS() * 0.6 }, { x: e.x, y: e.y }], t: 0, dur: 0.2 }); }
    }
    for (const id of new Set(SHOP.bag)) {
      const a = ALL[id] && ALL[id].act; if (!a || (RCD[id] || 0) > 0) continue;
      if (SHOP.phase !== 'fight' && a.kind !== 'heal') continue;
      if (AUTO[a.kind]()) use(id, false);
    }
  }
  // ---------- рисование (простые свечения и молнии кодом — так в пакете) ----------
  function glow(x, y, rx, ry, col, a) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(' + col + ',' + a + ')'); g.addColorStop(0.7, 'rgba(' + col + ',' + a * 0.45 + ')'); g.addColorStop(1, 'rgba(' + col + ',0)');
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.283); ctx.fill(); ctx.restore();
  }
  function drawGround(t) {
    if (window.NETC && NETC.on) return;
    for (const e of enemies) {
      if (!live(e)) continue;
      if (e.corT > 0) { ctx.save(); ctx.fillStyle = 'rgba(120,40,160,.35)'; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rad * 1.5, e.rad * 1.5 * YK, 0, 0, 6.283); ctx.fill(); ctx.restore(); }                       // порча
      if (e.medT > 0) { ctx.save(); ctx.strokeStyle = '#dfe8ff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(e.x, e.y, e.rad * 1.8, e.rad * 1.8 * YK, 0, 0, 6.283); ctx.stroke(); ctx.restore(); }               // храбрость
    }
    if (off()) return;
    for (const id of new Set(SHOP.bag)) { const au = ALL[id] && ALL[id].pas && ALL[id].pas.aura; if (!au) continue;
      if (au.burn) glow(P.x, P.y, au.R, au.R * YK, '255,150,60', 0.18 + 0.05 * Math.sin(t * 3));                                    // Солнечный клинок
      else if (au.slow && SHOP.phase === 'fight') glow(P.x, P.y, au.R, au.R * YK, '150,210,255', 0.1 + 0.03 * Math.sin(t * 2)); }   // холодная аура Шивы — чтобы было видно, что она работает
  }
  function drawOver(t) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (const z of ZAPS) {   // молнии: ломаная с дрожью
      const a = 1 - z.t / z.dur;
      for (const [w, al] of [[9, 0.25], [3, 0.95]]) {
        ctx.strokeStyle = 'rgba(191,230,255,' + al * a + ')'; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i < z.pts.length; i++) {
          const p = z.pts[i], y = p.y - (i || z.pts.length > 2 ? 40 : 0);
          if (!i) { ctx.moveTo(p.x, y); continue; }
          const q = z.pts[i - 1], qy = q.y - 40;
          for (let k = 1; k <= 4; k++) ctx.lineTo(q.x + (p.x - q.x) * k / 4 + (k < 4 ? rnd(-8, 8) : 0), qy + (y - qy) * k / 4 + (k < 4 ? rnd(-8, 8) : 0));
        }
        ctx.stroke();
      }
    }
    for (const g of GLOWS) { const R = g.R || 90, k = g.R ? 0.6 + 0.4 * g.t / g.dur : 1, q = g.t / g.dur, im = g.im && FXI[g.im];
      const gx = g.hero ? P.x : g.x, gy = (g.hero ? P.y : g.y) - CH * HS() * 0.5;   // вспышка на герое идёт за ним
      if (im && im.complete && im.naturalWidth) {   // картинка: быстро вырастает, держится и гаснет; под ней — слабое свечение
        glow(gx, gy, R * k, R * k, g.col, 0.35 * (1 - q));
        const S = (g.S || CH * HS() * 1.9) * (0.75 + 0.3 * Math.min(1, q * 4)), a = q < 0.6 ? 1 : (1 - q) / 0.4;
        ctx.save(); ctx.globalAlpha *= Math.max(0, a); ctx.drawImage(im, gx - S / 2, gy - S / 2, S, S); ctx.restore();
      } else glow(gx, gy, R * k, R * k, g.col, 0.7 * (1 - q)); }
    if (!off()) {
      const y = P.y - CH * HS() * 0.5, R = 95 * HS(), p = 1 + 0.06 * Math.sin(t * 7);
      if (T.bkb > 0) glow(P.x, y, R * p, R * p, '255,210,90', 0.4);
      if (T.unholy > 0 || T.rite > 0) glow(P.x, y, R * p, R * p, '255,60,60', 0.4);
      if (T.aeon > 0) glow(P.x, y, R * 1.2 * p, R * 1.2 * p, '255,240,190', 0.5);
      if (T.storm > 0) glow(P.x, y, R * p, R * p, '140,200,255', 0.3);
      if (T.dash) glow(P.x, y, R * 0.8, R * 0.8, '220,240,255', 0.35);
    }
    ctx.restore();
  }
  // временные эффекты предметов — в ряд значков состояний (status.js): [предмет, { t — секунд осталось }]
  if (typeof HSTAT !== 'undefined') HSTAT.items = () => {
    const L = []; if (off()) return L;
    if (T.bkb > 0) L.push(['bkb', { t: T.bkb }]); if (T.aeon > 0) L.push(['aeon', { t: T.aeon }]); if (T.unholy > 0) L.push(['satanic', { t: T.unholy }]);
    if (T.manta > 0) L.push(['manta', { t: T.manta }]); if (T.storm > 0) L.push(['vajra', { t: T.storm }]); if (T.rite > 0) L.push(['bloodstone', { t: T.rite }]);
    const cm = pas('calm'); if (cm && T.calm >= cm.after && P.hp < P.maxHp) L.push(['tarrasque', { t: 0 }]);   // Кровь титана — пока лечит
    if (T.linkenF > 0) L.push(['linken', { t: T.linkenF }]); if (T.lotusF > 0) L.push(['lotus', { t: T.lotusF }]);
    return L;
  };
  return { T, ZAPS, GLOWS, has, pas, onAtk, amp, evade, use, click, tick, purge, hard, drawGround, drawOver };
})();

// урон по герою: Несокрушимость −30 %, Оберег рубежа, отсчёт «без урона» для Сердца Тарраска
{ const _hp = hurtPlayer;
  hurtPlayer = function (d, kind) {
    if (P.dead > 0) return;
    const solo = !(window.NETC && NETC.on), F = ITEMFX.T;
    if (solo && F.aeon > 0) return;
    if (solo && F.bkb > 0) d *= ALL.bkb.act.taken;
    const hp0 = P.hp; _hp(d, kind);
    if (P.hp < hp0) F.calm = 0;
    const a = ALL.aeon.pas;
    if (solo && ITEMFX.has('aeon') && !(RCD.aeon > 0) && P.hp > 0 && P.hp < a.aeon.below * P.maxHp) {
      F.aeon = a.aeon.t; ITEMFX.purge(); P.ss.spd = Math.max(P.ss.spd, a.aeon.spd); RCD.aeon = a.cd; relicFlash('aeon'); ITEMFX.click('aeon');
    }
  }; }
// враги: оглушение, порча, храбрость
{ const _ue = updateEnemy;
  updateEnemy = function (e, dt) {
    if (e.corT > 0) e.corT -= dt; if (e.medT > 0) e.medT -= dt;
    if (e.stunT > 0 && !e.skMove) { e.stunT -= dt; e.act = null; e.anim = 'idle'; e.jump = 0; if (e.leap) { e.leap = null; collide(e); } return; }
    const h0 = ITEMFX.hard(); _ue(e, dt);
    if (!h0 && ITEMFX.hard()) ITEMFX.T.src = { e, at: performance.now() / 1000 };   // для «Отражения» Сферы лотоса
  }; }
// иллюзии Мантии повторяют каждый выстрел
{ const _sh = shoot;
  shoot = function () {
    const n0 = shots.length; _sh();
    if (!(ITEMFX.T.manta > 0) || (window.NETC && NETC.on)) return;
    const a = ALL.manta.act;
    for (let i = n0, n = shots.length; i < n; i++) {
      const s = shots[i]; if (s.own !== 'p' || s.ill) continue;
      for (const side of [-1, 1]) shots.push(Object.assign({}, s, { x: s.x - s.dy * side * a.off, y: s.y + s.dx * side * a.off * YK, dmg: s.dmg * a.k, ill: 1, onHit: null }));
    }
  }; }
// две полупрозрачные копии героя
{ const _dh = drawHero;
  drawHero = function () {
    const r = _dh();
    if (ITEMFX.T.manta > 0 && !(window.NETC && NETC.on)) { const x0 = P.x; ctx.save(); ctx.globalAlpha = 0.45; for (const side of [-1, 1]) { P.x = x0 + side * ALL.manta.act.off; _dh(); } P.x = x0; ctx.restore(); }
    return r;
  }; }
// нижние ячейки и клавиши 6 7 8 9 0 −
{ const _use = SHOP.use; SHOP.use = function (id) { if (typeof id === 'string' && id.startsWith('it:')) return ITEMFX.use(id.slice(3), true); return _use.apply(this, arguments); }; }
addEventListener('keydown', e => { if (e.repeat) return; const i = ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus'].indexOf(e.code); if (i >= 0 && SHOP.bag[i]) ITEMFX.use(SHOP.bag[i], true); });
// цикл игры
{ const _cu = combatUpdate, _cg = combatGround, _co = combatOver;
  combatUpdate = function (dt) { _cu(dt); ITEMFX.tick(dt); };
  combatGround = function (t) { _cg(t); ITEMFX.drawGround(t); };
  combatOver = function (t) { _co(t); ITEMFX.drawOver(t); };
}
