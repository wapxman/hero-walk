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

function applyWorld(m) {
  const w = WORLDS[m - 1];
  WORLD = m;
  WALK.length = 0; SOLID.length = 0; SPAWNS.length = 0; OBJ.length = 0;
  if (m === 1) {
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
  if (w.ground !== curGround) {
    curGround = w.ground;
    const g = new Image(); g.onload = () => { img.ground = g; }; g.src = w.ground + V;
  }
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
  if (wasFight && SHOP.phase === 'rest' && BAL.at(wave).W === 10) {
    worldNext = worldOf(wave + 1); worldT = 3.2; SHOP.restT = 0;
    const a = BAL.at(wave + 1);
    say(P.x, P.y - CH * 1.6 * HS(), 'Мир ' + BAL.at(wave).M + ' пройден!', '#ffd95e');
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
