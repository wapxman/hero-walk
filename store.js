// Реклама и PRO (v107). Без PRO — реклама на весь экран перед раундом и при возвращении из Междумирья, не чаще раза
// в CFG.gapSec. PRO — одна покупка навсегда, рекламу отключает.
// v125 (Создатель 28.11): «рекламу показываем всем, кто не купил PRO» — миров без рекламы больше нет: реклама идёт с первого
// же мира, кроме самой первой арены новой игры (CFG.freeWaves — три волны, чтобы новичок сначала сыграл). Наград за рекламу
// («удвоить золото за босса», «воскреснуть на боссе») больше нет — рекламу за награду игра не зовёт вообще.
//
// Саму рекламу и покупку показывает приложение (APK): мост window.DuelStore (MainActivity.java). Здесь — только когда
// и что показать. ID рекламы и товара лежат в APK, в одном файле store.properties. На сайте моста нет: рекламы нет,
// вместо покупки — «PRO — в приложении Google Play».
//
// Мост (всё, что должен уметь APK):
//   DuelStore.isPro() → true/false          DuelStore.price() → строка цены ('' — ещё не известна)
//   DuelStore.buyPro()                      → потом STORE.cb('pro', 1|0)   (1 приходит и сам — при восстановлении покупки)
//   DuelStore.interReady() → true/false     DuelStore.showInterstitial() → потом STORE.cb('inter', 1|0)
//   DuelStore.rewardedReady() → true/false  DuelStore.showRewarded(tag)  → потом STORE.cb('reward', 1|0, tag)
// Проверка в браузере без APK: ?fakestore — поддельный мост (реклама — серая заглушка на 1,5 с), ?fakestore=pro — с PRO.
'use strict';
const STORE = (() => {
  const CFG = { freeWaves: 3, gapSec: 120, safetySec: 120, showSec: 4 };   // showSec — сколько ждём, что реклама открылась (v115); freeWaves — первая арена новой игры без рекламы (v125)
  const FAKE = /[?&]fakestore/.test(location.search);
  const B = window.DuelStore || (FAKE && !/fakestore=web/.test(location.search) ? fakeBridge() : null);   // ?fakestore=web — как на сайте, но окна видны и под автопрогоном
  const BOT = !!navigator.webdriver && !FAKE;          // автопрогон: окна не показываем, иначе он встанет
  const KEY = 'hw_store';
  let st = {}; try { st = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  let pro = false; try { pro = !!(B && B.isPro()); } catch (e) {}
  let lastAd = -1e9, busy = false, wait = null;
  const now = () => performance.now() / 1000;
  const online = () => !!((window.NETC && NETC.on) || (typeof TEAM !== 'undefined' && TEAM.on));
  const adsZone = () => wave >= CFG.freeWaves;     // первая арена новой игры пройдена — дальше реклама во всех мирах
  const call = (fn, ...a) => { try { return B && B[fn] ? B[fn](...a) : false; } catch (e) { return false; } };

  // ---------- звук игры на время рекламы ----------
  let muted = false, musWas = false;
  function mute(on) {
    if (on === muted) return; muted = on;
    try {
      if (on) { musWas = typeof mus !== 'undefined' && mus.el && !mus.el.paused; if (musWas) mus.el.pause(); if (AC && AC.state === 'running') AC.suspend(); }
      else { if (AC && AC.state !== 'running') AC.resume(); if (musWas && mus.el && mus.on) mus.el.play().catch(() => {}); }
    } catch (e) {}
  }
  // ---------- пауза игры на время окна ----------
  // Паузу игры включают и снимают многие (меню, карта, загрузка арены), поэтому своя пауза — отдельным счётчиком:
  // пока открыто окно или идёт реклама, SHOP.paused отвечает «да», что бы ни записали в него другие.
  let held0 = 0;
  { let own = !!SHOP.paused; Object.defineProperty(SHOP, 'paused', { get: () => held0 > 0 || own, set: v => { own = !!v; }, configurable: true }); }
  function freeze(on) { if (on) held0++; else if (held0 > 0) held0--; }

  // ---------- ответы приложения ----------
  function cb(kind, ok, tag) {
    if (kind === 'pro') { if (ok) { if (!pro) toast('PRO куплен — рекламы больше не будет'); if (!pro && wait && wait.kind === 'pro' && typeof METRICS !== 'undefined') METRICS.purchase('PRO'); pro = true; refreshMenu(); } const w = wait; if (w && w.kind === 'pro') { wait = null; w.done(!!ok); } return; }
    if (kind === 'shown') { if (wait) { if (!wait.shown && typeof METRICS !== 'undefined') METRICS.ad('Show', wait.kind, wait.tag); wait.shown = true; clearTimeout(wait.t0); } return; }      // приложение: реклама открылась на экране
    const w = wait; if (!w || w.kind !== kind) return;
    wait = null; clearTimeout(w.timer); clearTimeout(w.t0); mute(false);
    if (typeof METRICS !== 'undefined') { if (!w.shown) METRICS.ad(ok ? 'Show' : 'FailedShow', kind, w.tag); if (ok && kind === 'reward') METRICS.ad('RewardReceived', kind, w.tag); }
    w.done(!!ok);
  }
  // показать рекламу и дождаться ответа; если ответа нет слишком долго — идём дальше, игра не должна зависнуть
  function ad(kind, tag, done) {
    mute(true);
    wait = { kind, tag, done, timer: setTimeout(() => cb(kind, 0, tag), CFG.safetySec * 1000) };
    // v115: реклама могла не открыться и не ответить (на телефоне Создателя так не стартовала волна 100: игра ждала ответа 5 минут,
    // а «Начать волну» только открывала карту). Не открылась за showSec — идём дальше без неё. Открылась — приложение шлёт 'shown',
    // а если страницу закрыло чужое окно (document.hidden), значит реклама на экране — тоже ждём её конца.
    const w = wait; w.t0 = setTimeout(function chk() { if (wait !== w || w.shown) return; if (document.hidden) { w.t0 = setTimeout(chk, 2000); return; } cb(kind, 0, tag); }, CFG.showSec * 1000);
    call(kind === 'inter' ? 'showInterstitial' : 'showRewarded', tag);
  }

  // ---------- окно ----------
  const css = document.createElement('style');
  css.textContent = `
  #stWin { position: fixed; inset: 0; z-index: 60; display: none; align-items: center; justify-content: center; background: rgba(3,6,12,.78); }
  #stWin .box { width: min(92vw, 120vh); padding: 4vh 4vh 3.4vh; border-radius: 2vh; background: linear-gradient(#1a2233, #0c111c); border: .3vh solid #c9a24a;
    box-shadow: 0 0 6vh rgba(0,0,0,.8); text-align: center; color: #f3e6c4; font: 3vh Georgia, serif; }
  #stWin h2 { margin: 0 0 1.6vh; font: bold 4.6vh Georgia, serif; color: #ffd95e; text-shadow: 0 .3vh .6vh #000; }
  #stWin p { margin: 0 0 3vh; line-height: 1.35; }
  #stWin .row { display: flex; gap: 2.4vh; justify-content: center; flex-wrap: wrap; }
  #stWin .bt { min-width: 34vh; padding: 2vh 3vh; border-radius: 1.4vh; font: bold 3.1vh system-ui, sans-serif; color: #fff; background: #3a4a66; border: .25vh solid #6f86b3; cursor: pointer; user-select: none; }
  #stWin .bt.gold { background: linear-gradient(#e0a82a, #a86c0c); border-color: #ffe08a; color: #231400; }
  #stWin .bt:active { transform: scale(.96); }
  #stWin small { display: block; margin-top: 2vh; font-size: 2.1vh; opacity: .7; }
  #stToast { position: fixed; left: 50%; top: 12vh; transform: translateX(-50%); z-index: 61; padding: 1.4vh 3vh; border-radius: 1.2vh; background: #1a2233; border: .25vh solid #c9a24a;
    color: #ffe9a8; font: bold 2.8vh system-ui, sans-serif; opacity: 0; transition: opacity .4s; pointer-events: none; }
  #mMain .b.pro { position: absolute; right: 3vh; top: 3vh; width: 46vh; filter: brightness(1.2) saturate(1.3); }   /* в столбце меню места нет — кнопка в правом верхнем углу */
  #stFake { position: fixed; inset: 0; z-index: 99; background: #555; color: #fff; display: flex; align-items: center; justify-content: center; font: bold 6vh system-ui; }`;
  document.head.appendChild(css);
  let W = null, T = null;
  // окно с заголовком, текстом и кнопками [[надпись, действие, 'gold'?], …]; игра на это время стоит
  function win(title, text, buttons, note) {
    if (!W) { W = document.createElement('div'); W.id = 'stWin'; document.body.appendChild(W); for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'click']) W.addEventListener(ev, e => e.stopPropagation()); }
    W.innerHTML = '<div class="box"><h2></h2><p></p><div class="row"></div>' + (note ? '<small></small>' : '') + '</div>';
    W.querySelector('h2').textContent = title; W.querySelector('p').textContent = text; if (note) W.querySelector('small').textContent = note;
    const row = W.querySelector('.row');
    for (const [t, fn, cls] of buttons) {
      const b = document.createElement('div'); b.className = 'bt' + (cls ? ' ' + cls : ''); b.textContent = t; row.appendChild(b);
      b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); close(); fn(); });
    }
    if (W.style.display !== 'flex') freeze(true);
    W.style.display = 'flex';
  }
  addEventListener('keydown', e => { if ((W && W.style.display === 'flex') || wait) e.stopPropagation(); }, true);   // пока окно или реклама — клавиши до игры не доходят
  function close() { if (W && W.style.display === 'flex') { W.style.display = 'none'; freeze(false); } }
  function toast(t) {
    if (!T) { T = document.createElement('div'); T.id = 'stToast'; document.body.appendChild(T); }
    T.textContent = t; T.style.opacity = 1; clearTimeout(T._t); T._t = setTimeout(() => { T.style.opacity = 0; }, 3200);
  }

  // ---------- PRO ----------
  const priceTxt = () => { const p = call('price'); return p ? ' — ' + p : ''; };
  function buy(after) {
    if (!B) { win('PRO', 'PRO — в приложении Google Play. Здесь, на сайте, игра идёт без рекламы.', [['Понятно', () => after && after(false)]]); return; }
    wait = { kind: 'pro', done: ok => after && after(ok) };
    call('buyPro');
  }
  // экран один раз перед первой рекламой (после первой арены новой игры). На сайте рекламы нет — и экрана нет (v125: раньше там
  // было окно «Мир 3» с рассказом про приложение).
  function gate(go) {
    st.gate = 1; keep();
    if (!B) return go();
    win('Дальше — с рекламой', 'Купите PRO — и рекламы не будет никогда.',
      [['Купить PRO' + priceTxt(), () => buy(() => go()), 'gold'], ['Играть с рекламой', go]], 'PRO — одна покупка навсегда. Купить можно и позже — в главном меню.');
  }

  // ---------- реклама перед раундом (и при возвращении из Междумирья: портал тоже начинает волну) ----------
  const _sw = SHOP.startWave;
  SHOP.startWave = function () {
    if (busy) return;
    const a = arguments, go = () => { busy = false; return _sw.apply(SHOP, a); };
    if (BOT || online() || SHOP.phase !== 'rest' || P.dead > 0 || SHOP.transit || !adsZone() || pro) return go();
    if (!st.gate) { busy = true; gate(() => go()); return; }      // v114: сразу в бой (раньше звали SHOP.startWave заново — и снова открывалась карта миров)
    if (!B || now() - lastAd < CFG.gapSec || !call('interReady')) return go();
    busy = true; lastAd = now();
    ad('inter', '', () => go());
  };

  // v125 (Создатель 28.11): наград за рекламу больше нет. Убраны «Воскреснуть за рекламу» на боссе (обёртка LIMBO.enter) и
  // «Удвоить золото за рекламу» после босса (обёртки SHOP.onKill и PATHMAP.show) — вместе с их окнами.

  // ---------- кнопка PRO в главном меню ----------
  let mb = null;
  function refreshMenu() { if (mb) mb.textContent = pro ? 'PRO куплен' : 'PRO — без рекламы'; }
  function menu() {
    const btns = document.querySelector('#mMain'); if (!btns || mb) return;
    mb = document.createElement('div'); mb.className = 'b pro'; btns.appendChild(mb); refreshMenu();
    mb.addEventListener('pointerdown', e => {
      e.stopPropagation();
      if (pro) return toast('PRO уже куплен. Спасибо!');
      if (!B) return buy();
      win('PRO', 'Одна покупка навсегда: никакой рекламы.',
        [['Купить PRO' + priceTxt(), () => buy(), 'gold'], ['Не сейчас', () => {}]]);
    });
  }
  menu();

  // ---------- поддельный мост для проверки в браузере ----------
  function fakeBridge() {
    let p = /fakestore=pro/.test(location.search); const silent = /fakestore=silent/.test(location.search);   // silent — реклама «готова», но не открывается и не отвечает
    const log = window.FAKE_ADS = [];
    const show = (kind, tag) => {
      log.push(kind + (tag ? ':' + tag : '')); if (silent) return;
      setTimeout(() => STORE.cb('shown', 1, ''), 200);
      const d = document.createElement('div'); d.id = 'stFake'; d.textContent = 'РЕКЛАМА (' + kind + ')'; document.body.appendChild(d);
      setTimeout(() => { d.remove(); STORE.cb(kind, 1, tag); }, 1500);
    };
    return { isPro: () => p, price: () => '49 000 сум', buyPro: () => setTimeout(() => { p = true; STORE.cb('pro', 1); }, 300),
      interReady: () => true, showInterstitial: () => show('inter'), rewardedReady: () => true, showRewarded: tag => show('reward', tag) };
  }

  return { cb, CFG, buy, freeze, get pro() { return pro; }, get native() { return !!B; }, get busy() { return busy; }, _st: st, _reset() { lastAd = -1e9; } };
})();
