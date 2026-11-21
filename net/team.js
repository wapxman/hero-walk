// «Вместе онлайн» (v104): та же игра, что одиночная, но вдвоём.
// Каждый клиент ведёт свою обычную игру — свой герой, предметы, рывок, состояния, Междумирье, лавка работают как в одиночной.
// Сервер только сводит двоих в комнату и пересылает сообщения (server.js, режим team). Общее между клиентами:
//   • ведущий (кто вошёл первым) выпускает волны и решает, чей злодей; ведомый волны сам не выпускает и идёт за ведущим
//     (номер волны, мир, начало и конец раунда);
//   • злодея считает тот, за кем он гонится («хозяин»): его шаги, умения, урон по герою — обычный код одиночной игры.
//     У напарника этот злодей — кукла: место, кадр и здоровье приходят от хозяина; урон по кукле уходит хозяину;
//   • герой напарника, его выстрелы, метки ударов на земле и надписи умений показываются по сообщениям (без урона).
// Упрощение: удар по площади от чужого злодея напарника не задевает — злодей бьёт того, за кем гонится.
'use strict';
var TEAM = { on: false, host: false, peer: null };
(function () {
  const T = TEAM, TV = 1;
  let ws = null, me = 0, nextId = 1, install = false, rx = false;
  const byId = new Map();            // сетевой номер → злодей
  const PV = { on: false, x: 0, y: 0, tx: 0, ty: 0, hp: 1, max: 1, dead: false, limbo: false, anim: 'idle', fi: 0, row: 0, hero: 'mage', name: '', flash: 0, lvl: 1, last: 0, buffs: {} };   // герой напарника
  T.pv = PV;
  let hostW = null;                  // последнее состояние волны от ведущего
  const hits = new Map();            // накопленный урон по куклам: номер → урон
  const now = () => performance.now() / 1000;
  const send = o => { if (ws && ws.readyState === 1) { o.t = 'tm'; const s = JSON.stringify(o); if (s.length < 3900) ws.send(s); } };
  const status = t => { const el = document.getElementById('netStat'); if (el) el.textContent = t; };
  const mine = e => e.own == null || e.own === me;
  const peerAlive = () => !!T.peer && PV.on && !PV.dead && !PV.limbo;
  const inLimbo = () => typeof LIMBO !== 'undefined' && LIMBO.on;
  T.peerAlive = peerAlive;

  // ---------- подключение ----------
  T.connect = function (room) {
    const url = (NETC.S && NETC.S.url) || new URLSearchParams(location.search).get('server') || 'wss://abpartners.uz:30777';
    status('Подключение к серверу…');
    try { ws = new WebSocket(url); } catch (e) { status('Сервер недоступен'); return; }
    ws.onopen = () => ws.send(JSON.stringify({ t: 'join', mode: 'team', room: room || undefined, hero: HERO_ID, name: HEROES[HERO_ID].name, v: String(V).replace(/\D/g, '') }));
    ws.onmessage = m => { if (typeof m.data !== 'string') return; let j; try { j = JSON.parse(m.data); } catch (e) { return; } if (j && typeof j === 'object') try { onMsg(j); } catch (e) { console.error('team', e); } };
    ws.onclose = () => { if (T.on) { say(P.x, P.y - CH * HS() * 1.4, 'Связь потеряна — дальше в одиночку', '#ff9a6a'); status(''); solo(); } else status('Сервер недоступен'); };
    ws.onerror = () => {};
  };
  // напарника нет (вышел или связь пропала): игра продолжается одиночной — все злодеи мои, волны выпускаю сам
  function solo() {
    T.peer = null; PV.on = false;
    for (const e of enemies) e.own = me;
    if (!T.host) { T.host = true; ROUND.queue = ROUND.queue.filter(t => KIND[t]); ROUND.relT = 1; }
    hostW = null;
  }
  function onMsg(m) {
    if (m.t === 'error') { status(m.msg || 'Ошибка сервера'); return; }
    if (m.t === 'tjoined') {
      T.host = !!m.host; me = T.host ? 0 : 1; T.room = m.room; T.peer = m.peer || null; nextId = 1;
      if (!install) { install = true; hooks(); }
      T.on = true;
      for (const id in HEROES) loadHero(HEROES[id].def);
      status(T.host ? 'Комната ' + m.room + ' — ждём напарника (можно начинать)' : 'Комната ' + m.room);
      if (T.peer) { PV.hero = T.peer.hero; PV.name = T.peer.name; verCheck(); }
      begin();
      return;
    }
    if (m.t === 'tpeer') { T.peer = m.peer; PV.hero = m.peer.hero; PV.name = m.peer.name; PV.on = false; verCheck(); say(P.x, P.y - CH * HS() * 1.4, 'Напарник вошёл: ' + m.peer.name, '#b9ffcf'); status('Комната ' + T.room); if (T.host) sendAll(); return; }
    if (m.t === 'tleft') { say(P.x, P.y - CH * HS() * 1.4, 'Напарник вышел', '#ffb36a'); solo(); status('Комната ' + T.room + ' — напарник вышел'); return; }
    if (m.t !== 'tm' || !T.on) return;
    const k = m.k;
    if (T.dbg && k !== 'h' && k !== 'e' && k !== 'w') T.dbg.push([+(now() % 1000).toFixed(1), k, m.id || (m.L ? m.L.length : ''), enemies.length]);
    if (k === 'h') return onHero(m);
    if (k === 'w') { hostW = m; return follow(); }
    if (k === 'sp') return onSpawn(m);
    if (k === 'e') return onEnemies(m.L);
    if (k === 'hit') return onHits(m.L);
    if (k === 'cc') return onCc(m);
    if (k === 'die') { const e = byId.get(m.id); if (e) killLocal(e); return; }
    if (k === 'gone') { const e = byId.get(m.id); if (e && e.hp > 0) { e.hp = 0; const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); byId.delete(m.id); } return; }
    if (k === 'take') { for (const e of enemies) if (e.dieT == null && e.hp > 0) setOwner(e, me); return; }   // напарник погиб: его злодеи теперь гонятся за мной
    if (k === 'sync') { for (const e of enemies) if (e.nid != null && mine(e) && e.dieT == null && e.hp > 0) send(spawnMsg(e)); if (T.host) send(wState()); return; }
    if (k === 'own') { const e = byId.get(m.id); if (e) setOwner(e, m.to); return; }
    if (k === 'req') { if (T.host && SHOP.phase === 'rest' && P.dead <= 0 && !inLimbo() && !SHOP.transit && !(typeof PATHMAP !== 'undefined' && PATHMAP.on)) { say(P.x, P.y - CH * HS() * 1.4, 'Напарник начинает бой', '#b9ffcf'); startDirect(); } else if (T.host) say(P.x, P.y - CH * HS() * 1.4, 'Напарник готов к бою', '#b9ffcf'); return; }
    if (k === 'say') { if (typeof m.s === 'string') sayRaw(m.x, m.y, m.s.slice(0, 40), m.c); return; }
    if (k === 'fx') { for (const f of m.L) fx.push({ type: f[0], x: f[1], y: f[2], t: 0, dur: f[3], R: f[4], dmg: 0, ghost: 1 }); return; }
    if (k === 'sh') { for (const s of m.L) shots.push({ own: s[0] ? 'p' : 'e', ghost: s[0] ? 1 : 2, x: s[1], y: s[2], dx: s[3], dy: s[4], sp: s[5], left: s[6], dmg: 0, h: s[7], sc: 1, arrow: s[8] ? 1 : 0, col: s[9] || undefined }); return; }
    if (k === 'buff') return T.onBuff && T.onBuff(m);
  }
  function verCheck() { if (T.peer && T.peer.v && T.peer.v !== String(V).replace(/\D/g, '')) say(P.x, P.y - CH * HS() * 1.7, 'У напарника другая версия игры — обновите обе', '#ffb36a'); }

  // ---------- начало игры ----------
  // ведущий начинает как одиночную (карта, свой забег). Ведомый грузит своего героя (уровень, сумку, золото) и встаёт на волну ведущего
  function begin() {
    const sel = document.getElementById('hSel'), go = sel && sel.querySelector('.go');
    if (T.host) { NETC.S.mode = 'single'; if (go) go.dispatchEvent(new PointerEvent('pointerdown')); return; }
    if (sel) sel.style.display = 'none';
    const mm = document.getElementById('mMain'); if (mm) mm.style.display = 'none';
    const d = SAVE.read() || {}; T.keep = { wave: d.wave || 0, best: d.best || 0, had: !!SAVE.read() };
    SAVE.start(1, 0);
    say(P.x, P.y - CH * HS() * 1.4, 'Вместе с ' + (T.peer ? T.peer.name : 'напарником'), '#b9ffcf');
  }
  // сохранение ведомого: герой, сумка и золото — его, а место в походе остаётся прежним (он гость в чужом забеге)
  {
    const _set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (T.keep && /^hw_run_/.test(k)) { try { const d = JSON.parse(v); d.wave = T.keep.wave; d.best = T.keep.best; delete d.hp; v = JSON.stringify(d); } catch (e) {} }
      return _set.call(this, k, v);
    };
  }

  // ---------- волны: ведомый идёт за ведущим ----------
  function wState() { return { k: 'w', wave, endW: ROUND.endW, q: ROUND.queue.length, fin: ROUND.fin ? 1 : 0, ph: SHOP.phase === 'fight' ? 1 : 0, rf: SHOP.roundFrom || wave + 1, world: WORLD, tr: SHOP.transit ? 1 : 0 }; }
  function startDirect() { SHOP.mapShown = true; SHOP.startWave(); }   // без карты выбора главы
  function follow() {
    const h = hostW; if (!h || T.host || !T.on) return;
    if (inLimbo() || SHOP.transit || (typeof PATHMAP !== 'undefined' && PATHMAP.on) || (typeof ARENA_COVER !== 'undefined' && ARENA_COVER.busy)) return;
    if (SHOP.phase === 'rest') {
      const hw = h.ph ? h.rf - 1 : h.wave;          // сколько волн пройдено у ведущего на начало его раунда
      if (!h.tr && (wave !== hw || WORLD !== h.world)) {
        wave = hw; SHOP.roundFrom = wave + 1; ROUND.endW = wave; ROUND.queue.length = 0; ROUND.fin = null;
        if (WORLD !== h.world) applyWorld(h.world); else if (typeof setArena === 'function') setArena(WORLD, arenaIdx(wave + 1), true);
        SHOP.refresh();
      }
      if (h.ph && P.dead <= 0 && !(SHOP.restT > 0)) { T.joining = true; try { startDirect(); } finally { T.joining = false; } }
    }
    if (SHOP.phase === 'fight') {
      if (wave !== h.wave && h.ph) { wave = h.wave; say(P.x, P.y - CH * 1.3 * HS(), 'Волна ' + wave, '#ffe9a8'); SHOP.refresh(); }
      if (h.ph) { ROUND.endW = h.endW; ROUND.queue = new Array(h.q).fill('_'); ROUND.fin = h.fin ? '_' : null; T.restAt = 0; }
      else {
        // ведущий уже отдыхает: волны кончились — мой раунд закончится сам, когда не останется злодеев; застрявших кукол убираем
        ROUND.queue.length = 0; ROUND.fin = null; ROUND.endW = wave;
        if (!T.restAt) T.restAt = now();
        if (now() - T.restAt > 3 && !PV.limbo) for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].dieT == null && !mine(enemies[i])) { byId.delete(enemies[i].nid); enemies.splice(i, 1); }
      }
    }
  }

  // ---------- злодеи ----------
  const NUM = ['hp', 'max', 'dm', 'sc', 'rad', 'speed'];
  function spawnMsg(e) { const o = { k: 'sp', id: e.nid, ty: e.type, x: Math.round(e.x), y: Math.round(e.y), own: e.own, mini: e.mini ? 1 : 0, life: e.life || 0 }; for (const n of NUM) o[n] = +(+e[n]).toFixed(3); return o; }
  function onSpawn(m) {
    if (byId.has(m.id) || !KIND[m.ty]) return;
    rx = true; try { spawnEnemyBase(m.ty); } finally { rx = false; }
    const e = enemies[enemies.length - 1];
    e.nid = m.id; e.own = m.own; e.x = e.nx = m.x; e.y = e.ny = m.y; if (m.mini) e.mini = true; if (m.life) e.life = m.life;
    for (const n of NUM) if (typeof m[n] === 'number') e[n] = m[n];
    byId.set(m.id, e);
  }
  // новых злодеев (волна у ведущего, призванные умениями — у любого) нумеруем и сообщаем напарнику
  function announce() {
    for (const e of enemies) {
      if (e.nid != null) continue;
      e.nid = me * 100000 + nextId++; byId.set(e.nid, e);
      e.own = me;
      if (T.host && peerAlive() && !e.summoned && !inLimbo() && P.dead <= 0) {   // чей злодей: кто ближе; если герой мёртв — другому
        const d0 = gdist(P, e), d1 = Math.hypot(PV.x - e.x, (PV.y - e.y) / YK);
        if (d1 < d0) e.own = 1;
      } else if (T.host && peerAlive() && (inLimbo() || P.dead > 0)) e.own = 1;
      if (T.peer) send(spawnMsg(e));
    }
  }
  function sendAll() { send(wState()); for (const e of enemies) if (e.nid != null && e.dieT == null && e.hp > 0) send(spawnMsg(e)); }
  function setOwner(e, to) {
    if (e.own === to) return;
    e.own = to;
    if (to !== me) { e.act = null; e.leap = null; e.skMove = null; e.kb = null; e.nx = e.x; e.ny = e.y; }   // стал куклой
    else { e.act = null; e.anim = 'run'; e.atkCd = Math.max(e.atkCd || 0, 0.6); }                             // стал моим: продолжает с места
  }
  // ведущий раз в секунду пересматривает, за кем гонится злодей: герой погиб или ушёл в Междумирье — злодеи идут к другому;
  // напарник заметно ближе — рядовой переключается на него
  function rebalance() {
    if (!T.host || !T.peer) return;
    const meOk = P.dead <= 0 && !inLimbo(), pOk = peerAlive();
    for (const e of enemies) {
      if (e.nid == null || e.dieT != null || e.hp <= 0) continue;
      let to = e.own;
      if (e.own === 0 && !meOk && pOk) to = 1;
      else if (e.own === 1 && !pOk && meOk) to = 0;
      else if (meOk && pOk && !e.act && !e.boss) {
        const d0 = gdist(P, e), d1 = Math.hypot(PV.x - e.x, (PV.y - e.y) / YK);
        if (e.own === 0 && d1 < d0 * 0.55 && d0 > 260) to = 1; else if (e.own === 1 && d0 < d1 * 0.55 && d1 > 260) to = 0;
      }
      if (to !== e.own) { setOwner(e, to); send({ k: 'own', id: e.nid, to }); }
    }
  }
  // снимки моих злодеев → напарнику (10 раз в секунду)
  function sendEnemies() {
    let L = [];
    for (const e of enemies) {
      if (e.nid == null || !mine(e) || e.dieT != null || e.hp <= 0) continue;
      const a = e.act;
      L.push([e.nid, Math.round(e.x), Math.round(e.y), Math.round(e.hp), e.anim || 'run', e.row | 0, a ? a.anim : 0, a ? +(Math.min(1, a.t / (a.dur || 1))).toFixed(2) : 0,
        (e.slowT > 0 ? 1 : 0) | (e.root > 0 ? 2 : 0) | (e.stunT > 0 ? 4 : 0) | (e.untarget > 0 ? 8 : 0) | (e.shield > 0 ? 16 : 0), Math.round(e.jump || 0)]);
      if (L.length >= 14) { send({ k: 'e', L }); L = []; }
    }
    if (L.length) send({ k: 'e', L });
  }
  function onEnemies(L) {
    for (const s of L) {
      const e = byId.get(s[0]); if (!e || mine(e) || e.dieT != null) continue;
      e.nx = s[1]; e.ny = s[2];
      if (!(hits.get(e.nid) > 0)) e.hp = Math.max(1, s[3]);
      e.anim = s[4]; e.row = s[5];
      e.act = s[6] ? { anim: s[6], dur: 1, t: s[7], at: 2, fn() {}, hit: true, net: 1 } : null;
      const f = s[8]; e.pSlow = f & 1; e.pRoot = f & 2; e.untarget = f & 8 ? 0.3 : 0; e.shield = f & 16 ? 0.3 : 0; e.jump = s[9] || 0;
      if (Math.hypot(e.nx - e.x, e.ny - e.y) > 400) { e.x = e.nx; e.y = e.ny; }
    }
  }
  // кукла: идёт к присланному месту, таймеры наложенного мной контроля тикают сами
  function puppet(e, dt) {
    e.animT += dt; e.bob += dt * 7; e.flash -= dt;
    for (const k of ['slowT', 'silT', 'root', 'stunT', 'medT']) if (e[k] > 0) e[k] -= dt;
    if (e.nx != null) { const f = 1 - Math.exp(-dt * 12); e.x += (e.nx - e.x) * f; e.y += (e.ny - e.y) * f; }
    if (e.act && e.act.net && e.act.t < 1) e.act.t = Math.min(1, e.act.t + dt * 1.2);
  }
  // смерть куклы по сообщению хозяина: награда и опыт — обоим
  function killLocal(e) {
    if (e.dieT != null) return;
    e.hp = 0; kills++; gainXp((e.k.xp || KILL_XP[e.type] || 8) * (e.elite ? BAL.ELITE.xp : 1));
    e.dieT = 0; e.anim = 'die'; e.act = null; corpses.push(e);
    SHOP.onKill(e); snd('enemy_death', e.boss ? 1 : 0.45, e.boss ? 0.75 : rnd(0.92, 1.1));
    byId.delete(e.nid);
  }
  // урон напарника по моему злодею
  function onHits(L) {
    for (const [id, d] of L) {
      const e = byId.get(id); if (!e || e.dieT != null || e.hp <= 0) continue;
      if (!mine(e)) { hits.set(id, (hits.get(id) || 0) + d); continue; }   // хозяин успел смениться — переслать дальше
      if (d < e.hp) { e.hp -= d; e.flash = 0.08; }
      else { T.fromPeer = true; try { hurtEnemy(e, (e.hp + 1) / (P.dmgMul || 1)); } finally { T.fromPeer = false; } }
    }
  }
  function onCc(m) {
    const e = byId.get(m.id); if (!e || !mine(e) || e.dieT != null) return;
    if (m.sl) { e.slowK = Math.min(e.slowT > 0 ? e.slowK : 1, m.sk || 0.7); e.slowT = Math.max(e.slowT || 0, m.sl); }
    if (m.ro) e.root = Math.max(e.root || 0, m.ro);
    if (m.st) e.stunT = Math.max(e.stunT || 0, m.st);
    if (m.si) e.silT = Math.max(e.silT || 0, m.si);
    if (m.dot) { e.dot = Math.max(e.dot || 0, m.dot); if (m.dotT) e.dotT = Math.max(e.dotT || 0, m.dotT); }
  }

  // ---------- герой напарника ----------
  let myAnim = ['idle', 0, 0], drawingPeer = false;
  function heroMsg() {
    return { k: 'h', x: Math.round(P.x), y: Math.round(P.y), hp: Math.round(P.hp), mx: Math.round(P.maxHp), d: P.dead > 0 ? 1 : 0, l: inLimbo() ? 1 : 0, a: myAnim[0], f: myAnim[1], r: myAnim[2], hu: P.hurt > 0.17 ? 1 : 0, lv: P.lvl,
      sh: (typeof P.shield === 'number' && P.shield > 0) || P.ss.rshield > 0 ? 1 : 0, ul: P.ult > 0 ? 1 : 0 };
  }
  function onHero(m) {
    if (!PV.on) { PV.x = m.x; PV.y = m.y; }
    PV.on = true; PV.tx = m.x; PV.ty = m.y; PV.hp = m.hp; PV.max = m.mx || 1; PV.dead = !!m.d; PV.limbo = !!m.l; PV.anim = m.a; PV.fi = m.f; PV.row = m.r; PV.flash = m.hu; PV.lvl = m.lv; PV.sh = m.sh; PV.ul = m.ul; PV.last = now();
    if (Math.hypot(PV.tx - PV.x, PV.ty - PV.y) > 500) { PV.x = PV.tx; PV.y = PV.ty; }
  }
  PV.draw = function () {
    const def = HEROES[PV.hero] && HEROES[PV.hero].def;
    if (!def || !def.ok || !def.mul[PV.anim]) return;
    const keep = HERO; HERO = def; drawingPeer = true;
    ctx.save(); ctx.translate(PV.x, PV.y); ctx.scale(HS(), HS());
    if (PV.dead) ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.ellipse(0, 0, 30, 10, 0, 0, 7); ctx.fillStyle = 'rgba(8,20,6,0.45)'; ctx.fill();
    try { drawSprite({ hero: true, U: 118, top: 1.5, ok: true }, PV.anim, PV.fi, PV.row, !!PV.flash); } catch (e) {}
    ctx.restore(); HERO = keep; drawingPeer = false;
    if (PV.dead) return;
    const bw = 96, by = PV.y - CH * 1.12 * HS();
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(PV.x - bw / 2 - 1, by - 1, bw + 2, 10);
    ctx.fillStyle = '#57d46a'; ctx.fillRect(PV.x - bw / 2, by, bw * Math.max(0, Math.min(1, PV.hp / PV.max)), 8);
    ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.fillStyle = '#bfffc8'; const nm = PV.name + ' · ' + PV.lvl; ctx.strokeText(nm, PV.x, by - 6); ctx.fillText(nm, PV.x, by - 6);
  };
  const peerShown = () => T.on && T.peer && PV.on && !PV.limbo && !inLimbo() && now() - PV.last < 3;
  T.peerShown = peerShown;

  // ---------- что из моего показывать напарнику: надписи умений, метки ударов, выстрелы ----------
  let sayRaw = null;
  const FXT = { tele: 1, nova: 1, quake: 1 };
  function sendVisuals() {
    let L = [];
    for (const f of fx) { if (f._tx || f.ghost) continue; f._tx = 1; if (FXT[f.type] && L.length < 12) L.push([f.type, Math.round(f.x), Math.round(f.y), +(f.dur || 1).toFixed(2), Math.round(f.R || 60)]); }
    if (L.length) send({ k: 'fx', L });
    L = [];
    for (const s of shots) { if (s._tx || s.ghost) continue; s._tx = 1; if (L.length < 14) L.push([s.own === 'p' ? 1 : 0, Math.round(s.x), Math.round(s.y), +s.dx.toFixed(3), +s.dy.toFixed(3), Math.round(s.sp), Math.round(s.left), Math.round(s.h || 40), s.arrow ? 1 : 0, s.own === 'p' ? 0 : s.col || 0]); }
    if (L.length) send({ k: 'sh', L });
  }

  // ---------- встраивание в игру (один раз, при первом входе в «Вместе») ----------
  function hooks() {
    // ведомый волны не выпускает
    const _rt = runTick; runTick = function (dt) { if (T.on && !T.host) return; T.inWave = true; try { return _rt(dt); } finally { T.inWave = false; } };
    const _spw = spawnWave; spawnWave = function () { if (T.on && !T.host) { ROUND.endW = roundEnd(wave + 1); wave++; ROUND.queue = ['_']; ROUND.fin = null; ROUND.mini = null; return; } return _spw(); };
    // «В бой»: ведомый просит ведущего; ведущий начинает как обычно
    const _sw = SHOP.startWave;
    SHOP.startWave = function () {
      if (T.on && !T.host && !T.joining) { if (SHOP.phase === 'rest' && P.dead <= 0) { send({ k: 'req' }); say(P.x, P.y - CH * HS() * 1.4, 'Ждём ведущего…', '#cfe3ff'); if (SHOP.open) SHOP.closeShop(); } return; }
      const r = _sw.apply(this, arguments);
      if (T.on && T.host) send(wState());
      return r;
    };
    // кукол не считаем; урон по кукле уходит хозяину
    const _ue = updateEnemy;
    updateEnemy = function (e, dt) { if (T.on && !mine(e)) return puppet(e, dt); return _ue(e, dt); };
    const _he = hurtEnemy;
    hurtEnemy = function (e, dmg, col) {
      if (!T.on || mine(e)) {
        const was = e.dieT == null && e.hp > 0; const r = _he(e, dmg, col);
        if (T.on && T.peer && was && e.dieT != null && e.nid != null) { send({ k: 'die', id: e.nid }); byId.delete(e.nid); }
        return r;
      }
      if (e.hp <= 0 || e.dieT != null) return;
      const PAD = 1e12, h0 = e.hp; e.hp += PAD;
      let r; try { r = _he(e, dmg, col); } finally { const d = h0 + PAD - e.hp; e.hp = Math.max(1, h0 - d); if (d > 0) hits.set(e.nid, (hits.get(e.nid) || 0) + d); }
      return r;
    };
    const _sb = spawnEnemyBase;
    spawnEnemyBase = function (type) { const n = enemies.length; const r = _sb(type); if (T.on && !rx && enemies.length > n && !T.inWave) enemies[enemies.length - 1].summoned = 1; return r; };   // призванный умением остаётся у того, кто его призвал
    // герой напарника — среди остальных по глубине
    const _ce = combatEntities;
    combatEntities = function () { const out = _ce(); if (peerShown()) out.push(PV); return out; };
    // какой кадр героя сейчас на экране — его и видит напарник
    const _ds = drawSprite;
    drawSprite = function (c, anim, fi, row, flash) { if (T.on && c && c.hero && !drawingPeer && !T.ghostDraw) myAnim = [anim, fi | 0, row | 0]; return _ds.apply(this, arguments); };
    // надписи умений («Таран!») — напарнику
    sayRaw = say;
    say = function (x, y, t, c) { if (T.on && T.peer && typeof t === 'string' && t.length > 3 && t.length < 40 && /!$/.test(t) && !/^[-+\d]/.test(t)) send({ k: 'say', x: Math.round(x), y: Math.round(y), s: t, c }); return sayRaw(x, y, t, c); };
    // каждый кадр: новые злодеи, сглаживание напарника
    const _cu = combatUpdate;
    combatUpdate = function (dt) {
      _cu(dt);
      if (!T.on) return;
      announce();
      if (PV.on) { const f = 1 - Math.exp(-dt * 12); PV.x += (PV.tx - PV.x) * f; PV.y += (PV.ty - PV.y) * f; }
    };
    // гибель: поле у меня очищается (как в одиночной), а мои злодеи переходят к живому напарнику; вернулся — прошу показать поле заново
    if (typeof LIMBO !== 'undefined') {
      const _en = LIMBO.enter; LIMBO.enter = function () { if (T.on && T.peer) { send({ k: 'take' }); byId.clear(); } return _en.apply(this, arguments); };
    }
    // щит и буря напарника
    if (typeof heroOver === 'function') { const _ho = heroOver; heroOver = function (t) { _ho(t); if (peerShown() && PV.sh && !PV.dead && typeof fx3 === 'function') fx3('shield', PV.x, PV.y - CH * 0.42 * HS(), 230 * HS(), 230 * HS(), 0.5, 0.5, 0.6); }; }
    // сеть: 15 раз в секунду, даже когда игра на паузе или герой в Междумирье
    let n = 0;
    setInterval(() => {
      if (!T.on || !ws || ws.readyState !== 1) return;
      n++;
      { const lb = inLimbo(); if (T.wasLb && !lb && T.peer) { byId.clear(); send({ k: 'sync' }); } T.wasLb = lb; }   // вернулся из Междумирья — прошу показать поле заново
      send(heroMsg());
      if (!T.peer) return;
      if (n % 2 === 0) sendEnemies();
      sendVisuals();
      if (hits.size) { const L = []; for (const [id, d] of hits) { const e = byId.get(id); if (e && !mine(e)) L.push([id, Math.round(d)]); } hits.clear(); if (L.length) send({ k: 'hit', L }); }
      // контроль, наложенный мной на куклу
      for (const e of enemies) {
        if (e.nid == null || mine(e) || e.dieT != null) continue;
        const c = e._cc || (e._cc = { sl: 0, ro: 0, st: 0, si: 0 }), o = {};
        let any = false;
        if ((e.slowT || 0) > c.sl + 0.2) { o.sl = +e.slowT.toFixed(2); o.sk = +(e.slowK || 0.7).toFixed(2); any = true; }
        if ((e.root || 0) > c.ro + 0.2) { o.ro = +e.root.toFixed(2); any = true; }
        if ((e.stunT || 0) > c.st + 0.2) { o.st = +e.stunT.toFixed(2); any = true; }
        if ((e.silT || 0) > c.si + 0.2) { o.si = +e.silT.toFixed(2); any = true; }
        c.sl = e.slowT || 0; c.ro = e.root || 0; c.st = e.stunT || 0; c.si = e.silT || 0;
        if (any) { o.k = 'cc'; o.id = e.nid; send(o); }
      }
      if (T.host) { if (n % 5 === 0) send(wState()); if (n % 15 === 0) rebalance(); }
      else if (n % 5 === 0) follow();
      // злодеи, которых у меня больше нет (ушли без смерти: кончилось время призыва и т. п.)
      if (n % 15 === 0) for (const [id, e] of byId) if (enemies.indexOf(e) < 0 && corpses.indexOf(e) < 0) { byId.delete(id); if (mine(e)) send({ k: 'gone', id }); }
    }, 66);
  }
})();
