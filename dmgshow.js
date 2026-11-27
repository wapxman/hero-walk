// ВРЕМЕННО (v119–v120, просьбы Создателя 24–25.11). Чтобы убрать — удалить этот файл и его строку в index.html.
//   Криты героя — крупной жёлтой цифрой над врагом (обычные удары и урон врагов по герою показываются, как всегда).
// v119 показывала ещё урон врагов над героем и урон врага у его полоски здоровья — убрано 25.11.
// v124 (Создатель 27.11): надпись «Ур. врагов N» под номером волны убрана — уровень врагов игроку не показывается нигде (levels.js).
'use strict';
const DMGSHOW = (() => {
  const CRIT = '#ffd23a';      // цвет цифры крита (items.js: hurtEnemy)
  const N = [];                // крупные цифры критов: { x, y, t, v }
  {
    const _he = hurtEnemy;
    hurtEnemy = function (e) {
      const n0 = texts.length, r = _he.apply(this, arguments);
      // цифру крита (она приходит жёлтой) заменяем крупной
      for (let i = texts.length - 1; i >= n0; i--) { const t = texts[i]; if (t.col === CRIT && /^\d+$/.test(String(t.txt))) { N.push({ x: t.x, y: t.y, t: 0, v: String(t.txt) }); texts.splice(i, 1); } }
      return r;
    };
    const _co = combatOver;
    combatOver = function (tm) {
      _co(tm);
      if (!N.length) return;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.fillStyle = CRIT;
      for (const n of N) {
        const k = n.t / 1.1; ctx.globalAlpha = k > 0.7 ? Math.max(0, (1 - k) / 0.3) : 1;
        ctx.font = 'bold ' + Math.round(40 + 14 * Math.max(0, 1 - n.t / 0.18)) + 'px system-ui, sans-serif';
        const y = n.y - 80 * k; ctx.strokeText(n.v + '!', n.x, y); ctx.fillText(n.v + '!', n.x, y);
      }
      ctx.restore();
    };
    const _cu = combatUpdate;
    combatUpdate = function (dt) { _cu(dt); for (const n of N) n.t += dt; for (let i = N.length - 1; i >= 0; i--) if (N[i].t > 1.1) N.splice(i, 1); };
  }
  return { N, CRIT };
})();
