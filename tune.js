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
  const touch = im => { try { g.drawImage(im, 0, 0, 1, 1, 0, 0, 1, 1); } catch (e) {} };
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
    for (const k in c.mul) {
      const a = c.mul[k], im = a.img; if (!im || a._pin || !(im instanceof HTMLImageElement)) continue; a._pin = im;
      const go = () => createImageBitmap(im).then(bm => { if (a._pin === im && a.img === im) a.img = bm; else if (bm.close) bm.close(); }).catch(() => { a._pin = null; });
      if (im.complete && im.naturalWidth) go(); else im.addEventListener('load', go, { once: true });
    }
  }
  function unpin(c) { if (c && c.mul) for (const k in c.mul) { const a = c.mul[k]; if (a._pin) { const bm = a.img; a.img = a._pin; a._pin = null; if (bm && bm !== a.img && bm.close) bm.close(); } } }
  function pinHero() { try { for (const c of [typeof GANFAUL !== 'undefined' && GANFAUL, typeof ARCHER !== 'undefined' && ARCHER]) if (c) { if (c === HERO) pin(c); else unpin(c); } } catch (e) {} }
  // перед раундом с боссом его листы раскодируем ещё раз (браузер мог выбросить их из памяти с момента входа в мир)
  function rewarm(c) { if (c && c.mul) for (const k in c.mul) { const im = c.mul[k].img; if (im instanceof HTMLImageElement && im.complete && im.naturalWidth && im.decode) im.decode().then(() => touch(im)).catch(() => {}); } }
  // закрепляем сразу при выборе героя (в меню), а не в первом бою
  if (typeof setHero === 'function') { const _sh = setHero; setHero = function () { const r = _sh.apply(this, arguments); setTimeout(pinHero, 0); return r; }; }
  setTimeout(pinHero, 0);
  const _need = needChar;
  needChar = function (c) { const r = _need(c); warmChar(c); return r; };
  const SUMMON = { 2: ['sk_golem'], 3: ['sk_idol'], 7: ['ml_clone', 'mirrorcopy'], 9: ['sk_spirit'], 10: ['sk_golem_void'] };   // кого зовут боссы мира
  function warmTypes(types) {
    for (const t of new Set(types)) {
      const k = t && KIND[t]; if (!k || !CHARS[k.ch]) continue;
      needChar(CHARS[k.ch]);
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
  const _aw = applyWorld;
  applyWorld = function (m) { const r = _aw.apply(this, arguments); try { warmWorld(m); } catch (e) {} return r; };
  // мир, с которого игра началась или продолжилась (applyWorld для него мог пройти раньше), и раунд, который начинается
  setTimeout(() => { try { warmWorld(typeof WORLD === 'number' ? WORLD : 1); } catch (e) {} }, 0);
  { const _sw = SHOP.startWave; SHOP.startWave = function () { try { warmWorld(BAL.at(wave + 1).M); warmRound(wave + 1); } catch (e) {} pinHero(); return _sw.apply(this, arguments); }; }
  // раунд кончился (открылась лавка) — готовим следующий заранее
  { let ph = ''; setInterval(() => { if (typeof SHOP === 'undefined' || SHOP.phase === ph) return; ph = SHOP.phase; if (ph === 'rest' && !(window.NETC && NETC.on)) try { warmRound(wave + 1); } catch (e) {} }, 500); }

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
  window.TUNE = { warmWorld, warmRound, pinHero, hint, get seen() { return seen; } };
})();
