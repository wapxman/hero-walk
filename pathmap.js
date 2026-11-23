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
    6: [[0.72, 0.43], [0.55, 0.42], [0.38, 0.41]], 7: [[0.32, 0.29]], 8: [[0.52, 0.25]], 9: [[0.75, 0.20]], 10: [[0.93, 0.205], [0.955, 0.145]] };
  // за медальоном Бездны путь уходит к воронке: там три пункта 10-го мира (после волн 3, 6 и 9)
  const TAIL = [0.925, 0.075], TMAX = 9.75;
  // промежуточные пункты (v89): после волн 3, 6 и 9 каждого мира — арены 2, 3 и арена босса. Их можно выбирать, как медальоны.
  const STEPS = [0.25, 0.5, 0.75];
  const ARENA_NAMES = [['Казарменный двор', 'Тронный зал', 'Турнирная площадка'], ['Рыночная площадь', 'Сгоревшая часовня', 'Двор усадьбы'],
    ['Эльфийские арки', 'Корни великого древа', 'Змеиное логово'], ['Затонувшая деревня', 'Туманный погост', 'Трон Короля-Жаба'],
    ['Кристальная пещера', 'Кузнечный зал', 'Сердце горна'], ['Замёрзшее озеро', 'Ледяная пещера', 'Двор ледяного дворца'],
    ['Разбитый собор', 'Зеркальный сад', 'Круг зеркал'], ['Лавовые поля', 'Обсидиановый храм', 'Край кратера'],
    ['Облачные сады', 'Золотая библиотека', 'Алтарь суда'], ['Парящий остров', 'Собор Бездны', 'Сердце Бездны']];
  const WV = typeof BAL !== 'undefined' ? BAL.WAVES : 10;
  // кто ждёт в части мира, которая начинается с пункта j (0..2): мини-босс волны 6 или 9, после третьего пункта — босс мира
  function foeOf(c, j) {
    if (typeof ROSTER === 'undefined' || !ROSTER[c]) return '';
    const k = KIND[j < 2 ? miniOf(ROSTER[c], (j + 2) * 3) : ROSTER[c].boss];
    return k ? (Array.isArray(k.nm) ? k.nm[0] : k.nm) : '';
  }
  const NAMES = ['Королевский замок', 'Горящая деревня', 'Осенний лес', 'Проклятое болото', 'Гномьи шахты', 'Ледяные вершины',
    'Руины Зеркального города', 'Огненный вулкан', 'Небесный храм', 'Бездна'];
  // где на карте живёт фон: лава (8), снег (6), искры Бездны (10), туман болота (4), блики воды
  const AMB = { lava: [0.35, 0.14], snow: [0.82, 0.31], abyss: [0.89, 0.11], fog: [0.53, 0.58], water: [0.78, 0.82] };

  let cv, cx, st = null, raf = 0, last = 0, BTN = null;
  function goBtn() {
    if (!BTN || !st) return; BTN.style.display = st.select ? 'flex' : 'none'; if (!st.select) return;
    // с какой волны мира начнётся бой: выбранный пункт — 4, 7 или 10; медальон — 1; место остановки — следующая после пройденных
    const j = st.selJ, hw = st.select.wave;
    const W = st.selW == null && hw != null && typeof BAL !== 'undefined' ? BAL.at(hw + 1).W : j == null ? 1 : (j + 1) * 3 + 1, ai = W >= 10 ? 2 : Math.floor((W - 1) / 3) - 1;
    BTN.innerHTML = 'Продолжить<div style="font:2vh Georgia,serif;opacity:.9">Глава ' + st.cur + (W > 1 ? ' · волна ' + W : '') + ': ' + (ai >= 0 ? ARENA_NAMES[st.cur - 1][ai] : NAMES[st.cur - 1]) + '</div>';
  }
  const parts = [], clouds = [];
  // ---- путь: сглаженная кривая через узлы и изгибы, разбита на точки с отметкой «t» ----
  let PTS = null;
  function buildPath() {
    const key = [];
    for (let c = 1; c <= 10; c++) { key.push({ p: NODES[c - 1], t: c - 1 }); for (const b of (BENDS[c] || [])) key.push({ p: b, t: null }); }
    key.push({ p: TAIL, t: TMAX });
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
    PTS.push({ x: key[key.length - 1].p[0], y: key[key.length - 1].p[1], t: TMAX });
  }
  function at(t) {
    if (!PTS) buildPath();
    t = Math.max(0, Math.min(TMAX, t));
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
      // ближайшее под пальцем: медальон главы или промежуточный пункт (после волн 3, 6, 9)
      let pick = null, bd = 1e9;
      for (let c = 1; c <= 10; c++) {
        const [fx, fy] = NODES[c - 1], d = Math.hypot(g.X(fx) - p.x, g.Y(fy) - p.y);
        if (d < 52 * u * Math.sqrt(cam.z) && d < bd) { bd = d; pick = { c, j: null, t: c - 1, open: c <= st.select.open }; }
        for (let j = 0; j < 3; j++) {
          const t = c - 1 + STEPS[j], q = at(t), d2 = Math.hypot(g.X(q.x) - p.x, g.Y(q.y) - p.y);
          if (d2 < 26 * u * Math.sqrt(cam.z) && d2 < bd) { bd = d2; pick = { c, j, t, open: t <= st.select.openT + 1e-3 }; }
        }
      }
      if (!pick) return;
      if (!pick.open) { st.lockedTap = 1; st.lockedPt = pick.j != null; return; }
      // место, где игрок остановился, — продолжить оттуда (волна не сбрасывается); любое другое — с начала этой части мира
      const home = Math.abs(pick.t - st.t1) < 1e-3, to = pick.t;
      st.anim = { from: st.tok, to, at: st.age, dur: Math.min(2.2, 0.5 + 0.35 * Math.abs(to - st.tok)) };
      st.cur = pick.c; st.selJ = pick.j; st.selW = home ? null : (pick.c - 1) * WV + (pick.j == null ? 0 : (pick.j + 1) * 3);
      st.flash = 0.7; if (typeof snd === 'function') snd('coins', 0.3, 1.3); goBtn();
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
    BTN.style.cssText = 'position:fixed;right:calc(3vh + var(--sar));bottom:3vh;z-index:61;display:none;min-width:42vh;height:11vh;padding:0 4vh;' +
      'background:url(ui/h_button.webp' + V0 + ') center/100% 100% no-repeat;align-items:center;justify-content:center;flex-direction:column;' +
      'font:bold 3.2vh Georgia,serif;color:#ffe9a8;text-shadow:0 .3vh .6vh #000;cursor:pointer;animation:shPulse 1.6s ease-in-out infinite';
    document.body.appendChild(BTN);
    for (const ev of ['touchstart', 'mousedown']) BTN.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    BTN.addEventListener('pointerdown', e => { e.stopPropagation(); if (st && st.select) { st.picked = st.cur; st.skip = true; BTN.style.display = 'none'; } });
    // облака и туман над картой убраны (v97, по просьбе Создателя); дым горящей деревни — mapfx.js — остался
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = cv.width = Math.round(innerWidth * DPR); H = cv.height = Math.round(innerHeight * DPR);
  }
  function preload() { ['map', 'laurel', 'check', 'lock', 'ribbon', 'token', 'spark'].forEach(im); for (let i = 1; i <= 10; i++) im('m' + i); }

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
    // путь: тусклые точки по всему маршруту
    if (!PTS) buildPath();
    cx.fillStyle = 'rgba(255,236,190,0.55)';
    for (let i = 0; i < PTS.length; i += 3) { const p = PTS[i]; cx.beginPath(); cx.arc(g.X(p.x), g.Y(p.y), 2.6 * u, 0, 6.283); cx.fill(); }
    // промежуточные пункты главы: после волн 3, 6 и 9 (четверть, половина, три четверти пути к следующему медальону)
    const litNow = st.select ? Math.max(st.select.litT, st.t) : st.t, rr = 10 * u * Math.sqrt(cam.z);
    const lkI = im('lock');
    for (let c = 0; c < 10; c++) for (let j = 0; j < 3; j++) {
      const f = STEPS[j], tt = c + f, p = at(tt), X = g.X(p.x), Y = g.Y(p.y), on = tt <= litNow + 1e-3;
      const shut = st.select && tt > st.select.openT + 1e-3, sel = st.select && st.cur === c + 1 && st.selJ === j;
      if (sel) { cx.save(); cx.globalCompositeOperation = 'lighter'; glow(X, Y, rr * (5 + 0.6 * Math.sin(T * 4)), '255,210,110', 0.6 + 0.2 * Math.sin(T * 4)); cx.restore(); }
      cx.beginPath(); cx.arc(X, Y, rr * 1.35, 0, 6.283); cx.fillStyle = 'rgba(30,20,10,0.75)'; cx.fill();
      cx.beginPath(); cx.arc(X, Y, rr, 0, 6.283); cx.fillStyle = on ? '#ffcf5a' : '#7c776c'; cx.fill();
      if (on) { cx.save(); cx.globalCompositeOperation = 'lighter'; glow(X, Y, rr * 3, '255,200,90', 0.5); cx.restore(); }
      // имя мини-босса этой точки (волны 3, 6, 9) — на карте выбора, когда она приближена
      if (shut && ok(lkI)) { const w = rr * 2.1; cx.drawImage(lkI, X - w / 2, Y - w * 0.55, w, w * lkI.naturalHeight / lkI.naturalWidth); }   // сюда ещё не доходил
      // подпись пункта на карте выбора, когда она приближена: арена этой части мира и кто в ней ждёт (мини-босс или босс)
      if (st.select && cam.z >= 1.5) {
        const fs = Math.round(9 * u * Math.sqrt(cam.z)), foe = foeOf(c + 1, j);
        cx.save(); cx.textAlign = 'center'; cx.lineWidth = 3 * u; cx.strokeStyle = 'rgba(20,12,4,0.9)';
        cx.font = 'bold ' + fs + 'px Georgia, serif'; cx.fillStyle = shut ? '#b5ae9f' : '#ffe9a8';
        cx.strokeText(ARENA_NAMES[c][j], X, Y + rr * 3.1); cx.fillText(ARENA_NAMES[c][j], X, Y + rr * 3.1);
        if (foe) { cx.font = Math.round(fs * 0.88) + 'px Georgia, serif'; cx.fillStyle = shut ? '#9a9486' : '#f1d9b0'; cx.strokeText(foe, X, Y + rr * 3.1 + fs * 1.15); cx.fillText(foe, X, Y + rr * 3.1 + fs * 1.15); }
        cx.restore();
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
    // искры плывут по пройденному пути (v97: медленно и без мигания — раньше пробегали весь путь за 2 с и мерцали 9 раз в секунду)
    const sp = im('spark');
    if (lit > 0.02 && ok(sp)) {
      const n = Math.max(2, Math.min(5, Math.round(lit * 0.7))); cx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < n; k++) {
        const q = (T * 0.1 / Math.max(1, lit) + k / n) % 1, p = at(q * lit), s = (9 + 1.2 * Math.sin(T * 1.3 + k * 2)) * u;
        cx.globalAlpha = 0.85 * Math.min(1, q * 10, (1 - q) * 10); cx.drawImage(sp, g.X(p.x) - s, g.Y(p.y) - s, s * 2, s * 2);
      }
      cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
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
    const sub = st.select ? (st.lockedTap > 0 ? (st.lockedPt ? 'это место ещё закрыто — сначала дойди до него в бою' : 'эта глава ещё закрыта — пройди предыдущие') : 'тяни карту, приближай пальцами; коснись главы или точки на пути, чтобы начать оттуда') : st.skipHint ? 'коснись, чтобы продолжить' : '';
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
    if ((st.age >= P.total || st.skip) && !(st.out > 0)) { st.out = 0.0001; if (st.select && st.picked && typeof ARENA_COVER !== 'undefined') ARENA_COVER.on();   // карта гаснет в чёрное, а не в старую арену
      if (st.onMid) { const f = st.onMid; st.onMid = null; f(); } }
    if (st.out > 0) { st.out += dt; if (st.out >= 0.4) return finish(); }
    draw(dt);
    raf = requestAnimationFrame(tick);
  }
  function finish() {
    cancelAnimationFrame(raf); cv.style.display = 'none';
    if (BTN) BTN.style.display = 'none';
    if (typeof SHOP !== 'undefined') SHOP.paused = !!st.wasPaused;
    const f = st.onDone, pk = st.onPick, c = st.picked, w = st.selW; st = null; PATHMAP.on = false; if (pk && c) pk(c, w); if (f) f(); if (typeof ARENA_COVER !== 'undefined') ARENA_COVER.settle();   // w — сколько волн считать пройденными; null — продолжить с места остановки
  }
  return {
    on: false, NAMES, NODES, ARENA_NAMES, TMAX, at, ground: [], sky: [],
    scr(t) { const g = geo(), p = at(t); return [g.X(p.x) / DPR, g.Y(p.y) / DPR]; },   // где точка пути на экране (для проверок)
    preload,
    // для проверок (tools/wave100_check.py): выбрать на открытой карте главу c (j — пункт после волн 3, 6, 9: 0, 1, 2) — то же, что касание точки
    pickAt(c, j) {
      if (!st || !st.select) return false;
      const t = c - 1 + (j == null ? 0 : STEPS[j]); if (j == null ? c > st.select.open : t > st.select.openT + 1e-3) return false;
      const home = Math.abs(t - st.t1) < 1e-3;
      st.anim = { from: st.tok, to: t, at: st.age, dur: 0.5 }; st.cur = c; st.selJ = j == null ? null : j; st.selW = home ? null : (c - 1) * WV + (j == null ? 0 : (j + 1) * 3); goBtn();
      return true;
    },
    show(o) {
      if (!cv) mk();
      // карта уже открыта (выбор главы поверх перехода между мирами) — не запоминать «пауза» от прошлого показа и не плодить второй цикл
      const prevPaused = st ? st.wasPaused : null; if (st) cancelAnimationFrame(raf);
      preload(); resize();
      const full = o.mode === 'full';
      const t0 = Math.max(0, Math.min(TMAX, o.t0)), t1 = Math.max(0, Math.min(TMAX, o.t1));
      st = { t0, t1, t: t0, tok: t0, age: 0, rib: 0, flash: 0, out: 0, cur: Math.floor(t0 + 1e-6) + 1, newCur: Math.floor(t1 + 1e-6) + 1,
        select: o.mode === 'select' ? { wave: o.wave, best: o.best || 0, open: o.open || 1, litT: o.litT == null ? t1 : o.litT, openT: Math.max(t1, o.openT == null ? (o.litT == null ? t1 : o.litT) : o.openT) } : null,
        selW: null, selJ: null,
        anim: { from: o.from == null ? t1 : o.from, to: t1, at: 0.4, dur: Math.min(2.4, 0.6 + 0.8 * Math.abs(t1 - (o.from == null ? t1 : o.from))) },
        onMid: o.onMid, onDone: o.onDone, onPick: o.onPick, plan: o.mode === 'select' ? { runAt: 0.3, runDur: 1.0, total: 1e9 } : full ? { full: true, runAt: 0.7, runDur: 1.8, total: 5.6 } : { runAt: 0.45, runDur: 1.1, total: o.mode === 'return' ? 2.2 : 2.6 } };
      if (!full) st.cur = st.newCur = Math.min(10, Math.floor(t1 + 1e-6) + 1);
      st.homeC = st.cur;
      if (st.select) { const fr = t1 - Math.floor(t1 + 1e-6), j = STEPS.findIndex(x => Math.abs(x - fr) < 1e-3); st.selJ = j < 0 ? null : j; }   // фишка стоит на промежуточном пункте — он и выбран
      cam = { z: 1, fx: 0.5, fy: 0.5 }; parts.length = 0;
      if (o.mode === 'select') { const p = at(st.anim.from), q = at(t1); cam = { z: 2.2, fx: (p.x + q.x) / 2, fy: (p.y + q.y) / 2 }; }
      cv.style.display = 'block'; PATHMAP.on = true; last = performance.now(); goBtn();
      // пока открыта карта, герой не ходит и не колдует (клавиши и кнопки не доходят до боя)
      if (typeof SHOP !== 'undefined') { st.wasPaused = prevPaused != null ? prevPaused : (SHOP.paused && !(typeof ARENA_COVER !== 'undefined' && ARENA_COVER.held)); SHOP.paused = true;   /* v104: пауза затемнения арены — не пауза игрока (после Междумирья игра оставалась на паузе) */ } held.key = held.touch = held.mouse = false;
      raf = requestAnimationFrame(tick);
    },
    // положение на пути по сквозному номеру волны: глава мира и доля пройденных раундов
    tOf(wv) { const a = BAL.at(Math.max(1, wv)); const done = a.W >= 10 ? 1 : Math.floor(a.W / 3) / 4; return Math.min(TMAX, a.M - 1 + done * 0.999); },
  };
})();
// картинки карты — заранее, чтобы первый показ не появлялся по частям
setTimeout(() => PATHMAP.preload(), 2500);
