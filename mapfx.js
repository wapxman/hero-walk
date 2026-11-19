// Живые элементы (19.11): листы Клауди из ui/mapfx (огонь, дым, извержение, водопад, сияние, молнии, вихрь, призраки,
// летуны, дракон, корабль, мелочи; <id>.json — клетка, кадры, fps, blend, места map: [x, y, масштаб] в долях карты) +
// фонтаны и круги на воде частицами. Рисуются на карте «Путь героев» (PATHMAP.ground / sky) и на аренах миров (ARENA_FX).
'use strict';
const MFX = (() => {
  const IDS = ['fx_aurora', 'fx_eruption', 'fx_fire', 'fx_ghost', 'fx_lightning', 'fx_smoke', 'fx_vortex', 'fx_waterfall',
    'sp_dragon', 'sp_flyers', 'sp_props', 'sp_ship'];
  const D = {};
  for (const id of IDS) {
    const x = new XMLHttpRequest();
    try { x.open('GET', 'ui/mapfx/' + id + '.json' + V, false); x.send(); D[id] = JSON.parse(x.responseText); } catch (e) { continue; }
    const im = new Image(); im.src = 'ui/mapfx/' + id + '.webp' + V; D[id].img = im;
  }
  const ok = id => D[id] && D[id].img.complete && D[id].img.naturalWidth > 0;
  // кадр f листа id в точке (x, y) шириной w; anchor — по низу (y — основание)
  function frame(c, id, f, x, y, w, o) {
    const d = D[id]; if (!ok(id)) return;
    o = o || {};
    const [cw, ch] = d.cell, n = d.frames || 1, cols = d.cols || n;
    f = ((f % n) + n) % n;
    const sx = (f % cols) * cw, sy = Math.floor(f / cols) * ch, h = w * ch / cw;
    c.save();
    if (o.blend || d.blend === 'lighter') c.globalCompositeOperation = o.blend || 'lighter';
    c.globalAlpha = o.a == null ? 1 : o.a;
    c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.flip) c.scale(-1, 1);
    if (o.shadow) c.filter = 'brightness(0)';
    c.drawImage(d.img, sx, sy, cw, ch, -w / 2, o.center ? -h / 2 : -h, w, h);
    c.restore();
  }
  // ---------- частицы фонтанов, брызги, круги на воде ----------
  let P = [];   // текущий набор частиц: у карты и у арены свои (use)
  const use = arr => { P = arr; };
  function fountain(c, x, y, s, T, dt, k) {
    // струя: частицы вверх и вниз параболой, брызги в чаше, блики
    // центральная струя и четыре боковые дуги
    for (let i = 0; i < Math.ceil(70 * dt * (k || 1)); i++) {
      const side = Math.random() < 0.45, a = side ? Math.random() * 6.283 : 0, v = s * (side ? 1.6 : 3.1) * (0.9 + Math.random() * 0.2);
      P.push({ x, y: y - s * 0.12, vx: side ? Math.cos(a) * s * 0.9 : (Math.random() - 0.5) * s * 0.2, vy: -v, g: s * 4.6, t: 0, life: side ? 0.75 : 1.3,
        r: s * (side ? 0.03 : 0.04), col: '225,242,255', floor: y + s * 0.05 });
    }
    // круги расходятся по чаше
    const ph = (T * 0.7) % 1;
    for (const q of [ph, (ph + 0.5) % 1]) {
      c.save(); c.globalAlpha = 0.45 * (1 - q); c.strokeStyle = '#dff4ff'; c.lineWidth = Math.max(1, s * 0.03);
      c.beginPath(); c.ellipse(x, y, s * (0.15 + q * 0.5), s * (0.06 + q * 0.2), 0, 0, 6.283); c.stroke(); c.restore();
    }
    // блик
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.25 * Math.sin(T * 6);
    const gr = c.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 0.5); gr.addColorStop(0, 'rgba(200,235,255,0.8)'); gr.addColorStop(1, 'rgba(200,235,255,0)');
    c.fillStyle = gr; c.fillRect(x - s * 0.5, y - s * 0.8, s, s); c.restore();
  }
  function ripples(c, x, y, s, T, seed) {
    for (let i = 0; i < 3; i++) {
      const q = (T * 0.35 + i / 3 + seed) % 1;
      c.save(); c.globalAlpha = 0.65 * (1 - q) * Math.min(1, q * 4); c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, s * 0.03);
      c.beginPath(); c.ellipse(x, y, s * (0.1 + q * 0.6), s * (0.04 + q * 0.22), 0, 0, 6.283); c.stroke(); c.restore();
    }
  }
  function splash(x, y, s, dt) {   // брызги у подножия водопада
    for (let i = 0; i < Math.ceil(14 * dt); i++) P.push({ x: x + (Math.random() - 0.5) * s * 0.5, y, vx: (Math.random() - 0.5) * s, vy: -s * (0.6 + Math.random() * 0.8), g: s * 2.6, t: 0, life: 0.7, r: s * 0.03, col: '235,250,255' });
  }
  function parts(c, dt) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of P) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.floor && p.vy > 0 && p.y > p.floor) { p.t = p.life; continue; }   // капля упала в чашу
      const a = Math.max(0, 1 - p.t / p.life); c.globalAlpha = a * 0.8; c.fillStyle = 'rgb(' + p.col + ')';
      c.beginPath(); c.arc(p.x, p.y, Math.max(0.8, p.r), 0, 6.283); c.fill();
    }
    c.restore();
    for (let i = P.length - 1; i >= 0; i--) if (P[i].t >= P[i].life) P.splice(i, 1);
  }
  return { D, ok, frame, fountain, ripples, splash, parts, use };
})();

// ---------- карта «Путь героев» ----------
(function () {
  const M = id => (MFX.D[id] && MFX.D[id].map) || [];
  // свои места для фонтанов и воды (доли карты): двор замка, родник у эльфийской арки, водопад и берег у шахт, море, болото
  const FOUNT = [];   // на общей карте нет нарисованных чаш — фонтаны только на аренах (arenafx.js)
  const RIPPLE = [[0.847, 0.86, 0.06], [0.919, 0.77, 0.05], [0.65, 0.93, 0.05], [0.56, 0.72, 0.04], [0.235, 0.745, 0.035], [0.72, 0.66, 0.04]];
  const SPLASH = [[0.694, 0.85, 0.03], [0.27, 0.675, 0.025]];
  let drag = { t: -8, y: 0.45 }, ship = 0, light = [], props = 0;
  const MP = [];
  PATHMAP.ground.push(function (c, g, T, u, dt) {
    MFX.use(MP);
    const X = g.X, Y = g.Y, W = g.dw;
    // сияние над вершинами — медленный кроссфейд кадров
    for (const [x, y, s] of M('fx_aurora')) { const f = T * 0.5, i = Math.floor(f); MFX.frame(c, 'fx_aurora', i, X(x), Y(y), W * s, { a: 0.3 * (1 - f % 1), center: 1 }); MFX.frame(c, 'fx_aurora', i + 1, X(x), Y(y), W * s, { a: 0.3 * (f % 1), center: 1 }); }
    // вихрь Бездны крутится
    for (const [x, y, s] of M('fx_vortex')) MFX.frame(c, 'fx_vortex', 0, X(x), Y(y), W * s, { a: 0.5, rot: T * 0.94, center: 1 });
    // водопады
    for (const [x, y, s] of M('fx_waterfall')) MFX.frame(c, 'fx_waterfall', Math.floor(T * 10), X(x), Y(y), W * s, { a: 0.7, center: 1 });
    for (const [x, y, s] of SPLASH) MFX.splash(X(x), Y(y), W * s, dt);
    for (const [x, y, s] of M('fx_waterfall')) MFX.splash(X(x), Y(y) + W * s * 1.2, W * s, dt);
    // вода: круги и фонтаны
    RIPPLE.forEach(([x, y, s], i) => MFX.ripples(c, X(x), Y(y), W * s, T, i * 0.37));
    for (const [x, y, s] of FOUNT) MFX.fountain(c, X(x), Y(y), W * s, T, dt);
    // огонь деревни, дым деревни и вулкана, извержение (раз в 4–6 с ярче)
    M('fx_fire').forEach(([x, y, s], i) => MFX.frame(c, 'fx_fire', Math.floor(T * 12) + i * 2, X(x), Y(y), W * s, { a: 0.75 + 0.25 * Math.sin(T * 5 + i) }));
    for (const [x, y, s] of M('fx_eruption')) { const k = (T % 5) < 1.2 ? 1 : 0.55; MFX.frame(c, 'fx_eruption', Math.floor(T * 10), X(x), Y(y), W * s, { a: k }); }
    M('fx_smoke').forEach(([x, y, s], i) => MFX.frame(c, 'fx_smoke', Math.floor(T * 8) + i * 3, X(x), Y(y), W * s, { a: 0.6, blend: 'source-over' }));
    // призраки руин и болота плывут и тают
    M('fx_ghost').forEach(([x, y, s], i) => { const q = (T * 0.12 + i * 0.33) % 1; MFX.frame(c, 'fx_ghost', Math.floor(T * 8), X(x) + q * W * 0.03, Y(y) - q * W * 0.015, W * s, { a: 0.6 * Math.sin(q * Math.PI), center: 1 }); });
    // молнии Бездны: случайная вспышка раз в 1,5–3 с
    const lm = M('fx_lightning');
    if (lm.length && (!light.length || light[0].end < T - (1.5 + Math.random() * 1.5))) light = [{ i: Math.floor(Math.random() * lm.length), f: Math.floor(Math.random() * 4), start: T, end: T + 0.15 + Math.random() * 0.15 }];
    for (const L of light) if (T < L.end) { const [x, y, s] = lm[L.i]; MFX.frame(c, 'fx_lightning', L.f, X(x), Y(y), W * s, { a: 0.9, center: 1 }); }
    // мелочи: вагонетка катается, камни Бездны покачиваются, осколки руин вращаются, листья кружат, огонёк над болотом
    M('sp_props').forEach(([x, y, s], i) => {
      let dx = 0, dy = 0, rot = 0, a = 1;
      if (i === 0) dx = Math.sin(T * 0.4) * W * 0.02;
      else if (i <= 2) dy = Math.sin(T * 0.8 + i) * W * 0.004;
      else if (i <= 4) { rot = T * (i === 3 ? 0.6 : -0.9); dy = Math.sin(T + i) * W * 0.003; a = 0.75 + 0.25 * Math.sin(T * 4 + i); }
      else if (i <= 7) { const q = (T * 0.08 + i * 0.3) % 1; dy = q * W * 0.04; dx = Math.sin(T * 1.5 + i) * W * 0.008; rot = T * 1.3 + i; a = Math.sin(q * Math.PI); }
      else { dy = Math.sin(T * 1.2) * W * 0.004; a = 0.7 + 0.3 * Math.sin(T * 3); }
      MFX.frame(c, 'sp_props', i, X(x) + dx, Y(y) + dy, W * s, { a, rot, center: 1, flip: i === 0 && Math.cos(T * 0.4) < 0 });
    });
    // корабль плывёт по заливу (50 с), качается
    for (const [x, y, s] of M('sp_ship')) { const q = (T / 50) % 1; MFX.frame(c, 'sp_ship', Math.floor(T), X(x - 0.06 + q * 0.14), Y(y), W * s, { rot: Math.sin(T * 1.2) * 0.035, a: Math.min(1, q * 8, (1 - q) * 8) }); }
    MFX.parts(c, dt);
  });
  PATHMAP.sky.push(function (c, g, T, u, dt) {
    const X = g.X, Y = g.Y, W = g.dw;
    // стайки летунов по дуге: голуби у замка, вороны у деревни, сова у вершин, мыши у шахты
    M('sp_flyers').forEach(([x, y, s], k) => {
      for (let j = 0; j < 4; j++) {
        const q = (T * 0.05 + j * 0.07 + k * 0.29) % 1, fx = x - 0.08 + q * 0.16, fy = y - 0.04 * Math.sin(q * Math.PI) + j * 0.008;
        MFX.frame(c, 'sp_flyers', k * 4 + Math.floor(T * 10 + j), X(fx), Y(fy), W * s, { a: Math.min(1, q * 6, (1 - q) * 6), center: 1 });
      }
    });
    // дракон раз в ~20 с пролетает через всю карту по дуге, под ним тень
    for (const [, y0, s] of M('sp_dragon')) {
      if (T - drag.t > 20) drag = { t: T, y: y0 + (Math.random() - 0.5) * 0.2 };
      const q = (T - drag.t) / 9;
      if (q >= 0 && q <= 1) {
        const fx = -0.1 + q * 1.2, fy = drag.y - 0.12 * Math.sin(q * Math.PI);
        MFX.frame(c, 'sp_dragon', Math.floor(T * 9), X(fx), Y(fy + 0.06), W * s, { shadow: 1, a: 0.25, center: 1 });
        MFX.frame(c, 'sp_dragon', Math.floor(T * 9), X(fx), Y(fy), W * s, { center: 1 });
      }
    }
  });
})();
