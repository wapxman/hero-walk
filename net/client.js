// Сетевая игра (клиент): выбор режима, связь с сервером, предсказание своего героя со сверкой,
// плавное отображение чужих героев и врагов (интерполяция), эффекты и звуки по событиям сервера.
// Сервер — server/server.js; общий код движения и протокола — net/shared.js.
'use strict';
var NETC = { on: false };   // NETC.limboBack — вернуться из Междумирья (limbo.js)
(function () {
  const N = NET;
  // предсказание движения обязано считать столкновения по той же карте, что сервер: мир 1 — карта по умолчанию,
  // миры 2–4 — WALK и SOLID, которые выставил applyWorld (worlds.js)
  NETC.limboBack = () => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'back' })); S.cur = null; S.pending = []; syncMap(); };
  NETC.coop = () => S.mode === 'coop';
  const syncMap = () => { if (!WORLDS[WORLD - 1].walk) N.setMap(WALK, DEFAULT_OBJ); else N.useMap(WALK, SOLID); };
  syncMap();
  // адрес сервера: ?server=ws://… или по умолчанию тот же компьютер, порт 8790 (локальная проверка)
  const PROD_URL = 'wss://abpartners.uz:30777';   // боевой сервер: хостинг abpartners.uz (webspace.uz, Ташкент)
  const qs = new URLSearchParams(location.search);
  const SERVER = qs.get('server') || PROD_URL || ('ws://' + (location.hostname || 'localhost') + ':8790');
  const BIT = { q: N.B_Q, e: N.B_E, f: N.B_F, r: N.B_R };
  const SK_OF = { 1: ['mage', 'q'], 2: ['mage', 'e'], 3: ['mage', 'f'], 4: ['mage', 'r'], 5: ['archer', 'q'], 6: ['archer', 'f'], 7: ['archer', 'e'] };

  const S = { ws: null, mode: 'single', myId: 0, room: '', seq: 0, pending: [], latch: 0, acc: 0, known: new Map(), views: new Map(),
    clk: 0, clkOk: false, newest: 0, interp: 3, jit: 0, lastArr: 0, rtt: 0, pingT: 0, err: { x: 0, y: 0 }, prev: null, cur: null, names: {}, status: '' };
  NETC.S = S; S.url = SERVER;

  // ---------- выбор режима на экране выбора героя ----------
  (function modeUI() {
    const sel = document.getElementById('hSel');
    if (!sel) return;
    const U = n => 'url(ui/' + n + '.webp' + V + ')';
    const css = document.createElement('style');
    css.textContent = `
    #hSel .modes { display: flex; gap: 1.6vh; align-items: center; }
    #hSel .md { width: 25vh; height: 7vh; background: ${U('h_plaque')} center / 100% 100% no-repeat; display: flex; align-items: center; justify-content: center;
      font: bold 2.2vh system-ui; cursor: pointer; opacity: .6; touch-action: manipulation; }
    #hSel .md.on { opacity: 1; filter: drop-shadow(0 0 1.2vh rgba(255,226,122,.55)); color: #ffe9a8; }
    #hSel input { width: 14vh; height: 5.4vh; border-radius: 1vh; border: .3vh solid rgba(170,190,230,.5); background: rgba(8,16,32,.85); color: #fff;
      font: bold 2.2vh system-ui; text-align: center; }
    #netStat { position: fixed; top: calc(19vh + var(--sat)); left: 50%; transform: translateX(-50%); z-index: 5; color: #cfe3ff;
      font: bold 1.9vh system-ui; text-shadow: 0 1px 3px #000; pointer-events: none; white-space: nowrap; }`;
    document.head.appendChild(css);
    const row = document.createElement('div'); row.className = 'modes';
    const modes = [['single', 'Одиночная'], ['duel', 'Дуэль онлайн'], ['coop', 'Вместе онлайн']];
    const btns = {};
    for (const [id, name] of modes) {
      const b = document.createElement('div'); b.className = 'md' + (id === 'single' ? ' on' : ''); b.textContent = name;
      b.addEventListener('pointerdown', () => { S.mode = id; for (const k in btns) btns[k].classList.toggle('on', k === id); code.style.display = id === 'single' ? 'none' : ''; });
      row.appendChild(b); btns[id] = b;
    }
    const code = document.createElement('input'); code.placeholder = 'комната'; code.maxLength = 6; code.inputMode = 'numeric'; code.style.display = 'none';
    code.title = 'Пусто — любой свободный соперник; одинаковый номер у двух игроков — играть друг с другом';
    row.appendChild(code);
    sel.insertBefore(row, sel.querySelector('.go'));
    // «В бой» в онлайн-режиме сначала подключается к серверу
    sel.querySelector('.go').addEventListener('pointerdown', e => {
      if (S.mode === 'single') return;
      if (S.mode === 'coop' && window.TEAM) {   // v104: «Вместе» — обычная игра у каждого, сервер только пересылает (net/team.js)
        if (TEAM.on) return;                     // уже в комнате: кнопка работает как в одиночной (ведущий выбирает главу)
        e.stopImmediatePropagation(); TEAM.connect(code.value.trim()); return;
      }
      e.stopImmediatePropagation();
      connect(S.mode, code.value.trim());
    }, true);
    S.stat = document.createElement('div'); S.stat.id = 'netStat'; document.body.appendChild(S.stat);
    if (qs.get('mode') === 'duel' || qs.get('mode') === 'coop') { S.mode = qs.get('mode'); btns[S.mode].dispatchEvent(new PointerEvent('pointerdown')); if (qs.get('room')) code.value = qs.get('room'); if (qs.has('auto')) setTimeout(() => connect(S.mode, code.value.trim()), 300); }
  })();
  function status(t) { S.status = t; if (S.stat) S.stat.textContent = t; }

  // ---------- подключение ----------
  // пока боевой сервер не выбран, онлайн работает только при локальной проверке (порт 8765) или с ?server=
  const READY = true;
  function connect(mode, room) {
    if (!READY) { status('Онлайн заработает, когда подключим игровой сервер'); return; }
    if (S.ws) try { S.ws.close(); } catch (e) {}
    status('Подключение к серверу…');
    let ws;
    try { ws = new WebSocket(SERVER); } catch (e) { status('Сервер недоступен'); return; }
    ws.binaryType = 'arraybuffer';
    S.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'join', proto: N.PROTO, mode, room: room || undefined, hero: HERO_ID, name: HEROES[HERO_ID].name, prog: progOf() }));
    };
    ws.onmessage = m => {
      if (S.ws !== ws) return;   // сообщения старого соединения после переподключения не нужны
      if (typeof m.data === 'string') { let j; try { j = JSON.parse(m.data); } catch (e) { return; } if (j && typeof j === 'object') onJson(j); return; }
      const t = new DataView(m.data).getUint8(0);
      if (t === N.S_SNAP) onSnap(m.data);
      else if (t === N.S_EVENTS) onEvents(N.decEvents(m.data));
      else if (t === N.S_PONG) {
        const r = performance.now() - new DataView(m.data).getFloat64(1);
        S.rtt = S.rtt ? S.rtt * 0.8 + r * 0.2 : r;
        const b = new ArrayBuffer(5), v = new DataView(b); v.setUint8(0, 3); v.setUint16(1, Math.round(S.rtt)); v.setUint16(3, Math.round(S.interp * 1000 / N.TICK));
        ws.send(b);
      }
    };
    ws.onclose = () => {
      if (S.ws !== ws) return;
      if (NETC.on) {
        // связь пропала посреди игры: бой шёл на сервере, продолжать его в одиночку нельзя (злодеи — сетевые копии) — сообщаем и выходим в меню
        status('Связь с сервером потеряна');
        try { say(P.x, P.y - CH * HS() * 1.4, 'Связь с сервером потеряна', '#ff9a6a'); } catch (e) {}
        setTimeout(() => location.reload(), 2200);
      } else status('Сервер недоступен (' + SERVER + ')');
    };
    ws.onerror = () => {};
  }
  // уровень, очки и предметы: сервер считает урон, здоровье и ману героя по ним же (it — как SHOP.recompute)
  const progOf = () => ({ lvl: P.lvl, st: P.st, sk: P.skLv,
    it: Object.assign(bagStats(), { pow: SHOP.buffs.power > 0 ? 1 : 0, swift: SHOP.buffs.swift > 0 ? 1 : 0 }) });
  function onJson(m) {
    if (m.t === 'joined') {
      S.myId = m.id; S.room = m.room; S.modeOn = m.mode; S.team = m.team;
      for (const p of m.players) S.names[p.id] = p;
      NETC.on = true;
      document.getElementById('hSel').style.display = 'none';
      const mm = document.getElementById('mMain'); if (mm) mm.style.display = 'none';
      enemies.length = 0; corpses.length = 0; shots.length = 0; fx.length = 0; zones.length = 0; texts.length = 0;
      SHOP.drops.length = 0; SHOP.closeShop();
      S.pending = []; S.seq = 0; S.clkOk = false; S.known.clear(); S.views.clear(); S.cur = null;
      wave = 0; SHOP.phase = 'rest'; SHOP.refresh();
      for (const id in HEROES) loadHero(HEROES[id].def);      // соперник может играть другим героем
      // мир комнаты: в кооперативе друзья могли уже уйти дальше; дуэль — всегда на первой арене
      if (WORLD !== (m.world || 1)) applyWorld(m.world || 1);
      syncMap(); S.cur = null;
      say(P.x, P.y - CH * 1.3 * HS(), m.mode === 'duel' ? 'Дуэль! Комната ' + m.room : 'Кооператив, комната ' + m.room, '#ffe9a8');
    } else if (m.t === 'peer') { S.names[m.id] = m; say(P.x, P.y - CH * 1.2 * HS(), (m.name || 'Игрок') + ' в комнате', '#bfe6ff'); }
    else if (m.t === 'left') { S.views.delete(m.id); say(P.x, P.y - CH * 1.2 * HS(), 'Игрок вышел', '#ffd28a'); }
    else if (m.t === 'error' && m.code === 'proto') {
      // версия протокола не совпала: в APK — обновить приложение, на сайте — обновить страницу
      const app = location.host === 'duelarena.app';
      status(m.client < m.server ? (app ? 'Обновите приложение — у соперника новая версия' : 'Обновите страницу — у соперника новая версия')
        : 'На сервере старая версия игры, попробуйте позже');
      try { S.ws.close(); } catch (e) {}
    } else if (m.t === 'error') status('Ошибка: ' + m.msg);
  }

  // ---------- снимки: свой герой — сверка, остальные — в буфер для интерполяции ----------
  const newer = (a, b) => ((a - b) & 0xffff) > 0 && ((a - b) & 0xffff) < 32768;
  function onSnap(buf) {
    const s = N.decSnap(buf, S.known), now = performance.now();
    // джиттер: насколько неровно приходят снимки — от него зависит запас интерполяции (2…8 тиков)
    if (S.lastArr) { const d = Math.abs((now - S.lastArr) / 1000 - N.DT) / N.DT; S.jit = S.jit * 0.95 + d * 0.05; }
    S.lastArr = now;
    S.interp = Math.max(2, Math.min(8, 2 + S.jit * 3));
    S.newest = s.tick;
    const st = s.tick * N.DT;
    if (!S.clkOk) { S.clk = st; S.clkOk = true; } else if (Math.abs(st - S.clk) > 0.3) S.clk = st; else S.clk += (st - S.clk) * 0.08;
    if (wave !== s.wave) { wave = s.wave; SHOP.refresh(); }
    const ph = s.phase ? 'fight' : 'rest';
    if (SHOP.phase !== ph && !(typeof LIMBO !== 'undefined' && LIMBO.on)) { SHOP.phase = ph; SHOP.refresh(); }   // в Междумирье лавка открыта, фазу боя не навязываем
    for (const id of s.changed) {
      const f = S.known.get(id);
      if (id === S.myId) continue;
      let v = S.views.get(id);
      if (!v) { v = makeView(f); S.views.set(id, v); }
      v.hist.push({ t: s.tick, x: f.x, y: f.y });
      if (v.hist.length > 24) v.hist.shift();
      syncView(v, f);
    }
    for (const id of s.gone) S.views.delete(id);
    // у тех, кто не менялся, последний снимок тот же: дописываем позицию, чтобы интерполяция не «голодала»
    for (const v of S.views.values()) { const h = v.hist[v.hist.length - 1]; if (h && h.t < s.tick) v.hist.push({ t: s.tick, x: h.x, y: h.y }); if (v.hist.length > 24) v.hist.shift(); }
    const me = S.known.get(S.myId);
    if (me) reconcile(me, s.ack);
  }
  function reconcile(me, ack) {
    if (typeof LIMBO !== 'undefined' && LIMBO.on) return;   // в своём Междумирье — сцена своя, сервер не двигает героя
    // свой герой: здоровье, мана и состояния — как на сервере
    P.hp = me.hp; P.maxHp = me.max; P.mp = me.mp; P.maxMp = me.maxMp;
    const dead = me.flags & N.F_DEAD;
    if (dead && !(P.dead > 0)) P.dead = P.deadMax = 3;
    if (!dead && P.dead > 0) P.dead = 0;
    P.netFl = me.flags; P.netSpd = (me.spd == null ? 100 : me.spd) / 100; P.ult = me.ex & 16 ? 1 : 0; P.shieldT = me.flags & N.F_SHIELD ? 1 : 0; P.focus = me.ex & 15; P.kills = me.ex >> 8;
    S.spd = (me.spd == null ? 100 : me.spd) / 100;
    if (!S.cur) { S.cur = { x: me.x, y: me.y, face: P.face, moving: false, running: false }; S.prev = { x: me.x, y: me.y }; P.x = me.x; P.y = me.y; }
    // сверка: берём позицию сервера на момент последнего учтённого ввода и заново проигрываем ещё не учтённые
    S.pending = S.pending.filter(i => newer(i.seq, ack));
    const before = { x: S.cur.x, y: S.cur.y };
    S.cur.x = me.x; S.cur.y = me.y;
    for (const i of S.pending) N.move(S.cur, i.ax, i.ay, i.sp);
    // расхождение не прыгает, а плавно растворяется (за ~0,15 с)
    S.err.x += before.x - S.cur.x; S.err.y += before.y - S.cur.y;
    if (Math.hypot(S.err.x, S.err.y) > 120) { S.err.x = 0; S.err.y = 0; }
  }
  function makeView(f) {
    const hero = f.kind === 'mage' || f.kind === 'archer';
    const v = { id: f.id, hero, kind: f.kind, hist: [], x: f.x, y: f.y, anim: 'idle', animT: 0, runPh: 0, row: f.row | 0, act: null, flash: 0, dieT: null, jump: 0 };
    if (hero) {
      v.ch = { ok: true, top: 1.5, U: 118 }; v.rad = 22; v.sc = 1; v.k = {}; v.draw = () => drawHeroView(v);
    } else {
      const k = KIND[f.kind], el = !!(f.ex & 2048); needChar(CHARS[k.ch]);
      v.ch = CHARS[k.ch]; v.k = k; v.type = f.kind; v.boss = !!k.boss; v.elite = el;
      v.sc = (k.sc || 1) * (el ? BAL.ELITE.size : 1); v.rad = k.rad * (el ? BAL.ELITE.size : 1);
      v.bob = rnd(0, 6); v.col = k.col; v.eye = k.boss ? '#ffb347' : '#ffe27a';
      v.draw = () => drawEnemy(v);
    }
    return v;
  }
  function syncView(v, f) {
    v.hp = f.hp; v.max = f.max; v.team = f.team; v.flags = f.flags;
    v.root = f.flags & N.F_ROOT ? 1 : 0; v.slowT = f.flags & N.F_SLOW ? 1 : 0; v.silT = f.flags & N.F_SIL ? 1 : 0; v.rage = !!(f.flags & N.F_RAGE);
    if (f.row !== v.row) v.row = f.row;
    const atk = f.flags & N.F_ATK, cast = f.flags & N.F_CAST;
    if ((atk || cast) && !v.act) v.act = { t: 0, dur: cast ? (v.boss ? 1.2 : 0.6) : 0.5, cast }, v.anim = cast ? 'cast' : 'atk';
    if (!atk && !cast && v.act) v.act = null;
    if (v.hero) { v.ult = f.ex & 16; v.focus = f.ex & 15; v.kills = f.ex >> 8; v.moving = !!(f.ex & 32); v.running = !!(f.ex & 64); v.shield = f.flags & N.F_SHIELD; v.dead = f.flags & N.F_DEAD; }
    else { v.jump = f.ex & 1023; v.moving = !!(f.ex & 1024); v.elite = !!(f.ex & 2048); }
    if ((f.flags & N.F_DEAD) && v.dieT == null && !v.hero) { v.dieT = 0; v.anim = 'die'; v.act = null; }
  }

  // ---------- события сервера: выстрелы, скиллы, урон ----------
  const viewOf = id => (id === S.myId ? P : S.views.get(id));
  const isHostile = v => v && v !== P && (v.hero ? v.team !== S.team : true);
  function onEvents(list) {
    const E = N.EV;
    for (const e of list) {
      const t = e[0];
      if (t === E.SHOT) {
        const [, id, owner, kind, x, y, dx, dy, sp, tgt] = e, ov = viewOf(owner), mine = owner === S.myId;
        const fromHero = mine || (ov && ov.hero);
        shots.push({ nid: id, own: fromHero ? 'p' : 'e', arrow: kind === 2, bolt: kind === 4, col: !fromHero && ov && ov.k ? ov.k.pcol : null, x, y, dx: dx / 1000, dy: dy / 1000, sp, left: 1600,
          tgt: tgt >= 0 ? viewOf(tgt) : null, h: fromHero ? CH * 0.55 * HS() : 80, sc: fromHero ? HS() : 1 });
        if (mine) { P.act = { anim: 'atk', t: 0, dur: 0.36, row: runRow(dx, dy) }; P.cast = 0.14; snd(HERO_ID === 'archer' ? 'archer_shot' : 'hero_shot', 0.8); voAttack(); }
        else if (ov && ov.hero) { ov.act = { t: 0, dur: 0.36 }; ov.anim = 'atk'; snd(ov.kind === 'archer' ? 'archer_bow_shot' : 'hero_shot_1', 0.5); }
        else if (!fromHero) snd(kind === 4 ? 'enemy_arrow' : 'enemy_fireball', 0.45);
      } else if (t === E.HIT) {
        const [, id, tg, x, y] = e, i = shots.findIndex(s => s.nid === id);
        const s = i >= 0 ? shots[i] : null;
        if (i >= 0) shots.splice(i, 1);
        const v = viewOf(tg), top = v && v.ch && v.ch.top ? v.ch.top * v.ch.U * (v.sc || 1) * 0.5 : 60;
        fx.push({ type: 'spark', hit: s && s.own === 'p' ? 1 : 0, hit3: s && s.arrow, rock: !(s && s.own === 'p'), x, y: y - top, t: 0, dur: 0.4, R: 34, sc: 1 });
        if (s && s.own === 'p') snd(s.arrow ? 'archer_arrow_hit' : 'hit', 0.45);
      } else if (t === E.DMG) {
        const [, id, dmg, col] = e, v = viewOf(id);
        if (!v) continue;
        const top = v === P ? CH * 1.05 * HS() : (v.ch && v.ch.ok ? v.ch.top * v.ch.U * (v.sc || 1) * 0.8 : 60);
        say(v.x + rnd(-14, 14), v.y - top, (v === P ? '-' : '') + Math.round(dmg), v === P ? '#ff8a7a' : col === 3 ? '#ffd23a' : col === 2 ? '#d9ffb0' : '#bfe6ff');
        if (v === P) { P.hurt = 0.25; vo('hurt', 0.15, 20); } else v.flash = 0.08;
      } else if (t === E.DIE) {
        const [, id] = e, v = viewOf(id);
        if (v === P) { if (!(typeof LIMBO !== 'undefined' && LIMBO.on)) { P.dead = P.deadMax = 3; snd('hero_death', 0.75); } }
        else if (v && !v.hero) {
          v.dieT = 0; v.anim = 'die'; v.act = null; snd('enemy_death', v.boss ? 1 : 0.45);
          if (e[2] === S.myId) { kills++; SHOP.onKill(v); }      // золото, сундук и фласки — тому, кто добил
        }
        else if (v) {
          v.dead = 1; snd(v.kind === 'archer' ? 'archer_death' : 'hero_death_1', 0.6);
          if (e[2] === S.myId) { SHOP.addGold(150); say(P.x, P.y - CH * HS() * 1.3, 'Победа в схватке: +150 золота', '#ffd95e'); snd('coins', 0.6); }
        }
      } else if (t === E.CAST) {
        const [, owner, sk, a, b, c] = e, ov = viewOf(owner), mine = owner === S.myId;
        const [hero, slot] = SK_OF[sk] || [];
        const an = hero === 'mage' ? MAGE_AN[slot] : ({ q: 'wave', e: 'volley', f: 'shield' })[slot] || 'atk', hd = HEROES[hero || 'mage'].def;
        if (mine && slot) { P.cd[slot] = CDMAX[slot] * skCd(slot); P.cast = 0.3; P.act = { anim: an, t: 0, dur: hd.mul ? mulDur(hd, an) : 0.6, row: null }; voSkill(slot); }
        else if (ov && ov.hero) { ov.act = { t: 0, dur: hd.mul ? mulDur(hd, an) : 0.6, cast: 1, an }; ov.anim = 'cast'; }
        if (sk === 1) { fx.push({ type: 'nova', x: a, y: b, t: 0, dur: 0.95, R: c }); snd('nova', 0.9); }
        else if (sk === 2) { const tv = viewOf(a); if (tv) fx.push({ type: 'chains', e: tv, x: tv.x, y: tv.y, t: 0, dur: b / 100 + 0.45, h: (tv.ch ? tv.ch.top * tv.ch.U * (tv.sc || 1) : 170) }); snd('chains', 0.85); }
        else if (sk === 3) { zones.push({ type: 'hail', x: a, y: b, R: c, t: 3.2, tick: 1e9 }); snd('hail', 0.8); }
        else if (sk === 4) { if (ov && ov !== P) ov.ult = 1; snd('storm', 0.85); }
        else if (sk === 5) { fx.push({ type: 'gust3', x: a, y: b, ang: c * Math.PI / 180, t: 0, dur: 900 / 1400 + 0.3 }); snd('archer_gust', 0.9); }   // Порыв ветра: полоса вперёд
        else if (sk === 8) { fx.push({ type: 'wave3', x: a, y: b, t: 0, dur: 0.55, R: c }); snd('archer_shield_break', 0.8); }   // взрыв щита листьев
        else if (sk === 6) snd('archer_shield_on', 0.85);
        else if (sk === 7) snd('archer_volley', 0.9);
      } else if (t === E.SHARD) {
        fx.push({ type: 'shard', x: e[1], y: e[2], t: 0, dur: 0.28, R: e[3], sc: 1, net: 1 });
      } else if (t === E.TELE) {
        fx.push({ type: 'tele', x: e[1], y: e[2], R: e[3], t: 0, dur: e[4] / 100, big: e[5], net: 1 });
      } else if (t === E.QUAKE) {
        fx.push({ type: 'quake', x: e[1], y: e[2], t: 0, dur: 0.75, R: e[3] }); snd('boss_slam', 0.85);
      } else if (t === E.WAVE_START) {
        if (typeof setArena === 'function' && !(typeof LIMBO !== 'undefined' && LIMBO.on)) setArena(WORLD, arenaIdx(e[1]), true);   // арена части мира (картинка; раскладка та же)
        say(P.x, P.y - CH * 1.3 * HS(), e[2] ? 'Волна ' + e[1] + ' — БОСС МИРА' : 'Волна ' + e[1] + (e[3] ? '' : '  · дальше без передышки'), e[2] ? '#ff9a6a' : '#ffe9a8'); snd('wave_horn', 0.8);
      } else if (t === E.WAVE_END) {
        // раунд отбит: награда за все его волны — каждому игроку
        SHOP.addGold(e[2]); snd('coins', 0.6);
        say(P.x, P.y - CH * HS() * 1.35, (e[3] ? 'Мир ' + BAL.at(e[1]).M + ' пройден!' : 'Раунд отбит') + '  +' + e[2] + ' золота', '#ffe9a8');
      } else if (t === E.WORLD) {
        // следующий мир: затемнение, новая карта, герой у базы (позицию пришлёт сервер)
        const a = BAL.at(wave + 1);
        if (typeof LIMBO !== 'undefined' && LIMBO.on) { LIMBO.S.from = e[1]; return; }   // герой в Междумирье: новый мир применится при возвращении
        applyWorld(e[1]); syncMap(); S.cur = null; S.pending = []; shots.length = 0; zones.length = 0; fx.length = 0;
        if (typeof PATHMAP !== 'undefined' && e[1] > 1) PATHMAP.show({ mode: 'full', t0: e[1] - 2 + 0.75, t1: e[1] - 1 });   // переход по карте «Путь героев»
        else {
          FADE.innerHTML = '<div>' + WORLDS[e[1] - 1].name + '</div><div style="font-size:2.6vh;opacity:.85;margin-top:1vh">мир ' + e[1] + (e[2] > 1 ? ' · круг ' + e[2] : '') + '</div>';
          FADE.style.transition = 'none'; FADE.style.opacity = '1';
          setTimeout(() => { FADE.style.transition = 'opacity .9s'; FADE.style.opacity = '0'; }, 1300);
        }
        snd('wave_horn', 0.9, 0.8);
      } else if (t === E.VFX) {
        // картинка заклинания босса: [вид, номер магии, x, y, R, длительность ×100, dx, dy] (dx, dy — у летящей сферы)
        const k = KIND[N.KINDS[e[1]]], ch = k && CHARS[k.ch], vf = ch && ch.vfx && ch.vfx[e[2]];
        if (vf) {
          const o = { img: vf.img, x: e[3], y: e[4], R: e[5], dur: e[6] / 100, rot: vf.how === 'self' ? 0.25 : 0 };
          if (e[7] || e[8]) o.mv = { dx: e[7] / 1000, dy: e[8] / 1000, sp: (k.spells && k.spells[e[2]] && k.spells[e[2]].sp) || 330, vis: 1 };
          spellFx(o);
          if (!o.mv) snd('boss_slam', 0.6, 0.9);
        }
      } else if (t === E.HEAL) {
        const v = viewOf(e[1]);
        if (v === P) say(P.x, P.y - CH * HS() * 1.1, '+' + e[2] + (e[3] ? ' маны' : ''), e[3] ? '#8ab8ff' : '#7dff8a');
      } else if (t === E.LVL) {
        if (e[2] && e[2] !== S.myId) continue;     // опыт за победу в дуэли — только победителю
        const lv = P.lvl; gainXp(e[1]);
        if (P.lvl !== lv) sendProg();
      } else if (t === E.SAY) {
        const v = viewOf(e[1]), code = e[2];
        if (!v) continue;
        const top = v === P ? CH * 1.2 * HS() : (v.ch && v.ch.ok ? v.ch.top * v.ch.U * (v.sc || 1) + 30 : 90);
        if (code === 1) { say(v.x, v.y - top, 'щит разбит', '#b9ffcf'); snd('archer_shield_break', 0.7); }
        else if (code === 2) { say(v.x, v.y - top, 'ЯРОСТЬ!', '#ff5a3a'); snd('boss_roar', 1); }
        else if (code === 3) { say(v.x, v.y - top, 'Ко мне!', '#ffb36a'); snd('boss_roar', 0.8, 1.12); }
        else if (code === 4 && v === P) { P.dead = 0; }
        else if (code >= 10 && N.PHRASES[code - 10]) { const [txt, col] = N.PHRASES[code - 10]; say(v.x, v.y - top, txt, col); if (code === 14) snd('boss_roar', 1, 0.9); }
      }
    }
  }
  let progT = 0;
  function sendProg() { clearTimeout(progT); progT = setTimeout(() => { if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'prog', prog: progOf() })); }, 300); }
  // распределение очков в окне героя тоже уходит на сервер
  const _progSave = progSave;
  progSave = function () { _progSave(); if (NETC.on) sendProg(); };

  // ---------- кнопки в онлайне: нажатия копятся и уходят с ближайшим вводом ----------
  const _castN = cast;
  cast = function (id) {
    if (!NETC.on) return _castN(id);
    if (P.dead > 0 || SHOP.paused) return;
    if (HERO_ID === 'archer' && id === 'r') return _castN(id);       // пассивка: только подсказка
    if (P.cd[id] > 0) { vo('cooldown', 1, 15); return; }
    if (P.mp < MANA[id]) { vo('nomana', 1, 15); say(P.x, P.y - CH * HS(), 'мало маны', '#8ab8ff'); return; }
    S.latch |= BIT[id];
  };
  const _startWave = SHOP.startWave;
  SHOP.startWave = function () {
    if (!NETC.on) return _startWave();
    if (S.modeOn === 'coop' && SHOP.phase === 'rest') S.latch |= N.B_WAVE;
  };
  // магазин работает и в онлайне: золото и сумка — у игрока, а характеристики от предметов уходят на сервер
  const _recompute = SHOP.recompute;
  SHOP.recompute = function () { _recompute(); if (NETC.on) sendProg(); };
  // фласки лечения, маны и холода применяет сервер; скорость и сила — бафф у игрока (уходит вместе с предметами)
  const _use = SHOP.use;
  SHOP.use = function (id) {
    if (!NETC.on || (id !== 'heal' && id !== 'mana' && id !== 'frost')) return _use(id);
    if (P.dead > 0 || !SHOP.flasks[id]) return;
    if ((id === 'heal' && P.hp >= P.maxHp) || (id === 'mana' && P.mp >= P.maxMp)) return;
    if (id === 'heal') { if (performance.now() < (SHOP.healCdT || 0)) return; SHOP.healCdT = performance.now() + 1000; }   // не чаще раза в секунду
    if (S.ws && S.ws.readyState === 1) S.ws.send(JSON.stringify({ t: 'use', id }));
    if (id === 'frost') { for (const k in P.cd) P.cd[k] = 0; say(P.x, P.y - CH * HS() * 1.1, 'Скиллы готовы', '#bfe6ff'); }
    SHOP.flasks[id]--; SHOP.refresh(); snd('flask', 0.7);
  };

  // ---------- кадр онлайн-игры ----------
  NETC.frame = function (dt, paused) {
    S.clk += dt;
    // ввод снимается с той же частотой, с какой сервер считает мир, и сразу применяется к своему герою (предсказание)
    S.acc += dt;
    let n = 0;
    while (S.acc >= N.DT && n < 4) {
      S.acc -= N.DT; n++;
      let { ax, ay } = paused || !S.cur ? { ax: 0, ay: 0 } : inputVector();
      if (P.dead > 0) { ax = 0; ay = 0; }
      const qx = Math.max(-127, Math.min(127, Math.round(ax * 127))), qy = Math.max(-127, Math.min(127, Math.round(ay * 127)));
      let btn = S.latch; S.latch = 0;
      if (!paused && (held.key || held.touch || held.mouse || held.pad)) btn |= N.B_ATK;
      S.seq = (S.seq + 1) & 0xffff;
      if (S.ws && S.ws.readyState === 1) S.ws.send(N.encInput(S.seq, qx, qy, btn));
      if (S.cur) {
        const sp = P.dead > 0 ? 0 : (S.spd == null ? 1 : S.spd);
        S.prev = { x: S.cur.x, y: S.cur.y };
        N.move(S.cur, qx, qy, sp);
        S.pending.push({ seq: S.seq, ax: qx, ay: qy, sp });
        if (S.pending.length > 120) S.pending.shift();
      }
    }
    if (S.acc > 0.25) S.acc = 0;
    // свой герой рисуется между двумя последними тиками предсказания, плюс тающая поправка от сверки
    if (S.cur) {
      const a = Math.min(1, S.acc / N.DT);
      const k = Math.exp(-dt / 0.06);
      S.err.x *= k; S.err.y *= k;
      P.x = S.prev.x + (S.cur.x - S.prev.x) * a + S.err.x;
      P.y = S.prev.y + (S.cur.y - S.prev.y) * a + S.err.y;
      P.moving = S.cur.moving; P.running = S.cur.running;
      if (P.moving && S.cur.face) P.face = S.cur.face;
    }
    // пинг раз в секунду
    if (S.ws && S.ws.readyState === 1 && performance.now() - S.pingT > 1000) { S.pingT = performance.now(); S.ws.send(N.encPing(S.pingT)); }
    if (!paused) { localUpdate(dt); heroVoiceTick(); }
    if (!paused) SHOP.tick(dt); else SHOP.hud();     // дроп монет, сундуков и фласок, время баффов, панель
    const mode = S.modeOn === 'duel' ? 'Дуэль' : 'Вместе', other = [...S.views.values()].filter(v => v.hero);
    let line = mode + ' · комната ' + S.room + ' · пинг ' + Math.round(S.rtt) + ' мс · игроков ' + (1 + other.length);
    if (S.modeOn === 'duel') {
      // в дуэли золото капает со временем (2 в секунду) — на магазин между схватками
      S.goldAcc = (S.goldAcc || 0) + dt * 2;
      if (S.goldAcc >= 1) { const g = Math.floor(S.goldAcc); S.goldAcc -= g; SHOP.gold += g; }
      line += ' · счёт ' + (P.kills || 0) + ' : ' + (other[0] ? other[0].kills || 0 : 0);
      // в дуэли вместо волн — счёт на табличке
      const E = SHOP.el, txt = 'ДУЭЛЬ  ' + (P.kills || 0) + ' : ' + (other[0] ? other[0].kills || 0 : 0);
      if (E.waveTxt.textContent !== txt) E.waveTxt.textContent = txt;
      if (E.waveGo.style.display !== 'none') E.waveGo.style.display = 'none';
    }
    if (line !== S.status) status(line);
  };

  // интерполяция чужих: показываем мир на interp тиков в прошлом, между двумя ближайшими снимками
  function placeViews(dt) {
    const rt = S.clk * N.TICK - S.interp;
    enemies.length = 0;
    for (const v of S.views.values()) {
      const h = v.hist;
      if (h.length) {
        let i = h.length - 1;
        while (i > 0 && h[i - 1].t > rt) i--;
        const b = h[i], a = h[i - 1] || b;
        const q = b.t === a.t ? 1 : Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t)));
        v.x = a.x + (b.x - a.x) * q; v.y = a.y + (b.y - a.y) * q;
      }
      v.animT += dt; v.flash -= dt;
      if (v.act) { v.act.t += dt; if (v.act.t >= v.act.dur) v.act = null; }
      if (v.dieT != null) v.dieT += dt;
      if (!v.act && v.dieT == null) v.anim = v.moving ? 'run' : 'idle';
      if (v.moving) v.runPh += dt * (v.hero ? (v.running ? 1.2 : 0.95) : Math.min(1.5, (v.k.speed || 120) / (2.3 * (v.ch && v.ch.U || 110))));
      if (isHostile(v) && (v.hero ? !v.dead : true)) enemies.push(v);
    }
  }
  function localUpdate(dt) {
    padButtons();
    for (const k in P.cd) if (P.cd[k] > 0) P.cd[k] = Math.max(0, P.cd[k] - dt);
    P.cast -= dt; P.hurt -= dt; P.heroT = (P.heroT || 0) + dt;
    if (P.act) { P.act.t += dt; if (P.act.t >= P.act.dur || P.dead > 0) P.act = null; }
    if (P.dead > 0) P.dead = Math.max(0.01, P.dead - dt);
    placeViews(dt);
    for (const s of shots) {
      if (s.tgt && (s.tgt === P || s.tgt.hp > 0)) { let dx = s.tgt.x - s.x, dy = (s.tgt.y - s.y) / YK; const m = Math.hypot(dx, dy) || 1; s.dx = dx / m; s.dy = dy / m; }
      const st = s.sp * dt; s.x += s.dx * st; s.y += s.dy * st * YK; s.left -= st;
    }
    for (const f of fx) {
      f.t += dt;
      if (f.t >= f.dur && !f.done) { f.done = true; if (f.type === 'shard') { fx.push({ type: 'spark', hail: 1, x: f.x, y: f.y, t: 0, dur: 0.5, R: f.R, sc: 1 }); if (Math.random() < 0.3) snd('hit', 0.12, rnd(0.85, 1.2)); } }
    }
    for (const z of zones) z.t -= dt;
    for (const t of texts) { t.t += dt; t.y -= 46 * dt; }
    keep(shots, s => s.left > 0);
    keep(fx, f => f.t < f.dur);
    keep(zones, z => z.t > 0);
    keep(texts, t => t.t < 0.9);
  }

  // ---------- рисование чужих героев ----------
  function drawHeroView(v) {
    const def = HEROES[v.kind].def;
    if (!def.ok) return;
    const c = { hero: true, U: 118, top: 1.5, ok: true };
    let anim = 'idle', fi = Math.floor(v.animT * 3) % 4;
    if (v.dead) { anim = 'die'; fi = 4; }
    else if (v.act) { anim = v.act.cast ? v.act.an || 'cast' : 'atk'; fi = Math.floor(v.act.t / v.act.dur * heroFrames(def, anim)); }
    else if (v.moving) { anim = 'run'; fi = Math.floor(v.runPh * 8) % heroFrames(def, 'run'); }
    const keep = HERO; HERO = def;
    ctx.save(); ctx.translate(v.x, v.y); ctx.scale(HS(), HS());
    if (v.dead) ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 10, 0, 0, 7); ctx.fillStyle = 'rgba(8,20,6,0.45)'; ctx.fill();
    drawSprite(c, anim, fi, v.row, v.flash > 0);
    ctx.restore();
    HERO = keep;
    if (v.dead) return;
    // полоска здоровья и имя: союзник — зелёная, соперник — красная
    const bw = 96, by = v.y - CH * 1.12 * HS(), ally = v.team === S.team;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(v.x - bw / 2 - 1, by - 1, bw + 2, 10);
    ctx.fillStyle = ally ? '#57d46a' : '#e0503f'; ctx.fillRect(v.x - bw / 2, by, bw * Math.max(0, v.hp / v.max), 8);
    const nm = (S.names[v.id] && S.names[v.id].name) || HEROES[v.kind].name;
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = ally ? '#bfffc8' : '#ffc2b8'; ctx.strokeText(nm, v.x, by - 6); ctx.fillText(nm, v.x, by - 6);
  }
  // союзники (в кооперативе) рисуются вместе с остальными по глубине
  const _ce = combatEntities;
  combatEntities = function () {
    const out = _ce();
    if (NETC.on) for (const v of S.views.values()) if (v.hero && !isHostile(v)) out.push(v);
    return out;
  };
  // щит и буря у чужих героев
  const _hg = heroGround;
  heroGround = function (t) {
    _hg(t);
    if (!NETC.on) return;
    for (const v of S.views.values()) if (v.hero && v.ult && !v.dead && fx2ok('storm')) stormDraw(v.x, v.y, 420 * HS(), t, 0.8);
    if (P.ult > 0 && HERO_ID === 'archer') {}
  };
  const _ho = heroOver;
  heroOver = function (t) {
    _ho(t);
    if (!NETC.on) return;
    for (const v of S.views.values()) if (v.hero && v.shield && !v.dead) fx3('shield', v.x, v.y - CH * 0.42 * HS(), 230 * HS(), 230 * HS(), 0.5, 0.5, 0.6);
  };
})();
