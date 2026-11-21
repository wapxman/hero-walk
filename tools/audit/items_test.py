"""Проверка предметов: каждый кладём в сумку один, создаём условие, смотрим эффект и что он виден (значок в ряду / вспышка)."""
import asyncio, json, sys
from playwright.async_api import async_playwright
JS = r"""
async () => {
  const R = {}; const rnd0 = Math.random;
  const step = (n, dt) => { for (let i = 0; i < (n || 1); i++) combatUpdate(dt || 0.05); };
  const reset = () => { for (const e of enemies) e.hp = 0; enemies.length = 0; shots.length = 0; ROUND.queue.length = 0; ROUND.endW = wave = 25; ROUND.fin = null; SHOP.phase = 'fight';
    P.dead = 0; STATUS.clear(); ITEMFX.purge(); for (const k in RCD) RCD[k] = 0; const T = ITEMFX.T; for (const k of ['bkb','aeon','manta','storm','unholy','ward','rite','linkenF','lotusF']) T[k] = 0; T.calm = 0; T.dash = null; T.src = null;
    P.x = HERO_SPAWN.x; P.y = HERO_SPAWN.y; P.cd = Object.assign(P.cd, { q: 0, e: 0, f: 0, r: 0 }); P.ult = 0; };
  const bag = ids => { SHOP.bag = ids.slice(); SHOP.recompute(); P.hp = P.maxHp; P.mp = P.maxMp; };
  const foe = (type, d, o) => { spawnEnemyBase(type); const e = enemies[enemies.length - 1]; e.x = P.x + d; e.y = P.y + (o && o.dy || 0); e.speed = 0; e.atkCd = 1e9; e.skBusy = 1e9; e.sk = []; e.hp = e.max = 1e7; if (o) Object.assign(e, o); return e; };
  const row = () => HSTAT.list();
  const T = ITEMFX.T;
  const tests = {
    // ----- характеристики: у каждой вещи статы должны дойти до героя -----
    __stats() { const bad = []; for (const id in ALL) { const it = ALL[id]; if (it.rcp) continue; bag([]); const a = { hp: P.maxHp, mp: P.maxMp, dmg: P.dmgMul, sk: P.skMul, arm: P.armMul, cd: P.cdMul, spd: P.spdMul, as: P.atkSpd, ls: P.ls, crit: P.crit, hpr: P.hpRegX, mpr: P.mpRegen };
        bag([id]); const b = { hp: P.maxHp, mp: P.maxMp, dmg: P.dmgMul, sk: P.skMul, arm: P.armMul, cd: P.cdMul, spd: P.spdMul, as: P.atkSpd, ls: P.ls, crit: P.crit, hpr: P.hpRegX, mpr: P.mpRegen };
        for (const k in it.st) { const up = k === 'arm' || k === 'cd' ? b[k] < a[k] : b[k] > a[k]; if (!up) bad.push(id + ':' + k); } }
      return { ok: !bad.length, info: bad.length ? 'не дошли: ' + bad.join(', ') : 'статы всех ' + Object.keys(ALL).filter(i => !ALL[i].rcp).length + ' вещей доходят до героя' }; },
    blink() { bag(['blink']); foe('porcelainmaid', 100); foe('porcelainmaid', -100); P.hp = P.maxHp * 0.3; const x0 = P.x, y0 = P.y; step(2); const d = Math.hypot(P.x - x0, P.y - y0); return { ok: d > 200 && RCD.blink > 0, info: 'перенос на ' + Math.round(d) }; },
    medallion() { bag(['medallion']); const e = foe('el_butcher', 300); step(2); return { ok: e.medT > 0 && RCD.medallion > 0, info: 'храбрость на элите ' + (e.medT || 0).toFixed(1) + ' с, +' + Math.round((e.medA || 0) * 100) + ' % урона' }; },
    midas() { bag(['midas']); const e = foe('porcelainmaid', 300, { hp: 500, max: 500 }); const g = SHOP.gold; step(2); return { ok: e.hp <= 0 && SHOP.gold > g, info: 'враг убит, золото +' + (SHOP.gold - g) }; },
    basher() { bag(['basher']); const e = foe('porcelainmaid', 300); Math.random = () => 0; HIT.atk = true; hurtEnemy(e, 10); HIT.atk = false; Math.random = rnd0; return { ok: e.stunT > 0, info: 'оглушение ' + (e.stunT || 0).toFixed(1) + ' с' }; },
    maelstrom() { bag(['maelstrom']); const a = foe('porcelainmaid', 300), b = foe('porcelainmaid', 400), hb = b.hp; Math.random = () => 0; HIT.atk = true; hurtEnemy(a, 10); HIT.atk = false; Math.random = rnd0; return { ok: b.hp < hb && ITEMFX.ZAPS.length > 0, info: 'молния задела соседа: −' + Math.round(hb - b.hp) }; },
    mekansm() { bag(['mekansm']); P.hp = P.maxHp * 0.3; const h = P.hp; step(2); return { ok: P.hp > h + 100 && RCD.mekansm > 0, info: 'лечение +' + Math.round(P.hp - h) }; },
    force() { bag(['force']); foe('porcelainmaid', 100); P.hp = P.maxHp * 0.4; const x0 = P.x, y0 = P.y; step(8); const d = Math.hypot(P.x - x0, P.y - y0); return { ok: d > 200, info: 'толчок на ' + Math.round(d) }; },
    desolator() { bag(['desolator']); const e = foe('porcelainmaid', 300); HIT.atk = true; hurtEnemy(e, 10); HIT.atk = false; const h = e.hp; hurtEnemy(e, 100); const d1 = h - e.hp; return { ok: e.corT > 0 && d1 > 100 * P.dmgMul * 1.1, info: 'порча ' + e.corT.toFixed(0) + ' с, удар 100 → ' + Math.round(d1 / P.dmgMul) }; },
    aeon() { bag(['aeon']); foe('porcelainmaid', 300); hurtPlayer(P.maxHp * 0.75); const h = P.hp; step(1); hurtPlayer(9999); step(1); return { ok: T.aeon > 0 && P.hp >= h && row().includes('it_aeon'), info: 'неуязвимость ' + T.aeon.toFixed(1) + ' с, удар 9999 не прошёл; значок: ' + row().includes('it_aeon') }; },
    bkb() { bag(['bkb']); foe('porcelainmaid', 300); STATUS.add('stun', 3); step(2); const h = P.hp; hurtPlayer(100); const took = h - P.hp; return { ok: T.bkb > 0 && !(P.ss.stun > 0) && took < 100 * P.armMul * 0.8 && row().includes('it_bkb') && RCD.bkb <= 30, info: 'Аватар ' + T.bkb.toFixed(1) + ' с, оглушение снято, удар 100 → ' + Math.round(took) + ', перезарядка ' + Math.round(RCD.bkb) + ' с; значок: ' + row().includes('it_bkb') }; },
    linken() { bag(['linken']); foe('porcelainmaid', 300); STATUS.add('stun', 3); const g0 = ITEMFX.GLOWS.length; step(1); const cleared = !(P.ss.stun > 0); STATUS.add('freeze', 2); step(1); return { ok: cleared && RCD.linken > 0 && row().includes('it_linken') && ITEMFX.GLOWS.length > g0 && !(P.ss.freeze > 0), info: 'оглушение снято, вспышка вокруг героя: ' + (ITEMFX.GLOWS.length > g0) + ', значок: ' + row().includes('it_linken') + ', 0,5 с защиты: ' + !(P.ss.freeze > 0) }; },
    linken_second() { bag(['linken']); foe('porcelainmaid', 300); STATUS.add('stun', 3); step(1); step(20); STATUS.add('stun', 3); step(1); return { ok: P.ss.stun > 0, info: 'второе состояние в пределах 15 с остаётся (как и задумано): ' + (P.ss.stun > 0) }; },
    abyssal() { bag(['abyssal']); const e = foe('el_butcher', 300), h = e.hp; step(2); return { ok: e.hp < h && e.stunT > 0, info: 'Пролом: −' + Math.round(h - e.hp) + ', оглушение ' + (e.stunT || 0).toFixed(1) + ' с' }; },
    manta() { bag(['manta']); const e = foe('porcelainmaid', 300); STATUS.add('silence', 3); step(2); const n0 = shots.length; P.atkCd = 0; shoot(); const n = shots.length - n0; return { ok: T.manta > 0 && !(P.ss.silence > 0) && n === 3 && row().includes('it_manta'), info: 'безмолвие снято, выстрелов за раз: ' + n + ', значок: ' + row().includes('it_manta') }; },
    shiva() { bag(['shiva']); const L = [foe('porcelainmaid', 200), foe('porcelainmaid', -200), foe('porcelainmaid', 300, { dy: 100 })], h = L[0].hp; step(2); return { ok: L[0].hp < h && L[0].slowT > 0 && L[0].slowK <= 0.5 && RCD.shiva > 0, info: 'трое рядом → волна: −' + Math.round(h - L[0].hp) + ', замедление ×' + L[0].slowK }; },
    shiva_aura() { bag(['shiva']); RCD.shiva = 20; const e = foe('porcelainmaid', 300); step(2); return { ok: e.slowT > 0 && Math.abs(e.slowK - 0.85) < 0.01, info: 'аура: враг в 300 замедлен ×' + e.slowK }; },
    agh() { bag(['agh']); P.mp = P.maxMp = 9999; cast('r'); const t1 = P.ult; reset(); bag([]); P.mp = P.maxMp = 9999; cast('r'); const t0 = P.ult; return { ok: t1 > t0 + 1.5, info: 'Буря ' + t0.toFixed(1) + ' → ' + t1.toFixed(1) + ' с' }; },
    radiance() { bag(['radiance']); const e = foe('porcelainmaid', 200), h = e.hp; step(40); return { ok: e.hp < h, info: 'ожог за 2 с: −' + Math.round(h - e.hp) }; },
    vajra() { bag(['vajra']); const L = [1, 2, 3, 4].map(i => foe('porcelainmaid', 150 + i * 40)), h = L.reduce((s, e) => s + e.hp, 0); step(40); const d = h - L.reduce((s, e) => s + e.hp, 0); return { ok: d > 0 && (T.storm > 0 || RCD.vajra > 0) && row().includes('it_vajra'), info: 'Громовой щит: за 2 с −' + Math.round(d) + ', значок: ' + row().includes('it_vajra') }; },
    butterfly() { bag(['butterfly']); Math.random = () => 0; const a = ITEMFX.evade(); Math.random = () => 0.9; const b = ITEMFX.evade(); Math.random = rnd0; return { ok: a && !b, info: 'уклонение срабатывает по шансу 25 %' }; },
    tarrasque() { bag(['tarrasque']); P.hp = P.maxHp * 0.5; const h = P.hp; step(110); const a = P.hp; step(40); return { ok: P.hp > a && row().includes('it_tarrasque'), info: '5 с без урона → за 2 с +' + Math.round(P.hp - a) + ', значок: ' + row().includes('it_tarrasque') }; },
    octarine() { bag(['octarine']); const e = foe('porcelainmaid', 200); P.hp = P.maxHp * 0.5; const h = P.hp; P.mp = 9999; cast('q'); step(1); return { ok: P.hp > h, info: 'Кольцо стужи по врагу: +' + Math.round(P.hp - h) + ' здоровья' }; },
    satanic() { bag(['satanic']); foe('porcelainmaid', 300); P.hp = P.maxHp * 0.3; step(2); return { ok: T.unholy > 0 && row().includes('it_satanic'), info: 'Ярость ' + T.unholy.toFixed(1) + ' с, значок: ' + row().includes('it_satanic') }; },
    lotus() { bag(['lotus']); const e = foe('porcelainmaid', 300); ITEMFX.T.src = { e, at: performance.now() / 1000 }; STATUS.add('stun', 3); step(2); return { ok: !(P.ss.stun > 0) && e.stunT > 2.5 && RCD.lotus > 0 && row().includes('it_lotus'), info: 'оглушение снято и вернулось злодею на ' + (e.stunT || 0).toFixed(1) + ' с, значок: ' + row().includes('it_lotus') }; },
    lotus_boss() { bag(['lotus']); const e = foe(ROSTER[1].boss, 400); ITEMFX.T.src = { e, at: performance.now() / 1000 }; STATUS.add('silence', 4); step(1); return { ok: !(P.ss.silence > 0) && Math.abs(e.silT - 2) < 0.2, info: 'боссу безмолвие вернулось на половину: ' + (e.silT || 0).toFixed(1) + ' с из 4' }; },
    lotus_real() { bag(['lotus']); const e = foe('v_koboldtrapper', 250); e.skBusy = 0; e.sk = null; let got = false; for (let i = 0; i < 400 && !got; i++) { step(1); if (RCD.lotus > 0) got = true; } return { ok: got && e.stunT > 0, info: 'настоящая сеть кобольда: снята и возвращена ему (' + (e.stunT || 0).toFixed(1) + ' с)' }; },
    lotus_zone() { bag(['lotus']); STATUS.add('freeze', 2); step(1); return { ok: !(P.ss.freeze > 0) && RCD.lotus > 0, info: 'состояние без хозяина просто снимается' }; },
    bloodstone() { bag(['bloodstone']); const e = foe('porcelainmaid', 200); P.hp = P.maxHp * 0.4; step(2); const on = T.rite > 0, ic = row().includes('it_bloodstone'); const h = P.hp; P.mp = 9999; cast('q'); const g1 = P.hp - h;
      T.rite = 0; P.hp = h; P.cd.q = 0; cast('q'); const g0 = P.hp - h; return { ok: on && ic && g1 > g0 * 1.7 && g0 > 0, info: 'обряд включился, значок: ' + ic + '; Кольцо стужи лечит ' + Math.round(g0) + ' → в обряд ' + Math.round(g1) }; },
  };
  // предметы против боссов: срабатывают по таймеру, когда есть что снимать
  const REL = {
    pierce_crystal: () => { step(110); return P.pierce === true; },
    eye_clarity: () => { P.ss.blind = 5; step(130); return !(P.ss.blind > 0) && P.ss.noMiss > 0; },
    wind_boots: () => { step(110); slowHero(0.3, 5); step(2); return !(P.slowT > 0) || P.slowK >= 1; },
    antidote_amulet: () => { step(130); STATUS.add('poison', 3); step(2); return P.ss.poison.n === 0; },
    mithril_cuirass: () => { step(170); return P.ss.rshield > 0; },
    flame_heart: () => { step(130); STATUS.add('freeze', 3); step(2); return !(P.ss.freeze > 0); },
    salamander_cloak: () => { step(130); STATUS.add('burn', 2); step(2); return P.ss.burn.n === 0; },
    voice_seal: () => { step(150); STATUS.add('silence', 3); step(2); return !(P.ss.silence > 0); },
    wanderer_anchor: () => { step(110); return P.ss.imm.pull > 0; },
  };
  for (const k in tests) { reset(); try { R[k] = tests[k](); } catch (x) { R[k] = { ok: false, info: 'ОШИБКА: ' + String(x && x.stack || x).slice(0, 200) }; } Math.random = rnd0; HIT.atk = false; }
  for (const k in REL) { reset(); bag([k]); try { R[k] = { ok: !!REL[k](), info: ALL[k].ds }; } catch (x) { R[k] = { ok: false, info: 'ОШИБКА: ' + String(x).slice(0, 200) }; } }
  reset(); bag([]); const acts = Object.keys(ALL).filter(id => !ALL[id].rcp && (ALL[id].act || ALL[id].pas || ALL[id].relic));
  R.__covered = { ok: true, info: 'вещей с эффектом: ' + acts.length + '; не покрыты проверкой: ' + (acts.filter(id => !R[id]).join(', ') || 'нет') };
  return R;
}
"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 960, 'height': 540}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)[:300])); pg.on('console', lambda m: errs.append(m.text[:200]) if m.type == 'error' else None)
        await pg.goto('http://127.0.0.1:8767/?mode=play&allworlds'); await pg.wait_for_timeout(3500)
        await pg.get_by_text('В БОЙ', exact=True).click(); await pg.wait_for_timeout(5000)
        r = await pg.evaluate(JS); bad = 0
        for k, v in r.items():
            if not v['ok']: bad += 1
            print('%-4s %-18s %s' % ('ok' if v['ok'] else 'НЕТ', k, v['info']))
        print('плохих:', bad, 'errors:', errs[:6])
        if len(sys.argv) > 1: json.dump(r, open(sys.argv[1], 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        await b.close()
asyncio.run(main())
