// Сохранение забега (19.11): пройденные миры и волны, текущее место, золото, сумка, фласки.
// Уровень героя, очки, навыки и закалка кузницы сохраняет progress.js (progSave) — здесь вызываем его вместе.
// Сохраняем после каждого раунда, при смене мира, при выходе в меню и когда приложение уходит в фон.
// При запуске после выбора героя открывается карта «Путь героев»: коснуться медальона — продолжить там, где
// остановился, или переиграть пройденную главу. «Новая игра» в главном меню стирает всё (с подтверждением).
'use strict';
const SAVE = (() => {
  const key = () => 'hw_run_' + HERO_ID;
  const net = () => !!(window.NETC && NETC.on);
  let best = 0;   // сколько волн пройдено всего (самая дальняя точка)
  let ready = false;   // сохраняем только после того, как забег загружен (иначе пустое меню затрёт прогресс)
  function read() { try { const d = JSON.parse(localStorage.getItem(key())); return d && typeof d === 'object' ? d : null; } catch (e) { return null; } }
  function save() {
    if (net() || !ready) return;
    // в бою сохраняем начало текущего раунда — после перезапуска раунд начнётся заново
    const w = SHOP.phase === 'fight' ? Math.max(0, (SHOP.roundFrom || wave + 1) - 1) : wave;
    best = Math.max(best, w);
    const d = { v: 1, wave: w, best, gold: Math.floor(SHOP.gold), bag: SHOP.bag.slice(), flasks: Object.assign({}, SHOP.flasks), t: Date.now() };
    try { localStorage.setItem(key(), JSON.stringify(d)); } catch (e) {}
    if (typeof progSave === 'function') progSave();
  }
  // открыть главу c: текущую — с места остановки, пройденную — с начала
  function start(c) {
    ready = true;
    const d = read() || {};
    best = Math.max(best, d.best || 0);
    if (d.gold != null) SHOP.gold = d.gold;
    if (Array.isArray(d.bag)) SHOP.bag = d.bag.filter(id => ALL[id]).slice(0, BAG_MAX);
    if (d.flasks) for (const k in SHOP.flasks) if (typeof d.flasks[k] === 'number') SHOP.flasks[k] = Math.max(0, Math.min(99, d.flasks[k] | 0));
    const curC = BAL.at((d.wave || 0) + 1).M;
    wave = c === curC ? (d.wave || 0) : (c - 1) * BAL.WAVES;
    SHOP.phase = 'rest'; SHOP.restT = 0; SHOP.roundFrom = wave + 1;
    enemies.length = 0; ROUND.queue.length = 0; ROUND.endW = wave; ROUND.fin = null;
    if (typeof applyWorld === 'function') applyWorld(BAL.at(wave + 1).M);
    SHOP.recompute(); P.hp = P.maxHp; P.mp = P.maxMp; SHOP.refresh();
    save();
  }
  // карта выбора главы после кнопки «В бой» у выбора героя
  function chooser() {
    if (net() || typeof PATHMAP === 'undefined') return;
    const d = read() || { wave: 0, best: 0 };
    best = Math.max(best, d.best || 0);
    const curC = Math.min(10, BAL.at((d.wave || 0) + 1).M), open = Math.min(10, BAL.at(best + 1).M), done = Math.floor(best / BAL.WAVES);
    const t = curC - 1;
    PATHMAP.show({ mode: 'select', t0: t, t1: t, best: done, open: Math.max(open, curC), onPick: c => { start(c); fight(); } });
  }
  function wipe() {
    try { for (const k of Object.keys(localStorage)) if (/^hw_(run|prog)_/.test(k)) localStorage.removeItem(k); } catch (e) {}
    location.reload();
  }
  // перед каждым боем — карта «Путь героев»: выбрать главу (текущую или пройденную) и нажать «Продолжить»
  let real = null, direct = false;
  function fight() { direct = true; try { real.call(SHOP); } finally { direct = false; } }
  function hook() {
    real = SHOP.startWave;
    SHOP.startWave = function () {
      if (direct || net() || !ready || typeof PATHMAP === 'undefined' || PATHMAP.on || (typeof LIMBO !== 'undefined' && LIMBO.on)) return real.apply(this, arguments);
      if (SHOP.phase !== 'rest' || P.dead > 0) return;
      if (SHOP.open) SHOP.closeShop();
      const curC = Math.min(10, BAL.at(wave + 1).M), open = Math.max(curC, Math.min(10, BAL.at(best + 1).M)), t = curC - 1;
      PATHMAP.show({ mode: 'select', t0: t, t1: t, best: Math.floor(best / BAL.WAVES), open, onPick: c => { if (c !== curC) start(c); fight(); } });
    };
  }
  return { save, start, chooser, wipe, read, hook, get best() { return best; } };
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
  // покупки, продажи, фласки, закрытие лавки — сразу сохраняем (приложение могут закрыть в любой момент)
  const after = (o, k) => { const f = o[k]; if (typeof f !== 'function') return; o[k] = function () { const r = f.apply(this, arguments); SAVE.save(); return r; }; };
  if (typeof buyItem === 'function') { const f = buyItem; buyItem = function (id) { const r = f(id); if (r) SAVE.save(); return r; }; }
  if (typeof sellItem === 'function') { const f = sellItem; sellItem = function (i) { const r = f(i); SAVE.save(); return r; }; }
  after(SHOP, 'buy'); after(SHOP, 'use'); after(SHOP, 'closeShop');
  document.addEventListener('visibilitychange', () => { if (document.hidden && wave > 0) SAVE.save(); });
  // «В главное меню» в паузе перезагружает страницу — сначала сохраняем
  for (const b of document.querySelectorAll('.mb')) b.addEventListener('pointerdown', () => { if (wave > 0) SAVE.save(); }, true);
  // кнопка «В бой» у выбора героя: открыть карту и выбрать главу
  const go = document.querySelector('#hSel .go');
  if (go) go.addEventListener('pointerdown', () => { if (!/[?&](mode|auto)=/.test(location.search)) setTimeout(() => SAVE.chooser(), 60); });
}

SAVE.hook();

// ---------- «Новая игра» в главном меню (с подтверждением) ----------
(function () {
  const main = document.getElementById('mMain'), btns = main && main.querySelector('.btns');
  if (!btns) return;
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
    '<div class="pl">НОВАЯ ИГРА</div><div style="font-size:2.6vh;max-width:70vh;line-height:1.4">Начать заново? Пройденные миры, уровень героя, золото, предметы, ' +
    'прокачка и фласки будут стёрты.</div><div style="display:flex;gap:3vh"><div class="b" data-y>Начать заново</div><div class="b" data-n>Отмена</div></div></div>';
  document.body.appendChild(cf);
  const stop = e => e.stopPropagation();
  for (const ev of ['touchstart', 'mousedown']) cf.addEventListener(ev, stop, { passive: true });
  b.addEventListener('pointerdown', e => { e.stopPropagation(); cf.style.display = 'flex'; });
  cf.querySelector('[data-y]').addEventListener('pointerdown', e => { e.stopPropagation(); SAVE.wipe(); });
  cf.querySelector('[data-n]').addEventListener('pointerdown', e => { e.stopPropagation(); cf.style.display = 'none'; });
})();
