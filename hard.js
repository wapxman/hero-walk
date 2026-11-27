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
    updateEnemy = function (e, dt) { e.hStamp = stamp; if ((e.boss || (e.mini && LVN() >= 5)) && !off()) bossKit(e, dt); if (e.boss && !off()) bossAllies(e, dt); if ((e.boss || e.mini) && !off()) reinforce(e, dt); return _ue(e, dt); };
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
  // ---------- 4. боссы зовут союзников (v120, просьба Создателя 25.11) ----------
  // Каждый босс мира по ходу боя призывает рядовых своего мира — каждый раз случайных и РАЗНЫХ видов. Первый призыв через 10 с боя,
  // дальше раз в 17 с (ниже 40 % здоровья — раз в 13 с; уровень врагов сокращает паузу, как у всех приёмов). За раз — двое
  // (ниже 40 % здоровья — трое; в мягком мире 1 — один). Не больше шести союзников на арене разом: пока их шесть — призыва нет.
  // Прежний призыв трёх одинаковых (combat.js: bossSkills) у боссов этим заменён. Горн-Голем (мир 5) зовёт своей «Закалкой» — ему
  // общий призыв не добавлен.
  // v124 (Создатель 27.11): подкрепления не бесконечные. За один бой к мини-боссу приходит не больше 5 добавочных групп, к боссу — не больше 8;
  // в счёт идут и четвёрки из входов арены (п. 5), и призыв самого босса (п. 4), и «Закалка» Горн-Голема (sk_defs.js). Дальше остаётся добить.
  const GRP = { mini: 5, boss: 8 };
  const grpLeft = e => (e.boss ? GRP.boss : GRP.mini) - (e.grpN || 0);
  function grp(e) { if (grpLeft(e) <= 0) return false; e.grpN = (e.grpN || 0) + 1; return true; }
  const ALLY = { first: 10, gap: 17, gapLow: 13, n: 2, nLow: 3, max: 6, paid: 2, skip: { b_forgegolem: 1, tb_forgegolem: 1 } };
  function bossAllies(e, dt) {
    e.summonCd = 1e9;                                         // старый призыв трёх одинаковых — выключен
    if (!live(e) || ALLY.skip[e.type] || e.clone || grpLeft(e) <= 0) return;
    e.hSum = (e.hSum == null ? ALLY.first : e.hSum) - dt * (typeof LEVEL !== 'undefined' ? 1 / LEVEL.K().cd : 1);
    if (e.hSum > 0 || e.kb || e.root > 0 || P.dead > 0) return;
    // босс занят своим умением — ждём, но не дольше 6 с: потом союзники приходят и без его взмаха (иначе занятой босс не звал бы никого)
    const busy = !!(e.act || e.leap || e.skMove || e.skBusy > 0 || e.silT > 0);
    if (busy && e.hSum > -6) return;
    const allies = enemies.filter(x => x !== e && live(x) && x.ally).length;      // считаем только призванных им самим: подкрепления (п. 5) призыву не мешают
    if (allies >= ALLY.max) { e.hSum = 3; return; }
    const a = at(), soft = a.M === 1 && a.C === 1 && LVN() < 3, low = e.hp < e.max * 0.4;
    const R0 = rosterOf(Math.max(1, wave)), kinds = [...new Set(R0.mel.concat(R0.rng))].filter(t => KIND[t] && !KIND[t].boss);
    for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
    const n = Math.min(soft ? 1 : low ? ALLY.nLow : ALLY.n, ALLY.max - allies, kinds.length);
    e.hSum = (low ? ALLY.gapLow : ALLY.gap) * T.gap; D.casts.allies = (D.casts.allies || 0) + 1; e.hSumN = (e.hSumN || 0) + 1; grp(e);
    tag(e, 'Ко мне!', '#ffb36a');
    const call = () => {
      if (!live(e)) return;
      kinds.slice(0, n).forEach((t, i) => {
        spawnEnemy(t); const m = enemies[enemies.length - 1], ang = Math.atan2(P.y - e.y, P.x - e.x) + (i - (n - 1) / 2) * 1.2 + rnd(-0.2, 0.2);
        m.x = e.x + Math.cos(ang) * 150; m.y = e.y + Math.sin(ang) * 150 * YK; collide(m); m.ally = 1;
        if (e.hSumN > ALLY.paid) { m.noLoot = 1; m.k = Object.create(m.k); m.k.xp = 0.001; }      // v121: награда — за первые призывы; затяжной бой с боссом не должен качать героя сверх модели
        fx.push({ type: 'quake', x: m.x, y: m.y, t: 0, dur: 0.6, R: 60 });
      });
      snd('boss_roar', 0.8, 1.12);
    };
    if (busy) call(); else startAct(e, 'cast', 1.0, 0.55, call);
  }
  // ---------- 5. подкрепления (v121, просьба Создателя 25.11) ----------
  // Пока жив мини-босс или босс, на арену выходят четвёрки рядовых этого мира — из входов арены, как в обычной волне (по одному
  // с паузой около секунды). Первая четвёрка — через 8 с после его появления; следующая — когда от прежних осталось двое или
  // меньше, но не чаще раза в 12 с; на арене не больше восьми рядовых разом. Убит мини-босс или босс — новых четвёрок нет, а те,
  // кто ещё не вышел, не выходят. У боссов это добавляется к призыву по двое (bossAllies).
  // Чтобы на этом нельзя было бесконечно копить золото и опыт: награда идёт только за первую четвёрку (монеты; опыта подкрепления не дают совсем), дальше враги выходят без неё.
  // (Автопрогон: с наградой за две четвёрки герой в мире 1 набирал 22-й уровень вместо 18-го по модели.)
  const RF = { first: 8, gap: 12, n: 4, left: 2, max: 8, paid: 1, step: [0.7, 1.3] };
  const rfQ = [];      // кто ждёт выхода: { type, by, t, paid }
  function reinforce(e, dt) {
    if (!live(e) || e.clone || grpLeft(e) <= 0) return;
    e.rfT = (e.rfT == null ? RF.first : e.rfT) - dt;
    if (e.rfT > 0 || rfQ.some(q => q.by === e)) return;
    const small = enemies.filter(x => live(x) && !x.boss && !x.mini).length;
    if (small > RF.left) return;
    const R0 = rosterOf(Math.max(1, wave)), kinds = R0.mel.concat(R0.rng).filter(t => KIND[t] && !KIND[t].boss);
    if (!kinds.length) return;
    e.rfN = (e.rfN || 0) + 1; grp(e); e.rfT = RF.gap; D.casts.reinforce = (D.casts.reinforce || 0) + 1;
    let t = 0.2; for (let i = 0; i < RF.n; i++) { rfQ.push({ type: kinds[Math.floor(Math.random() * kinds.length)], by: e, t, paid: e.rfN <= RF.paid }); t += rnd(RF.step[0], RF.step[1]); }
    if (typeof needChar === 'function') for (const q of rfQ) if (KIND[q.type]) needChar(CHARS[KIND[q.type].ch]);
  }
  function rfTick(dt) {
    if (!rfQ.length) return;
    if (off()) { rfQ.length = 0; return; }
    for (let i = rfQ.length - 1; i >= 0; i--) {
      const q = rfQ[i];
      if (!live(q.by)) { rfQ.splice(i, 1); continue; }                      // хозяин убит — остальные не выходят
      if ((q.t -= dt) > 0) continue;
      if (enemies.filter(x => live(x) && !x.boss && !x.mini).length >= RF.max) { q.t = 0.5; continue; }
      rfQ.splice(i, 1);
      const sp = pickSpawn(); spawnEnemy(q.type); const m = enemies[enemies.length - 1];
      m.x = sp.x + rnd(-70, 70); m.y = sp.y + rnd(-40, 40); collide(m); m.reinf = 1;
      m.k = Object.create(m.k); m.k.xp = 0.001; if (!q.paid) m.noLoot = 1;
    }
  }
  { const _cu2 = combatUpdate; combatUpdate = function (dt) { _cu2(dt); rfTick(dt); };
    if (typeof SHOP !== 'undefined') { const _ok = SHOP.onKill; SHOP.onKill = function (e) { if (e && e.noLoot) return; return _ok.apply(this, arguments); }; } }
  return { D, T, KIT, ALLY, RF, GRP, grp, grpLeft, rfQ, spdK };
})();
