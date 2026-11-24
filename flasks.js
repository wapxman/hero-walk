// Склянки пьются сами (v120, просьба Создателя 25.11). Все, кроме лечения — оно, как и раньше, только вручную.
//   скорость — здоровья меньше 30 %;
//   сила     — здоровья больше 70 %, а рядом босс, мини-босс или четверо и больше врагов;
//   холод    — трое и больше врагов вплотную и хотя бы одно умение на перезарядке (склянка сбрасывает перезарядку);
//   мана     — маны меньше 25 %.
// Пока склянка действует, вторая такая же не тратится; между любыми двумя склянками — не меньше 0,6 с, между двумя склянками
// холода — не меньше 8 с. Только в бою, вне сети и не в Междумирье. Рукой их по-прежнему можно выпить когда угодно.
'use strict';
const AUTOFLASK = (() => {
  const CFG = { swiftHp: 0.3, powerHp: 0.7, powerR: 600, powerN: 4, frostR: 160, frostN: 3, manaMp: 0.25, gap: 0.6, frostGap: 8 };
  let acc = 0, wait = 0, frostWait = 0;
  const log = [];      // что выпито само: для проверок
  const near = R => { let n = 0; for (const e of enemies) if (e.hp > 0 && e.dieT == null && gdist(P, e) < R) n++; return n; };
  const bigNear = R => enemies.some(e => e.hp > 0 && e.dieT == null && (e.boss || e.mini) && gdist(P, e) < R);
  function pick() {
    const F = SHOP.flasks, hp = P.hp / P.maxHp;
    if (F.swift > 0 && !(SHOP.buffs.swift > 0) && hp < CFG.swiftHp) return 'swift';
    if (F.mana > 0 && P.mp < CFG.manaMp * P.maxMp) return 'mana';
    if (F.frost > 0 && frostWait <= 0 && near(CFG.frostR) >= CFG.frostN && ['q', 'e', 'f', 'r'].some(k => P.cd[k] > 1)) return 'frost';
    if (F.power > 0 && !(SHOP.buffs.power > 0) && hp > CFG.powerHp && (bigNear(CFG.powerR) || near(CFG.powerR) >= CFG.powerN)) return 'power';
    return null;
  }
  const _t = SHOP.tick;
  SHOP.tick = function (dt) {
    _t.call(this, dt);
    if (wait > 0) wait -= dt; if (frostWait > 0) frostWait -= dt;
    if ((acc += dt) < 0.2) return; acc = 0;
    if (SHOP.phase !== 'fight' || P.dead > 0 || SHOP.paused || wait > 0 || (window.NETC && NETC.on) || (typeof LIMBO !== 'undefined' && LIMBO.on)) return;
    const id = pick(); if (!id) return;
    const n0 = SHOP.flasks[id]; SHOP.use(id);
    if (SHOP.flasks[id] < n0) { wait = CFG.gap; if (id === 'frost') frostWait = CFG.frostGap; log.push(id); if (log.length > 50) log.shift(); }
  };
  return { CFG, pick, log };
})();
