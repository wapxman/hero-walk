// Английская версия (v121, просьба Создателя 25.11). Игра написана по-русски; перевод идёт на выходе, не трогая код игры:
//   • всё, что рисуется текстом на холсте (надписи над героями, имена приёмов, цифры с подписями), — через fillText / strokeText;
//   • всё, что стоит в разметке (меню, лавка, окна, подсказки), — наблюдатель за страницей переводит текст, как только он появился.
// Словарь — lang/en.js (собирает tools/lang_build.py из lang/src/*.json): «русская строка» → «английская». Строка, которой в словаре
// нет целиком, переводится по кускам: самые длинные известные куски заменяются первыми («Волна 5 — БОСС МИРА» = «Волна » + «5» +
// « — БОСС МИРА»). Русские строки в коде остаются как есть — логика игры (имена умений для озвучки и т. п.) работает с ними.
// Язык: ключ hw_lang (ru | en). При первом запуске — экран выбора после лого (LANG.pick, зовёт cine.js); потом — в настройках.
// Проверка: ?lang=en в адресе; LANG.miss — что осталось непереведённым (для tools/lang_check.py).
'use strict';
const LANG = (() => {
  const KEY = 'hw_lang', CYR = /[А-Яа-яЁё]/;
  let cur = 'ru', chosen = false;
  try { const v = localStorage.getItem(KEY); if (v === 'ru' || v === 'en') { cur = v; chosen = true; } } catch (e) {}
  { const q = /[?&]lang=(ru|en)/.exec(location.search); if (q) { cur = q[1]; chosen = true; } }
  const dict = () => (typeof LANG_EN !== 'undefined' ? LANG_EN : {});
  const cache = new Map(), miss = new Set();
  let rx = null;
  function build() {
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), L = '[А-Яа-яЁё]';
    const keys = Object.keys(dict()).filter(k => k.trim().length >= 2 && CYR.test(k)).sort((a, b) => b.length - a.length);
    const part = (k, look) => (look && CYR.test(k[0]) ? '(?<!' + L + ')' : '') + esc(k) + (look && CYR.test(k[k.length - 1]) ? '(?!' + L + ')' : '');
    try { rx = new RegExp(keys.map(k => part(k, true)).join('|'), 'g'); }
    catch (e) { rx = new RegExp(keys.map(k => part(k, false)).join('|'), 'g'); }      // старый браузер без «взгляда назад»
  }
  function t(s) {
    if (cur !== 'en' || typeof s !== 'string' || !CYR.test(s)) return s;
    let r = cache.get(s); if (r !== undefined) return r;
    const d = dict(); r = d[s];
    if (r === undefined) { const tr = s.trim(); if (tr !== s && d[tr] !== undefined) r = s.replace(tr, d[tr]); }
    if (r === undefined) { if (!rx) build(); r = s.replace(rx, m => d[m]); }
    if (CYR.test(r) && d[s] === undefined && miss.size < 2000) miss.add(s);      // «Русский» в переключателе языка переведён сам в себя — это не пропуск
    if (cache.size > 6000) cache.clear();
    cache.set(s, r); return r;
  }
  // ---- холст ----
  { const P0 = CanvasRenderingContext2D.prototype;
    for (const fn of ['fillText', 'strokeText', 'measureText']) { const f = P0[fn]; P0[fn] = function (s) { if (cur === 'en' && typeof s === 'string' && CYR.test(s)) arguments[0] = t(s); return f.apply(this, arguments); }; } }
  // ---- разметка ----
  const SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1 };
  function node(n) {
    if (n.nodeType === 3) {
      const p = n.parentNode; if (!p || SKIP[p.nodeName]) return;
      if (cur === 'en') { const v = n.nodeValue; if (CYR.test(v)) { const r = t(v); if (r !== v) { n.__ru = v; if (p.childNodes.length === 1 && p.dataset) p.dataset.ru = v; n.nodeValue = r; } } }      // r === v — перевода нет: не трогаем (иначе наблюдатель зациклится)
      else if (n.__ru != null) { n.nodeValue = n.__ru; n.__ru = null; if (p.dataset && p.dataset.ru) delete p.dataset.ru; }
    } else if (n.nodeType === 1 && !SKIP[n.nodeName]) {
      for (const a of ['title', 'placeholder']) if (n.hasAttribute && n.hasAttribute(a)) { const v = n.getAttribute(a); if (cur === 'en') { if (CYR.test(v)) { const r = t(v); if (r !== v) { n['__ru_' + a] = v; n.setAttribute(a, r); } } } else if (n['__ru_' + a] != null) { n.setAttribute(a, n['__ru_' + a]); n['__ru_' + a] = null; } }
      for (let c = n.firstChild; c; c = c.nextSibling) node(c);
    }
  }
  function apply() { if (document.body) node(document.body); try { document.documentElement.lang = cur; } catch (e) {} }
  const obs = new MutationObserver(list => {
    if (cur !== 'en') return;
    for (const m of list) {
      if (m.type === 'characterData') node(m.target);
      else if (m.type === 'attributes') { const v = m.target.getAttribute(m.attributeName); if (v && CYR.test(v)) node(m.target); }
      else for (const n of m.addedNodes) node(n);
    }
  });
  const watch = () => { obs.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] }); apply(); };
  if (document.body) watch(); else addEventListener('DOMContentLoaded', watch);
  function set(l) {
    if (l !== 'ru' && l !== 'en') return; cur = l; chosen = true; cache.clear();
    try { localStorage.setItem(KEY, l); } catch (e) {}
    apply();
  }
  // ---- экран выбора языка (первый запуск): две кнопки в стиле игры на чёрном экране заставок ----
  function pick(root) {
    return new Promise(done => {
      const V0 = typeof V === 'string' ? V : '';
      const box = document.createElement('div'); box.id = 'lgPick';
      box.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5vh;opacity:0;transition:opacity .6s;font-family:Georgia,serif;color:#f3d98a';
      box.innerHTML = '<div style="font-size:4.6vh;letter-spacing:.5vh;text-shadow:0 0 2.4vh rgba(243,201,106,.4)">Язык · Language</div><div style="display:flex;gap:5vh"></div>';
      const row = box.lastChild;
      for (const [l, name] of [['ru', 'Русский'], ['en', 'English']]) {
        const b = document.createElement('div'); b.dataset.l = l; b.textContent = name;
        b.style.cssText = 'width:44vh;height:12.5vh;background:url(ui/h_button.webp' + V0 + ') center/100% 100% no-repeat;display:flex;align-items:center;justify-content:center;font:bold 3.6vh Georgia,serif;color:#fff;text-shadow:0 .2vh .5vh #000;cursor:pointer;user-select:none';
        b.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); set(l); box.style.opacity = '0'; setTimeout(done, 450); });
        row.appendChild(b);
      }
      root.appendChild(box); requestAnimationFrame(() => { box.style.opacity = '1'; });
    });
  }
  return { t, set, pick, apply, miss, get cur() { return cur; }, get chosen() { return chosen; } };
})();
