// Анонсы «Скоро» в главном меню (v124, задача Клауди/Создателя 28.11). v125 (Создатель 28.11): «пусть всегда стоит, не всплывает» —
// обе карточки стоят справа снизу постоянно, одна над другой, не выезжают и не уезжают, крестика нет.
// Два анонса: новый герой (ui/teaser/hero) и новая история — Руины Зеркального города (ui/teaser/location).
// Тап по карточке — картинка на весь экран с подписью и кнопкой «Закрыть» (и «Назад» на Android). Картинки — работа Клауди, кодом только
// рамка и текст. Грузятся лениво: маленькие — когда главное меню первый раз показано, большая — по тапу; на старте игры ничего не грузится.
// Подписи — текстом (переводит LANG), строки в lang/src/08_teaser.json.
'use strict';
const TEASER = (() => {
  const V0 = typeof V === 'string' ? V : '';
  const LIST = [
    { img: 'hero', title: 'Новый герой', full: 'Скоро: новый герой', sub: 'Он идёт сквозь песчаную бурю. Кто он — узнаете с обновлением.' },
    { img: 'location', title: 'Новая история — Руины Зеркального города', full: 'Скоро: новая история — Руины Зеркального города', sub: 'Город, где у каждого отражения своя воля. Новая глава — с обновлением.' },
  ];
  const src = (n, s) => 'ui/teaser/' + n + (s ? '_s' : '') + '.webp' + V0;
  let box = null, full = null, loaded = false;
  const css = document.createElement('style');
  css.textContent = `
  #tzBox { position: absolute; right: 3vh; bottom: 6.5vh; width: 46vh; display: flex; flex-direction: column; gap: 1vh; z-index: 3; }
  #tzBox .c { display: flex; align-items: center; gap: 1.6vh; padding: 1.2vh 1.6vh 1.2vh 1.2vh;
    background: linear-gradient(90deg, rgba(14,10,6,.92), rgba(30,22,12,.88)); border: .25vh solid rgba(226,186,104,.75); border-radius: 1.4vh;
    box-shadow: 0 .6vh 2vh rgba(0,0,0,.6); cursor: pointer; user-select: none; -webkit-user-select: none; font-family: Georgia, serif; }
  #tzBox .c:active { filter: brightness(1.15); }
  #tzBox .im { flex: none; width: 16vh; height: 10.7vh; border-radius: .8vh; background: #000 center / cover no-repeat; border: .2vh solid rgba(226,186,104,.5); }
  #tzBox .tx { display: flex; flex-direction: column; gap: .5vh; min-width: 0; }
  #tzBox .k { font: bold 1.9vh Georgia, serif; letter-spacing: .35vh; color: #ffcf5a; text-transform: uppercase; }
  #tzBox .t { font-size: 2.3vh; line-height: 1.2; color: #f6ead0; text-shadow: 0 .2vh .4vh #000; }
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
  // карточки стоят в главном меню всегда; картинки подставляются, когда меню первый раз на экране
  function make() {
    const m = document.getElementById('mMain'); if (!m) return null;
    if (box && box.parentNode === m) return box;
    box = document.createElement('div'); box.id = 'tzBox';
    LIST.forEach((it, i) => {
      const c = document.createElement('div'); c.className = 'c'; c.dataset.i = i;
      c.innerHTML = '<div class="im"></div><div class="tx"><div class="k">Скоро</div><div class="t"></div></div>';
      c.querySelector('.t').textContent = it.title;
      c.addEventListener('pointerdown', e => { stop(e); open(i); });
      box.appendChild(c);
    });
    m.appendChild(box); return box;
  }
  function load() {
    if (loaded || !box) return; loaded = true;
    box.querySelectorAll('.c').forEach((c, i) => { c.querySelector('.im').style.backgroundImage = 'url(' + src(LIST[i].img, true) + ')'; });
  }
  function open(i) {
    if (full) return;
    const it = LIST[+i || 0];
    full = document.createElement('div'); full.id = 'tzFull';
    full.innerHTML = '<img alt=""><div class="t"></div><div class="s"></div><div class="b">Закрыть</div>';
    full.querySelector('.t').textContent = it.full; full.querySelector('.s').textContent = it.sub;
    const im = full.querySelector('img'); im.onload = () => im.classList.add('ok'); im.src = src(it.img, false);
    full.addEventListener('pointerdown', e => { stop(e); close(); });
    for (const ev of ['touchstart', 'mousedown', 'click']) full.addEventListener(ev, e => e.stopPropagation());
    document.body.appendChild(full); requestAnimationFrame(() => full && full.classList.add('on'));
  }
  function close() {
    if (!full) return; const f = full; full = null; f.classList.remove('on'); setTimeout(() => f.remove(), 400);
  }
  make();
  { const iv = setInterval(() => {
      const m = document.getElementById('mMain'); if (!m) return;
      if (!box) make();
      if (getComputedStyle(m).display !== 'none') { load(); clearInterval(iv); }
    }, 500); }
  const back0 = window.androidBack;
  window.androidBack = function () { if (full) { close(); return true; } return back0 ? back0.apply(this, arguments) : false; };
  return { open, close, get full() { return !!full; }, get shown() { return !!box && loaded; }, LIST };
})();
