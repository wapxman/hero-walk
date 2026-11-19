// Междумирье (ночь 19.11, DESIGN.md п.5): куда свет уносит погибшего героя.
// Смерть: время замедляется, мир выцветает, сверху опускается столп света, герой растворяется в нём — вспышка — и он
// стоит у голубого костра посреди парящей площади. Это настоящая сцена, по ней герой ходит:
//   кузница (слева) — прокачка способностей за золото (навсегда), шатёр Хранителя Перепутья (справа) — лавка предметов и
//   фласок, святилище с зеркалом (слева вверху) — продажа предметов, лестница к порталу (вверху) — назад в мир, к началу
//   текущей волны (или боя с боссом); перед этим коротко показывается карта «Путь героев».
// Картинки — ChatGPT (limbo/): фон площади, кадры голубого пламени, столп света, кольцо душ, Хранитель, призраки.
// Пламя, призраки, свет и искры оживляет игра. В онлайне — своя версия на сервере (у каждого игрока своё Междумирье).
'use strict';
const LIMBO = (() => {
  const IM = {};
  const im = n => { if (!IM[n]) { const i = new Image(); i.src = 'limbo/' + n + '.webp' + V; IM[n] = i; } return IM[n]; };
  const ok = i => i && i.complete && i.naturalWidth > 0;
  // всё в долях картинки фона (подогнано под нарисованную площадь)
  const L = {
    size: [1536, 1024],
    plaza: { c: [0.5, 0.57], r: [0.44, 0.38] },       // ходить можно внутри эллипса площади
    fire: [0.502, 0.48],
    st: {   // места: где стоят, радиус срабатывания (в долях ширины), что открывают
      forge: { p: [0.22, 0.6], R: 0.07, nm: 'Кузница', hint: 'прокачка способностей' },
      shop: { p: [0.81, 0.6], R: 0.07, nm: 'Хранитель Перепутья', hint: 'фласки и предметы' },
      mirror: { p: [0.25, 0.3], R: 0.065, nm: 'Святилище зеркала', hint: 'продажа предметов' },
      portal: { p: [0.53, 0.22], R: 0.06, nm: 'Портал', hint: 'назад в мир' },
    },
    solid: [[0.502, 0.48, 0.055, 0.045], [0.12, 0.56, 0.08, 0.09], [0.9, 0.56, 0.07, 0.1], [0.19, 0.18, 0.1, 0.06]],
    keeper: [0.86, 0.6], mourn: [0.22, 0.25],
    stairs: [[0.53, 0.22], [0.53, 0.08]],             // по ним бредут призраки к порталу
  };
  const S = { on: false, phase: '', t: 0, from: 0, back: null, near: null, opened: null, ghosts: [], parts: [], fl: 0 };
  const W2 = () => L.size[0] * AK, H2 = () => L.size[1] * AK;
  const X = f => f * W2(), Y = f => f * H2();

  // ---------- кузница: прокачка способностей за золото (навсегда, сохраняется с прогрессом) ----------
  const FORGE_MAX = 5;
  const forgeLv = id => (P.forge && P.forge[id]) || 0;
  const forgeCost = id => Math.round(380 * Math.pow(1.85, forgeLv(id)) * (id === 'r' ? 1.4 : 1));
  function forgeBuy(id) {
    const c = forgeCost(id);
    if (forgeLv(id) >= FORGE_MAX || SHOP.gold < c) { snd('hero_shot', 0.2, 0.6); return; }
    SHOP.gold -= c; P.forge = P.forge || {}; P.forge[id] = forgeLv(id) + 1;
    snd('coins', 0.6, 0.8); burst(X(L.st.forge.p[0]), Y(L.st.forge.p[1]) - 40, 30, '255,170,60');
    if (typeof progSave === 'function') progSave();
    SHOP.refresh(); forgeUI();
  }

  // ---------- переход: смерть → столп света → Междумирье ----------
  // вызывается вместо возрождения на месте (combat.js), пока P.dead идёт от 3 к 0
  function deathFx(dt) {
    const k = 1 - Math.max(0, P.dead) / 2.2;   // 0 → 1 за время смерти
    const c = document.getElementById('c');
    if (c) c.style.filter = 'grayscale(' + Math.min(1, k * 1.6).toFixed(2) + ') brightness(' + (1 + Math.max(0, k - 0.75) * 3).toFixed(2) + ')';
    if (Math.random() < dt * 30 * k) S.parts.push({ x: P.x + rnd(-30, 30), y: P.y - rnd(0, CH * HS()), vx: rnd(-10, 10), vy: -rnd(60, 140), t: 0, life: 1.2, col: '255,240,190', w: 1 });
  }
  function enter() {
    const c = document.getElementById('c'); if (c) c.style.filter = '';
    flash(1);
    S.on = true; S.t = 0; S.from = WORLD; S.wave = wave; S.near = null; S.opened = null; S.online = !!(window.NETC && NETC.on); S.phase0 = SHOP.phase;
    // поле боя очищается: враги, снаряды, зоны, очередь волны (в онлайне бой идёт на сервере — его не трогаем)
    enemies.length = 0; shots.length = 0; fx.length = 0; if (typeof zones !== 'undefined') zones.length = 0; if (typeof SPELL_FX !== 'undefined') SPELL_FX.length = 0;
    if (!S.online) { ROUND.queue.length = 0; ROUND.endW = wave; ROUND.fin = null; }
    SHOP.drops.length = 0; SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.open = false;
    // карта Междумирья: эллипс площади, препятствия у мест
    WALK.length = 0; SOLID.length = 0; SPAWNS.length = 0; OBJ.length = 0;
    const pc = L.plaza;
    for (let i = 0; i < 40; i++) { const a = i / 40 * 6.283; WALK.push([X(pc.c[0] + Math.cos(a) * pc.r[0]), Y(pc.c[1] + Math.sin(a) * pc.r[1])]); }
    // проход к лестнице портала
    for (const s of L.solid) SOLID.push({ x: X(s[0]), y: Y(s[1]), rx: X(s[2]), ry: Y(s[3]) });
    WORLD_W = W2(); WORLD_H = H2(); NAV.build();
    const g = im('bg'); if (ok(g)) img.ground = g; else g.onload = () => { if (S.on) img.ground = g; };
    curGround = 'limbo';
    P.dead = 0; P.hp = P.maxHp; P.mp = P.maxMp; P.x = X(L.fire[0]); P.y = Y(L.fire[1]) + 150; collide(P); cam.ready = false;
    P.slowT = 0; P.ult = 0;
    S.ghosts = [];
    for (let i = 0; i < 4; i++) S.ghosts.push({ k: 1 + (i % 2), u: i / 4, sp: 0.045 + Math.random() * 0.02 });
    say(P.x, P.y - CH * HS() * 1.5, 'Междумирье', '#bfe6ff');
    banner('Междумирье', 'смерть — не конец: прокачайся и вернись через портал');
    snd('wave_horn', 0.5, 0.6);
    SHOP.refresh();
  }
  function leave() {
    if (!S.on) return;
    closeAll();
    const back = () => {
      S.on = false; if (SHOP.el && SHOP.el.wave) SHOP.el.wave.style.visibility = '';
      curGround = null; applyWorld(S.from);
      if (S.online) { SHOP.phase = S.phase0; P.dead = 0; NETC.limboBack(); flash(0.8); SHOP.refresh(); return; }   // в онлайне возрождает сервер
      // к началу текущей волны: враги заново, раунд продолжается с этой волны
      wave = Math.max(0, S.wave - 1); SHOP.roundFrom = Math.min(SHOP.roundFrom || wave + 1, wave + 1);
      SHOP.phase = 'fight'; ROUND.endW = roundEnd(wave + 1); nextWave();
      P.hp = P.maxHp; P.mp = P.maxMp; flash(0.8);
      SHOP.refresh();
    };
    if (typeof PATHMAP !== 'undefined') { const t = PATHMAP.tOf(Math.max(1, S.wave - 1)); PATHMAP.show({ mode: 'return', t0: t, t1: t, onMid: back }); }
    else back();
  }

  // ---------- вспышка и надпись ----------
  let FL = null, BN = null;
  function flash(a) {
    if (!FL) { FL = document.createElement('div'); FL.style.cssText = 'position:fixed;inset:0;background:#fff;pointer-events:none;z-index:40;opacity:0;transition:opacity .9s'; document.body.appendChild(FL); }
    FL.style.transition = 'none'; FL.style.opacity = a; void FL.offsetWidth; FL.style.transition = 'opacity 1.1s'; FL.style.opacity = 0;
  }
  function banner(t1, t2) {
    if (!BN) { BN = document.createElement('div'); BN.style.cssText = 'position:fixed;left:0;right:0;top:22vh;text-align:center;pointer-events:none;z-index:30;color:#d8f0ff;font:bold 6vh Georgia,serif;text-shadow:0 0 2vh #5ab0ff,0 .3vh .6vh #000;opacity:0;transition:opacity .8s'; document.body.appendChild(BN); }
    BN.innerHTML = t1 + '<div style="font:2.4vh Georgia,serif;opacity:.85;margin-top:1vh">' + t2 + '</div>';
    BN.style.opacity = 1; clearTimeout(BN._t); BN._t = setTimeout(() => { BN.style.opacity = 0; }, 2800);
  }

  // ---------- места: подошёл — открылось ----------
  function closeAll() { if (SHOP.open) SHOP.closeShop(); if (FG) FG.style.display = 'none'; S.opened = null; }
  function openSt(id) {
    S.opened = id;
    if (id === 'forge') forgeUI(true);
    else if (id === 'shop') { SHOP.openShop(); say(P.x, P.y - CH * HS() * 1.3, 'Хранитель: «Чем помочь, странник?»', '#bfe6ff'); }
    else if (id === 'mirror') { SHOP.openShop(); say(P.x, P.y - CH * HS() * 1.3, 'Выбери предмет в сумке — зеркало заберёт его за золото', '#e6d6ff'); }
    else if (id === 'portal') leave();
  }
  function tick(dt) {
    if (!S.on) {
      const net = window.NETC && NETC.on;
      if (P.dead > 0 && !net) deathFx(dt);
      if (net && P.dead > 0 && NETC.coop && NETC.coop()) { S.dT = (S.dT || 0) + dt; P.dead = Math.max(0.01, 2.2 - S.dT); deathFx(dt); if (S.dT > 2.4) { S.dT = 0; enter(); } }
      else S.dT = 0;
      partsTick(dt); return;
    }
    S.t += dt; S.fl += dt;
    if (SHOP.el && SHOP.el.wave && SHOP.el.wave.style.visibility !== 'hidden') SHOP.el.wave.style.visibility = 'hidden';   // волны здесь нет
    // ближайшее место
    let near = null;
    for (const id in L.st) { const s = L.st[id]; if (Math.hypot(P.x - X(s.p[0]), (P.y - Y(s.p[1])) / 0.72) < X(s.R)) near = id; }
    if (near !== S.near) {
      if (S.opened && S.opened !== near) closeAll();
      S.near = near;
      if (near && S.t > 0.8) openSt(near);
    }
    if (S.opened === 'shop' || S.opened === 'mirror') { if (!SHOP.open) S.opened = 'x'; }
    // призраки бредут вверх по лестнице к порталу и тают в нём
    for (const g of S.ghosts) { g.u += g.sp * dt; if (g.u > 1) { g.u = 0; g.k = 1 + Math.floor(Math.random() * 2); } }
    // искры костра и душ
    if (Math.random() < dt * 14) S.parts.push({ x: X(L.fire[0]) + rnd(-20, 20), y: Y(L.fire[1]) - 30, vx: rnd(-12, 12), vy: -rnd(40, 90), t: 0, life: 1.4, col: '120,200,255' });
    if (Math.random() < dt * 5) { const p = L.st.portal.p; S.parts.push({ x: X(p[0]) + rnd(-60, 60), y: Y(p[1]) + rnd(-40, 20), vx: rnd(-8, 8), vy: -rnd(10, 30), t: 0, life: 2, col: '140,210,255' }); }
    partsTick(dt);
  }
  function partsTick(dt) {
    for (const p of S.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    for (let i = S.parts.length - 1; i >= 0; i--) if (S.parts[i].t > S.parts[i].life) S.parts.splice(i, 1);
  }
  function burst(x, y, n, col) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, v = rnd(40, 160); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7 - 40, t: 0, life: 0.9, col }); } }

  // ---------- рисование: под героем (земля) и поверх (свет) ----------
  function sprite(n, x, y, h, a, add) {
    const i = im(n); if (!ok(i)) return;
    const w = h * i.naturalWidth / i.naturalHeight;
    ctx.save(); ctx.globalAlpha = a; if (add) ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(i, x - w / 2, y - h, w, h); ctx.restore();
  }
  function ground(t) {
    if (!S.on) return;
    // кольцо душ вокруг костра
    const rg = im('ring');
    if (ok(rg)) { const w = 260; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; ctx.translate(X(L.fire[0]), Y(L.fire[1])); ctx.scale(1, 0.55); ctx.rotate(t * 0.6); ctx.drawImage(rg, -w / 2, -w / 2, w, w); ctx.restore(); }
    // Хранитель Перепутья у шатра и плакальщица у зеркала — покачиваются, мерцают
    sprite('keeper', X(L.keeper[0]), Y(L.keeper[1]) + Math.sin(t * 1.3) * 4, 230, 0.92);
    sprite('mourn', X(L.mourn[0]), Y(L.mourn[1]) + Math.sin(t * 0.9) * 5, 190, 0.55 + 0.15 * Math.sin(t * 2.1));
    // призраки на лестнице
    const [a, b] = L.stairs;
    for (const g of S.ghosts) {
      const x = X(a[0] + (b[0] - a[0]) * g.u) + Math.sin(g.u * 20 + g.k) * 14, y = Y(a[1] + (b[1] - a[1]) * g.u);
      const al = Math.min(1, g.u * 4, (1 - g.u) * 3) * 0.6;
      sprite('ghost' + g.k, x, y + Math.sin(t * 2 + g.u * 9) * 3, 150 * (1 - g.u * 0.35), al);
    }
  }
  function over(t) {
    // голубое пламя костра — кадры по кругу
    if (S.on) {
      const n = 1 + (Math.floor(t * 9) % 4), fx0 = X(L.fire[0]), fy0 = Y(L.fire[1]);
      sprite('flame' + n, fx0, fy0 + 10, 150 + 10 * Math.sin(t * 7), 0.95, true);
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.25 + 0.08 * Math.sin(t * 5);
      const gl = glowImg('90,170,255'); ctx.drawImage(gl, fx0 - 220, fy0 - 260, 440, 440); ctx.restore();
    }
    // столп света над умирающим героем
    if (!S.on && P.dead > 0 && !(window.NETC && NETC.on)) {
      const k = 1 - P.dead / 2.2, h = 1400, y = P.y + 30;
      const pl = im('pillar');
      if (ok(pl)) { const w = h * pl.naturalWidth / pl.naturalHeight * 1.2; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, k * 2); ctx.drawImage(pl, P.x - w / 2, y - h * Math.min(1, k * 1.6), w, h); ctx.restore(); }
    }
    // искры
    if (S.parts.length) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (const p of S.parts) { const a = 1 - p.t / p.life; ctx.globalAlpha = a; ctx.drawImage(glowImg(p.col), p.x - 8, p.y - 8, 16, 16); }
      ctx.restore();
    }
  }
  // подписи мест над ними (в экранных координатах рисует combatUI)
  function ui() {
    if (!S.on) return;
    ctx.save(); ctx.textAlign = 'center'; ctx.font = 'bold ' + Math.round(H * 0.028) + 'px Georgia, serif';
    for (const id in L.st) {
      const s = L.st[id], sx = (X(s.p[0]) - cam.x) * cam.z, sy = (Y(s.p[1]) - cam.y) * cam.z - H * 0.1;
      if (sx < -100 || sx > W + 100 || sy < -40 || sy > H + 40) continue;
      const on = S.near === id;
      ctx.globalAlpha = on ? 1 : 0.75; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = on ? '#fff3c4' : '#cfe6ff';
      ctx.strokeText(s.nm, sx, sy); ctx.fillText(s.nm, sx, sy);
      ctx.font = Math.round(H * 0.02) + 'px Georgia, serif'; ctx.strokeText(s.hint, sx, sy + H * 0.03); ctx.fillText(s.hint, sx, sy + H * 0.03);
      ctx.font = 'bold ' + Math.round(H * 0.028) + 'px Georgia, serif';
    }
    ctx.restore();
  }

  // ---------- окно кузницы ----------
  let FG = null;
  function forgeUI(show) {
    if (!FG) {
      FG = document.createElement('div'); FG.className = 'sh'; FG.id = 'forge';
      FG.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%);width:96vh;height:66vh;background:url(ui/panel.webp' + V + ') center/100% 100% no-repeat;z-index:8;display:none;font-size:2.3vh';
      document.body.appendChild(FG);
      for (const ev of ['touchstart', 'mousedown', 'pointerdown']) FG.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    }
    if (show) FG.style.display = 'block';
    if (FG.style.display === 'none') return;
    const H0 = HEROES[HERO_ID], ids = ['q', 'e', 'f', 'r'].filter(id => !(H0.cd[id] === 0 && HERO_ID === 'archer' && id === 'r'));
    let h = '<div style="position:absolute;top:7%;left:0;right:0;text-align:center;font:bold 3.6vh Georgia,serif;color:#ffe27a">Кузница — закалка способностей</div>' +
      '<div style="position:absolute;top:15%;left:0;right:0;text-align:center;opacity:.85">каждый уровень: урон +10 %, перезарядка −4 % · навсегда</div>' +
      '<div style="position:absolute;left:8%;right:8%;top:24%;display:flex;flex-direction:column;gap:2.2vh">';
    ids.forEach((id, i) => {
      const lv = forgeLv(id), c = forgeCost(id), max = lv >= FORGE_MAX, can = !max && SHOP.gold >= c;
      const ci = ['q', 'e', 'f', 'r'].indexOf(id) + 1, ic = 'background:url(' + H0.icons + V + ') ' + (ci % 3) * 50 + '% ' + Math.floor(ci / 3) * 100 + '%/300% 200% no-repeat';
      h += '<div style="display:flex;align-items:center;gap:2vh">' +
        '<div style="width:8vh;height:8vh;border-radius:1vh;' + ic + '"></div>' +
        '<div style="flex:1"><b>' + H0.skills[['q', 'e', 'f', 'r'].indexOf(id) + 1] + '</b><div style="opacity:.85">' + '★'.repeat(lv) + '☆'.repeat(FORGE_MAX - lv) + '</div></div>' +
        '<div data-b="' + id + '" class="tap" style="width:20vh;height:6.4vh;background:url(ui/btn_green.webp' + V + ') center/100% 100% no-repeat;display:flex;align-items:center;justify-content:center;font-weight:bold;color:#ffe27a;' + (can ? '' : 'filter:grayscale(1) brightness(.7)') + '">' +
        (max ? 'максимум' : c + ' золота') + '</div></div>';
    });
    h += '</div><div data-x="1" class="tap" style="position:absolute;right:2.5%;top:6%;width:6%;aspect-ratio:230/244;background:url(ui/close.webp' + V + ') center/100% 100% no-repeat"></div>';
    FG.innerHTML = h;
    FG.querySelectorAll('[data-b]').forEach(b => b.addEventListener('pointerdown', e => { e.stopPropagation(); forgeBuy(b.dataset.b); }));
    FG.querySelector('[data-x]').addEventListener('pointerdown', e => { e.stopPropagation(); FG.style.display = 'none'; });
  }

  ['bg', 'flame1', 'flame2', 'flame3', 'flame4', 'pillar', 'ring', 'keeper', 'ghost1', 'ghost2', 'mourn'].forEach(n => setTimeout(() => im(n), 3000));
  return { S, L, enter, leave, tick, ground, over, ui, forgeLv, get on() { return S.on; } };
})();

// закалка кузницы усиливает способности (combat.js: skDmg / skCd)
const _skDmgBase = skDmg, _skCdBase = skCd;
skDmg = id => _skDmgBase(id) * (1 + 0.1 * LIMBO.forgeLv(id));
skCd = id => _skCdBase(id) * (1 - 0.04 * LIMBO.forgeLv(id));
// подключение к циклу игры
{
  const _cu = combatUpdate, _cg = combatGround, _co = combatOver, _ui = combatUI;
  combatUpdate = function (dt) {
    // во время смерти время замедляется
    const slow = P.dead > 0 && !LIMBO.on && !(window.NETC && NETC.on) ? 0.55 : 1;
    _cu(dt * slow); LIMBO.tick(dt);
  };
  combatGround = function (t) { _cg(t); LIMBO.ground(t); };
  combatOver = function (t) { _co(t); LIMBO.over(t); };
  combatUI = function () { _ui(); LIMBO.ui(); };
  // в Междумирье волну не начать — только через портал
  const _sw = SHOP.startWave;
  SHOP.startWave = function () { if (LIMBO.on) { say(P.x, P.y - CH * HS() * 1.3, 'Вернись в мир через портал', '#bfe6ff'); return; } _sw(); };
}
