// Анонсы «Скоро» в главном меню (v124, задача Клауди/Создателя 28.11): небольшая карточка выезжает справа снизу, не задевая кнопок,
// держится 12 с и уезжает. Два анонса чередуются: новый герой (ui/teaser/hero) и новая история — Руины Зеркального города (ui/teaser/location).
// Тап по карточке — картинка на весь экран с подписью и кнопкой «Закрыть» (и «Назад» на Android). Картинки — работа Клауди, кодом только
// рамка, текст и движение. Грузятся лениво: маленькая — перед первым выездом, большая — по тапу; на старте игры ничего не грузится.
// Когда выезжает: только пока главное меню видно и сверху на нём ничего нет (настройки, «История», выбор языка, ролики), первый раз —
// через 40 с в меню, дальше — не чаще раза в 150 с времени в меню. Подписи — текстом (переводит LANG), строки в lang/src/08_teaser.json.
'use strict';
const TEASER = (() => {
  const V0 = typeof V === 'string' ? V : '';
  const LIST = [
    { img: 'hero', title: 'Новый герой', full: 'Скоро: новый герой', sub: 'Он идёт сквозь песчаную бурю. Кто он — узнаете с обновлением.' },
    { img: 'location', title: 'Новая история — Руины Зеркального города', full: 'Скоро: новая история — Руины Зеркального города', sub: 'Город, где у каждого отражения своя воля. Новая глава — с обновлением.' },
  ];
  const FIRST = 40, EVERY = 150, STAY = 12;
  const src = (n, s) => 'ui/teaser/' + n + (s ? '_s' : '') + '.webp' + V0;
  let idx = 0; try { idx = (+localStorage.getItem('hw_teaser') || 0) % LIST.length; } catch (e) {}
  let seen = 0, next = FIRST, card = null, full = null, out = false, hideT = 0;
  const css = document.createElement('style');
  css.textContent = `
  #tzCard { position: absolute; right: 3vh; bottom: 6.5vh; width: 46vh; display: flex; align-items: center; gap: 1.6vh; padding: 1.2vh 1.6vh 1.2vh 1.2vh;
    background: linear-gradient(90deg, rgba(14,10,6,.92), rgba(30,22,12,.88)); border: .25vh solid rgba(226,186,104,.75); border-radius: 1.4vh;
    box-shadow: 0 .6vh 2vh rgba(0,0,0,.6); transform: translateX(calc(100% + 5vh)); transition: transform .7s cubic-bezier(.2,.9,.25,1.1);
    cursor: pointer; user-select: none; font-family: Georgia, serif; z-index: 3; }
  #tzCard.on { transform: none; }
  #tzCard:active { filter: brightness(1.15); }
  #tzCard .im { flex: none; width: 16vh; height: 10.7vh; border-radius: .8vh; background: #000 center / cover no-repeat; border: .2vh solid rgba(226,186,104,.5); }
  #tzCard .tx { display: flex; flex-direction: column; gap: .5vh; min-width: 0; }
  #tzCard .k { font: bold 1.9vh Georgia, serif; letter-spacing: .35vh; color: #ffcf5a; text-transform: uppercase; }
  #tzCard .t { font-size: 2.3vh; line-height: 1.2; color: #f6ead0; text-shadow: 0 .2vh .4vh #000; }
  #tzCard .x { position: absolute; top: .3vh; right: .9vh; font-size: 2.2vh; color: rgba(246,234,208,.6); padding: .3vh .6vh; }
  #tzFull { position: fixed; inset: 0; z-index: 60; background: rgba(0,0,0,.92); display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 2vh; opacity: 0; transition: opacity .4s; font-family: Georgia, serif; color: #f6ead0; }
  #tzFull.on { opacity: 1; }
  #tzFull img { max-width: 94vw; max-height: 66vh; border-radius: 1vh; border: .3vh solid rgba(226,186,104,.6); opacity: 0; transition: opacity .5s; }
  #tzFull img.ok { opacity: 1; }
  #tzFull .t { font: bold 3.6vh Georgia, serif; color: #ffd97a; text-align: center; text-shadow: 0 0 2vh rgba(243,201,106,.35); padding: 0 4vw; }
  #tzFull .s { font-size: 2.4vh; opacity: .85; text-align: center; padding: 0 6vw; }
  #tzFull .b { width: 34vh; height: 8.5vh; background: url(ui/h_button.webp${V0}) center / 100% 100% no-repeat; display: flex; align-items: center;
    justify-content: center; font: bold 3vh Georgia, serif; color: #fff; text-shadow: 0 .2vh .5vh #000; cursor: pointer; }
  #tzFull .b:active { transform: scale(.96); }`;
  document.head.appendChild(css);
  const stop = e => { e.stopPropagation(); e.preventDefault(); };
  function menuFree() {
    const m = document.getElementById('mMain');
    if (!m || getComputedStyle(m).display === 'none' || full) return false;
    if (typeof CINE !== 'undefined' && CINE.on) return false;
    if (typeof LANG !== 'undefined' && !LANG.chosen) return false;
    const e = document.elementFromPoint(innerWidth * 0.85, innerHeight * 0.8);      // сверху на меню ничего нет (окно, ролик, выбор языка)
    return !!e && m.contains(e);
  }
  function make() {
    const m = document.getElementById('mMain'); if (!m) return null;
    if (card && card.parentNode === m) return card;
    card = document.createElement('div'); card.id = 'tzCard';
    card.innerHTML = '<div class="im"></div><div class="tx"><div class="k">Скоро</div><div class="t"></div></div><div class="x">×</div>';
    card.addEventListener('pointerdown', e => { stop(e); if (e.target.classList.contains('x')) hide(); else open(); });
    m.appendChild(card); return card;
  }
  function show() {
    const c = make(); if (!c) return;
    const it = LIST[idx], im = new Image();
    im.onload = () => {
      if (!menuFree()) return;
      c.querySelector('.im').style.backgroundImage = 'url(' + im.src + ')';
      c.querySelector('.t').textContent = it.title; c.dataset.i = idx;
      requestAnimationFrame(() => c.classList.add('on')); out = true;
      clearTimeout(hideT); hideT = setTimeout(hide, STAY * 1000);
    };
    im.src = src(it.img, true);
  }
  function hide() {
    clearTimeout(hideT); if (card) card.classList.remove('on');
    if (out) { out = false; idx = (idx + 1) % LIST.length; try { localStorage.setItem('hw_teaser', idx); } catch (e) {} }
  }
  function open() {
    const it = LIST[card ? +card.dataset.i || 0 : idx]; hide();
    full = document.createElement('div'); full.id = 'tzFull';
    full.innerHTML = '<img alt=""><div class="t"></div><div class="s"></div><div class="b">Закрыть</div>';
    full.querySelector('.t').textContent = it.full; full.querySelector('.s').textContent = it.sub;
    const im = full.querySelector('img'); im.onload = () => im.classList.add('ok'); im.src = src(it.img, false);
    full.addEventListener('pointerdown', e => { stop(e); close(); });
    document.body.appendChild(full); requestAnimationFrame(() => full && full.classList.add('on'));
  }
  function close() {
    if (!full) return; const f = full; full = null; f.classList.remove('on'); setTimeout(() => f.remove(), 400);
  }
  // время в меню считаем по 2 с; пока открыто что-то поверх — часы стоят, выехавшая карточка уезжает
  setInterval(() => {
    if (!menuFree()) { if (out) hide(); return; }
    seen += 2; if (!out && seen >= next) { next = seen + EVERY; show(); }
  }, 2000);
  const back0 = window.androidBack;
  window.androidBack = function () { if (full) { close(); return true; } return back0 ? back0.apply(this, arguments) : false; };
  return { show, hide, open, close, get out() { return out; }, get full() { return !!full; }, LIST, _seen: n => { seen = n; } };
})();
