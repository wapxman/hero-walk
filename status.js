// Что висит на герое (v92): ряд значков состояний под полосками героя и звёзды оглушения над головой.
// Картинки — Клауди (ui/status/<имя>.webp, 128×128). Кодом рисуется только интерфейс: подложка, ободок, кольцо времени, цифры, подписи.
// Новое состояние подключается одной строкой:
//   HSTAT.src.bleed = () => P.sk.rip > 0 && { t: P.sk.rip, n: 2 };     // свой источник: { t — секунд осталось, n — стаки, pct — процент, nm — своя подпись }
//   HSTAT.show('fear', 3);                                              // или просто показать значок на 3 с (логику ведёт тот, кто вызвал)
// Имена: stun freeze root silence | blind slow poison burn cold bleed shred weak mark fear curse | shield haste immune clarity.
'use strict';
const HSTAT = (function () {
  // порядок в ряду: контроль, остальное плохое, хорошее (отдельной группой справа)
  const DEF = [
    ['stun', 'Оглушение', 0], ['freeze', 'Заморозка', 0], ['root', 'Обездвижен', 0], ['silence', 'Безмолвие', 0],
    ['blind', 'Дым', 0], ['slow', 'Замедление', 0], ['poison', 'Яд', 0], ['burn', 'Горение', 0], ['cold', 'Холод', 0], ['bleed', 'Кровотечение', 0],
    ['shred', 'Снятие брони', 0], ['weak', 'Ослабление', 0], ['mark', 'Метка', 0], ['fear', 'Страх', 0], ['curse', 'Проклятие', 0],
    ['shield', 'Щит', 1], ['haste', 'Ускорение', 1], ['immune', 'Защита', 1], ['clarity', 'Ясность', 1],
  ];
  const MAX = 8, DIR = 'ui/status/';
  const X = {};                                   // HSTAT.show: имя → { t, n, pct }
  const mx = (...a) => Math.max(0, ...a.map(v => +v || 0));
  const net = () => window.NETC && NETC.on && typeof NET !== 'undefined' ? P.netFl | 0 : 0;
  const ext = k => X[k] && X[k].t > 0 ? X[k] : null;
  const timed = (k, ...a) => { const e = ext(k), t = mx(e && e.t, ...a); return t > 0 && { t, n: e && e.n, pct: e && e.pct }; };
  const stack = k => { const s = P.ss[k], e = ext(k); return s.n > 0 ? { t: s.t, n: s.n } : e; };
  const K = () => P.sk || {};
  // замедление «само по себе»: не от холода — у холода свой значок со стаками
  const coldSlow = () => P.ss.cold.n > 0 && P.slowK >= 1 - 0.15 * P.ss.cold.n - 0.001;
  const src = {
    stun: () => timed('stun', P.ss.stun),
    freeze: () => timed('freeze', P.ss.freeze),
    root: () => { const S = K(), f = net(); if (f & NET_F('F_ROOT')) return { t: 0 };
      return timed('root', S.sleep, S.astral, S.bind, S.pin, P.slowT > 0 && P.slowK <= 0 ? P.slowT : 0); },
    silence: () => net() & NET_F('F_SIL') ? { t: 0 } : timed('silence', P.ss.silence, K().hex),
    blind: () => timed('blind', P.ss.blind, K().miss),
    slow: () => {
      const e = ext('slow'); if (e) return e;
      if (net() & NET_F('F_SLOW')) return { t: 0, pct: P.netSpd < 1 ? 1 - P.netSpd : 0 };
      return P.slowT > 0 && P.slowK < 1 && P.slowK > 0 && !coldSlow() && { t: P.slowT, pct: 1 - P.slowK };
    },
    poison: () => { const a = P.ss.poison, b = K().poison || { n: 0, t: 0 }, n = (a.n > 0 ? a.n : 0) + (b.n > 0 ? b.n : 0); return n > 0 ? { t: mx(a.n > 0 && a.t, b.n > 0 && b.t), n } : ext('poison'); },
    burn: () => stack('burn'), cold: () => stack('cold'), shred: () => stack('shred'),
    bleed: () => timed('bleed', K().wounds),
    weak: () => timed('weak', K().weak, K().atkSlow),
    mark: () => timed('mark'),
    fear: () => timed('fear'),
    curse: () => timed('curse', K().hunger),
    shield: () => timed('shield', P.shieldT, P.ss.rshield > 0 ? P.ss.rshT : 0),
    haste: () => timed('haste', P.ss.spd),
    immune: () => timed('immune', ...Object.values(P.ss.imm)),
    clarity: () => timed('clarity', P.ss.noMiss),
  };
  function NET_F(n) { return typeof NET !== 'undefined' && NET[n] || 0; }

  // ---------- ряд значков (DOM, под полосками героя) ----------
  const css = document.createElement('style');
  css.textContent = `#hStat { position: fixed; z-index: 6; left: calc(1.5vh + env(safe-area-inset-left)); top: calc(17.4vh + env(safe-area-inset-top)); display: flex; pointer-events: none; --s: clamp(40px, 11.4vh, 56px); }
  #hStat .st { position: relative; width: var(--s); height: var(--s); margin-right: calc(var(--s) * 0.1); border-radius: 50%; box-sizing: border-box; flex: none;
    background: radial-gradient(circle at 50% 38%, #2a3242, #10141c 72%); border: calc(var(--s) * 0.065) solid #d8463a; box-shadow: 0 0 0 1px #000, 0 2px 5px rgba(0,0,0,.6); animation: hstPop .3s ease-out; }
  #hStat .st.good { border-color: #4ec96b; } #hStat .st.gap { margin-left: calc(var(--s) * 0.3); }
  #hStat .st img { position: absolute; inset: 4%; width: 92%; height: 92%; border-radius: 50%; object-fit: contain; }
  #hStat .st i { position: absolute; inset: 0; border-radius: 50%; }
  #hStat .st b { position: absolute; right: -12%; bottom: -10%; font: bold calc(var(--s) * 0.36) system-ui, sans-serif; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000; white-space: nowrap; }
  #hStat .st b.p { right: auto; left: 50%; transform: translateX(-50%); bottom: -14%; font-size: calc(var(--s) * 0.3); color: #ffe9a8; }
  #hStat .st u { position: absolute; left: 0; top: 112%; text-decoration: none; white-space: nowrap; font: bold calc(var(--s) * 0.27) system-ui, sans-serif; color: #fff; padding: 1px 5px; border-radius: 4px; background: rgba(8,10,16,.72);
    text-shadow: 0 1px 2px #000; transition: opacity .3s; }
  #hStat .st u.l1 { top: 147%; } #hStat .st u.l2 { top: 182%; } #hStat .st u.off { opacity: 0; }
  @keyframes hstPop { 0% { transform: scale(1.7); filter: brightness(1.8); } 100% { transform: none; filter: none; } }`;
  document.head.appendChild(css);
  const row = document.createElement('div'); row.id = 'hStat'; document.body.appendChild(row);
  const EL = {};                                  // имя → { el, ring, num, cap, max, last, born, key }
  const now = () => performance.now() / 1000;
  function make(id, nm, good) {
    const el = document.createElement('div'); el.className = 'st' + (good ? ' good' : '');
    const im = new Image(); im.onerror = () => im.remove(); im.src = DIR + id + '.webp' + (typeof V === 'string' ? V : ''); el.appendChild(im);
    const ring = document.createElement('i'), num = document.createElement('b'), cap = document.createElement('u');
    el.append(ring, num, cap);
    return { el, ring, num, cap, max: 0, last: 0, born: now(), key: '' };
  }
  const pct = v => '−' + Math.round(v * 100) + '%';
  function update(dt) {
    for (const k in X) if (X[k].t > 0) X[k].t -= dt;
    const hide = P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on);
    const on = [];
    if (!hide) for (const [id, nm, good] of DEF) { const v = src[id](); if (v && (good || on.length < MAX)) on.push([id, nm, good, v]); }   // плохих — первые 8; хорошие (их всего 4) видны всегда
    const want = {}; let prevGood = 0, i = 0;
    for (const [id, nm, good, v] of on) {
      want[id] = 1;
      let o = EL[id]; if (!o) { o = EL[id] = make(id, nm, good); o.idx = -1; }
      // порядок в ряду
      if (row.children[i] !== o.el) row.insertBefore(o.el, row.children[i] || null);
      const gap = good && !prevGood && i > 0; if (o.gap !== gap) { o.gap = gap; o.el.classList.toggle('gap', gap); }
      prevGood = good;
      // кольцо оставшегося времени: тёмный сектор растёт по часовой
      const t = v.t || 0; if (t > o.last + 0.05 || !o.max) o.max = t; o.last = t;
      const deg = o.max >= 0.5 ? Math.round(360 * (1 - Math.min(1, t / o.max)) / 6) * 6 : 0;
      const txt = v.n > 0 ? '×' + v.n : v.pct > 0 ? pct(v.pct) : '', cap = (v.nm || nm) + (v.n > 0 ? ' ×' + v.n : v.pct > 0 ? ' ' + pct(v.pct) : '');
      const key = deg + '|' + txt;
      if (key !== o.key) {
        o.key = key; o.ring.style.background = deg ? 'conic-gradient(rgba(0,0,0,.62) ' + deg + 'deg, rgba(0,0,0,0) 0)' : 'none';
        if (o.txt !== txt) { o.txt = txt; o.num.textContent = txt; o.num.className = v.n > 0 ? '' : 'p'; o.cap.textContent = cap; }
      }
      // подпись 2 с после появления; у соседей — на разной высоте, чтобы не наезжали
      const capOn = now() - o.born < 2, lo = i % 3;
      if (o.capOn !== capOn) { o.capOn = capOn; o.cap.classList.toggle('off', !capOn); }
      if (o.lo !== lo) { o.lo = lo; o.cap.classList.toggle('l1', lo === 1); o.cap.classList.toggle('l2', lo === 2); }
      i++;
    }
    for (const id in EL) if (!want[id]) { EL[id].el.remove(); delete EL[id]; }
  }
  {
    const _cu = combatUpdate;
    combatUpdate = function (dt) { _cu(dt); update(dt); };
  }

  // ---------- оглушение: звёзды кружат над головой ----------
  const star = new Image(); star.src = DIR + 'star.webp' + (typeof V === 'string' ? V : '');
  const _ho = heroOver;
  heroOver = function (t) {
    _ho(t);
    if (!(P.ss.stun > 0) || P.dead > 0 || !star.complete || !star.naturalWidth) return;
    const hs = HS(), cx = P.x, cy = P.y - CH * hs * 1.2, rx = CH * 0.38 * hs, ry = CH * 0.11 * hs, N = 4, L = [];
    for (let j = 0; j < N; j++) { const a = t * 3.6 + j * 6.2832 / N; L.push([Math.sin(a), Math.cos(a), j]); }
    L.sort((a, b) => a[0] - b[0]);               // дальние (выше по эллипсу) — первыми
    ctx.save(); ctx.globalCompositeOperation = 'source-over';
    for (const [s, c, j] of L) {
      const k = (s + 1) / 2, w = CH * 0.3 * hs * (0.72 + 0.28 * k);   // дальние меньше и бледнее
      ctx.globalAlpha = (0.55 + 0.45 * k) * Math.min(1, P.ss.stun * 4);
      ctx.translate(cx + c * rx, cy + s * ry); ctx.rotate(t * 2 + j); ctx.drawImage(star, -w / 2, -w / 2, w, w); ctx.rotate(-t * 2 - j); ctx.translate(-cx - c * rx, -cy - s * ry);
    }
    ctx.restore();
  };
  return { src, show(id, t, o) { X[id] = Object.assign({ t }, o || {}); }, list: () => Object.keys(EL), DEF };
})();
