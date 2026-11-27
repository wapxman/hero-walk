// Живые элементы арен от Клауди (19.11): ui/locfx/<id>.webp + описание в ui/locfx/locfx.js (LOCFX.defs — клетка,
// кадры, fps, blend; LOCFX.place[мир][id] — места: x, y — доли картинки арены, w — доля ширины, a — 'b' низ / 'c' центр,
// al — прозрачность, move=[dx, dy, период] — направление и темп движения, ph — сдвиг фазы).
// Всё, что движется (v99): один раз пересекает арену и уходит за край, следующий проход — через 20–40 с. Никто не ходит туда-обратно.
// Птицы (FLYBY) летят на высоте, где смотрит камера; остальные (страж, селянин, призраки, кит, скат) идут по своей линии через всю арену.
// blend: lighter — свечение (складывается), mask — дым/туман (альфа = яркость, цвет задаём здесь), normal — спрайт.
// Где у мира есть свои элементы, прежние места из arenafx.js (огонь, фонтаны) не рисуются — остаются частицы и птицы.
'use strict';
const LFX = (() => {
  if (typeof LOCFX === 'undefined') return null;
  const IMG = {}, V0 = typeof V === 'string' ? V : '';
  // цвет дыма-маски: тёмный у пожара и вулкана, светлый у тумана, облаков и пара
  const maskCol = id => /fog|steam|mist|cloud|vapor|spray/.test(id) ? [232, 238, 244] : /^w(2|8)_/.test(id) ? [42, 38, 36] : [96, 96, 102];
  function img(id) {
    if (IMG[id]) return IMG[id];
    const d = LOCFX.defs[id], o = IMG[id] = { ok: false };
    const im = new Image();
    im.onload = () => {
      if (d.blend === 'mask') try {   // один раз переводим лист в цвет с альфой по яркости (v115: если холст читать нельзя — как в оболочке iPhone с её адресом app:// — берём лист как есть)
        const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const px = g.getImageData(0, 0, c.width, c.height), a = px.data, [r, gg, b] = maskCol(id);
        for (let i = 0; i < a.length; i += 4) { const l = Math.max(a[i], a[i + 1], a[i + 2]) * (a[i + 3] / 255); a[i] = r; a[i + 1] = gg; a[i + 2] = b; a[i + 3] = l; }
        g.putImageData(px, 0, 0); o.src = c;
      } catch (e) { o.src = im; } else o.src = im;
      o.ok = true;
    };
    im.src = 'ui/locfx/' + id + '.webp' + V0;
    return o;
  }
  // кадр листа: (x, y) — точка опоры, w — ширина в единицах мира
  function draw(c, id, t, x, y, w, o) {
    const d = LOCFX.defs[id], I = img(id); if (!I.ok) return;
    const [cw, ch] = d.cell, n = d.frames || 1, f = Math.floor((t + (o.ph || 0)) * (d.fps || 8)) % n, h = w * ch / cw;
    const centre = o.a ? o.a === 'c' : d.blend === 'lighter';
    c.save();
    c.globalAlpha = o.al == null ? 1 : o.al;
    if (d.blend === 'lighter') c.globalCompositeOperation = 'lighter';
    c.translate(x, y); if (o.flip) c.scale(-1, 1);
    c.drawImage(I.src, f * cw, 0, cw, ch, -w / 2, centre ? -h / 2 : -h, w, h);
    c.restore();
  }
  return { draw, img };
})();

if (LFX) {
  // в мирах со своими элементами прежние места из arenafx.js не нужны (остаются частицы по экрану и птицы)
  for (const w in LOCFX.place) if (ARENA_FX[w]) ARENA_FX[w].fx = ARENA_FX[w].fx.filter(f => f[0] === 'aurora' || f[0] === 'light');
  const on = () => !(typeof LIMBO !== 'undefined' && LIMBO.on) && ARENA_I === 0 && LOCFX.place[WORLD];   // элементы стоят на первых аренах
  const seen = (x, y, w) => x > cam.x - w - 200 && x < cam.x + cam.vw + w + 200 && y > cam.y - w * 2 - 200 && y < cam.y + cam.vh + w + 200;
  // птицы и летучие мыши (v91): не летают туда-сюда без конца, а пролетают через арену 1–2 раза и уходят за край;
  // следующий пролёт — через 20–40 с. Высота пролёта — там, где сейчас смотрит камера, чтобы игрок их видел.
  const FLYBY = { w2_crow: 1, w6_eagle: 1, w5_bat: 1, w9_dove: 1, w8_phoenix: 1 };
  function flyby(t, p, w) {
    const f = p._fly || (p._fly = { next: t + 2 + Math.random() * 12, left: 0 });
    if (f.t0 == null) {
      if (t < f.next) return null;
      f.left = 1;   // один пролёт, без разворота
      f.t0 = t; f.dir = Math.random() < 0.5 ? 1 : -1;
      f.y = Math.max(w, Math.min(WORLD_H - w, cam.y + cam.vh * (0.12 + Math.random() * 0.45)));
      f.sp = WORLD_W * (0.075 + Math.random() * 0.03); f.ph = Math.random() * 6;
    }
    const run = (t - f.t0) * f.sp, len = WORLD_W + w * 3;
    if (run > len) { f.t0 = null; f.left--; f.next = f.left > 0 ? t + 1 + Math.random() * 2 : t + 20 + Math.random() * 20; if (!f.left) f.dir = 0; return null; }
    return { x: f.dir > 0 ? -w * 1.5 + run : WORLD_W + w * 1.5 - run, y: f.y + Math.sin(run / 260 + f.ph) * w * 0.5, flip: f.dir < 0 };
  }
  // проход по своей линии через всю арену (страж, селянин, призраки, кит, скат): из-за края — за край, потом пауза 20–40 с
  function cross(t, p, w) {
    const c = p._cr || (p._cr = { next: t + Math.random() * 10 });
    const [dx, dy, T] = p.move, lx = dx * WORLD_W, ly = dy * WORLD_H, len = Math.hypot(lx, ly) || 1;
    if (c.t0 == null) { if (t < c.next) return null; c.t0 = t; c.dir = Math.random() < 0.5 ? 1 : -1; }
    const ux = lx / len * c.dir, uy = ly / len * c.dir, m = w * 1.5, X0 = p.x * WORLD_W, Y0 = p.y * WORLD_H;
    const a = (-m - X0) / ux, b = (WORLD_W + m - X0) / ux, s0 = Math.min(a, b), s1 = Math.max(a, b);   // где линия входит на арену и где выходит
    const v = Math.max(2 * len / T, WORLD_W / 45), s = s0 + (t - c.t0) * v;
    if (s > s1) { c.t0 = null; c.next = t + 20 + Math.random() * 20; return null; }
    return { x: X0 + ux * s, y: Math.max(w, Math.min(WORLD_H, Y0 + uy * s)), flip: ux < 0 };
  }
  function each(t, top) {
    const M = on(); if (!M) return;
    for (const id in M) {
      const d = LOCFX.defs[id]; if (!d) continue;
      for (const p of M[id]) {
        if (FLYBY[id]) {
          if (!top) continue;
          const w = p.w * WORLD_W, q = flyby(t, p, w);
          if (q && seen(q.x, q.y, w)) LFX.draw(ctx, id, t, q.x, q.y, w, { a: 'c', al: p.al, ph: p.ph, flip: q.flip });
          continue;
        }
        const flying = p.move && p.a === 'c';
        if (!!top !== (flying || d.blend === 'lighter')) continue;   // свечение и летуны — поверх героев
        const w = p.w * WORLD_W; let x = p.x * WORLD_W, y = p.y * WORLD_H, flip = false;
        if (p.move) { const q = cross(t, p, w); if (!q) continue; x = q.x; y = q.y; flip = q.flip; }   // лицом по ходу (лист смотрит вправо)
        if (!seen(x, y, w)) continue;
        LFX.draw(ctx, id, t, x, y, w, { a: p.a, al: p.al, ph: p.ph, flip });
      }
    }
  }
  const _cg = combatGround, _co = combatOver;
  combatGround = function (t) { _cg(t); each(t, false); };
  combatOver = function (t) { _co(t); each(t, true); };
  // листы текущего мира — заранее
  const _aw = applyWorld;
  applyWorld = function (m) { _aw(m); const M = LOCFX.place[m]; if (M) for (const id in M) LFX.img(id); };
}

// ---------- выстрелы героев: у Ganfaul shot_g1, у Эйры shot_e1 ----------
// v124 (Создатель 27.11): выбор «Выстрел: 1 / 2 / 3» убран — у каждого героя один вид выстрела (первый). Листы shot_g2/g3, shot_e2/e3 больше не грузятся.
const SHOTS = {
  get() { return 1; },
  id() { return 'shot_' + (HERO_ID === 'archer' ? 'e' : 'g') + '1'; },
};
if (LFX) {
  const _ds = drawShot;
  drawShot = function (s) {
    if (s.own !== 'p' || s.bolt) return _ds(s);
    const id = SHOTS.id(), d = LOCFX.defs[id];
    if (!d || !LFX.img(id).ok) return _ds(s);
    const y = s.y - s.h, w = 100 * (s.sc || 1);
    ctx.save(); ctx.translate(s.x, y); ctx.rotate(Math.atan2(s.dy * YK, s.dx));
    if (s.pierce && typeof FX3 !== 'undefined' && FX3.trail && FX3.trail.ok) {   // пронзающая стрела Эйры: зелёный шлейф по полёту, остриё у наконечника
      const tl = 300 * (s.sc || 1), th = tl * FX3.trail.img.naturalHeight / FX3.trail.img.naturalWidth; ctx.drawImage(FX3.trail.img, w * 0.5 - tl, -th / 2, tl, th);
    }
    LFX.draw(ctx, id, performance.now() / 1000, 0, 0, w, { a: 'c' });
    ctx.restore();
  };
  { const pre = () => { for (const h of ['g', 'e']) if (LOCFX.defs['shot_' + h + '1']) LFX.img('shot_' + h + '1'); }; if (typeof LAZY !== 'undefined') LAZY.run(pre); else setTimeout(pre, 2000); }
}
