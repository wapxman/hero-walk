// Вход в игру: заставка с логотипом → главное меню (Играть, Онлайн, Герои, Магазин, Настройки) → выбор героя.
// Все картинки нарисованы в ChatGPT: ui/logo.webp, ui/menu_bg.webp, ui/card_mage.webp, ui/card_archer.webp;
// кнопки и таблички — прежние ui/h_button.webp и ui/h_plaque.webp. Кодом выводится только текст.
// Экран выбора героя (#hSel из heroes.js) переделан в большие карточки; режимы онлайна — из net/client.js.
'use strict';
(function menu() {
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // ---------- настройки (сохраняются на устройстве) ----------
  const SET = { sfx: get('hw_sfx', '1') === '1', cam: +get('hw_cam', CFG.cam || 1.65), q: get('hw_q', 'hi') };
  CFG.cam = SET.cam;
  if (SET.q === 'lo') { DPR_CAP = 1.25; resize(); }
  const _play = play;
  play = function (n, vol, rate) { if (SET.sfx) _play(n, vol, rate); };

  const css = document.createElement('style');
  css.textContent = `
  .mn, .mn * { box-sizing: border-box; font-family: system-ui, sans-serif; user-select: none; -webkit-user-select: none; }
  .mn { position: fixed; inset: 0; z-index: 12; color: #fff; text-shadow: 0 1px 3px #000, 0 0 2px #000; }
  .mn .tap { cursor: pointer; touch-action: manipulation; }
  #mSplash { background: #000; display: flex; align-items: center; justify-content: center; z-index: 30; transition: opacity .7s; }
  #mSplash i { width: min(80vw, 110vh); aspect-ratio: 3 / 2; background: ${U('logo')} center / contain no-repeat; opacity: 0; transform: scale(.92);
    transition: opacity 1s, transform 2.4s ease-out; }
  #mSplash.on i { opacity: 1; transform: scale(1); }
  #mMain { background: #05080e ${U('menu_bg')} center / cover no-repeat; display: none; }
  #mMain .logo { position: absolute; left: 4vw; top: 2vh; width: min(34vw, 54vh); aspect-ratio: 3 / 2; background: ${U('logo')} center / contain no-repeat; }
  #mMain .btns { position: absolute; left: 6vw; top: 40vh; display: flex; flex-direction: column; gap: 1.2vh; }
  #mMain .b { width: 40vh; height: 9vh; background: ${U('h_button')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
    font: bold 3.3vh system-ui; color: #ffe9a8; letter-spacing: .06em; transition: transform .12s; }
  #mMain .b:active { transform: scale(.96); }
  #mMain .ver { position: absolute; right: 2vh; bottom: 1.6vh; font-size: 1.7vh; opacity: .7; }
  #mSet { display: none; align-items: center; justify-content: center; background: rgba(3,6,12,.72); z-index: 13; }
  #mSet .pn { width: min(92vw, 84vh); padding: 3vh 4vh 3.4vh; border-radius: 2.4vh; background: rgba(10,22,40,.92); border: .4vh solid rgba(160,190,230,.4);
    display: flex; flex-direction: column; gap: 1.6vh; align-items: stretch; }
  #mSet .pl { align-self: center; width: 40vh; height: 10vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex; align-items: center;
    justify-content: center; font: bold 3.4vh system-ui; letter-spacing: .1em; }
  #mSet .row { display: flex; align-items: center; justify-content: space-between; gap: 2vh; font: bold 2.6vh system-ui; }
  #mSet .opt { display: flex; gap: 1vh; }
  #mSet .o { min-width: 13vh; height: 6vh; padding: 0 1.4vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex; align-items: center;
    justify-content: center; font: bold 2.1vh system-ui; opacity: .55; }
  #mSet .o.on { opacity: 1; color: #ffe9a8; filter: drop-shadow(0 0 1vh rgba(255,226,122,.5)); }
  #mSet .b { align-self: center; margin-top: 1vh; width: 34vh; height: 9vh; background: ${U('h_button')} center / 100% 100% no-repeat; display: flex;
    align-items: center; justify-content: center; font: bold 3vh system-ui; color: #ffe9a8; }
  /* выбор героя: большие карточки из ChatGPT */
  #hSel { background: #05080e ${U('menu_bg')} center / cover no-repeat !important; }
  #hSel::before { content: ''; position: absolute; inset: 0; background: rgba(3,6,12,.6); z-index: -1; }
  #hSel .card { width: min(30vh, 40vw) !important; padding: 0 !important; background: none !important; border: none !important; gap: .4vh !important; position: relative; }
  #hSel .card i { width: 100% !important; height: auto !important; aspect-ratio: 2 / 3; background-size: 100% 100% !important; border-radius: 1.4vh;
    filter: brightness(.72) saturate(.85); transition: filter .2s; }
  #hSel .card.on i { filter: none; box-shadow: 0 0 4vh rgba(255,226,122,.5); }
  #hSel .card b { position: absolute; left: 0; right: 0; top: calc(min(30vh, 40vw) * 1.5 * .862); text-align: center; font-size: 3vh !important; color: #ffe9a8; }
  #hSel .card em { margin-top: .2vh; }
  #hSel .card ul { display: none; }
  #hSel .card.on ul { display: block; position: absolute; right: 106%; top: 8%; width: 30vh; background: rgba(8,16,32,.85); border-radius: 1.4vh;
    padding: 1.4vh 1.6vh 1.4vh 3.4vh; border: .3vh solid rgba(160,190,230,.35); }
  #hSel .row { gap: 6vh !important; }
  #hSel .row .card:last-child.on ul { right: auto; left: 106%; }
  #hSel .back { position: absolute; left: 2.4vh; top: 2.4vh; width: 22vh; height: 7vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex;
    align-items: center; justify-content: center; font: bold 2.4vh system-ui; cursor: pointer; }
  `;
  document.head.appendChild(css);
  const mk = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent.appendChild(e); return e; };
  const tap = (e, fn) => {
    e.classList.add('tap');
    for (const ev of ['touchstart', 'mousedown']) e.addEventListener(ev, x => x.stopPropagation(), { passive: true });
    e.addEventListener('pointerdown', x => { x.stopPropagation(); fn(); });
  };
  const block = el => { for (const ev of ['touchstart', 'mousedown', 'pointerdown']) el.addEventListener(ev, x => x.stopPropagation(), { passive: true }); };

  // ---------- карточки героев ----------
  const sel = document.getElementById('hSel');
  const CARD = { mage: 'card_mage', archer: 'card_archer' };
  sel.querySelectorAll('.card').forEach((c, i) => { const id = Object.keys(HEROES)[i]; c.querySelector('i').style.backgroundImage = U(CARD[id] || 'card_mage'); });
  const back = mk('div', 'back', sel, '← Меню'); back.addEventListener('pointerdown', () => { sel.style.display = 'none'; showMain(); });
  const modes = sel.querySelector('.modes'), modeBtns = modes ? [...modes.querySelectorAll('.md')] : [];
  const plaque = sel.querySelector('.pl');
  // режим экрана выбора: play — одиночная игра, online — дуэль или кооператив, view — просто посмотреть героев
  function openSelect(kind) {
    hideMain(); sel.style.display = 'flex';
    plaque.textContent = kind === 'view' ? 'ГЕРОИ' : 'ВЫБЕРИ ГЕРОЯ';
    const go = sel.querySelector('.go'); go.style.display = kind === 'view' ? 'none' : 'flex';
    if (modes) {
      modes.style.display = kind === 'online' ? 'flex' : 'none';
      if (kind === 'play') modeBtns[0].dispatchEvent(new PointerEvent('pointerdown'));
      if (kind === 'online' && NETC.S.mode === 'single') modeBtns[1].dispatchEvent(new PointerEvent('pointerdown'));
    }
  }

  // ---------- главное меню ----------
  const main = mk('div', 'mn', document.body); main.id = 'mMain'; block(main);
  mk('div', 'logo', main);
  const btns = mk('div', 'btns', main);
  const MENU = [['Играть', () => openSelect('play')], ['Онлайн', () => openSelect('online')], ['Герои', () => openSelect('view')],
    ['Магазин', () => { hideMain(); SHOP.openShop(); }], ['Настройки', () => openSettings()]];
  for (const [t, fn] of MENU) tap(mk('div', 'b', btns, t), fn);
  mk('div', 'ver', main, 'v' + V.replace(/\D/g, ''));
  function showMain() { main.style.display = 'block'; sel.style.display = 'none'; }
  function hideMain() { main.style.display = 'none'; }
  // магазин из меню: после закрытия — обратно в меню, пока бой не начат
  const _close = SHOP.closeShop;
  SHOP.closeShop = function () { _close(); if (wave === 0 && !started) showMain(); };
  let started = false;
  sel.querySelector('.go').addEventListener('pointerdown', () => { started = true; });
  const _start = SHOP.startWave;
  SHOP.startWave = function () { started = true; hideMain(); return _start.apply(this, arguments); };

  // ---------- настройки ----------
  const st = mk('div', 'mn', document.body); st.id = 'mSet'; block(st);
  const pn = mk('div', 'pn', st);
  mk('div', 'pl', pn, 'НАСТРОЙКИ');
  function option(label, list, cur, fn) {
    const r = mk('div', 'row', pn, '<span>' + label + '</span>'), o = mk('div', 'opt', r), els = [];
    for (const [v, t] of list) { const e = mk('div', 'o', o, t); els.push([v, e]); tap(e, () => { fn(v); els.forEach(([x, y]) => y.classList.toggle('on', x === v)); }); }
    els.forEach(([x, y]) => y.classList.toggle('on', x === cur()));
  }
  option('Музыка', [[true, 'Вкл'], [false, 'Выкл']], () => mus.on, v => { if (mus.on !== v) musicToggle(); });
  option('Звуки', [[true, 'Вкл'], [false, 'Выкл']], () => SET.sfx, v => { SET.sfx = v; put('hw_sfx', v ? '1' : '0'); });
  option('Камера', [[1.35, 'Ближе'], [1.65, 'Обычно'], [1.95, 'Дальше']], () => SET.cam, v => { SET.cam = CFG.cam = v; put('hw_cam', v); });
  option('Графика', [['hi', 'Чётко'], ['lo', 'Экономно']], () => SET.q, v => { SET.q = v; put('hw_q', v); DPR_CAP = v === 'lo' ? 1.25 : 2; resize(); });
  tap(mk('div', 'b', pn, 'Готово'), () => { st.style.display = 'none'; if (!started) showMain(); });
  function openSettings() { st.style.display = 'flex'; }
  // в паузе: настройки и выход в меню вместо «Сменить героя»
  if (SHOP.el && SHOP.el.pause) {
    const p = SHOP.el.pause, tip = p.querySelector('.tip');
    for (const b of p.querySelectorAll('.mb')) if (b.textContent === 'Сменить героя') b.textContent = 'В главное меню';
    const s = document.createElement('div'); s.className = 'mb bg'; s.textContent = 'Настройки';
    s.addEventListener('pointerdown', x => { x.stopPropagation(); openSettings(); });
    p.insertBefore(s, tip);
  }

  // ---------- заставка ----------
  const sp = mk('div', 'mn', document.body); sp.id = 'mSplash'; block(sp);
  mk('i', '', sp);
  sel.style.display = 'none';
  const auto = /[?&](mode|auto)=/.test(location.search);    // ссылки проверки онлайна идут сразу в игру
  let done = false;
  function endSplash() {
    if (done) return; done = true;
    sp.style.opacity = '0'; setTimeout(() => sp.remove(), 750);
    if (auto) sel.style.display = 'flex'; else showMain();
  }
  const logo = new Image();
  logo.onload = () => requestAnimationFrame(() => sp.classList.add('on'));
  logo.src = 'ui/logo.webp' + V;
  sp.addEventListener('pointerdown', endSplash);
  setTimeout(endSplash, auto ? 50 : 2600);
})();
