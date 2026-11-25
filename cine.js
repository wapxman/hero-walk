// Заставки и рассказ (v108). Проигрыватель; сами картинки, видео и голос делает Клауди и кладёт в
// night_19_11/cinema/game/, оттуда их переносит в игру tools/cine_install.py (папка cine/ и список cine/index.js).
//   запуск (v121, каждый раз): лого студии (cine/logo_paladium.mp4) → лого игры (cine/logo_game.webp) → при первом запуске выбор языка
//                (lang.js) → надпись «PALLADIUM представляет» → пролог cine/intro.mp4 → главное меню. Лого и надпись — касанием, пролог — кнопкой
//   пролог:      cine/intro.mp4 — после «Новая игра» (выбор героя → пролог → карта миров); при «Продолжить» не идёт (v118)
//   «История»:   кнопка в главном меню — список открытых роликов (пролог, ролики открытых миров, финал после победы); любой можно пересмотреть (v118)
//   видео (v113): готовится заранее и показывается только с первым кадром — до этого чёрный экран, никаких системных значков «плей»
//   перед миром: при ПЕРВОМ входе в мир N — ролик cine/world_NN.mp4 (книга «Сердце Разлома»): игрок выбрал мир на карте → ролик → первая арена;
//                после босса прежнего мира — сразу за картой перехода, до арены. Один раз: пропущенный больше не всплывает. На аренах,
//                при «Начать волну», при возврате на карту и при входе в уже открытый мир ролик не идёт (v118). Если ролика нет — прежние слайды:
//                cine/world_NN/1.webp, 2.webp, (3.webp) с наездом, голос vo.mp3 и субтитры text.json
//   финал:       после босса мира 10 — cine/finale.mp4 (нет ролика — слайды cine/finale/)
// Ролик книги закрывается только кнопкой «Продолжить» вверху (v121; касание по экрану ролик больше не закрывает); игра на это время стоит,
// музыка притушена (под видео — выключена). Ролик следующего мира грузится заранее, пока игрок на карте.
// text.json: { "lines": [ { "t": 0, "text": "…", "slide": 1 }, { "t": 4.5, "text": "…", "slide": 2 } ] } — t в секундах от начала голоса;
// строка стоит на экране до следующей. slide (необязательно) — с этой строки показывать картинку с таким номером;
// без slide время делится между картинками поровну. Без голоса кадр держится CFG.slideSec секунд.
// Проверка: ?cine=1 — показывать и под автопрогоном; CINE.reset() в консоли — забыть, что уже показано.
'use strict';
const CINE = (() => {
  const CFG = { intro: true, slideSec: 7, logoSec: 2.6, duckVoice: 0.25, fade: 0.9 };
  const M = (typeof CINE_FILES !== 'undefined' && CINE_FILES) || {};      // что реально лежит в cine/ (пишет cine_install.py)
  const FORCE = /[?&]cine=1/.test(location.search);
  const OFF = (!FORCE && (!!navigator.webdriver || /[?&](mode|auto)=/.test(location.search))) || !!window.LEVEL_TEST || /[?&]levels(&|$)/.test(location.search);   // тестовая сборка уровней (levels.js) — без роликов   // автопрогон и ссылки проверки — без заставок
  const KEY = 'hw_cine';
  let seen = {}; try { seen = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const mark = k => { seen[k] = 1; try { localStorage.setItem(KEY, JSON.stringify(seen)); } catch (e) {} };
  const url = p => 'cine/' + p + (typeof V === 'string' ? V : '');
  const online = () => !!((window.NETC && NETC.on) || (typeof TEAM !== 'undefined' && TEAM.on));
  let on = false, duck = null, frozen = false;

  // музыка: пока идёт заставка, громкость держим сами
  if (typeof musicUpdate === 'function') {
    const _mu = musicUpdate;
    musicUpdate = function () {
      if (duck == null || !mus.el || !mus.g || !AC) return _mu();
      const v = MUS_VOL * duck; if (mus.v != null && Math.abs(v - mus.v) < 0.004) return;
      mus.v = v; mus.g.gain.setTargetAtTime(v, AC.currentTime, 0.25);
    };
  }
  function setDuck(v) {
    duck = v;
    try { if (v != null && mus.g && AC) { mus.v = MUS_VOL * v; mus.g.gain.setTargetAtTime(mus.v, AC.currentTime, 0.25); } } catch (e) {}
  }
  function freeze(f) {
    if (f === frozen || typeof STORE === 'undefined') return;      // пауза — общим счётчиком store.js: её не снимут меню, карта и загрузка арены
    frozen = f; STORE.freeze(f);
  }

  const css = document.createElement('style');
  css.textContent = `
  #cine { position: fixed; inset: 0; z-index: 80; background: #000; display: none; overflow: hidden; opacity: 0; transition: opacity .6s; }
  #cine.on { opacity: 1; }
  #cine.now { transition: none; }
  #cine video, #cine .sl { position: absolute; inset: 0; width: 100%; height: 100%; }
  #cine video { object-fit: contain; background: #000; opacity: 0; transition: opacity .3s; pointer-events: none; }
  #cine video.on { opacity: 1; }
  #cine video::-webkit-media-controls, #cine video::-webkit-media-controls-start-playback-button, #cine video::-webkit-media-controls-overlay-play-button { display: none !important; -webkit-appearance: none; }
  #cine .wait { position: absolute; left: 50%; top: 50%; width: 5vh; height: 5vh; margin: -2.5vh; border-radius: 50%; border: .35vh solid rgba(255,255,255,.14); border-top-color: rgba(255,255,255,.6);
    animation: cineSpin 1s linear infinite; opacity: 0; transition: opacity .4s; pointer-events: none; }
  #cine .wait.on { opacity: 1; }
  @keyframes cineSpin { to { transform: rotate(360deg); } }
  #cine .sl { background: center / cover no-repeat; opacity: 0; transition: opacity ${CFG.fade}s; will-change: transform, opacity; }
  #cine .sl.on { opacity: 1; }
  #cine .lg { position: absolute; inset: 0; background: center / contain no-repeat; margin: 12vh 20vw; opacity: 0; transform: scale(.94); transition: opacity 1s, transform 2.6s ease-out; }
  #cine .lg.on { opacity: 1; transform: scale(1); }
  #cine .sub { position: absolute; left: 7vw; right: 7vw; bottom: 5vh; text-align: center; color: #fff; font: 3.3vh/1.35 Georgia, 'Times New Roman', serif;
    text-shadow: 0 0 .8vh #000, 0 .2vh .4vh #000, 0 0 2vh #000; opacity: 0; transition: opacity .35s; pointer-events: none; }
  #cine .sub.on { opacity: 1; }
  #cine .shade { position: absolute; left: 0; right: 0; bottom: 0; height: 34vh; background: linear-gradient(transparent, rgba(0,0,0,.75)); pointer-events: none; }
  #cine .skip { position: absolute; right: 3vh; top: 3vh; padding: 1.3vh 2.6vh; border-radius: 1.2vh; background: rgba(10,14,22,.6); border: .2vh solid rgba(255,255,255,.45);
    color: #fff; font: bold 2.5vh system-ui, sans-serif; cursor: pointer; user-select: none; z-index: 2; }
  #cine .skip:active { transform: scale(.95); }
  #cine .pres { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.4vh; opacity: 0; transition: opacity .9s; font-family: Georgia, 'Times New Roman', serif; text-align: center; }
  #cine .pres.on { opacity: 1; }
  #cine .pres .l0 { font-size: 8.5vh; letter-spacing: 1.6vh; color: #f3d98a; text-shadow: 0 0 3vh rgba(243,201,106,.45); padding-left: 1.6vh; }
  #cine .pres .l1 { font-size: 3.4vh; letter-spacing: .9vh; color: #d9d2c2; text-transform: uppercase; padding-left: .9vh; }
  #mMain .b.story { position: absolute; right: 3vh; top: 14vh; width: 46vh; }`;
  document.head.appendChild(css);
  let R = null, solid = false, solidT = 0;
  function root(now) {      // now — без плавного появления: сразу чёрный экран (между меню и вступлением не должна мелькать арена)
    if (!R) {
      R = document.createElement('div'); R.id = 'cine'; document.body.appendChild(R);
      for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click', 'keydown']) R.addEventListener(ev, e => e.stopPropagation());
    }
    R.innerHTML = ''; R.classList.toggle('now', !!now); R.style.display = 'block'; void R.offsetWidth; R.classList.add('on');
    clearTimeout(solidT); if (now) solid = true; else solidT = setTimeout(() => { solid = true; }, 650);      // v120: экран ролика стал непрозрачным — арену под ним не рисуем
    return R;
  }
  function hide(fast) {
    if (!R) return Promise.resolve();
    clearTimeout(solidT); solid = false;
    R.classList.remove('on');
    return new Promise(r => setTimeout(() => { R.style.display = 'none'; R.innerHTML = ''; r(); }, fast ? 0 : 600));
  }
  function skipBtn(parent, fn) {
    const b = document.createElement('div'); b.className = 'skip'; b.textContent = 'Продолжить'; parent.appendChild(b);
    b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); fn(); });
    return b;
  }
  const el = (cls, parent) => { const d = document.createElement('div'); d.className = cls; parent.appendChild(d); return d; };
  // один сеанс: игра стоит, клавиша Esc / Enter / пробел = «Пропустить»
  let skipNow = null;
  async function session(fn) {
    if (on) return; on = true; freeze(true);
    let skip = null; skipNow = () => { if (skip) skip(); }; const key = e => { e.stopPropagation(); if (['Escape', 'Enter', 'Space'].includes(e.code) && skip) { e.preventDefault(); skip(); } };   // остальные клавиши до игры не доходят (B открывала лавку под заставкой)
    addEventListener('keydown', key, true);
    try { await fn(f => { skip = f; }); } catch (e) {}
    removeEventListener('keydown', key, true);
    skipNow = null; setDuck(null); freeze(false); on = false;
  }

  // ---------- картинка-логотип ----------
  function logo(file, sec) {
    return new Promise(done => {
      const r = root(), l = el('lg', r), im = new Image(); let over = false;
      const end = () => { if (over) return; over = true; done(); };
      im.onload = () => { l.style.backgroundImage = 'url("' + im.src + '")'; requestAnimationFrame(() => l.classList.add('on')); setTimeout(end, sec * 1000); };
      im.onerror = end; im.src = url(file);
      r.addEventListener('pointerdown', end, { once: true });
    });
  }
  // ---------- видео ----------
  // Видео готовится заранее (preload) и стоит невидимым на чёрном экране, пока не пошёл первый кадр: ни постера, ни кнопок,
  // ни значка «плей» (в приложении его рисовал WebView — там он ещё и убран в MainActivity.getDefaultVideoPoster).
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', PRE = {};
  function mkVideo(file) {
    const v = document.createElement('video');
    v.playsInline = true; v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.controls = false; v.poster = BLANK;
    v.setAttribute('disablepictureinpicture', ''); v.setAttribute('disableremoteplayback', ''); v.setAttribute('controlslist', 'nodownload nofullscreen noremoteplayback');
    v.preload = 'auto'; v.src = url(file); try { v.load(); } catch (e) {}
    return v;
  }
  function preload(file) { if (!OFF && has(file) && !PRE[file]) { for (const k in PRE) if (k !== 'logo_paladium.mp4') { try { PRE[k].removeAttribute('src'); PRE[k].load(); } catch (e) {} delete PRE[k]; } PRE[file] = mkVideo(file); } }   // заранее держим один ролик
  // Пропуск — касанием в любом месте (v116). o.tap — лого: без надписи «Пропустить»; у роликов первые 0,7 с касание не считается
  // (это ещё то нажатие, которым ролик запустили). o.now — чёрный экран сразу, без плавного появления
  function video(file, setSkip, o) {
    o = o || {};
    return new Promise(done => {
      const r = root(o.now), v = PRE[file] || mkVideo(file); delete PRE[file]; let over = false, seen1 = false; const born = performance.now();
      const vis = () => { if (over) return; if (document.hidden) { try { v.pause(); } catch (e) {} } else v.play().catch(() => {}); };
      const tapEnd = () => { if (o.tap) end(); };      // v121: касание по экрану закрывает только лого студии; ролики книги — только кнопкой «Продолжить»
      const end = () => { if (over) return; over = true; document.removeEventListener('visibilitychange', vis); r.removeEventListener('pointerdown', tapEnd); try { v.pause(); } catch (e) {} done(); };
      document.addEventListener('visibilitychange', vis);
      const wait = el('wait', r);
      const first = () => { if (seen1 || over) return; seen1 = true; v.classList.add('on'); wait.classList.remove('on'); };
      v.classList.remove('on');
      try { if (v.currentTime > 0) v.currentTime = 0; } catch (e) {}      // v119: ролик всегда идёт с самого начала
      v.addEventListener('ended', end); v.addEventListener('error', end);
      v.addEventListener('timeupdate', () => { if (v.currentTime > 0) first(); });
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(first);
      r.appendChild(v);
      if (!o.tap) skipBtn(r, end);
      r.addEventListener('pointerdown', tapEnd);
      if (setSkip) setSkip(end);
      setDuck(0);
      // в браузере видео со звуком без нажатия запускать нельзя — тогда идём без звука; в приложении звук разрешён
      v.play().catch(() => { if (over) return; v.muted = true; v.play().catch(end); });      // over: пропустили, пока ролик грузился, — заново (без звука) не запускаем (v117)
      setTimeout(() => { if (!seen1 && !over) wait.classList.add('on'); }, 1500);   // долго грузится — тонкое колечко ожидания
      const guard = () => { if (over || seen1) return; if (document.hidden) setTimeout(guard, 2000); else end(); };
      setTimeout(guard, o.tap ? 8000 : 15000);       // файл не грузится — не держим игрока (пока приложение свёрнуто — ждём)
    });
  }
  // ---------- рассказ: картинки с наездом, голос, субтитры ----------
  const MOVES = [['scale(1.0) translate(0,0)', 'scale(1.14) translate(-2%,-1.5%)'], ['scale(1.14) translate(2%,1%)', 'scale(1.02) translate(-1%,0)'],
    ['scale(1.04) translate(-2%,1%)', 'scale(1.16) translate(1.5%,-1%)']];
  function slides(dir, n, setSkip) {
    return new Promise(async done => {
      const r = root(); let over = false, au = null, iv = 0, voiceOn = false;
      // приложение свернули — голос молчит и рассказ стоит; вернулись — идёт дальше с того же места
      const vis = () => { if (!au || !voiceOn) return; if (document.hidden) { try { au.pause(); } catch (e) {} } else if (!au.ended) au.play().catch(() => { voiceOn = false; }); };
      const end = () => { if (over) return; over = true; clearInterval(iv); document.removeEventListener('visibilitychange', vis); if (au) { try { au.pause(); } catch (e) {} } done(); };
      skipBtn(r, end); if (setSkip) setSkip(end);
      let lines = [];
      try { const j = await fetch(url(dir + '/text.json')).then(x => x.ok ? x.json() : null); lines = (j && j.lines) || []; } catch (e) {}
      // голос: длительность рассказа = длительность голоса; без голоса — CFG.slideSec на кадр
      let total = n * CFG.slideSec;
      if (!M[dir] || M[dir].vo !== 0) {
        au = new Audio(); au.preload = 'auto'; au.src = url(dir + '/vo.mp3');
        const d = await new Promise(res => { au.addEventListener('loadedmetadata', () => res(au.duration), { once: true }); au.addEventListener('error', () => res(0), { once: true }); setTimeout(() => res(0), 5000); });
        if (over) return;
        if (d > 1 && isFinite(d)) total = d + 1.2; else au = null;
      }
      if (lines.length) total = Math.max(total, lines[lines.length - 1].t + 3);
      // когда какая картинка: если у строк есть поле slide — картинка i встаёт в момент первой строки со slide = i
      // (абзацы разной длины — картинка не уезжает от текста); без поля — время делится поровну
      let at = [];
      if (lines.some(l => l.slide != null)) { for (const l of lines) { const i = (l.slide | 0) - 1; if (i >= 0 && i < n && at[i] == null) at[i] = Math.max(0, l.t); } if (at[0] == null) at[0] = 0; }
      else for (let i = 0; i < n; i++) at[i] = i * total / n;
      const order = at.map((t, i) => [t, i]).filter(x => x[0] != null).sort((a, b) => a[0] - b[0]), layers = [];
      let cur = -1;
      for (let i = 0; i < n; i++) { const s = el('sl', r); s.style.backgroundImage = 'url("' + url(dir + '/' + (i + 1) + '.webp') + '")'; layers.push(s); }
      el('shade', r); const sub = el('sub', r);
      const show = (i, per) => {
        const s = layers[i], mv = MOVES[i % MOVES.length];
        s.style.transition = 'none'; s.style.transform = mv[0]; void s.offsetWidth;
        s.style.transition = 'opacity ' + CFG.fade + 's, transform ' + (per + CFG.fade + 0.5) + 's linear'; s.style.transform = mv[1];
        s.classList.add('on'); if (cur >= 0 && cur !== i) layers[cur].classList.remove('on'); cur = i;
      };
      setDuck(CFG.duckVoice);
      if (au) { r._au = au; voiceOn = true; au.play().catch(() => { voiceOn = false; }); }      // r._au — для проверки (tools/cine_check.py)
      document.addEventListener('visibilitychange', vis);
      // Часы рассказа (v113). Пока голос играет — время берём у него: картинки и субтитры не уезжают от голоса, даже если он
      // начал с задержкой или запнулся. Голоса нет, не запустился или уже кончился — время идёт само. Свёрнуто — стоит.
      let t = 0, last = performance.now(), stall = 0, kCur = -1, lCur = -1;
      const step = () => {
        if (over) return;
        const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now;
        if (document.hidden) return;
        if (au && voiceOn && !au.ended && !au.paused) {
          if (au.currentTime > t + 0.001) { t = au.currentTime; stall = 0; }
          else if ((stall += dt) > 3) t += dt;          // голос завис дольше 3 с — не ждём его
        } else t += dt;
        let k = -1; for (let j = 0; j < order.length; j++) if (order[j][0] <= t) k = j;
        if (k !== kCur && k >= 0) { kCur = k; show(order[k][1], (k + 1 < order.length ? order[k + 1][0] : total) - order[k][0]); }
        let l = -1; for (let j = 0; j < lines.length; j++) if (Math.max(0, lines[j].t) <= t) l = j;
        if (l !== lCur && l >= 0) { lCur = l; sub.classList.remove('on'); setTimeout(() => { if (!over && lCur === l) { sub.textContent = lines[l].text; sub.classList.add('on'); } }, 180); }
        if (t >= total) end();
      };
      iv = setInterval(step, 100); step();
    });
  }

  // ---------- что показывать ----------
  const has = k => !!M[k] && (k !== 'intro.mp4' || CFG.intro);   // CFG.intro = false — вступление не играет ни при запуске, ни из меню
  const nSlides = k => (M[k] && M[k].n) || 0;
  // запуск игры: лого игры показывает заставка меню (menu.js), здесь — лого студии; потом done() — главное меню
  // v121, при каждом запуске: лого студии Palladium → лого игры TEN WORLDS → (первый запуск: выбор языка) → надпись
  // «Palladium представляет» → вступительный ролик (пролог) → главное меню. Лого и надпись пропускаются касанием, пролог — кнопкой.
  function card(lines, sec) {
    return new Promise(done => {
      const r = root(true), c = el('pres', r); let over = false;
      c.innerHTML = lines.map((t, i) => '<div class="l' + i + '">' + t + '</div>').join('');
      const end = () => { if (over) return; over = true; c.classList.remove('on'); setTimeout(done, 500); };
      requestAnimationFrame(() => c.classList.add('on')); setTimeout(end, sec * 1000);
      r.addEventListener('pointerdown', end, { once: true });
    });
  }
  function boot(done) {
    if (OFF || on) return done();
    session(async setSkip => {
      if (has('logo_paladium.mp4')) await video('logo_paladium.mp4', setSkip, { tap: true });
      preload('intro.mp4');
      if (has('logo_game.webp')) await logo('logo_game.webp', CFG.logoSec);
      if (typeof LANG !== 'undefined' && LANG.pick && !LANG.chosen) await LANG.pick(root(true));
      await card(['PALLADIUM', 'представляет'], 2.8);
      if (has('intro.mp4')) await video('intro.mp4', setSkip, { now: true });
      done(); await hide();
    });
  }
  // вступление: «История» в меню (then нет) и «Новая игра» (then — начать бой; чёрный экран встаёт сразу)
  function intro(then) {
    then = typeof then === 'function' ? then : null;
    if (OFF || !has('intro.mp4') || on) { if (then) then(); return; }
    // после «Новой игры» чёрный экран держим до карты миров
    session(async setSkip => { const pv = video('intro.mp4', setSkip, { now: !!then }); if (then) ready(1); await pv; if (!then) await hide(); }).then(() => { if (then) { then(); if (!on) hide(); } });
  }
  const wkey = n => 'world_' + String(n).padStart(2, '0');
  // ролик мира грузим заранее: пока игрок на карте перед первым боем мира, а финал — когда начался бой с последним боссом
  function ready(n) { if (!OFF && !online() && !seen[wkey(n)]) preload(wkey(n) + '.mp4'); }
  // now — чёрный экран сразу (вход в мир после карты перехода: арена до ролика не мелькает)
  function world(n, then, now) {
    const k = wkey(n), vid = k + '.mp4';
    if (OFF || online() || seen[k] || on || (!has(vid) && !nSlides(k))) return then();
    mark(k);
    session(async setSkip => { if (has(vid)) await video(vid, setSkip, { now: !!now }); else await slides(k, nSlides(k), setSkip); await hide(); }).then(then);
  }
  function finale(then) {
    if (OFF || online() || seen.finale || on || (!nSlides('finale') && !has('finale.mp4'))) return then();
    mark('finale');
    session(async setSkip => { if (has('finale.mp4')) await video('finale.mp4', setSkip); else await slides('finale', nSlides('finale'), setSkip); await hide(); }).then(then);
  }

  // перед первым боем мира — рассказ этого мира (только первый круг)
  if (typeof SHOP !== 'undefined') {
    const _sw = SHOP.startWave;
    SHOP.startWave = function () {
      const a = arguments, go = () => _sw.apply(SHOP, a);
      if (on) return;
      if (!OFF && SHOP.phase === 'rest' && wave === BAL.WAVES * BAL.WORLDS - 1 && !seen.finale && !online()) preload('finale.mp4');
      return go();      // v118: «Начать волну» ролик мира никогда не показывает — он идёт при входе в мир (выбор на карте или переход после босса)
    };
  }
  // после босса мира 10 — финал (до карты перехода)
  if (typeof PATHMAP !== 'undefined') {
    const _show = PATHMAP.show;
    PATHMAP.show = function (o) {
      const self = this, next = () => _show.call(self, o);
      const nw = wave % BAL.WAVES === 0 && wave < BAL.WAVES * BAL.WORLDS ? wave / BAL.WAVES + 1 : 0;
      if (nw) ready(nw);
      // v117: вход в новый мир после босса — ролик мира идёт сразу за картой перехода, до арены. Пропустили или досмотрели —
      // он отмечен просмотренным и на арене при «Начать волну» уже не появляется.
      if (o && o.mode === 'full' && nw > 1 && !OFF && !online() && !seen[wkey(nw)]) { const od = o.onDone; o = Object.assign({}, o, { onDone() { if (od) od(); world(nw, () => {}, true); } }); }
      // v118: игрок выбрал на карте мир, в котором ещё не был, — сразу ролик этого мира, потом первая арена
      if (o && o.mode === 'select' && o.onPick && !OFF && !online()) {
        const op = o.onPick; ready(BAL.at(wave + 1).M);
        o = Object.assign({}, o, { onPick(c, pw) { const run = () => op(c, pw); if (!seen[wkey(c)] && has(wkey(c) + '.mp4')) world(c, run, true); else run(); } });
      }
      if (!o || o.mode === 'select' || wave !== BAL.WAVES * BAL.WORLDS) return next();
      finale(next);
    };
  }
  // ---------- «История» в главном меню (v118): список открытых роликов — пролог, ролики открытых миров, финал после победы ----------
  // Мир открыт, если его ролик уже показывали или игрок прошёл в нём хотя бы одну волну (старые сохранения). Любой открытый можно пересмотреть.
  function bestAll() {
    let b = 0;
    try { for (const k of Object.keys(localStorage)) { if (!/^hw_run_/.test(k)) continue; const d = JSON.parse(localStorage.getItem(k)); if (d && d.best > b) b = d.best; } } catch (e) {}
    return b;
  }
  { // миры, где игрок уже воевал, считаются открытыми: при повторном входе их ролик сам не идёт
    const b = bestAll(); if (b > 0) { const m = Math.min(BAL.WORLDS, BAL.at(b).M); let ch = false; for (let n = 1; n <= (b >= BAL.WAVES * BAL.WORLDS ? BAL.WORLDS : m); n++) if (!seen[wkey(n)]) { seen[wkey(n)] = 1; ch = true; } if (ch) mark(wkey(1)); }
  }
  function unlocked() {
    const b = bestAll(), L = [{ k: 'intro', file: 'intro.mp4', nm: 'Пролог. Падение небес', open: has('intro.mp4') }];
    for (let n = 1; n <= BAL.WORLDS; n++) L.push({ k: wkey(n), file: wkey(n) + '.mp4', nm: 'Мир ' + n + (typeof WORLDS !== 'undefined' && WORLDS[n - 1] ? '. ' + WORLDS[n - 1].name : ''), open: has(wkey(n) + '.mp4') && !!seen[wkey(n)] });
    L.push({ k: 'finale', file: 'finale.mp4', nm: 'Финал. Сердце Разлома', open: has('finale.mp4') && (!!seen.finale || b >= BAL.WAVES * BAL.WORLDS) });
    return L;
  }
  function replay(file) { if (on || !has(file)) return; session(async setSkip => { await video(file, setSkip); await hide(); }); }
  (function () {
    const m = document.querySelector('#mMain'); if (!m || !has('intro.mp4')) return;
    const c2 = document.createElement('style');
    c2.textContent = `
    #cineList { position: fixed; inset: 0; z-index: 75; background: rgba(6,9,15,.93); display: none; flex-direction: column; align-items: center; justify-content: center; color: #fff; font-family: system-ui, sans-serif; }
    #cineList h1 { font: bold 5.4vh Georgia, serif; color: #ffe9a8; margin: 0 0 2.6vh; }
    #cineList .g { display: grid; grid-template-columns: repeat(3, 28vw); gap: 1.6vh 1.4vw; }
    #cineList .it { padding: 1.9vh 1.2vw; border-radius: 1.4vh; background: #1c2740; border: .25vh solid #6f8fd0; font: bold 2.5vh system-ui, sans-serif; text-align: center; cursor: pointer; user-select: none; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    #cineList .it:active { transform: scale(.97); }
    #cineList .it.no { opacity: .38; border-color: #556; cursor: default; }
    #cineList .x { margin-top: 3vh; padding: 1.6vh 6vh; border-radius: 1.4vh; background: rgba(10,14,22,.7); border: .25vh solid rgba(255,255,255,.5); font: bold 2.7vh system-ui, sans-serif; cursor: pointer; user-select: none; }`;
    document.head.appendChild(c2);
    const box = document.createElement('div'); box.id = 'cineList'; document.body.appendChild(box);
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) box.addEventListener(ev, e => e.stopPropagation());
    function open() {
      box.innerHTML = '<h1>История</h1><div class="g"></div><div class="x">Назад</div>';
      const g = box.querySelector('.g');
      for (const it of unlocked()) {
        const d = document.createElement('div'); d.className = 'it' + (it.open ? '' : ' no'); d.textContent = it.open ? it.nm : it.nm.split('.')[0] + ' — не открыт'; d.dataset.k = it.k; g.appendChild(d);
        if (it.open) d.addEventListener('pointerdown', e => { e.stopPropagation(); replay(it.file); });
      }
      box.querySelector('.x').addEventListener('pointerdown', e => { e.stopPropagation(); box.style.display = 'none'; });
      box.style.display = 'flex';
    }
    const b = document.createElement('div'); b.className = 'b story'; b.textContent = 'История'; m.appendChild(b);
    b.addEventListener('pointerdown', e => { e.stopPropagation(); open(); });
  })();

  if (window.BOOT_KIND === '') preload('logo_paladium.mp4');      // обычный запуск: лого студии грузится, пока стоит лого игры
  return { boot, intro, preload, world, finale, unlocked, replay, CFG, skip() { if (skipNow) skipNow(); }, get on() { return on; }, get off() { return OFF; }, get solid() { return solid; }, reset() { seen = {}; try { localStorage.removeItem(KEY); } catch (e) {} } };
})();
