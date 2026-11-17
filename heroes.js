// Герои: маг Ganfaul (скиллы в combat.js) и лучница Эйра (скиллы здесь). Выбор героя перед боем.
// Вся графика лучницы — из ChatGPT: иконки ui/sk_icons_archer.webp, портрет ui/h_portrait_archer.webp, эффекты fx/fx3_*.webp.
// Использует из combat.js: P, enemies, shots, fx, HERO, MAGE, loadHero, RANGE, CDMAX, MANA, SK_ICONS, cast, shoot, hurtPlayer...
'use strict';

// ---------- лучница: листы кадров (как у мага: три листа по 400 px) ----------
const ARCHER = { pre: 'archer_', U: 118, zc: 0.9, cell: 400,
  sheets: { a: { wrap: 6, rows: 2 }, b: { wrap: 6, rows: 2 }, d: { wrap: 5, rows: 1 } },
  an: { idle: { s: 'a', i: 0, n: 4, o: 2.4 }, run: { s: 'a', i: 4, n: 8, o: 2.4 }, atk: { s: 'b', i: 0, n: 5, o: 2.4 },
    cast: { s: 'b', i: 5, n: 6, o: 2.6 }, die: { s: 'd', i: 0, n: 5, o: 3.0 } } };

// hp — запас здоровья, range — дальность выстрела, cd — перезарядка скиллов, mana — их цена
const HEROES = {
  mage: { def: MAGE, name: 'Ganfaul', role: 'маг льда', icons: 'ui/sk_icons.webp', portrait: 'ui/h_portrait.webp',
    hp: 600, range: 600, cd: { q: 6, e: 9, f: 12, r: 28 }, mana: { q: 60, e: 50, f: 80, r: 150 },
    skills: ['Ледяная стрела', 'Нова — взрыв льда', 'Оковы — заморозка цели', 'Град — дождь сосулек', 'Буря — ульт'] },
  archer: { def: ARCHER, name: 'Эйра', role: 'лучница', icons: 'ui/sk_icons_archer.webp', portrait: 'ui/h_portrait_archer.webp',
    hp: 520, range: 720, cd: { q: 9, e: 6, f: 15, r: 0 }, mana: { q: 70, e: 60, f: 90, r: 0 },
    skills: ['Меткий выстрел', 'Волна — отбрасывает и лишает скиллов', 'Залп — 5 стрел веером', 'Щит — поглощает урон', 'Фокус — пассивка: урон, дальность, скорость атаки'] },
};
let HERO_ID = 'mage';
const HERO_KEY = 'hw_hero';

function setHero(id) {
  if (!HEROES[id]) id = 'mage';
  const h = HEROES[id];
  HERO_ID = id; HERO = h.def; loadHero(HERO);
  Object.assign(CDMAX, h.cd); Object.assign(MANA, h.mana);
  RANGE = h.range; P.baseHp = h.hp;
  SK_ICONS.src = h.icons + V;
  const pt = document.querySelector('#hHero .pt');
  if (pt) pt.style.backgroundImage = 'url(' + h.portrait + V + ')';
  P.focus = 0; P.focusT = 0; P.shield = 0; P.shieldT = 0;
  if (typeof SHOP !== 'undefined') { SHOP.recompute(); P.hp = P.maxHp; P.mp = P.maxMp; }
  try { localStorage.setItem(HERO_KEY, id); } catch (e) {}
}

// ---------- звуки лучницы (Higgsfield, Клауди; файлы sfx/archer_*.mp3, описание — sfx_higgs_archer/game/MAP.txt) ----------
Object.assign(SFX_SETS, {
  archer_bow_shot: 4, archer_arrow_hit: 6, archer_gust: 2, archer_volley: 1, archer_shield_on: 2, archer_shield_break: 2,
  archer_ult_proc: 2, archer_step: 14, archer_death: 2,
  archer_vo_attack: 4, archer_vo_move: 3, archer_vo_gust: 1, archer_vo_volley: 1, archer_vo_shield: 1, archer_vo_ult: 1,
  archer_vo_kill: 2, archer_vo_hurt: 1, archer_vo_death: 1, archer_vo_respawn: 1, archer_vo_levelup: 1, archer_vo_cooldown: 1, archer_vo_nomana: 1,
});
Object.assign(SND_GAP, { archer_arrow_hit: 0.05, archer_step: 0.1 });
// общие события боя у лучницы звучат её звуками: шаги, выстрел, смерть
const ARCHER_SND = { hero_shot: 'archer_bow_shot', step: 'archer_step', hero_death: 'archer_death', archer_shot: 'archer_bow_shot',
  archer_hit: 'archer_arrow_hit', archer_wave: 'archer_gust', archer_shield: 'archer_shield_on' };
const _sndBase = snd;
snd = function (name, vol, rate) {
  if (HERO_ID === 'archer' && ARCHER_SND[name]) name = ARCHER_SND[name];
  return _sndBase(name, vol, rate);
};
// Реплики: chance — шанс, gap — не чаще раза в gap секунд; две реплики не звучат одновременно
const voLast = {};
let voBusy = 0;
function vo(name, chance, gap) {
  if (HERO_ID !== 'archer' || !AC || AC.state !== 'running') return;
  const now = AC.currentTime, n = 'archer_vo_' + name;
  if (gap && now - (voLast[name] == null ? -1e9 : voLast[name]) < gap) return;
  if (now < voBusy || Math.random() > chance) return;
  voLast[name] = now;
  _sndBase(n, 0.95);
  const b = SND[n + '_' + sndLast[n]];
  voBusy = now + (b ? b.duration : 1.5);
}

// ---------- эффекты лучницы ----------
const FX3 = {};
for (const k of ['arrow', 'hit', 'wave', 'shield', 'silence', 'aura']) {
  const im = new Image(); FX3[k] = { img: im }; im.onload = () => { FX3[k].ok = true; }; im.src = 'fx/fx3_' + k + '.webp' + V;
}
function fx3(k, x, y, w, h, ax, ay, alpha, rot, ground) {
  if (!FX3[k].ok) return;
  ctx.save(); ctx.translate(x, y);
  if (ground) ctx.scale(1, YK);
  if (rot) ctx.rotate(rot);
  if (alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.drawImage(FX3[k].img, -w * ax, -h * ay, w, h);
  ctx.restore();
}

// ---------- Фокус охотника (пассивка, кнопка R) ----------
// каждое попадание стрелой даёт заряд (до 10); за заряд: +5% урона, +4% скорости атаки, +3% дальности.
// Без попаданий 3 секунды заряды по одному гаснут.
// уровень пассивки (прокачка R) добавляет +0,6% урона к каждому заряду
const FOCUS_MAX = 10;
function focusHit() {
  const was = P.focus || 0;
  P.focus = Math.min(FOCUS_MAX, was + 1); P.focusT = 3;
  if (was < FOCUS_MAX && P.focus === FOCUS_MAX) { snd('archer_ult_proc', 0.8); vo('ult', 0.5, 20); say(P.x, P.y - CH * 1.3 * HS(), 'Фокус!', '#ffe27a'); }
}
const focusK = () => 1 + (0.05 + 0.006 * (skLv('r') - 1)) * (P.focus || 0);

// ---------- атака: стрела ----------
const _shootMage = shoot;
shoot = function () {
  if (HERO_ID !== 'archer') return _shootMage();
  const t = nearestEnemy(RANGE);
  let dx = P.face.x, dy = P.face.y;
  if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; }
  arrow(dx, dy, t, rnd(40, 52) * focusK());
  P.atkCd = 0.6 / (1 + 0.04 * (P.focus || 0)); P.cast = 0.12;
  P.act = { anim: 'atk', t: 0, dur: Math.min(0.45, P.atkCd * 0.9), row: t ? runRow(t.x - P.x, t.y - P.y) : null };
  snd('archer_shot', 0.8);
  // реплика атаки — в начале серии выстрелов и не чаще раза в 6 с
  if (performance.now() - (P.lastShot || 0) > 1500) vo('attack', 1, 6);
  P.lastShot = performance.now();
};
function arrow(dx, dy, tgt, dmg) {
  shots.push({ own: 'p', arrow: true, x: P.x + dx * 26 * HS(), y: P.y + dy * 26 * YK * HS(), dx, dy, sp: 1300, tgt, left: RANGE + 120,
    dmg, h: CH * 0.6 * HS(), sc: HS(), onHit: focusHit });
}
const _drawShot = drawShot;
drawShot = function (s) {
  if (!s.arrow || !FX3.arrow.ok) return _drawShot(s);
  ctx.save(); ctx.translate(s.x, s.y - s.h); ctx.rotate(Math.atan2(s.dy * YK, s.dx));
  const w = 170 * (s.sc || 1);
  ctx.drawImage(FX3.arrow.img, -w * 0.92, -w / 2, w, w);
  ctx.restore();
};

// ---------- скиллы лучницы ----------
const _castMage = cast;
cast = function (id) {
  if (HERO_ID !== 'archer') return _castMage(id);
  if (P.dead > 0 || (typeof SHOP !== 'undefined' && SHOP.paused)) return;
  if (id === 'r') { say(P.x, P.y - CH * 1.2 * HS(), 'Фокус ' + (P.focus || 0) + '/' + FOCUS_MAX + ' — пассивка', '#d9ffb0'); return; }
  if (P.cd[id] > 0) { vo('cooldown', 1, 3); return; }
  if (P.mp < MANA[id]) { vo('nomana', 1, 3); if (!P.noMana || P.noMana < performance.now()) { say(P.x, P.y - CH * HS(), 'мало маны', '#8ab8ff'); P.noMana = performance.now() + 700; } return; }
  let row = null;
  if (id === 'q') {
    // Волна: удар ветра вокруг лучницы — урон, отбрасывание и тишина (враг не может стрелять и применять скиллы)
    const R = 290 * HS();
    fx.push({ type: 'wave3', x: P.x, y: P.y, t: 0, dur: 0.55, R });
    for (const e of enemies) {
      const d = gdist(P, e);
      if (d > R + e.rad) continue;
      hurtEnemy(e, 70 * focusK() * skDmg('q'), '#d9ffb0');
      let dx = e.x - P.x, dy = (e.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const push = (e.boss ? 120 : 280) * (1 - 0.5 * d / (R + e.rad)), t = 0.28;
      e.kb = { vx: dx * push / t, vy: dy * push / t * YK, t };
      e.silT = 3.5 + 0.15 * (skLv('q') - 1);
    }
    snd('archer_wave', 0.9); vo('gust', 0.75);
  } else if (id === 'e') {
    // Залп: пять стрел веером в сторону ближайшего врага (или туда, куда смотрит лучница)
    const t = nearestEnemy(RANGE * 1.1);
    let dx = P.face.x, dy = P.face.y;
    if (t) { dx = t.x - P.x; dy = (t.y - P.y) / YK; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m; row = runRow(t.x - P.x, t.y - P.y); }
    const a0 = Math.atan2(dy, dx);
    for (let i = -2; i <= 2; i++) { const a = a0 + i * 0.2; arrow(Math.cos(a), Math.sin(a), null, rnd(52, 64) * focusK() * skDmg('e')); }
    snd('archer_volley', 0.9); vo('volley', 0.75);
  } else if (id === 'f') {
    // Щит: купол поглощает 260 урона (плюс 15 за уровень героя) 6 секунд
    P.shield = Math.round((260 + 6 * (P.lvl - 1)) * skDmg('f')); P.shieldT = 6;
    say(P.x, P.y - CH * 1.2 * HS(), 'Щит ' + P.shield, '#b9ffcf');
    snd('archer_shield', 0.85); vo('shield', 0.75);
  }
  P.cd[id] = CDMAX[id] * (P.cdMul || 1) * skCd(id); P.cast = 0.25; P.mp -= MANA[id];
  P.act = { anim: 'cast', t: 0, dur: 0.55, row };
};
// щит забирает урон на себя, пока не кончится
const _hurtPlayer = hurtPlayer;
hurtPlayer = function (d) {
  if (P.dead <= 0 && P.shieldT > 0 && P.shield > 0) {
    const a = Math.min(P.shield, d);
    P.shield -= a; d -= a;
    if (P.shield <= 0) { P.shieldT = 0; say(P.x, P.y - CH * 1.2 * HS(), 'щит разбит', '#b9ffcf'); snd('archer_shield_break', 0.8); }
    if (d <= 0) return;
  }
  _hurtPlayer(d);
  if (P.dead <= 0) vo('hurt', 0.25, 3);
};
// каждый кадр: заряды фокуса, дальность, время щита
const heroEv = { moving: false, kills: 0, dead: 0, lvl: 0 };
const _combatUpdate = combatUpdate;
combatUpdate = function (dt) {
  _combatUpdate(dt);
  if (HERO_ID !== 'archer') return;
  RANGE = HEROES.archer.range * (1 + 0.03 * (P.focus || 0));
  if (P.focus > 0) { P.focusT -= dt; if (P.focusT <= 0) { P.focus--; P.focusT = 0.5; } }
  if (P.shieldT > 0) { P.shieldT -= dt; if (P.shieldT <= 0) { P.shield = 0; snd('archer_shield_break', 0.6); } }
  // реплики на события: шаг с места, убийство, смерть, возрождение, новый уровень
  const st = heroEv;
  if (P.moving && !st.moving) vo('move', 1, 6);
  if (kills > st.kills) vo('kill', 0.2);
  if (P.dead > 0 && !(st.dead > 0)) vo('death', 1);
  if (!(P.dead > 0) && st.dead > 0) vo('respawn', 1);
  if (P.lvl > st.lvl && st.lvl) vo('levelup', 1);
  st.moving = P.moving; st.kills = kills; st.dead = P.dead; st.lvl = P.lvl;
  if (P.dead > 0) { P.focus = 0; P.shield = 0; P.shieldT = 0; }
};

// ---------- рисование эффектов лучницы ----------
function heroGround(t) {
  if (HERO_ID !== 'archer') return;
  // круг фокуса под ногами: ярче и шире с каждым зарядом
  if (P.focus > 0 && P.dead <= 0) {
    const s = 170 * HS() * (0.85 + 0.035 * P.focus);
    fx3('aura', P.x, P.y, s, s, 0.5, 0.5, 0.25 + 0.06 * P.focus, t * 0.5, true);
  }
  for (const f of fx) {
    if (f.type !== 'wave3') continue;
    const k = f.t / f.dur, s = f.R * 2.3 * (0.3 + 0.75 * easeOut(Math.min(1, k * 1.4)));
    fx3('wave', f.x, f.y, s, s, 0.5, 0.5, k < 0.5 ? 1 : (1 - k) / 0.5, k * 0.8, true);
  }
}
function heroOver(t) {
  // печать тишины над врагами
  for (const e of enemies) {
    if (!(e.silT > 0)) continue;
    const top = e.ch.ok ? e.ch.top * e.ch.U * e.sc : e.rad * 2.2;
    fx3('silence', e.x, e.y - top - 34 + Math.sin(t * 4 + e.x) * 3, 44, 44, 0.5, 0.5, Math.min(1, e.silT * 2));
  }
  if (HERO_ID !== 'archer' || P.dead > 0) return;
  // купол щита
  if (P.shieldT > 0) {
    const s = 230 * HS() * (1 + 0.03 * Math.sin(t * 5));
    fx3('shield', P.x, P.y - CH * 0.42 * HS(), s, s, 0.5, 0.5, 0.65 * Math.min(1, P.shieldT * 2));
  }
}
// кнопка пассивки: вместо перезарядки — число зарядов фокуса
function heroButton(b) {
  if (HERO_ID !== 'archer' || b.id !== 'r') return false;
  if (!P.focus) { ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.8, 0, 7); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); }
  ctx.font = 'bold ' + Math.round(b.r * 0.62) + 'px system-ui, sans-serif';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.fillStyle = P.focus >= FOCUS_MAX ? '#ffe27a' : '#fff';
  ctx.strokeText(P.focus || 0, b.x, b.y); ctx.fillText(P.focus || 0, b.x, b.y);
  return true;
}

// ---------- выбор героя перед боем ----------
(function heroSelect() {
  let saved = 'mage';
  try { saved = localStorage.getItem(HERO_KEY) || 'mage'; } catch (e) {}
  setHero(saved);
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  const css = document.createElement('style');
  css.textContent = `
  #hSel { position: fixed; inset: 0; z-index: 10; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vh;
    background: radial-gradient(ellipse at center, rgba(6,14,24,.55), rgba(2,6,12,.88)); color: #fff; font-family: system-ui, sans-serif;
    text-shadow: 0 1px 3px #000; user-select: none; -webkit-user-select: none; }
  #hSel .pl { width: 46vh; height: 12vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold 3.6vh system-ui; letter-spacing: .08em; }
  #hSel .row { display: flex; gap: 4vh; }
  #hSel .card { width: min(40vh, 44vw); padding: 2vh 2vh 2.4vh; border-radius: 2vh; background: rgba(10,22,40,.75); border: .4vh solid rgba(160,190,230,.35);
    display: flex; flex-direction: column; align-items: center; gap: .8vh; cursor: pointer; touch-action: manipulation; transition: transform .15s; }
  #hSel .card.on { border-color: #ffe27a; box-shadow: 0 0 3vh rgba(255,226,122,.45); transform: scale(1.04); }
  #hSel .card i { display: block; width: 18vh; height: 18vh; background-size: 100% 100%; }
  #hSel .card b { font-size: 3.2vh; } #hSel .card em { font-style: normal; color: #ffe27a; font-size: 2.3vh; }
  #hSel .card ul { margin: .6vh 0 0; padding-left: 2.6vh; font-size: 1.95vh; line-height: 1.45; opacity: .92; }
  #hSel .go { width: 40vh; height: 10.5vh; background: ${U('h_button')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
    font: bold 3.3vh system-ui; color: #ffe9a8; cursor: pointer; touch-action: manipulation; letter-spacing: .06em; }`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.id = 'hSel';
  box.innerHTML = '<div class="pl">ВЫБЕРИ ГЕРОЯ</div><div class="row"></div><div class="go">В БОЙ</div>';
  for (const ev of ['touchstart', 'mousedown', 'pointerdown']) box.addEventListener(ev, x => x.stopPropagation(), { passive: true });
  const row = box.querySelector('.row'), cards = {};
  for (const id in HEROES) {
    const h = HEROES[id], c = document.createElement('div'); c.className = 'card';
    c.innerHTML = '<i style="background-image:url(' + h.portrait + V + ')"></i><b>' + h.name + '</b><em>' + h.role + '</em><ul>' +
      h.skills.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    c.addEventListener('pointerdown', () => { setHero(id); for (const k in cards) cards[k].classList.toggle('on', k === id); });
    row.appendChild(c); cards[id] = c;
  }
  cards[HERO_ID].classList.add('on');
  box.querySelector('.go').addEventListener('pointerdown', () => { box.style.display = 'none'; });
  document.body.appendChild(box);
  addEventListener('keydown', e => { if (box.style.display !== 'none' && (e.code === 'Enter' || e.code === 'Space')) { box.style.display = 'none'; e.stopImmediatePropagation(); } }, true);
  // в меню паузы: сменить героя (бой начнётся заново)
  if (typeof SHOP !== 'undefined' && SHOP.el && SHOP.el.pause) {
    const b = document.createElement('div'); b.className = 'mb bg'; b.textContent = 'Сменить героя';
    b.addEventListener('pointerdown', x => { x.stopPropagation(); location.reload(); });
    SHOP.el.pause.insertBefore(b, SHOP.el.pause.querySelector('.tip'));
  }
})();
