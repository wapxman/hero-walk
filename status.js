// Что висит на герое (v92–v93): ряд значков состояний внизу над ячейками предметов (без слов), звёзды оглушения над головой,
// запрет на кнопках умений и атаки.
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
    ['coop_shield', 'Щит напарника', 1], ['coop_frost', 'Ледяной разгон', 1],   // «Вместе»: помощь напарника (net/team.js)
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
    coop_shield: () => timed('coop_shield'), coop_frost: () => timed('coop_frost'),
  };
  function NET_F(n) { return typeof NET !== 'undefined' && NET[n] || 0; }

  // ---------- ряд значков (DOM, внизу по центру над ячейками предметов) ----------
  const css = document.createElement('style');
  css.textContent = `#hStat { position: fixed; z-index: 6; left: calc(50% - 14vh); transform: translateX(-50%); bottom: calc(14.6vh + var(--sab)); display: flex; pointer-events: none; --s: clamp(32px, 9.4vh, 46px); }
  #hStat .st { position: relative; width: var(--s); height: var(--s); margin: 0 calc(var(--s) * 0.05); border-radius: 50%; box-sizing: border-box; flex: none;
    background: radial-gradient(circle at 50% 38%, #2a3242, #10141c 72%); --c: #e2463a; box-shadow: 0 0 0 1px #000, 0 2px 5px rgba(0,0,0,.6); animation: hstPop .3s ease-out; }
  #hStat .st.good { --c: #4ec96b; } #hStat .st.gap { margin-left: calc(var(--s) * 0.35); }
  #hStat .st img { position: absolute; inset: 11%; width: 78%; height: 78%; border-radius: 50%; object-fit: contain; }
  #hStat .st i { position: absolute; inset: 0; border-radius: 50%; background: var(--c);
    -webkit-mask-image: radial-gradient(closest-side, transparent 83%, #000 86%); mask-image: radial-gradient(closest-side, transparent 83%, #000 86%); }
  #hStat .st b { position: absolute; right: -8%; bottom: -12%; font: bold calc(var(--s) * 0.4) system-ui, sans-serif; color: #fff; text-shadow: 0 0 3px #000, 0 0 3px #000, 0 1px 2px #000; }
  @keyframes hstPop { 0% { transform: scale(1.7); filter: brightness(1.8); } 100% { transform: none; filter: none; } }`;
  document.head.appendChild(css);
  const row = document.createElement('div'); row.id = 'hStat'; document.body.appendChild(row);
  const EL = {};                                  // имя → { el, ring, num, max, last, key }
  const now = () => performance.now() / 1000;
  function make(id, nm, good, item) {
    const el = document.createElement('div'); el.className = 'st' + (good ? ' good' : '');
    const it = item && typeof ALL !== 'undefined' && ALL[item], VV = typeof V === 'string' ? V : '';
    if (it && typeof (it.img || it.ic) === 'number') {   // иконка предмета из общего листа ui/items.webp (класс .it — items.js)
      const sp = document.createElement('span'), i = it.ic; sp.className = 'it'; sp.style.cssText = 'position:absolute;inset:11%;border-radius:50%;background-position:' + (i % 4) * 100 / 3 + '% ' + Math.floor(i / 4) * 100 / 19 + '%'; el.appendChild(sp);
    } else { const im = new Image(); im.onerror = () => im.remove(); im.src = (it ? it.img : DIR + id + '.webp') + VV; el.appendChild(im); }
    const ring = document.createElement('i'), num = document.createElement('b');
    el.append(ring, num);
    return { el, ring, num, max: 0, last: 0, born: now(), key: '' };
  }
  function update(dt) {
    for (const k in X) if (X[k].t > 0) X[k].t -= dt;
    const hide = P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on);
    const on = [];
    if (!hide) for (const [id, nm, good] of DEF) { const v = src[id](); if (v && (good || on.length < MAX)) on.push([id, nm, good, v]); }   // плохих — первые 8; хорошие (их всего 4) видны всегда
    // временные эффекты предметов (v99): значок — иконка самого предмета, зелёный ободок, тот же таймер. Список даёт itemfx.js (HSTAT.items)
    if (!hide && API.items) for (const [item, v] of API.items()) on.push(['it_' + item, '', 1, v, item]);
    const want = {}; let prevGood = 0, i = 0;
    for (const [id, nm, good, v, item] of on) {
      want[id] = 1;
      let o = EL[id]; if (!o) { o = EL[id] = make(id, nm, good, item); o.idx = -1; }
      // порядок в ряду
      if (row.children[i] !== o.el) row.insertBefore(o.el, row.children[i] || null);
      const gap = good && !prevGood && i > 0; if (o.gap !== gap) { o.gap = gap; o.el.classList.toggle('gap', gap); }
      prevGood = good;
      // ободок — оставшееся время: цветная дуга убывает по часовой от «12 часов» (без таймера — полный ободок)
      const t = v.t || 0; if (t > o.last + 0.05 || !o.max) o.max = t; o.last = t;
      const deg = o.max >= 0.5 ? Math.round(360 * (1 - Math.min(1, t / o.max)) / 6) * 6 : 0;
      const txt = v.n > 1 ? String(v.n) : '', key = deg + '|' + txt;       // слов нет: только картинка, кольцо и число стаков
      if (key !== o.key) {
        o.key = key; o.ring.style.background = deg ? 'conic-gradient(#232832 ' + deg + 'deg, var(--c) 0)' : '';
        if (o.txt !== txt) { o.txt = txt; o.num.textContent = txt; }
      }
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

  // ---------- запрет на кнопках (v93): умения нельзя — кнопки серые, знак запрета, секунды и значок причины ----------
  const ICO = {}; for (const k of ['stun', 'freeze', 'silence', 'root', 'blind']) { ICO[k] = new Image(); ICO[k].src = DIR + k + '.webp' + (typeof V === 'string' ? V : ''); }
  // почему нельзя: atk — про кнопку атаки (иначе про умения). → { k: значок причины, t: секунд осталось (0 — неизвестно) } или null
  function why(atk) {
    const S = K(), ss = P.ss;
    if (P.dead > 0) return null;
    if (ss.freeze > 0) return { k: 'freeze', t: ss.freeze };
    if (ss.stun > 0) return { k: 'stun', t: ss.stun };
    if (S.sleep > 0 || S.astral > 0) return { k: 'root', t: mx(S.sleep, S.astral) };
    if (S.hex > 0) return { k: 'silence', t: S.hex };
    if (atk) return S.bind > 0 ? { k: 'root', t: S.bind } : STATUS.noAtk && STATUS.noAtk() ? { k: 'root', t: 0 } : null;
    if (ss.silence > 0) return { k: 'silence', t: ss.silence };
    if (net() & NET_F('F_SIL')) return { k: 'silence', t: 0 };
    return STATUS.mute() ? { k: 'silence', t: 0 } : null;
  }
  const deny = {};                                // кнопка → когда нажали запрещённую
  const tick = () => performance.now() / 1000;
  {
    const _cast = cast;
    cast = function (id) { if ((id === 'dash' ? typeof DASH !== 'undefined' && DASH.why() : why(false)) && !(typeof SHOP !== 'undefined' && SHOP.paused)) deny[id] = tick(); return _cast(id); };
    let wasHeld = false;
    const _lb = layoutButtons;
    layoutButtons = function () {                 // запрещённая кнопка после нажатия коротко дёргается
      _lb();
      const h = held.key || held.touch || held.mouse || held.pad; if (h && !wasHeld && why(true)) deny.atk = tick(); wasHeld = h;
      const n = tick(); for (const b of BTN) { const d = n - (deny[b.id] || -9); if (d < 0.2) b.x += Math.sin(d * 75) * b.r * 0.1 * (1 - d / 0.2); }
    };
    const corner = (b, k, sc) => {                 // значок причины в левом верхнем углу кнопки
      const im = ICO[k], r = b.r * 0.36 * sc, x = b.x - b.r * 0.66, y = b.y - b.r * 0.66;
      ctx.beginPath(); ctx.arc(x, y, r * 1.12, 0, 7); ctx.fillStyle = '#10141c'; ctx.fill(); ctx.lineWidth = Math.max(1.5, r * 0.14); ctx.strokeStyle = '#d8463a'; ctx.stroke();
      if (im.complete && im.naturalWidth) ctx.drawImage(im, x - r, y - r, r * 2, r * 2);
    };
    const _ui = combatUI;
    combatUI = function () {
      _ui();
      if (P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on)) return;
      const ws = why(false), wa = why(true), wd = typeof DASH !== 'undefined' ? DASH.why() : null, n = tick(), smoke = P.ss.blind > 0 && !(P.ss.noMiss > 0);
      if (!ws && !wa && !wd && !smoke) return;
      ctx.save(); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const b of BTN) {
        const w = b.id === 'atk' ? wa : b.id === 'dash' ? wd : ws;
        if (!w) { if (smoke && b.id !== 'atk' && b.id !== 'dash') corner(b, 'blind', 1); continue; }
        const d = n - (deny[b.id] || -9), fl = d < 0.25 ? 1 - d / 0.25 : 0, R = b.r * 0.92;
        ctx.beginPath(); ctx.arc(b.x, b.y, R, 0, 7);
        ctx.fillStyle = 'rgba(58,60,66,0.78)'; ctx.fill();                                       // приглушить серым
        if (fl) { ctx.fillStyle = 'rgba(255,40,30,' + (0.55 * fl).toFixed(2) + ')'; ctx.fill(); }
        // знак запрета: круг с косой чертой
        const q = b.r * 0.56, lw = b.r * 0.13;
        ctx.lineCap = 'butt'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = lw + 3;
        ctx.beginPath(); ctx.arc(b.x, b.y, q, 0, 7); ctx.moveTo(b.x - q * 0.707, b.y - q * 0.707); ctx.lineTo(b.x + q * 0.707, b.y + q * 0.707); ctx.stroke();
        ctx.strokeStyle = '#e8372c'; ctx.lineWidth = lw; ctx.stroke();
        if (w.t > 0) {                                                                          // сколько секунд осталось
          const s = w.t < 10 ? w.t.toFixed(1).replace('.', ',') : String(Math.ceil(w.t));
          ctx.font = 'bold ' + Math.round(b.r * 0.42) + 'px system-ui, sans-serif'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.fillStyle = '#fff';
          ctx.strokeText(s, b.x, b.y + b.r * 0.86); ctx.fillText(s, b.x, b.y + b.r * 0.86);
        }
        corner(b, w.k, 1 + 0.5 * fl);
      }
      ctx.restore();
    };
    // джойстик: герой не может идти — приглушаем
    if (typeof drawStickUI === 'function') {
      const _ds = drawStickUI;
      drawStickUI = function () {
        if (!(STATUS.locked() && P.dead <= 0)) return _ds();
        _ds(); if (!('ontouchstart' in window)) return;
        const h = stick.active ? { x: stick.x0, y: stick.y0 } : stickHome(); ctx.beginPath(); ctx.arc(h.x, h.y, stickR() * 0.98, 0, 7); ctx.fillStyle = 'rgba(40,42,48,0.6)'; ctx.fill();
      };
    }
  }
  const API = { src, why, show(id, t, o) { X[id] = Object.assign({ t }, o || {}); }, list: () => Object.keys(EL), DEF, items: null };
  return API;
})();
