// Сложность (v115, по просьбе Создателя: «игра слишком лёгкая»). Три вещи, всё только вне старого серверного режима:
//   1. «Надзиратель»: в каждом раунде каждого мира кто-то из злодеев на арене раз в несколько секунд накладывает на героя
//      замедление, оковы, кольцо-ловушку или безмолвие. Кто именно — решается перед самым приёмом (ближайший свободный злодей):
//      под ним загорается кольцо, над ним имя приёма; убил его до конца замаха — приёма не будет. Первый приём раунда — всегда
//      замедление или оковы. Мир 1 мягче: метка на земле лежит дольше, сроки короче.
//   2. Боссы добираются до героя: у каждого два приёма из трёх (прыжок, притяжение, оковы) — срабатывают, когда героя
//      несколько секунд держат на расстоянии; пока герой далеко, босс ещё и бежит быстрее.
//   3. Скорость бега врагов растёт от раунда к раунду и от мира к миру (в мире 10 — примерно на треть выше, чем в мире 1).
// Картинок кодом нет: метка — общий лист предупреждения (warn), кольцо-ловушка — лист «Клетки шута»; кодом — только кольцо-подсветка.
// В полигоне автопрогона (window.NO_SOFT) выключено: там проверяются свои умения злодеев по одному.
'use strict';
const HARD = (() => {
  const S = P.sk;
  const offAll = () => !!(window.NETC && NETC.on) || !!window.HARD_OFF;
  const off = () => offAll() || !!window.NO_SOFT || (typeof LIMBO !== 'undefined' && LIMBO.on) || P.dead > 0 || SHOP.phase !== 'fight';
  const at = () => BAL.at(Math.max(1, wave));
  const live = e => e.hp > 0 && e.dieT == null;
  const LK = () => (typeof LEVEL !== 'undefined' ? LEVEL.K().cd : 1);      // v117: уровень сложности — приёмы чаще
  const T = { speed: 1, gap: 1, dur: 1, dmg: 1, hp: 1 };      // общие множители (для замеров и подстройки): ?hard=dmg:1.2,hp:0.9
  if (/[?&]hard=off/.test(location.search)) window.HARD_OFF = 1;      // как до v115 — для сравнения замеров
  { const m = /[?&]hard=([^&]+)/.exec(location.search); if (m) for (const kv of m[1].split(',')) { const [k, v] = kv.split(':'); if (k in T && +v > 0) T[k] = +v; } }

  // ---------- 3. скорость, а с ней урон и здоровье врагов (мир 1 на первом круге — почти как было) ----------
  const dmgK = e => { const a = at(), soft = a.M === 1 && a.C === 1; return (soft ? 1.1 : e.boss ? 1.4 + 0.1 * (a.M - 1) : 1.4 + 0.12 * (a.M - 1)) * T.dmg; };
  const hpK = e => { const a = at(), soft = a.M === 1 && a.C === 1; return (soft ? 1 : e.boss ? 1.3 : 1.1 + 0.04 * (a.M - 1)) * T.hp; };
  const spdK = () => { const a = at(); return (1.04 + 0.034 * (a.M - 1) + 0.025 * Math.floor((a.W - 1) / 3) + (a.C > 1 ? 0.08 : 0)) * T.speed; };
  {
    const _se = spawnEnemy;
    spawnEnemy = function () {
      const n = enemies.length, r = _se.apply(this, arguments);
      if (!offAll()) for (let i = n; i < enemies.length; i++) { const e = enemies[i]; if (e.clone) continue; e.speed *= spdK() * (e.boss ? 1.1 : 1); e.dm *= dmgK(e); e.hp = Math.round(e.hp * hpK(e)); e.max = e.hp; }
      return r;
    };
  }

  // ---------- 1. надзиратель ----------
  const NAME = { slow: 'Вязкая хватка', shackle: 'Оковы', ring: 'Кольцо', mute: 'Безмолвие' }, COL = { slow: '#8fd0ff', shackle: '#b9a0ff', ring: '#ffb060', mute: '#ff8fb0' };
  const seq = () => { const M = at().M; return M === 1 ? ['slow', 'shackle', 'slow', 'ring'] : M === 2 ? ['shackle', 'slow', 'ring', 'slow', 'mute'] : ['shackle', 'slow', 'mute', 'ring']; };
  const gap = () => { const a = at(), g = a.M === 1 ? 11 : a.M <= 3 ? 9 : a.M <= 6 ? 7.5 : 6.5; return (g - 0.5 * Math.floor((a.W - 1) / 3)) * T.gap * LK(); };
  const D = { t: 5, n: 0, pick: null, round: -1, casts: {} };
  const held = k => S.pin > 0 || S.bind > 0 || SK.RINGS.length > 0 || (k === 'mute' && P.ss.silence > 0) || P.ss.stun > 0 || P.ss.freeze > 0;
  function fire(k, e) {
    const a = at(), M = a.M, soft = M === 1 && a.C === 1 && LVN() < 3, dm = e.dm || 1, d = T.dur;
    D.casts[k] = (D.casts[k] || 0) + 1;
    if (k === 'slow') {
      if (soft) warn(P.x, P.y, 135, 1.15, 0, { onHitP: () => slowHero(0.6, 2.2 * d) });
      else { slowHero(Math.max(0.35, 0.55 - 0.02 * M), (2.6 + 0.1 * M) * d); SK.say2('замедлен', COL.slow); }
    } else if (k === 'shackle') {
      warn(P.x, P.y, 125, soft ? 1.2 : M <= 4 ? 0.8 : 0.65, soft ? 0 : 6 * dm, { onHitP: () => { if (P.dashI > 0) return; S.pin = Math.max(S.pin, (soft ? 1.0 : Math.min(2.4, 1.3 + 0.11 * M)) * d); SK.say2('оковы!', COL.shackle); } });
    } else if (k === 'ring') {
      SK.ring({ img: SK.F('jester', 'js_ring'), x: P.x, y: P.y, R: soft ? 195 : Math.max(140, 172 - 3 * M), dur: (soft ? 2.2 : 2.8 + 0.12 * M) * d, delay: soft ? 0.7 : 0.4 });
    } else if (k === 'mute') {
      warn(P.x, P.y, 125, M <= 5 ? 0.8 : 0.65, 0, { onHitP: () => { STATUS.add('silence', (2.4 + 0.16 * M) * d); } });
    }
  }
  // свои злодеи (в игре «Вместе» чужих ведёт напарник — у них updateEnemy не вызывается): отметка времени последнего обновления
  let stamp = 0;
  function director(dt) {
    stamp++;
    const a = at(), rnd0 = a.W >= 10 ? -1 : (a.M - 1) * 10 + Math.floor((a.W - 1) / 3) + (a.C - 1) * 100;
    if (rnd0 !== D.round) { D.round = rnd0; D.n = 0; D.t = Math.min(D.t, 5); D.pick = null; }     // новый раунд — начинаем с замедления или оков
    if (off() || a.W >= 10) { D.pick = null; return; }
    if (D.pick) {
      const p = D.pick, e = p.e; p.t += dt;
      if (!live(e) || e.root > 0 || e.silT > 0 || e.kb) { D.pick = null; D.t = 2.5; return; }     // убит или сбит до конца замаха — приёма нет
      if (p.t >= p.dur) { D.pick = null; fire(p.k, e); D.n++; D.t = gap(); }
      return;
    }
    if ((D.t -= dt) > 0) return;
    const L = seq(), k = L[D.n % L.length];
    if (held(k)) { D.t = 1.2; return; }
    let best = null, bd = 760;
    for (const e of enemies) { if (!live(e) || e.boss || e.clone || e.act || e.leap || e.kb || e.root > 0 || e.silT > 0 || e.skMove || e.hStamp !== stamp - 1) continue; const d = gdist(P, e); if (d < bd) { bd = d; best = e; } }
    if (!best) { D.t = 0.8; return; }
    const dur = a.M === 1 ? 1.25 : a.M <= 4 ? 1.0 : 0.85;
    D.pick = { e: best, k, t: 0, dur };
    tag(best, NAME[k] + '!', COL[k]);
    startAct(best, 'cast', dur + 0.15, 2, () => {});
  }
  {
    const _ue = updateEnemy;
    updateEnemy = function (e, dt) { e.hStamp = stamp; if ((e.boss || (e.mini && LVN() >= 5)) && !off()) bossKit(e, dt); return _ue(e, dt); };
    const _cu = combatUpdate; combatUpdate = function (dt) { _cu(dt); director(dt); };
    const _cg = combatGround;
    combatGround = function (t) {
      _cg(t);
      const p = D.pick; if (!p || !live(p.e)) return;
      const k = p.t / p.dur, R = (p.e.rad || 24) * 2.2 + 14 * Math.sin(t * 14);
      ctx.save(); ctx.translate(p.e.x, p.e.y); ctx.scale(1, YK); ctx.globalAlpha = 0.45 + 0.5 * k; ctx.strokeStyle = COL[p.k]; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.stroke(); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R * (1 - 0.6 * k), 0, 6.283); ctx.stroke(); ctx.restore();
    };
  }

  // ---------- 2. боссы добираются до героя ----------
  const KIT = { b_blackknight: ['leap', 'shackle'], b_plaguelord: ['pull', 'leap'], b_serpentqueen: ['pull', 'shackle'], b_toadking: ['shackle', 'leap'], b_forgegolem: ['pull', 'leap'],
    b_frostqueen: ['pull', 'shackle'], b_mirrorlord: ['shackle', 'leap'], b_ashlord: ['pull', 'leap'], b_skyjudge: ['shackle', 'leap'], b_voidmage: ['pull', 'shackle'] };
  const BN = { leap: 'Прыжок', pull: 'Притяжение', shackle: 'Оковы' }, KIT_MINI = ['leap', 'shackle'];      // v117: мини-боссы — с уровня 5
  function bossKit(e, dt) {
    let kit = KIT[e.type] || KIT[String(e.type).replace(/^tb_/, 'b_')] || (e.mini ? KIT_MINI : null); if (!kit || !live(e)) return;
    if (e.boss && LVN() >= 7) kit = kit.concat(['leap', 'pull', 'shackle'].filter(k => !kit.includes(k)));      // v117: с уровня 7 у босса все три приёма
    const a = at(), soft = a.M === 1 && a.C === 1 && LVN() < 3, d = gdist(P, e), far = d > 320;
    e.hFar = far ? (e.hFar || 0) + dt : Math.max(0, (e.hFar || 0) - dt * 2);
    e.hCd = (e.hCd == null ? 6 : e.hCd) - dt; e.hAll = (e.hAll == null ? 12 : e.hAll) - dt;
    // герой далеко дольше секунды — босс прибавляет ходу
    const rush = e.hFar > 1 || e.hRushT > 0; if (e.hRushT > 0) e.hRushT -= dt;
    if (rush && !e.hRush) { e.hRush = 1; e.speed *= 1.35; } else if (!rush && e.hRush) { e.hRush = 0; e.speed /= 1.35; }
    if (e.act || e.leap || e.kb || e.root > 0 || e.skMove || e.skBusy > 0 || e.untarget > 0 || e.hCd > 0 || d > 950) return;
    const need = soft ? 4.5 : e.phase >= 3 ? 2 : 3;
    if (e.hFar < need && e.hAll > 0) return;                 // держат на расстоянии — или просто давно не делал (раз в 12–14 с)
    let k = kit[(e.hN = (e.hN || 0) + 1) % kit.length]; if (soft) k = 'leap';
    if (k !== 'leap' && (S.pin > 0 || S.bind > 0 || S.pull)) k = 'leap';
    e.hCd = (soft ? 9 : e.phase >= 3 ? 5 : 7) * T.gap; e.hAll = 13; e.hFar = 0;
    D.casts['b_' + k] = (D.casts['b_' + k] || 0) + 1;
    tag(e, BN[k] + '!', '#ff9a6a');
    if (k === 'leap') { leapTo(e, P.x, P.y, soft ? 0.95 : 0.7, 130, (soft ? 22 : 30) * e.dm, 'leap'); }
    else if (k === 'pull') {
      startAct(e, 'cast', 0.9, 0.75, () => {
        if (P.dead > 0 || !live(e)) return;
        if (P.dashI > 0 || P.ss.imm.pull > 0 || gdist(P, e) > 950) { SK.say2('увернулся!', '#b9ffcf'); return; }
        const [dx, dy] = dirTo(e, P.x, P.y); S.pull = { x: e.x + dx * 125, y: e.y + dy * 125 * YK, t: 0.45 }; slowHero(0.55, 1.2);
      });
    } else {
      startAct(e, 'cast', 0.8, 0.5, () => { if (P.dead > 0) return; warn(P.x, P.y, 130, 0.7, 10 * e.dm, { onHitP: () => { if (P.dashI > 0) return; S.pin = Math.max(S.pin, 1.6 * T.dur); SK.say2('оковы!', COL.shackle); e.hRushT = 2.2; } }); });
    }
  }
  return { D, T, KIT, spdK };
})();
