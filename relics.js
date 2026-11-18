// Состояния героя и 10 предметов-ответов на боссов (ночь 19.11, DESIGN.md п.3–4).
// Состояния (их накладывают боссы): яд и горение — стаки урона в секунду (% здоровья), пока отравлен — лечение вдвое
// слабее; холод — стаки замедления, на 5-м заморозка; заморозка и оглушение — ни шагу, ни удара, ни умения; безмолвие —
// без умений; снятие брони — стаки, входящий урон больше; дым — умения промахиваются; притяжение и телепорт — у боссов.
// Предметы-ответы срабатывают САМИ по таймеру (кольцо перезарядки на ячейке, вспышка и звук), игрок ничего не нажимает.
// Иконки — Клауди (ui/relics/). Цена — примерно 3 попытки мира этого босса (расчёт дохода — BALANCE.md).
'use strict';
const ST = P.ss = { poison: { n: 0, t: 0 }, burn: { n: 0, t: 0 }, cold: { n: 0, t: 0 }, shred: { n: 0, t: 0 },
  freeze: 0, stun: 0, silence: 0, blind: 0, imm: { freeze: 0, burn: 0, sil: 0, pull: 0 }, rshield: 0, rshT: 0, noMiss: 0, spd: 0 };
const STATUS = {
  // наложить состояние: kind — poison | burn | cold | shred (стаки), freeze | stun | silence | blind (секунды)
  add(kind, v, t) {
    if (P.dead > 0) return;
    const S = P.ss;
    if (kind === 'poison' || kind === 'burn' || kind === 'cold' || kind === 'shred') {
      if (kind === 'burn' && S.imm.burn > 0) return;
      if (kind === 'cold' && S.imm.freeze > 0) return;
      const max = { poison: 5, burn: 4, cold: 5, shred: 4 }[kind], s = S[kind];
      s.n = Math.min(max, s.n + (v || 1)); s.t = t || { poison: 5, burn: 4, cold: 4, shred: 8 }[kind];
      if (kind === 'cold' && s.n >= 5) { s.n = 0; STATUS.add('freeze', 2); }
      return;
    }
    if (kind === 'freeze' && S.imm.freeze > 0) return;
    if ((kind === 'silence' || kind === 'stun') && S.imm.sil > 0) return;
    S[kind] = Math.max(S[kind], v);
    const T = { freeze: ['Заморожен!', '#9fd8ff'], stun: ['Оглушён!', '#ffe27a'], silence: ['Безмолвие!', '#c9a8ff'], blind: ['Дым — умения мажут', '#c0c0c0'] }[kind];
    if (T) say(P.x, P.y - CH * HS() * 1.25, T[0], T[1]);
  },
  locked: () => P.ss.freeze > 0 || P.ss.stun > 0,                 // ни шагу, ни удара
  mute: () => P.ss.freeze > 0 || P.ss.stun > 0 || P.ss.silence > 0, // без умений
  clear() { const S = P.ss; for (const k of ['poison', 'burn', 'cold', 'shred']) S[k].n = 0; S.freeze = S.stun = S.silence = S.blind = 0; S.rshield = 0; },
};

// ---------- 10 предметов-ответов ----------
// cd — таймер, need — срабатывает, только когда есть что снимать (иначе ждёт готовым), fire — эффект
const RELICS = {
  pierce_crystal: { nm: 'Кристалл Пронзания', pr: 5000, st: { sk: 0.1 }, cd: 5, boss: 'Чёрный Рыцарь',
    ds: 'раз в 5 с следующее умение пробивает щиты и не отражается',
    fire: () => { P.pierce = true; } },
  eye_clarity: { nm: 'Око Ясности', pr: 6200, st: {}, cd: 6, boss: 'Чумной Мародёр',
    ds: 'раз в 6 с разгоняет дым вокруг героя, 2 с умения не промахиваются',
    fire: () => { P.ss.blind = 0; P.ss.noMiss = 2; if (typeof SMOKE !== 'undefined') SMOKE.clearNear(P.x, P.y, 320); } },
  wind_boots: { nm: 'Сапоги Ветра', pr: 8300, st: { spd: 0.08 }, cd: 5, boss: 'Королева Змей',
    ds: 'раз в 5 с снимают замедления и корни, +40 % к бегу на 2 с',
    need: () => P.slowT > 0 || P.ss.cold.n > 0, fire: () => { P.slowT = 0; P.slowK = 1; P.ss.cold.n = 0; P.ss.spd = Math.max(P.ss.spd, 2); } },
  antidote_amulet: { nm: 'Амулет Противоядия', pr: 10500, st: {}, cd: 6, boss: 'Король-Жаб', res: { poison: 0.5 },
    ds: '−50 % урона от яда; раз в 6 с очищает яд и лечит 4 % здоровья',
    need: () => P.ss.poison.n > 0, fire: () => { P.ss.poison.n = 0; P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.04); } },
  mithril_cuirass: { nm: 'Мифриловая кираса', pr: 12000, st: { arm: 0.1 }, cd: 8, boss: 'Горн-Голем',
    ds: 'броня не падает ниже 75 %; раз в 8 с щит на 12 % здоровья (3 с)',
    fire: () => { P.ss.rshield = P.maxHp * 0.12; P.ss.rshT = 3; } },
  flame_heart: { nm: 'Сердце Пламени', pr: 13500, st: {}, cd: 6, boss: 'Королева Вьюги',
    ds: 'раз в 6 с снимает холод и заморозку, 1,5 с иммунитета к заморозке',
    need: () => P.ss.cold.n > 0 || P.ss.freeze > 0, fire: () => { P.ss.cold.n = 0; P.ss.freeze = 0; P.ss.imm.freeze = 1.5; } },
  empty_vessel: { nm: 'Пустой Сосуд', pr: 6000, st: {}, cd: 0, boss: 'Зеркальный Лорд',
    ds: 'своих свойств нет; копия Зеркального Лорда копирует только его и выходит пустой' },
  salamander_cloak: { nm: 'Плащ Саламандры', pr: 18300, st: {}, cd: 6, boss: 'Владыка Пепла', res: { fire: 0.4, burn: 0.4 },
    ds: '−40 % урона от огня; раз в 6 с гасит горение, 2 с иммунитета к поджогу',
    need: () => P.ss.burn.n > 0, fire: () => { P.ss.burn.n = 0; P.ss.imm.burn = 2; } },
  voice_seal: { nm: 'Печать Голоса', pr: 22500, st: {}, cd: 7, boss: 'Небесный Судья',
    ds: 'раз в 7 с снимает безмолвие и оглушение, 1 с иммунитета',
    need: () => P.ss.silence > 0 || P.ss.stun > 0, fire: () => { P.ss.silence = 0; P.ss.stun = 0; P.ss.imm.sil = 1; } },
  wanderer_anchor: { nm: 'Якорь Странника', pr: 22000, st: {}, cd: 5, boss: 'Архимаг Бездны',
    ds: 'раз в 5 с: 2 с иммунитета к притяжению и телепорту, +30 % к бегу',
    fire: () => { P.ss.imm.pull = 2; P.ss.spd = Math.max(P.ss.spd, 2); } },
};
for (const id in RELICS) { const r = RELICS[id]; r.img = 'ui/relics/' + id + '.webp'; r.relic = true; ALL[id] = r; (new Image()).src = r.img + V; }   // иконки — заранее
const hasRelic = id => SHOP.bag.includes(id);
const relicRes = k => { let m = 1; for (const id of SHOP.bag) { const r = RELICS[id]; if (r && r.res && r.res[k]) m *= 1 - r.res[k]; } return m; };
const RCD = {};   // перезарядка предметов, сек.

// ---------- урон по герою: яд, огонь, снятие брони, щит кирасы ----------
const _hurtPlayerS = hurtPlayer;
hurtPlayer = function (d, kind) {
  if (P.dead > 0) return;
  const S = P.ss;
  if (kind) d *= relicRes(kind);
  // снятие брони: каждый стак +15 % входящего урона (кираса оставляет не меньше 75 % брони: максимум +15 %)
  if (S.shred.n) d *= 1 + Math.min(S.shred.n * 0.15, hasRelic('mithril_cuirass') ? 0.15 : 0.6);
  if (S.rshield > 0) { const a = Math.min(S.rshield, d); S.rshield -= a; d -= a; if (d <= 0) { say(P.x, P.y - CH * HS(), 'щит', '#bfe6ff'); return; } }
  _hurtPlayerS(d);
};
// ---------- умения и удары под состояниями ----------
const _castS = cast;
cast = function (id) {
  if (STATUS.mute()) { if (!P.muteSaid || performance.now() - P.muteSaid > 900) { say(P.x, P.y - CH * HS(), P.ss.silence > 0 ? 'безмолвие' : 'не двинуться', '#c9a8ff'); P.muteSaid = performance.now(); } return; }
  // дым: умение срывается с шансом 50 % (Око Ясности даёт 2 с без промахов)
  if (P.ss.blind > 0 && !(P.ss.noMiss > 0) && Math.random() < 0.5 && P.cd[id] <= 0 && P.mp >= MANA[id]) {
    P.cd[id] = 1.2; say(P.x, P.y - CH * HS(), 'промах в дыму', '#c0c0c0'); return;
  }
  _castS(id);
};
const _shootS = shoot;
shoot = function () { if (STATUS.locked()) return; _shootS(); };

// ---------- тик: стаки, урон по времени, лечение под ядом, таймеры предметов ----------
let relLastHp = null;
function statusTick(dt) {
  const S = P.ss;
  if (P.dead > 0 || (typeof LIMBO !== 'undefined' && LIMBO.on)) { STATUS.clear(); relLastHp = null; return; }
  // под ядом лечение вдвое слабее: всё, что прибавилось к здоровью с прошлого кадра, срезаем наполовину
  if (relLastHp != null && S.poison.n > 0 && P.hp > relLastHp) P.hp = relLastHp + (P.hp - relLastHp) * 0.5;
  for (const k of ['poison', 'burn', 'cold', 'shred']) { const s = S[k]; if (s.n > 0 && (s.t -= dt) <= 0) s.n = 0; }
  for (const k of ['freeze', 'stun', 'silence', 'blind', 'noMiss', 'spd', 'rshT']) if (S[k] > 0) S[k] = Math.max(0, S[k] - dt);
  if (S.rshT <= 0) S.rshield = 0;
  for (const k in S.imm) if (S.imm[k] > 0) S.imm[k] -= dt;
  S.tick = (S.tick || 0) + dt;
  if (S.tick >= 0.5) {
    const k = S.tick; S.tick = 0;
    if (S.poison.n) hurtPlayer(P.maxHp * 0.015 * S.poison.n * k, 'poison');
    if (S.burn.n) hurtPlayer(P.maxHp * 0.02 * S.burn.n * k, 'burn');
  }
  if (S.cold.n) { P.slowK = Math.min(P.slowT > 0 ? P.slowK : 1, 1 - 0.15 * S.cold.n); P.slowT = Math.max(P.slowT || 0, 0.2); }
  // предметы-ответы
  for (const id of SHOP.bag) {
    const r = RELICS[id]; if (!r || !r.cd) continue;
    RCD[id] = Math.max(0, (RCD[id] == null ? r.cd : RCD[id]) - dt);
    if (RCD[id] > 0 || (r.need && !r.need())) continue;
    RCD[id] = r.cd; r.fire();
    relicFlash(id); snd('coins', 0.25, 1.6);
  }
  relLastHp = P.hp;
}
// ---------- бег: Сапоги Ветра и Якорь дают рывок скорости ----------
const _recomputeS = SHOP.recompute;
SHOP.recompute = function () { _recomputeS(); P.spdBase = P.spdMul; };
function relicSpeed() { if (P.spdBase == null) P.spdBase = P.spdMul; const k = P.ss.spd > 0 ? (hasRelic('wind_boots') ? 1.4 : 1.3) : 1; P.spdMul = P.spdBase * k; }

// ---------- ячейки внизу экрана: кольцо перезарядки и вспышка ----------
(function () {
  const css = document.createElement('style');
  css.textContent = `.rcd { position: absolute; inset: 12%; border-radius: 50%; pointer-events: none; }
  .rfl { animation: rfl .6s ease-out; } @keyframes rfl { 0% { filter: brightness(2.6) drop-shadow(0 0 1.2vh #ffe27a); } 100% { filter: none; } }`;
  document.head.appendChild(css);
})();
function relicFlash(id) {
  const i = SHOP.bag.indexOf(id), c = SHOP.el && SHOP.el.slots && SHOP.el.slots[i];
  if (!c) return; c.classList.remove('rfl'); void c.offsetWidth; c.classList.add('rfl');
  say(P.x, P.y - CH * HS() * 1.45, RELICS[id].nm, '#ffe27a');
}
function relicRings() {
  if (!SHOP.el || !SHOP.el.slots) return;
  SHOP.el.slots.forEach((c, i) => {
    const id = SHOP.bag[i], r = id && RELICS[id];
    let o = c.querySelector('.rcd');
    if (!r || !r.cd) { if (o) o.remove(); return; }
    if (!o) { o = document.createElement('div'); o.className = 'rcd'; c.appendChild(o); }
    const f = (RCD[id] || 0) / r.cd;
    o.style.background = f > 0.01 ? 'conic-gradient(rgba(0,0,0,.55) ' + Math.round(f * 360) + 'deg, rgba(0,0,0,0) 0)' : 'none';
  });
}
{
  const _cu = combatUpdate;
  combatUpdate = function (dt) { _cu(dt); statusTick(dt); relicSpeed(); relicRings(); };
}
