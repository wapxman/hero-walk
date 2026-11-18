// Общий код сетевой игры: работает и в браузере (глобальный NET), и на сервере Node (require).
// Здесь — то, что клиент и сервер обязаны считать ОДИНАКОВО: шаг движения со столкновениями (для предсказания
// на клиенте и сверки с сервером) и двоичный протокол (кодирование входа, снимков и событий).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.NET = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TICK = 30, DT = 1 / TICK;          // сервер считает мир 30 раз в секунду
  // версия протокола: клиент и сервер обязаны совпадать (APK может отстать от сайта) — увеличивать при любом изменении формата
  const PROTO = 7;                        // 3: злодеи, миры, раунды, магазин (v47); 4: Шипокорень (v49); 5: злодеи ChatGPT мира 1 (v50); 6: мир 2 (v51); 7: Фонарщик, Пугало (v52)
  const YK = 0.72;                         // сжатие по вертикали (наклон камеры), как в combat.js
  const RUN_AT = 0.6, WALK_SPEED = 105, RUN_SPEED = 260;
  const PR = [16, 11];                     // «толщина» героя у земли
  const POS_Q = 16;                        // координаты передаются с точностью 1/16 единицы мира

  // ---------- карта: край поляны и препятствия (задаются из data.js) ----------
  // У каждого мира своя карта: сервер переключает её перед шагом комнаты (useMap), клиент — при смене мира.
  let WALK = [], SOLID = [];
  function solidsOf(objs) {
    const out = [];
    for (const o of objs) {
      if (o.r) out.push({ x: o.x, y: o.y, rx: o.r[0], ry: o.r[1] });
      if (o.c) for (const c of o.c) out.push({ x: o.x + c[0], y: o.y + c[1], rx: c[2], ry: c[3] });
    }
    return out;
  }
  function setMap(walk, objs) { WALK = walk; SOLID = solidsOf(objs); }
  function useMap(walk, solid) { WALK = walk; SOLID = solid; }
  function inWalk(x, y) {
    let ins = false;
    for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
      const a = WALK[i], b = WALK[j];
      if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) ins = !ins;
    }
    return ins;
  }
  function toWalk(e) {
    let bx = e.x, by = e.y, bd = 1e18, nx = 0, ny = 0;
    for (let i = 0, j = WALK.length - 1; i < WALK.length; j = i++) {
      const a = WALK[j], b = WALK[i], dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((e.x - a[0]) * dx + (e.y - a[1]) * dy) / (dx * dx + dy * dy)));
      const px = a[0] + dx * t, py = a[1] + dy * t, d = (e.x - px) ** 2 + (e.y - py) ** 2;
      if (d < bd) { bd = d; bx = px; by = py; nx = px - e.x; ny = py - e.y; }
    }
    const m = Math.hypot(nx, ny) || 1;
    e.x = bx + nx / m * 0.5; e.y = by + ny / m * 0.5;
  }
  function collide(e) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of SOLID) {
        const rx = s.rx + PR[0], ry = s.ry + PR[1];
        const dx = (e.x - s.x) / rx, dy = (e.y - s.y) / ry, d2 = dx * dx + dy * dy;
        if (d2 < 1) { const d = Math.sqrt(d2) || 0.001; e.x = s.x + dx / d * rx; e.y = s.y + dy / d * ry; }
      }
      if (WALK.length && !inWalk(e.x, e.y)) toWalk(e);
    }
  }
  // координаты, как их видит клиент после передачи: округление до 1/16 — чтобы предсказание шло от тех же чисел
  const qpos = v => Math.round(v * POS_Q) / POS_Q;

  // ---------- шаг движения героя за один тик ----------
  // ax, ay — стик в целых −127..127 (так он и передаётся); sp — множитель скорости (предметы, ловкость, буря, оковы)
  function move(p, ax, ay, sp) {
    let x = ax / 127, y = ay / 127;
    let m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; m = 1; }
    p.moving = m > 0.12;
    if (!p.moving || sp <= 0) { p.moving = p.moving && sp > 0; return; }
    p.face = { x: x / m, y: y / m };
    p.running = m > (p.running ? RUN_AT - 0.1 : RUN_AT);
    if (p.running) { const k = RUN_SPEED * sp / m * DT; p.x += x * k; p.y += y * YK * k; }
    else { p.x += x * WALK_SPEED * 2 * sp * DT; p.y += y * WALK_SPEED * 2 * YK * sp * DT; }
    collide(p);
    p.x = qpos(p.x); p.y = qpos(p.y);
  }

  // ---------- двоичный протокол ----------
  // клиент -> сервер
  const C_INPUT = 1, C_PING = 2;
  // сервер -> клиент
  const S_SNAP = 10, S_EVENTS = 11, S_PONG = 12;
  // кнопки во входе
  const B_ATK = 1, B_Q = 2, B_E = 4, B_F = 8, B_R = 16, B_WAVE = 32;
  // флаги сущности в снимке
  const F_DEAD = 1, F_ROOT = 2, F_SIL = 4, F_SLOW = 8, F_SHIELD = 16, F_CAST = 32, F_ATK = 64, F_RAGE = 128;
  // виды сущностей
  const KINDS = ['mage', 'archer', 'min', 'war', 'mag', 'rog', 'boss', 'zgirl', 'copz', 'goblin', 'zlorp', 'parasite', 'warzombie', 'mremireh', 'warrok',
    'mutant', 'maw', 'pumpkin', 'demon', 'thornroot', 'shadowwolf', 'sporeshaman', 'thornimp', 'rotdryad', 'boarbrute', 'b_thornqueen',
    'bogghoul', 'toadwitch', 'leechworm', 'drownedknight', 'b_toadking', 'wisplantern', 'scarecrow'];
  // реплики врагов над головой (событие SAY с кодом 10 + номер): [текст, цвет]
  const PHRASES = [['Броня!', '#bcd4ff'], ['Прыжок!', '#ffb36a'], ['Таран!', '#ffb36a'], ['Восстаньте!', '#c9a8ff'], ['РЁВ!', '#ff7a5a'],
    ['Яд!', '#9be37a'], ['Сотрясение!', '#ffb347'], ['Жатва!', '#ffb347'], ['За спиной!', '#ff5a3a'], ['Огненный дождь!', '#ff8a4a'],
    ['Вторая фаза', '#ff9a6a'], ['Последняя фаза', '#ff9a6a'], ['Встаёт!', '#c9ff9a'], ['замедление', '#9fd0ff'], ['Корни!', '#b9e37a'],
    ['Ядовитый сад!', '#9be37a'], ['корни держат!', '#b9e37a'], ['Кислотный плевок!', '#d4e04a'], ['Трясина!', '#8a9a5a']];

  function encInput(seq, ax, ay, btn) {
    const b = new ArrayBuffer(6), v = new DataView(b);
    v.setUint8(0, C_INPUT); v.setUint16(1, seq & 0xffff); v.setInt8(3, ax); v.setInt8(4, ay); v.setUint8(5, btn);
    return b;
  }
  function encPing(t) { const b = new ArrayBuffer(9), v = new DataView(b); v.setUint8(0, C_PING); v.setFloat64(1, t); return b; }

  // Снимок — только изменившиеся поля каждой сущности относительно того, что этот клиент уже получил.
  // Маска полей: 1 x,y · 2 hp,max · 4 mp,maxMp · 8 flags · 16 face(row) · 32 kind,team · 64 extra (фокус/щит/волна)
  const M_POS = 1, M_HP = 2, M_MP = 4, M_FLAGS = 8, M_ROW = 16, M_KIND = 32, M_EXTRA = 64;
  function snapFields(e) {
    return {
      x: Math.round(e.x * POS_Q), y: Math.round(e.y * POS_Q), hp: Math.max(0, Math.ceil(e.hp)), max: Math.ceil(e.max),
      mp: Math.round(e.mp || 0), maxMp: Math.round(e.maxMp || 0), spd: Math.max(0, Math.min(255, Math.round((e.spdNow == null ? 1 : e.spdNow) * 100))), flags: e.flags | 0, row: e.row | 0, kind: KINDS.indexOf(e.kind), team: e.team | 0,
      ex: e.ex | 0,
    };
  }
  // base — Map id -> поля, которые клиент уже знает (меняется на месте)
  function encSnap(tick, ack, wave, phase, ents, base) {
    const parts = [], seen = new Set();
    let size = 0;
    for (const e of ents) {
      const f = snapFields(e), o = base.get(e.id);
      seen.add(e.id);
      let m = 0;
      if (!o || o.x !== f.x || o.y !== f.y) m |= M_POS;
      if (!o || o.hp !== f.hp || o.max !== f.max) m |= M_HP;
      if (e.player && (!o || o.mp !== f.mp || o.maxMp !== f.maxMp || o.spd !== f.spd)) m |= M_MP;
      if (!o || o.flags !== f.flags) m |= M_FLAGS;
      if (!o || o.row !== f.row) m |= M_ROW;
      if (!o || o.kind !== f.kind || o.team !== f.team) m |= M_KIND;
      if (!o || o.ex !== f.ex) m |= M_EXTRA;
      if (!m) continue;
      base.set(e.id, f);
      parts.push([e.id, m, f]);
      size += 3 + (m & M_POS ? 4 : 0) + (m & M_HP ? 4 : 0) + (m & M_MP ? 5 : 0) + (m & M_FLAGS ? 1 : 0) + (m & M_ROW ? 1 : 0) + (m & M_KIND ? 2 : 0) + (m & M_EXTRA ? 2 : 0);
    }
    const gone = [];
    for (const id of base.keys()) if (!seen.has(id)) gone.push(id);
    for (const id of gone) base.delete(id);
    const buf = new ArrayBuffer(12 + size + 2 * gone.length), v = new DataView(buf);
    let o = 0;
    v.setUint8(o, S_SNAP); o += 1; v.setUint32(o, tick); o += 4; v.setUint16(o, ack & 0xffff); o += 2;
    v.setUint8(o, wave & 0xff); o += 1; v.setUint8(o, phase); o += 1;
    v.setUint16(o, parts.length); o += 2;
    for (const [id, m, f] of parts) {
      v.setUint16(o, id); o += 2; v.setUint8(o, m); o += 1;
      if (m & M_POS) { v.setUint16(o, f.x); o += 2; v.setUint16(o, f.y); o += 2; }
      if (m & M_HP) { v.setUint16(o, Math.min(65535, f.hp)); o += 2; v.setUint16(o, Math.min(65535, f.max)); o += 2; }
      if (m & M_MP) { v.setUint16(o, f.mp); o += 2; v.setUint16(o, f.maxMp); o += 2; v.setUint8(o, f.spd); o += 1; }
      if (m & M_FLAGS) { v.setUint8(o, f.flags); o += 1; }
      if (m & M_ROW) { v.setUint8(o, f.row); o += 1; }
      if (m & M_KIND) { v.setUint8(o, f.kind); o += 1; v.setUint8(o, f.team); o += 1; }
      if (m & M_EXTRA) { v.setUint16(o, f.ex); o += 2; }
    }
    v.setUint8(o, gone.length > 255 ? 255 : gone.length); o += 1;
    for (const id of gone.slice(0, 255)) { v.setUint16(o, id); o += 2; }
    return buf.slice(0, o);
  }
  function decSnap(buf, known) {
    const v = new DataView(buf);
    let o = 1;
    const tick = v.getUint32(o); o += 4; const ack = v.getUint16(o); o += 2;
    const wave = v.getUint8(o); o += 1; const phase = v.getUint8(o); o += 1;
    const n = v.getUint16(o); o += 2;
    const changed = [];
    for (let i = 0; i < n; i++) {
      const id = v.getUint16(o); o += 2; const m = v.getUint8(o); o += 1;
      const f = known.get(id) || { id };
      if (m & M_POS) { f.x = v.getUint16(o) / POS_Q; o += 2; f.y = v.getUint16(o) / POS_Q; o += 2; }
      if (m & M_HP) { f.hp = v.getUint16(o); o += 2; f.max = v.getUint16(o); o += 2; }
      if (m & M_MP) { f.mp = v.getUint16(o); o += 2; f.maxMp = v.getUint16(o); o += 2; f.spd = v.getUint8(o); o += 1; }
      if (m & M_FLAGS) { f.flags = v.getUint8(o); o += 1; }
      if (m & M_ROW) { f.row = v.getUint8(o); o += 1; }
      if (m & M_KIND) { f.kind = KINDS[v.getUint8(o)]; o += 1; f.team = v.getUint8(o); o += 1; }
      if (m & M_EXTRA) { f.ex = v.getUint16(o); o += 2; }
      known.set(id, f); changed.push(id);
    }
    const ng = v.getUint8(o); o += 1;
    const gone = [];
    for (let i = 0; i < ng; i++) { const id = v.getUint16(o); o += 2; gone.push(id); known.delete(id); }
    return { tick, ack, wave, phase, changed, gone };
  }
  // События (выстрелы, скиллы, попадания, смерти) — короткие записи: тип + числа.
  // Чтобы не плодить форматы, событие = [тип, ...целые 16-битные со знаком]; координаты делятся на 2.
  const EV = { SHOT: 1, HIT: 2, CAST: 3, DMG: 4, DIE: 5, TELE: 6, QUAKE: 7, SHARD: 8, WAVE_START: 9, WAVE_END: 10, LVL: 11, SAY: 12, KB: 13, WORLD: 14, HEAL: 15, VFX: 16 };
  function encEvents(list) {
    let size = 3;
    for (const e of list) size += 2 + e.length * 2;
    const buf = new ArrayBuffer(size), v = new DataView(buf);
    let o = 0;
    v.setUint8(o, S_EVENTS); o += 1; v.setUint16(o, list.length); o += 2;
    for (const e of list) {
      v.setUint8(o, e[0]); o += 1; v.setUint8(o, e.length - 1); o += 1;
      for (let i = 1; i < e.length; i++) { v.setInt16(o, Math.max(-32768, Math.min(32767, Math.round(e[i])))); o += 2; }
    }
    return buf;
  }
  function decEvents(buf) {
    const v = new DataView(buf);
    let o = 1;
    const n = v.getUint16(o); o += 2;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = v.getUint8(o); o += 1; const k = v.getUint8(o); o += 1;
      const e = [t];
      for (let j = 0; j < k; j++) { e.push(v.getInt16(o)); o += 2; }
      out.push(e);
    }
    return out;
  }
  return { PROTO, TICK, DT, YK, POS_Q, setMap, useMap, solidsOf, collide, inWalk, move, qpos, KINDS, PHRASES, PR,
    C_INPUT, C_PING, S_SNAP, S_EVENTS, S_PONG, B_ATK, B_Q, B_E, B_F, B_R, B_WAVE,
    F_DEAD, F_ROOT, F_SIL, F_SLOW, F_SHIELD, F_CAST, F_ATK, F_RAGE, EV,
    encInput, encPing, encSnap, decSnap, encEvents, decEvents };
});
