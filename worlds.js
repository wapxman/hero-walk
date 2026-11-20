// Миры: после победы над боссом 10-й волны герой переходит в следующий мир (данные — WORLDS в data.js).
// После 4-го мира — снова 1-й, но уже на следующем круге (враги сильнее, см. BAL).
// Карта меняется на месте: многоугольник проходимости, препятствия, входы врагов и картинка земли.
// Использует из index.html: img, OBJ, SOLID, cam, P, V; из data.js: WORLDS, WALK, SPAWNS, HERO_SPAWN, ENEMY_SPAWN, AK.
'use strict';

// мир 1 запоминаем как есть (его карту можно править в редакторе)
const W1 = { walk: WALK.map(p => p.slice()), obj: OBJ.slice(), solid: SOLID.slice(),
  spawns: SPAWNS.map(s => Object.assign({}, s)), hero: Object.assign({}, HERO_SPAWN), enemy: Object.assign({}, ENEMY_SPAWN) };
let WORLD = 1, curGround = GROUND;
const worldOf = n => BAL.at(n).M;   // какой мир у волны n

// затемнение на время загрузки арены (v97): чёрный слой над полем боя и интерфейсом боя, под меню. Пока он виден, бой стоит на паузе.
// on(src) — закрыть (src — картинка, которую ждём), off(src) — она пришла, settle() — закрывали заранее, а грузить нечего.
const ARENA_COVER = (() => {
  const el = document.createElement('div'); let wait = null, held = false, timer = 0;
  el.style.cssText = 'position:fixed;inset:0;background:#05080e;z-index:8;display:none;opacity:1;pointer-events:none;transition:opacity .35s';
  document.body.appendChild(el);
  const hold = () => { if (!held && !window.BOT && !(window.NETC && NETC.on) && typeof SHOP !== 'undefined' && !SHOP.paused) { SHOP.paused = true; held = true; } };   // бот автопрогона шагает игру сам — ему пауза не нужна
  function on(src) { if (src) wait = src; clearTimeout(timer); el.style.transition = 'none'; el.style.display = 'block'; el.style.opacity = '1'; if (src) hold();
    timer = setTimeout(() => off(wait), 8000); }   // картинка не пришла — не держим экран закрытым вечно
  function off(src) { if (src && wait && src !== wait) return; wait = null; clearTimeout(timer); if (held) { held = false; SHOP.paused = false; }
    void el.offsetWidth; el.style.transition = 'opacity .35s'; el.style.opacity = '0'; timer = setTimeout(() => { el.style.display = 'none'; }, 380); }
  return { on, off, settle() { if (!wait && el.style.display !== 'none' && el.style.opacity === '1') off(); }, get busy() { return !!wait; } };
})();
// арена части мира: картинка земли меняется, раскладка остаётся (ARENAS в data.js)
let ARENA_I = 0;
function setArena(m, i, quiet) {
  const w = WORLDS[m - 1], list = ARENAS[m] || [], src = i > 0 && list[i - 1] ? list[i - 1] : w.ground;
  ARENA_I = src === w.ground ? 0 : i;
  if (src !== curGround) {
    curGround = src;
    // пока новая картинка грузится, экран закрыт затемнением (ARENA_COVER) — старая арена не мелькает и не подменяется рывком
    const g = new Image(); ARENA_COVER.on(src);
    g.onload = () => { if (curGround === src) { img.ground = g; ARENA_COVER.off(src); } }; g.onerror = () => ARENA_COVER.off(src); g.src = src + V;
    if (!quiet) { P.x = HERO_SPAWN.x; P.y = HERO_SPAWN.y; collide(P); cam.ready = false; SHOP.drops.length = 0; }
  }
}
// перед боем — арена той части мира, где начинается волна
{ const _sw = SHOP.startWave; SHOP.startWave = function () { if (SHOP.transit) return; if (!(window.NETC && NETC.on) && !(typeof LIMBO !== 'undefined' && LIMBO.on)) setArena(WORLD, arenaIdx(wave + 1)); return _sw.apply(this, arguments); }; }
function applyWorld(m) {
  const w = WORLDS[m - 1];
  WORLD = m;
  WALK.length = 0; SOLID.length = 0; SPAWNS.length = 0; OBJ.length = 0;
  if (!w.walk) {
    for (const p of W1.walk) WALK.push(p.slice());
    for (const s of W1.solid) SOLID.push(s);
    for (const o of W1.obj) OBJ.push(o);
    for (const s of W1.spawns) SPAWNS.push(Object.assign({}, s));
    Object.assign(HERO_SPAWN, W1.hero); Object.assign(ENEMY_SPAWN, W1.enemy);
  } else {
    for (const p of w.walk) WALK.push([p[0] * AK, p[1] * AK]);
    for (const c of w.solid) SOLID.push({ x: c[0] * AK, y: c[1] * AK, rx: c[2] * AK, ry: c[3] * AK });
    for (const s of w.spawns) SPAWNS.push({ x: s[0] * AK, y: s[1] * AK, w: s[2] });
    HERO_SPAWN.x = w.hero[0] * AK; HERO_SPAWN.y = w.hero[1] * AK;
    ENEMY_SPAWN.x = w.portal[0] * AK; ENEMY_SPAWN.y = w.portal[1] * AK;
  }
  // миры 2–4 — большие карты (size — размер картинки в пикселях), мир 1 — прежняя арена
  WORLD_W = (w.size ? w.size[0] : 1536) * AK; WORLD_H = (w.size ? w.size[1] : 1024) * AK;
  NAV.build();
  setArena(m, arenaIdx(wave + 1), true);
  P.x = HERO_SPAWN.x; P.y = HERO_SPAWN.y; collide(P); cam.ready = false;
  SHOP.drops.length = 0;
  for (const r of ROSTER[m] ? [ROSTER[m]] : []) for (const t of [...r.mel, ...r.rng, ...r.elite, r.boss]) needChar(CHARS[KIND[t].ch]);
}

// затемнение экрана на время перехода (обычный чёрный слой, без картинок)
const FADE = document.createElement('div');
FADE.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .9s;z-index:20;' +
  'display:flex;align-items:center;justify-content:center;flex-direction:column;color:#ffe9a8;font:bold 5vh system-ui;text-shadow:0 .3vh .8vh #000';
document.body.appendChild(FADE);

// победа над боссом мира: раунд закончен на 10-й волне — через пару секунд переносимся в следующий мир
let worldT = 0, worldNext = 0;
const _shopTick = SHOP.tick;
SHOP.tick = function (dt) {
  const wasFight = SHOP.phase === 'fight';
  _shopTick(dt);
  if (window.NETC && NETC.on) return;
  if (wasFight && SHOP.phase === 'rest' && BAL.at(wave).W === 10 && !(typeof LIMBO !== 'undefined' && LIMBO.on)) {
    worldNext = worldOf(wave + 1); SHOP.restT = 0;
    const a = BAL.at(wave + 1), a0 = BAL.at(wave);
    say(P.x, P.y - CH * 1.6 * HS(), 'Мир ' + a0.M + ' пройден!', '#ffd95e');
    if (P.dead <= 0) { P.hp = P.maxHp; P.mp = P.maxMp; say(P.x, P.y - CH * 1.9 * HS(), 'Силы восстановлены', '#7dff8a'); }   // награда за босса мира
    if (typeof PATHMAP !== 'undefined') {
      // переход в новую главу по карте «Путь героев»: свет бежит к следующему медальону, на вспышке — новый мир
      SHOP.transit = true;   // пока идёт переход в новый мир, «Начать волну» не работает: иначе до карты можно было начать бой на старой арене
      const nx = worldNext, t0 = a0.M - 1 + 0.75, t1 = Math.min(9, a.M - 1 + (a.C > a0.C ? 0 : 0));
      setTimeout(() => PATHMAP.show({ mode: a.M > a0.M ? 'full' : 'short', t0: a.M > a0.M ? t0 : 0, t1: a.M > a0.M ? t1 : 0,
        onMid: () => { if (WORLD !== nx) applyWorld(nx); },
        onDone: () => { if (WORLD !== nx) applyWorld(nx); SHOP.noMap = true; SHOP.mapShown = true; SHOP.transit = false; SHOP.restT = 0.4; } }), 1400);   // mapShown: карту игрок только что видел — первый бой в новом мире начнётся без неё (v99)
      return;
    }
    worldT = 3.2;
    FADE.innerHTML = '<div>' + WORLDS[worldNext - 1].name + '</div><div style="font-size:2.6vh;opacity:.85;margin-top:1vh">мир ' + a.M +
      (a.C > 1 ? ' · круг ' + a.C : '') + '</div>';
    snd('wave_horn', 0.9, 0.8);
  }
  if (worldT > 0) {
    worldT -= dt;
    if (worldT < 1.6 && FADE.style.opacity !== '1') FADE.style.opacity = '1';
    if (worldT <= 0.9 && WORLD !== worldNext) applyWorld(worldNext);
    if (worldT <= 0) { FADE.style.opacity = '0'; SHOP.restT = 1.2; }
  }
};

// ---------- обход препятствий ----------
// Сетка клеток по карте: клетка проходима, если её центр внутри WALK и не внутри препятствия.
// Раз в 0,25 с считаем от клетки героя расстояния до всех клеток (волна по соседям);
// враг, который не видит героя напрямую, идёт к клетке на 3 шага ближе к герою.
const NAV = {
  S: 56, w: 0, h: 0, ok: null, d: null, t: 0, hc: -1,
  build() {
    const S = this.S; this.w = Math.ceil(WORLD_W / S); this.h = Math.ceil(WORLD_H / S);
    const n = this.w * this.h; this.ok = new Uint8Array(n); this.d = new Int32Array(n).fill(1e9); this.hc = -1;
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const x = (i + 0.5) * S, y = (j + 0.5) * S;
      let free = inWalk(x, y);
      if (free) for (const o of SOLID) {
        const dx = (x - o.x) / (o.rx + PR[0] + 6), dy = (y - o.y) / (o.ry + PR[1] + 6);
        if (dx * dx + dy * dy < 1) { free = false; break; }
      }
      this.ok[j * this.w + i] = free ? 1 : 0;
    }
  },
  cell(x, y) {
    const i = Math.max(0, Math.min(this.w - 1, Math.floor(x / this.S))), j = Math.max(0, Math.min(this.h - 1, Math.floor(y / this.S)));
    return j * this.w + i;
  },
  near(c) {   // ближайшая проходимая клетка (герой или враг мог встать на край клетки-препятствия)
    if (this.ok[c]) return c;
    const ci = c % this.w, cj = (c / this.w) | 0;
    for (let r = 1; r < 4; r++) for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++)
      if (i >= 0 && j >= 0 && i < this.w && j < this.h && this.ok[j * this.w + i]) return j * this.w + i;
    return c;
  },
  update(dt) {
    if (!this.ok) this.build();
    this.t -= dt;
    const hc = this.near(this.cell(P.x, P.y));
    if (this.t > 0 && hc === this.hc) return;
    this.t = 0.25; this.hc = hc;
    const d = this.d, W = this.w, ok = this.ok; d.fill(1e9); d[hc] = 0;
    const q = new Int32Array(W * this.h); let qh = 0, qt = 0; q[qt++] = hc;
    while (qh < qt) {
      const c = q[qh++], ci = c % W, cj = (c / W) | 0, nd = d[c] + 1;
      for (let k = 0; k < 8; k++) {
        const i = ci + NB[k][0], j = cj + NB[k][1];
        if (i < 0 || j < 0 || i >= W || j >= this.h) continue;
        const n = j * W + i;
        if (!ok[n] || d[n] <= nd) continue;
        if (k >= 4 && (!ok[cj * W + i] || !ok[j * W + ci])) continue;   // не срезаем угол препятствия
        d[n] = nd; q[qt++] = n;
      }
    }
  },
  clear(x0, y0, x1, y1) {   // прямая от врага к герою свободна?
    const L = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(L / (this.S * 0.5));
    for (let k = 1; k < n; k++) if (!this.ok[this.cell(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n)]) return false;
    return true;
  },
};
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
function navDir(e) {
  if (!NAV.ok) return null;
  e.navT = (e.navT || 0) - 1 / 60;
  if (e.navT > 0) return e.navV;
  e.navT = 0.2;
  if (NAV.clear(e.x, e.y, P.x, P.y)) { e.navV = null; return null; }
  let c = NAV.near(NAV.cell(e.x, e.y));
  for (let s = 0; s < 3; s++) {   // три шага под горку расстояний
    const ci = c % NAV.w, cj = (c / NAV.w) | 0; let best = c;
    for (const [a, b] of NB) {
      const i = ci + a, j = cj + b;
      if (i < 0 || j < 0 || i >= NAV.w || j >= NAV.h) continue;
      const n = j * NAV.w + i; if (NAV.d[n] < NAV.d[best]) best = n;
    }
    if (best === c) break; c = best;
  }
  const tx = (c % NAV.w + 0.5) * NAV.S, ty = (((c / NAV.w) | 0) + 0.5) * NAV.S;
  let dx = tx - e.x, dy = (ty - e.y) / YK; const m = Math.hypot(dx, dy);
  if (m < 1 || NAV.d[c] >= 1e9) { e.navV = null; return null; }
  e.navV = [dx / m, dy / m]; return e.navV;
}
const _cu = combatUpdate;
combatUpdate = function (dt) { NAV.update(dt); _cu(dt); };

// ---------- стрелки к врагам за краем экрана ----------
// На большой карте босс и группы врагов часто вне экрана: у края показываем стрелку в их сторону
// (стрелка — картинка ui/arrow.webp из ChatGPT, та же, что в дереве сборки магазина).
const ARW = new Image(), ARW_ROT = Math.PI / 2; ARW.src = 'ui/arrow.webp' + V;   // стрелка на картинке смотрит вверх
const _cui = combatUI;
combatUI = function () {
  _cui();
  if (!cam.z || !ARW.complete || !ARW.naturalWidth) return;
  const pad = Math.min(W, H) * 0.09, sz = Math.min(W, H) * 0.11;
  let shown = 0;
  for (const e of enemies) {
    if (e.dieT != null || shown > 8) continue;
    const sx = (e.x - cam.x) * cam.z, sy = (e.y - cam.y) * cam.z;
    if (sx > -10 && sx < W + 10 && sy > -10 && sy < H + 10) continue;
    shown++;
    const cx = W / 2, cy = H / 2, dx = sx - cx, dy = sy - cy;
    const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
    const s = sz * (e.boss ? 1.5 : e.elite ? 1.2 : 0.9);
    ctx.save(); ctx.translate(cx + dx * k, cy + dy * k); ctx.rotate(Math.atan2(dy, dx) + ARW_ROT);
    ctx.globalAlpha = e.boss ? 1 : 0.85;
    if (e.boss) { ctx.shadowColor = '#ff3020'; ctx.shadowBlur = s * 0.6; }
    ctx.drawImage(ARW, -s * 0.31, -s / 2, s * 0.62, s);
    ctx.restore();
  }
};
// ночь 19.11: мир 1 — Королевский замок (большая карта), прежняя арена-поляна больше не мир; игра стартует сразу в нём
applyWorld(1);
