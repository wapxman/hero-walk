// Крюк мясников (v117, по просьбе Создателя): «Тюремный мясник» (v_butcher) и «Главный мясник» (el_butcher).
// Замах: по земле от мясника к герою ложится полоса-прицел — сначала она следит за героем, в конце замаха замирает.
// Бросок: по замершей линии летит цепь с крюком. Попал — урон, вспышка удара, героя тянет к мяснику. Ушёл с линии или
// сделал рывок — промах, цепь возвращается. Мясника убили или сбили во время замаха — броска нет.
// Графика — листы Клауди (villains/v_butcher/hook → fx/hook/): hook — голова крюка, chain — бесшовная цепь, impact_0…3 — удар.
// Кодом — только полоса-прицел на земле. Крюк есть и в мягком мире 1 (поле always у умения — sk.js).
'use strict';
const HOOK = (() => {
  const { DEF, MOV, S } = SK;
  const IMG = {}; for (const k of ['hook', 'chain', 'impact_0', 'impact_1', 'impact_2', 'impact_3']) { const i = new Image(); i.src = 'fx/hook/' + k + '.webp' + V; IMG[k] = i; }
  const ok = i => i && i.complete && i.naturalWidth > 0;
  // wind — замах, lock — последняя часть замаха, когда линия уже не следит за героем; sp — скорость крюка; w — ширина попадания
  const CFG = {
    v_butcher: { range: 600, wind: 0.95, lock: 0.4, sp: 1000, w: 62, dmg: 22, pull: 1300, stun: 0 },
    el_butcher: { range: 700, wind: 0.85, lock: 0.35, sp: 1150, w: 66, dmg: 30, pull: 1500, stun: 0.5 },
  };
  const cfg = e => CFG[e.type] || CFG[e.k.base] || CFG.v_butcher;
  const lvK = () => (typeof LEVEL !== 'undefined' ? LEVEL.K() : null);
  const alive = e => e.dieT == null && e.hp > 0;
  const hand = e => (e.ch && e.ch.ok ? e.ch.top * e.ch.U * e.sc : 110) * 0.5;      // высота руки над землёй
  const L = [], HITS = [];      // летящие крюки и вспышки удара
  let last = -99;                // когда был последний бросок (двое мясников не бросают разом)
  const busy = e => L.some(h => h.e === e);

  function start(e) {
    const c = cfg(e), K = lvK(), wk = K ? K.wind : 1;
    const wind = c.wind / wk, lock = c.lock / wk;
    const [dx, dy] = SK.dirTo2(e, P);
    const h = { e, c, st: 'aim', t: 0, wind, lock, dx, dy, len: 0, max: c.range + 60, sp: c.sp * (K ? Math.min(1.5, K.run) : 1) };
    L.push(h); last = P.heroT || 0;
    // мясник стоит в замахе; бросок — в конце замаха
    startAct(e, 'cast1', wind + 0.2, wind / (wind + 0.2), () => { if (h.st === 'aim') { h.st = 'fly'; h.t = 0; snd('enemy_arrow', 0.6, 0.7); } });
    h.act = e.act;
  }
  function hold(e, h) { if (alive(e) && !e.kb && !(e.root > 0)) { e.act = { anim: 'cast1', dur: 9, at: 2, fn() {}, t: 0.6 * (h.wind + 0.2), hit: true }; e.anim = 'cast1'; h.act = e.act; } }
  function update(dt) {
    for (const h of L) {
      const e = h.e, c = h.c; h.t += dt;
      if (!alive(e) || P.dead > 0) { h.st = 'end'; continue; }
      if (h.st === 'aim') {
        if (e.act !== h.act) { h.st = 'end'; continue; }                         // сбили, приковали, оттолкнули — броска нет
        if (h.t < h.wind - h.lock) { const [dx, dy] = SK.dirTo2(e, P); h.dx = dx; h.dy = dy; e.row = runRow(dx, dy * YK); }
      } else if (h.st === 'fly') {
        if (e.act !== h.act) hold(e, h);
        h.len += h.sp * dt;
        const tx = e.x + h.dx * h.len, ty = e.y + h.dy * h.len * YK;
        if (Math.hypot(P.x - tx, (P.y - ty) / YK) < c.w / 2 + 26) {
          if (P.dashI > 0 || (P.ss && P.ss.imm && P.ss.imm.pull > 0)) { if (!h.miss) { h.miss = 1; SK.say2('увернулся!', '#b9ffcf'); } }
          else {
            h.st = 'pull'; h.t = 0; hurtPlayer(c.dmg * e.dm); snd('enemy_melee', 0.8, 0.8); HITS.push({ x: P.x, y: P.y, t: 0 });
            const d = Math.hypot(P.x - e.x, (P.y - e.y) / YK), stop = e.rad + 58;
            h.pt = Math.max(0.18, Math.min(0.55, (d - stop) / c.pull));
            S.pull = { x: e.x + h.dx * stop, y: e.y + h.dy * stop * YK, t: h.pt }; S.pin = Math.max(S.pin, h.pt + 0.15);
            SK.say2('крюк!', '#ffb36a');
            if (c.stun > 0) STATUS.add('stun', c.stun);
          }
        }
        if (h.st === 'fly' && h.len >= h.max) { h.st = 'back'; }
      } else if (h.st === 'pull') {
        if (e.act !== h.act) hold(e, h);
        if (h.t >= h.pt) { h.st = 'end'; e.atkCd = Math.min(e.atkCd, 0.15); }      // притянул — сразу бьёт
      } else if (h.st === 'back') {
        if (e.act !== h.act) hold(e, h);
        h.len -= h.sp * 1.7 * dt; if (h.len <= 0) h.st = 'end';
      }
    }
    for (let i = L.length - 1; i >= 0; i--) if (L[i].st === 'end') { const h = L[i]; if (h.e.act === h.act && alive(h.e)) { h.e.act = null; h.e.anim = 'idle'; } L.splice(i, 1); }
    for (const x of HITS) x.t += dt;
    for (let i = HITS.length - 1; i >= 0; i--) if (HITS[i].t > 0.27) HITS.splice(i, 1);
  }
  MOV.push({ t: 0, dur: 1e9, update(m, dt) { update(dt); } });

  // умение в общем планировщике (sk.js): откат, очередь рядовых, ускорение по уровню сложности — общие
  const def = { ph: 'Крюк', col: '#ffb36a', cd: 11, first: 1.2, always: 1,
    can: (e, d) => d > 190 && d < cfg(e).range && !busy(e) && (P.heroT || 0) - last > 2.2 && !(S.pull) && !(S.pin > 0),
    cast(e) { start(e); } };
  for (const id of ['v_butcher', 'el_butcher']) { if (!DEF[id]) DEF[id] = []; else if (id === 'el_butcher' && DEF[id] === DEF.v_butcher) continue; DEF[id].unshift(def); }

  // ---------- рисование ----------
  { // прицел на земле (под персонажами)
    const _cg = combatGround;
    combatGround = function (t) {
      _cg(t);
      for (const h of L) {
        if (h.st !== 'aim') continue;
        const e = h.e, locked = h.t >= h.wind - h.lock, len = h.max;
        ctx.save(); ctx.translate(e.x, e.y); ctx.scale(1, YK); ctx.rotate(Math.atan2(h.dy, h.dx));
        ctx.globalAlpha = locked ? 0.42 + 0.2 * Math.sin(t * 30) : 0.16 + 0.1 * (h.t / h.wind);
        ctx.fillStyle = locked ? '#ff5a3a' : '#ffb36a'; ctx.fillRect(e.rad, -h.c.w / 2, len - e.rad, h.c.w);
        ctx.globalAlpha = locked ? 0.9 : 0.45; ctx.strokeStyle = locked ? '#ffd0b0' : '#ffb36a'; ctx.lineWidth = 3; ctx.strokeRect(e.rad, -h.c.w / 2, len - e.rad, h.c.w);
        ctx.restore();
      }
    };
  }
  function chain(x0, y0, x1, y1) {
    const im = IMG.chain; if (!ok(im)) return;
    const d = Math.hypot(x1 - x0, y1 - y0), th = 20, tw = im.naturalWidth * th / im.naturalHeight;
    ctx.save(); ctx.translate(x0, y0); ctx.rotate(Math.atan2(y1 - y0, x1 - x0));
    for (let x = 0; x < d; x += tw) { const w = Math.min(tw, d - x); ctx.drawImage(im, 0, 0, im.naturalWidth * w / tw, im.naturalHeight, x, -th / 2, w, th); }
    ctx.restore();
  }
  function head(x, y, ang) {
    const im = IMG.hook; if (!ok(im)) return;
    const w = 118, hgt = w * im.naturalHeight / im.naturalWidth;
    // в листе цепь входит слева сверху под углом около 32° — этим концом крюк садится на цепь
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang - 0.56); ctx.drawImage(im, -w * 0.05, -hgt * 0.12, w, hgt); ctx.restore();
  }
  {
    const _co = combatOver;
    combatOver = function (t) {
      _co(t);
      for (const h of L) {
        if (h.st === 'aim' || h.st === 'end') continue;
        const e = h.e, hy = hand(e);
        let tx, ty;
        if (h.st === 'pull') { tx = P.x; ty = P.y - CH * HS() * 0.5; }
        else { tx = e.x + h.dx * h.len; ty = e.y + h.dy * h.len * YK - hy; }
        const x0 = e.x + h.dx * e.rad, y0 = e.y + h.dy * e.rad * YK - hy, ang = Math.atan2(ty - y0, tx - x0), d = Math.hypot(tx - x0, ty - y0);
        const cl = Math.max(0, d - 80);                         // цепь — до крюка, голова крюка — последние 60 с лишним пикселей
        chain(x0, y0, x0 + Math.cos(ang) * cl, y0 + Math.sin(ang) * cl);
        head(x0 + Math.cos(ang) * cl, y0 + Math.sin(ang) * cl, ang);
      }
      for (const x of HITS) {
        const im = IMG['impact_' + Math.min(3, Math.floor(x.t / 0.065))]; if (!ok(im)) continue;
        const s = 230; ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(im, x.x - s / 2, x.y - CH * HS() * 0.5 - s / 2, s, s); ctx.restore();
      }
    };
  }
  return { L, CFG, HITS, start };
})();
