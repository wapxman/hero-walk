// Мелочи по плану миров (v101, 21.11): заранее раскодированные листы злодеев, подсказка про рывок, пульс кнопки склянки.
// Подключается последним из боевых файлов. Использует: needChar, applyWorld, CHARS, KIND, ROSTER, SKSHEETS, SK, DASH, BTN, SHOP, P, enemies, gdist.
'use strict';
(() => {
  // ---------- 1. Листы злодеев — заранее ----------
  // Рывки кадра посреди боя (до 80 мс на компьютере, на телефоне заметнее) давала первая отрисовка листа злодея: браузер
  // раскодирует картинку в момент первого рисования. Теперь лист раскодируется сразу после загрузки (img.decode — не в основном
  // потоке) и один раз рисуется в скрытый холст 1×1. Листы рядовых и элиты мира и картинки их умений запрашиваются при входе
  // в мир (на карте пути), мини-босса и босса — перед их раундом (пока открыта лавка), а не посреди боя.
  const cv = document.createElement('canvas'); cv.width = cv.height = 2; const g = cv.getContext('2d');
  const touch0 = im => { try { g.drawImage(im, 0, 0, 1, 1, 0, 0, 1, 1); } catch (e) {} };
  // v120: первое рисование листа (загрузка в видеопамять) — в свободные промежутки между кадрами и по одному: подряд десятки
  // листов держали страницу секундами (меню и касания ждали)
  const TQ = []; let tqOn = false;
  const idle = f => (window.requestIdleCallback ? requestIdleCallback(f, { timeout: 700 }) : setTimeout(f, 30));
  const tqRun = () => { const im = TQ.shift(); if (im) touch0(im); if (TQ.length) idle(tqRun); else tqOn = false; };
  const touch = im => { TQ.push(im); if (!tqOn) { tqOn = true; idle(tqRun); } };
  function warm(im) {
    if (!im || im._warm || !(im instanceof HTMLImageElement)) return; im._warm = 1;
    const go = () => { if (im.decode) im.decode().then(() => touch(im)).catch(() => {}); else touch(im); };
    if (im.complete && im.naturalWidth) go(); else im.addEventListener('load', go, { once: true });   // картинка без адреса просто ждёт своей загрузки
  }
  function warmChar(c) {
    if (!c) return;
    if (c.img) warm(c.img);
    if (c.mul) for (const k in c.mul) warm(c.mul[k].img);
    if (c.vfx) for (const v of c.vfx) if (v && v.img) warm(v.img);
  }
  // любая картинка, созданная игрой после этого места (листы злодеев, живые элементы, эффекты умений), раскодируется сразу после загрузки
  { const I0 = window.Image; const I1 = function (w, h) { const im = w === undefined ? new I0() : new I0(w, h); warm(im); return im; }; I1.prototype = I0.prototype; window.Image = I1; }
  // те, что уже созданы: листы героев и всё, что начало грузиться до этого файла
  for (const c of [typeof GANFAUL !== 'undefined' && GANFAUL, typeof ARCHER !== 'undefined' && ARCHER]) if (c) warmChar(c);
  for (const id in CHARS) warmChar(CHARS[id]);
  // Листы выбранного героя держим раскодированными постоянно (ImageBitmap, около 45–60 МБ): браузер выбрасывал их из памяти после
  // загрузки новой арены и раскодировал заново в начале раунда — рывок до 125 мс на компьютере. Листы другого героя отпускаем.
  function pin(c) {
    if (!c || !c.mul || !window.createImageBitmap) return;
    let i = 0;
    for (const k in c.mul) {
      const a = c.mul[k], im = a.img; if (!im || a._pin || !(im instanceof HTMLImageElement)) continue; a._pin = im;
      const go = () => createImageBitmap(im).then(bm => { if (a._pin === im && a.img === im) a.img = bm; else if (bm.close) bm.close(); }).catch(() => { a._pin = null; });
      const soon = () => setTimeout(go, 60 * i++);      // v120: по одному листу с паузой — разом 11 листов героя держали страницу треть секунды
      if (im.complete && im.naturalWidth) soon(); else im.addEventListener('load', soon, { once: true });
    }
  }
  function unpin(c) { if (c && c.mul) for (const k in c.mul) { const a = c.mul[k]; if (a._pin) { const bm = a.img; a.img = a._pin; a._pin = null; if (bm && bm !== a.img && bm.close) bm.close(); } } }
  function pinHero() { try { for (const c of [typeof GANFAUL !== 'undefined' && GANFAUL, typeof ARCHER !== 'undefined' && ARCHER]) if (c) { if (c === HERO) pin(c); else unpin(c); } } catch (e) {} }
  // перед раундом с боссом его листы раскодируем ещё раз (браузер мог выбросить их из памяти с момента входа в мир)
  function rewarm(c) { if (c && c.mul) for (const k in c.mul) { const im = c.mul[k].img; if (im instanceof HTMLImageElement && im.complete && im.naturalWidth && im.decode) im.decode().then(() => touch(im)).catch(() => {}); } }
  // закрепляем сразу при выборе героя (в меню), а не в первом бою
  if (typeof setHero === 'function') { const _sh = setHero; setHero = function () { const r = _sh.apply(this, arguments); setTimeout(pinHero, 0); return r; }; }
  if (typeof LAZY !== 'undefined') LAZY.run(() => setTimeout(pinHero, 1500)); else setTimeout(pinHero, 0);      // v120: не на старте — когда меню уже на экране
  const _need = needChar;
  needChar = function (c) { const r = _need(c); warmChar(c); return r; };
  const SUMMON = { 2: ['sk_golem'], 3: ['sk_idol'], 7: ['ml_clone', 'mirrorcopy'], 9: ['sk_spirit'], 10: ['sk_golem_void'] };   // кого зовут боссы мира
  // v120: виды готовятся по одному с паузой 70 мс (первый — сразу): разом десяток видов на секунду занимал страницу
  function warmTypes(types) { [...new Set(types)].forEach((t, i) => { if (!i) warmType(t); else setTimeout(() => warmType(t), i * 70); }); }
  function warmType(t) {
    {
      const k = t && KIND[t]; if (!k || !CHARS[k.ch]) return;
      needChar(CHARS[k.ch]);
      if (typeof SK !== 'undefined' && SK.creWarm) { SK.creWarm(t); SK.creWarm(k.ch); }      // v120: листы существ, которых он зовёт или в кого превращает
      const S = typeof SKSHEETS !== 'undefined' && (SKSHEETS[t] || SKSHEETS[k.ch]);   // картинки умений (fx/sk) — иначе грузились с первым применением
      if (S && S.f && typeof SK !== 'undefined') for (const key in S.f) if (S.f[key].img) warm(SK.img(S.f[key].img));
    }
  }
  // вход в мир: рядовые и элита (они выходят с первой волны). Босса, мини-боссов и их призывных — позже, перед их раундом:
  // всех листов мира сотни мегабайт, раскодировать их разом — только вытеснять из памяти то, что уже нужно
  function warmWorld(m) {
    const r = ROSTER[m]; if (!r) return;
    const types = [...r.mel, ...r.rng, ...r.elite];
    if (m === 10 && KIND.v_warlock) types.push('v_warlock');
    warmTypes(types);
  }
  // перед раундом: его мини-босс; перед боссом — босс, финальный босс и те, кого они зовут (и раскодировать ещё раз, если уже грузились)
  function warmRound(n) {
    const a = BAL.at(n), r = ROSTER[a.M]; if (!r) return;
    if (a.W === 10) { const T = [r.boss, r.final, ...(SUMMON[a.M] || [])].filter(Boolean); warmTypes(T); for (const t of T) if (KIND[t]) rewarm(CHARS[KIND[t].ch]); }
    else if (typeof miniOf === 'function') warmTypes([miniOf(r, a.W + 2 - (a.W - 1) % 3)]);
  }
  // ---------- v120 (аудит скорости): память и подгрузка ----------
  // Листы злодеев без потерь большие: рядовые одного мира — 100–200 МБ в раскодированном виде. Раньше они копились: после трёх
  // миров в памяти лежало 772 МБ картинок. Теперь при смене мира листы тех, кого в новом мире нет, отпускаются (evict);
  // вернётся игрок в тот мир — загрузятся снова. Герой, враги на арене и все, кто может выйти в новом мире, остаются.
  const net = () => !!(window.NETC && NETC.on);
  function keepSet(m) {
    const S = new Set(), r = ROSTER[m]; if (!r) return S;
    for (const t of [...r.mel, ...r.rng, ...r.elite, ...(r.mini || []), r.boss, r.final, ...(SUMMON[m] || []), ...(m === 10 ? ['v_warlock'] : [])]) if (t && KIND[t]) S.add(KIND[t].ch);
    return S;
  }
  let nextWorld = 0;      // мир, который готовим заранее (после победы над боссом) — его листы не отпускаем
  function evict(m) {
    if (net()) return 0;
    const keep = keepSet(m); if (nextWorld) for (const id of keepSet(nextWorld)) keep.add(id);
    for (const e of enemies) if (e.k) keep.add(e.k.ch);
    if (typeof corpses !== 'undefined') for (const e of corpses) if (e.k) keep.add(e.k.ch);
    let n = 0;
    for (const id in CHARS) {
      const c = CHARS[id]; if (!c || !c.mul || c.hero || !c.loading || keep.has(id)) continue;
      for (const k in c.mul) { const a = c.mul[k], im = a.img; if (im) { n++; try { if (im.close) im.close(); else if (im.getContext) im.width = im.height = 0; else im.onload = null; } catch (e) {} } a.img = null; a.ok = false; a._pin = null; }
      c.loading = false; c.ok = false;
    }
    return n;
  }
  // мир last — последний, для которого шла смена: листы отпускаем только при настоящей смене мира
  let lastWorld = 0;
  const _aw = applyWorld;
  applyWorld = function (m) {
    const r = _aw.apply(this, arguments);
    try { if (lastWorld && lastWorld !== m) { if (nextWorld === m) nextWorld = 0; evict(m); } lastWorld = m; warmWorld(m); } catch (e) {}
    return r;
  };
  // мир, с которого игра продолжится (мир последнего сохранения; новая игра — мир 1): готовим его, когда страница собрана
  const boot = () => { try { warmWorld(typeof LAZY !== 'undefined' ? LAZY.world() : 1); } catch (e) {} };
  if (typeof LAZY !== 'undefined') LAZY.run(boot); else setTimeout(boot, 0);
  let fights = 0;
  { const _sw = SHOP.startWave; SHOP.startWave = function () { try { warmWorld(BAL.at(wave + 1).M); warmRound(wave + 1); } catch (e) {} pinHero(); const r = _sw.apply(this, arguments);
      if (!fights && SHOP.phase === 'fight' && typeof LAZY !== 'undefined') { fights = 1; setTimeout(() => LAZY.start2(), 4000); }      // картинки Междумирья и прочее «на потом»
      return r; }; }
  // раунд кончился (открылась лавка) — готовим следующий заранее. Босс мира побеждён — пока идут окно награды и карта перехода
  // (секунд семь без управления), заранее грузим следующий мир: его арену и листы рядовых и элиты.
  { let ph = ''; setInterval(() => { if (typeof SHOP === 'undefined' || SHOP.phase === ph || (typeof LAZY !== 'undefined' && !LAZY.go)) return; const was = ph; ph = SHOP.phase; if (ph === 'rest' && !net()) try {
      warmRound(wave + 1);
      if (was === 'fight' && wave > 0 && BAL.at(wave).W === 10 && !(typeof LIMBO !== 'undefined' && LIMBO.on) && P.dead <= 0) { const m = BAL.at(wave + 1).M; if (m !== WORLD) { nextWorld = m; warmWorld(m); if (typeof arenaPre === 'function') arenaPre(m, typeof arenaIdx === 'function' ? arenaIdx(wave + 1) : 0); } }
    } catch (e) {} }, 250); }
  // карта выбора главы: арену выбранной точки грузим заранее, пока игрок смотрит на карту (вход на арену не ждёт загрузки)
  if (typeof PATHMAP !== 'undefined' && typeof arenaPre === 'function') {
    let lastPick = '';
    setInterval(() => { if (!PATHMAP.on || net()) { lastPick = ''; return; } const s = PATHMAP.sel; if (!s) return; const k = s.c + ':' + s.w; if (k === lastPick) return; lastPick = k;
      try { const w = s.w == null ? (s.c === BAL.at(wave + 1).M ? wave : (s.c - 1) * BAL.WAVES) : s.w; arenaPre(s.c, typeof arenaIdx === 'function' ? arenaIdx(w + 1) : 0); if (s.c !== WORLD) warmWorld(s.c); } catch (e) {} }, 200);
  }

  // ---------- 2. Подсказка «Окружили — рывок!» ----------
  // Один раз за игру: когда вокруг героя четверо и больше врагов, а рывок готов. Надпись сверху и кольцо вокруг кнопки рывка.
  const KEY = 'hw_hint_ring';
  let seen = false, hintT = 0, el = null, acc = 0;
  try { seen = !!localStorage.getItem(KEY); } catch (e) {}
  const st = document.createElement('style');
  st.textContent = '#hintRing { position: fixed; left: 50%; top: 21vh; transform: translateX(-50%); z-index: 30; pointer-events: none; font: bold 5.2vh system-ui, sans-serif; color: #ffe9a8;'
    + ' text-shadow: 0 0 .6vh #000, 0 .3vh .5vh #000, 0 0 1.6vh rgba(255,140,40,.9); white-space: nowrap; opacity: 0; transition: opacity .35s; }'
    + ' #hintRing.on { opacity: 1; }'
    + ' @keyframes hFlaskLow { 0%, 100% { transform: scale(1); filter: none; } 50% { transform: scale(1.13); filter: drop-shadow(0 0 1.4vh #ff5a4a) brightness(1.25); } }'
    + ' #hFlask.low { animation: hFlaskLow .9s ease-in-out infinite; }';
  document.head.appendChild(st);
  function hint() {
    seen = true; hintT = 4.5; try { localStorage.setItem(KEY, '1'); } catch (e) {}
    if (!el) { el = document.createElement('div'); el.id = 'hintRing'; document.body.appendChild(el); }
    el.textContent = 'Окружили — рывок!'; el.classList.add('on');
  }
  const _cu = combatUpdate;
  combatUpdate = function (dt) {
    _cu(dt);
    if (hintT > 0 && (hintT -= dt) <= 0 && el) el.classList.remove('on');
    if ((acc += dt) < 0.2) return; acc = 0;
    const fight = typeof SHOP !== 'undefined' && SHOP.phase === 'fight' && P.dead <= 0 && !(typeof LIMBO !== 'undefined' && LIMBO.on);
    // ---------- 3. Кнопка склянки пульсирует, когда здоровья половина и меньше (и склянка есть) ----------
    const fl = document.getElementById('hFlask');
    if (fl) fl.classList.toggle('low', !!(fight && P.hp <= 0.5 * P.maxHp && SHOP.flasks.heal > 0));
    if (seen || !fight || typeof DASH === 'undefined' || (window.NETC && NETC.on) || P.cd.dash > 0 || DASH.why()) return;
    let n = 0; for (const e of enemies) if (e.dieT == null && e.hp > 0 && gdist(P, e) < 210) n++;
    if (n >= 4) hint();
  };
  const _ui = combatUI;
  combatUI = function () {
    _ui();
    if (hintT > 0 && typeof DASH !== 'undefined') {
      const b = BTN.find(b => b.id === 'dash'); if (!b || b.x < 0) return;
      const q = (performance.now() / 600) % 1;
      ctx.save(); ctx.lineWidth = Math.max(3, b.r * 0.14);
      for (const k of [q, (q + 0.5) % 1]) { ctx.globalAlpha = 0.9 * (1 - k); ctx.strokeStyle = '#ffd95e'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * (1.05 + 0.7 * k), 0, 7); ctx.stroke(); }
      ctx.restore();
    }
  };
  window.TUNE = { warmWorld, warmRound, pinHero, evict, hint, get seen() { return seen; } };
})();
