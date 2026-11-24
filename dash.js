// Рывок героя (v94): отдельная кнопка у обоих героев. Рывок туда, куда ведёт джойстик (стоит — куда смотрит): 250 за 0,18 с,
// 0,25 с удары и снаряды по герою не попадают и новые состояния не цепляются (яд и горение, что уже висят, тикают).
// Перезарядка 6 с, без маны. Нельзя при оглушении, заморозке и «Обездвижен» — на кнопке тот же запрет (status.js). Безмолвие не мешает.
// Анимация (v96) — свой лист рывка у обоих героев (Клауди: gf_dash, eira_dash; 8 направлений × 6 кадров): кадры 1–3 — сам рывок,
// 4–5 — торможение (около 0,1 с, управление уже вернулось). След — полупрозрачные копии из кадров 2–3 рывка и лёгкое свечение.
// Иконка кнопки — Клауди (ui/status/dash.webp).
// Онлайн: позицию героя ведёт сервер, рывок через него пока не сделан — в онлайне кнопки нет.
'use strict';
const DASH = (function () {
  const D = { dist: 250, dur: 0.18, inv: 0.25, cd: 6 };
  // v119: рывок качается (1–20, окно героя): перезарядка −0,1 с и дальность +4 за уровень — на 20-м 4,1 с и 326
  const lvD = () => ((P.skLv && P.skLv.dash) || 1) - 1, cdOf = () => D.cd - 0.1 * lvD(), distOf = () => D.dist + 4 * lvD();
  const ICON = new Image(); ICON.src = 'ui/status/dash.webp' + V;
  const off = () => !!(window.NETC && NETC.on) || (typeof LIMBO !== 'undefined' && LIMBO.on);
  BTN.push({ id: 'dash', label: 'Рывок', key: '⇧', col: '255,220,140' });   // v101: на клавиатуре — Shift (на C открывалось окно героя, и рывок с клавиши не работал)
  BTN_POS.dash = [48, 172, 33]; SK_CELL.dash = -9; CDMAX.dash = D.cd; MANA.dash = 0; P.cd.dash = 0;
  GANFAUL.mul.dash = GF_ROW('dash', 6, 45); ARCHER.mul.dash = EIRA_ROW('dash', 6, 45);
  // листы героя уже могли начать грузиться (loadMul идёт по списку один раз) — лист рывка догружаем сами
  for (const c of [GANFAUL, ARCHER]) if (c.loading && !c.mul.dash.img) { const d = c.mul.dash; c.ok = false; d.img = new Image(); d.img.onload = () => { d.ok = true; c.ok = Object.values(c.mul).every(x => x.ok); }; d.img.src = 'chars/at_' + d.at + '.webp' + V; }
  const ACT = 0.336;                              // действие «рывок»: 6 кадров по 0,056 с, начинаем с кадра 1 — кадры 1–3 идут 0,17 с, 4–5 — ещё 0,11 с
  const ghosts = [];                              // след: { x, y, t, f — кадр листа рывка, row }
  let run = null;                                 // идущий рывок: { t, dx, dy, acc }

  // почему рывок нельзя: значок причины и секунды — как в HSTAT.why
  function why() {
    const S = P.sk || {}, ss = P.ss;
    if (P.dead > 0) return null;
    if (ss.freeze > 0) return { k: 'freeze', t: ss.freeze };
    if (ss.stun > 0) return { k: 'stun', t: ss.stun };
    const r = Math.max(S.sleep || 0, S.astral || 0, S.bind || 0, S.pin || 0, P.slowT > 0 && P.slowK <= 0 ? P.slowT : 0);
    if (r > 0) return { k: 'root', t: r };
    return STATUS.locked() ? { k: 'root', t: 0 } : null;
  }
  function go() {
    if (off() || P.dead > 0 || P.cd.dash > 0 || run || (typeof SHOP !== 'undefined' && SHOP.paused) || why()) return false;
    const v = inputVector(), dx = v.m > 0.12 ? v.ax / v.m : P.face.x, dy = v.m > 0.12 ? v.ay / v.m : P.face.y;
    run = { t: 0, dx, dy, acc: 0 }; P.dashI = D.inv; P.cd.dash = cdOf() * (P.cdMul || 1); CDMAX.dash = cdOf();
    P.face = { x: dx, y: dy }; run.row = runRow(dx, dy);
    if (HERO.mul && HERO.mul.dash) P.act = { anim: 'dash', t: ACT / 6, dur: ACT, row: run.row };
    ghosts.push({ x: P.x, y: P.y, t: 0, f: 2, row: run.row });
    return true;
  }
  {
    const _cast = cast;
    cast = function (id) { if (id === 'dash') return go(); return _cast(id); };
    addEventListener('keydown', e => { if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) cast('dash'); });
    // кнопки в онлайне и в Междумирье нет
    const _lb = layoutButtons;
    layoutButtons = function () { _lb(); if (off()) { const b = BTN.find(b => b.id === 'dash'); b.x = b.y = -9999; } };
  }
  {
    const _cu = combatUpdate;
    combatUpdate = function (dt) {
      if (P.dashI > 0) P.dashI -= dt;
      if (run) {
        if (P.dead > 0 || why()) run = null;
        else {
          const k = Math.min(dt, D.dur - run.t), sp = distOf() / D.dur;
          P.x += run.dx * sp * k; P.y += run.dy * sp * k * YK; collide(P);
          run.t += dt; run.acc += dt;
          if (run.acc >= 0.055) { run.acc = 0; ghosts.push({ x: P.x, y: P.y, t: 0, f: run.t < 0.1 ? 2 : 3, row: run.row }); }
          if (run.t >= D.dur) run = null;
        }
      }
      for (const g of ghosts) g.t += dt;
      while (ghosts.length && ghosts[0].t > 0.45) ghosts.shift();
      _cu(dt);
    };
  }
  // пока идёт рывок — урон не проходит (яд и горение, что уже висят, тикают), новые состояния не цепляются
  {
    const _hp = hurtPlayer;
    hurtPlayer = function (d, kind) { if (P.dashI > 0 && kind !== 'poison' && kind !== 'burn') return; return _hp(d, kind); };
    const _add = STATUS.add; STATUS.add = function (k, v, t) { if (P.dashI > 0) return; return _add(k, v, t); };
    const _sl = slowHero; slowHero = function (k, t) { if (P.dashI > 0 && t > 0.25) return; return _sl(k, t); };
  }
  // след: копии героя его же кадрами и свечение
  {
    const _dp = drawPlayer; let inG = false;
    drawPlayer = function () {
      if (!inG && ghosts.length && P.dead <= 0) {
        inG = true; const x = P.x, y = P.y, a0 = ctx.globalAlpha, act0 = P.act, sheet = HERO.mul && HERO.mul.dash;
        for (const g of ghosts) {
          const a = 0.6 * (1 - g.t / 0.45); if (a <= 0.02 || Math.hypot(g.x - x, g.y - y) < 18) continue;
          if (typeof glowImg === 'function') { const R = CH * 0.55 * HS(); ctx.globalAlpha = a * 0.5; ctx.drawImage(glowImg('190,225,255'), g.x - R, g.y - CH * 0.5 * HS() - R, R * 2, R * 2); }
          if (sheet) P.act = { anim: 'dash', t: g.f + 0.5, dur: 6, row: g.row };   // копия — кадр 2 или 3 листа рывка
          ctx.globalAlpha = a; P.x = g.x; P.y = g.y; _dp();
        }
        P.x = x; P.y = y; P.act = act0; ctx.globalAlpha = a0; inG = false;
      }
      _dp();
    };
  }
  // кнопка: подложка и иконка рисуются до остального интерфейса — кольцо перезарядки ложится сверху
  {
    const _ui = combatUI;
    combatUI = function () {
      if (!off()) {
        layoutButtons(); const b = BTN.find(b => b.id === 'dash'), d = b.r * 1.55;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.94, 0, 7); ctx.fillStyle = 'rgba(14,20,32,0.88)'; ctx.fill();          // подложка и ободок — интерфейс
        ctx.lineWidth = Math.max(2, b.r * 0.09); ctx.strokeStyle = '#7fb6e6'; ctx.stroke();
        ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 1.0, 0, 7); ctx.stroke();
        if (ICON.complete && ICON.naturalWidth) ctx.drawImage(ICON, b.x - d / 2, b.y - d / 2, d, d);
      }
      _ui();
    };
  }
  return { D, why, go, cdOf, distOf, get on() { return !!run; }, ghosts };
})();
