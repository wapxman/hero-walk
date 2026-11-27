// Статистика игры через GameAnalytics (v122, задание Клауди 26.11). Одна и та же веб-часть для Android, iOS и сайта.
// Что уходит: прохождение (старт / победа / гибель по миру и волне), смерть (кто убил, уровень врагов), золото (откуда и на что),
// ролики (досмотрен / закрыт), реклама, покупка PRO, новая игра, герой, язык, версия, ошибки JS.
// Личных данных нет: SDK сам заводит случайный номер установки (лежит в localStorage); имён, почты, рекламных ID мы не передаём.
//
// Когда НЕ отправляется ничего (SDK даже не загружается):
//   • нет ключей (на сайте и в исходниках их нет — репозиторий открытый);   • тестовые сборки (все миры, уровни);
//   • игрок выключил «Аналитика» в настройках (до v124 строка называлась «Статистика») (ключ hw_stats = '0');
//   • автопрогон и проверки (navigator.webdriver) и адрес с ?stats=log — тестовый режим: события только пишутся в METRICS.log.
// Ключи: файл stats_keys.js рядом с index.html — const STATS_KEYS = { gameKey: '…', secretKey: '…' }. В git его нет (.gitignore):
// сборка APK делает его из файла ga_keys.json Клауди (tools/stats_keys.py android <папка>), для iPhone — то же с ios.
// Игра пробует загрузить его сама, когда понадобился (на сайте github.io и на localhost — даже не пробует). Нет файла — нет отправки.
// SDK (lib/GameAnalytics.min.js, 92 КБ, пакет gameanalytics 5.0.0, MIT) грузится после запуска игры, отдельно от неё; события до
// его готовности ждут в очереди. Нет сети или SDK не загрузился — игра этого не замечает: все вызовы обёрнуты, очередь ограничена.
// Имена событий — только латиница, цифры и _ (требование GameAnalytics): Эйра = Eira, предметы и враги — по их id в коде.
// Золото копится и уходит одной строкой на волну (иначе сотни событий на бой).
// Подключение к игре: опрос состояния в SHOP.tick (волны, гибель) + обёртки покупок; ролики, реклама, PRO, кузница, новая игра
// зовут METRICS сами одной строкой (cine.js, store.js, limbo.js, save.js, items.js).
'use strict';
const METRICS = (() => {
  const CFG = typeof STATS_CFG !== 'undefined' ? STATS_CFG : {}, KEY = 'hw_stats';
  const TEST = (!!navigator.webdriver && !/[?&]stats=send/.test(location.search)) || /[?&]stats=log/.test(location.search);      // ?stats=send — для проверки настоящей отправки (tools/stats_check.py)
  const TESTBUILD = !!(window.ALL_WORLDS || window.LEVEL_TEST);      // тестовые сборки статистику не портят
  let K = CFG.gameKey && CFG.secretKey ? { gameKey: CFG.gameKey, secretKey: CFG.secretKey } : null;
  // где файла ключей заведомо нет — не спрашиваем (лишний 404 на сайте)
  const SITE = /(^|\.)github\.io$|^127\.0\.0\.1$|^localhost$/.test(location.hostname) && !/[?&]stats=send/.test(location.search);
  let keyState = K ? 'yes' : (TEST || TESTBUILD || SITE) ? 'no' : 'ask';
  let enabled = true; try { enabled = localStorage.getItem(KEY) !== '0'; } catch (e) {}
  const log = [], queue = [];
  let ga = null, state = 'idle';      // idle → loading → init → ready | failed
  const live = () => keyState !== 'no' && enabled && !TEST && !TESTBUILD;
  const clean = s => String(s == null ? '' : s).replace(/[^A-Za-z0-9_.\-()!? ]/g, '_').slice(0, 60) || 'none';
  const HERO = { mage: 'Ganfaul', archer: 'Eira' };
  const hero = () => HERO[typeof HERO_ID !== 'undefined' ? HERO_ID : ''] || clean(typeof HERO_ID !== 'undefined' ? HERO_ID : 'none');
  const lang = () => (typeof LANG !== 'undefined' && LANG.cur) || 'ru';
  const platform = () => window.DuelStore ? 'android' : (window.webkit && window.webkit.messageHandlers) ? 'ios' : 'web';
  const ver = () => { const m = /(\d+)/.exec(typeof V === 'string' ? V : ''); return '1.0.' + (m ? m[1] : '0'); };
  const eLvl = () => (typeof LEVEL !== 'undefined' && LEVEL.n) || 1;
  const hLvl = () => (typeof P !== 'undefined' && P.lvl) || 1;

  // ---- отправка ----
  function send(ev) {      // ev = [вид, ...поля]
    if (TEST) { if (log.length < 2000) log.push(ev); return; }
    if (!live()) return;
    if (state === 'ready') return push(ev);
    if (queue.length < 300) queue.push(ev);
    if (state === 'idle') load();
  }
  function push(ev) {
    try {
      const G = ga.GameAnalytics, k = ev[0];
      if (k === 'prog') G.addProgressionEvent(ga.EGAProgressionStatus[ev[1]], ev[2], ev[3], '', undefined, ev[4] || {});
      else if (k === 'design') ev[2] == null ? G.addDesignEvent(ev[1], undefined, ev[3] || {}) : G.addDesignEvent(ev[1], ev[2], ev[3] || {});
      else if (k === 'res') G.addResourceEvent(ga.EGAResourceFlowType[ev[1]], 'Gold', ev[2], ev[3], ev[4]);
      else if (k === 'ad') G.addAdEvent(ga.EGAAdAction[ev[1]], ga.EGAAdType[ev[2]], 'admob', ev[3]);
      else if (k === 'biz') G.addBusinessEvent(ev[1], ev[2], ev[3], ev[4], ev[5]);
      else if (k === 'err') G.addErrorEvent(ga.EGAErrorSeverity.Error, ev[1]);
      else if (k === 'dim') { G.setCustomDimension01(ev[1]); G.setCustomDimension02(ev[2]); }
    } catch (e) {}
  }
  function load() {
    if (state !== 'idle' || !live()) return;
    state = 'loading';
    const go = () => {
      if (keyState === 'ask') {      // сначала ключи
        const k = document.createElement('script'); k.src = 'stats_keys.js' + (typeof V === 'string' ? V : '');
        k.onerror = () => { keyState = 'no'; state = 'idle'; queue.length = 0; };
        k.onload = () => { const q = typeof STATS_KEYS !== 'undefined' ? STATS_KEYS : null; if (q && q.gameKey && q.secretKey) { K = q; keyState = 'yes'; go(); } else k.onerror(); };
        document.head.appendChild(k); return;
      }
      const s = document.createElement('script'); s.async = true; s.src = 'lib/GameAnalytics.min.js' + (typeof V === 'string' ? V : '');
      s.onerror = () => { state = 'failed'; queue.length = 0; };
      s.onload = () => {
        try {
          ga = window.gameanalytics; const G = ga.GameAnalytics;
          G.setEnabledInfoLog(false); G.setEnabledVerboseLog(false);
          G.configureBuild(ver());
          G.configureAvailableResourceCurrencies(['Gold']);
          G.configureAvailableResourceItemTypes(['Enemies', 'Arena', 'Ad', 'Sell', 'Item', 'Flask', 'Forge']);
          G.configureAvailableCustomDimensions01(['Ganfaul', 'Eira']);
          G.configureAvailableCustomDimensions02(['ru', 'en']);
          G.configureAvailableCustomDimensions03(['web', 'android', 'ios']);
          G.setCustomDimension01(hero()); G.setCustomDimension02(lang()); G.setCustomDimension03(platform());
          G.initialize(K.gameKey, K.secretKey);
          // SDK принимает события только после ответа своего сервера на первый запрос (до того молча отбрасывает) —
          // держим их в очереди, пока он не скажет, что готов; за 2 минуты не ожил — на этот запуск статистику бросаем
          state = 'init'; let n = 0;
          const wait = setInterval(() => {
            let ok = false; try { const S = ga.state.GAState; ok = S.isInitialized() && S.isEnabled(); } catch (e) { ok = true; }
            if (ok) { clearInterval(wait); state = 'ready'; for (const ev of queue.splice(0)) push(ev); }
            else if (++n > 400) { clearInterval(wait); state = 'failed'; queue.length = 0; }
          }, 300);
        } catch (e) { state = 'failed'; queue.length = 0; }
      };
      document.head.appendChild(s);
    };
    if (typeof LAZY !== 'undefined' && LAZY.later) LAZY.later(go); else setTimeout(go, 3000);
  }
  // приложение свернули / вернули — конец и начало сессии (в приложении страница не закрывается, сама сессия не кончится)
  document.addEventListener('visibilitychange', () => { if (state !== 'ready') return; try { document.hidden ? ga.GameAnalytics.onStop() : ga.GameAnalytics.onResume(); } catch (e) {} });

  // ---- события ----
  const W2 = n => (n < 10 ? '0' : '') + n;
  const place = w => { const wd = (Math.ceil(w / 10) - 1) % 10 + 1, k = (w - 1) % 10 + 1; return ['World' + W2(wd), k === 10 ? 'Boss' : 'Wave' + W2(k)]; };
  const design = (id, val, f) => send(['design', id, val, f]);
  function dims() { send(['dim', hero(), lang()]); }
  function session() { dims(); design('Session:Start:' + platform()); design('Lang:' + lang()); design('Hero:Current:' + hero()); }
  function newGame() { dims(); design('Game:New:' + hero()); }
  function heroPick(id) { dims(); design('Hero:Select:' + (HERO[id] || clean(id))); }
  function cine(file, watched) { design('Cinematic:' + clean(String(file).replace(/\.\w+$/, '')) + ':' + (watched ? 'Watched' : 'Skipped')); }
  function ad(action, kind, tag) { send(['ad', action, kind === 'inter' ? 'Interstitial' : 'RewardedVideo', clean(tag || kind)]); }
  function purchase(item) { const p = CFG.pro || {}; send(['biz', p.currency || 'USD', p.cents || 0, 'Upgrade', clean(item || 'PRO'), 'menu']); }
  // золото: копим и раз в волну отдаём
  const gold = { src: {}, sink: {} }; let tag = '';
  const add = (o, type, id, n) => { const k = type + '|' + clean(id); o[k] = (o[k] || 0) + n; };
  function goldTag(t) { tag = t; }
  function goldIn(n, type) { if (n > 0) add(gold.src, type, type, n); }
  function goldOut(n, type, id) { if (n > 0) add(gold.sink, type, id, n); }
  function flush() {
    for (const [o, flow] of [[gold.src, 'Source'], [gold.sink, 'Sink']]) for (const k in o) { const [type, id] = k.split('|'); send(['res', flow, Math.round(o[k]), type, id]); delete o[k]; }
  }
  // ошибки JS: только текст и место в коде, без адресов и данных; не больше 10 разных за запуск
  const seenErr = new Set();
  function error(msg, src, line) {
    const where = String(src || '').split('/').pop().split('?')[0], m = (String(msg || 'error').slice(0, 200) + (where ? ' @' + where + ':' + (line || 0) : '')).replace(/https?:\/\/\S+/g, '');
    if (seenErr.has(m) || seenErr.size >= 10) return; seenErr.add(m); send(['err', m]);
  }
  addEventListener('error', e => { if (e && e.message) error(e.message, e.filename, e.lineno); });
  addEventListener('unhandledrejection', e => { const r = e && e.reason; error('promise: ' + (r && r.message ? r.message : String(r)), '', 0); });

  // ---- прохождение: следим за состоянием игры ----
  let cur = 0, hit = null, hitT = 0, upd = null, wasDead = false;
  const online = () => !!(window.NETC && NETC.on);
  const fields = () => ({ enemy_level: eLvl(), hero_level: hLvl(), hero: hero() });
  function start(w) {
    cur = w; const [a, b] = place(w);
    if ((w - 1) % 10 === 0) design('HeroLevel:' + a, hLvl());
    send(['prog', 'Start', a, b, fields()]);
  }
  function done(status, extra) { if (!cur) return; const [a, b] = place(cur); send(['prog', status, a, b, Object.assign(fields(), extra || {})]); cur = 0; flush(); }
  function killer() {
    if (hit && performance.now() - hitT < 4000) return hit;
    let best = null, bd = 1e18;
    for (const e of enemies) { if (!(e.hp > 0)) continue; if (e.boss || e.mini) return e.type; const d = (e.x - P.x) * (e.x - P.x) + (e.y - P.y) * (e.y - P.y); if (d < bd) { bd = d; best = e; } }
    return best ? best.type : 'unknown';
  }
  function watch() {
    if (typeof SHOP === 'undefined' || typeof P === 'undefined') return;
    if (online() || (typeof LIMBO !== 'undefined' && LIMBO.on)) { wasDead = P.dead > 0; return; }
    const dead = P.dead > 0;
    if (dead && !wasDead && cur) {
      const k = clean(killer()), [a, b] = place(cur);
      design('Death:' + a + ':' + b + ':' + k, eLvl(), { hero_level: hLvl(), hero: hero() });
      done('Fail', { killer: k });
    } else if (!dead && SHOP.phase === 'fight') {
      if (!cur) start(wave); else if (wave > cur) { done('Complete'); start(wave); }
    } else if (!dead && SHOP.phase === 'rest' && cur) done('Complete');
    wasDead = dead;
  }
  function install() {
    try {
      const _tick = SHOP.tick; SHOP.tick = function (dt) { const r = _tick.apply(this, arguments); try { watch(); } catch (e) {} return r; };
      // кто ударил последним: враг, внутри чьего хода герой получил урон. Урон от снарядов и луж приходит вне хода врага —
      // тогда убийцей считается босс или мини-босс, если он на арене, иначе ближайший враг (killer)
      const _ue = updateEnemy; updateEnemy = function (e, dt) { upd = e; try { return _ue(e, dt); } finally { upd = null; } };
      const _hp = hurtPlayer; hurtPlayer = function (d, kind) { if (upd && d > 0) { hit = upd.type; hitT = performance.now(); } return _hp.apply(this, arguments); };
      // золото: приход (награда за арену приходит в миг конца боя, остальное — с врагов и сундуков), расход — покупки
      const _add = SHOP.addGold; SHOP.addGold = function (n) { if (n > 0) { goldIn(n, tag || (SHOP.phase === 'rest' && SHOP.restT === 1.3 ? 'Arena' : 'Enemies')); tag = ''; } return _add.apply(this, arguments); };
      const _bi = buyItem; buyItem = function (id) { const g = SHOP.gold, r = _bi.apply(this, arguments); goldOut(g - SHOP.gold, 'Item', id); return r; };
      const _si = sellItem; sellItem = function (i) { const g = SHOP.gold, r = _si.apply(this, arguments); if (SHOP.gold > g) goldIn(SHOP.gold - g, 'Sell'); return r; };
      const _sb = SHOP.buy; SHOP.buy = function (kind, id) { const g = SHOP.gold, r = _sb.apply(this, arguments); goldOut(g - SHOP.gold, kind === 'flask' ? 'Flask' : 'Item', id || kind); return r; };
      const _sh = setHero; setHero = function (id) { const was = typeof HERO_ID !== 'undefined' ? HERO_ID : ''; const r = _sh.apply(this, arguments); if (booted && was !== HERO_ID) heroPick(HERO_ID); return r; };
      if (typeof LANG !== 'undefined') { const _ls = LANG.set; LANG.set = function (l) { const r = _ls.apply(this, arguments); dims(); design('Lang:' + lang()); return r; }; }
    } catch (e) {}
    setTimeout(() => { booted = true; session(); }, 1500);
    addEventListener('pagehide', flush);
  }
  let booted = false;
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', install); else install();

  function set(on) {
    enabled = !!on; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) {}
    if (state === 'ready') { try { ga.GameAnalytics.setEnabledEventSubmission(enabled); } catch (e) {} }
    if (!enabled) queue.length = 0;
  }
  return { log, set, _watch: watch, newGame, cine, ad, purchase, goldTag, goldOut, flush, error, TEST,
    get on() { return enabled; }, get keys() { return keyState; }, get live() { return live(); }, get state() { return state; } };
})();
