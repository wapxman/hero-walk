// Вход в игру: заставка с логотипом → главное меню → выбор героя.
// Схема экранов (v113):
//   запуск: лого игры → лого студии (оба пропускаются касанием) → главное меню; больше лого нигде не повторяются
//   главное меню: [«Продолжить» — только если есть сохранение, первая и подсвеченная], «Новая игра», «Онлайн», «Герои», «Магазин»,
//                 «Настройки»; справа сверху — «PRO» и «История» (вступление ещё раз)
//   «Новая игра»: [есть сохранение — вопрос «Начать заново?»] → выбор героя → «В бой» → вступление («Пропустить») → рассказ мира 1 → бой
//   «Продолжить»: карта миров с фишкой на месте остановки → бой; без лого и вступления
//   пауза → «В главное меню»: главное меню без лого; «Продолжить» оттуда — та же точка (раунд, на котором вышли)
// Все картинки нарисованы в ChatGPT: ui/logo.webp, ui/menu_bg.webp, ui/card_mage.webp, ui/card_archer.webp;
// кнопки и таблички — прежние ui/h_button.webp и ui/h_plaque.webp. Кодом выводится только текст.
// Экран выбора героя (#hSel из heroes.js) переделан в большие карточки; режимы онлайна — из net/client.js.
'use strict';
(function menu() {
  const U = n => 'url(ui/' + n + '.webp' + V + ')';
  // лого игры (v116: TEN WORLDS): из заставок Клауди (cine/logo_game.webp), иначе прежнее
  const LOGO = typeof CINE_FILES !== 'undefined' && CINE_FILES['logo_game.webp'] ? 'cine/logo_game.webp' : 'ui/logo.webp', LOGO_BG = 'url(' + LOGO + V + ')';
  const get = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const put = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  // ---------- настройки (сохраняются на устройстве) ----------
  // v124 (Создатель 27.11): камера — только «Обычно» и «Чуть дальше» (дальняя давала преимущество). Прежние «Близко» (1.35) и
  // «Далеко» (1.95) из сохранённых настроек приводятся к ближайшему из двух.
  const CAMS = [[1.65, 'Обычно'], [1.8, 'Чуть дальше']];
  const camFix = v => (+v > 1.72 ? 1.8 : 1.65);
  const SET = { sfx: get('hw_sfx', '1') === '1', cam: camFix(get('hw_cam', 1.65)), q: get('hw_q', 'hi') };
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
  #mSplash i { width: min(70vw, 86vh); aspect-ratio: 1 / 1; background: ${LOGO_BG} center / contain no-repeat; opacity: 0; transform: scale(.92);
    transition: opacity 1s, transform 2.4s ease-out; }
  #mSplash.on i { opacity: 1; transform: scale(1); }
  #mMain { background: #05080e ${U('menu_bg')} center / cover no-repeat; display: none; }
  /* v124 (Создатель 28.11): лого TEN WORLDS не квадратное (1243×848) — место под него шире, и стоит оно по центру столбца кнопок
     (столбец: left 6vw, ширина 40vh → середина 6vw + 20vh). «Статистика» перенесена в столбец (tally.js), поэтому кнопки чуть ниже ростом. */
  #mMain .logo { position: absolute; left: calc(6vw + 20vh - 24vh); top: 1.5vh; width: 48vh; aspect-ratio: 1243 / 848; background: ${LOGO_BG} center / contain no-repeat; }
  #mMain .btns { position: absolute; left: 6vw; top: 36vh; display: flex; flex-direction: column; gap: 1vh; }
  #mMain .b { width: 40vh; height: 9vh; background: ${U('h_button')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
    font: bold 3.3vh system-ui; color: #ffe9a8; letter-spacing: .06em; transition: transform .12s; }
  #mMain .b:active { transform: scale(.96); }
  #mMain .btns .b { height: 7.6vh; }
  #mMain .btns .b.hl { color: #fff7cf; filter: brightness(1.22) drop-shadow(0 0 1.5vh rgba(255,226,122,.8)); transform: scale(1.07); transform-origin: left center; margin-bottom: .5vh; }
  #mMain .btns .b.hl:active { transform: scale(1.02); }
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
  /* v125: в ряду три карточки (третья — «Скоро», новый герой), список умений выбранного героя — всегда слева от ряда.
     Ширина карточки --cw: 30vh, но не больше 17,6 % ширины экрана — чтобы список и три карточки влезали и на планшете 4:3. */
  #hSel { --cw: min(30vh, 17.6vw); }
  #hSel .card { width: var(--cw) !important; padding: 0 !important; background: none !important; border: none !important; gap: .4vh !important; position: relative; }
  #hSel .card i { width: 100% !important; height: auto !important; aspect-ratio: 2 / 3; background-size: 100% 100% !important; border-radius: 1.4vh;
    filter: brightness(.72) saturate(.85); transition: filter .2s; }
  #hSel .card.on i { filter: none; box-shadow: 0 0 4vh rgba(255,226,122,.5); }
  #hSel .card b { position: absolute; left: 0; right: 0; top: calc(var(--cw) * 1.5 * .862); text-align: center; font-size: min(3vh, calc(var(--cw) * .1)) !important; color: #ffe9a8; }
  #hSel .card em { margin-top: .2vh; }
  #hSel .card ul { display: none; }
  #hSel .card.on ul { display: block; position: absolute; right: 106%; top: 8%; width: var(--cw); box-sizing: border-box; background: rgba(8,16,32,.85); border-radius: 1.4vh;
    padding: 1.4vh 1.6vh 1.4vh 3.4vh; border: .3vh solid rgba(160,190,230,.35); }
  #hSel .card ul .nm { list-style: none; margin: 0 0 .5vh -1.8vh; font: bold 2.3vh system-ui; color: #ffe9a8; }
  #hSel .row { gap: calc(var(--cw) * .2) !important; }
  #hSel .row .card:nth-child(2).on ul { right: 221.3%; }      /* вторая карточка: список там же, слева от первой (с учётом увеличения выбранной карточки на 4 %) */
  /* «Скоро»: силуэт нового героя с анонса Клауди (ui/teaser/hero_card.webp — вырез из ui/teaser/hero.webp); кодом — только рамка, тень под надписью и текст */
  #hSel .card.soon i { position: relative; box-sizing: border-box; border: .3vh solid rgba(226,186,104,.75); filter: brightness(.9); overflow: hidden; }
  #hSel .card.soon i::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 30%; background: linear-gradient(rgba(0,0,0,0), rgba(0,0,0,.88)); }
  #hSel .card.soon b { color: #ffcf5a; letter-spacing: .3vh; text-transform: uppercase; font-family: Georgia, serif; }
  #hSel .card.soon:active i { filter: brightness(1.1); }
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
  sel.querySelectorAll('.card').forEach((c, i) => {
    const id = Object.keys(HEROES)[i]; c.querySelector('i').style.backgroundImage = U(CARD[id] || 'card_mage');
    // v125: список умений стоит слева от ряда у обоих героев — сверху в нём имя героя, чтобы было видно, чьи это умения
    const ul = c.querySelector('ul'), nm = document.createElement('li'); nm.className = 'nm'; nm.textContent = HEROES[id].name; ul.insertBefore(nm, ul.firstChild);
  });
  // v125 (Создатель 28.11): третья карточка — силуэт нового героя и надпись «Скоро». Выбрать её нельзя; нажатие открывает анонс на весь экран (teaser.js)
  {
    const c = mk('div', 'card soon', sel.querySelector('.row'), '<i></i><b>Скоро</b><em>Новый герой</em>');
    let got = false;
    const img = () => { if (!got) { got = true; c.querySelector('i').style.backgroundImage = 'url(ui/teaser/hero_card.webp' + V + ')'; } };
    window.SOON_CARD = { img };      // картинка подставляется, когда выбор героя первый раз открыт (на старте игры не грузится)
    c.addEventListener('pointerdown', e => { e.stopPropagation(); if (typeof TEASER !== 'undefined') TEASER.open(0); });
  }
  const back = mk('div', 'back', sel, '← Меню'); back.addEventListener('pointerdown', () => { sel.style.display = 'none'; showMain(); });
  const modes = sel.querySelector('.modes'), modeBtns = modes ? [...modes.querySelectorAll('.md')] : [];
  const plaque = sel.querySelector('.pl');
  // режим экрана выбора: play — одиночная игра, online — дуэль или кооператив, view — просто посмотреть героев
  // new — «Новая игра»: как play, но после «В бой» идёт вступление и сразу мир 1 (save.js), без карты миров
  function openSelect(kind) {
    window.NEWGAME = kind === 'new'; if (kind === 'new') kind = 'play';
    window.SEL_KIND = kind;      // v124: зачем открыт выбор героя — play, online (дальше зал ожидания игры вдвоём, net/team.js) или view
    hideMain(); sel.style.display = 'flex'; if (typeof LAZY !== 'undefined') LAZY.start();
    if (window.SOON_CARD) SOON_CARD.img();
    plaque.textContent = kind === 'view' ? 'ГЕРОИ' : 'ВЫБЕРИ ГЕРОЯ';
    const go = sel.querySelector('.go'); go.style.display = kind === 'view' ? 'none' : 'flex';
    { const t = kind === 'online' ? 'ДАЛЕЕ' : 'В БОЙ'; if ((go.dataset.ru || go.textContent) !== t) { delete go.dataset.ru; go.textContent = t; } }
    // v124 (Создатель 27.11): в «Онлайн» больше нет ни одиночной игры, ни дуэли — только игра вдвоём; ряд кнопок режима скрыт всегда
    if (modes) { modes.style.display = 'none'; if (NETC.S.mode !== 'single') modeBtns[0].dispatchEvent(new PointerEvent('pointerdown')); }
  }

  // ---------- главное меню ----------
  const main = mk('div', 'mn', document.body); main.id = 'mMain'; block(main);
  mk('div', 'logo', main);
  const btns = mk('div', 'btns', main);
  const MENU = [['Играть', () => openSelect('play')], ['Онлайн', () => openSelect('online')], ['Герои', () => openSelect('view')],
    ['Магазин', () => { hideMain(); SHOP.openShop(); }], ['Настройки', () => openSettings()]];
  for (const [t, fn] of MENU) tap(mk('div', 'b', btns, t), fn);
  mk('div', 'ver', main, 'v' + V.replace(/\D/g, ''));
  // музыка главного экрана — m7; с первым боем включается следующий трек
  const MENU_TRACK = Math.max(0, MUSIC.findIndex(m => m[0] === 'm7')); let menuMus = false;      // v124: по имени, а не по номеру — список треков меняется
  function menuMusic() {
    if (typeof mus === 'undefined' || started) return; menuMus = true;
    if (mus.el) { if (mus.i !== MENU_TRACK) { mus.i = MENU_TRACK; musicLoad(); } } else store('hw_mus_i', MENU_TRACK);
  }
  function showMain() { window.NEWGAME = false; window.SEL_KIND = ''; main.style.display = 'block'; sel.style.display = 'none'; menuMusic(); if (typeof LAZY !== 'undefined') setTimeout(LAZY.start, 120); }      // v120: меню на экране — в фоне грузим то, что нужно для игры
  window.MENU = { openSelect, showMain };
  function hideMain() { main.style.display = 'none'; }
  // магазин из меню: после закрытия — обратно в меню, пока бой не начат
  const _close = SHOP.closeShop;
  SHOP.closeShop = function () { _close(); if (wave === 0 && !started && !NETC.on) showMain(); };
  let started = false;
  sel.querySelector('.go').addEventListener('pointerdown', () => { started = true; });
  const _start = SHOP.startWave;
  SHOP.startWave = function () { started = true; hideMain(); if (menuMus) { menuMus = false; if (mus.el && mus.i === MENU_TRACK) musicNext(); } return _start.apply(this, arguments); };

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
  option('Камера', CAMS, () => SET.cam, v => { SET.cam = CFG.cam = v; put('hw_cam', v); });
  option('Графика', [['hi', 'Чётко'], ['lo', 'Экономно']], () => SET.q, v => { SET.q = v; put('hw_q', v); DPR_CAP = v === 'lo' ? 1.25 : 2; resize(); });
  if (typeof METRICS !== 'undefined') option('Аналитика', [[true, 'Отправлять'], [false, 'Нет']], () => METRICS.on, v => METRICS.set(v));      // v122: обезличенная статистика игры (stats.js); v124: строка названа «Аналитика» — «Статистика» теперь экран с цифрами игрока (tally.js)
  if (typeof LANG !== 'undefined') option('Язык', [['ru', 'Русский'], ['en', 'English']], () => LANG.cur, v => LANG.set(v));      // v121: английская версия (lang.js)
  tap(mk('div', 'b', pn, 'Готово'), () => { st.style.display = 'none'; if (!started) showMain(); });
  function openSettings() { st.style.display = 'flex'; }
  // в паузе: настройки и выход в меню вместо «Сменить героя»
  if (SHOP.el && SHOP.el.pause) {
    const p = SHOP.el.pause, tip = p.querySelector('.tip');
    for (const b of p.querySelectorAll('.mb')) if ((b.dataset.ru || b.textContent) === 'Сменить героя') { b.textContent = 'В главное меню'; delete b.dataset.ru; }
    const s = document.createElement('div'); s.className = 'mb bg'; s.textContent = 'Настройки';
    s.addEventListener('pointerdown', x => { x.stopPropagation(); openSettings(); });
    p.insertBefore(s, tip);
  }

  // ---------- заставка ----------
  const sp = mk('div', 'mn', document.body); sp.id = 'mSplash'; block(sp);
  mk('i', '', sp);
  sel.style.display = 'none';
  { const bt = document.getElementById('boot'); if (bt) bt.remove(); }   // заставка (чёрная) уже стоит — слой запуска больше не нужен
  const auto = /[?&](mode|auto)=/.test(location.search);    // ссылки проверки онлайна идут сразу в игру
  let done = false, bgOk = false, timeUp = false;
  let back2menu = false; try { back2menu = sessionStorage.getItem('hw_tomenu') === '1'; sessionStorage.removeItem('hw_tomenu'); } catch (e) {}
  // «Новая игра» при имеющемся сохранении стирает прогресс и перезагружает страницу — после неё сразу выбор героя, без лого и меню
  let newgame = false; try { newgame = sessionStorage.getItem('hw_newgame') === '1'; sessionStorage.removeItem('hw_newgame'); } catch (e) {}
  if (newgame) back2menu = true;
  window.BOOT_KIND = auto ? 'auto' : newgame ? 'new' : back2menu ? 'menu' : '';   // '' — обычный запуск с лого (cine.js заранее грузит лого студии)
  // фон меню грузим заранее: заставка не уходит, пока его нет (иначе меню секунду стоит на тёмном фоне, потом фон «впрыгивает»)
  const bg = new Image(); bg.onload = bg.onerror = () => { bgOk = true; if (timeUp) endSplash(); }; bg.src = 'ui/menu_bg.webp' + V;
  setTimeout(() => { bgOk = true; if (timeUp) endSplash(); }, 10000);
  function endSplash() {
    timeUp = true; if (done || (!bgOk && !auto)) return; done = true;
    // после лого игры — лого студии и (в первый запуск) вступление: cine.js; чёрная заставка уходит, когда они кончились
    const fin = () => { sp.style.opacity = '0'; setTimeout(() => sp.remove(), 750); if (auto) { sel.style.display = 'flex'; if (window.SOON_CARD) SOON_CARD.img(); } else if (newgame) openSelect('new'); else showMain(); };
    if (cineBoot()) { sp.classList.remove('on'); CINE.boot(fin); } else fin();
  }
  const logo = new Image();
  const cineBoot = () => !auto && !back2menu && typeof CINE !== 'undefined' && !CINE.off;      // v121: весь запуск (лого, язык, пролог) ведёт cine.js
  // v124: лого игры на этой заставке включается только после загрузки страницы и только когда запуск ведёт не cine.js (автопрогон).
  // Раньше оно включалось, как только загрузилась картинка: cine.js в этот момент ещё не подключён, и лого игры мелькало перед лого студии.
  logo.src = LOGO + V;
  sp.addEventListener('pointerdown', endSplash);
  // после «В главное меню» — сразу меню, без логотипа. Обычный запуск: ждём, пока страница собрана (cine.js подключается позже этого
  // файла), и сразу отдаём запуск ему; под автопрогоном (заставки выключены) — прежнее лого игры на 2,6 с
  if (auto || back2menu) setTimeout(endSplash, 50);
  else addEventListener('load', () => { if (cineBoot()) setTimeout(endSplash, 40); else { requestAnimationFrame(() => sp.classList.add('on')); setTimeout(endSplash, 2600); } });
})();
