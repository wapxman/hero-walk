// Заставки и рассказ (v108). Проигрыватель; сами картинки, видео и голос делает Клауди и кладёт в
// night_19_11/cinema/game/, оттуда их переносит в игру tools/cine_install.py (папка cine/ и список cine/index.js).
//   запуск (v124, каждый раз): при первом запуске выбор языка (lang.js) → лого студии (cine/logo_paladium.mp4) → надпись «PALLADIUM представляет»
//                → пролог cine/intro.mp4 → лого игры (cine/logo_game.webp) ОДИН раз: стоит по центру и уезжает на своё место в главном меню.
//                Лого и надпись пропускаются касанием, пролог — кнопкой. До v124 лого игры шло до студии и мелькало ещё раз из menu.js.
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
  // v123: ролики книги при английском языке — из cine_en/ (те, что есть в списке VOICE_EN.cine; остальное — общее, из cine/)
  const enCine = p => typeof LANG !== 'undefined' && LANG.cur === 'en' && typeof VOICE_EN !== 'undefined' && !!(VOICE_EN.cine && VOICE_EN.cine[p]);
  const url = p => (enCine(p) ? 'cine_en/' : 'cine/') + p + (typeof V === 'string' ? V : '');
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
    return new Promise(r => setTimeout(() => { R.style.display = 'none'; R.innerHTML = ''; R.style.backgroundColor = ''; R.style.transition = ''; r(); }, fast ? 0 : 600));
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
  // лого игры в конце запуска (v124): стоит по центру, потом уезжает на место логотипа главного меню, а чёрный экран под ним тает —
  // на экране оно одно и то же, без второго показа. showMenu — показать меню под чёрным слоем. Ответ: true — переезд состоялся.
  function logoToMenu(file, sec, showMenu) {
    return new Promise(done => {
      const r = root(), l = el('lg', r), im = new Image(); let over = false, tm = 0;
      const end = () => {
        if (over) return; over = true; clearTimeout(tm);
        showMenu(); solid = false;
        const t = document.querySelector('#mMain .logo'), a = t && t.getBoundingClientRect(), b = l.getBoundingClientRect();
        if (!a || !a.width || !b.width || !im.naturalWidth) return done(false);
        const fit = q => Math.min(q.width / im.naturalWidth, q.height / im.naturalHeight), k = fit(a) / fit(b);
        const dx = a.left + a.width / 2 - (b.left + b.width / 2), dy = a.top + a.height / 2 - (b.top + b.height / 2);
        l.style.transition = 'transform .9s cubic-bezier(.5, 0, .2, 1)'; r.style.transition = 'background-color .9s';
        t.style.visibility = 'hidden';      // логотип самого меню появится, когда этот доедет: двух лого на экране не бывает
        void l.offsetWidth; l.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) scale(' + k.toFixed(4) + ')'; r.style.backgroundColor = 'transparent';
        setTimeout(() => { t.style.visibility = ''; done(true); }, 940);
      };
      im.onload = () => { l.style.backgroundImage = 'url("' + im.src + '")'; requestAnimationFrame(() => l.classList.add('on')); tm = setTimeout(end, sec * 1000); };
      im.onerror = () => { if (!over) { over = true; showMenu(); done(false); } }; im.src = url(file);
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
    v.preload = 'auto'; v.__url = url(file); v.src = v.__url; try { v.load(); } catch (e) {}
    return v;
  }
  function preload(file) { if (!OFF && has(file) && !PRE[file]) { for (const k in PRE) if (k !== 'logo_paladium.mp4') { try { PRE[k].removeAttribute('src'); PRE[k].load(); } catch (e) {} delete PRE[k]; } PRE[file] = mkVideo(file); } }   // заранее держим один ролик
  // Пропуск — касанием в любом месте (v116). o.tap — лого: без надписи «Пропустить»; у роликов первые 0,7 с касание не считается
  // (это ещё то нажатие, которым ролик запустили). o.now — чёрный экран сразу, без плавного появления
  function video(file, setSkip, o) {
    o = o || {};
    return new Promise(done => {
      if (PRE[file] && PRE[file].__url !== url(file)) { try { PRE[file].removeAttribute('src'); PRE[file].load(); } catch (e) {} delete PRE[file]; }      // v123: заготовлен ролик на другом языке
      const r = root(o.now), v = PRE[file] || mkVideo(file); delete PRE[file]; let over = false, seen1 = false, ruTry = false; const born = performance.now();
      const vis = () => { if (over) return; if (document.hidden) { try { v.pause(); } catch (e) {} } else v.play().catch(() => {}); };
      const tapEnd = () => { if (o.tap) end(); };      // v121: касание по экрану закрывает только лого студии; ролики книги — только кнопкой «Продолжить»
      const end = () => { if (over) return; over = true; document.removeEventListener('visibilitychange', vis); r.removeEventListener('pointerdown', tapEnd); try { v.pause(); } catch (e) {} if (!o.tap && seen1 && typeof METRICS !== 'undefined') METRICS.cine(file, v.ended || (v.duration > 0 && v.currentTime >= v.duration - 0.6)); done(); };
      document.addEventListener('visibilitychange', vis);
      const wait = el('wait', r);
      const first = () => { if (seen1 || over) return; seen1 = true; v.classList.add('on'); wait.classList.remove('on'); };
      v.classList.remove('on');
      try { if (v.currentTime > 0) v.currentTime = 0; } catch (e) {}      // v119: ролик всегда идёт с самого начала
      v.addEventListener('ended', end);
      // английский ролик не загрузился — показываем русский (один раз), и только если и он не идёт — закрываем
      v.addEventListener('error', () => { if (!ruTry && !over && /cine_en\//.test(v.__url || '')) { ruTry = true; v.__url = 'cine/' + file + (typeof V === 'string' ? V : ''); v.src = v.__url; try { v.load(); } catch (e) {} v.play().catch(() => {}); } else end(); });
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
  // запуск игры (v124, Создатель 27.11), при каждом запуске: (первый запуск: выбор языка) → лого студии Palladium → надпись
  // «Palladium представляет» → вступительный ролик (пролог) → лого игры TEN WORLDS (один раз, уезжает в главное меню) → главное меню.
  // Лого и надпись пропускаются касанием, пролог — кнопкой. Язык выбирают первым: надпись и пролог идут уже на нём.
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
      if (typeof LANG !== 'undefined' && LANG.pick && !LANG.chosen) await LANG.pick(root(true));
      preload('intro.mp4');
      if (has('logo_paladium.mp4')) await video('logo_paladium.mp4', setSkip, { tap: true, now: true });
      await card(['PALLADIUM', 'представляет'], 2.8);
      if (has('intro.mp4')) await video('intro.mp4', setSkip, { now: true });
      let moved = false, shown = false; const menu = () => { if (!shown) { shown = true; done(); } };
      if (has('logo_game.webp')) moved = await logoToMenu('logo_game.webp', CFG.logoSec, menu);
      menu(); await hide(moved);
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
    // v124 (баг Создателя 27.11): при входе в мир (now) чёрный экран ролика не уходит, пока игра под ним не подставит сохранение и арену
    // выбранного мира. Раньше ролик гас первым, и 0,6–0,8 с была видна стартовая арена мира 1 (волна 1, золото 0, пустая сумка).
    session(async setSkip => { if (has(vid)) await video(vid, setSkip, { now: !!now }); else await slides(k, nSlides(k), setSkip); if (now) { if (R) R.innerHTML = ''; } else await hide(); })
      .then(async () => {
        if (!now) return then();
        freeze(true); solid = false;                    // бой под чёрным экраном не идёт; арена под ним уже рисуется каждый кадр (v120: под сплошным роликом — дважды в секунду)
        try { then(); } catch (e) {}
        await arenaReady(); await hide(); freeze(false);
      });
  }
  // арена, которую сейчас подставляет игра, загружена и стоит на экране (затемнение загрузки снято) — но ждём не дольше 8 с
  function arenaReady() {
    return new Promise(res => { const t0 = performance.now();
      (function w() { const busy = typeof ARENA_COVER !== 'undefined' && ARENA_COVER.busy; if (!busy || performance.now() - t0 > 8000) setTimeout(res, 150); else setTimeout(w, 40); })(); });
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
  // «История» (v124, Создатель 27.11): галерея-коллекция из 12 карточек — пролог, 10 миров, финал. На карточке гравюра из самого ролика
  // (cine/th/*.webp — tools/story_thumbs.py), номер главы и название; закрытые — затемнённые, с замком; сверху счётчик «Открыто: N / 12».
  // Рамка карточки, лента, замок и кнопка — готовые картинки игры (ui/h_slot, ui/map/ribbon, ui/map/lock, ui/h_button); кодом ничего не рисуется.
  (function () {
    const m = document.querySelector('#mMain'); if (!m || !has('intro.mp4')) return;
    const VV = typeof V === 'string' ? V : '', c2 = document.createElement('style');
    c2.textContent = `
    #cineList { position: fixed; inset: 0; z-index: 75; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 1.1vh; color: #fff; font-family: Georgia, 'Times New Roman', serif;
      background: #05080e url(ui/menu_bg.webp${VV}) center / cover no-repeat; --cw: min(13.4vw, 26vh); }
    #cineList::before { content: ''; position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(5,8,16,.82), rgba(2,4,9,.95)); }
    #cineList > * { position: relative; }
    #cineList .hd { width: 60vh; height: 11.3vh; background: url(ui/map/ribbon.webp${VV}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
      font: bold 4.3vh Georgia, 'Times New Roman', serif; color: #5a2408; letter-spacing: .25vh; padding-bottom: .9vh; box-sizing: border-box; }
    #cineList .cnt { font: 2.3vh Georgia, serif; color: #e9d9a8; margin-top: -.9vh; text-shadow: 0 .2vh .5vh #000; }
    #cineList .g { display: grid; grid-template-columns: repeat(6, var(--cw)); gap: 1.2vh 1.1vw; }
    #cineList .it { width: var(--cw); background: none; cursor: pointer; user-select: none; -webkit-user-select: none; text-align: center; transition: transform .12s; }
    #cineList .it:active { transform: scale(.96); }
    #cineList .it .fr { position: relative; width: 100%; aspect-ratio: 180 / 177; background: url(ui/h_slot.webp${VV}) center / 100% 100% no-repeat; }
    #cineList .it .fr i { position: absolute; left: 10.5%; top: 10.5%; right: 10.5%; bottom: 10.5%; background: #0b1020 center / cover no-repeat; border-radius: .9vh; }
    #cineList .it b { display: block; margin-top: .2vh; font: bold 2.3vh Georgia, serif; color: #ffe9a8; text-shadow: 0 .2vh .5vh #000; }
    #cineList .it span { display: block; font: 1.9vh Georgia, serif; color: #cfd6e6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 .2vh .4vh #000; }
    #cineList .it.no { cursor: default; }
    #cineList .it.no .fr i { filter: grayscale(1) brightness(.3) blur(.3vh); }
    #cineList .it.no .fr::after { content: ''; position: absolute; left: 34%; top: 24%; width: 32%; aspect-ratio: 256 / 366; background: url(ui/map/lock.webp${VV}) center / contain no-repeat; filter: drop-shadow(0 .4vh .8vh #000); }
    #cineList .it.no b { color: #9aa1b2; } #cineList .it.no span { color: #707788; }
    #cineList .x { margin-top: .4vh; width: 30vh; height: 8vh; background: url(ui/h_button.webp${VV}) center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
      font: bold 2.8vh system-ui, sans-serif; color: #ffe9a8; cursor: pointer; user-select: none; -webkit-user-select: none; }
    #cineList .x:active { transform: scale(.96); }`;
    document.head.appendChild(c2);
    const box = document.createElement('div'); box.id = 'cineList'; document.body.appendChild(box);
    for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) box.addEventListener(ev, e => e.stopPropagation());
    function open() {
      const L = unlocked(), n = L.filter(x => x.open).length;
      box.innerHTML = '<div class="hd">История</div><div class="cnt">Открыто: ' + n + ' / ' + L.length + '</div><div class="g"></div><div class="x">Назад</div>';
      const g = box.querySelector('.g');
      for (const it of L) {
        const cut = it.nm.indexOf('. '), head = cut > 0 ? it.nm.slice(0, cut) : it.nm, name = cut > 0 ? it.nm.slice(cut + 2) : '';
        const d = document.createElement('div'); d.className = 'it' + (it.open ? '' : ' no'); d.dataset.k = it.k;
        d.innerHTML = '<div class="fr"><i style="background-image:url(cine/th/' + it.k + '.webp' + VV + ')"></i></div><b></b><span></span>';
        d.querySelector('b').textContent = head; d.querySelector('span').textContent = it.open ? name : 'не открыт';
        g.appendChild(d);
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
