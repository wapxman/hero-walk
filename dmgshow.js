// ВРЕМЕННО, только v119 (просьба Создателя 24.11: «хочу видеть цифры, потом уберём»). Чтобы убрать — удалить этот файл
// и его строку в index.html, больше ничего не трогать.
//   над героем — крупная красная цифра: сколько здоровья снял каждый удар или умение врага (после защиты героя);
//   у врага рядом с полоской здоровья — урон его обычного удара (с учётом волны, мира и скрытого уровня врагов).
'use strict';
const DMGSHOW = (() => {
  const N = [];      // цифры над героем: { x, y, t, v }
  {
    const _hp = hurtPlayer;
    hurtPlayer = function () {
      const hp0 = P.hp, n0 = texts.length, r = _hp.apply(this, arguments), lost = hp0 - P.hp;
      // прежнюю мелкую цифру «-N» этого удара убираем — вместо неё крупная
      for (let i = texts.length - 1; i >= n0; i--) if (/^-\d+$/.test(texts[i].txt)) texts.splice(i, 1);
      if (lost >= 0.5) N.push({ x: P.x + rnd(-26, 26), y: P.y - CH * 1.1 * HS(), t: 0, v: Math.round(lost) });
      return r;
    };
  }
  const hit = e => Math.round((e.k.dmg[0] + e.k.dmg[1]) / 2 * e.dm);
  {
    const _de = drawEnemy;
    drawEnemy = function (e) {
      _de(e);
      if (e.dieT != null || !e.k || !e.k.dmg || !(e.hp > 0)) return;
      const c = e.ch, h = c.ok ? c.top * c.U * e.sc : e.rad * 2.2, bw = e.boss ? 110 : e.elite ? 96 : e.rad * 2.2, by = -h - 12;
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.font = 'bold 19px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const t = '⚔' + hit(e); ctx.strokeText(t, bw / 2 + 5, by + 3); ctx.fillStyle = '#ffd0b0'; ctx.fillText(t, bw / 2 + 5, by + 3);
      ctx.restore();
    };
    const _co = combatOver;
    combatOver = function (tm) {
      _co(tm);
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      for (const n of N) {
        const k = n.t / 1.2; ctx.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        ctx.font = 'bold ' + Math.round(30 + Math.min(14, n.v / 12) + 8 * Math.max(0, 1 - n.t / 0.15)) + 'px system-ui, sans-serif';
        const y = n.y - 70 * k; ctx.strokeText('−' + n.v, n.x, y); ctx.fillStyle = '#ff5540'; ctx.fillText('−' + n.v, n.x, y);
      }
      ctx.restore();
    };
    const _cu = combatUpdate;
    combatUpdate = function (dt) { _cu(dt); for (const n of N) n.t += dt; for (let i = N.length - 1; i >= 0; i--) if (N[i].t > 1.2) N.splice(i, 1); };
  }
  return { N, hit };
})();
