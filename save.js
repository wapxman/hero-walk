// Сохранение забега (19.11): пройденные миры и волны, текущее место, золото, сумка, склянки.
// Уровень героя, очки, навыки и закалка кузницы сохраняет progress.js (progSave) — здесь вызываем его вместе.
// Сохраняем после каждого раунда, при смене мира, при выходе в меню и когда приложение уходит в фон.
// При запуске после выбора героя открывается карта «Путь героев»: коснуться медальона — продолжить там, где
// остановился, или переиграть пройденную главу. «Новая игра» в главном меню стирает всё (с подтверждением).
// v113: «Продолжить» есть только при сохранении; «Новая игра» → выбор героя → вступление → сразу мир 1 (схема экранов — в menu.js).
'use strict';
const SAVE = (() => {
  const key = () => 'hw_run_' + HERO_ID;
  const net = () => !!(window.NETC && NETC.on);
  const allOpen = () => !!window.ALL_WORLDS || /[?&]allworlds/.test(location.search);   // тестовая сборка: открыты все 10 миров
  let best = 0;   // сколько волн пройдено всего (самая дальняя точка)
  let ready = false;   // сохраняем только после того, как забег загружен (иначе пустое меню затрёт прогресс)
  function read() { try { const d = JSON.parse(localStorage.getItem(key())); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } }
  function save() {
    if (net() || !ready) return;
    // в бою сохраняем начало текущего раунда — после перезапуска раунд начнётся заново
    const w = SHOP.phase === 'fight' ? Math.max(0, (SHOP.roundFrom || wave + 1) - 1) : wave;
    best = Math.max(best, w);
    const d = { v: 1, wave: w, best, hp: Math.round(P.hp), mp: Math.round(P.mp), gold: Math.floor(SHOP.gold), bag: SHOP.bag.slice(), flasks: Object.assign({}, SHOP.flasks), led: SHOP.led, t: Date.now() };
    try { localStorage.setItem(key(), JSON.stringify(d)); } catch (e) {}
    if (typeof progSave === 'function') progSave();
  }
  // открыть главу c: текущую — с места остановки, пройденную — с начала.
  // w (v89) — начать с этого числа пройденных волн: медальон главы или пункт после волн 3, 6, 9 (бой с волны 4, 7, 10)
  function start(c, w) {
    ready = true;
    const d = read() || {};
    best = Math.max(best, d.best || 0);
    if (d.gold != null) SHOP.gold = d.gold;
    if (d.led && SHOP.led) for (const k in SHOP.led) if (typeof d.led[k] === 'number') SHOP.led[k] = d.led[k];   // учёт золота за забег
    if (Array.isArray(d.bag)) SHOP.bag = d.bag.filter(id => ALL[id]).slice(0, BAG_MAX);
    if (d.flasks) for (const k in SHOP.flasks) if (typeof d.flasks[k] === 'number') SHOP.flasks[k] = Math.max(0, Math.min(k === 'heal' ? 10 : 99, d.flasks[k] | 0));
    const curC = BAL.at((d.wave || 0) + 1).M;
    wave = w != null ? w : c === curC ? (d.wave || 0) : (c - 1) * BAL.WAVES;
    SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.roundFrom = wave + 1;
    enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = wave; ROUND.fin = null;
    if (typeof applyWorld === 'function') applyWorld(BAL.at(wave + 1).M);
    SHOP.recompute();
    // посреди мира — здоровье и мана из сохранения (лечение теперь за деньги); начало мира и переигрывание главы — полные
    const mid = w == null && c === curC && (d.wave || 0) % BAL.WAVES !== 0 && d.hp > 0;
    P.hp = mid ? Math.min(P.maxHp, d.hp) : P.maxHp;
    P.mp = mid && d.mp != null ? Math.min(P.maxMp, d.mp) : P.maxMp;
    SHOP.refresh();
    save();
  }
  // карта выбора главы после кнопки «В бой» у выбора героя
  function chooser() {
    if (net() || typeof PATHMAP === 'undefined') return;
    const d = read() || { wave: 0, best: 0 };
    best = Math.max(best, d.best || 0);
    const curC = Math.min(10, BAL.at((d.wave || 0) + 1).M), open = best >= BAL.WAVES * BAL.WORLDS ? 10 : Math.min(10, BAL.at(best + 1).M), done = Math.floor(best / BAL.WAVES);
    const t = curC - 1;
    const w = d.wave || 0;
    PATHMAP.show({ mode: 'select', wave: w, t0: posOf(w), t1: posOf(w), from: lastT(posOf(w)), litT: posOf(best), best: done, open: allOpen() ? 10 : Math.max(open, curC), openT: openT(best), onPick: (c, pw) => { start(c, pw); fight(); } });
    lastT(null, posOf(w));
  }
  // положение фишки на карте миров по числу пройденных волн: после волн 3, 6, 9 — промежуточные пункты, после босса — следующий медальон
  function posOf(w) { if (w <= 0) return 0; const a = BAL.at(w); return Math.min(9.75, a.W >= 10 ? BAL.at(w + 1).M - 1 : a.M - 1 + Math.floor(a.W / 3) / 4); }   // после босса — медальон следующего мира (после 10-го — снова первый, круг 2)
  // до какого места пути открыты промежуточные пункты: самая дальняя точка, до которой игрок доходил (второй круг и тестовая сборка — всё)
  function openT(b) { return allOpen() || b >= BAL.WAVES * BAL.WORLDS ? 99 : posOf(b); }
  // где фишка стояла в прошлый показ — оттуда она плавно идёт к новой точке
  function lastT(def, set) { const k = 'hw_mapt_' + HERO_ID; try { if (set != null) { localStorage.setItem(k, String(set)); return set; } const v = localStorage.getItem(k); return v == null ? def : +v; } catch (e) { return def; } }
  function wipe() {
    try { for (const k of Object.keys(localStorage)) if (/^hw_(run|prog|mapt)_/.test(k) || k === 'hw_cine') localStorage.removeItem(k); } catch (e) {}   // hw_cine — рассказы миров покажутся заново
    try { sessionStorage.setItem('hw_newgame', '1'); } catch (e) {}      // после перезагрузки — сразу выбор героя (menu.js), без лого и меню
    location.reload();
  }
  // есть ли сохранение у какого-нибудь героя; id героя с самым свежим
  function anySave() {
    let id = null, t = -1;
    try { for (const k of Object.keys(localStorage)) { const m = /^hw_run_(.+)$/.exec(k); if (!m) continue; let d = null; try { d = JSON.parse(localStorage.getItem(k)); } catch (e) {} if (d && typeof d === 'object' && (d.t || 0) > t) { t = d.t || 0; id = m[1]; } } } catch (e) {}
    return id;
  }
  // после «В бой» у выбора героя: новая игра — вступление и сразу первый бой мира 1 (перед ним рассказ мира — cine.js);
  // иначе карта миров. В тестовой сборке «все миры открыты» карта нужна и новой игре — на ней выбирают мир.
  function begin() {
    if (!window.NEWGAME) return chooser();
    window.NEWGAME = false;
    const go = () => { if (allOpen()) chooser(); else { start(1, 0); fight(); } };
    if (typeof CINE !== 'undefined') CINE.intro(go); else go();
  }
  // перед каждым боем — карта «Путь героев»: выбрать главу (текущую или пройденную) и нажать «Продолжить»
  let real = null, direct = false;
  function fight() { direct = true; try { real.call(SHOP); } finally { direct = false; } }
  function hook() {
    real = SHOP.startWave;
    SHOP.startWave = function () {
      // забег ещё не загружен (Enter в меню, «Магазин» → «В бой») — сначала карта и загрузка сохранения, иначе прогресс не пишется
      if (!direct && !ready && !net() && typeof PATHMAP !== 'undefined' && !PATHMAP.on && !/[?&](mode|auto)=/.test(location.search) && !(window.NETC && NETC.S && NETC.S.mode !== 'single')) { begin(); return; }
      if (direct || net() || !ready || typeof PATHMAP === 'undefined' || PATHMAP.on || (typeof LIMBO !== 'undefined' && LIMBO.on)) return real.apply(this, arguments);
      if (SHOP.phase !== 'rest' || P.dead > 0) return;
      if (typeof STORE !== 'undefined' && STORE.busy) return;      // ждём рекламу перед раундом (store.js) — бой начнётся сам, карту поверх не открываем (v115)
      // после босса карта уже показала переход в новую главу — второй раз подряд её не открываем: «В бой» сразу начинает бой (v99)
      if (SHOP.mapShown) { SHOP.mapShown = false; return real.apply(this, arguments); }
      if (SHOP.open) SHOP.closeShop();
      const curC = Math.min(10, BAL.at(wave + 1).M), open = best >= BAL.WAVES * BAL.WORLDS ? 10 : Math.max(curC, Math.min(10, BAL.at(best + 1).M)), t = curC - 1;
      const tw = posOf(wave);
      PATHMAP.show({ mode: 'select', wave, t0: tw, t1: tw, from: lastT(tw), litT: posOf(Math.max(best, wave)), best: Math.floor(best / BAL.WAVES), open: allOpen() ? 10 : open, openT: openT(Math.max(best, wave)), onPick: (c, pw) => { if (pw != null) start(c, pw); else if (c !== curC) start(c); fight(); } });
      lastT(null, tw);
    };
  }
  return { save, start, chooser, begin, anySave, wipe, read, hook, get best() { return best; } };
})();

// сохранение: конец раунда (бой → отдых), смена мира, уход приложения в фон, выход в меню
{
  let was = SHOP.phase;
  const _t = SHOP.tick;
  SHOP.tick = function (dt) {
    _t(dt);
    if (was === 'fight' && SHOP.phase === 'rest') SAVE.save();
    was = SHOP.phase;
  };
  if (typeof applyWorld === 'function') { const _a = applyWorld; applyWorld = function (m) { _a(m); if (wave > 0) SAVE.save(); }; }
  addEventListener('pagehide', () => { if (wave > 0) SAVE.save(); });
  // покупки, продажи, склянки, закрытие лавки — сразу сохраняем (приложение могут закрыть в любой момент)
  const after = (o, k) => { const f = o[k]; if (typeof f !== 'function') return; o[k] = function () { const r = f.apply(this, arguments); SAVE.save(); return r; }; };
  if (typeof buyItem === 'function') { const f = buyItem; buyItem = function (id) { const r = f(id); if (r) SAVE.save(); return r; }; }
  if (typeof sellItem === 'function') { const f = sellItem; sellItem = function (i) { const r = f(i); SAVE.save(); return r; }; }
  after(SHOP, 'buy'); after(SHOP, 'use'); after(SHOP, 'closeShop');
  document.addEventListener('visibilitychange', () => { if (document.hidden && wave > 0) SAVE.save(); });
  // «В главное меню» в паузе перезагружает страницу — сначала сохраняем
  for (const b of document.querySelectorAll('.mb')) b.addEventListener('pointerdown', () => { if (wave > 0) SAVE.save(); }, true);
  // кнопка «В бой» у выбора героя: открыть карту и выбрать главу
  const go = document.querySelector('#hSel .go');
  if (go) go.addEventListener('pointerdown', () => { if (!/[?&](mode|auto)=/.test(location.search) && !(window.NETC && NETC.S && NETC.S.mode !== 'single')) SAVE.begin(); });
  // главное меню, первая кнопка (подсвечена): есть сохранение — «Продолжить» героем из сохранения сразу на карту миров;
  // сохранения нет — «Новая игра» (выбор героя → вступление → мир 1)
  const mb = [...document.querySelectorAll('#mMain .b')].find(b => b.textContent === 'Играть');
  const saved = SAVE.anySave();
  if (mb) {
    mb.classList.add('hl'); mb.textContent = saved ? 'Продолжить' : 'Новая игра';
    mb.addEventListener('pointerdown', e => {
      e.stopImmediatePropagation(); e.stopPropagation();
      if (!saved) { if (window.MENU) MENU.openSelect('new'); return; }
      window.NEWGAME = false;
      if (!SAVE.read() && typeof setHero === 'function') setHero(saved);    // сохранение есть у другого героя — продолжаем им
      document.getElementById('mMain').style.display = 'none';
      if (window.NETC && NETC.S) NETC.S.mode = 'single';   // «Продолжить» — всегда одиночный забег, даже если до этого выбирали онлайн
      if (go) go.dispatchEvent(new PointerEvent('pointerdown'));   // как «В бой» у выбора героя: герой — сохранённый
    }, true);
  }
}

SAVE.hook();

// ---------- «Новая игра» в главном меню (с подтверждением) ----------
(function () {
  const main = document.getElementById('mMain'), btns = main && main.querySelector('.btns');
  if (!btns || !SAVE.anySave()) return;      // без сохранения «Новая игра» — это первая кнопка меню (выше), спрашивать не о чем
  const b = document.createElement('div'); b.className = 'b'; b.textContent = 'Новая игра';
  btns.insertBefore(b, btns.children[1] || null);
  const css = document.createElement('style');
  css.textContent = `#mNew { background: rgba(3,6,12,.75); }
  #mNew .pn { width: min(92vw, 90vh); padding: 3vh 4vh; border-radius: 2.4vh; background: rgba(10,22,40,.94); border: .4vh solid rgba(160,190,230,.4); color: #fff; }
  #mNew .pl { width: 40vh; height: 10vh; background: url(ui/h_plaque.webp${V}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold 3.4vh system-ui; letter-spacing: .1em; }
  #mNew .b { width: 30vh; height: 8.5vh; background: url(ui/h_button.webp${V}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center; font: bold 2.7vh system-ui; color: #ffe9a8; cursor: pointer; }`;
  document.head.appendChild(css);
  const cf = document.createElement('div'); cf.className = 'mn'; cf.id = 'mNew';
  cf.style.cssText = 'display:none;align-items:center;justify-content:center;z-index:70;font-family:system-ui';
  cf.innerHTML = '<div class="pn" style="text-align:center;gap:2vh;display:flex;flex-direction:column;align-items:center">' +
    '<div class="pl">НОВАЯ ИГРА</div><div style="font-size:2.6vh;max-width:70vh;line-height:1.4">Начать заново? Прогресс будет потерян: пройденные миры, уровень героя, золото, предметы, ' +
    'прокачка и склянки будут стёрты.</div><div style="display:flex;gap:3vh"><div class="b" data-y>Начать заново</div><div class="b" data-n>Отмена</div></div></div>';
  document.body.appendChild(cf);
  const stop = e => e.stopPropagation();
  for (const ev of ['touchstart', 'mousedown']) cf.addEventListener(ev, stop, { passive: true });
  b.addEventListener('pointerdown', e => { e.stopPropagation(); cf.style.display = 'flex'; });
  cf.querySelector('[data-y]').addEventListener('pointerdown', e => { e.stopPropagation(); SAVE.wipe(); });
  cf.querySelector('[data-n]').addEventListener('pointerdown', e => { e.stopPropagation(); cf.style.display = 'none'; });
})();

// ---------- кнопка и жест «Назад» на Android (v113): раньше закрывали игру посреди боя ----------
// заставка — «Пропустить»; лавка — закрыть; в игре — пауза (и обратно); в главном меню и на выборе героя — свернуть приложение
window.androidBack = function () {
  const vis = id => { const e = document.getElementById(id); return !!e && getComputedStyle(e).display !== 'none'; };
  if (typeof CINE !== 'undefined' && CINE.on) { CINE.skip(); return true; }
  if (vis('stWin') || vis('stFake') || document.getElementById('mSplash')) return true;
  if (vis('mNew')) { document.getElementById('mNew').style.display = 'none'; return true; }
  if (vis('mSet')) { document.querySelector('#mSet .b').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); return true; }
  if (vis('mMain')) return false;
  if (vis('hSel')) { if (window.MENU) { MENU.showMain(); return true; } return false; }
  if (typeof PATHMAP !== 'undefined' && PATHMAP.on) return true;
  if (SHOP.open) { SHOP.closeShop(); return true; }
  if (typeof SHOP.togglePause === 'function') { SHOP.togglePause(); return true; }
  return false;
};
