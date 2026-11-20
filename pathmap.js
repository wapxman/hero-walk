// Карта «Путь героев» (ночь 19.11, DESIGN.md п.1): между раундами и мирами игрок видит, в какой он главе и куда идёт.
// Картинки — ChatGPT (ui/map/): чистая карта 10 областей, 10 медальонов глав, лавры, галочка, замок, лента, фишка героя,
// облака, искра. Путь, свет, свечение медальонов, искры, наезд камеры и живой фон рисует игра — так всё может загораться.
//   PATHMAP.show({ t0, t1, mode: 'short' | 'full' | 'return', onMid, onDone })
//   t — положение на пути: глава c (1..10) и доля прохождения f (0..1) → t = c - 1 + f (узел главы c — t = c - 1).
//   short — 2,5 с, свет доползает от t0 до t1; full — переход в новую главу 5,5 с: свет бежит к следующему медальону,
//   медальон вспыхивает, выезжает лента «Глава N: название», камера наезжает. Тап — пропустить.
'use strict';
const PATHMAP = (() => {
  const V0 = typeof V === 'string' ? V : '';
  const IMG = {};
  const im = n => { if (!IMG[n]) { const i = new Image(); i.src = 'ui/map/' + n + '.webp' + V0; IMG[n] = i; } return IMG[n]; };
  const ok = i => i && i.complete && i.naturalWidth > 0;
  // узлы глав в долях картинки карты (выставлены по нарисованной карте) и названия глав
  const NODES = [[0.175, 0.83], [0.35, 0.85], [0.27, 0.62], [0.54, 0.65], [0.79, 0.67], [0.83, 0.40], [0.23, 0.35],
    [0.41, 0.26], [0.62, 0.22], [0.87, 0.21]];
  // промежуточные изгибы пути между главами (доли картинки): чтобы путь шёл по земле, а не напрямик
  const BENDS = { 1: [[0.27, 0.89]], 2: [[0.34, 0.73]], 3: [[0.42, 0.66]], 4: [[0.66, 0.71]], 5: [[0.87, 0.55]],
    6: [[0.72, 0.43], [0.55, 0.42], [0.38, 0.41]], 7: [[0.32, 0.29]], 8: [[0.52, 0.25]], 9: [[0.75, 0.20]] };
  const NAMES = ['Королевский замок', 'Горящая деревня', 'Осенний лес', 'Проклятое болото', 'Гномьи шахты', 'Ледяные вершины',
    'Руины Зеркального города', 'Огненный вулкан', 'Небесный храм', 'Бездна'];
  // где на карте живёт фон: лава (8), снег (6), искры Бездны (10), туман болота (4), блики воды
  const AMB = { lava: [0.35, 0.14], snow: [0.82, 0.31], abyss: [0.89, 0.11], fog: [0.53, 0.58], water: [0.78, 0.82] };

  let cv, cx, st = null, raf = 0, last = 0, BTN = null;
  function goBtn() { if (!BTN || !st) return; BTN.style.display = st.select ? 'flex' : 'none'; if (st.select) BTN.innerHTML = 'Продолжить<div style="font:2vh Georgia,serif;opacity:.9">Глава ' + st.cur + ': ' + NAMES[st.cur - 1] + '</div>'; }
  const parts = [], clouds = [];
  // ---- путь: сглаженная кривая через узлы и изгибы, разбита на точки с отметкой «t» ----
  let PTS = null;
  function buildPath() {
    const key = [];
    for (let c = 1; c <= 10; c++) { key.push({ p: NODES[c - 1], t: c - 1 }); for (const b of (BENDS[c] || [])) key.push({ p: b, t: null }); }
    // t изгибов — равномерно между соседними узлами
    for (let i = 0; i < key.length; i++) if (key[i].t == null) {
      let a = i; while (key[a].t == null) a--; let b = i; while (key[b].t == null) b++;
      key[i].t = key[a].t + (key[b].t - key[a].t) * (i - a) / (b - a);
    }
    PTS = [];
    for (let i = 0; i < key.length - 1; i++) {
      const p0 = key[Math.max(0, i - 1)].p, p1 = key[i].p, p2 = key[i + 1].p, p3 = key[Math.min(key.length - 1, i + 2)].p;
      for (let s = 0; s < 24; s++) {
        const u = s / 24, u2 = u * u, u3 = u2 * u;
        const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        PTS.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]), t: key[i].t + (key[i + 1].t - key[i].t) * u });
      }
    }
    PTS.push({ x: key[key.length - 1].p[0], y: key[key.length - 1].p[1], t: 9 });
  }
  function at(t) {
    if (!PTS) buildPath();
    t = Math.max(0, Math.min(9, t));
    for (let i = 1; i < PTS.length; i++) if (PTS[i].t >= t) {
      const a = PTS[i - 1], b = PTS[i], k = (t - a.t) / ((b.t - a.t) || 1);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, i };
    }
    return { x: PTS[PTS.length - 1].x, y: PTS[PTS.length - 1].y, i: PTS.length - 1 };
  }

  // ---- камера: карта «cover» на экран, наезд z на точку (fx, fy) ----
  let W = 0, H = 0, DPR = 1, cam = { z: 1, fx: 0.5, fy: 0.5 };
  function geo() {
    const m = im('map'), mw = ok(m) ? m.naturalWidth : 1920, mh = ok(m) ? m.naturalHeight : 1080;
    const s = Math.max(W / mw, H / mh) * cam.z, dw = mw * s, dh = mh * s;
    // точка фокуса — по возможности в центре экрана, но карта не уезжает за край
    let ox = W / 2 - cam.fx * dw, oy = H / 2 - cam.fy * dh;
    ox = Math.min(0, Math.max(W - dw, ox)); oy = Math.min(0, Math.max(H - dh, oy));
    return { s, dw, dh, ox, oy, X: fx => ox + fx * dw, Y: fy => oy + fy * dh };
  }

  function mk() {
    cv = document.createElement('canvas'); cv.id = 'pathmap';
    Object.assign(cv.style, { position: 'fixed', left: 0, top: 0, width: '100%', height: '100%', zIndex: 60, display: 'none', touchAction: 'none', background: '#0b0a10' });   // фон сразу — игра под картой не мелькает
    document.body.appendChild(cv); cx = cv.getContext('2d');
    // выбор главы: карту тянут пальцем, приближают щипком или колёсиком; тап по открытому медальону выбирает главу,
    // бой начинается кнопкой «Продолжить» (кнопка — отдельный элемент поверх карты). В показах — тап пропускает.
    const ptr = new Map(); let moved = 0, pinch = 0;
    const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * DPR, y: (e.clientY - r.top) * DPR }; };
    const settle = () => { const g = geo(); cam.fx = (W / 2 - g.ox) / g.dw; cam.fy = (H / 2 - g.oy) / g.dh; };   // фокус = что реально в центре
    const zoomAt = (k, px, py) => {
      const g0 = geo(), mx = (px - g0.ox) / g0.dw, my = (py - g0.oy) / g0.dh;
      cam.z = Math.max(1, Math.min(4, cam.z * k));
      const g1 = geo(); cam.fx += mx - (px - g1.ox) / g1.dw; cam.fy += my - (py - g1.oy) / g1.dh; settle();
    };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); if (!st) return;
      if (!st.select) { if (st.age > 0.35) st.skip = true; return; }
      ptr.set(e.pointerId, pos(e)); moved = 0; if (ptr.size === 2) { const [a, b] = [...ptr.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    });
    cv.addEventListener('pointermove', e => {
      if (!st || !st.select || !ptr.has(e.pointerId)) return;
      const p0 = ptr.get(e.pointerId), p1 = pos(e); ptr.set(e.pointerId, p1);
      if (ptr.size === 1) {
        const g = geo(); moved += Math.abs(p1.x - p0.x) + Math.abs(p1.y - p0.y);
        cam.fx -= (p1.x - p0.x) / g.dw; cam.fy -= (p1.y - p0.y) / g.dh; settle();
      } else if (ptr.size === 2) {
        const [a, b] = [...ptr.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2); pinch = d; moved = 99;
      }
      st.userCam = true;
    });
    const up = e => {
      if (!st || !st.select || !ptr.has(e.pointerId)) return;
      ptr.delete(e.pointerId); if (ptr.size < 2) pinch = 0;
      if (moved > 14 * DPR || ptr.size) return;
      const g = geo(), p = pos(e), u = Math.min(W, H) / 720;
      let pick = 0;
      for (let c = 1; c <= 10; c++) { const [fx, fy] = NODES[c - 1]; if (Math.hypot(g.X(fx) - p.x, g.Y(fy) - p.y) < 52 * u * Math.sqrt(cam.z)) pick = c; }
      if (!pick) return;
      if (pick > st.select.open) { st.lockedTap = 1; return; }
      const to = pick === st.homeC ? st.t1 : pick - 1;   // своя глава — к месту остановки, другая — к её медальону
      st.anim = { from: st.tok, to, at: st.age, dur: Math.min(2.2, 0.5 + 0.35 * Math.abs(to - st.tok)) };
      st.cur = pick; st.flash = 0.7; if (typeof snd === 'function') snd('coins', 0.3, 1.3); goBtn();
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    // клавиатура на карте не доходит до игры; Enter/пробел — «Продолжить»
    addEventListener('keydown', e => {
      if (!PATHMAP.on) return;
      if (/^F\d+$/.test(e.code) || e.ctrlKey || e.metaKey || e.altKey) return;   // F5, Ctrl+R и прочие клавиши браузера не глотаем
      e.stopImmediatePropagation(); e.preventDefault();
      if ((e.code === 'Enter' || e.code === 'Space') && st && st.select) { st.picked = st.cur; st.skip = true; BTN.style.display = 'none'; }
    }, true);
    cv.addEventListener('wheel', e => { if (!st || !st.select) return; e.preventDefault(); const p = pos(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y); st.userCam = true; }, { passive: false });
    // кнопка «Продолжить»
    BTN = document.createElement('div'); BTN.id = 'pmGo';
    BTN.style.cssText = 'position:fixed;right:calc(3vh + env(safe-area-inset-right));bottom:3vh;z-index:61;display:none;min-width:42vh;height:11vh;padding:0 4vh;' +
      'background:url(ui/h_button.webp' + V0 + ') center/100% 100% no-repeat;align-items:center;justify-content:center;flex-direction:column;' +
      'font:bold 3.2vh Georgia,serif;color:#ffe9a8;text-shadow:0 .3vh .6vh #000;cursor:pointer;animation:shPulse 1.6s ease-in-out infinite';
    document.body.appendChild(BTN);
    for (const ev of ['touchstart', 'mousedown']) BTN.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    BTN.addEventListener('pointerdown', e => { e.stopPropagation(); if (st && st.select) { st.picked = st.cur; st.skip = true; BTN.style.display = 'none'; } });
    for (let i = 0; i < 5; i++) clouds.push({ x: Math.random(), y: 0.08 + Math.random() * 0.8, s: 0.18 + Math.random() * 0.22, v: 0.006 + Math.random() * 0.01, k: i % 3 });
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR);
  }
  function preload() { ['map', 'laurel', 'check', 'lock', 'ribbon', 'token', 'cloud1', 'cloud2', 'cloud3', 'spark'].forEach(im); for (let i = 1; i <= 10; i++) im('m' + i); }

  const ease = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  function burst(fx, fy, n, col, sp) {
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = (0.3 + Math.random()) * (sp || 0.25); parts.push({ fx, fy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.05, t: 0, life: 0.7 + Math.random() * 0.8, col, sz: 0.5 + Math.random() }); }
  }
  function ambient(dt) {
    const r = Math.random;
    if (r() < dt * 7) parts.push({ fx: AMB.lava[0] + (r() - 0.5) * 0.12, fy: AMB.lava[1] + (r() - 0.3) * 0.08, vx: (r() - 0.5) * 0.01, vy: -0.03 - r() * 0.03, t: 0, life: 1.5 + r(), col: '255,140,40', sz: 0.6, amb: 1 });
    if (r() < dt * 9) parts.push({ fx: AMB.snow[0] + (r() - 0.5) * 0.16, fy: AMB.snow[1] - 0.1 + r() * 0.05, vx: 0.008 + r() * 0.01, vy: 0.025 + r() * 0.02, t: 0, life: 3, col: '255,255,255', sz: 0.45, amb: 1 });
    if (r() < dt * 8) { const a = r() * 6.283, d = 0.03 + r() * 0.05; parts.push({ fx: AMB.abyss[0] + Math.cos(a) * d, fy: AMB.abyss[1] + Math.sin(a) * d, vx: -Math.sin(a) * 0.04, vy: Math.cos(a) * 0.04, t: 0, life: 1.4, col: '190,120,255', sz: 0.6, amb: 1 }); }
    if (r() < dt * 4) parts.push({ fx: AMB.water[0] + (r() - 0.5) * 0.2, fy: AMB.water[1] + (r() - 0.5) * 0.1, vx: 0, vy: 0, t: 0, life: 0.9, col: '220,250,255', sz: 0.5, amb: 1, glint: 1 });
  }

  function draw(dt) {
    if (cv.width !== Math.round(innerWidth * DPR)) resize();
    const g = geo(), T = st.age, u = Math.min(W, H) / 720;
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = '#0b0a10'; cx.fillRect(0, 0, W, H);
    const m = im('map');
    if (ok(m)) cx.drawImage(m, g.ox, g.oy, g.dw, g.dh);
    for (const f of PATHMAP.ground) f(cx, g, T, u, dt);   // живые элементы на земле (mapfx.js)
    // лава дышит: тёплое свечение над вулканом
    cx.globalCompositeOperation = 'lighter';
    const lav = 0.18 + 0.12 * Math.sin(T * 3.1) + 0.06 * Math.sin(T * 7.3);
    glow(g.X(AMB.lava[0]), g.Y(AMB.lava[1]), 150 * u * cam.z, '255,90,20', lav);
    glow(g.X(AMB.abyss[0]), g.Y(AMB.abyss[1]), 130 * u * cam.z, '150,70,255', 0.2 + 0.1 * Math.sin(T * 2.2));
    cx.globalCompositeOperation = 'source-over';
    // туман над болотом
    const cl = im('cloud' + 1);
    if (ok(cl)) { cx.globalAlpha = 0.18 + 0.06 * Math.sin(T * 0.7); const w = g.dw * 0.22; cx.drawImage(cl, g.X(AMB.fog[0]) - w / 2 + Math.sin(T * 0.3) * 20 * u, g.Y(AMB.fog[1]) - w * 0.2, w, w * cl.naturalHeight / cl.naturalWidth); cx.globalAlpha = 1; }

    // путь: тусклые точки по всему маршруту
    if (!PTS) buildPath();
    cx.fillStyle = 'rgba(255,236,190,0.55)';
    for (let i = 0; i < PTS.length; i += 3) { const p = PTS[i]; cx.beginPath(); cx.arc(g.X(p.x), g.Y(p.y), 2.6 * u, 0, 6.283); cx.fill(); }
    // промежуточные пункты главы: после волн 3, 6 и 9 (четверть, половина, три четверти пути к следующему медальону)
    const litNow = st.select ? Math.max(st.select.litT, st.t) : st.t, rr = 10 * u * Math.sqrt(cam.z);
    for (let c = 0; c < 9; c++) for (const f of [0.25, 0.5, 0.75]) {
      const tt = c + f, p = at(tt), X = g.X(p.x), Y = g.Y(p.y), on = tt <= litNow + 1e-3;
      cx.beginPath(); cx.arc(X, Y, rr * 1.35, 0, 6.283); cx.fillStyle = 'rgba(30,20,10,0.75)'; cx.fill();
      cx.beginPath(); cx.arc(X, Y, rr, 0, 6.283); cx.fillStyle = on ? '#ffcf5a' : '#7c776c'; cx.fill();
      if (on) { cx.save(); cx.globalCompositeOperation = 'lighter'; glow(X, Y, rr * 3, '255,200,90', 0.5); cx.restore(); }
      // имя мини-босса этой точки (волны 3, 6, 9) — на карте выбора, когда она приближена
      if (st.select && cam.z >= 1.5 && typeof ROSTER !== 'undefined' && ROSTER[c + 1]) {
        const k = KIND[miniOf(ROSTER[c + 1], Math.round(f * 4) * 3)], nm = k && (Array.isArray(k.nm) ? k.nm[0] : k.nm);
        if (nm) { cx.save(); cx.font = 'bold ' + Math.round(9 * u * Math.sqrt(cam.z)) + 'px Georgia, serif'; cx.textAlign = 'center'; cx.lineWidth = 3 * u; cx.strokeStyle = 'rgba(20,12,4,0.9)'; cx.fillStyle = on ? '#ffe9a8' : '#cfc8b8';
          cx.strokeText(nm, X, Y + rr * 3.1); cx.fillText(nm, X, Y + rr * 3.1); cx.restore(); }
      }
    }
    // пройденная часть — золотая и светится
    const lit = st.select ? Math.max(st.select.litT, st.t) : st.t;
    cx.lineCap = 'round'; cx.lineJoin = 'round';
    for (const [w, a, blur] of [[16, 0.22, 22], [7, 0.9, 10], [2.5, 1, 0]]) {
      cx.beginPath(); let started = false;
      for (const p of PTS) { if (p.t > lit) break; const X = g.X(p.x), Y = g.Y(p.y); started ? cx.lineTo(X, Y) : cx.moveTo(X, Y); started = true; }
      const h = at(lit); if (started) cx.lineTo(g.X(h.x), g.Y(h.y));
      cx.strokeStyle = w > 3 ? 'rgba(255,196,64,' + a + ')' : 'rgba(255,250,215,1)'; cx.lineWidth = w * u; cx.shadowColor = 'rgba(255,170,40,0.9)'; cx.shadowBlur = blur * u;
      cx.stroke();
    }
    cx.shadowBlur = 0;
    // искры бегут по пройденному пути
    const sp = im('spark');
    if (lit > 0.02) for (let k = 0; k < 7; k++) {
      const tt = ((T * 0.55 + k / 7) % 1) * lit, p = at(tt), s = (10 + 6 * Math.sin(T * 9 + k)) * u;
      if (ok(sp)) { cx.globalCompositeOperation = 'lighter'; cx.drawImage(sp, g.X(p.x) - s, g.Y(p.y) - s, s * 2, s * 2); cx.globalCompositeOperation = 'source-over'; }
    }
    // голова света — яркая вспышка там, куда дошёл свет
    if (st.run) { const h = at(lit); cx.globalCompositeOperation = 'lighter'; glow(g.X(h.x), g.Y(h.y), 46 * u, '255,220,120', 0.9); if (ok(sp)) { const s = 30 * u * (1 + 0.2 * Math.sin(T * 20)); cx.drawImage(sp, g.X(h.x) - s, g.Y(h.y) - s, s * 2, s * 2); } cx.globalCompositeOperation = 'source-over'; }

    // медальоны
    const cur = st.cur;
    for (let c = 1; c <= 10; c++) {
      const [fx, fy] = NODES[c - 1], X = g.X(fx), Y = g.Y(fy), R = 34 * u * Math.sqrt(cam.z) * (c === cur ? 1.18 : 1);
      const done = st.select ? c <= st.select.best : c < cur, now = c === cur, open = st.select ? c <= st.select.open : now || done;
      if (now) {
        // ореол и лучи текущей главы
        cx.globalCompositeOperation = 'lighter';
        glow(X, Y, R * (2.3 + 0.25 * Math.sin(T * 4)), '255,200,90', 0.55 + 0.2 * Math.sin(T * 4));
        cx.save(); cx.translate(X, Y); cx.rotate(T * 0.4);
        for (let i = 0; i < 12; i++) { cx.rotate(6.283 / 12); const gr = cx.createLinearGradient(0, R * 0.8, 0, R * 2.6); gr.addColorStop(0, 'rgba(255,220,130,0.45)'); gr.addColorStop(1, 'rgba(255,220,130,0)'); cx.fillStyle = gr; cx.beginPath(); cx.moveTo(-R * 0.12, R * 0.8); cx.lineTo(R * 0.12, R * 0.8); cx.lineTo(0, R * 2.6); cx.fill(); }
        cx.restore(); cx.globalCompositeOperation = 'source-over';
        if (st.flash > 0) { cx.globalCompositeOperation = 'lighter'; glow(X, Y, R * (2 + 4 * (1 - st.flash)), '255,250,220', st.flash); cx.globalCompositeOperation = 'source-over'; }
      }
      const la = im('laurel');
      if (done && ok(la)) { const w = R * 3.1; cx.drawImage(la, X - w / 2, Y - w * 0.47, w, w * la.naturalHeight / la.naturalWidth); }
      const md = im('m' + c);
      if (ok(md)) {
        if (!open) cx.filter = 'grayscale(0.85) brightness(0.55)';
        cx.drawImage(md, X - R, Y - R, R * 2, R * 2); cx.filter = 'none';
      }
      if (done) { const ck = im('check'); if (ok(ck)) { const w = R * 0.95; cx.drawImage(ck, X + R * 0.25, Y + R * 0.2, w, w * ck.naturalHeight / ck.naturalWidth); } }
      if (!open) { const lk = im('lock'); if (ok(lk)) { const w = R * 0.85; cx.drawImage(lk, X + R * 0.3, Y + R * 0.15, w, w * lk.naturalHeight / lk.naturalWidth); } }
    }
    // фишка героя на пути (покачивается)
    const tk = im('token'), hp = at(st.tok);
    if (ok(tk)) { const h = 92 * u * Math.sqrt(cam.z), w = h * tk.naturalWidth / tk.naturalHeight, b = Math.abs(Math.sin(T * (st.run ? 9 : 2.4))) * (st.run ? 8 : 3) * u; const nd = Math.abs(st.tok - Math.round(st.tok)) < 0.12 ? 34 * u * Math.sqrt(cam.z) : 0; cx.drawImage(tk, g.X(hp.x) - w / 2 + nd, g.Y(hp.y) - h * 0.92 - b - nd * 0.3, w, h); }   // у медальона — чуть в стороне

    // частицы: салют, лава, снег, Бездна, блики
    cx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const k = 1 - p.t / p.life, X = g.X(p.fx), Y = g.Y(p.fy), s = (p.glint ? 6 * Math.sin(Math.PI * p.t / p.life) : 4 * p.sz * k + 1) * u;
      if (p.amb) { cx.fillStyle = 'rgba(' + p.col + ',' + (0.8 * Math.min(1, k * 2)) + ')'; cx.beginPath(); cx.arc(X, Y, s, 0, 6.283); cx.fill(); }
      else if (ok(sp)) { cx.globalAlpha = k; cx.drawImage(sp, X - s * 2.5, Y - s * 2.5, s * 5, s * 5); cx.globalAlpha = 1; }
    }
    cx.globalCompositeOperation = 'source-over';
    for (const f of PATHMAP.sky) f(cx, g, T, u, dt);   // летуны, дракон (mapfx.js)
    // облака плывут поверх карты
    for (const c of clouds) {
      const ci = im('cloud' + (c.k + 1)); if (!ok(ci)) continue;
      const w = g.dw * c.s, x = ((c.x + T * c.v) % 1.4 - 0.2) * W;
      cx.globalAlpha = 0.35; cx.drawImage(ci, x - w / 2, c.y * H, w, w * ci.naturalHeight / ci.naturalWidth); cx.globalAlpha = 1;
    }
    // виньетка по краям — фокус на карте
    const vg = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)'); cx.fillStyle = vg; cx.fillRect(0, 0, W, H);
    // заголовок и лента главы
    title(u);
    if (st.rib > 0) ribbon(u);
    // затемнение входа и выхода
    const fade = Math.max(0, 1 - st.age / 0.35, st.out > 0 ? 1 - st.out / 0.4 : 0);
    if (fade > 0) { cx.fillStyle = 'rgba(0,0,0,' + fade + ')'; cx.fillRect(0, 0, W, H); }
  }
  function glow(x, y, r, col, a) {
    const gr = cx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + col + ',' + a + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)');
    cx.fillStyle = gr; cx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function title(u) {
    cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '700 ' + Math.round(30 * u) + 'px Georgia, serif';
    cx.lineWidth = 6 * u; cx.strokeStyle = 'rgba(40,20,5,0.9)'; cx.fillStyle = '#ffd98a';
    if (!st.select) { cx.strokeText('ПУТЬ ГЕРОЕВ', W / 2, 34 * u); cx.fillText('ПУТЬ ГЕРОЕВ', W / 2, 34 * u); }
    cx.font = Math.round(15 * u) + 'px Georgia, serif'; cx.fillStyle = 'rgba(255,240,210,0.85)'; cx.lineWidth = 4 * u;
    const sub = st.select ? (st.lockedTap > 0 ? 'эта глава ещё закрыта — пройди предыдущие' : 'тяни карту, приближай пальцами; коснись главы, чтобы выбрать — пройденные можно переиграть') : st.skipHint ? 'коснись, чтобы продолжить' : '';
    if (sub) { cx.strokeText(sub, W / 2, H - 22 * u); cx.fillText(sub, W / 2, H - 22 * u); }
    cx.restore();
  }
  function ribbon(u) {
    const rb = im('ribbon'), k = ease(st.rib), w = Math.min(W * (st.select ? 0.42 : 0.62), (st.select ? 520 : 760) * u), h = ok(rb) ? w * rb.naturalHeight / rb.naturalWidth : 90 * u;
    // в выборе главы лента наверху, чтобы не закрывать медальоны внизу карты
    const y = st.select ? 34 * u + h * 0.62 - (1 - k) * H * 0.2 : H * 0.78 + (1 - k) * H * 0.3, x = W / 2;
    cx.save(); cx.globalAlpha = Math.min(1, st.rib * 2);
    if (ok(rb)) cx.drawImage(rb, x - w / 2, y - h / 2, w, h);
    cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.font = '700 ' + Math.round(Math.min(h * 0.3, 30 * u)) + 'px Georgia, serif';
    cx.lineWidth = 5 * u; cx.strokeStyle = 'rgba(50,15,5,0.95)'; cx.fillStyle = '#fff1c9';
    const s = 'Глава ' + st.cur + ': ' + NAMES[st.cur - 1];
    cx.strokeText(s, x, y - h * 0.04); cx.fillText(s, x, y - h * 0.04);
    cx.restore();
  }

  function tick(now) {
    if (!st) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now; st.age += dt;
    const P = st.plan;
    // ход света и фишки
    let k;
    if (st.select) {   // выбор главы: фишка плавно идёт к выбранной точке, путь горит до самой дальней пройденной
      const A = st.anim; k = ease((st.age - A.at) / A.dur); st.tok = A.from + (A.to - A.from) * k; st.t = st.tok; st.run = k > 0 && k < 1;
    } else { k = ease((st.age - P.runAt) / P.runDur); st.t = st.t0 + (st.t1 - st.t0) * k; st.tok = st.t; st.run = k > 0 && k < 1; }
    // вспышка медальона новой главы, лента, наезд камеры
    if (P.full && !st.flashed && k >= 1) {
      st.flashed = true; st.cur = st.newCur; st.flash = 1;
      const [fx, fy] = NODES[st.cur - 1]; burst(fx, fy, 70, '255,220,120', 0.22); burst(fx, fy, 30, '255,255,255', 0.12);
      if (typeof snd === 'function') snd('wave_horn', 0.8, 1.2);
      if (st.onMid) { const f = st.onMid; st.onMid = null; f(); }
    }
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 1.2);
    if (st.flashed || st.select) st.rib = Math.min(1, st.rib + dt * 1.8);
    if (st.lockedTap > 0) st.lockedTap -= dt * 0.4;
    if (P.full) {
      const zk = ease((st.age - P.runAt - P.runDur * 0.5) / 1.6), [fx, fy] = NODES[st.newCur - 1];
      cam.z = 1 + 0.35 * zk; cam.fx = 0.5 + (fx - 0.5) * zk; cam.fy = 0.5 + (fy - 0.5) * zk;
    } else if (st.select) {   // выбор главы: камера у игрока (тянуть и приближать)
    } else { const [fx, fy] = NODES[st.cur - 1]; cam.z = 1.12; cam.fx = 0.5 + (fx - 0.5) * 0.6; cam.fy = 0.5 + (fy - 0.5) * 0.6; }
    st.skipHint = st.age > 0.8;
    // частицы
    ambient(dt);
    for (const p of parts) { p.t += dt; p.fx += p.vx * dt; p.fy += p.vy * dt; if (!p.amb) p.vy += 0.12 * dt; }
    for (let i = parts.length - 1; i >= 0; i--) if (parts[i].t >= parts[i].life) parts.splice(i, 1);
    for (const c of clouds) if ((c.x + st.age * c.v) % 1.4 > 1.35) c.y = 0.08 + Math.random() * 0.8;
    // конец показа или пропуск
    if ((st.age >= P.total || st.skip) && !(st.out > 0)) { st.out = 0.0001; if (st.onMid) { const f = st.onMid; st.onMid = null; f(); } }
    if (st.out > 0) { st.out += dt; if (st.out >= 0.4) return finish(); }
    draw(dt);
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    cancelAnimationFrame(raf); cv.style.display = 'none';
    if (BTN) BTN.style.display = 'none';
    if (typeof SHOP !== 'undefined') SHOP.paused = !!st.wasPaused;
    const f = st.onDone, pk = st.onPick, c = st.picked; st = null; PATHMAP.on = false; if (pk && c) pk(c); if (f) f();
  }
  return {
    on: false, NAMES, NODES, ground: [], sky: [],
    preload,
    show(o) {
      if (!cv) mk();
      // карта уже открыта (выбор главы поверх перехода между мирами) — не запоминать «пауза» от прошлого показа и не плодить второй цикл
      const prevPaused = st ? st.wasPaused : null; if (st) cancelAnimationFrame(raf);
      preload(); resize();
      const full = o.mode === 'full';
      const t0 = Math.max(0, Math.min(9, o.t0)), t1 = Math.max(0, Math.min(9, o.t1));
      st = { t0, t1, t: t0, tok: t0, age: 0, rib: 0, flash: 0, out: 0, cur: Math.floor(t0 + 1e-6) + 1, newCur: Math.floor(t1 + 1e-6) + 1,
        select: o.mode === 'select' ? { best: o.best || 0, open: o.open || 1, litT: o.litT == null ? t1 : o.litT } : null,
        anim: { from: o.from == null ? t1 : o.from, to: t1, at: 0.4, dur: Math.min(2.4, 0.6 + 0.8 * Math.abs(t1 - (o.from == null ? t1 : o.from))) },
        onMid: o.onMid, onDone: o.onDone, onPick: o.onPick, plan: o.mode === 'select' ? { runAt: 0.3, runDur: 1.0, total: 1e9 } : full ? { full: true, runAt: 0.7, runDur: 1.8, total: 5.6 } : { runAt: 0.45, runDur: 1.1, total: o.mode === 'return' ? 2.2 : 2.6 } };
      if (!full) st.cur = st.newCur = Math.min(10, Math.floor(t1 + 1e-6) + 1);
      st.homeC = st.cur;
      cam = { z: 1, fx: 0.5, fy: 0.5 }; parts.length = 0;
      if (o.mode === 'select') { const p = at(st.anim.from), q = at(t1); cam = { z: 2.2, fx: (p.x + q.x) / 2, fy: (p.y + q.y) / 2 }; }
      cv.style.display = 'block'; PATHMAP.on = true; last = performance.now(); goBtn();
      // пока открыта карта, герой не ходит и не колдует (клавиши и кнопки не доходят до боя)
      if (typeof SHOP !== 'undefined') { st.wasPaused = prevPaused != null ? prevPaused : SHOP.paused; SHOP.paused = true; } held.key = held.touch = held.mouse = false;
      raf = requestAnimationFrame(tick);
    },
    // положение на пути по сквозному номеру волны: глава мира и доля пройденных раундов
    tOf(wv) { const a = BAL.at(Math.max(1, wv)); const done = a.W >= 10 ? 1 : Math.floor(a.W / 3) / 4; return Math.min(9, a.M - 1 + done * 0.999); },
  };
})();
// картинки карты — заранее, чтобы первый показ не появлялся по частям
setTimeout(() => PATHMAP.preload(), 2500);
