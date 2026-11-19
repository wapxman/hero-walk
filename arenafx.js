// Живые арены миров (19.11): огонь, дым, фонтаны, круги на воде, водопады, вихри, молнии, призраки, сияние (листы
// Клауди из ui/mapfx, рисует MFX из mapfx.js) по местам на картинке арены, плюс частицы по экрану и стайки летунов.
// Места — доли картинки арены (раскладки LAYOUT в data.js), w — доля ширины арены.
// k: fire, smoke, fount, ripple, fall, vortex, light, ghost, aurora. amb — частицы по экрану, fly — ряд листа sp_flyers.
'use strict';
const ARENA_FX = {
  1: { amb: 'dust', fly: 0, fx: [['fount', 0.25, 0.195, 0.032], ['fount', 0.78, 0.705, 0.032], ['ripple', 0.66, 0.33, 0.015],
    ['fire', 0.775, 0.44, 0.014], ['fire', 0.855, 0.44, 0.014], ['fire', 0.165, 0.89, 0.012], ['fire', 0.49, 0.9, 0.012]] },
  2: { amb: 'embers', fly: 1, fx: [['fire', 0.1, 0.07, 0.05], ['fire', 0.3, 0.05, 0.045], ['fire', 0.6, 0.05, 0.045], ['fire', 0.9, 0.09, 0.05],
    ['fire', 0.4, 0.18, 0.03], ['fire', 0.36, 0.63, 0.03], ['fire', 0.85, 0.32, 0.03], ['fire', 0.15, 0.93, 0.05], ['fire', 0.85, 0.93, 0.05],
    ['smoke', 0.4, 0.16, 0.06], ['smoke', 0.85, 0.3, 0.06], ['smoke', 0.3, 0.03, 0.08]] },
  3: { amb: 'leaves', fly: 1, fx: [['ripple', 0.25, 0.19, 0.04], ['ripple', 0.79, 0.7, 0.04], ['fall', 0.15, 0.12, 0.012], ['fall', 0.8, 0.06, 0.012]] },
  4: { amb: 'fireflies', fx: [['ripple', 0.08, 0.6, 0.05], ['ripple', 0.92, 0.3, 0.05], ['ripple', 0.12, 0.86, 0.05], ['ripple', 0.88, 0.8, 0.05],
    ['ripple', 0.68, 0.62, 0.025], ['ghost', 0.1, 0.4, 0.04], ['ghost', 0.9, 0.55, 0.04]] },
  5: { amb: 'dust', fly: 3, fx: [['fire', 0.07, 0.4, 0.012], ['fire', 0.93, 0.4, 0.012], ['fire', 0.45, 0.03, 0.012], ['fire', 0.55, 0.03, 0.012]] },
  6: { amb: 'snow', fly: 2, fx: [['aurora', 0.5, 0.05, 0.6], ['fall', 0.05, 0.8, 0.014], ['fall', 0.88, 0.1, 0.014]] },
  7: { amb: 'glint', fx: [['ripple', 0.42, 0.18, 0.025], ['ripple', 0.8, 0.31, 0.025], ['ripple', 0.33, 0.63, 0.025], ['ghost', 0.15, 0.3, 0.035], ['ghost', 0.6, 0.8, 0.035]] },
  8: { amb: 'embers', fly: 3, fx: [['fire', 0.42, 0.17, 0.03], ['fire', 0.15, 0.33, 0.03], ['fire', 0.84, 0.31, 0.03], ['fire', 0.33, 0.62, 0.03], ['fire', 0.69, 0.62, 0.03],
    ['smoke', 0.06, 0.2, 0.08], ['smoke', 0.94, 0.7, 0.08]] },
  9: { amb: 'motes', fly: 0, fx: [['fall', 0.13, 0.17, 0.012], ['fall', 0.06, 0.52, 0.012], ['fall', 0.93, 0.18, 0.012], ['fall', 0.94, 0.52, 0.012],
    ['fall', 0.28, 0.88, 0.012], ['fall', 0.83, 0.86, 0.012], ['fire', 0.64, 0.19, 0.012], ['fire', 0.28, 0.63, 0.012], ['fount', 0.68, 0.63, 0.025]] },
  10: { amb: 'void', fx: [['vortex', 0.26, 0.11, 0.05], ['vortex', 0.76, 0.69, 0.05], ['light', 0.1, 0.1, 0.06], ['light', 0.9, 0.12, 0.06],
    ['light', 0.12, 0.88, 0.06], ['light', 0.88, 0.9, 0.06]] },
};
(function () {
  const AMB = [], FLY = [];
  const COL = { snow: '255,255,255', embers: '255,140,50', fireflies: '190,255,120', dust: '255,230,180', motes: '255,230,140', glint: '230,240,255', void: '190,120,255' };
  const N = { snow: 70, leaves: 18, embers: 40, fireflies: 30, dust: 25, motes: 30, glint: 22, void: 35 };
  let lt = 0, lit = null;
  const cfg = () => (typeof LIMBO !== 'undefined' && LIMBO.on) ? null : ARENA_FX[WORLD];
  const seen = (x, y) => x > cam.x - 500 && x < cam.x + cam.vw + 500 && y > cam.y - 500 && y < cam.y + cam.vh + 500;
  const AP = [];
  function ground(t) {
    const C = cfg(); if (!C) return;
    MFX.use(AP);
    const dt = 1 / 60;
    for (const [k, fx, fy, w] of (ARENA_I === 0 ? C.fx : [])) {   // огни и фонтаны — по картинке первой арены
      const x = fx * WORLD_W, y = fy * WORLD_H, s = w * WORLD_W;
      if (!seen(x, y)) continue;
      if (k === 'fount') MFX.fountain(ctx, x, y, s, t, dt);
      else if (k === 'ripple') MFX.ripples(ctx, x, y, s, t, fx * 7);
      else if (k === 'fire') MFX.frame(ctx, 'fx_fire', Math.floor(t * 12 + fx * 9), x, y, s, { a: 0.8 + 0.2 * Math.sin(t * 6 + fx * 20) });
      else if (k === 'smoke') MFX.frame(ctx, 'fx_smoke', Math.floor(t * 8 + fy * 9), x, y, s, { a: 0.55, blend: 'source-over' });
      else if (k === 'fall') { MFX.frame(ctx, 'fx_waterfall', Math.floor(t * 10 + fx * 5), x, y, s, { a: 0.7, center: 1 }); MFX.splash(x, y + s * 1.4, s * 2, dt); }
      else if (k === 'vortex') MFX.frame(ctx, 'fx_vortex', 0, x, y, s, { a: 0.55, rot: t * 0.9, center: 1 });
      else if (k === 'ghost') { const q = (t * 0.1 + fx) % 1; MFX.frame(ctx, 'fx_ghost', Math.floor(t * 8), x + q * s * 2, y - q * s, s, { a: 0.55 * Math.sin(q * Math.PI), center: 1 }); }
    }
    MFX.parts(ctx, dt);
  }
  function over(t) {
    const C = cfg(); if (!C) return;
    const dt = 1 / 60, vx = cam.x, vy = cam.y, vw = cam.vw, vh = cam.vh;
    for (const [k, fx, fy, w] of C.fx) if (k === 'aurora') {
      const x = fx * WORLD_W, y = fy * WORLD_H, s = w * WORLD_W, f = t * 0.5, i = Math.floor(f);
      MFX.frame(ctx, 'fx_aurora', i, x, y, s, { a: 0.3 * (1 - f % 1), center: 1 }); MFX.frame(ctx, 'fx_aurora', i + 1, x, y, s, { a: 0.3 * (f % 1), center: 1 });
    }
    const L = C.fx.filter(f => f[0] === 'light');
    if (L.length) {
      if (t > lt) { lit = { f: L[Math.floor(Math.random() * L.length)], fr: Math.floor(Math.random() * 4), end: t + 0.15 + Math.random() * 0.15 }; lt = t + 1.5 + Math.random() * 1.5; }
      if (lit && t < lit.end) { const [, fx, fy, w] = lit.f; MFX.frame(ctx, 'fx_lightning', lit.fr, fx * WORLD_W, fy * WORLD_H, w * WORLD_W, { a: 0.9, center: 1 }); }
    }
    // частицы по экрану: пепел, снег, листья, светлячки, пылинки, блики, искры Бездны
    const want = N[C.amb] || 0;
    while (AMB.length < want) AMB.push({ x: vx + Math.random() * vw, y: vy + Math.random() * vh, t: Math.random() * 5, s: Math.random() });
    if (AMB.length > want) AMB.length = want;
    ctx.save();
    for (const p of AMB) {
      p.t += dt;
      if (C.amb === 'snow') { p.y += (40 + p.s * 50) * dt; p.x += Math.sin(p.t + p.s * 9) * 20 * dt; }
      else if (C.amb === 'leaves') { p.y += (35 + p.s * 25) * dt; p.x += Math.sin(p.t * 1.3 + p.s * 9) * 40 * dt; }
      else if (C.amb === 'embers' || C.amb === 'void') { p.y -= (30 + p.s * 40) * dt; p.x += Math.sin(p.t * 2 + p.s * 9) * 15 * dt; }
      else { p.x += Math.sin(p.t * 0.7 + p.s * 9) * 12 * dt; p.y += Math.cos(p.t * 0.5 + p.s * 7) * 10 * dt; }
      if (p.y > vy + vh + 30) p.y = vy - 20; if (p.y < vy - 30) p.y = vy + vh + 20;
      if (p.x < vx - 30) p.x = vx + vw + 20; if (p.x > vx + vw + 30) p.x = vx - 20;
      if (C.amb === 'leaves') { MFX.frame(ctx, 'sp_props', 5 + Math.floor(p.s * 3), p.x, p.y, 22 + p.s * 10, { rot: p.t * 1.5 + p.s * 9, center: 1, a: 0.9 }); continue; }
      const tw = 0.5 + 0.5 * Math.sin(p.t * 3 + p.s * 20), r = C.amb === 'snow' ? 2 + p.s * 2.5 : 1.5 + p.s * 2;
      ctx.globalCompositeOperation = C.amb === 'snow' ? 'source-over' : 'lighter';
      ctx.globalAlpha = C.amb === 'snow' ? 0.8 : (C.amb === 'fireflies' || C.amb === 'glint' ? tw : 0.4 + 0.5 * tw);
      ctx.fillStyle = 'rgb(' + COL[C.amb] + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    // стайка летунов пересекает экран
    if (C.fly != null && MFX.ok('sp_flyers')) {
      if (!FLY.length || FLY.every(f => f.q > 1)) {
        FLY.length = 0; const y0 = vy + vh * (0.15 + Math.random() * 0.4), dir = Math.random() < 0.5 ? 1 : -1;
        for (let j = 0; j < 4; j++) FLY.push({ q: -0.4 - j * 0.04 - Math.random() * 0.6, y: y0 + j * 26, dir, sp: 0.07 + Math.random() * 0.02 });
      }
      for (const f of FLY) {
        f.q += f.sp * dt;
        if (f.q < 0 || f.q > 1) continue;
        const x = f.dir > 0 ? vx - 60 + f.q * (vw + 120) : vx + vw + 60 - f.q * (vw + 120);
        MFX.frame(ctx, 'sp_flyers', C.fly * 4 + Math.floor(t * 10 + f.y), x, f.y - Math.sin(f.q * Math.PI) * 60, 70, { center: 1, flip: f.dir < 0 });
      }
    }
  }
  const _cg = combatGround, _co = combatOver;
  combatGround = function (t) { _cg(t); ground(t); };
  combatOver = function (t) { _co(t); over(t); };
})();
